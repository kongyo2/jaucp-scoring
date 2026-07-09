/**
 * ウィキテキスト向け日本語校正チェッカー
 *
 * 文章ルールは kongyo2/wakame（kuromoji + LSP の日本語リンタ、ルーツは MoZuku）の
 * grammar.ts を kuromoji のトークンベースのまま移植したもの。
 * 加えてアンサイクロペディア執筆に特化したウィキ構文チェックを行う。
 */

import { analyzeProse, tokenOffset, type MorphSentence, type MorphToken } from "./morphology";
import { stripIgnoredBlocks } from "./wikitext";

export type LintSeverity = "warning" | "info";

export interface LintIssue {
    /** ルールID */
    rule: string;
    /** ルール表示名 */
    label: string;
    message: string;
    severity: LintSeverity;
    /** 問題箇所の抜粋 */
    excerpt?: string;
}

/** wakame の既定値: 一文の読点は3個まで */
const COMMA_LIMIT = 3;
/** wakame の既定値: 逆接の「が」は一文に1回まで */
const ADVERSATIVE_GA_LIMIT = 1;
/** 長文情報のしきい値（文字数） */
const LONG_SENTENCE_LIMIT = 120;

// ---------------------------------------------------------------------------
// テキスト抽出（ウィキテキスト → 散文）
// ---------------------------------------------------------------------------

function stripBraceBlocks(text: string, open: string, close: string): string {
    let result = "";
    let depth = 0;
    let i = 0;
    while (i < text.length) {
        if (text.startsWith(open, i)) {
            depth++;
            i += open.length;
        } else if (depth > 0 && text.startsWith(close, i)) {
            depth--;
            i += close.length;
        } else {
            if (depth === 0) result += text[i];
            i++;
        }
    }
    return result;
}

/**
 * ウィキテキストから散文（地の文）を取り出す
 */
export function extractProse(wikitext: string): string {
    let text = stripIgnoredBlocks(wikitext);

    // テンプレート・表
    text = stripBraceBlocks(text, "{{", "}}");
    text = text.replace(/^\{\|[\s\S]*?^\|\}\s*$/gm, "");

    // ref・HTMLタグ
    text = text.replace(/<ref[^>]*\/>/gi, "");
    text = text.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "");
    text = text.replace(/<[^>]+>/g, "");

    // リンク（表示テキストへ置換）。カテゴリ・ファイル・言語間リンクは行ごと消えるよう先に除去
    text = text.replace(/\[\[\s*(?:category|カテゴリ|file|ファイル|image|画像|[a-z]{2,3}(?:-[a-z]+)?)\s*:[^\]]*\]\]/gi, "");
    text = text.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1");
    text = text.replace(/\[\[([^\]]*)\]\]/g, "$1");
    text = text.replace(/\[https?:\/\/[^\s\]]+\s+([^\]]*)\]/g, "$1");
    text = text.replace(/\[https?:\/\/[^\]]*\]/g, "");
    text = text.replace(/https?:\/\/\S+/g, "");

    // 強調
    text = text.replace(/'{2,}/g, "");

    // 行単位の整理: 見出し・表行は除去、リスト・引用のマーカーは剥がす
    const lines = text.split("\n").map((line) => {
        const trimmed = line.trim();
        if (/^=+.*=+$/.test(trimmed)) return "";
        if (/^[|!]/.test(trimmed)) return "";
        return trimmed.replace(/^[*#:;]+\s*/, "");
    });

    return lines.filter((line) => line.length > 0).join("\n");
}

function excerptOf(sentence: string, max = 60): string {
    return sentence.length <= max ? sentence : `${sentence.slice(0, max)}…`;
}

// ---------------------------------------------------------------------------
// トークン判定ヘルパー（wakame の grammar.ts 移植）
// ---------------------------------------------------------------------------

function isParticle(token: MorphToken): boolean {
    return token.pos === "助詞";
}

/** 逆接の接続助詞「が」 */
function isAdversativeGa(token: MorphToken): boolean {
    return token.pos === "助詞" && token.pos_detail_1 === "接続助詞" && token.basic_form === "が";
}

function isConjunction(token: MorphToken): boolean {
    return token.pos === "接続詞";
}

function particleKey(token: MorphToken): string {
    return `${token.pos},${token.pos_detail_1}`;
}

/** ら抜き対象動詞（一段動詞・自立・未然形） */
function isTargetVerb(token: MorphToken): boolean {
    return (
        token.pos === "動詞" &&
        token.pos_detail_1 === "自立" &&
        token.conjugated_type === "一段" &&
        token.conjugated_form === "未然形"
    );
}

/** 接尾の「れる」 */
function isRaWord(token: MorphToken): boolean {
    return token.pos === "動詞" && token.pos_detail_1 === "接尾" && token.basic_form === "れる";
}

/** 一語で解析される特殊なら抜き（見れる・来れる） */
function isSpecialRaCase(token: MorphToken): boolean {
    return token.pos === "動詞" && (token.basic_form === "来れる" || token.basic_form === "見れる");
}

/** 助動詞の基本形 */
function auxBase(token: MorphToken): string | null {
    return token.pos === "助動詞" ? token.basic_form : null;
}

// ---------------------------------------------------------------------------
// 文章ルール（wakame 移植）
// ---------------------------------------------------------------------------

function checkCommaLimit(sentences: MorphSentence[]): LintIssue[] {
    const issues: LintIssue[] = [];
    for (const sentence of sentences) {
        const count = (sentence.text.match(/、/g) ?? []).length;
        if (count > COMMA_LIMIT) {
            issues.push({
                rule: "comma-limit",
                label: "読点過多",
                message: `一文に読点「、」が${count}個あります（目安は${COMMA_LIMIT}個まで）。文の分割を検討してください。`,
                severity: "warning",
                excerpt: excerptOf(sentence.text),
            });
        }
    }
    return issues;
}

function checkAdversativeGa(sentences: MorphSentence[]): LintIssue[] {
    const issues: LintIssue[] = [];
    for (const sentence of sentences) {
        const count = sentence.tokens.filter(isAdversativeGa).length;
        if (count > ADVERSATIVE_GA_LIMIT) {
            issues.push({
                rule: "adversative-ga",
                label: "逆接の「が」",
                message: `逆接の接続助詞「が」が同一文で${count}回使われています。論旨が曖昧になりやすいので分割を検討してください。`,
                severity: "warning",
                excerpt: excerptOf(sentence.text),
            });
        }
    }
    return issues;
}

function checkDuplicateParticle(sentences: MorphSentence[]): LintIssue[] {
    const issues: LintIssue[] = [];
    for (const sentence of sentences) {
        let lastSurface = "";
        let lastKey = "";
        let seen = false;
        for (const token of sentence.tokens) {
            if (!isParticle(token)) continue;
            if (seen && token.surface_form === lastSurface && particleKey(token) === lastKey) {
                issues.push({
                    rule: "duplicate-particle",
                    label: "助詞の重複",
                    message: `同じ助詞「${token.surface_form}」が連続しています。`,
                    severity: "warning",
                    excerpt: excerptOf(sentence.text),
                });
            }
            lastSurface = token.surface_form;
            lastKey = particleKey(token);
            seen = true;
        }
    }
    return issues;
}

function checkAdjacentParticles(sentences: MorphSentence[]): LintIssue[] {
    const issues: LintIssue[] = [];
    for (const sentence of sentences) {
        let prev: MorphToken | null = null;
        for (const token of sentence.tokens) {
            if (
                prev &&
                isParticle(prev) &&
                isParticle(token) &&
                particleKey(token) === particleKey(prev) &&
                token.surface_form !== prev.surface_form &&
                tokenOffset(token) === tokenOffset(prev) + prev.surface_form.length
            ) {
                issues.push({
                    rule: "adjacent-particles",
                    label: "助詞の連続",
                    message: `同じ種類の助詞「${prev.surface_form}${token.surface_form}」が隣接しています。`,
                    severity: "warning",
                    excerpt: excerptOf(sentence.text),
                });
            }
            prev = token;
        }
    }
    return issues;
}

function checkConjunctionRepeat(sentences: MorphSentence[]): LintIssue[] {
    const issues: LintIssue[] = [];
    let lastSurface = "";
    let lastLine = -1;
    for (const sentence of sentences) {
        // wakame と同様、段落（行）が変わったらリセット
        if (sentence.line !== lastLine) {
            lastSurface = "";
            lastLine = sentence.line;
        }
        for (const token of sentence.tokens) {
            if (!isConjunction(token)) continue;
            if (lastSurface && token.surface_form === lastSurface) {
                issues.push({
                    rule: "conjunction-repeat",
                    label: "接続詞の連続",
                    message: `同じ接続詞「${token.surface_form}」が連続しています。`,
                    severity: "warning",
                    excerpt: excerptOf(sentence.text),
                });
            }
            lastSurface = token.surface_form;
        }
    }
    return issues;
}

function checkRaDropping(sentences: MorphSentence[]): LintIssue[] {
    const issues: LintIssue[] = [];
    for (const sentence of sentences) {
        for (const token of sentence.tokens) {
            if (isSpecialRaCase(token)) {
                issues.push({
                    rule: "ra-dropping",
                    label: "ら抜き言葉",
                    message: `「${token.surface_form}」はら抜き言葉です（正しくは「${token.basic_form === "見れる" ? "見られる" : "来られる"}」）。意図的な口語でなければ修正を検討してください。`,
                    severity: "warning",
                    excerpt: excerptOf(sentence.text),
                });
            }
        }

        let prev: MorphToken | null = null;
        for (const token of sentence.tokens) {
            if (prev && isTargetVerb(prev) && isRaWord(token)) {
                issues.push({
                    rule: "ra-dropping",
                    label: "ら抜き言葉",
                    message: `「${prev.surface_form}${token.surface_form}」はら抜き言葉です（「${prev.basic_form}」の可能形は「${prev.surface_form}られる」）。`,
                    severity: "warning",
                    excerpt: excerptOf(sentence.text),
                });
            }
            prev = token;
        }
    }
    return issues;
}

// ---------------------------------------------------------------------------
// 追加の文章ルール（形態素解析ベース）
// ---------------------------------------------------------------------------

/**
 * 敬体（です・ます）と常体（だ・である）の混在チェック。
 * 文末付近の助動詞の基本形で文体を判定する。
 */
function checkStyleMixture(sentences: MorphSentence[]): LintIssue[] {
    let polite = 0;
    let plain = 0;
    let politeExample = "";
    let plainExample = "";

    for (const sentence of sentences) {
        // 文末の記号を除いた末尾3トークンで判定
        const meaningful = sentence.tokens.filter((token) => token.pos !== "記号");
        const tail = meaningful.slice(-3);
        const bases = tail.map((token) => auxBase(token)).filter(Boolean) as string[];

        if (bases.includes("です") || bases.includes("ます")) {
            polite++;
            if (!politeExample) politeExample = sentence.text;
        } else if (bases.includes("だ")) {
            plain++;
            if (!plainExample) plainExample = sentence.text;
        }
    }

    if (polite >= 1 && plain >= 1 && polite + plain >= 3) {
        const minorIsPolite = polite < plain;
        return [
            {
                rule: "style-mixture",
                label: "文体の混在",
                message: `敬体（です・ます）${polite}文と常体（だ・である）${plain}文が混在しています。${minorIsPolite ? "敬体" : "常体"}の文を見直して統一を検討してください。`,
                severity: "warning",
                excerpt: excerptOf(minorIsPolite ? politeExample : plainExample),
            },
        ];
    }
    return [];
}

/**
 * 連体化の「の」の連続チェック（AのBのCのD）
 */
function checkNoChain(sentences: MorphSentence[]): LintIssue[] {
    const issues: LintIssue[] = [];
    for (const sentence of sentences) {
        let streak = 0;
        let maxStreak = 0;
        for (const token of sentence.tokens) {
            if (token.pos === "助詞" && token.pos_detail_1 === "連体化" && token.surface_form === "の") {
                streak++;
                maxStreak = Math.max(maxStreak, streak);
            } else if (token.pos === "記号" || (token.pos === "助詞" && token.surface_form === "、")) {
                streak = 0;
            }
        }
        if (maxStreak >= 3) {
            issues.push({
                rule: "no-chain",
                label: "「の」の連続",
                message: `連体修飾の「の」が一文に${maxStreak}回連なっています。言い換えると引き締まります。`,
                severity: "info",
                excerpt: excerptOf(sentence.text),
            });
        }
    }
    return issues;
}

function checkLongSentence(sentences: MorphSentence[]): LintIssue[] {
    const issues: LintIssue[] = [];
    for (const sentence of sentences) {
        if (sentence.text.length > LONG_SENTENCE_LIMIT) {
            issues.push({
                rule: "long-sentence",
                label: "長文",
                message: `一文が${sentence.text.length}文字あります（目安は${LONG_SENTENCE_LIMIT}文字まで）。`,
                severity: "info",
                excerpt: excerptOf(sentence.text),
            });
        }
    }
    return issues;
}

// ---------------------------------------------------------------------------
// ウィキ構文ルール（アンサイクロペディア向け）
// ---------------------------------------------------------------------------

function countOccurrences(text: string, needle: string): number {
    let count = 0;
    let index = 0;
    while ((index = text.indexOf(needle, index)) !== -1) {
        count++;
        index += needle.length;
    }
    return count;
}

function checkUnbalancedBrackets(wikitext: string): LintIssue[] {
    const text = stripIgnoredBlocks(wikitext);
    const issues: LintIssue[] = [];
    const pairs: Array<[string, string, string]> = [
        ["[[", "]]", "内部リンク"],
        ["{{", "}}", "テンプレート"],
    ];
    for (const [open, close, label] of pairs) {
        const openCount = countOccurrences(text, open);
        const closeCount = countOccurrences(text, close);
        if (openCount !== closeCount) {
            issues.push({
                rule: "unbalanced-brackets",
                label: "括弧の不整合",
                message: `${label}の「${open}」が${openCount}個に対し「${close}」が${closeCount}個です。閉じ忘れがないか確認してください。`,
                severity: "warning",
            });
        }
    }
    return issues;
}

function checkNoCategory(wikitext: string): LintIssue[] {
    if (/\[\[\s*(category|カテゴリ)\s*:/iu.test(wikitext)) {
        return [];
    }
    return [
        {
            rule: "no-category",
            label: "カテゴリ未設定",
            message: "カテゴリ（[[Category:〜]]）が見つかりません。未分類の記事は整理対象になりやすいので、適切なカテゴリを付けましょう。",
            severity: "warning",
        },
    ];
}

function checkSignature(wikitext: string): LintIssue[] {
    const text = stripIgnoredBlocks(wikitext);
    if (!/~{3,}/.test(text)) {
        return [];
    }
    return [
        {
            rule: "signature-in-article",
            label: "署名の混入",
            message: "本文に署名（~~~~）らしき記述があります。記事本文に署名は不要です（ネタとして意図的なら無視してください）。",
            severity: "warning",
        },
    ];
}

function headingLevels(wikitext: string): number[] {
    const levels: number[] = [];
    for (const line of stripIgnoredBlocks(wikitext).split("\n")) {
        const match = line.trim().match(/^(={2,6})\s*.+?\s*\1$/);
        if (match) {
            levels.push(match[1].length);
        }
    }
    return levels;
}

function checkHeadingJump(wikitext: string): LintIssue[] {
    const levels = headingLevels(wikitext);
    const issues: LintIssue[] = [];
    let previous = 1;
    for (const level of levels) {
        if (level > previous + 1) {
            issues.push({
                rule: "heading-jump",
                label: "見出しレベル",
                message: `見出しレベルが${"=".repeat(previous)}の直後に${"=".repeat(level)}へ飛んでいます。段階的にネストするのが推奨です。`,
                severity: "info",
            });
        }
        previous = level;
    }
    return issues;
}

function checkEmptySection(wikitext: string): LintIssue[] {
    const lines = stripIgnoredBlocks(wikitext).split("\n");
    const issues: LintIssue[] = [];
    let pendingHeading: string | null = null;

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        const isHeading = /^(={2,6})\s*.+?\s*\1$/.test(line);
        if (isHeading) {
            if (pendingHeading !== null) {
                issues.push({
                    rule: "empty-section",
                    label: "空の節",
                    message: `節「${pendingHeading.replace(/=+/g, "").trim()}」に本文がありません。`,
                    severity: "info",
                });
            }
            pendingHeading = line;
        } else {
            pendingHeading = null;
        }
    }
    return issues;
}

// ---------------------------------------------------------------------------
// エントリポイント
// ---------------------------------------------------------------------------

/**
 * ウィキテキスト全体を校正し、問題点の一覧を返す。
 * 初回呼び出し時は形態素解析辞書のロードが走る（アプリ同梱、数秒）。
 */
export async function proofreadWikitext(wikitext: string): Promise<LintIssue[]> {
    const prose = extractProse(wikitext);
    const sentences = await analyzeProse(prose);

    return [
        // ウィキ構文・全体系
        ...checkUnbalancedBrackets(wikitext),
        ...checkNoCategory(wikitext),
        ...checkSignature(wikitext),
        ...checkStyleMixture(sentences),
        // wakame 移植ルール
        ...checkCommaLimit(sentences),
        ...checkAdversativeGa(sentences),
        ...checkDuplicateParticle(sentences),
        ...checkAdjacentParticles(sentences),
        ...checkConjunctionRepeat(sentences),
        ...checkRaDropping(sentences),
        // 参考情報
        ...checkNoChain(sentences),
        ...checkLongSentence(sentences),
        ...checkHeadingJump(wikitext),
        ...checkEmptySection(wikitext),
    ];
}
