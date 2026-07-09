import { EVAL_AXES, type ScoringResult } from "./schemas";

export interface ExportContext {
    /** 採点対象のタイトル（分かる場合） */
    title?: string;
    model?: string;
}

/**
 * 採点結果をアンサイクロペディアのノートに貼れる Wikitext 形式へ変換する
 */
export function formatAsWikitext(result: ScoringResult, context: ExportContext = {}): string {
    const today = new Date().toLocaleDateString("ja-JP");
    const caption = context.title
        ? `[[${context.title}]] のAI採点結果（${today}時点）`
        : `AI採点結果（${today}時点）`;

    const lines: string[] = [
        `{| class="wikitable"`,
        `|+ ${caption}`,
        `! 評価軸 !! 点数 !! 理由`,
    ];

    for (const axis of EVAL_AXES) {
        lines.push(
            `|-`,
            `| ${axis.label} || ${result.details[axis.key]}/${axis.max} || ${result.reasons[axis.key]}`
        );
    }

    lines.push(`|-`, `! 合計 !! ${result.total}/100 !! ${result.category}`, `|}`);

    let wikitext = lines.join("\n");

    if (result.advice) {
        wikitext += `\n\n=== 改善アドバイス ===\n${result.advice}`;
    }
    if (context.model) {
        wikitext += `\n\n<small>採点モデル: ${context.model}</small>`;
    }

    // 署名
    wikitext += `\n\n--~~~~`;
    return wikitext;
}

/**
 * 採点結果を整形済み JSON 文字列へ変換する
 */
export function formatAsJson(result: ScoringResult, context: ExportContext = {}): string {
    return JSON.stringify(
        {
            ...(context.title ? { title: context.title } : {}),
            ...(context.model ? { model: context.model } : {}),
            scoredAt: new Date().toISOString(),
            ...result,
        },
        null,
        2
    );
}
