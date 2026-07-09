import { $, showToast } from "../lib/dom";
import { getPresetPromptText, PROMPT_PRESETS } from "../lib/prompts";
import type { PromptPreset, ProviderType, Settings } from "../lib/schemas";
import { saveSettings } from "../lib/settings";
import { DEFAULT_TEMPERATURE } from "../lib/llm";
import { appState, emit } from "./state";

/**
 * 設定ダイアログの初期化
 */
export function initSettingsDialog(): void {
    const settingsBtn = $<HTMLButtonElement>("settings-btn");
    const dialog = $<HTMLDialogElement>("settings-dialog");
    const closeBtn = $<HTMLButtonElement>("close-settings");
    const cancelBtn = $<HTMLButtonElement>("cancel-settings");
    const form = $<HTMLFormElement>("settings-form");
    const providerSelect = $<HTMLSelectElement>("provider-select");
    const keyInputs: Record<ProviderType, HTMLInputElement> = {
        openrouter: $<HTMLInputElement>("openrouter-key-input"),
        gemini: $<HTMLInputElement>("gemini-key-input"),
        cerebras: $<HTMLInputElement>("cerebras-key-input"),
    };
    const keyGroups: Record<ProviderType, HTMLDivElement> = {
        openrouter: $<HTMLDivElement>("openrouter-key-group"),
        gemini: $<HTMLDivElement>("gemini-key-group"),
        cerebras: $<HTMLDivElement>("cerebras-key-group"),
    };
    const temperatureSlider = $<HTMLInputElement>("temperature-slider");
    const temperatureValue = $<HTMLSpanElement>("temperature-value");
    const presetSelect = $<HTMLSelectElement>("prompt-preset-select");
    const presetDescription = $<HTMLParagraphElement>("prompt-preset-description");
    const promptTextarea = $<HTMLTextAreaElement>("prompt-textarea");

    // プリセット選択肢を動的生成
    presetSelect.innerHTML = "";
    for (const preset of PROMPT_PRESETS) {
        const option = document.createElement("option");
        option.value = preset.id;
        option.textContent = preset.label;
        presetSelect.appendChild(option);
    }

    function currentPreset(): PromptPreset {
        return presetSelect.value as PromptPreset;
    }

    function updatePresetUI(): void {
        const preset = PROMPT_PRESETS.find((p) => p.id === currentPreset());
        presetDescription.textContent = preset?.description ?? "";
        // プリセット中も編集可能にしておき、編集した瞬間にカスタム扱いへ切り替える
        promptTextarea.classList.toggle("preset-view", currentPreset() !== "custom");
    }

    function toggleProviderFields(): void {
        const provider = providerSelect.value as ProviderType;
        for (const [key, group] of Object.entries(keyGroups)) {
            group.classList.toggle("hidden", key !== provider);
        }
    }

    settingsBtn.addEventListener("click", () => {
        const { settings } = appState;
        providerSelect.value = settings.provider;
        keyInputs.openrouter.value = settings.openrouterApiKey ?? "";
        keyInputs.gemini.value = settings.geminiApiKey ?? "";
        keyInputs.cerebras.value = settings.cerebrasApiKey ?? "";
        const temperature = settings.temperature ?? DEFAULT_TEMPERATURE;
        temperatureSlider.value = String(temperature);
        temperatureValue.textContent = temperature.toFixed(1);
        presetSelect.value = settings.promptPreset ?? "default";
        promptTextarea.value = getPresetPromptText(settings.promptPreset ?? "default", settings);
        toggleProviderFields();
        updatePresetUI();
        dialog.showModal();
    });

    closeBtn.addEventListener("click", () => dialog.close());
    cancelBtn.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
    });

    providerSelect.addEventListener("change", toggleProviderFields);

    temperatureSlider.addEventListener("input", () => {
        const value = Number.parseFloat(temperatureSlider.value);
        temperatureValue.textContent = (Number.isNaN(value) ? DEFAULT_TEMPERATURE : value).toFixed(1);
    });

    presetSelect.addEventListener("change", () => {
        promptTextarea.value = getPresetPromptText(currentPreset(), appState.settings);
        updatePresetUI();
    });

    // プリセット本文を編集し始めたら自動的にカスタムへ切り替え
    promptTextarea.addEventListener("input", () => {
        if (currentPreset() !== "custom") {
            presetSelect.value = "custom";
            updatePresetUI();
        }
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const temperature = Number.parseFloat(temperatureSlider.value);
        const preset = currentPreset();
        // 空文字は saveSettings 側で「キーの削除」として扱われる（クリアの永続化）
        const apiKeys = {
            openrouterApiKey: keyInputs.openrouter.value.trim(),
            geminiApiKey: keyInputs.gemini.value.trim(),
            cerebrasApiKey: keyInputs.cerebras.value.trim(),
        };
        const newSettings: Partial<Settings> = {
            provider: providerSelect.value as ProviderType,
            ...apiKeys,
            temperature: Number.isNaN(temperature) ? DEFAULT_TEMPERATURE : temperature,
            promptPreset: preset,
            customPrompt:
                preset === "custom" ? promptTextarea.value : appState.settings.customPrompt,
        };

        const result = await saveSettings(newSettings);
        result.match(
            () => {
                appState.settings = {
                    ...appState.settings,
                    ...newSettings,
                    // メモリ上は空文字ではなく未設定として保持する
                    openrouterApiKey: apiKeys.openrouterApiKey || undefined,
                    geminiApiKey: apiKeys.geminiApiKey || undefined,
                    cerebrasApiKey: apiKeys.cerebrasApiKey || undefined,
                };
                emit("settings-changed", {});
                showToast("設定を保存しました", "success");
            },
            (error) => showToast(`設定保存エラー: ${error.message}`, "error")
        );
        dialog.close();
    });
}
