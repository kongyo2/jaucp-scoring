import { ResultAsync, okAsync } from "neverthrow";
import { SettingsSchema, type Settings } from "./schemas";
import { getStore } from "./store";

const STORE_PATH = "settings.json";

/**
 * デフォルト設定
 */
export const DEFAULT_SETTINGS: Settings = {
    provider: "openrouter",
    openrouterApiKey: undefined,
    geminiApiKey: undefined,
    cerebrasApiKey: undefined,
    selectedModel: undefined,
    temperature: 0.3,
    promptPreset: "default",
    customPrompt: undefined,
};

/** 保存対象のキー一覧（スキーマと同期） */
const SETTING_KEYS = [
    "provider",
    "openrouterApiKey",
    "geminiApiKey",
    "cerebrasApiKey",
    "selectedModel",
    "temperature",
    "promptPreset",
    "customPrompt",
] as const satisfies ReadonlyArray<keyof Settings>;

/**
 * 設定を読み込む
 * 不正な値が混ざっていても、その項目だけデフォルトに落として全体は生かす
 */
export function loadSettings(): ResultAsync<Settings, Error> {
    return ResultAsync.fromPromise(
        (async () => {
            const store = await getStore(STORE_PATH);
            const raw: Record<string, unknown> = {};
            for (const key of SETTING_KEYS) {
                const value = await store.get<unknown>(key);
                if (value !== null && value !== undefined) {
                    raw[key] = value;
                }
            }

            // 旧形式(単一 apiKey)からのマイグレーション
            if (raw.openrouterApiKey === undefined) {
                const legacyApiKey = await store.get<string>("apiKey");
                if (legacyApiKey) {
                    raw.openrouterApiKey = legacyApiKey;
                }
            }
            return raw;
        })(),
        (error) => new Error(`設定読み込みエラー: ${error}`)
    ).andThen((raw) => {
        const parsed = SettingsSchema.safeParse(raw);
        if (parsed.success) {
            return okAsync({ ...DEFAULT_SETTINGS, ...parsed.data });
        }

        // 全損させず、項目単位で有効なものだけ拾う
        const salvaged: Record<string, unknown> = {};
        for (const key of SETTING_KEYS) {
            if (!(key in raw)) continue;
            const single = SettingsSchema.partial().safeParse({ [key]: raw[key] });
            if (single.success && single.data[key] !== undefined) {
                salvaged[key] = single.data[key];
            }
        }
        const partial = SettingsSchema.safeParse(salvaged);
        return okAsync(
            partial.success ? { ...DEFAULT_SETTINGS, ...partial.data } : DEFAULT_SETTINGS
        );
    });
}

/**
 * 設定を保存する（渡された項目だけ更新）
 */
export function saveSettings(settings: Partial<Settings>): ResultAsync<void, Error> {
    return ResultAsync.fromPromise(
        (async () => {
            const store = await getStore(STORE_PATH);
            for (const key of SETTING_KEYS) {
                const value = settings[key];
                if (value !== undefined) {
                    await store.set(key, value);
                }
            }
            await store.save();
        })(),
        (error) => new Error(`設定保存エラー: ${error}`)
    );
}

/**
 * 現在のプロバイダのAPIキーを取得
 */
export function getCurrentApiKey(settings: Settings): string | undefined {
    switch (settings.provider) {
        case "gemini":
            return settings.geminiApiKey;
        case "cerebras":
            return settings.cerebrasApiKey;
        default:
            return settings.openrouterApiKey;
    }
}
