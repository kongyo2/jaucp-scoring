import { beforeAll, describe, expect, it } from "vitest";
import { getTokenizer } from "../src/lib/morphology";
import { extractProse, proofreadWikitext, type LintIssue } from "../src/lib/proofread";

beforeAll(async () => {
    await getTokenizer();
});

function rulesOf(issues: LintIssue[]): string[] {
    return issues.map((issue) => issue.rule);
}

/** カテゴリ付きの雛形（no-category を出さないため） */
function withCategory(body: string): string {
    return `${body}\n[[Category:テスト]]`;
}

describe("proofreadWikitext: wakame 移植ルール（形態素解析）", () => {
    it("ら抜き言葉（一語解析: 見れる）を検出する", async () => {
        const issues = await proofreadWikitext(withCategory("この番組は誰でも見れる。"));
        const ra = issues.filter((issue) => issue.rule === "ra-dropping");
        expect(ra).toHaveLength(1);
        expect(ra[0].message).toContain("見られる");
    });

    it("ら抜き言葉（一段動詞未然形+接尾れる: 食べれる）を検出する", async () => {
        const issues = await proofreadWikitext(withCategory("ここでは何でも食べれる。"));
        expect(rulesOf(issues)).toContain("ra-dropping");
    });

    it("正しい可能形（見られる・食べられる）は検出しない", async () => {
        const issues = await proofreadWikitext(
            withCategory("この番組は誰でも見られる。ここでは何でも食べられる。")
        );
        expect(rulesOf(issues)).not.toContain("ra-dropping");
    });

    it("五段動詞の受身（ののしられた）を誤検出しない", async () => {
        const issues = await proofreadWikitext(withCategory("彼は大いにののしられた。"));
        expect(rulesOf(issues)).not.toContain("ra-dropping");
    });

    it("正規の仮定形（見れば）は検出しない", async () => {
        const issues = await proofreadWikitext(withCategory("これを見れば分かる。"));
        expect(rulesOf(issues)).not.toContain("ra-dropping");
    });

    it("逆接の接続助詞「が」の重複を検出する", async () => {
        const issues = await proofreadWikitext(
            withCategory("彼は行くが、私は残るが、彼女は迷っている。")
        );
        const ga = issues.filter((issue) => issue.rule === "adversative-ga");
        expect(ga).toHaveLength(1);
        expect(ga[0].message).toContain("2回");
    });

    it("主格の「が」は逆接として数えない", async () => {
        const issues = await proofreadWikitext(
            withCategory("犬が走り、猫が眠り、鳥が飛ぶ。")
        );
        expect(rulesOf(issues)).not.toContain("adversative-ga");
    });

    it("読点過多（4個以上）を検出する", async () => {
        const issues = await proofreadWikitext(
            withCategory("今日は、朝から、雨が降り、風も吹き、とても寒い。")
        );
        const comma = issues.filter((issue) => issue.rule === "comma-limit");
        expect(comma).toHaveLength(1);
        expect(comma[0].message).toContain("4個");
    });

    it("同じ助詞の連続（はは）を検出する", async () => {
        const issues = await proofreadWikitext(withCategory("これはは変な文である。"));
        expect(rulesOf(issues)).toContain("duplicate-particle");
    });

    it("間に語を挟んだ同一助詞の再出現（今日は雨は…）は検出しない", async () => {
        const issues = await proofreadWikitext(withCategory("今日は雨は降らない。"));
        expect(rulesOf(issues)).not.toContain("duplicate-particle");
    });

    it("同じ接続詞の連続を検出する", async () => {
        const issues = await proofreadWikitext(
            withCategory("しかし彼は寝た。しかし彼は起きた。")
        );
        const repeat = issues.filter((issue) => issue.rule === "conjunction-repeat");
        expect(repeat).toHaveLength(1);
        expect(repeat[0].message).toContain("しかし");
    });

    it("段落（行）が変われば接続詞の連続はリセットされる", async () => {
        const issues = await proofreadWikitext(
            withCategory("しかし彼は寝た。\n\nしかし彼は起きた。")
        );
        expect(rulesOf(issues)).not.toContain("conjunction-repeat");
    });
});

describe("proofreadWikitext: 追加ルール", () => {
    it("敬体と常体の混在を検出する", async () => {
        const issues = await proofreadWikitext(
            withCategory("これは記事です。あれも記事です。しかしこれは常体である。")
        );
        const mixture = issues.filter((issue) => issue.rule === "style-mixture");
        expect(mixture).toHaveLength(1);
        expect(mixture[0].message).toContain("敬体");
    });

    it("文体が統一されていれば検出しない", async () => {
        const issues = await proofreadWikitext(
            withCategory("これは記事である。あれも記事である。それも記事である。")
        );
        expect(rulesOf(issues)).not.toContain("style-mixture");
    });

    it("連体化の「の」の3連続を検出する", async () => {
        const issues = await proofreadWikitext(
            withCategory("東京の下町の商店街の名物を紹介する。")
        );
        expect(rulesOf(issues)).toContain("no-chain");
    });
});

describe("proofreadWikitext: ウィキ構文ルール", () => {
    it("カテゴリ未設定を警告する", async () => {
        const issues = await proofreadWikitext("カテゴリのない記事である。");
        expect(rulesOf(issues)).toContain("no-category");
    });

    it("カテゴリがあれば警告しない", async () => {
        const issues = await proofreadWikitext("本文である。\n[[カテゴリ:ネタ]]");
        expect(rulesOf(issues)).not.toContain("no-category");
    });

    it("括弧の不整合を検出する", async () => {
        const issues = await proofreadWikitext(withCategory("これは[[壊れたリンクである。"));
        const unbalanced = issues.filter((issue) => issue.rule === "unbalanced-brackets");
        expect(unbalanced).toHaveLength(1);
    });

    it("本文への署名混入を警告する", async () => {
        const issues = await proofreadWikitext(withCategory("これは本文である。--~~~~"));
        expect(rulesOf(issues)).toContain("signature-in-article");
    });

    it("見出しレベルの飛びを検出する", async () => {
        const issues = await proofreadWikitext(
            withCategory("== 概要 ==\n本文である。\n==== 細目 ====\n本文である。")
        );
        expect(rulesOf(issues)).toContain("heading-jump");
    });

    it("空の節を検出する", async () => {
        const issues = await proofreadWikitext(
            withCategory("== 概要 ==\n== 歴史 ==\n本文である。")
        );
        const empty = issues.filter((issue) => issue.rule === "empty-section");
        expect(empty).toHaveLength(1);
        expect(empty[0].message).toContain("概要");
    });

    it("問題のない記事では何も出さない", async () => {
        const issues = await proofreadWikitext(
            "'''テスト'''とは、試すことである。\n\n== 概要 ==\n昔からあるものである。\n\n[[Category:テスト]]"
        );
        expect(issues).toHaveLength(0);
    });
});

describe("extractProse", () => {
    it("テンプレート・見出し・リンク記法を除去して地の文を残す", () => {
        const prose = extractProse(
            "{{テンプレ|引数}}\n== 見出し ==\n'''太字'''の[[記事|リンク]]がある。\n[[Category:ネタ]]"
        );
        expect(prose).toBe("太字のリンクがある。");
    });

    it("入れ子テンプレートも除去する", () => {
        const prose = extractProse("{{外側|{{内側}}}}本文である。");
        expect(prose).toBe("本文である。");
    });

    it("ref タグを除去する", () => {
        const prose = extractProse("事実である<ref>出典</ref>。");
        expect(prose).toBe("事実である。");
    });

    it("キャプションに入れ子リンクを含むファイルリンクを残骸なく除去する", () => {
        const prose = extractProse(
            "[[File:x.jpg|thumb|説明[[イカ]]の話]]あとがきである。"
        );
        expect(prose).toBe("あとがきである。");
    });

    it("記事リンクの表示テキスト内の入れ子リンクも平坦化する", () => {
        const prose = extractProse("[[記事|とある[[別記事|表示]]の話]]である。");
        expect(prose).toBe("とある表示の話である。");
    });

    it("カテゴリ・言語間リンクは行ごと消える", () => {
        const prose = extractProse("本文である。\n[[Category:ネタ]]\n[[en:Squid]]");
        expect(prose).toBe("本文である。");
    });
});
