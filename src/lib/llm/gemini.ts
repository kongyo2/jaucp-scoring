import { ResultAsync } from "neverthrow";
import { GoogleGenAI } from "@google/genai";
import type { ModelInfo } from "../schemas";

/**
 * Gemini API から利用可能なモデル一覧を動的取得
 */
export function fetchGeminiModels(apiKey: string): ResultAsync<ModelInfo[], Error> {
    const ai = new GoogleGenAI({ apiKey });

    return ResultAsync.fromPromise(
        (async () => {
            const result = await ai.models.list();
            const models: ModelInfo[] = [];
            const seen = new Set<string>();

            for await (const model of result) {
                // generateContent 対応モデルのみ
                if (!model.supportedActions?.includes("generateContent")) continue;
                const id = model.name || "";
                if (!id || seen.has(id)) continue;
                seen.add(id);
                models.push({ id, name: model.displayName || id });
            }

            // 新しい世代を上に
            const order = ["gemini-3", "gemini-2.5", "gemini-2.0", "gemini-1.5"];
            const generationRank = (id: string) => {
                const index = order.findIndex((prefix) => id.includes(prefix));
                return index === -1 ? order.length : index;
            };
            return models.sort((a, b) => generationRank(a.id) - generationRank(b.id));
        })(),
        (error) => new Error(`Gemini モデル取得エラー: ${error}`)
    );
}

/**
 * Gemini で生成を実行し、応答テキストを返す
 */
export function geminiGenerate(
    apiKey: string,
    model: string,
    systemPrompt: string,
    userContent: string,
    temperature: number
): ResultAsync<string, Error> {
    const ai = new GoogleGenAI({ apiKey });

    return ResultAsync.fromPromise(
        (async () => {
            const response = await ai.models.generateContent({
                model,
                contents: userContent,
                config: {
                    systemInstruction: systemPrompt,
                    temperature,
                },
            });
            const text = response.text;
            if (!text) {
                throw new Error("Gemini から空のレスポンスが返されました");
            }
            return text;
        })(),
        (error) => (error instanceof Error ? error : new Error(`Gemini API 呼び出しエラー: ${error}`))
    );
}
