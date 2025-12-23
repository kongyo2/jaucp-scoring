import { ResultAsync, errAsync, okAsync } from "neverthrow";
import { OpenRouter } from "@openrouter/sdk";
import { ScoringResultSchema, type ScoringResult } from "./schemas";

/**
 * 採点ツールプロンプト（完全版）
 * Portal:AI活用/公開プロンプト置き場/採点ツールプロンプト_(ノイマン) より
 */
const SCORING_PROMPT = `あなたは削除主義者気質の辛口レビュアーです。入力された記事 の記事を以下の規定で厳密に採点してください。

== 分類規定 ==
1) 秀逸な記事: [[Category:秀逸な記事]] または 秀逸/Featured article テンプレがあれば無条件で該当し、他の分類とANDで併記可
2) 自己言及的なページ: 視覚的なインパクト重視で、トピックの記事上の再現に重きを置いている。このため、css操作は、その視覚的インパクトに結び付くかで評価すべきであり、単純なフォーマット上の減点対象にはしない。そのことを踏まえた、想定される視覚的効果を加味して採点すること。画像の場合は、命名規則が適切である前提で、画像の内容を推測して、そのインパクトも加味すること。
3) 知的ユーモア・Wikipediaパロディ系: 例えばおバカ系や下ネタ系とは、原則として両立しない。ただしウィットやエスプリを読み取れる場合は別。
4) 下ネタ系: 性的・エロ・排泄を連想させる系統。
5) おバカ系
6) 脱力系
7) 不謹慎系: 不謹慎さそのものにネタ要素があるので、アメリカ西海岸的なポリコレの発想は忘れて、日本国内の文化的・思想的な成熟状況を加味してどれくらいウケるか考えること。
8) コンテクスト系: 他の記事と対になる、他の記事も含めたエコシステムを構築しているなど。その場合、その対になるページのコンテンツもMCPで取得したうえで評価すべし。
9) [[プロンプト・インジェクション]]: では、通常の応答形式でOK。
10) その他
11) ニュース系: ここからは、記事の名前空間も考慮すること。
12) 辞書系
13) 替え歌系
14) 議論系
15) ユーザーページ系

== 評価基準 (100点満点) ==
・humor(0-50): 系統に応じたユーモアの強さ。日本的でない（枕詞やダジャレ、「これじゃない」系などの同音異義語を駆使した言葉遊びや、落語や漫才のような伝統芸から、2chやTwitterにおけるネットミーム、日本語ユーモアウィキのローカル文化まで幅広く考慮し、そのどれかに合致するか、安易に減点する前によく吟味すること）場合は減点
・structure(0-20): 記事を一貫して貫く着眼点があるか
・format(0-10): 節構成やテンプレートが適切か
・language(0-10): 読みやすさ、段落・箇条書きの適切さ
・completeness(0-10): 完結性と加筆余地のバランス

秀逸/自己言及の場合は注記の通り特別考慮。また、それ以外の記事でも、分類に即して評価すること。例えば、下ネタ系を知的ユーモアとして採点するのはNGで、下ネタなら下ネタとして採点すること。
60点未満なら "advice" に改善点(NRV/ICU/fix観点)を日本語でまとめること。

== 出力フォーマット ==
以下のJSONだけを完全な形で返すこと。採点は、全項目1点単位で行うこと絶対に余計なテキストを付けない:
{
  "category": "分類名(複数可、\\",\\"区切り)",
  "total": 0-100,
  "details": { "humor":0-50, "structure":0-20, "format":0-10, "language":0-10, "completeness":0-10 },
  "reasons": { "humor":"理由", "structure":"理由", "format":"理由", "language":"理由", "completeness":"理由" },
  "advice": "合計60点未満か、humorが30点未満の時は必須。その他は省略可だが、必要であれば示してもよい。"
}`;

/**
 * OpenRouter SDKインスタンスを作成
 */
function createOpenRouterClient(apiKey: string): OpenRouter {
    return new OpenRouter({
        apiKey,
    });
}

/**
 * 記事を採点する
 * OpenRouter SDK の callModel を使用
 */
export function scoreArticle(
    apiKey: string,
    model: string,
    articleContent: string
): ResultAsync<ScoringResult, Error> {
    const openrouter = createOpenRouterClient(apiKey);

    return ResultAsync.fromPromise(
        (async () => {
            const result = openrouter.callModel({
                model,
                instructions: SCORING_PROMPT,
                input: articleContent,
                temperature: 0.3,
                text: {
                    format: {
                        type: "json_object",
                    },
                },
            });

            const text = await result.getText();
            return text;
        })(),
        (error) => new Error(`API 呼び出しエラー: ${error}`)
    ).andThen((content) => {
        if (!content) {
            return errAsync(new Error("空のレスポンス"));
        }

        // JSONをパース
        let jsonContent: unknown;
        try {
            // コードブロックで囲まれている場合の対応
            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
            const rawJson = jsonMatch ? jsonMatch[1] : content;
            jsonContent = JSON.parse(rawJson.trim());
        } catch (e) {
            return errAsync(new Error(`JSON パースエラー: ${e}\n\nレスポンス: ${content}`));
        }

        // スキーマ検証
        const parsed = ScoringResultSchema.safeParse(jsonContent);
        if (!parsed.success) {
            return errAsync(
                new Error(`スキーマ検証エラー: ${parsed.error.message}`)
            );
        }

        return okAsync(parsed.data);
    });
}

export { SCORING_PROMPT, createOpenRouterClient };
