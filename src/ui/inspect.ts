import { $, el, copyToClipboard, showToast } from "../lib/dom";
import { checkPagesExist, type UcpPageStatus } from "../lib/ucp-api";
import { extractInternalLinks, type InternalLink } from "../lib/wikitext";
import { proofreadWikitext, type LintIssue } from "../lib/proofread";
import {
    generateLinkCandidates,
    suppressSubsumedCandidates,
    type LinkCandidate,
} from "../lib/link-suggest";
import { isTokenizerLoaded } from "../lib/morphology";
import { appState, emit } from "./state";
import { setButtonLoading } from "./scoring";

const KIND_LABELS: Record<InternalLink["kind"], string> = {
    article: "記事",
    category: "カテゴリ",
    file: "ファイル",
    interwiki: "言語間",
    project: "プロジェクト",
};

/** 存在確認にかけるリンク候補の最大数（API負荷の上限） */
const MAX_CANDIDATE_CHECKS = 80;
/** 表示するリンク候補の最大数 */
const MAX_SUGGESTIONS_SHOWN = 30;

/**
 * 記事検査タブの初期化
 * 1) 形態素解析ベースの日本語校正（wakame 移植）
 * 2) 内部リンクの存在一括確認（赤リンク検出）
 * 3) リンク候補の提案（内部リンク整備ツール移植）
 */
export function initInspectTab(): void {
    const input = $<HTMLTextAreaElement>("links-input");
    const fromScoringBtn = $<HTMLButtonElement>("links-from-scoring");
    const checkBtn = $<HTMLButtonElement>("links-check-btn");
    const progress = $<HTMLSpanElement>("links-progress");

    const proofreadBox = $<HTMLDivElement>("proofread-result");
    const proofreadSummary = $<HTMLDivElement>("proofread-summary");
    const proofreadList = $<HTMLDivElement>("proofread-list");

    const linksBox = $<HTMLDivElement>("links-result");
    const linksSummary = $<HTMLDivElement>("links-summary");
    const linksLists = $<HTMLDivElement>("links-lists");

    const suggestBox = $<HTMLDivElement>("suggest-result");
    const suggestSummary = $<HTMLDivElement>("suggest-summary");
    const suggestList = $<HTMLDivElement>("suggest-list");

    let running = false;

    fromScoringBtn.addEventListener("click", () => {
        const articleInput = $<HTMLTextAreaElement>("article-input");
        if (!articleInput.value.trim()) {
            showToast("採点タブに本文がありません", "error");
            return;
        }
        input.value = articleInput.value;
        showToast("採点タブの本文を取り込みました", "success");
    });

    checkBtn.addEventListener("click", () => void runInspection());

    function setProgress(message: string | null): void {
        if (message === null) {
            progress.classList.add("hidden");
        } else {
            progress.textContent = message;
            progress.classList.remove("hidden");
        }
    }

    async function runInspection(): Promise<void> {
        if (running) return;
        const wikitext = input.value;
        if (!wikitext.trim()) {
            showToast("検査するウィキテキストを入力してください", "error");
            return;
        }

        running = true;
        setButtonLoading(checkBtn, true, "検査する", "検査中...");

        try {
            // --- 1) 校正（ローカル・形態素解析） -----------------------------
            if (!isTokenizerLoaded()) {
                setProgress("形態素解析辞書を読み込み中...（初回のみ）");
            }
            try {
                const issues = await proofreadWikitext(wikitext);
                renderProofread(issues);
            } catch (e) {
                proofreadBox.classList.add("hidden");
                showToast(
                    `校正エラー: ${e instanceof Error ? e.message : String(e)}`,
                    "error"
                );
            }

            // --- 2) 内部リンクの存在確認 ------------------------------------
            const links = extractInternalLinks(wikitext);
            const articleLinks = links.filter((link) => link.kind === "article");
            const otherLinks = links.filter((link) => link.kind !== "article");

            let statusMap = new Map<string, UcpPageStatus>();
            if (links.length > 0) {
                const statusResult = await checkPagesExist(
                    articleLinks.map((link) => link.target),
                    (checked, total) => setProgress(`リンク存在確認中... ${checked}/${total}`)
                );
                statusResult.match(
                    (map) => {
                        statusMap = map;
                        renderLinkResults(articleLinks, otherLinks, map);
                    },
                    (error) => {
                        linksBox.classList.add("hidden");
                        showToast(`リンク存在確認エラー: ${error.message}`, "error");
                    }
                );
            } else {
                renderLinkResults([], otherLinks, statusMap);
            }

            // --- 3) リンク候補の提案 -----------------------------------------
            setProgress("リンク候補を抽出中...");
            try {
                const exclude = appState.articleTitle ? [appState.articleTitle] : [];
                const candidates = await generateLinkCandidates(wikitext, exclude);
                const toCheck = candidates.slice(0, MAX_CANDIDATE_CHECKS);

                if (toCheck.length === 0) {
                    renderSuggestions([]);
                } else {
                    const existResult = await checkPagesExist(
                        toCheck.map((candidate) => candidate.title),
                        (checked, total) => setProgress(`リンク候補の実在確認中... ${checked}/${total}`)
                    );
                    existResult.match(
                        (existMap) => {
                            const existing = toCheck.filter(
                                (candidate) => existMap.get(candidate.title)?.exists
                            );
                            renderSuggestions(
                                suppressSubsumedCandidates(existing).slice(0, MAX_SUGGESTIONS_SHOWN)
                            );
                        },
                        (error) => {
                            suggestBox.classList.add("hidden");
                            showToast(`リンク候補の確認エラー: ${error.message}`, "error");
                        }
                    );
                }
            } catch (e) {
                suggestBox.classList.add("hidden");
                showToast(
                    `リンク候補エラー: ${e instanceof Error ? e.message : String(e)}`,
                    "error"
                );
            }
        } finally {
            setProgress(null);
            setButtonLoading(checkBtn, false, "検査する", "検査中...");
            running = false;
        }
    }

    // ------------------------------------------------------------------
    // 校正結果の描画
    // ------------------------------------------------------------------

    function renderProofread(issues: LintIssue[]): void {
        proofreadSummary.innerHTML = "";
        proofreadList.innerHTML = "";

        const warnings = issues.filter((issue) => issue.severity === "warning");
        const infos = issues.filter((issue) => issue.severity === "info");

        const chips: Array<[string, number, string]> = [
            ["警告", warnings.length, warnings.length > 0 ? "bad" : "ok"],
            ["情報", infos.length, "neutral"],
        ];
        for (const [label, count, tone] of chips) {
            proofreadSummary.appendChild(
                el("span", { className: `summary-chip tone-${tone}` }, [
                    el("span", { className: "summary-chip-label", text: label }),
                    el("span", { className: "summary-chip-count", text: String(count) }),
                ])
            );
        }

        if (issues.length === 0) {
            proofreadList.appendChild(
                el("p", {
                    className: "section-description",
                    text: "指摘事項はありません。良い文章です！",
                })
            );
        } else {
            // ルールごとにまとめる
            const byRule = new Map<string, LintIssue[]>();
            for (const issue of issues) {
                const list = byRule.get(issue.rule) ?? [];
                list.push(issue);
                byRule.set(issue.rule, list);
            }

            for (const [, ruleIssues] of byRule) {
                const first = ruleIssues[0];
                const group = el("details", {
                    className: `link-group tone-${first.severity === "warning" ? "warn" : "neutral"}`,
                });
                if (first.severity === "warning") group.setAttribute("open", "");
                group.appendChild(
                    el("summary", {}, [
                        el("span", { text: first.label }),
                        el("span", { className: "link-group-count", text: String(ruleIssues.length) }),
                    ])
                );
                const list = el("ul", { className: "link-list" });
                for (const issue of ruleIssues) {
                    const item = el("li", { className: "lint-item" }, [
                        el("p", { className: "lint-message", text: issue.message }),
                    ]);
                    if (issue.excerpt) {
                        item.appendChild(el("p", { className: "lint-excerpt", text: issue.excerpt }));
                    }
                    list.appendChild(item);
                }
                group.appendChild(list);
                proofreadList.appendChild(group);
            }
        }

        proofreadBox.classList.remove("hidden");
    }

    // ------------------------------------------------------------------
    // リンク検査結果の描画
    // ------------------------------------------------------------------

    function renderLinkResults(
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

        linksSummary.innerHTML = "";
        const chips: Array<[string, number, string]> = [
            ["記事リンク", articleLinks.length, "neutral"],
            ["存在", existing.length, "ok"],
            ["リダイレクト", redirects.length, "warn"],
            ["赤リンク", missing.length, "bad"],
            ["その他", otherLinks.length, "neutral"],
        ];
        for (const [label, count, tone] of chips) {
            linksSummary.appendChild(
                el("span", { className: `summary-chip tone-${tone}` }, [
                    el("span", { className: "summary-chip-label", text: label }),
                    el("span", { className: "summary-chip-count", text: String(count) }),
                ])
            );
        }

        linksLists.innerHTML = "";
        if (articleLinks.length === 0 && otherLinks.length === 0) {
            linksLists.appendChild(
                el("p", { className: "section-description", text: "内部リンク（[[...]]）が見つかりませんでした。" })
            );
        }
        if (missing.length > 0) {
            linksLists.appendChild(
                buildLinkGroup("赤リンク（存在しない記事）", missing, statusMap, {
                    tone: "bad",
                    open: true,
                    withActions: true,
                })
            );
        }
        if (redirects.length > 0) {
            linksLists.appendChild(
                buildLinkGroup("リダイレクト経由のリンク", redirects, statusMap, {
                    tone: "warn",
                    open: true,
                    withActions: true,
                })
            );
        }
        if (existing.length > 0) {
            linksLists.appendChild(
                buildLinkGroup("存在する記事リンク", existing, statusMap, {
                    tone: "ok",
                    open: false,
                    withActions: false,
                })
            );
        }
        if (otherLinks.length > 0) {
            linksLists.appendChild(buildOtherGroup(otherLinks));
        }

        linksBox.classList.remove("hidden");
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
            item.appendChild(el("span", { className: "link-title", text: link.target }));
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

    // ------------------------------------------------------------------
    // リンク候補の描画
    // ------------------------------------------------------------------

    function renderSuggestions(suggestions: LinkCandidate[]): void {
        suggestSummary.innerHTML = "";
        suggestList.innerHTML = "";

        suggestSummary.appendChild(
            el("span", { className: `summary-chip tone-${suggestions.length > 0 ? "ok" : "neutral"}` }, [
                el("span", { className: "summary-chip-label", text: "リンクにできる語" }),
                el("span", { className: "summary-chip-count", text: String(suggestions.length) }),
            ])
        );

        if (suggestions.length === 0) {
            suggestList.appendChild(
                el("p", {
                    className: "section-description",
                    text: "新たにリンクにできそうな語は見つかりませんでした。",
                })
            );
        } else {
            const list = el("ul", { className: "link-list" });
            for (const suggestion of suggestions) {
                const wikilink = `[[${suggestion.title}]]`;
                const item = el("li", { className: "link-item" }, [
                    el("code", { className: "template-code", text: wikilink }),
                    ...(suggestion.count > 1
                        ? [el("span", { className: "link-count", text: `×${suggestion.count}` })]
                        : []),
                ]);

                const copyBtn = el("button", { className: "btn btn-mini", text: "コピー" });
                copyBtn.addEventListener("click", async () => {
                    const ok = await copyToClipboard(wikilink);
                    showToast(ok ? `${wikilink} をコピーしました` : "コピーに失敗しました", ok ? "success" : "error");
                });
                const lookupBtn = el("button", { className: "btn btn-mini", text: "調査" });
                lookupBtn.addEventListener("click", () => {
                    emit("lookup-title", { title: suggestion.title });
                });

                const actions = el("span", { className: "link-item-actions" }, [copyBtn, lookupBtn]);
                item.appendChild(actions);
                list.appendChild(item);
            }
            suggestList.appendChild(list);
        }

        suggestBox.classList.remove("hidden");
    }
}
