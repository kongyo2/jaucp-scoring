import { loadSettings } from "./lib/settings";
import { appState, emit } from "./ui/state";
import { initTabs } from "./ui/tabs";
import { initSettingsDialog } from "./ui/settings-dialog";
import { initScoringTab } from "./ui/scoring";
import { initInspectTab } from "./ui/inspect";
import { initLookupTab } from "./ui/lookup";
import { initRecentTab } from "./ui/recent";
import { initHistoryTab } from "./ui/history";
import { initOgpTab } from "./ui/ogp";

/**
 * アプリケーション初期化
 */
async function init(): Promise<void> {
    initTabs();
    initSettingsDialog();
    initScoringTab();
    initInspectTab();
    initLookupTab();
    initRecentTab();
    initHistoryTab();
    initOgpTab();

    const settingsResult = await loadSettings();
    settingsResult.match(
        (settings) => {
            appState.settings = settings;
        },
        (error) => {
            console.error("設定読み込みエラー:", error);
        }
    );

    // 設定反映（プロバイダ表示・モデル一覧の読み込み）
    emit("settings-changed", {});
}

void init();
