import { load } from "@tauri-apps/plugin-store";

/**
 * ストア共通インターフェース
 * Tauri の Store と localStorage ラッパーを同一 API で扱う。
 * Tauri 外（通常ブラウザでの `npm run dev` / Web 配信）でも
 * 設定・履歴の保存が動作するようにするための抽象化。
 */
export interface IStore {
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: unknown): Promise<void>;
    save(): Promise<void>;
}

/**
 * localStorage ベースのフォールバック実装
 */
class LocalStorageStore implements IStore {
    private data: Record<string, unknown>;

    constructor(private readonly path: string) {
        try {
            const stored = localStorage.getItem(this.path);
            this.data = stored ? (JSON.parse(stored) as Record<string, unknown>) : {};
        } catch (e) {
            console.warn("localStorage の読み込みに失敗しました:", e);
            this.data = {};
        }
    }

    async get<T>(key: string): Promise<T | null> {
        return (this.data[key] as T | undefined) ?? null;
    }

    async set(key: string, value: unknown): Promise<void> {
        this.data[key] = value;
    }

    async save(): Promise<void> {
        try {
            localStorage.setItem(this.path, JSON.stringify(this.data));
        } catch (e) {
            console.error("localStorage への保存に失敗しました:", e);
        }
    }
}

const stores = new Map<string, Promise<IStore>>();

function isTauri(): boolean {
    return "__TAURI_INTERNALS__" in window;
}

async function createStore(path: string): Promise<IStore> {
    if (isTauri()) {
        try {
            const store = await load(path);
            return {
                async get<T>(key: string): Promise<T | null> {
                    const value = await store.get<T>(key);
                    return value === undefined ? null : value;
                },
                set: (key, value) => store.set(key, value),
                save: () => store.save(),
            };
        } catch (e) {
            console.warn(`Tauri Store (${path}) の初期化に失敗、localStorage へフォールバックします:`, e);
        }
    }
    return new LocalStorageStore(path);
}

/**
 * ストアインスタンスを取得する（パスごとにシングルトン）
 */
export function getStore(path: string): Promise<IStore> {
    let instance = stores.get(path);
    if (!instance) {
        instance = createStore(path);
        stores.set(path, instance);
    }
    return instance;
}
