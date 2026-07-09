/**
 * 内部リンク候補の生成
 *
 * kongyo2 の内部リンク整備ツール (ja-ucp-maintain-help) の
 * candidate-generator を kuromoji のトークンベースのまま移植したもの。
 * 記事の地の文から名詞・名詞複合語を抽出し、まだリンクされていない
 * 「リンクにできそうな語」を優先度付きで返す。
 * 実在確認は呼び出し側で ucp-api の checkPagesExist に渡して行う。
 */

import { tokenize, type MorphToken } from "./morphology";
import { extractProse } from "./proofread";
import { extractInternalLinks } from "./wikitext";

export interface LinkCandidate {
    /** 記事タイトル候補（先頭大文字化済み） */
    title: string;
    /** 地の文での出現回数 */
    count: number;
    /** 提案の優先度（高いほど記事として存在しそう） */
    priority: number;
    /** 品詞の内訳（デバッグ・表示用） */
    posDetail: string;
}

// 数字のみ・数字+助数詞のみの候補を除外
const COUNTER_SUFFIX_REGEX =
    /^[\d０-９〇一二三四五六七八九十百千万億兆]+\s*(?:年|月|日|時|分|秒|回|名|人|本|個|号|位|段|度|割|円|円玉|歳|代|世紀|年代|月期|周年|頭|匹|羽|台|枚|冊|杯|回目|度目|番目|位)?$/;
function isMostlyNumeric(surface: string): boolean {
    return COUNTER_SUFFIX_REGEX.test(surface);
}

// 記事タイトルとしてあり得ない区切り文字を含む候補を除外（中黒・長音符は許容）
const FORBIDDEN_SEPARATOR_REGEX = /[、。「」『』【】（）()…\s]/;
function containsForbiddenSeparator(surface: string): boolean {
    return FORBIDDEN_SEPARATOR_REGEX.test(surface);
}

function isNounToken(token: MorphToken): boolean {
    if (token.pos !== "名詞") return false;
    if (token.pos_detail_1 === "非自立") return false;
    if (token.pos_detail_1 === "代名詞") return false;
    if (token.pos_detail_1 === "数") return false;
    if (token.pos_detail_1 === "接尾") return false;
    return true;
}

// 中黒「・」は固有名詞列（人名等）の橋渡しとして許容
function isMiddleDotToken(token: MorphToken): boolean {
    return token.surface_form === "・" && token.pos === "記号";
}

function isProperNoun(token: MorphToken): boolean {
    return token.pos === "名詞" && token.pos_detail_1 === "固有名詞";
}

function isHiraganaOnly(text: string): boolean {
    return /^[぀-ゟ]+$/.test(text);
}

function isKatakanaWithDot(text: string): boolean {
    return /^[゠-ヿ・ー]+$/.test(text) && text.includes("・");
}

function shouldSkipCandidate(surface: string): boolean {
    if (surface.length < 2) return true;
    if (isHiraganaOnly(surface) && surface.length < 3) return true;
    if (isMostlyNumeric(surface)) return true;
    if (containsForbiddenSeparator(surface)) return true;
    if (surface.startsWith("・") || surface.endsWith("・")) return true;
    if (/^[・ー]+$/.test(surface)) return true;
    return false;
}

interface NounSequence {
    tokens: MorphToken[];
}

/**
 * 連続する名詞列（中黒による橋渡しを含む）を収集する
 */
function collectNounSequences(tokens: MorphToken[]): NounSequence[] {
    const sequences: NounSequence[] = [];
    let group: MorphToken[] = [];

    const flush = () => {
        // 末尾の中黒や非名詞は削る
        while (group.length > 0 && !isNounToken(group[group.length - 1])) {
            group.pop();
        }
        if (group.length > 0) {
            sequences.push({ tokens: [...group] });
        }
        group = [];
    };

    for (const token of tokens) {
        if (isNounToken(token)) {
            group.push(token);
        } else if (isMiddleDotToken(token) && group.length > 0) {
            group.push(token);
        } else {
            flush();
        }
    }
    flush();
    return sequences;
}

/** 6 トークンを超える複合語は記事タイトルになりにくい */
const MAX_COMPOUND_LEN = 6;

function computePriority(
    surface: string,
    hasProperNoun: boolean,
    nounCount: number,
    tokens: MorphToken[]
): number {
    let priority = 0;

    if (hasProperNoun) priority += 60;

    // 複合語ほど優先
    priority += Math.min(nounCount * 12, 60);

    // カタカナを含むと固有名詞・専門用語の可能性が高い
    if (/[゠-ヿ]/.test(surface)) priority += 18;

    // 中黒を含むカタカナ複合語（例: マルセル・デュシャン）は人名の確度が高い
    if (isKatakanaWithDot(surface)) priority += 25;

    // 長さブースト
    priority += Math.min(surface.length * 2, 24);

    // 漢字のみ単独名詞 (2-3文字) は記事になりにくいことが多いので減点
    if (nounCount === 1 && /^[一-鿿]{2,3}$/.test(surface) && !hasProperNoun) {
        priority -= 10;
    }

    // 辞書外語（読みが生成できなかった語）は固有名詞の可能性が高い
    if (nounCount === 1 && tokens.length === 1 && !tokens[0].reading) {
        priority += 15;
    }

    return priority;
}

interface RawCandidate {
    surface: string;
    priority: number;
    posDetail: string;
}

function generateFromSequence(tokens: MorphToken[]): RawCandidate[] {
    const results: RawCandidate[] = [];
    const nounIndices = tokens
        .map((token, index) => ({ token, index }))
        .filter(({ token }) => isNounToken(token))
        .map(({ index }) => index);

    // フル複合語（中黒含む）
    if (tokens.length > 1 && tokens.length <= MAX_COMPOUND_LEN) {
        const surface = tokens.map((t) => t.surface_form).join("");
        results.push({
            surface,
            priority: computePriority(surface, tokens.some(isProperNoun), nounIndices.length, tokens),
            posDetail: tokens.map((t) => t.pos_detail_1).join("+"),
        });
    }

    // サブシーケンス（名詞のウィンドウ。橋渡しの中黒はスパンに含む）
    if (nounIndices.length >= 2) {
        const maxLen = Math.min(MAX_COMPOUND_LEN, nounIndices.length);
        for (let len = maxLen; len >= 2; len--) {
            if (len === nounIndices.length && tokens.length === nounIndices.length) {
                continue; // フル複合語と同一
            }
            for (let start = 0; start + len <= nounIndices.length; start++) {
                const subTokens = tokens.slice(nounIndices[start], nounIndices[start + len - 1] + 1);
                const surface = subTokens.map((t) => t.surface_form).join("");
                results.push({
                    surface,
                    priority: computePriority(surface, subTokens.some(isProperNoun), len, subTokens),
                    posDetail: subTokens.map((t) => t.pos_detail_1).join("+"),
                });
            }
        }
    }

    // 個別名詞
    for (const index of nounIndices) {
        const token = tokens[index];
        if (token.surface_form.length < 2) continue;
        results.push({
            surface: token.surface_form,
            priority: computePriority(token.surface_form, isProperNoun(token), 1, [token]),
            posDetail: token.pos_detail_1,
        });
    }

    return results;
}

/** MediaWiki と同様に先頭の英字のみ大文字化 */
function normalizeTitle(surface: string): string {
    return surface.charAt(0).toUpperCase() + surface.slice(1);
}

function countOccurrences(text: string, needle: string): number {
    if (!needle) return 0;
    let count = 0;
    let index = 0;
    while ((index = text.indexOf(needle, index)) !== -1) {
        count++;
        index += needle.length;
    }
    return count;
}

/**
 * 既存の内部リンク [[...]] のスパンを丸ごと除去する。
 * リンク済みテキスト内の語が候補として再抽出されるのを防ぐ
 * （本家はパーサの位置マッピングで除外している箇所の移植）。
 */
function removeLinkSpans(wikitext: string): string {
    let text = wikitext;
    let previous = "";
    // 入れ子（ファイルキャプション内リンク等）を内側から順に消す
    while (previous !== text) {
        previous = text;
        text = text.replace(/\[\[[^[\]]*\]\]/g, " ");
    }
    return text;
}

/**
 * ウィキテキストからリンク候補を生成する（優先度降順）。
 * すでにリンク済みのタイトル・表示名、および excludeTitles は除外する。
 */
export async function generateLinkCandidates(
    wikitext: string,
    excludeTitles: string[] = []
): Promise<LinkCandidate[]> {
    const prose = extractProse(removeLinkSpans(wikitext));
    if (!prose.trim()) return [];

    const excluded = new Set<string>(excludeTitles.map(normalizeTitle));
    for (const link of extractInternalLinks(wikitext)) {
        excluded.add(normalizeTitle(link.target));
        excluded.add(normalizeTitle(link.display));
    }

    const tokens = await tokenize(prose);
    const bestBySurface = new Map<string, RawCandidate>();

    for (const sequence of collectNounSequences(tokens)) {
        for (const candidate of generateFromSequence(sequence.tokens)) {
            if (shouldSkipCandidate(candidate.surface)) continue;
            const existing = bestBySurface.get(candidate.surface);
            if (!existing || candidate.priority > existing.priority) {
                bestBySurface.set(candidate.surface, candidate);
            }
        }
    }

    const candidates: LinkCandidate[] = [];
    for (const candidate of bestBySurface.values()) {
        const title = normalizeTitle(candidate.surface);
        if (excluded.has(title)) continue;
        candidates.push({
            title,
            count: Math.max(1, countOccurrences(prose, candidate.surface)),
            priority: candidate.priority,
            posDetail: candidate.posDetail,
        });
    }

    return candidates.sort((a, b) => b.priority - a.priority || b.count - a.count);
}

/**
 * 実在確認後の後処理: 上位候補の部分文字列でしかない候補を間引く。
 * （例:「マルセル・デュシャン」が採用されたら、単独でしか出現しない
 * 「マルセル」「デュシャン」は提案しない）
 */
export function suppressSubsumedCandidates(candidates: LinkCandidate[]): LinkCandidate[] {
    const result: LinkCandidate[] = [];
    for (const candidate of candidates) {
        const subsumed = result.some(
            (kept) => kept.title.includes(candidate.title) && kept.count >= candidate.count
        );
        if (!subsumed) {
            result.push(candidate);
        }
    }
    return result;
}
