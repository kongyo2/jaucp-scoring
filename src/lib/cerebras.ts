import { ResultAsync, errAsync, okAsync } from "neverthrow";
import { ScoringResultSchema, type ScoringResult } from "./schemas";
import { SCORING_PROMPT } from "./scoring";

/**
 * Cerebras API エンドポイント
 * https://inference-docs.cerebras.ai/
 */
const CEREBRAS_API_BASE = "https://api.cerebras.ai/v1";

/**
 * Cerebras モデル情報
 */
export interface CerebrasModel {
    id: string;
    name: string;
}

/**
 * Cerebras 利用可能モデル一覧（フォールバック用静的リスト）
 * 参考: https://inference-docs.cerebras.ai/models/overview
 */
const CEREBRAS_FALLBACK_MODELS: CerebrasModel[] = [
    { id: "llama-3.3-70b", name: "Llama 3.3 70B (推奨)" },
    { id: "qwen-3-32b", name: "Qwen 3 32B" },
    { id: "llama3.1-8b", name: "Llama 3.1 8B (高速)" },
    { id: "gpt-oss-120b", name: "GPT OSS 120B" },
    { id: "qwen-3-235b-a22b-instruct-2507", name: "Qwen 3 235B (Preview)" },
    { id: "zai-glm-4.6", name: "Z.AI GLM 4.6 (Preview)" },
];

/**
 * Cerebras モデル一覧APIレスポンス
 */
interface CerebrasModelsResponse {
    object: string;
    data: Array<{
        id: string;
        object: string;
        created: number;
        owned_by: string;
    }>;
}

interface CerebrasChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

interface CerebrasChatCompletionResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

/**
 * モデルIDから表示名を生成
 */
function formatModelName(id: string, ownedBy: string): string {
    // モデルIDを人間が読みやすい名前に変換
    const nameMap: Record<string, string> = {
        "llama-3.3-70b": "Llama 3.3 70B (推奨)",
        "qwen-3-32b": "Qwen 3 32B",
        "llama3.1-8b": "Llama 3.1 8B (高速)",
        "gpt-oss-120b": "GPT OSS 120B",
        "qwen-3-235b-a22b-instruct-2507": "Qwen 3 235B (Preview)",
        "zai-glm-4.6": "Z.AI GLM 4.6 (Preview)",
    };

    if (nameMap[id]) {
        return nameMap[id];
    }

    // 不明なモデルは所有者付きで表示
    return `${id} (${ownedBy})`;
}

/**
 * Cerebras APIから利用可能なモデル一覧を動的に取得
 * 失敗時は静的リストにフォールバック
 */
export function fetchCerebrasModels(apiKey: string): ResultAsync<CerebrasModel[], Error> {
    return ResultAsync.fromPromise(
        fetch(`${CEREBRAS_API_BASE}/models`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
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

        const models: CerebrasModel[] = response.data.map((m) => ({
            id: m.id,
            name: formatModelName(m.id, m.owned_by),
        }));

        // Llama 3.3 70Bを先頭にソート
        const sorted = models.sort((a, b) => {
            const priority = ["llama-3.3-70b", "qwen-3-32b", "llama3.1-8b"];
            const getOrder = (id: string) => {
                const idx = priority.indexOf(id);
                return idx === -1 ? priority.length : idx;
            };
            return getOrder(a.id) - getOrder(b.id);
        });

        return okAsync(sorted);
    }).orElse((error) => {
        console.warn("Cerebras: モデル一覧取得失敗、静的リストを使用:", error.message);
        return okAsync(CEREBRAS_FALLBACK_MODELS);
    });
}

/**
 * Cerebras APIで記事を採点する
 */
export function scoreArticleWithCerebras(
    apiKey: string,
    model: string,
    articleContent: string
): ResultAsync<ScoringResult, Error> {
    const messages: CerebrasChatMessage[] = [
        { role: "system", content: SCORING_PROMPT },
        { role: "user", content: articleContent },
    ];

    return ResultAsync.fromPromise(
        fetch(`${CEREBRAS_API_BASE}/chat/completions`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: 0.3,
            }),
        }).then(async (response) => {
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Cerebras API エラー (${response.status}): ${errorText}`);
            }
            return response.json() as Promise<CerebrasChatCompletionResponse>;
        }),
        (error) => new Error(`Cerebras API 呼び出しエラー: ${error}`)
    ).andThen((response) => {
        const content = response.choices[0]?.message?.content;
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
