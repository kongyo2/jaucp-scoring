import { ResultAsync } from "neverthrow";

export interface WikipediaCheckResult {
    exists: boolean;
    isRedirect: boolean;
    isDisambiguation: boolean;
    redirectTarget?: string;
    title: string;
}

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

/**
 * Wikipedia記事の存在確認
 */
function checkWikipedia(lang: "ja" | "en", title: string): ResultAsync<WikipediaCheckResult, Error> {
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

            const data = await response.json();
            const pages = data?.query?.pages;
            const redirects = data?.query?.redirects;

            if (!pages) {
                throw new Error("APIレスポンスが不正です");
            }

            const pageId = Object.keys(pages)[0];
            const page = pages[pageId];

            // 存在しない場合（pageId が -1）
            if (pageId === "-1" || page.missing !== undefined) {
                return {
                    exists: false,
                    isRedirect: false,
                    isDisambiguation: false,
                    title: title,
                };
            }

            // 曖昧さ回避ページ判定
            const isDisambiguation = page.pageprops?.disambiguation !== undefined;

            // リダイレクトの場合
            if (redirects && redirects.length > 0) {
                return {
                    exists: true,
                    isRedirect: true,
                    isDisambiguation,
                    redirectTarget: page.title,
                    title: title,
                };
            }

            // 通常の存在
            return {
                exists: true,
                isRedirect: false,
                isDisambiguation,
                title: page.title,
            };
        })(),
        (error) => new Error(`Wikipedia API エラー: ${error}`)
    );
}

export interface TemplateOutput {
    name: string;
    template: string;
    description: string;
}

/**
 * テンプレート出力を生成（該当するものだけ）
 */
export function generateTemplates(
    jaResult: WikipediaCheckResult,
    enResult: WikipediaCheckResult,
    _originalTitle: string
): TemplateOutput[] {
    const templates: TemplateOutput[] = [];
    const jaTitle = jaResult.redirectTarget || jaResult.title;
    const enTitle = enResult.redirectTarget || enResult.title;

    if (jaResult.exists) {
        if (jaResult.isDisambiguation) {
            // 曖昧さ回避ページの場合
            templates.push({
                name: "ウィキペディア曖昧さ回避",
                template: `{{ウィキペディア曖昧さ回避|${jaTitle}}}`,
                description: "曖昧さ回避ページ",
            });
        } else if (jaResult.isRedirect) {
            // リダイレクトの場合（リダイレクト先は通常記事）
            templates.push({
                name: "ウィキペディア",
                template: `{{ウィキペディア|${jaTitle}}}`,
                description: "日本語版Wikipedia（リダイレクト解決済み）",
            });
            // ウィキペディア2は記事名と表示名が異なる場合に便利
            templates.push({
                name: "ウィキペディア2",
                template: `{{ウィキペディア2|${jaTitle}}}`,
                description: "記事名と表示名が異なる場合",
            });
        } else {
            // 通常記事の場合
            templates.push({
                name: "ウィキペディア",
                template: `{{ウィキペディア|${jaTitle}}}`,
                description: "日本語版Wikipediaリンク",
            });
        }
    } else {
        // 日本語版に存在しない場合
        templates.push({
            name: "ウィキペディア無し",
            template: `{{ウィキペディア無し}}`,
            description: "日本語版に記事なし",
        });
    }

    if (enResult.exists && !jaResult.exists) {
        // 英語版にのみ存在する場合
        templates.push({
            name: "ウィキペディア英語版",
            template: `{{ウィキペディア英語版|${enTitle}}}`,
            description: "英語版のみに存在",
        });
    }

    return templates;
}
