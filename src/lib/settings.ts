import { load, Store } from "@tauri-apps/plugin-store";
import { ResultAsync, okAsync } from "neverthrow";
import { SettingsSchema, type Settings, type ProviderType } from "./schemas";

const STORE_PATH = "settings.json";

let storeInstance: Store | null = null;

/**
 * Storeインスタンスを取得
 */
async function getStore(): Promise<Store> {
    if (!storeInstance) {
        storeInstance = await load(STORE_PATH);
    }
    return storeInstance;
}

/**
 * デフォルト設定
 */
const DEFAULT_SETTINGS: Settings = {
    provider: "openrouter",
    openrouterApiKey: undefined,
    geminiApiKey: undefined,
    cerebrasApiKey: undefined,
    selectedModel: undefined,
};

/**
 * 設定を読み込む
 */
export function loadSettings(): ResultAsync<Settings, Error> {
    return ResultAsync.fromPromise(
        (async () => {
            const store = await getStore();
            const provider = await store.get<ProviderType>("provider");
            const openrouterApiKey = await store.get<string>("openrouterApiKey");
            const geminiApiKey = await store.get<string>("geminiApiKey");
            const cerebrasApiKey = await store.get<string>("cerebrasApiKey");
            const selectedModel = await store.get<string>("selectedModel");

            // 旧形式からのマイグレーション
            const legacyApiKey = await store.get<string>("apiKey");

            return {
                provider: provider || "openrouter",
                openrouterApiKey: openrouterApiKey || legacyApiKey,
                geminiApiKey,
                cerebrasApiKey,
                selectedModel,
            };
        })(),
        (error) => new Error(`設定読み込みエラー: ${error}`)
    ).andThen((data) => {
        const parsed = SettingsSchema.safeParse(data);
        if (!parsed.success) {
            return okAsync(DEFAULT_SETTINGS);
        }
        return okAsync(parsed.data);
    });
}

/**
 * 設定を保存する
 */
export function saveSettings(settings: Partial<Settings>): ResultAsync<void, Error> {
    return ResultAsync.fromPromise(
        (async () => {
            const store = await getStore();
            if (settings.provider !== undefined) {
                await store.set("provider", settings.provider);
            }
            if (settings.openrouterApiKey !== undefined) {
                await store.set("openrouterApiKey", settings.openrouterApiKey);
            }
            if (settings.geminiApiKey !== undefined) {
                await store.set("geminiApiKey", settings.geminiApiKey);
            }
            if (settings.cerebrasApiKey !== undefined) {
                await store.set("cerebrasApiKey", settings.cerebrasApiKey);
            }
            if (settings.selectedModel !== undefined) {
                await store.set("selectedModel", settings.selectedModel);
            }
            await store.save();
        })(),
        (error) => new Error(`設定保存エラー: ${error}`)
    );
}

/**
 * 現在のプロバイダのAPIキーが設定されているか確認
 */
export function hasApiKey(): ResultAsync<boolean, Error> {
    return loadSettings().map((settings) => {
        if (settings.provider === "gemini") {
            return !!settings.geminiApiKey;
        }
        if (settings.provider === "cerebras") {
            return !!settings.cerebrasApiKey;
        }
        return !!settings.openrouterApiKey;
    });
}

/**
 * 現在のプロバイダのAPIキーを取得
 */
export function getCurrentApiKey(settings: Settings): string | undefined {
    if (settings.provider === "gemini") {
        return settings.geminiApiKey;
    }
    if (settings.provider === "cerebras") {
        return settings.cerebrasApiKey;
    }
    return settings.openrouterApiKey;
}
