import type { Settings } from "../lib/schemas";
import { DEFAULT_SETTINGS } from "../lib/settings";

export type TabId = "scoring" | "inspect" | "lookup" | "recent" | "history" | "ogp";

/**
 * アプリ全体の共有状態
 */
export const appState: {
    settings: Settings;
    /** 取込済み記事のタイトル（手入力の場合は null） */
    articleTitle: string | null;
    isScoring: boolean;
} = {
    settings: { ...DEFAULT_SETTINGS },
    articleTitle: null,
    isScoring: false,
};

/**
 * タブ間連携イベント
 */
interface AppEventMap {
    /** 記事本文を採点タブへ読み込む */
    "load-article": { text: string; title: string | null; switchTab?: boolean };
    /** 記事調査タブでタイトルを調査する */
    "lookup-title": { title: string };
    /** タブを切り替える */
    "switch-tab": { tab: TabId };
    /** 設定が保存された（プロバイダ・モデル一覧の更新契機） */
    "settings-changed": Record<string, never>;
}

const bus = new EventTarget();

export function emit<K extends keyof AppEventMap>(type: K, detail: AppEventMap[K]): void {
    bus.dispatchEvent(new CustomEvent(type, { detail }));
}

export function on<K extends keyof AppEventMap>(
    type: K,
    handler: (detail: AppEventMap[K]) => void
): void {
    bus.addEventListener(type, (event) => {
        handler((event as CustomEvent<AppEventMap[K]>).detail);
    });
}
