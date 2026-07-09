import { $, el, formatRelativeTime, openExternal, showToast } from "../lib/dom";
import {
    articleUrl,
    fetchArticleWikitext,
    fetchRecentChanges,
    type RecentChange,
} from "../lib/ucp-api";
import { emit, on } from "./state";
import { setButtonLoading } from "./scoring";

/**
 * 新着・変更タブの初期化
 * アンサイクロペディアの最近の変更を一覧し、新着記事をワンクリックで採点に回せる。
 */
export function initRecentTab(): void {
    const refreshBtn = $<HTMLButtonElement>("recent-refresh");
    const nsSelect = $<HTMLSelectElement>("recent-ns");
    const newOnlyCheckbox = $<HTMLInputElement>("recent-new-only");
    const list = $<HTMLDivElement>("recent-list");

    let loaded = false;
    let changes: RecentChange[] = [];
    let requestToken = 0;

    refreshBtn.addEventListener("click", () => void refresh());
    nsSelect.addEventListener("change", () => void refresh());
    newOnlyCheckbox.addEventListener("change", render);

    // タブが最初に開かれたときに自動読み込み
    on("switch-tab", ({ tab }) => {
        if (tab === "recent" && !loaded) {
            void refresh();
        }
    });

    async function refresh(): Promise<void> {
        // フィルタ連続切替時、後着の古いレスポンスが新しい結果を上書きしないようにする
        const token = ++requestToken;
        setButtonLoading(refreshBtn, true, "更新", "取得中...");
        const ns = nsSelect.value === "all" ? undefined : Number(nsSelect.value);
        const result = await fetchRecentChanges(50, ns);
        if (token !== requestToken) return;
        setButtonLoading(refreshBtn, false, "更新", "取得中...");

        result.match(
            (items) => {
                loaded = true;
                changes = items;
                render();
            },
            (error) => showToast(`最近の変更の取得エラー: ${error.message}`, "error")
        );
    }

    function render(): void {
        list.innerHTML = "";
        const filtered = newOnlyCheckbox.checked
            ? changes.filter((change) => change.type === "new")
            : changes.filter((change) => change.type === "new" || change.type === "edit");

        if (filtered.length === 0) {
            list.appendChild(
                el("p", { className: "section-description", text: "表示できる変更がありません。" })
            );
            return;
        }

        for (const change of filtered) {
            list.appendChild(buildRow(change));
        }
    }

    function buildRow(change: RecentChange): HTMLElement {
        const isNew = change.type === "new";
        const delta = (change.newlen ?? 0) - (change.oldlen ?? 0);
        const deltaText = `${delta >= 0 ? "+" : ""}${delta.toLocaleString()}`;

        const row = el("div", { className: "recent-row" });

        const badge = el("span", {
            className: `recent-badge ${isNew ? "new" : "edit"}`,
            text: isNew ? "新" : "編",
        });

        const main = el("div", { className: "recent-main" }, [
            el("span", { className: "recent-title", text: change.title }),
            el("span", {
                className: "recent-meta",
                text: `${change.user ?? "?"} ・ ${formatRelativeTime(Date.parse(change.timestamp))} ・ ${deltaText} バイト`,
            }),
        ]);
        if (change.comment) {
            main.appendChild(el("span", { className: "recent-comment", text: change.comment }));
        }

        const actions = el("div", { className: "recent-actions" });

        // 標準名前空間の記事のみ採点読込を提供
        if (change.ns === 0) {
            const importBtn = el("button", { className: "btn btn-mini", text: "採点へ読込" });
            importBtn.addEventListener("click", async () => {
                importBtn.disabled = true;
                importBtn.textContent = "取得中...";
                const result = await fetchArticleWikitext(change.title);
                importBtn.disabled = false;
                importBtn.textContent = "採点へ読込";
                result.match(
                    (article) => {
                        emit("load-article", {
                            text: article.wikitext,
                            title: article.title,
                        });
                        showToast(`「${article.title}」を読み込みました`, "success");
                    },
                    (error) => showToast(error.message, "error")
                );
            });
            actions.appendChild(importBtn);
        }

        const openBtn = el("button", { className: "btn btn-mini", text: "開く" });
        openBtn.addEventListener("click", () => void openExternal(articleUrl(change.title)));
        actions.appendChild(openBtn);

        row.appendChild(badge);
        row.appendChild(main);
        row.appendChild(actions);
        return row;
    }
}
