import { beforeAll, describe, expect, it } from "vitest";
import { getTokenizer } from "../src/lib/morphology";
import {
    generateLinkCandidates,
    suppressSubsumedCandidates,
    type LinkCandidate,
} from "../src/lib/link-suggest";

beforeAll(async () => {
    await getTokenizer();
});

function titles(candidates: LinkCandidate[]): string[] {
    return candidates.map((candidate) => candidate.title);
}

describe("generateLinkCandidates", () => {
    it("名詞・固有名詞を候補として抽出する", async () => {
        const candidates = await generateLinkCandidates(
            "東京タワーの近くの商店街でラーメンを食べた。"
        );
        const list = titles(candidates);
        expect(list).toContain("東京タワー");
        expect(list).toContain("ラーメン");
    });

    it("すでにリンク済みの語は除外する", async () => {
        const candidates = await generateLinkCandidates(
            "[[東京タワー]]の近くでラーメンを食べた。"
        );
        const list = titles(candidates);
        expect(list).not.toContain("東京タワー");
        expect(list).toContain("ラーメン");
    });

    it("リンク先文字列の中の語は候補にしない", async () => {
        const candidates = await generateLinkCandidates(
            "[[存在しない記事名の例]]を含む文である。"
        );
        const list = titles(candidates);
        expect(list).not.toContain("存在");
        expect(list).not.toContain("記事名");
    });

    it("リンク済みタイトルは本文中の別出現も提案しない", async () => {
        const candidates = await generateLinkCandidates(
            "[[東京タワー]]は有名である。東京タワーは赤い。"
        );
        expect(titles(candidates)).not.toContain("東京タワー");
    });

    it("パイプリンクの表示名も除外する", async () => {
        const candidates = await generateLinkCandidates(
            "[[東京タワー|とうきょうタワー]]と東京タワーに登った。"
        );
        expect(titles(candidates)).not.toContain("東京タワー");
    });

    it("excludeTitles（記事自身のタイトル等）を除外する", async () => {
        const candidates = await generateLinkCandidates(
            "ラーメンとは麺料理である。",
            ["ラーメン"]
        );
        expect(titles(candidates)).not.toContain("ラーメン");
    });

    it("数値・助数詞のみの語は除外する", async () => {
        const candidates = await generateLinkCandidates("2020年に100回目の大会があった。");
        const list = titles(candidates);
        expect(list).not.toContain("2020年");
        expect(list).not.toContain("100回");
    });

    it("中黒つきカタカナ複合語（人名）を高優先度で抽出する", async () => {
        const candidates = await generateLinkCandidates(
            "マルセル・デュシャンの泉という作品がある。"
        );
        const duchamp = candidates.find((candidate) => candidate.title === "マルセル・デュシャン");
        expect(duchamp).toBeDefined();
        // 人名候補は一般名詞より優先される
        const izumi = candidates.find((candidate) => candidate.title === "泉");
        if (izumi) {
            expect(duchamp!.priority).toBeGreaterThan(izumi.priority);
        }
    });

    it("出現回数を数える", async () => {
        const candidates = await generateLinkCandidates(
            "ラーメンが好きだ。ラーメンは文化である。"
        );
        const ramen = candidates.find((candidate) => candidate.title === "ラーメン");
        expect(ramen?.count).toBe(2);
    });

    it("地の文がなければ空を返す", async () => {
        expect(await generateLinkCandidates("{{テンプレのみ}}")).toEqual([]);
    });
});

describe("suppressSubsumedCandidates", () => {
    const make = (title: string, count: number, priority: number): LinkCandidate => ({
        title,
        count,
        priority,
        posDetail: "",
    });

    it("上位候補に包含される語を間引く", () => {
        const result = suppressSubsumedCandidates([
            make("マルセル・デュシャン", 2, 100),
            make("マルセル", 2, 50),
            make("泉", 1, 40),
        ]);
        expect(titles(result)).toEqual(["マルセル・デュシャン", "泉"]);
    });

    it("単独でも出現する語は残す", () => {
        const result = suppressSubsumedCandidates([
            make("東京タワー", 1, 100),
            make("東京", 3, 50),
        ]);
        expect(titles(result)).toEqual(["東京タワー", "東京"]);
    });
});
