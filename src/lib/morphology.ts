import kuromoji from "kuromoji";
import type { IpadicFeatures, Tokenizer } from "kuromoji";

/**
 * kuromoji による日本語形態素解析の共通基盤。
 * 校正チェック（wakame 移植）とリンク候補生成（内部リンク整備ツール移植）の両方で使う。
 *
 * - ブラウザ / Tauri: アプリ同梱の `dict/`（vite プラグインが kuromoji の辞書を配置）を XHR で読む
 * - Node (vitest): node_modules/kuromoji/dict を fs で読む
 */

export type MorphToken = IpadicFeatures;

let tokenizerPromise: Promise<Tokenizer<IpadicFeatures>> | null = null;
let loaded = false;

function resolveDicPath(): string {
    if (typeof window === "undefined") {
        return "node_modules/kuromoji/dict";
    }
    return "dict";
}

/**
 * トークナイザを取得する（初回は辞書ロードのため数秒かかる。以後キャッシュ）
 */
export function getTokenizer(): Promise<Tokenizer<IpadicFeatures>> {
    if (!tokenizerPromise) {
        tokenizerPromise = new Promise((resolve, reject) => {
            kuromoji.builder({ dicPath: resolveDicPath() }).build((err, tokenizer) => {
                if (err || !tokenizer) {
                    tokenizerPromise = null; // 失敗時は再試行可能にする
                    reject(err ?? new Error("トークナイザの初期化に失敗しました"));
                    return;
                }
                loaded = true;
                resolve(tokenizer);
            });
        });
    }
    return tokenizerPromise;
}

/**
 * 辞書ロード済みかどうか（UI のローディング表示用）
 */
export function isTokenizerLoaded(): boolean {
    return loaded;
}

/**
 * テキストを形態素解析する
 */
export async function tokenize(text: string): Promise<MorphToken[]> {
    const tokenizer = await getTokenizer();
    return tokenizer.tokenize(text);
}

/**
 * トークンの開始オフセット（0始まり）。kuromoji の word_position は1始まり。
 */
export function tokenOffset(token: MorphToken): number {
    return token.word_position - 1;
}

/**
 * 文の単位（wakame の analyzer 相当）
 */
export interface MorphSentence {
    text: string;
    tokens: MorphToken[];
    /** 散文中の行番号（0始まり）。段落区切りの判定に使う */
    line: number;
}

const SENTENCE_ENDERS = new Set(["。", "！", "？", "!", "?"]);

/**
 * 1行分のトークン列を句点で文単位に分割する
 */
export function splitLineIntoSentences(
    line: string,
    tokens: MorphToken[],
    lineIndex = 0
): MorphSentence[] {
    const sentences: MorphSentence[] = [];
    let currentStart = 0;
    let currentTokens: MorphToken[] = [];

    const push = (endOffset: number) => {
        const text = line.slice(currentStart, endOffset).trim();
        if (text.length > 0 && currentTokens.length > 0) {
            sentences.push({ text, tokens: currentTokens, line: lineIndex });
        }
        currentStart = endOffset;
        currentTokens = [];
    };

    for (const token of tokens) {
        currentTokens.push(token);
        if (SENTENCE_ENDERS.has(token.surface_form)) {
            push(tokenOffset(token) + token.surface_form.length);
        }
    }
    if (currentTokens.length > 0) {
        const last = currentTokens[currentTokens.length - 1];
        push(tokenOffset(last) + last.surface_form.length);
    }

    return sentences;
}

/**
 * 複数行の散文をまとめて解析し、文の一覧を返す。
 * 行ごとにトークナイズするため、オフセットは行内で完結する。
 */
export async function analyzeProse(prose: string): Promise<MorphSentence[]> {
    const tokenizer = await getTokenizer();
    const sentences: MorphSentence[] = [];
    const lines = prose.split("\n");
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) continue;
        const tokens = tokenizer.tokenize(trimmed);
        sentences.push(...splitLineIntoSentences(trimmed, tokens, i));
    }
    return sentences;
}
