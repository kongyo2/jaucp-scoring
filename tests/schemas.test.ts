import { describe, expect, it } from "vitest";
import {
    HistoryItemSchema,
    ScoringResultSchema,
    SettingsSchema,
} from "../src/lib/schemas";
import { resolveSystemPrompt, DEFAULT_SYSTEM_PROMPT, HUMORLESS_SYSTEM_PROMPT } from "../src/lib/prompts";

describe("SettingsSchema", () => {
    it("空オブジェクトにデフォルトを適用する", () => {
        const parsed = SettingsSchema.parse({});
        expect(parsed.provider).toBe("openrouter");
        expect(parsed.promptPreset).toBe("default");
    });

    it("temperature の範囲を検証する", () => {
        expect(SettingsSchema.safeParse({ temperature: 0.5 }).success).toBe(true);
        expect(SettingsSchema.safeParse({ temperature: 1.5 }).success).toBe(false);
        expect(SettingsSchema.safeParse({ temperature: -0.1 }).success).toBe(false);
    });

    it("不正なプロバイダを拒否する", () => {
        expect(SettingsSchema.safeParse({ provider: "openai" }).success).toBe(false);
    });
});

describe("ScoringResultSchema", () => {
    const base = {
        category: "その他",
        total: 50,
        details: { humor: 25, structure: 10, format: 5, language: 5, completeness: 5 },
        reasons: { humor: "", structure: "", format: "", language: "", completeness: "" },
    };

    it("advice なし・null・文字列をすべて受け付ける", () => {
        expect(ScoringResultSchema.safeParse(base).success).toBe(true);
        expect(ScoringResultSchema.safeParse({ ...base, advice: null }).success).toBe(true);
        expect(ScoringResultSchema.safeParse({ ...base, advice: "改善して" }).success).toBe(true);
    });

    it("各軸の上限を検証する", () => {
        const over = { ...base, details: { ...base.details, structure: 25 } };
        expect(ScoringResultSchema.safeParse(over).success).toBe(false);
    });
});

describe("HistoryItemSchema", () => {
    it("旧フォーマット（model/provider なし）も受け付ける", () => {
        const legacy = {
            id: "x",
            timestamp: 1,
            title: "t",
            category: "c",
            total: 10,
            result: {
                category: "c",
                total: 10,
                details: { humor: 5, structure: 2, format: 1, language: 1, completeness: 1 },
                reasons: { humor: "", structure: "", format: "", language: "", completeness: "" },
            },
        };
        expect(HistoryItemSchema.safeParse(legacy).success).toBe(true);
    });
});

describe("resolveSystemPrompt", () => {
    const baseSettings = SettingsSchema.parse({});

    it("default プリセットは標準プロンプト", () => {
        expect(resolveSystemPrompt({ ...baseSettings, promptPreset: "default" })).toBe(
            DEFAULT_SYSTEM_PROMPT
        );
    });

    it("humorless プリセットは厳格ウィキペディアン", () => {
        expect(resolveSystemPrompt({ ...baseSettings, promptPreset: "humorless" })).toBe(
            HUMORLESS_SYSTEM_PROMPT
        );
    });

    it("custom は customPrompt を使い、空なら標準へフォールバック", () => {
        expect(
            resolveSystemPrompt({
                ...baseSettings,
                promptPreset: "custom",
                customPrompt: "独自プロンプト",
            })
        ).toBe("独自プロンプト");
        expect(
            resolveSystemPrompt({ ...baseSettings, promptPreset: "custom", customPrompt: "  " })
        ).toBe(DEFAULT_SYSTEM_PROMPT);
    });
});
