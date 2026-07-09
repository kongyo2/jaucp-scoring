import { describe, expect, it } from "vitest";
import { formatAsJson, formatAsWikitext } from "../src/lib/export";
import type { ScoringResult } from "../src/lib/schemas";

const RESULT: ScoringResult = {
    category: "知的ユーモア",
    total: 85,
    details: { humor: 45, structure: 17, format: 8, language: 8, completeness: 7 },
    reasons: {
        humor: "ウィットに富む",
        structure: "着眼点が一貫",
        format: "節構成が適切",
        language: "読みやすい",
        completeness: "過不足なし",
    },
    advice: "さらなる高みへ",
};

describe("formatAsWikitext", () => {
    it("wikitable 形式で出力する", () => {
        const text = formatAsWikitext(RESULT);
        expect(text).toContain('{| class="wikitable"');
        expect(text).toContain("|}");
        expect(text).toContain("! 評価軸 !! 点数 !! 理由");
        expect(text).toContain("| ユーモア || 45/50 || ウィットに富む");
        expect(text).toContain("! 合計 !! 85/100 !! 知的ユーモア");
    });

    it("署名を末尾に付ける", () => {
        expect(formatAsWikitext(RESULT).trimEnd().endsWith("--~~~~")).toBe(true);
    });

    it("タイトルとモデルをコンテキストとして含められる", () => {
        const text = formatAsWikitext(RESULT, { title: "猫", model: "test-model" });
        expect(text).toContain("[[猫]]");
        expect(text).toContain("test-model");
    });

    it("advice があれば節として出力する", () => {
        const text = formatAsWikitext(RESULT);
        expect(text).toContain("=== 改善アドバイス ===");
        expect(text).toContain("さらなる高みへ");
    });

    it("advice がなければ節を出力しない", () => {
        const text = formatAsWikitext({ ...RESULT, advice: undefined });
        expect(text).not.toContain("改善アドバイス");
    });

    it("理由・分類中の | をエスケープして表組みを守る", () => {
        const withPipe = {
            ...RESULT,
            category: "おバカ系|脱力系",
            reasons: { ...RESULT.reasons, humor: "AとB|どちらも面白い" },
        };
        const text = formatAsWikitext(withPipe);
        expect(text).toContain("AとB&#124;どちらも面白い");
        expect(text).toContain("おバカ系&#124;脱力系");
        expect(text).not.toContain("AとB|どちらも面白い");
    });

    it("リンク構文を壊すタイトル文字を除去する", () => {
        const text = formatAsWikitext(RESULT, { title: "壊れた]]タイトル|X" });
        expect(text).toContain("[[壊れたタイトルX]]");
    });
});

describe("formatAsJson", () => {
    it("パース可能な整形JSONを出力する", () => {
        const text = formatAsJson(RESULT, { title: "猫" });
        const parsed = JSON.parse(text);
        expect(parsed.title).toBe("猫");
        expect(parsed.total).toBe(85);
        expect(typeof parsed.scoredAt).toBe("string");
    });
});
