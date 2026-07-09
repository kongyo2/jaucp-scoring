import { $, el, formatRelativeTime, showToast } from "../lib/dom";
import { clearHistory, getHistory, removeHistoryItem } from "../lib/history";
import type { HistoryItem } from "../lib/schemas";
import { displayScoringResult, totalScoreClass } from "./scoring";
import { emit, on } from "./state";

/**
 * 履歴タブの初期化
 * 過去の採点結果を一覧・復元・削除できる。
 */
export function initHistoryTab(): void {
    const list = $<HTMLDivElement>("history-list");
    const clearBtn = $<HTMLButtonElement>("clear-history-btn");

    clearBtn.addEventListener("click", async () => {
        if (!window.confirm("すべての採点履歴を削除します。よろしいですか？")) return;
        const result = await clearHistory();
        result.match(
            () => {
                render([]);
                showToast("履歴を削除しました", "success");
            },
            (error) => showToast(error.message, "error")
        );
    });

    on("switch-tab", ({ tab }) => {
        if (tab === "history") {
            void load();
        }
    });

    async function load(): Promise<void> {
        const result = await getHistory();
        result.match(
            (items) => render(items),
            (error) => showToast(error.message, "error")
        );
    }

    function render(items: HistoryItem[]): void {
        list.innerHTML = "";

        if (items.length === 0) {
            list.appendChild(
                el("p", {
                    className: "section-description",
                    text: "採点履歴はまだありません。採点タブで記事を採点すると自動的に記録されます。",
                })
            );
            return;
        }

        for (const item of items) {
            list.appendChild(buildCard(item));
        }
    }

    function buildCard(item: HistoryItem): HTMLElement {
        const card = el("div", { className: "history-card" });

        const scoreBadge = el("span", {
            className: `history-score ${totalScoreClass(item.total)}`,
            text: String(item.total),
        });

        const main = el("div", { className: "history-main" }, [
            el("span", { className: "history-title", text: item.title }),
            el("span", {
                className: "history-meta",
                text: [
                    item.category,
                    item.model,
                    formatRelativeTime(item.timestamp),
                ]
                    .filter(Boolean)
                    .join(" ・ "),
            }),
        ]);

        const deleteBtn = el("button", {
            className: "btn btn-icon history-delete",
            text: "✕",
            title: "この履歴を削除",
        });
        deleteBtn.addEventListener("click", async (event) => {
            event.stopPropagation();
            const result = await removeHistoryItem(item.id);
            result.match(
                () => {
                    card.remove();
                    if (!list.querySelector(".history-card")) render([]);
                },
                (error) => showToast(error.message, "error")
            );
        });

        card.appendChild(scoreBadge);
        card.appendChild(main);
        card.appendChild(deleteBtn);

        card.addEventListener("click", () => {
            emit("switch-tab", { tab: "scoring" });
            displayScoringResult(item.result, {
                title: item.title,
                model: item.model,
                restoredFrom: item.timestamp,
            });
        });

        return card;
    }
}
