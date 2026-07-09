/**
 * アンサイクロペディア記事共有用 OGP 画像ジェネレータ
 * kongyo2/ja-ucp-ogp 由来の実装（jaucp-scoring-plus フォークから吸収）
 */

export interface OGPOptions {
    title: string;
    description: string;
    imageFile?: File | null;
}

const W = 1200;
const H = 630;
const GOLD = "#c9a84c";
const TITLE_COLOR = "#f0f2f5";
const DESC_COLOR = "#8b95a5";
const URL_COLOR = "#a0aab8";
const FONT = "'Noto Sans JP', 'Meiryo', 'Yu Gothic', sans-serif";
const WIKI_BASE = "ansaikuropedia.org/wiki/";

function sanitizeForUrl(s: string): string {
    return s.replace(/[<>:"/\\|?*\s]/g, "_").substring(0, 40);
}

function wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    maxLines: number
): string[] {
    const lines: string[] = [];
    let cur = "";
    let truncated = false;

    for (const ch of text) {
        const test = cur + ch;
        if (ctx.measureText(test).width > maxWidth && cur.length > 0) {
            lines.push(cur);
            if (lines.length >= maxLines) {
                truncated = true;
                break;
            }
            cur = ch;
        } else {
            cur = test;
        }
    }

    if (!truncated && cur) {
        lines.push(cur);
    }

    if (truncated && lines.length > 0) {
        let last = lines[lines.length - 1];
        while (ctx.measureText(last + "…").width > maxWidth && last.length > 0) {
            last = last.slice(0, -1);
        }
        lines[lines.length - 1] = last + "…";
    }

    return lines;
}

function drawBackground(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = "#08080a";
    ctx.fillRect(0, 0, W, H);

    const orbs: Array<{ x: number; y: number; r: number; color: string }> = [
        { x: 900, y: 100, r: 350, color: "rgba(201,168,76,0.07)" },
        { x: 200, y: 500, r: 280, color: "rgba(100,120,200,0.05)" },
        { x: 1100, y: 550, r: 200, color: "rgba(80,180,160,0.04)" },
    ];

    for (const orb of orbs) {
        const grad = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.r);
        grad.addColorStop(0, orb.color);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    const lineGrad = ctx.createLinearGradient(0, 0, W, 0);
    lineGrad.addColorStop(0, "transparent");
    lineGrad.addColorStop(0.3, GOLD);
    lineGrad.addColorStop(0.7, GOLD);
    lineGrad.addColorStop(1, "transparent");
    ctx.fillStyle = lineGrad;
    ctx.fillRect(0, 0, W, 2);
}

function drawPanel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number
) {
    const r = 28;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.stroke();
}

function drawUrlPill(
    ctx: CanvasRenderingContext2D,
    urlText: string,
    x: number,
    y: number
) {
    ctx.font = `16px ${FONT}`;
    const urlW = ctx.measureText(urlText).width + 32;

    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.roundRect(x, y, urlW, 32, 16);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, urlW, 32, 16);
    ctx.stroke();

    ctx.fillStyle = URL_COLOR;
    ctx.fillText(urlText, x + 16, y + 21);
}

function drawWithoutImage(ctx: CanvasRenderingContext2D, options: OGPOptions) {
    const px = 64, py = 56, pw = W - 128, ph = H - 112;
    drawPanel(ctx, px, py, pw, ph);

    const textX = px + 48;
    const textMaxW = pw - 96;

    ctx.font = `bold 21px ${FONT}`;
    ctx.fillStyle = GOLD;
    ctx.fillText("アンサイクロペディア", textX, py + 70);

    ctx.font = `bold 52px ${FONT}`;
    ctx.fillStyle = TITLE_COLOR;
    const titleLines = wrapText(ctx, options.title, textMaxW, 3);
    titleLines.forEach((line, i) => {
        ctx.fillText(line, textX, py + 130 + i * 64);
    });

    const titleBottom = py + 130 + titleLines.length * 64;

    ctx.fillStyle = GOLD;
    ctx.fillRect(textX, titleBottom + 12, 40, 2);

    ctx.font = `28px ${FONT}`;
    ctx.fillStyle = DESC_COLOR;
    const descLines = wrapText(ctx, options.description, textMaxW, 4);
    descLines.forEach((line, i) => {
        ctx.fillText(line, textX, titleBottom + 52 + i * 40);
    });

    ctx.font = `16px ${FONT}`;
    const urlText = `${WIKI_BASE}${sanitizeForUrl(options.title)}`;
    const urlW = ctx.measureText(urlText).width + 32;
    const urlX = px + pw - 48 - urlW;
    drawUrlPill(ctx, urlText, urlX, py + ph - 60);
}

async function drawWithImage(ctx: CanvasRenderingContext2D, options: OGPOptions) {
    const px = 64, py = 56, pw = W - 128, ph = H - 112;
    drawPanel(ctx, px, py, pw, ph);

    const imgSize = 274;
    const imgX = px + pw - 48 - imgSize;
    const imgY = py + (ph - imgSize) / 2;

    const img = await loadImage(options.imageFile!);

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.beginPath();
    ctx.roundRect(imgX, imgY, imgSize, imgSize, 20);
    ctx.clip();

    const srcRatio = img.naturalWidth / img.naturalHeight;
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
    if (srcRatio > 1) {
        sw = img.naturalHeight;
        sx = (img.naturalWidth - sw) / 2;
    } else {
        sh = img.naturalWidth;
        sy = (img.naturalHeight - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, imgX, imgY, imgSize, imgSize);
    ctx.restore();

    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(imgX, imgY, imgSize, imgSize, 20);
    ctx.stroke();

    const textX = px + 48;
    const textMaxW = imgX - textX - 40;

    ctx.font = `bold 21px ${FONT}`;
    ctx.fillStyle = GOLD;
    ctx.fillText("アンサイクロペディア", textX, py + 70);

    ctx.font = `bold 44px ${FONT}`;
    ctx.fillStyle = TITLE_COLOR;
    const titleLines = wrapText(ctx, options.title, textMaxW, 3);
    titleLines.forEach((line, i) => {
        ctx.fillText(line, textX, py + 130 + i * 56);
    });

    const titleBottom = py + 130 + titleLines.length * 56;

    ctx.fillStyle = GOLD;
    ctx.fillRect(textX, titleBottom + 10, 40, 2);

    ctx.font = `26px ${FONT}`;
    ctx.fillStyle = DESC_COLOR;
    const descLines = wrapText(ctx, options.description, textMaxW, 4);
    descLines.forEach((line, i) => {
        ctx.fillText(line, textX, titleBottom + 46 + i * 36);
    });

    drawUrlPill(ctx, `${WIKI_BASE}${sanitizeForUrl(options.title)}`, textX, py + ph - 60);
}

function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("画像の読み込みに失敗しました"));
        };
        img.src = url;
    });
}

export async function generateOGPCanvas(options: OGPOptions): Promise<HTMLCanvasElement> {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        throw new Error("Canvas 2D コンテキストを取得できませんでした");
    }

    drawBackground(ctx);

    if (options.imageFile) {
        await drawWithImage(ctx, options);
    } else {
        drawWithoutImage(ctx, options);
    }

    return canvas;
}

export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string) {
    canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }, "image/png");
}
