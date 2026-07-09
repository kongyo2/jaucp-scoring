import { $, el, copyToClipboard, openExternal, showToast } from "../lib/dom";
import { attachAutocomplete } from "../lib/autocomplete";
import {
    articleUrl,
    checkPageExists,
    fetchSiteStats,
    prefixSearchTitles,
} from "../lib/ucp-api";
import {
    checkWikipediaEn,
    checkWikipediaJa,
    generateTemplates,
    searchWikipediaTitles,
    type WikipediaCheckResult,
} from "../lib/wikipedia";
import { emit, on } from "./state";
import { setButtonLoading } from "./scoring";

/**
 * 記事調査タブの初期化
 * アンサイクロペディア・Wikipedia(ja/en) の存在をまとめて調べ、
 * {{ウィキペディア}} 系テンプレートを生成する。
 */
export function initLookupTab(): void {
    const titleInput = $<HTMLInputElement>("lookup-title-input");
    const lookupBtn = $<HTMLButtonElement>("lookup-btn");
    const resultBox = $<HTMLDivElement>("lookup-result");
    const statusList = $<HTMLDivElement>("lookup-status-list");
    const templatesBox = $<HTMLDivElement>("lookup-templates");
    const templateList = $<HTMLDivElement>("lookup-template-list");
    const statsBox = $<HTMLDivElement>("site-stats");

    let statsLoaded = false;

    // アンサイクロペディアとWikipedia(ja)の両方から補完候補を出す
    attachAutocomplete(titleInput, {
        fetcher: async (query, signal) => {
            const [ucp, wp] = await Promise.allSettled([
                prefixSearchTitles(query, 5, signal),
                searchWikipediaTitles(query, "ja", 5, signal),
            ]);
            const merged: string[] = [];
            const seen = new Set<string>();
            for (const settled of [ucp, wp]) {
                if (settled.status !== "fulfilled") continue;
                for (const title of settled.value) {
                    if (!seen.has(title)) {
                        seen.add(title);
                        merged.push(title);
                    }
                }
            }
            return merged;
        },
    });
    titleInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.isComposing && !event.defaultPrevented) {
            event.preventDefault();
            void runLookup(titleInput.value);
        }
    });

    lookupBtn.addEventListener("click", () => void runLookup(titleInput.value));

    on("lookup-title", ({ title }) => {
        emit("switch-tab", { tab: "lookup" });
        titleInput.value = title;
        void runLookup(title);
    });

    // タブが最初に表示されたときにサイト統計を読み込む
    on("switch-tab", ({ tab }) => {
        if (tab === "lookup" && !statsLoaded) {
            statsLoaded = true;
            void loadSiteStats();
        }
    });

    async function loadSiteStats(): Promise<void> {
        const result = await fetchSiteStats();
        result.match(
            (stats) => {
                statsBox.innerHTML = "";
                const entries: Array<[string, number | undefined]> = [
                    ["記事数", stats.articles],
                    ["総ページ数", stats.pages],
                    ["総編集回数", stats.edits],
                    ["アクティブユーザー", stats.activeusers],
                ];
                for (const [label, value] of entries) {
                    if (value === undefined) continue;
                    statsBox.appendChild(
                        el("span", { className: "summary-chip tone-neutral" }, [
                            el("span", { className: "summary-chip-label", text: label }),
                            el("span", { className: "summary-chip-count", text: value.toLocaleString() }),
                        ])
                    );
                }
                statsBox.classList.remove("hidden");
            },
            () => {
                // 統計は装飾なので失敗しても黙ってスキップ
            }
        );
    }

    async function runLookup(rawTitle: string): Promise<void> {
        const title = rawTitle.trim();
        if (!title) {
            showToast("記事タイトルを入力してください", "error");
            return;
        }

        setButtonLoading(lookupBtn, true, "調査", "調査中...");
        resultBox.classList.add("hidden");

        const [ucpResult, jaResult, enResult] = await Promise.all([
            checkPageExists(title),
            checkWikipediaJa(title),
            checkWikipediaEn(title),
        ]);

        setButtonLoading(lookupBtn, false, "調査", "調査中...");

        statusList.innerHTML = "";

        // --- アンサイクロペディア ---
        ucpResult.match(
            (status) => {
                const row = buildStatusRow(
                    "アンサイクロペディア",
                    status.exists,
                    status.exists
                        ? status.isRedirect
                            ? "存在（リダイレクト）"
                            : "存在"
                        : "存在しません（執筆チャンス！）"
                );
                if (status.exists) {
                    const openBtn = el("button", { className: "btn btn-mini", text: "開く" });
                    openBtn.addEventListener("click", () => void openExternal(articleUrl(status.title)));
                    row.appendChild(openBtn);
                    const importBtn = el("button", { className: "btn btn-mini", text: "採点へ読込" });
                    importBtn.addEventListener("click", () => {
                        emit("switch-tab", { tab: "scoring" });
                        // 採点タブのインポート欄へタイトルを渡してワンクリック取込
                        const importInput = $<HTMLInputElement>("import-title-input");
                        importInput.value = status.title;
                        $<HTMLButtonElement>("import-btn").click();
                    });
                    row.appendChild(importBtn);
                }
                statusList.appendChild(row);
            },
            (error) => {
                statusList.appendChild(buildErrorRow("アンサイクロペディア", error.message));
            }
        );

        // --- Wikipedia 日本語版 / 英語版 ---
        let jaCheck: WikipediaCheckResult | null = null;
        let enCheck: WikipediaCheckResult | null = null;

        jaResult.match(
            (r) => {
                jaCheck = r;
                statusList.appendChild(buildWikipediaRow("Wikipedia 日本語版", r));
            },
            (error) => statusList.appendChild(buildErrorRow("Wikipedia 日本語版", error.message))
        );
        enResult.match(
            (r) => {
                enCheck = r;
                statusList.appendChild(buildWikipediaRow("Wikipedia 英語版", r));
            },
            (error) => statusList.appendChild(buildErrorRow("Wikipedia 英語版", error.message))
        );

        // --- テンプレート生成（Wikipedia結果が両方とも取得失敗なら省略） ---
        templateList.innerHTML = "";
        if (jaCheck || enCheck) {
            const fallback: WikipediaCheckResult = {
                exists: false,
                isRedirect: false,
                isDisambiguation: false,
                title,
            };
            const templates = generateTemplates(jaCheck ?? fallback, enCheck ?? fallback);
            for (const template of templates) {
                const code = el("code", { className: "template-code", text: template.template });
                const copyBtn = el("button", {
                    className: "btn btn-icon copy-btn",
                    text: "📋",
                    title: "コピー",
                });
                copyBtn.addEventListener("click", async () => {
                    const ok = await copyToClipboard(template.template);
                    copyBtn.textContent = ok ? "✓" : "✗";
                    window.setTimeout(() => {
                        copyBtn.textContent = "📋";
                    }, 1000);
                });
                templateList.appendChild(
                    el("div", { className: "template-item" }, [
                        code,
                        copyBtn,
                        el("span", { className: "template-desc", text: template.description }),
                    ])
                );
            }
            templatesBox.classList.toggle("hidden", templates.length === 0);
        } else {
            templatesBox.classList.add("hidden");
        }

        resultBox.classList.remove("hidden");
    }

    function buildStatusRow(source: string, exists: boolean, statusText: string): HTMLDivElement {
        return el("div", { className: "status-row" }, [
            el("span", { className: `status-dot ${exists ? "ok" : "bad"}` }),
            el("span", { className: "status-source", text: source }),
            el("span", { className: "status-text", text: statusText }),
        ]);
    }

    function buildWikipediaRow(source: string, result: WikipediaCheckResult): HTMLDivElement {
        let statusText: string;
        if (!result.exists) {
            statusText = "存在しません";
        } else if (result.isDisambiguation) {
            statusText = "存在（曖昧さ回避ページ）";
        } else if (result.isRedirect) {
            statusText = `存在（リダイレクト → ${result.redirectTarget ?? "?"}）`;
        } else {
            statusText = "存在";
        }
        return buildStatusRow(source, result.exists, statusText);
    }

    function buildErrorRow(source: string, message: string): HTMLDivElement {
        return el("div", { className: "status-row" }, [
            el("span", { className: "status-dot warn" }),
            el("span", { className: "status-source", text: source }),
            el("span", { className: "status-text", text: `確認失敗: ${message}` }),
        ]);
    }
}
