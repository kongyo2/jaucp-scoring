import { ResultAsync, okAsync } from "neverthrow";
import type { ModelInfo } from "../schemas";
import { chatCompletion, type ChatMessage } from "./openai-compat";

/**
 * Cerebras API エンドポイント
 * https://inference-docs.cerebras.ai/
 */
const CEREBRAS_API_BASE = "https://api.cerebras.ai/v1";

/**
 * 既知モデルの表示名マップ（一覧APIには表示名がないため）
 */
const MODEL_DISPLAY_NAMES: Record<string, string> = {
    "llama-3.3-70b": "Llama 3.3 70B (推奨)",
    "qwen-3-32b": "Qwen 3 32B",
    "llama3.1-8b": "Llama 3.1 8B (高速)",
    "gpt-oss-120b": "GPT OSS 120B",
    "qwen-3-235b-a22b-instruct-2507": "Qwen 3 235B (Preview)",
    "zai-glm-4.6": "Z.AI GLM 4.6 (Preview)",
};

/**
 * フォールバック用静的モデルリスト
 * 参考: https://inference-docs.cerebras.ai/models/overview
 */
const CEREBRAS_FALLBACK_MODELS: ModelInfo[] = Object.entries(MODEL_DISPLAY_NAMES).map(
    ([id, name]) => ({ id, name })
);

interface CerebrasModelsResponse {
    data?: Array<{ id: string; owned_by?: string }>;
}

/**
 * Cerebras から利用可能なモデル一覧を動的取得
 * 失敗時は静的リストにフォールバック
 */
export function fetchCerebrasModels(apiKey: string): ResultAsync<ModelInfo[], Error> {
    return ResultAsync.fromPromise(
        fetch(`${CEREBRAS_API_BASE}/models`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        }).then(async (response) => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json() as Promise<CerebrasModelsResponse>;
        }),
        (error) => new Error(`モデル一覧取得エラー: ${error}`)
    ).andThen((response) => {
        if (!response.data || response.data.length === 0) {
            console.warn("Cerebras: 空のモデル一覧、静的リストを使用");
            return okAsync(CEREBRAS_FALLBACK_MODELS);
        }

        const priority = ["llama-3.3-70b", "qwen-3-32b", "llama3.1-8b"];
        const rank = (id: string) => {
            const index = priority.indexOf(id);
            return index === -1 ? priority.length : index;
        };

        const models = response.data
            .map((m): ModelInfo => ({
                id: m.id,
                name: MODEL_DISPLAY_NAMES[m.id] ?? (m.owned_by ? `${m.id} (${m.owned_by})` : m.id),
            }))
            .sort((a, b) => rank(a.id) - rank(b.id));

        return okAsync(models);
    }).orElse((error) => {
        console.warn("Cerebras: モデル一覧取得失敗、静的リストを使用:", error.message);
        return okAsync(CEREBRAS_FALLBACK_MODELS);
    });
}

/**
 * Cerebras で chat completion を実行し、応答テキストを返す
 */
export function cerebrasChat(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    temperature: number
): ResultAsync<string, Error> {
    return chatCompletion({
        baseUrl: CEREBRAS_API_BASE,
        apiKey,
        model,
        messages,
        temperature,
        providerLabel: "Cerebras",
    });
}
