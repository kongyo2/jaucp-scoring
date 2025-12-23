import { loadSettings, saveSettings } from "./lib/settings";
import { fetchAvailableModels, getModelDisplayName } from "./lib/models";
import { scoreArticle } from "./lib/scoring";
import type { ScoringResult } from "./lib/schemas";

// DOM Elements
const settingsBtn = document.getElementById("settings-btn") as HTMLButtonElement;
const settingsDialog = document.getElementById("settings-dialog") as HTMLDialogElement;
const closeSettingsBtn = document.getElementById("close-settings") as HTMLButtonElement;
const cancelSettingsBtn = document.getElementById("cancel-settings") as HTMLButtonElement;
const settingsForm = document.getElementById("settings-form") as HTMLFormElement;
const apiKeyInput = document.getElementById("api-key-input") as HTMLInputElement;
const modelSelect = document.getElementById("model-select") as HTMLSelectElement;
const articleInput = document.getElementById("article-input") as HTMLTextAreaElement;
const charCount = document.getElementById("char-count") as HTMLSpanElement;
const scoreBtn = document.getElementById("score-btn") as HTMLButtonElement;
const resultSection = document.getElementById("result-section") as HTMLElement;
const resultCategory = document.getElementById("result-category") as HTMLSpanElement;
const resultTotal = document.getElementById("result-total") as HTMLSpanElement;
const scoreTbody = document.getElementById("score-tbody") as HTMLTableSectionElement;
const adviceSection = document.getElementById("advice-section") as HTMLElement;
const adviceContent = document.getElementById("advice-content") as HTMLElement;
const errorSection = document.getElementById("error-section") as HTMLElement;
const errorMessage = document.getElementById("error-message") as HTMLSpanElement;

// State
let currentApiKey = "";
let currentModel = "";
let isScoring = false;

// Evaluation axis info
const EVAL_AXES = [
  { key: "humor", label: "ユーモア", max: 50 },
  { key: "structure", label: "構成一貫性", max: 20 },
  { key: "format", label: "記事フォーマット", max: 10 },
  { key: "language", label: "文章の自然さ", max: 10 },
  { key: "completeness", label: "完成度", max: 10 },
] as const;

/**
 * 初期化
 */
async function init() {
  // イベントリスナー設定
  setupEventListeners();

  // 設定を読み込む
  const settingsResult = await loadSettings();
  settingsResult.match(
    (settings) => {
      if (settings.apiKey) {
        currentApiKey = settings.apiKey;
        apiKeyInput.value = settings.apiKey;
        loadModels();
      }
      if (settings.selectedModel) {
        currentModel = settings.selectedModel;
      }
    },
    (error) => {
      console.error("設定読み込みエラー:", error);
    }
  );

  // 文字数カウント更新
  updateCharCount();
}

/**
 * イベントリスナー設定
 */
function setupEventListeners() {
  // 設定ダイアログ
  settingsBtn.addEventListener("click", () => {
    settingsDialog.showModal();
  });

  closeSettingsBtn.addEventListener("click", () => {
    settingsDialog.close();
  });

  cancelSettingsBtn.addEventListener("click", () => {
    settingsDialog.close();
  });

  settingsDialog.addEventListener("click", (e) => {
    if (e.target === settingsDialog) {
      settingsDialog.close();
    }
  });

  settingsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const newApiKey = apiKeyInput.value.trim();
    if (newApiKey !== currentApiKey) {
      currentApiKey = newApiKey;
      const result = await saveSettings({ apiKey: newApiKey });
      result.match(
        () => {
          loadModels();
        },
        (error) => {
          showError(`設定保存エラー: ${error.message}`);
        }
      );
    }
    settingsDialog.close();
  });

  // モデル選択
  modelSelect.addEventListener("change", async () => {
    currentModel = modelSelect.value;
    await saveSettings({ selectedModel: currentModel });
    updateScoreButtonState();
  });

  // 記事入力
  articleInput.addEventListener("input", () => {
    updateCharCount();
    updateScoreButtonState();
    hideError();
  });

  // 採点ボタン
  scoreBtn.addEventListener("click", () => {
    if (!isScoring) {
      performScoring();
    }
  });

  // クリアボタン
  const clearBtn = document.getElementById("clear-btn") as HTMLButtonElement;
  clearBtn.addEventListener("click", () => {
    articleInput.value = "";
    updateCharCount();
    updateScoreButtonState();
    resultSection.classList.add("hidden");
    hideError();
  });
}

/**
 * モデル一覧を読み込む
 */
async function loadModels() {
  if (!currentApiKey) {
    modelSelect.innerHTML = '<option value="">APIキーを設定してください</option>';
    modelSelect.disabled = true;
    return;
  }

  modelSelect.innerHTML = '<option value="">読み込み中...</option>';
  modelSelect.disabled = true;

  const result = await fetchAvailableModels(currentApiKey);
  result.match(
    (models) => {
      modelSelect.innerHTML = models
        .map(
          (m) =>
            `<option value="${m.id}"${m.id === currentModel ? " selected" : ""}>${getModelDisplayName(m)}</option>`
        )
        .join("");
      modelSelect.disabled = false;

      // 保存されているモデルがない場合、デフォルトを設定
      if (!currentModel && models.length > 0) {
        // GPT-4o を優先的に選択
        const defaultModel = models.find((m) => m.id.includes("gpt-4o")) || models[0];
        currentModel = defaultModel.id;
        modelSelect.value = currentModel;
        saveSettings({ selectedModel: currentModel });
      }

      updateScoreButtonState();
    },
    (error) => {
      modelSelect.innerHTML = '<option value="">モデル取得エラー</option>';
      showError(`モデル取得エラー: ${error.message}`);
    }
  );
}

/**
 * 文字数カウント更新
 */
function updateCharCount() {
  const count = articleInput.value.length;
  charCount.textContent = `${count.toLocaleString()} 文字`;
}

/**
 * 採点ボタンの状態更新
 */
function updateScoreButtonState() {
  const hasContent = articleInput.value.trim().length > 0;
  const hasModel = !!currentModel;
  const hasApiKey = !!currentApiKey;
  scoreBtn.disabled = !hasContent || !hasModel || !hasApiKey || isScoring;
}

/**
 * 採点を実行
 */
async function performScoring() {
  if (isScoring) return;

  isScoring = true;
  const btnText = scoreBtn.querySelector(".btn-text") as HTMLSpanElement;
  const btnLoader = scoreBtn.querySelector(".btn-loader") as HTMLSpanElement;

  btnText.textContent = "採点中...";
  btnLoader.classList.remove("hidden");
  scoreBtn.disabled = true;
  hideError();
  resultSection.classList.add("hidden");

  const result = await scoreArticle(currentApiKey, currentModel, articleInput.value);

  result.match(
    (scoring) => {
      displayResult(scoring);
    },
    (error) => {
      showError(error.message);
    }
  );

  isScoring = false;
  btnText.textContent = "採点する";
  btnLoader.classList.add("hidden");
  updateScoreButtonState();
}

/**
 * 結果を表示
 */
function displayResult(result: ScoringResult) {
  // カテゴリ
  resultCategory.textContent = result.category;

  // 合計点
  resultTotal.textContent = `${result.total} / 100`;
  resultTotal.className = "total-score";
  if (result.total >= 80) {
    resultTotal.classList.add("score-high");
  } else if (result.total >= 60) {
    resultTotal.classList.add("score-mid");
  } else {
    resultTotal.classList.add("score-low");
  }

  // スコアテーブル
  scoreTbody.innerHTML = EVAL_AXES.map(({ key, label, max }) => {
    const score = result.details[key as keyof typeof result.details];
    const reason = result.reasons[key as keyof typeof result.reasons];
    return `
      <tr>
        <td>${label}</td>
        <td class="score-value">${max}</td>
        <td class="score-value">${score}</td>
        <td class="reason-cell">${escapeHtml(reason)}</td>
      </tr>
    `;
  }).join("");

  // 改善点
  if (result.advice) {
    adviceContent.textContent = result.advice;
    adviceSection.classList.remove("hidden");
  } else {
    adviceSection.classList.add("hidden");
  }

  resultSection.classList.remove("hidden");
}

/**
 * エラーを表示
 */
function showError(message: string) {
  errorMessage.textContent = message;
  errorSection.classList.remove("hidden");
}

/**
 * エラーを非表示
 */
function hideError() {
  errorSection.classList.add("hidden");
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// 初期化実行
init();
