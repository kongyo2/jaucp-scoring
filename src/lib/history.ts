import { ResultAsync, okAsync } from "neverthrow";
import { HistoryItemSchema, type HistoryItem, type ScoringResult } from "./schemas";
import { getStore } from "./store";

const STORE_PATH = "history.json";
const HISTORY_KEY = "history";
const MAX_HISTORY_ITEMS = 100;

export interface AddHistoryInput {
    result: ScoringResult;
    title: string;
    model?: string;
    provider?: string;
}

/**
 * 採点結果を履歴に追加する（新しい順・最大100件）
 */
export function addHistory(input: AddHistoryInput): ResultAsync<HistoryItem, Error> {
    return ResultAsync.fromPromise(
        (async () => {
            const store = await getStore(STORE_PATH);
            const current = await readValidHistory(store.get.bind(store));

            const newItem: HistoryItem = {
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                title: input.title,
                category: input.result.category,
                total: input.result.total,
                result: input.result,
                model: input.model,
                provider: input.provider,
            };

            const next = [newItem, ...current].slice(0, MAX_HISTORY_ITEMS);
            await store.set(HISTORY_KEY, next);
            await store.save();
            return newItem;
        })(),
        (error) => new Error(`履歴保存エラー: ${error}`)
    );
}

/**
 * 履歴を読み込む。
 * 壊れたエントリが混ざっていても、有効なものだけを返す（全損させない）。
 */
export function getHistory(): ResultAsync<HistoryItem[], Error> {
    return ResultAsync.fromPromise(
        (async () => {
            const store = await getStore(STORE_PATH);
            return readValidHistory(store.get.bind(store));
        })(),
        (error) => new Error(`履歴読み込みエラー: ${error}`)
    ).andThen((items) => okAsync(items));
}

/**
 * 履歴を全削除する
 */
export function clearHistory(): ResultAsync<void, Error> {
    return ResultAsync.fromPromise(
        (async () => {
            const store = await getStore(STORE_PATH);
            await store.set(HISTORY_KEY, []);
            await store.save();
        })(),
        (error) => new Error(`履歴削除エラー: ${error}`)
    );
}

/**
 * 履歴から1件削除する
 */
export function removeHistoryItem(id: string): ResultAsync<void, Error> {
    return ResultAsync.fromPromise(
        (async () => {
            const store = await getStore(STORE_PATH);
            const current = await readValidHistory(store.get.bind(store));
            await store.set(
                HISTORY_KEY,
                current.filter((item) => item.id !== id)
            );
            await store.save();
        })(),
        (error) => new Error(`履歴削除エラー: ${error}`)
    );
}

async function readValidHistory(
    get: <T>(key: string) => Promise<T | null>
): Promise<HistoryItem[]> {
    const raw = await get<unknown>(HISTORY_KEY);
    if (!Array.isArray(raw)) return [];

    const valid: HistoryItem[] = [];
    for (const entry of raw) {
        const parsed = HistoryItemSchema.safeParse(entry);
        if (parsed.success) {
            valid.push(parsed.data);
        } else {
            console.warn("無効な履歴エントリをスキップしました:", parsed.error.issues[0]);
        }
    }
    return valid;
}
