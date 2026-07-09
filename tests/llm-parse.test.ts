import { describe, expect, it } from "vitest";
import { extractJsonBlock, parseScoringResponse } from "../src/lib/llm/parse";

const VALID_RESULT = {
    category: "おバカ系",
    total: 72,
    details: { humor: 35, structure: 15, format: 8, language: 7, completeness: 7 },
    reasons: {
        humor: "面白い",
        structure: "一貫している",
        format: "概ね適切",
        language: "読みやすい",
        completeness: "完結している",
    },
};

describe("extractJsonBlock", () => {
    it("```json フェンスから抽出する", () => {
        const content = '前置き\n```json\n{"a":1}\n```\n後書き';
        expect(extractJsonBlock(content)).toBe('{"a":1}');
    });

    it("言語指定なしフェンスから抽出する", () => {
        expect(extractJsonBlock('```\n{"a":1}\n```')).toBe('{"a":1}');
    });

    it("素のJSONはそのまま返す", () => {
        expect(extractJsonBlock('  {"a":1}  ')).toBe('{"a":1}');
    });

    it("前後にテキストが付いたJSONを取り出す", () => {
        expect(extractJsonBlock('結果は {"a":1} です')).toBe('{"a":1}');
    });
});

describe("parseScoringResponse", () => {
    it("有効な採点JSONをパースする", () => {
        const result = parseScoringResponse(JSON.stringify(VALID_RESULT));
        expect(result.isOk()).toBe(true);
        result.map((r) => {
            expect(r.total).toBe(72);
            expect(r.details.humor).toBe(35);
        });
    });

    it("advice が null でも受け付ける（フォーク版由来のバグ修正）", () => {
        const result = parseScoringResponse(
            JSON.stringify({ ...VALID_RESULT, advice: null })
        );
        expect(result.isOk()).toBe(true);
    });

    it("advice 文字列も受け付ける", () => {
        const result = parseScoringResponse(
            JSON.stringify({ ...VALID_RESULT, advice: "がんばれ" })
        );
        expect(result.isOk()).toBe(true);
        result.map((r) => expect(r.advice).toBe("がんばれ"));
    });

    it("コードフェンス付きレスポンスをパースする", () => {
        const result = parseScoringResponse(
            "採点しました。\n```json\n" + JSON.stringify(VALID_RESULT) + "\n```"
        );
        expect(result.isOk()).toBe(true);
    });

    it("空のレスポンスはエラー", () => {
        expect(parseScoringResponse("").isErr()).toBe(true);
        expect(parseScoringResponse("   ").isErr()).toBe(true);
    });

    it("JSONでないレスポンスはエラー", () => {
        const result = parseScoringResponse("ただのテキスト");
        expect(result.isErr()).toBe(true);
        result.mapErr((e) => expect(e.message).toContain("JSON"));
    });

    it("スキーマ違反（範囲外の点数）はエラー", () => {
        const invalid = {
            ...VALID_RESULT,
            details: { ...VALID_RESULT.details, humor: 999 },
        };
        const result = parseScoringResponse(JSON.stringify(invalid));
        expect(result.isErr()).toBe(true);
        result.mapErr((e) => expect(e.message).toContain("スキーマ"));
    });
});
