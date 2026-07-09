import { ResultAsync, errAsync } from "neverthrow";
import type { ModelInfo, ScoringResult, Settings } from "../schemas";
import { getCurrentApiKey } from "../settings";
import { resolveSystemPrompt } from "../prompts";
import { parseScoringResponse } from "./parse";
import { fetchOpenRouterModels, openRouterChat } from "./openrouter";
import { fetchGeminiModels, geminiGenerate } from "./gemini";
import { fetchCerebrasModels, cerebrasChat } from "./cerebras";

export const DEFAULT_TEMPERATURE = 0.3;

/**
 * 現在のプロバイダのモデル一覧を取得する
 */
export function fetchModels(settings: Settings): ResultAsync<ModelInfo[], Error> {
    const apiKey = getCurrentApiKey(settings);
    if (!apiKey) {
        return errAsync(new Error("APIキーが設定されていません"));
    }

    switch (settings.provider) {
        case "gemini":
            return fetchGeminiModels(apiKey);
        case "cerebras":
            return fetchCerebrasModels(apiKey);
        default:
            return fetchOpenRouterModels(apiKey);
    }
}

/**
 * 設定に従って記事を採点する（プロバイダ差異はここで吸収）
 */
export function scoreArticle(
    settings: Settings,
    articleContent: string
): ResultAsync<ScoringResult, Error> {
    const apiKey = getCurrentApiKey(settings);
    const model = settings.selectedModel;
    if (!apiKey || !model) {
        return errAsync(new Error("APIキーまたはモデルが設定されていません"));
    }

    const systemPrompt = resolveSystemPrompt(settings);
    const temperature = settings.temperature ?? DEFAULT_TEMPERATURE;

    let raw: ResultAsync<string, Error>;
    switch (settings.provider) {
        case "gemini":
            raw = geminiGenerate(apiKey, model, systemPrompt, articleContent, temperature);
            break;
        case "cerebras":
            raw = cerebrasChat(
                apiKey,
                model,
                [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: articleContent },
                ],
                temperature
            );
            break;
        default:
            raw = openRouterChat(
                apiKey,
                model,
                [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: articleContent },
                ],
                temperature
            );
    }

    return raw.andThen((content) => parseScoringResponse(content));
}
