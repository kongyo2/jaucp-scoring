import { ResultAsync, errAsync, okAsync } from "neverthrow";
import {
    OpenRouterModelSchema,
    OpenRouterModelsResponseSchema,
    formatZodError,
    type ModelInfo,
} from "../schemas";
import { chatCompletion, type ChatMessage } from "./openai-compat";

const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";

/**
 * OpenRouter から利用可能なモデル一覧を取得
 * 一部モデルのメタデータが欠けていても、パースできたものだけを返す
 */
export function fetchOpenRouterModels(apiKey: string): ResultAsync<ModelInfo[], Error> {
    return ResultAsync.fromPromise(
        fetch(`${OPENROUTER_API_BASE}/models`, {
            headers: { Authorization: `Bearer ${apiKey}` },
        }).then((response) => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return response.json();
        }),
        (error) => new Error(`モデル取得エラー: ${error}`)
    ).andThen((data) => {
        const envelope = OpenRouterModelsResponseSchema.safeParse(data);
        if (!envelope.success) {
            return errAsync(new Error(`スキーマ検証エラー: ${formatZodError(envelope.error)}`));
        }

        const models = envelope.data.data
            .map((item) => OpenRouterModelSchema.safeParse(item))
            .filter((parsed) => parsed.success)
            .map((parsed) => parsed.data)
            // コンテキスト長でソート（大きい順）
            .sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0))
            .map((m): ModelInfo => ({ id: m.id, name: m.name || m.id }));

        if (models.length === 0) {
            return errAsync(new Error("利用可能なモデルが見つかりませんでした"));
        }
        return okAsync(models);
    });
}

/**
 * OpenRouter で chat completion を実行し、応答テキストを返す
 */
export function openRouterChat(
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    temperature: number
): ResultAsync<string, Error> {
    return chatCompletion({
        baseUrl: OPENROUTER_API_BASE,
        apiKey,
        model,
        messages,
        temperature,
        extraHeaders: { "X-Title": "JAUCP Scoring Tool" },
        providerLabel: "OpenRouter",
    });
}
