import { on, emit, type TabId } from "./state";

/**
 * タブ切り替えの初期化
 */
export function initTabs(): void {
    const tabButtons = document.querySelectorAll<HTMLButtonElement>(".tab-btn");
    const tabContents = document.querySelectorAll<HTMLElement>(".tab-content");

    function activate(tabId: TabId): void {
        for (const button of tabButtons) {
            button.classList.toggle("active", button.dataset.tab === tabId);
        }
        for (const content of tabContents) {
            content.classList.toggle("hidden", content.id !== `tab-${tabId}`);
        }
    }

    for (const button of tabButtons) {
        button.addEventListener("click", () => {
            const tabId = button.dataset.tab as TabId | undefined;
            if (tabId) {
                emit("switch-tab", { tab: tabId });
            }
        });
    }

    on("switch-tab", ({ tab }) => activate(tab));
}
