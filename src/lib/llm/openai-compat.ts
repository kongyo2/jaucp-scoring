import { ResultAsync } from "neverthrow";

/**
 * OpenAI 互換 chat/completions API の共通実装
 * （OpenRouter / Cerebras で共用）
 */

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

interface ChatCompletionResponse {
    choices?: Array<{
        message?: {
            content?: string | null;
        };
    }>;
}

export interface ChatRequestOptions {
    baseUrl: string;
    apiKey: string;
    model: string;
    messages: ChatMessage[];
    temperature: number;
    extraHeaders?: Record<string, string>;
    providerLabel: string;
}

/**
 * chat/completions を呼び、アシスタントの応答テキストを返す
 */
export function chatCompletion(options: ChatRequestOptions): ResultAsync<string, Error> {
    const { baseUrl, apiKey, model, messages, temperature, extraHeaders, providerLabel } = options;

    return ResultAsync.fromPromise(
        (async () => {
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    ...extraHeaders,
                },
                body: JSON.stringify({ model, messages, temperature }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`${providerLabel} API エラー (${response.status}): ${errorText}`);
            }

            const data = (await response.json()) as ChatCompletionResponse;
            const content = data.choices?.[0]?.message?.content;
            if (!content) {
                throw new Error(`${providerLabel} から空のレスポンスが返されました`);
            }
            return content;
        })(),
        (error) => (error instanceof Error ? error : new Error(`${providerLabel} API 呼び出しエラー: ${error}`))
    );
}
