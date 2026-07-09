import { $, showToast } from "../lib/dom";
import { downloadCanvasAsPng, generateOGPCanvas } from "../lib/ogp";

/**
 * OGP画像タブの初期化
 * 記事共有用の 1200x630 OGP 画像を生成・ダウンロードできる。
 */
export function initOgpTab(): void {
    const titleInput = $<HTMLInputElement>("ogp-title-input");
    const descInput = $<HTMLTextAreaElement>("ogp-desc-input");
    const imageInput = $<HTMLInputElement>("ogp-image-input");
    const imageBtn = $<HTMLButtonElement>("ogp-image-btn");
    const imageName = $<HTMLSpanElement>("ogp-image-name");
    const imageClear = $<HTMLButtonElement>("ogp-image-clear");
    const previewBtn = $<HTMLButtonElement>("ogp-preview-btn");
    const downloadBtn = $<HTMLButtonElement>("ogp-download-btn");
    const previewCanvas = $<HTMLCanvasElement>("ogp-preview-canvas");
    const previewPlaceholder = $<HTMLDivElement>("ogp-preview-placeholder");

    let selectedFile: File | null = null;
    let generatedCanvas: HTMLCanvasElement | null = null;

    imageBtn.addEventListener("click", () => imageInput.click());

    imageInput.addEventListener("change", () => {
        selectedFile = imageInput.files?.[0] ?? null;
        imageName.textContent = selectedFile?.name ?? "選択なし";
        imageClear.classList.toggle("hidden", !selectedFile);
    });

    imageClear.addEventListener("click", () => {
        selectedFile = null;
        imageInput.value = "";
        imageName.textContent = "選択なし";
        imageClear.classList.add("hidden");
    });

    previewBtn.addEventListener("click", () => void updatePreview());

    downloadBtn.addEventListener("click", () => {
        if (!generatedCanvas) return;
        const title = titleInput.value.trim() || "ogp";
        downloadCanvasAsPng(generatedCanvas, `ogp_${title.replace(/[\\/:*?"<>|\s]/g, "_")}.png`);
        showToast("PNG をダウンロードしました", "success");
    });

    async function updatePreview(): Promise<void> {
        const title = titleInput.value.trim();
        if (!title) {
            showToast("タイトルを入力してください", "error");
            return;
        }

        previewBtn.disabled = true;
        try {
            generatedCanvas = await generateOGPCanvas({
                title,
                description: descInput.value.trim(),
                imageFile: selectedFile,
            });

            const ctx = previewCanvas.getContext("2d");
            if (ctx) {
                ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
                ctx.drawImage(generatedCanvas, 0, 0, previewCanvas.width, previewCanvas.height);
            }
            previewCanvas.classList.remove("hidden");
            previewPlaceholder.classList.add("hidden");
            downloadBtn.disabled = false;
        } catch (error) {
            showToast(error instanceof Error ? error.message : String(error), "error");
        } finally {
            previewBtn.disabled = false;
        }
    }
}
