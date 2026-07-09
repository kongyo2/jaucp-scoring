import { z } from "@zod/zod";

/**
 * プロバイダタイプ
 */
export const ProviderTypeSchema = z.enum(["openrouter", "gemini", "cerebras"]);
export type ProviderType = z.infer<typeof ProviderTypeSchema>;

/**
 * プロンプトプリセット
 */
export const PromptPresetSchema = z.enum(["default", "humorless", "custom"]);
export type PromptPreset = z.infer<typeof PromptPresetSchema>;

/**
 * 採点結果の詳細スキーマ
 */
export const ScoringDetailsSchema = z.object({
    humor: z.number().min(0).max(50),
    structure: z.number().min(0).max(20),
    format: z.number().min(0).max(10),
    language: z.number().min(0).max(10),
    completeness: z.number().min(0).max(10),
});

/**
 * 採点理由のスキーマ
 */
export const ScoringReasonsSchema = z.object({
    humor: z.string(),
    structure: z.string(),
    format: z.string(),
    language: z.string(),
    completeness: z.string(),
});

/**
 * 採点結果のスキーマ
 * advice はモデルによって null を返すことがあるため nullish で受ける
 */
export const ScoringResultSchema = z.object({
    category: z.string(),
    total: z.number().min(0).max(100),
    details: ScoringDetailsSchema,
    reasons: ScoringReasonsSchema,
    advice: z.string().nullish(),
});

export type ScoringDetails = z.infer<typeof ScoringDetailsSchema>;
export type ScoringReasons = z.infer<typeof ScoringReasonsSchema>;
export type ScoringResult = z.infer<typeof ScoringResultSchema>;

/**
 * 評価軸の定義（UI・エクスポートで共用）
 */
export const EVAL_AXES = [
    { key: "humor", label: "ユーモア", max: 50 },
    { key: "structure", label: "構成一貫性", max: 20 },
    { key: "format", label: "記事フォーマット", max: 10 },
    { key: "language", label: "文章の自然さ", max: 10 },
    { key: "completeness", label: "完成度", max: 10 },
] as const satisfies ReadonlyArray<{
    key: keyof ScoringDetails;
    label: string;
    max: number;
}>;

/**
 * OpenRouter モデル情報のスキーマ
 * pricing 等は欠けていても一覧表示を壊さないように寛容に受ける
 */
export const OpenRouterModelSchema = z.object({
    id: z.string(),
    name: z.string().optional(),
    context_length: z.number().nullish(),
});

export const OpenRouterModelsResponseSchema = z.object({
    data: z.array(z.unknown()),
});

export type OpenRouterModel = z.infer<typeof OpenRouterModelSchema>;

/**
 * 共通モデル情報（UI表示用）
 */
export interface ModelInfo {
    id: string;
    name: string;
}

/**
 * 設定のスキーマ
 */
export const SettingsSchema = z.object({
    provider: ProviderTypeSchema.optional().default("openrouter"),
    openrouterApiKey: z.string().optional(),
    geminiApiKey: z.string().optional(),
    cerebrasApiKey: z.string().optional(),
    selectedModel: z.string().optional(),
    temperature: z.number().min(0).max(1).optional(),
    promptPreset: PromptPresetSchema.optional().default("default"),
    customPrompt: z.string().optional(),
});

export type Settings = z.infer<typeof SettingsSchema>;

/**
 * 採点履歴アイテムのスキーマ
 */
export const HistoryItemSchema = z.object({
    id: z.string(),
    timestamp: z.number(),
    title: z.string(),
    category: z.string(),
    total: z.number(),
    result: ScoringResultSchema,
    model: z.string().optional(),
    provider: z.string().optional(),
});

export type HistoryItem = z.infer<typeof HistoryItemSchema>;

/**
 * Zod のエラーを人間可読な1行メッセージへ
 */
export function formatZodError(error: z.ZodError): string {
    return error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join(" / ");
}
