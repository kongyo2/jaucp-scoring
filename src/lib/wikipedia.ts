import { ResultAsync } from "neverthrow";

export interface WikipediaCheckResult {
    exists: boolean;
    isRedirect: boolean;
    isDisambiguation: boolean;
    redirectTarget?: string;
    /** API が正規化した場合の正規化後タイトル */
    normalizedTitle?: string;
    title: string;
}

type WikiLang = "ja" | "en";

/**
 * Wikipedia記事の存在確認（日本語版）
 */
export function checkWikipediaJa(title: string): ResultAsync<WikipediaCheckResult, Error> {
    return checkWikipedia("ja", title);
}

/**
 * Wikipedia記事の存在確認（英語版）
 */
export function checkWikipediaEn(title: string): ResultAsync<WikipediaCheckResult, Error> {
    return checkWikipedia("en", title);
}

interface WikipediaQueryResponse {
    query?: {
        normalized?: Array<{ from: string; to: string }>;
        redirects?: Array<{ from: string; to: string }>;
        pages?: Record<
            string,
            {
                title?: string;
                missing?: string | boolean;
                pageprops?: { disambiguation?: string };
            }
        >;
    };
}

/**
 * Wikipedia記事の存在確認
 */
function checkWikipedia(lang: WikiLang, title: string): ResultAsync<WikipediaCheckResult, Error> {
    const endpoint = `https://${lang}.wikipedia.org/w/api.php`;

    return ResultAsync.fromPromise(
        (async () => {
            const params = new URLSearchParams({
                action: "query",
                titles: title,
                redirects: "1",
                prop: "pageprops",
                ppprop: "disambiguation",
                format: "json",
                origin: "*",
            });

            const response = await fetch(`${endpoint}?${params}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = (await response.json()) as WikipediaQueryResponse;
            const pages = data.query?.pages;
            if (!pages) {
                throw new Error("APIレスポンスが不正です");
            }

            const pageId = Object.keys(pages)[0];
            const page = pages[pageId];
            const normalizedTitle = data.query?.normalized?.[0]?.to;

            // 存在しない場合（pageId が -1）
            if (pageId === "-1" || page.missing !== undefined) {
                return {
                    exists: false,
                    isRedirect: false,
                    isDisambiguation: false,
                    normalizedTitle,
                    title,
                };
            }

            const isDisambiguation = page.pageprops?.disambiguation !== undefined;
            const redirects = data.query?.redirects;

            if (redirects && redirects.length > 0) {
                return {
                    exists: true,
                    isRedirect: true,
                    isDisambiguation,
                    redirectTarget: page.title,
                    normalizedTitle,
                    title,
                };
            }

            return {
                exists: true,
                isRedirect: false,
                isDisambiguation,
                normalizedTitle,
                title: page.title ?? title,
            };
        })(),
        (error) => new Error(`Wikipedia API エラー: ${error}`)
    );
}

/**
 * Wikipedia タイトル検索（入力補完用 opensearch）
 */
export function searchWikipediaTitles(
    query: string,
    lang: WikiLang = "ja",
    limit = 8,
    signal?: AbortSignal
): Promise<string[]> {
    const params = new URLSearchParams({
        action: "opensearch",
        search: query,
        limit: String(limit),
        namespace: "0",
        format: "json",
        origin: "*",
    });
    return fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`, { signal })
        .then((response) => response.json())
        .then((data: unknown) => {
            if (Array.isArray(data) && Array.isArray(data[1])) {
                return (data[1] as string[]).filter((t) => typeof t === "string");
            }
            return [];
        });
}

export interface TemplateOutput {
    name: string;
    template: string;
    description: string;
}

/**
 * {{ウィキペディア}} 系テンプレート出力を生成（該当するものだけ）
 */
export function generateTemplates(
    jaResult: WikipediaCheckResult,
    enResult: WikipediaCheckResult
): TemplateOutput[] {
    const templates: TemplateOutput[] = [];
    const jaTitle = jaResult.redirectTarget || jaResult.title;
    const enTitle = enResult.redirectTarget || enResult.title;

    if (jaResult.exists) {
        if (jaResult.isDisambiguation) {
            templates.push({
                name: "ウィキペディア曖昧さ回避",
                template: `{{ウィキペディア曖昧さ回避|${jaTitle}}}`,
                description: "曖昧さ回避ページ",
            });
        } else if (jaResult.isRedirect) {
            templates.push({
                name: "ウィキペディア",
                template: `{{ウィキペディア|${jaTitle}}}`,
                description: "日本語版Wikipedia（リダイレクト解決済み）",
            });
            templates.push({
                name: "ウィキペディア2",
                template: `{{ウィキペディア2|${jaTitle}|${jaResult.title}}}`,
                description: "記事名と表示名が異なる場合",
            });
        } else {
            templates.push({
                name: "ウィキペディア",
                template: `{{ウィキペディア|${jaTitle}}}`,
                description: "日本語版Wikipediaリンク",
            });
        }
    } else {
        templates.push({
            name: "ウィキペディア無し",
            template: `{{ウィキペディア無し}}`,
            description: "日本語版に記事なし",
        });
    }

    if (enResult.exists && !jaResult.exists) {
        templates.push({
            name: "ウィキペディア英語版",
            template: `{{ウィキペディア英語版|${enTitle}}}`,
            description: "英語版のみに存在",
        });
    }

    return templates;
}
