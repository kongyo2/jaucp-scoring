/**
 * DOM ユーティリティ
 */

/**
 * 必須要素の取得。見つからなければ即座に例外（初期化バグの早期検出）
 */
export function $<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`要素 #${id} が見つかりません`);
    }
    return element as T;
}

/**
 * HTMLエスケープ。
 * 属性値にも安全なように引用符もエスケープする
 * （旧実装の div.innerHTML 方式は引用符を通してしまうバグがあった）。
 */
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * 要素ビルダー
 */
export function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attrs: {
        className?: string;
        text?: string;
        title?: string;
        html?: never; // innerHTML 経由の組み立ては禁止
    } = {},
    children: Array<HTMLElement | string> = []
): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    if (attrs.className) element.className = attrs.className;
    if (attrs.text !== undefined) element.textContent = attrs.text;
    if (attrs.title !== undefined) element.title = attrs.title;
    for (const child of children) {
        element.append(child);
    }
    return element;
}

/**
 * クリップボードへコピー（Tauri WebView での失敗時は textarea フォールバック）
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        try {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.select();
            const ok = document.execCommand("copy");
            textarea.remove();
            return ok;
        } catch {
            return false;
        }
    }
}

/**
 * 外部リンクを開く（Tauri では opener プラグイン、ブラウザでは新規タブ）
 */
export async function openExternal(url: string): Promise<void> {
    if ("__TAURI_INTERNALS__" in window) {
        try {
            const { openUrl } = await import("@tauri-apps/plugin-opener");
            await openUrl(url);
            return;
        } catch (e) {
            console.warn("opener プラグインでの起動に失敗しました:", e);
        }
    }
    window.open(url, "_blank", "noopener,noreferrer");
}

// ---------------------------------------------------------------------------
// トースト通知
// ---------------------------------------------------------------------------

let toastContainer: HTMLDivElement | null = null;

export type ToastKind = "success" | "error" | "info";

/**
 * 画面右下にトーストを表示する
 */
export function showToast(message: string, kind: ToastKind = "info", durationMs = 2800): void {
    if (!toastContainer) {
        toastContainer = document.createElement("div");
        toastContainer.className = "toast-container";
        document.body.appendChild(toastContainer);
    }

    const toast = el("div", { className: `toast toast-${kind}`, text: message });
    toastContainer.appendChild(toast);
    // 強制リフローで transition を発火させる
    void toast.offsetHeight;
    toast.classList.add("visible");

    window.setTimeout(() => {
        toast.classList.remove("visible");
        window.setTimeout(() => toast.remove(), 300);
    }, durationMs);
}

/**
 * 相対時刻の表示（履歴・最近の変更用）
 */
export function formatRelativeTime(timestamp: number): string {
    const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSeconds < 60) return "たった今";
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}分前`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}時間前`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}日前`;
    return new Date(timestamp).toLocaleDateString("ja-JP");
}
