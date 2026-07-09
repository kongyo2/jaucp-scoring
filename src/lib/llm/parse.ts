import { Result, err, ok } from "neverthrow";
import { ScoringResultSchema, formatZodError, type ScoringResult } from "../schemas";

/**
 * LLM の応答テキストから JSON 部分を取り出す。
 * - ```json フェンス / ``` フェンス
 * - 前後に余計なテキストが付いた素の JSON（最初の { から最後の } まで）
 * に対応する。
 */
export function extractJsonBlock(content: string): string {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
        return fenced[1].trim();
    }

    const trimmed = content.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        return trimmed;
    }

    const first = content.indexOf("{");
    const last = content.lastIndexOf("}");
    if (first !== -1 && last > first) {
        return content.slice(first, last + 1).trim();
    }
    return trimmed;
}

/**
 * LLM の応答テキストを採点結果へパース・検証する（全プロバイダ共通）
 */
export function parseScoringResponse(content: string): Result<ScoringResult, Error> {
    if (!content.trim()) {
        return err(new Error("LLM から空のレスポンスが返されました"));
    }

    let jsonContent: unknown;
    try {
        jsonContent = JSON.parse(extractJsonBlock(content));
    } catch (e) {
        return err(
            new Error(`JSON パースエラー: ${e}\n\nレスポンス: ${truncate(content, 500)}`)
        );
    }

    const parsed = ScoringResultSchema.safeParse(jsonContent);
    if (!parsed.success) {
        return err(new Error(`スキーマ検証エラー: ${formatZodError(parsed.error)}`));
    }
    return ok(parsed.data);
}

function truncate(text: string, max: number): string {
    return text.length <= max ? text : `${text.slice(0, max)}…`;
}
