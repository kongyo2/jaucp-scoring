import { ResultAsync } from "neverthrow";

/**
 * 日本語版アンサイクロペディア API プロキシクライアント
 *
 * https://kongyo.f5.si/api はコミュニティに公開されている
 * MediaWiki API プロキシ（Cloudflare チャレンジ回避・CORS 対応済み）。
 * 全レスポンスは { ok: true, data } | { ok: false, error: { type, message } } 形式。
 */
export const UCP_API_BASE = "https://kongyo.f5.si/api";

/** アンサイクロペディア本体の記事URL */
export const UCP_WIKI_BASE = "https://ansaikuropedia.org/wiki/";

const REQUEST_TIMEOUT_MS = 20000;
const MAX_RETRIES = 2;
/** MediaWiki の titles パラメータ上限（非botは50） */
const TITLES_BATCH_SIZE = 40;

interface ApiEnvelope<T> {
    ok: boolean;
    data?: T;
    error?: { type?: string; message?: string };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * プロキシAPIを叩く共通処理（タイムアウト + 5xx リトライ + エンベロープ解釈）
 */
async function fetchUcpApi<T>(path: string): Promise<T> {
    let lastError: Error = new Error("リクエストが完了しませんでした");

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(`${UCP_API_BASE}${path}`, {
                signal: controller.signal,
            });

            if (!response.ok && response.status >= 500 && attempt < MAX_RETRIES) {
                lastError = new Error(`HTTP ${response.status}`);
                await sleep(300 * 2 ** attempt);
                continue;
            }

            const envelope = (await response.json()) as ApiEnvelope<T>;
            if (!envelope.ok || envelope.data === undefined) {
                throw new Error(envelope.error?.message || `API エラー (HTTP ${response.status})`);
            }
            return envelope.data;
        } catch (error) {
            const isAbort = error instanceof DOMException && error.name === "AbortError";
            lastError = isAbort
                ? new Error("アンサイクロペディアAPIへのリクエストがタイムアウトしました")
                : error instanceof Error
                    ? error
                    : new Error(String(error));
            if (attempt < MAX_RETRIES && (isAbort || error instanceof TypeError)) {
                await sleep(300 * 2 ** attempt);
                continue;
            }
            throw lastError;
        } finally {
            clearTimeout(timeoutId);
        }
    }
    throw lastError;
}

function toResult<T>(promise: Promise<T>): ResultAsync<T, Error> {
    return ResultAsync.fromPromise(promise, (error) =>
        error instanceof Error ? error : new Error(String(error))
    );
}

// ---------------------------------------------------------------------------
// タイトル検索
// ---------------------------------------------------------------------------

interface PrefixSearchData {
    query?: { prefixsearch?: Array<{ title: string; pageid?: number }> };
}

/**
 * タイトル前方一致検索（入力補完用）
 */
export function prefixSearchTitles(
    query: string,
    limit = 8,
    signal?: AbortSignal
): Promise<string[]> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    // 補完はユーザー入力に追従するため、リトライせず素の fetch + 呼び出し側の AbortSignal を使う
    return fetch(`${UCP_API_BASE}/search/prefix?${params}`, { signal })
        .then((response) => response.json() as Promise<ApiEnvelope<PrefixSearchData>>)
        .then((envelope) => {
            if (!envelope.ok) return [];
            return envelope.data?.query?.prefixsearch?.map((item) => item.title) ?? [];
        });
}

export interface FullTextSearchHit {
    title: string;
    snippet: string;
    size?: number;
    wordcount?: number;
}

interface FullTextSearchData {
    query?: {
        searchinfo?: { totalhits?: number };
        search?: Array<{ title: string; snippet?: string; size?: number; wordcount?: number }>;
    };
}

/**
 * 全文検索
 */
export function searchFullText(
    query: string,
    limit = 20
): ResultAsync<{ totalHits: number; hits: FullTextSearchHit[] }, Error> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    return toResult(
        fetchUcpApi<FullTextSearchData>(`/search?${params}`).then((data) => ({
            totalHits: data.query?.searchinfo?.totalhits ?? data.query?.search?.length ?? 0,
            hits:
                data.query?.search?.map((hit) => ({
                    title: hit.title,
                    snippet: stripHtml(hit.snippet ?? ""),
                    size: hit.size,
                    wordcount: hit.wordcount,
                })) ?? [],
        }))
    );
}

// ---------------------------------------------------------------------------
// ページ取得
// ---------------------------------------------------------------------------

interface RawPageData {
    query?: {
        pages?: Array<{
            title?: string;
            missing?: boolean;
            revisions?: Array<{ slots?: { main?: { content?: string } } }>;
        }>;
    };
}

export interface FetchedArticle {
    /** 実際に取得した記事タイトル（リダイレクト解決後） */
    title: string;
    wikitext: string;
    /** リダイレクトを辿った場合の元タイトル */
    redirectedFrom?: string;
}

const REDIRECT_PATTERN = /^#(?:REDIRECT|転送|リダイレクト)\s*\[\[([^\]|#]+)/i;

/**
 * 記事の生ウィキテキストを取得する。
 * リダイレクトページだった場合は1回だけ追跡する。
 */
export function fetchArticleWikitext(title: string): ResultAsync<FetchedArticle, Error> {
    return toResult(
        (async () => {
            const first = await fetchRawPage(title);
            const redirectMatch = first.wikitext.match(REDIRECT_PATTERN);
            if (!redirectMatch) {
                return first;
            }
            const target = redirectMatch[1].trim();
            const resolved = await fetchRawPage(target);
            return { ...resolved, redirectedFrom: first.title };
        })()
    );
}

async function fetchRawPage(title: string): Promise<FetchedArticle> {
    const data = await fetchUcpApi<RawPageData>(`/page/${encodeURIComponent(title)}/raw`);
    const page = data.query?.pages?.[0];
    if (!page || page.missing) {
        throw new Error(`記事「${title}」はアンサイクロペディアに存在しません`);
    }
    const content = page.revisions?.[0]?.slots?.main?.content;
    if (content === undefined) {
        throw new Error(`記事「${title}」の本文を取得できませんでした`);
    }
    return { title: page.title ?? title, wikitext: content };
}

// ---------------------------------------------------------------------------
// ランダム・最近の変更・サイト情報
// ---------------------------------------------------------------------------

interface RandomData {
    query?: { random?: Array<{ title: string; ns?: number }> };
}

/**
 * ランダムページのタイトルを1件取得
 */
export function fetchRandomTitle(): ResultAsync<string, Error> {
    return toResult(
        fetchUcpApi<RandomData>("/random").then((data) => {
            const title = data.query?.random?.[0]?.title;
            if (!title) {
                throw new Error("ランダムページを取得できませんでした");
            }
            return title;
        })
    );
}

export interface RecentChange {
    type: string;
    ns: number;
    title: string;
    user?: string;
    timestamp: string;
    comment?: string;
    oldlen?: number;
    newlen?: number;
}

interface RecentChangesData {
    query?: { recentchanges?: RecentChange[] };
}

/**
 * 最近の変更を取得
 */
export function fetchRecentChanges(
    limit = 50,
    ns?: number
): ResultAsync<RecentChange[], Error> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (ns !== undefined) {
        params.set("ns", String(ns));
    }
    return toResult(
        fetchUcpApi<RecentChangesData>(`/recent?${params}`).then(
            (data) => data.query?.recentchanges ?? []
        )
    );
}

export interface SiteStats {
    articles?: number;
    pages?: number;
    edits?: number;
    activeusers?: number;
    users?: number;
    sitename?: string;
}

interface SiteInfoData {
    query?: {
        general?: { sitename?: string };
        statistics?: {
            articles?: number;
            pages?: number;
            edits?: number;
            activeusers?: number;
            users?: number;
        };
    };
}

/**
 * サイト統計を取得
 */
export function fetchSiteStats(): ResultAsync<SiteStats, Error> {
    return toResult(
        fetchUcpApi<SiteInfoData>("/siteinfo").then((data) => ({
            sitename: data.query?.general?.sitename,
            ...data.query?.statistics,
        }))
    );
}

// ---------------------------------------------------------------------------
// ページ存在チェック（リンク検査・記事調査用）
// ---------------------------------------------------------------------------

export interface UcpPageStatus {
    /** 正規化後のタイトル */
    title: string;
    exists: boolean;
    isRedirect: boolean;
}

interface QueryInfoData {
    query?: {
        normalized?: Array<{ from: string; to: string }>;
        pages?: Array<{
            title: string;
            missing?: boolean;
            redirect?: boolean;
            invalid?: boolean;
        }>;
    };
}

/**
 * 複数タイトルの存在をまとめて確認する（汎用プロキシ経由の action=query）。
 * 返り値の Map のキーは「入力タイトル」（正規化前）。
 */
export function checkPagesExist(
    titles: string[],
    onProgress?: (checked: number, total: number) => void
): ResultAsync<Map<string, UcpPageStatus>, Error> {
    return toResult(
        (async () => {
            const uniqueTitles = [...new Set(titles.map((t) => t.trim()).filter(Boolean))];
            const result = new Map<string, UcpPageStatus>();
            let checked = 0;

            for (let i = 0; i < uniqueTitles.length; i += TITLES_BATCH_SIZE) {
                const batch = uniqueTitles.slice(i, i + TITLES_BATCH_SIZE);
                const params = new URLSearchParams({
                    action: "query",
                    prop: "info",
                    titles: batch.join("|"),
                });

                const data = await fetchUcpApi<QueryInfoData>(`?${params}`);

                // 正規化マップ（入力タイトル → API上のタイトル）
                const normalizedMap = new Map<string, string>();
                for (const { from, to } of data.query?.normalized ?? []) {
                    normalizedMap.set(from, to);
                }

                const statusByTitle = new Map<string, UcpPageStatus>();
                for (const page of data.query?.pages ?? []) {
                    statusByTitle.set(page.title, {
                        title: page.title,
                        exists: !page.missing && !page.invalid,
                        isRedirect: page.redirect === true,
                    });
                }

                for (const input of batch) {
                    const apiTitle = normalizedMap.get(input) ?? input;
                    const status = statusByTitle.get(apiTitle);
                    result.set(
                        input,
                        status ?? { title: apiTitle, exists: false, isRedirect: false }
                    );
                }

                checked += batch.length;
                onProgress?.(checked, uniqueTitles.length);
            }

            return result;
        })()
    );
}

/**
 * 単一タイトルの存在確認
 */
export function checkPageExists(title: string): ResultAsync<UcpPageStatus, Error> {
    return checkPagesExist([title]).map(
        (map) =>
            map.get(title.trim()) ?? { title, exists: false, isRedirect: false }
    );
}

/**
 * 記事のアンサイクロペディア上の URL を返す
 */
export function articleUrl(title: string): string {
    return `${UCP_WIKI_BASE}${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, "");
}
