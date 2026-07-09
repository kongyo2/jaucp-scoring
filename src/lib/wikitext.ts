/**
 * ウィキテキストの内部リンク抽出・分類
 * kongyo2 の内部リンク整備ツール (ja-ucp-maintain-help) のパーサを
 * 本ツール向けに簡略移植したもの。
 */

export type LinkKind = "article" | "category" | "file" | "interwiki" | "project";

export interface InternalLink {
    /** リンク先タイトル（アンカー除去・空白正規化済み） */
    target: string;
    /** 表示テキスト */
    display: string;
    kind: LinkKind;
    /** 同一リンクの出現回数 */
    count: number;
}

const CATEGORY_PREFIXES = new Set(["category", "カテゴリ"]);
const FILE_PREFIXES = new Set(["file", "ファイル", "image", "画像", "media", "メディア"]);

// 記事リンクとは別扱いするプロジェクト名前空間
const PROJECT_NS_PREFIXES = new Set([
    "uncyclopedia",
    "アンサイクロペディア",
    "project",
    "talk",
    "ノート",
    "user",
    "利用者",
    "user talk",
    "利用者‐会話",
    "help",
    "ヘルプ",
    "template",
    "テンプレート",
    "mediawiki",
    "special",
    "特別",
    "portal",
    "wp",
    "annex",
    "unnews",
    "untunes",
    "unbooks",
    "undictionary",
    "game",
    "森谷辞書",
    "八百科事典",
]);

// 言語間リンクの言語コード（主要どころ）
const INTERWIKI_LANG_PREFIXES = new Set([
    "en", "zh", "ko", "fr", "de", "es", "ru", "pt", "it", "nl", "pl",
    "ar", "vi", "th", "id", "tr", "hu", "fi", "sv", "da", "no", "cs",
    "el", "he", "uk", "ro", "bg", "la", "eo", "ca", "et", "lv", "lt",
    "fa", "ms", "tl", "simple", "ja",
]);

/**
 * コメント・nowiki/pre ブロックを除去する（リンク抽出の前処理）
 */
export function stripIgnoredBlocks(wikitext: string): string {
    return wikitext
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<nowiki>[\s\S]*?<\/nowiki>/gi, "")
        .replace(/<pre[^>]*>[\s\S]*?<\/pre>/gi, "");
}

function classifyTarget(target: string): LinkKind {
    const colonIndex = target.indexOf(":");
    if (colonIndex <= 0) {
        return "article";
    }
    const prefix = target.slice(0, colonIndex).trim().toLowerCase().replace(/_/g, " ");
    if (CATEGORY_PREFIXES.has(prefix)) return "category";
    if (FILE_PREFIXES.has(prefix)) return "file";
    if (INTERWIKI_LANG_PREFIXES.has(prefix)) return "interwiki";
    if (PROJECT_NS_PREFIXES.has(prefix)) return "project";
    // 未知のプレフィックス（「作品名: サブタイトル」等）は記事リンク扱い
    return "article";
}

function normalizeTarget(rawTarget: string): string {
    let target = rawTarget.trim();
    // 先頭コロン（[[:Category:X]] 形式の強制リンク）を除去
    if (target.startsWith(":")) {
        target = target.slice(1).trim();
    }
    // アンカーを除去
    const hashIndex = target.indexOf("#");
    if (hashIndex !== -1) {
        target = target.slice(0, hashIndex).trim();
    }
    // 空白の正規化
    return target.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * ウィキテキストから内部リンク [[...]] を抽出する。
 * ファイルリンクのキャプション内など、入れ子の [[...]] にも対応する。
 */
export function extractInternalLinks(wikitext: string): InternalLink[] {
    const source = stripIgnoredBlocks(wikitext);
    const found = new Map<string, InternalLink>();
    const rawSpans: string[] = [];

    let i = 0;
    while (i < source.length - 1) {
        if (source[i] === "[" && source[i + 1] === "[") {
            const start = i;
            let depth = 1;
            i += 2;
            while (i < source.length - 1 && depth > 0) {
                if (source[i] === "[" && source[i + 1] === "[") {
                    depth++;
                    i += 2;
                } else if (source[i] === "]" && source[i + 1] === "]") {
                    depth--;
                    i += 2;
                } else {
                    i++;
                }
            }
            if (depth === 0) {
                rawSpans.push(source.slice(start, i));
            }
        } else {
            i++;
        }
    }

    for (const span of rawSpans) {
        const inner = span.slice(2, -2);

        // 入れ子リンク（ファイルキャプション内など）も個別に抽出
        const nestedStart = inner.indexOf("[[");
        if (nestedStart !== -1) {
            for (const nested of extractInternalLinks(inner.slice(nestedStart))) {
                mergeLink(found, nested);
            }
        }

        // パイプの手前がリンク先。ファイルリンクはオプション羅列のため最初の | まで
        const pipeIndex = inner.indexOf("|");
        const rawTarget = pipeIndex === -1 ? inner : inner.slice(0, pipeIndex);
        if (rawTarget.includes("[[")) continue; // 壊れた構文
        const target = normalizeTarget(rawTarget);
        if (!target) continue; // [[#anchor]] のようなページ内リンク

        const displaySource = pipeIndex === -1 ? rawTarget : inner.slice(pipeIndex + 1);
        const display = displaySource.replace(/\[\[[\s\S]*?\]\]/g, "").trim() || target;

        mergeLink(found, {
            target,
            display,
            kind: classifyTarget(target),
            count: 1,
        });
    }

    return [...found.values()];
}

function mergeLink(map: Map<string, InternalLink>, link: InternalLink): void {
    const key = `${link.kind}:${link.target}`;
    const existing = map.get(key);
    if (existing) {
        existing.count += link.count;
    } else {
        map.set(key, { ...link });
    }
}

/**
 * 履歴表示用に、ウィキテキストの冒頭からタイトル的な1行を推定する
 */
export function deriveTitleFromWikitext(wikitext: string, maxLength = 40): string {
    for (const rawLine of wikitext.split("\n")) {
        let line = rawLine.trim();
        if (!line) continue;
        // テンプレート・コメント行はスキップ
        if (/^(\{\{|<!--|__)/.test(line)) continue;
        // マークアップの除去
        line = line
            .replace(/'''?/g, "")
            .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
            .replace(/\{\{[^}]*\}\}/g, "")
            .replace(/<[^>]*>/g, "")
            .replace(/^=+\s*|\s*=+$/g, "")
            .trim();
        if (line) {
            return line.length > maxLength ? `${line.slice(0, maxLength)}…` : line;
        }
    }
    return "無題の記事";
}
