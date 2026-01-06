import { ResultAsync, errAsync, okAsync } from "neverthrow";
import { GoogleGenAI } from "@google/genai";
import { ScoringResultSchema, type ScoringResult, type GeminiModel } from "./schemas";
import { SCORING_PROMPT } from "./scoring";

/**
 * Gemini APIから利用可能なモデル一覧を動的取得
 */
export function fetchGeminiModels(apiKey: string): ResultAsync<GeminiModel[], Error> {
    const ai = new GoogleGenAI({ apiKey });

    return ResultAsync.fromPromise(
        (async () => {
            const result = await ai.models.list();
            const models: GeminiModel[] = [];

            for await (const model of result) {
                // generateContent対応モデルのみフィルタ
                if (model.supportedActions?.includes("generateContent")) {
                    models.push({
                        id: model.name || "",
                        name: model.displayName || model.name || "",
                    });
                }
            }

            // Geminiモデルを優先ソート（新しいバージョンを上に）
            return models.sort((a, b) => {
                const order = ["gemini-2.5", "gemini-2.0", "gemini-1.5"];
                const getOrder = (id: string) => {
                    for (let i = 0; i < order.length; i++) {
                        if (id.includes(order[i])) return i;
                    }
                    return order.length;
                };
                return getOrder(a.id) - getOrder(b.id);
            });
        })(),
        (error) => new Error(`Gemini モデル取得エラー: ${error}`)
    );
}

/**
 * Gemini APIで記事を採点する
 */
export function scoreArticleWithGemini(
    apiKey: string,
    model: string,
    articleContent: string,
    temperature: number = 0.3
): ResultAsync<ScoringResult, Error> {
    const ai = new GoogleGenAI({ apiKey });

    return ResultAsync.fromPromise(
        (async () => {
            const response = await ai.models.generateContent({
                model,
                contents: articleContent,
                config: {
                    systemInstruction: SCORING_PROMPT,
                    temperature,
                },
            });

            return response.text || "";
        })(),
        (error) => new Error(`Gemini API 呼び出しエラー: ${error}`)
    ).andThen((content) => {
        if (!content) {
            return errAsync(new Error("空のレスポンス"));
        }

        // JSONをパース
        let jsonContent: unknown;
        try {
            // コードブロックで囲まれている場合の対応
            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
            const rawJson = jsonMatch ? jsonMatch[1] : content;
            jsonContent = JSON.parse(rawJson.trim());
        } catch (e) {
            return errAsync(new Error(`JSON パースエラー: ${e}\n\nレスポンス: ${content}`));
        }

        // スキーマ検証
        const parsed = ScoringResultSchema.safeParse(jsonContent);
        if (!parsed.success) {
            return errAsync(
                new Error(`スキーマ検証エラー: ${parsed.error.message}`)
            );
        }

        return okAsync(parsed.data);
    });
}
