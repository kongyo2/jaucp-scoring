import { $, el, showToast } from "../lib/dom";
import { checkPagesExist, type UcpPageStatus } from "../lib/ucp-api";
import { extractInternalLinks, type InternalLink } from "../lib/wikitext";
import { emit } from "./state";
import { setButtonLoading } from "./scoring";

const KIND_LABELS: Record<InternalLink["kind"], string> = {
    article: "記事",
    category: "カテゴリ",
    file: "ファイル",
    interwiki: "言語間",
    project: "プロジェクト",
};

/**
 * リンク検査タブの初期化
 * 記事中の内部リンクを抽出し、アンサイクロペディア上の存在をまとめて確認する。
 */
export function initLinksTab(): void {
    const linksInput = $<HTMLTextAreaElement>("links-input");
    const fromScoringBtn = $<HTMLButtonElement>("links-from-scoring");
    const checkBtn = $<HTMLButtonElement>("links-check-btn");
    const progress = $<HTMLSpanElement>("links-progress");
    const resultBox = $<HTMLDivElement>("links-result");
    const summaryBox = $<HTMLDivElement>("links-summary");
    const listsBox = $<HTMLDivElement>("links-lists");

    fromScoringBtn.addEventListener("click", () => {
        const articleInput = $<HTMLTextAreaElement>("article-input");
        if (!articleInput.value.trim()) {
            showToast("採点タブに本文がありません", "error");
            return;
        }
        linksInput.value = articleInput.value;
        showToast("採点タブの本文を取り込みました", "success");
    });

    checkBtn.addEventListener("click", () => void runCheck());

    async function runCheck(): Promise<void> {
        const wikitext = linksInput.value;
        if (!wikitext.trim()) {
            showToast("検査するウィキテキストを入力してください", "error");
            return;
        }

        const links = extractInternalLinks(wikitext);
        if (links.length === 0) {
            resultBox.classList.remove("hidden");
            summaryBox.innerHTML = "";
            listsBox.innerHTML = "";
            summaryBox.appendChild(
                el("p", { className: "section-description", text: "内部リンク（[[...]]）が見つかりませんでした。" })
            );
            return;
        }

        const articleLinks = links.filter((link) => link.kind === "article");
        const otherLinks = links.filter((link) => link.kind !== "article");

        setButtonLoading(checkBtn, true, "検査する", "検査中...");
        progress.textContent = "";
        progress.classList.remove("hidden");

        const statusResult = await checkPagesExist(
            articleLinks.map((link) => link.target),
            (checked, total) => {
                progress.textContent = `存在確認中... ${checked}/${total}`;
            }
        );

        setButtonLoading(checkBtn, false, "検査する", "検査中...");
        progress.classList.add("hidden");

        statusResult.match(
            (statusMap) => renderResults(articleLinks, otherLinks, statusMap),
            (error) => showToast(`存在確認エラー: ${error.message}`, "error")
        );
    }

    function renderResults(
        articleLinks: InternalLink[],
        otherLinks: InternalLink[],
        statusMap: Map<string, UcpPageStatus>
    ): void {
        const missing: InternalLink[] = [];
        const redirects: InternalLink[] = [];
        const existing: InternalLink[] = [];

        for (const link of articleLinks) {
            const status = statusMap.get(link.target);
            if (!status?.exists) {
                missing.push(link);
            } else if (status.isRedirect) {
                redirects.push(link);
            } else {
                existing.push(link);
            }
        }

        summaryBox.innerHTML = "";
        const chips: Array<[string, number, string]> = [
            ["記事リンク", articleLinks.length, "neutral"],
            ["存在", existing.length, "ok"],
            ["リダイレクト", redirects.length, "warn"],
            ["赤リンク", missing.length, "bad"],
            ["その他", otherLinks.length, "neutral"],
        ];
        for (const [label, count, tone] of chips) {
            const chip = el("span", { className: `summary-chip tone-${tone}` }, [
                el("span", { className: "summary-chip-label", text: label }),
                el("span", { className: "summary-chip-count", text: String(count) }),
            ]);
            summaryBox.appendChild(chip);
        }

        listsBox.innerHTML = "";
        if (missing.length > 0) {
            listsBox.appendChild(
                buildLinkGroup("赤リンク（存在しない記事）", missing, statusMap, {
                    tone: "bad",
                    open: true,
                    withActions: true,
                })
            );
        }
        if (redirects.length > 0) {
            listsBox.appendChild(
                buildLinkGroup("リダイレクト経由のリンク", redirects, statusMap, {
                    tone: "warn",
                    open: true,
                    withActions: true,
                })
            );
        }
        if (existing.length > 0) {
            listsBox.appendChild(
                buildLinkGroup("存在する記事リンク", existing, statusMap, {
                    tone: "ok",
                    open: false,
                    withActions: false,
                })
            );
        }
        if (otherLinks.length > 0) {
            listsBox.appendChild(buildOtherGroup(otherLinks));
        }

        resultBox.classList.remove("hidden");
    }

    function buildLinkGroup(
        title: string,
        links: InternalLink[],
        statusMap: Map<string, UcpPageStatus>,
        options: { tone: string; open: boolean; withActions: boolean }
    ): HTMLElement {
        const details = el("details", { className: `link-group tone-${options.tone}` });
        if (options.open) details.setAttribute("open", "");
        details.appendChild(
            el("summary", {}, [
                el("span", { text: title }),
                el("span", { className: "link-group-count", text: String(links.length) }),
            ])
        );

        const list = el("ul", { className: "link-list" });
        for (const link of [...links].sort((a, b) => b.count - a.count)) {
            const status = statusMap.get(link.target);
            const item = el("li", { className: "link-item" });
            const label = el("span", { className: "link-title", text: link.target });
            item.appendChild(label);
            if (link.count > 1) {
                item.appendChild(el("span", { className: "link-count", text: `×${link.count}` }));
            }
            if (status?.isRedirect) {
                item.appendChild(el("span", { className: "link-note", text: "リダイレクト" }));
            }
            if (options.withActions) {
                const lookupBtn = el("button", { className: "btn btn-mini", text: "調査" });
                lookupBtn.addEventListener("click", () => {
                    emit("lookup-title", { title: link.target });
                });
                item.appendChild(lookupBtn);
            }
            list.appendChild(item);
        }
        details.appendChild(list);
        return details;
    }

    function buildOtherGroup(links: InternalLink[]): HTMLElement {
        const details = el("details", { className: "link-group tone-neutral" });
        details.appendChild(
            el("summary", {}, [
                el("span", { text: "その他のリンク（カテゴリ・ファイル・言語間など）" }),
                el("span", { className: "link-group-count", text: String(links.length) }),
            ])
        );
        const list = el("ul", { className: "link-list" });
        for (const link of links) {
            list.appendChild(
                el("li", { className: "link-item" }, [
                    el("span", { className: "link-kind", text: KIND_LABELS[link.kind] }),
                    el("span", { className: "link-title", text: link.target }),
                    ...(link.count > 1
                        ? [el("span", { className: "link-count", text: `×${link.count}` })]
                        : []),
                ])
            );
        }
        details.appendChild(list);
        return details;
    }
}
