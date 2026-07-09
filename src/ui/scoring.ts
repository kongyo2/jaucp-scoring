import { $, el, copyToClipboard, showToast } from "../lib/dom";
import { fetchModels, scoreArticle } from "../lib/llm";
import { addHistory } from "../lib/history";
import { formatAsJson, formatAsWikitext } from "../lib/export";
import { attachAutocomplete } from "../lib/autocomplete";
import { fetchArticleWikitext, fetchRandomTitle, prefixSearchTitles } from "../lib/ucp-api";
import { deriveTitleFromWikitext } from "../lib/wikitext";
import { EVAL_AXES, type ProviderType, type ScoringResult } from "../lib/schemas";
import { getCurrentApiKey, saveSettings } from "../lib/settings";
import { appState, emit, on } from "./state";

const PROVIDER_LABELS: Record<ProviderType, string> = {
    openrouter: "OpenRouter",
    gemini: "Gemini",
    cerebras: "Cerebras",
};

interface DisplayContext {
    title?: string | null;
    model?: string;
    restoredFrom?: number;
}

let lastResult: ScoringResult | null = null;
let lastContext: DisplayContext = {};

/**
 * ボタンのローディング表示を切り替える共通ヘルパー
 */
export function setButtonLoading(
    button: HTMLButtonElement,
    loading: boolean,
    idleLabel: string,
    busyLabel: string
): void {
    const text = button.querySelector<HTMLSpanElement>(".btn-text");
    const loader = button.querySelector<HTMLSpanElement>(".btn-loader");
    if (text) text.textContent = loading ? busyLabel : idleLabel;
    loader?.classList.toggle("hidden", !loading);
    button.disabled = loading;
}

/**
 * 採点タブの初期化
 */
export function initScoringTab(): void {
    const providerChip = $<HTMLSpanElement>("provider-chip");
    const modelSelect = $<HTMLSelectElement>("model-select");
    const articleInput = $<HTMLTextAreaElement>("article-input");
    const charCount = $<HTMLSpanElement>("char-count");
    const scoreBtn = $<HTMLButtonElement>("score-btn");
    const clearBtn = $<HTMLButtonElement>("clear-btn");
    const importTitleInput = $<HTMLInputElement>("import-title-input");
    const importBtn = $<HTMLButtonElement>("import-btn");
    const randomBtn = $<HTMLButtonElement>("random-btn");
    const titleChip = $<HTMLSpanElement>("article-title-chip");
    const resultSection = $<HTMLElement>("result-section");
    const errorSection = $<HTMLElement>("error-section");
    const errorMessage = $<HTMLSpanElement>("error-message");

    let modelRequestToken = 0;

    function showError(message: string): void {
        errorMessage.textContent = message;
        errorSection.classList.remove("hidden");
    }

    function hideError(): void {
        errorSection.classList.add("hidden");
    }

    function updateProviderChip(): void {
        providerChip.textContent = PROVIDER_LABELS[appState.settings.provider];
        providerChip.dataset.provider = appState.settings.provider;
    }

    function updateCharCount(): void {
        const text = articleInput.value;
        const bytes = new TextEncoder().encode(text).length;
        charCount.textContent = `${text.length.toLocaleString()} 文字 / ${bytes.toLocaleString()} バイト`;
    }

    function updateScoreButtonState(): void {
        const hasContent = articleInput.value.trim().length > 0;
        const hasModel = !!appState.settings.selectedModel;
        const hasApiKey = !!getCurrentApiKey(appState.settings);
        scoreBtn.disabled = !hasContent || !hasModel || !hasApiKey || appState.isScoring;
    }

    function updateTitleChip(): void {
        if (appState.articleTitle) {
            titleChip.textContent = `対象記事: ${appState.articleTitle}`;
            titleChip.classList.remove("hidden");
        } else {
            titleChip.classList.add("hidden");
        }
    }

    function setArticle(text: string, title: string | null): void {
        articleInput.value = text;
        appState.articleTitle = title;
        updateCharCount();
        updateScoreButtonState();
        updateTitleChip();
        hideError();
    }

    async function loadModels(): Promise<void> {
        const token = ++modelRequestToken;
        const apiKey = getCurrentApiKey(appState.settings);

        if (!apiKey) {
            modelSelect.innerHTML = "";
            modelSelect.appendChild(el("option", { text: "APIキーを設定してください" }));
            modelSelect.disabled = true;
            updateScoreButtonState();
            return;
        }

        modelSelect.innerHTML = "";
        modelSelect.appendChild(el("option", { text: "読み込み中..." }));
        modelSelect.disabled = true;

        const result = await fetchModels(appState.settings);
        if (token !== modelRequestToken) return; // 古いリクエストは破棄

        result.match(
            (models) => {
                modelSelect.innerHTML = "";
                for (const model of models) {
                    const option = document.createElement("option");
                    option.value = model.id;
                    option.textContent = model.name;
                    modelSelect.appendChild(option);
                }
                modelSelect.disabled = false;

                // 保存済みモデルが現在のプロバイダに存在しない場合は先頭を選択
                const saved = appState.settings.selectedModel;
                const validSaved = saved && models.some((m) => m.id === saved);
                const selected = validSaved ? saved : models[0]?.id;
                if (selected) {
                    modelSelect.value = selected;
                    if (selected !== saved) {
                        appState.settings.selectedModel = selected;
                        void saveSettings({ selectedModel: selected });
                    }
                }
                updateScoreButtonState();
            },
            (error) => {
                modelSelect.innerHTML = "";
                modelSelect.appendChild(el("option", { text: "モデル取得エラー" }));
                showError(`モデル取得エラー: ${error.message}`);
                updateScoreButtonState();
            }
        );
    }

    async function importArticle(title: string): Promise<void> {
        if (!title.trim()) {
            showToast("記事タイトルを入力してください", "error");
            return;
        }
        setButtonLoading(importBtn, true, "読込", "取得中...");
        const result = await fetchArticleWikitext(title.trim());
        setButtonLoading(importBtn, false, "読込", "取得中...");
        result.match(
            (article) => {
                setArticle(article.wikitext, article.title);
                resultSection.classList.add("hidden");
                const note = article.redirectedFrom
                    ? `「${article.redirectedFrom}」→「${article.title}」を読み込みました`
                    : `「${article.title}」を読み込みました`;
                showToast(note, "success");
            },
            (error) => showToast(error.message, "error")
        );
    }

    async function importRandomArticle(): Promise<void> {
        setButtonLoading(randomBtn, true, "ランダム", "抽選中...");
        const result = await fetchRandomTitle().andThen((title) => fetchArticleWikitext(title));
        setButtonLoading(randomBtn, false, "ランダム", "抽選中...");
        result.match(
            (article) => {
                importTitleInput.value = article.title;
                setArticle(article.wikitext, article.title);
                resultSection.classList.add("hidden");
                showToast(`「${article.title}」を読み込みました`, "success");
            },
            (error) => showToast(error.message, "error")
        );
    }

    async function performScoring(): Promise<void> {
        if (appState.isScoring) return;

        const content = articleInput.value;
        if (!content.trim()) return;

        appState.isScoring = true;
        setButtonLoading(scoreBtn, true, "採点する", "採点中...");
        hideError();
        resultSection.classList.add("hidden");

        const result = await scoreArticle(appState.settings, content);

        appState.isScoring = false;
        setButtonLoading(scoreBtn, false, "採点する", "採点中...");
        updateScoreButtonState();

        result.match(
            (scoring) => {
                const title = appState.articleTitle ?? deriveTitleFromWikitext(content);
                displayScoringResult(scoring, {
                    title,
                    model: appState.settings.selectedModel,
                });
                void addHistory({
                    result: scoring,
                    title,
                    model: appState.settings.selectedModel,
                    provider: appState.settings.provider,
                });
            },
            (error) => showError(error.message)
        );
    }

    // --- イベント登録 -------------------------------------------------------

    modelSelect.addEventListener("change", () => {
        appState.settings.selectedModel = modelSelect.value;
        void saveSettings({ selectedModel: modelSelect.value });
        updateScoreButtonState();
    });

    articleInput.addEventListener("input", () => {
        updateCharCount();
        updateScoreButtonState();
        hideError();
    });

    scoreBtn.addEventListener("click", () => void performScoring());

    clearBtn.addEventListener("click", () => {
        setArticle("", null);
        importTitleInput.value = "";
        resultSection.classList.add("hidden");
    });

    importBtn.addEventListener("click", () => void importArticle(importTitleInput.value));
    randomBtn.addEventListener("click", () => void importRandomArticle());

    // 補完のキーハンドラを先に登録し、補完が処理した Enter（defaultPrevented）は
    // 下の取込ハンドラでは無視する
    attachAutocomplete(importTitleInput, {
        fetcher: (query, signal) => prefixSearchTitles(query, 8, signal),
    });
    importTitleInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.isComposing && !event.defaultPrevented) {
            event.preventDefault();
            void importArticle(importTitleInput.value);
        }
    });

    initResultSection();

    on("settings-changed", () => {
        updateProviderChip();
        void loadModels();
        updateScoreButtonState();
    });

    on("load-article", ({ text, title, switchTab }) => {
        setArticle(text, title);
        importTitleInput.value = title ?? "";
        resultSection.classList.add("hidden");
        if (switchTab !== false) {
            emit("switch-tab", { tab: "scoring" });
        }
    });

    // 初期表示（モデル一覧は起動時の settings-changed イベントで読み込まれる）
    updateProviderChip();
    updateCharCount();
    updateScoreButtonState();
}

/**
 * 結果セクションのエクスポートボタン等を初期化
 */
function initResultSection(): void {
    const exportWikiBtn = $<HTMLButtonElement>("export-wiki-btn");
    const exportJsonBtn = $<HTMLButtonElement>("export-json-btn");

    exportWikiBtn.addEventListener("click", async () => {
        if (!lastResult) return;
        const ok = await copyToClipboard(
            formatAsWikitext(lastResult, {
                title: lastContext.title ?? undefined,
                model: lastContext.model,
            })
        );
        showToast(ok ? "Wiki形式でコピーしました" : "コピーに失敗しました", ok ? "success" : "error");
    });

    exportJsonBtn.addEventListener("click", async () => {
        if (!lastResult) return;
        const ok = await copyToClipboard(
            formatAsJson(lastResult, {
                title: lastContext.title ?? undefined,
                model: lastContext.model,
            })
        );
        showToast(ok ? "JSONをコピーしました" : "コピーに失敗しました", ok ? "success" : "error");
    });
}

/**
 * 採点結果を表示する（履歴からの復元でも使用）
 */
export function displayScoringResult(result: ScoringResult, context: DisplayContext = {}): void {
    lastResult = result;
    lastContext = context;

    const resultSection = $<HTMLElement>("result-section");
    const resultCategory = $<HTMLSpanElement>("result-category");
    const resultTotal = $<HTMLSpanElement>("result-total");
    const restoredNote = $<HTMLSpanElement>("result-restored");
    const scoreList = $<HTMLDivElement>("score-list");
    const adviceSection = $<HTMLElement>("advice-section");
    const adviceContent = $<HTMLElement>("advice-content");

    resultCategory.textContent = result.category;

    resultTotal.textContent = `${result.total}`;
    resultTotal.className = "total-score-value";
    resultTotal.classList.add(totalScoreClass(result.total));

    if (context.restoredFrom) {
        restoredNote.textContent = `${new Date(context.restoredFrom).toLocaleString("ja-JP")} の履歴から復元`;
        restoredNote.classList.remove("hidden");
    } else {
        restoredNote.classList.add("hidden");
    }

    scoreList.innerHTML = "";
    for (const axis of EVAL_AXES) {
        const score = result.details[axis.key];
        const reason = result.reasons[axis.key];
        const ratio = Math.max(0, Math.min(1, score / axis.max));

        const fill = el("div", { className: "score-bar-fill" });
        fill.style.width = `${(ratio * 100).toFixed(1)}%`;
        fill.dataset.level = ratio >= 0.8 ? "high" : ratio >= 0.6 ? "mid" : "low";

        scoreList.appendChild(
            el("div", { className: "score-row" }, [
                el("div", { className: "score-row-header" }, [
                    el("span", { className: "score-label", text: axis.label }),
                    el("span", { className: "score-num", text: `${score} / ${axis.max}` }),
                ]),
                el("div", { className: "score-bar-track" }, [fill]),
                el("p", { className: "score-reason", text: reason }),
            ])
        );
    }

    if (result.advice) {
        adviceContent.textContent = result.advice;
        adviceSection.classList.remove("hidden");
    } else {
        adviceSection.classList.add("hidden");
    }

    resultSection.classList.remove("hidden");
    resultSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/**
 * 合計点のスコア帯クラス（80+: high / 60+: mid / それ未満: low）
 */
export function totalScoreClass(total: number): string {
    return total >= 80 ? "score-high" : total >= 60 ? "score-mid" : "score-low";
}
