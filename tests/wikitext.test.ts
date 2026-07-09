import { describe, expect, it } from "vitest";
import {
    deriveTitleFromWikitext,
    extractInternalLinks,
    stripIgnoredBlocks,
} from "../src/lib/wikitext";

describe("extractInternalLinks", () => {
    it("基本的な内部リンクを抽出する", () => {
        const links = extractInternalLinks("これは[[猫]]と[[犬|いぬ]]の記事です。");
        expect(links).toHaveLength(2);
        expect(links[0]).toMatchObject({ target: "猫", display: "猫", kind: "article" });
        expect(links[1]).toMatchObject({ target: "犬", display: "いぬ", kind: "article" });
    });

    it("同じリンクの出現回数を数える", () => {
        const links = extractInternalLinks("[[猫]]と[[猫]]と[[猫|ねこ]]。");
        expect(links).toHaveLength(1);
        expect(links[0].count).toBe(3);
    });

    it("名前空間を分類する", () => {
        const links = extractInternalLinks(
            "[[Category:ネタ]] [[ファイル:Cat.jpg|thumb]] [[en:Cat]] [[利用者:誰か]] [[UnNews:何か]]"
        );
        const kinds = new Map(links.map((l) => [l.target, l.kind]));
        expect(kinds.get("Category:ネタ")).toBe("category");
        expect(kinds.get("ファイル:Cat.jpg")).toBe("file");
        expect(kinds.get("en:Cat")).toBe("interwiki");
        expect(kinds.get("利用者:誰か")).toBe("project");
        expect(kinds.get("UnNews:何か")).toBe("project");
    });

    it("アンカーとアンダースコアを正規化する", () => {
        const links = extractInternalLinks("[[記事名#節|表示]] [[記事_名]]");
        expect(links.map((l) => l.target)).toEqual(["記事名", "記事 名"]);
    });

    it("ページ内アンカーのみのリンクは無視する", () => {
        expect(extractInternalLinks("[[#冒頭へ]]")).toHaveLength(0);
    });

    it("ファイルリンクのキャプション内の入れ子リンクも抽出する", () => {
        const links = extractInternalLinks(
            "[[ファイル:Example.jpg|thumb|これは[[別記事]]への言及]]"
        );
        const targets = links.map((l) => l.target);
        expect(targets).toContain("ファイル:Example.jpg");
        expect(targets).toContain("別記事");
    });

    it("コメントと nowiki 内のリンクは無視する", () => {
        const links = extractInternalLinks(
            "<!-- [[コメント内]] -->本文の[[有効リンク]]<nowiki>[[無効]]</nowiki>"
        );
        expect(links.map((l) => l.target)).toEqual(["有効リンク"]);
    });

    it("先頭コロン付きリンクを正規化する", () => {
        const links = extractInternalLinks("[[:Category:ネタ]]");
        expect(links[0]).toMatchObject({ target: "Category:ネタ", kind: "category" });
    });

    it("リンクがない場合は空配列を返す", () => {
        expect(extractInternalLinks("プレーンテキストのみ")).toEqual([]);
    });
});

describe("stripIgnoredBlocks", () => {
    it("コメント・nowiki・pre を除去する", () => {
        const input = "A<!--x-->B<nowiki>y</nowiki>C<pre>z</pre>D";
        expect(stripIgnoredBlocks(input)).toBe("ABCD");
    });
});

describe("deriveTitleFromWikitext", () => {
    it("最初の意味のある行からタイトルを推定する", () => {
        const text = "{{テンプレート}}\n\n'''猫'''とは、[[動物|どうぶつ]]の一種である。";
        expect(deriveTitleFromWikitext(text)).toBe("猫とは、どうぶつの一種である。");
    });

    it("空のテキストではデフォルトを返す", () => {
        expect(deriveTitleFromWikitext("")).toBe("無題の記事");
    });

    it("長い行は切り詰める", () => {
        const title = deriveTitleFromWikitext("あ".repeat(100));
        expect(title.length).toBeLessThanOrEqual(41);
        expect(title.endsWith("…")).toBe(true);
    });
});
