import { ResultAsync, errAsync, okAsync } from "neverthrow";
import { OpenRouter } from "@openrouter/sdk";
import { OpenRouterModelsResponseSchema, type OpenRouterModel } from "./schemas";

/**
 * OpenRouter SDKインスタンスを作成
 */
function createOpenRouterClient(apiKey: string): OpenRouter {
    return new OpenRouter({
        apiKey,
    });
}

/**
 * OpenRouter APIから利用可能なモデル一覧を取得
 * OpenRouter SDK の models.list() を使用
 */
export function fetchAvailableModels(
    apiKey: string
): ResultAsync<OpenRouterModel[], Error> {
    const openrouter = createOpenRouterClient(apiKey);

    return ResultAsync.fromPromise(
        openrouter.models.list(),
        (error) => new Error(`モデル取得エラー: ${error}`)
    ).andThen((response) => {
        // スキーマ検証
        const parsed = OpenRouterModelsResponseSchema.safeParse(response);
        if (!parsed.success) {
            return errAsync(new Error(`スキーマ検証エラー: ${parsed.error.message}`));
        }
        // コンテキスト長でソート（大きい順）
        const sorted = parsed.data.data.sort(
            (a, b) => b.context_length - a.context_length
        );
        return okAsync(sorted);
    });
}

/**
 * モデルIDからモデル名を取得するヘルパー
 */
export function getModelDisplayName(model: OpenRouterModel): string {
    return model.name || model.id;
}

/**
 * モデルの料金情報をフォーマット
 */
export function formatModelPricing(model: OpenRouterModel): string {
    const promptPrice = parseFloat(model.pricing.prompt) * 1_000_000;
    const completionPrice = parseFloat(model.pricing.completion) * 1_000_000;
    return `$${promptPrice.toFixed(2)}/${completionPrice.toFixed(2)} per 1M tokens`;
}

export { createOpenRouterClient };
