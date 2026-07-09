# JAUCP Scoring Tool

日本語版アンサイクロペディアの執筆支援ツールボックス。AI（LLM）による記事採点を中心に、内部リンク検査・記事調査・新着パトロール・OGP画像生成まで、執筆者とコミュニティのための機能をまとめたデスクトップアプリです。

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/kongyo2/jaucp-scoring)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/C0C51W3HQH)

## 📋 目次

- [このツールについて](#このツールについて)
- [機能](#機能)
- [インストール方法](#インストール方法)
- [使い方](#使い方)
- [開発者向け情報](#開発者向け情報)
- [ライセンス](#ライセンス)

---

## このツールについて

このツールは、日本語版アンサイクロペディアに記事を投稿する前の推敲を支援するデスクトップアプリケーションです。AI採点に加え、[コミュニティに公開されているAPIプロキシ](https://kongyo.f5.si/api) を通じてアンサイクロペディア本体と連携し、記事の取込・存在確認・新着記事の確認などができます。

### 評価項目

以下の5つの観点から、合計100点満点で採点します:

- **ユーモア** (0-50点): ジョークの面白さ、ウィットの効いた表現
- **構成一貫性** (0-20点): 記事全体を貫く着眼点の明確さ
- **記事フォーマット** (0-10点): 節構成やテンプレートの適切さ
- **文章の自然さ** (0-10点): 読みやすさ、段落・箇条書きの使い方
- **完成度** (0-10点): 記事の完結性と加筆余地のバランス

60点未満の記事には、具体的な改善提案が表示されます。

---

## 機能

### 採点タブ

- 🤖 **AI採点**: OpenRouter、Google Gemini、Cerebras を使った自動採点
- 📊 **詳細評価**: 5つの評価軸ごとに得点バー・理由を表示
- 💡 **改善提案**: 60点未満の記事には改善アドバイスを提示
- 📥 **記事取込**: 記事名を入力（入力補完つき）して既存記事のウィキテキストを直接読み込み。リダイレクトは自動解決
- 🎲 **ランダム記事**: ランダムな既存記事を読み込んで採点・レビュー
- 📋 **結果エクスポート**: ノートページに貼れる Wikitext 表（署名付き）／JSON をワンクリックでコピー
- 🎭 **採点プロンプトのプリセット**: 通常（削除主義者レビュアー）／厳格なウィキペディアン（ユーモアを裁く逆説モード）／カスタム編集

### 記事検査タブ

投稿前の最終チェックを一括で行います。

- ✍️ **日本語校正（形態素解析）**: kuromoji による本物の形態素解析で文章をチェック
  - ら抜き言葉（見れる→見られる）、逆接の「が」の重複、同じ助詞・接続詞の連続、読点過多（[wakame](https://github.com/kongyo2/wakame) のルールを移植）
  - 敬体・常体の混在、「の」の3連続、長文の検出
  - ウィキ構文: 括弧の不整合（`[[` `{{` の閉じ忘れ）、カテゴリ未設定、署名の混入、見出しレベルの飛び、空の節
- 🔗 **内部リンク検査**: 記事中の `[[内部リンク]]` を名前空間別（記事・カテゴリ・ファイル・言語間・プロジェクト）に分類
- 🔴 **赤リンク検出**: 記事リンクの存在をアンサイクロペディアAPIで一括確認し、存在しないリンク・リダイレクト経由のリンクを警告
- 💡 **リンク候補の提案**: 形態素解析で本文から名詞・固有名詞複合語を抽出し、「アンサイクロペディアに記事が存在するのにまだリンクされていない語」を提案（内部リンク整備ツールのロジックを移植）
- 🔍 そのまま「記事調査」タブへ飛んで詳細確認も可能

### 記事調査タブ

- 🌐 **三方向の存在確認**: アンサイクロペディア／Wikipedia日本語版／Wikipedia英語版での記事の存在をまとめて確認
- 🧩 **テンプレート生成**: `{{ウィキペディア}}` `{{ウィキペディア2}}` `{{ウィキペディア無し}}` などを状況に応じて自動生成
- ⌨️ **入力補完**: アンサイクロペディアとWikipediaの両方からタイトル候補を表示（IME対応）
- 📈 **サイト統計**: 記事数・総編集回数などをさりげなく表示

### 新着・変更タブ

- 🆕 **最近の変更・新着記事の一覧**: 新着パトロールのお供に
- ⚡ **ワンクリック採点**: 気になった新着記事をその場で採点タブへ読み込み

### 履歴タブ

- 🕰️ **採点履歴タイムライン**: 過去の採点結果を自動保存（最大100件）。クリックで結果を復元し、推敲前後の比較に

### OGP画像タブ

- 🖼️ **OGP画像ジェネレータ**: 記事共有用の 1200×630 画像を生成・PNGダウンロード（[ja-ucp-ogp](https://github.com/kongyo2/ja-ucp-ogp) 由来）

### 対応プロバイダ

- **OpenRouter**: 複数のAIモデルから選択可能（Claude、GPT系など）
- **Google Gemini**: Geminiシリーズのモデルを直接利用
- **Cerebras**: 超高速推論（Llama 3.3 70B など）

> 💡 本ツールのアンサイクロペディア連携は、コミュニティに公開されている MediaWiki API プロキシ `https://kongyo.f5.si/api`（Cloudflare チャレンジ回避・CORS対応済み）を利用しています。

---

## インストール方法

### 📦 簡単インストール（Windows）

1. [Releases](https://github.com/kongyo2/jaucp-scoring/releases) ページにアクセス
2. 最新版の `.msi` または `.exe` ファイルをダウンロード
3. ダウンロードしたファイルを実行してインストール

---

### 🛠️ 開発版を使う場合

開発版を自分でビルドして使いたい場合は、以下の手順に従ってください。

#### 前提ソフトウェアのインストール

以下のソフトウェアが必要です:

##### 1. Node.js（JavaScriptの実行環境）

**Windowsの場合:**

1. [Node.js公式サイト](https://nodejs.org/) にアクセス
2. 「LTS」版（推奨版）をダウンロード
3. インストーラーを実行し、すべてデフォルトのままインストール

**macOS/Linuxの場合:**

```bash
# macOS (Homebrewを使用)
brew install node

# Linux (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs
```

インストール確認:
```bash
node --version
npm --version
```

##### 2. Rust（プログラミング言語）

**Windowsの場合:**

1. [rustup公式サイト](https://rustup.rs/) にアクセス
2. 「rustup-init.exe」をダウンロードして実行
3. コマンドプロンプトが開くので、`1`を入力してEnter（デフォルトインストール）

**macOS/Linuxの場合:**

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

インストール確認:
```bash
rustc --version
cargo --version
```

##### 3. システム依存の追加ライブラリ

**Windowsの場合:**

追加作業は不要です。

**Linuxの場合:**

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.0-dev \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev

# Fedora
sudo dnf install webkit2gtk4.0-devel \
  openssl-devel \
  curl \
  wget \
  file \
  gtk3-devel \
  libappindicator-gtk3-devel \
  librsvg2-devel
```

**macOSの場合:**

追加作業は不要です（Xcodeコマンドラインツールがあれば十分）。

#### プロジェクトのビルド

```bash
# 1. リポジトリをクローン
git clone https://github.com/kongyo2/jaucp-scoring.git
cd jaucp-scoring

# 2. 依存関係をインストール
npm install

# 3. 開発モードで起動（テスト用）
npm run tauri dev

# 4. 配布用にビルド（実行ファイル作成）
npm run tauri build
```

ビルドが完了すると、`src-tauri/target/release/bundle/` にインストーラーが生成されます。

> 🌐 ブラウザ版: `npm run dev` で通常のブラウザでも動作します（設定・履歴は localStorage に保存）。

---

## 使い方

### 1. APIキーの取得

このツールを使うには、AIサービスのAPIキーが必要です。以下のいずれかを選んでください。

#### 🔹 [OpenRouter](https://openrouter.ai/)（推奨）

複数のAIモデルを1つのAPIキーで利用できるサービスです。

1. [OpenRouter](https://openrouter.ai/) にアクセス
2. 「Sign In」から新規登録（GitHubアカウントなどでログイン可能）
3. ログイン後、[API Keys](https://openrouter.ai/keys) ページに移動
4. 「Create Key」をクリックしてAPIキーを作成
5. 表示されたキー（`sk-or-...`で始まる文字列）をコピー

> **💡 無料モデル使用可能**: OpenRouterでは無料で利用できるモデルも提供されています。クレジットを追加しなくても、無料モデルを選択することで採点機能を利用できます。

**💰 料金について:**
- 従量課金制（使った分だけ支払い）
- モデルによって料金が異なる（1記事あたり数円〜数十円程度）

#### 🔹 Google Gemini

Googleの提供するAIサービスです。

1. [Google AI Studio](https://aistudio.google.com/apikey) にアクセス
2. Googleアカウントでログイン
3. 「Get API Key」→「Create API key」をクリック
4. 表示されたキー（`AIza...`で始まる文字列）をコピー

**💰 料金について:**
- 無料枠が大きく、クレジットカード登録不要（無料枠内なら）

#### 🔹 Cerebras（高速推論）

世界最速級のAI推論を提供するサービスです。

1. [Cerebras Cloud](https://cloud.cerebras.ai/) にアクセス
2. アカウントを作成してログイン
3. APIキーを作成してコピー

**💰 料金について:**
- **無料枠あり**: すべてのモデルに無料でアクセス可能
- 推奨モデル: `llama-3.3-70b`（高速かつ高品質）

### 2. ツールの設定

1. アプリを起動
2. 右上の **⚙️ 設定ボタン** をクリック
3. 設定画面で以下を入力:
   - **プロバイダ**: OpenRouter、Gemini、またはCerebrasを選択
   - **APIキー**: コピーしたAPIキーを貼り付け
   - **Temperature**: 出力のランダム度（既定 0.3）
   - **採点プロンプト**: プリセット選択、または自由に編集（編集すると自動的にカスタム扱い）
4. 「保存」をクリック

設定が完了すると、モデル一覧が自動的に読み込まれます。

### 3. 記事の採点

1. **モデルを選択**: 入力欄上のドロップダウンから使用するAIモデルを選択
2. **記事を入力**: ウィキテキストを貼り付けるか、記事名を入力して「読込」（「ランダム」で運試しも可）
3. **採点する**: 「採点する」ボタンをクリック
4. **結果を確認**: 合計点・評価軸ごとの得点バー・理由・改善点が表示されます
5. **共有**: 「Wiki表をコピー」でノートページ用の表（署名付き）をコピー

### 4. 投稿前の記事検査（校正 + リンク）

1. 「記事検査」タブで本文を貼り付け（採点タブから取込ボタンもあります）
2. 「検査する」をクリック（初回は形態素解析辞書の読み込みが走ります）
3. 文章校正の指摘（ら抜き・文体混在・カテゴリ未設定など）を確認
4. 赤リンク・リダイレクト経由リンクを確認し、必要なら「調査」で詳細を確認
5. 「リンク候補」から、記事が存在するのにリンクしていない語を `[[リンク]]` 化

### 5. 記事調査（存在確認 + テンプレート生成）

1. 「記事調査」タブで記事タイトルを入力（補完が出ます）
2. 「調査」をクリック
3. アンサイクロペディア・Wikipedia日英の存在状況と、貼り付け用テンプレートを確認

---

## 開発者向け情報

### 技術スタック

- **フロントエンド**: TypeScript, Vite（フレームワークレス）
- **バックエンド**: Tauri 2.x (Rust)
- **形態素解析**: kuromoji.js（IPADIC 辞書をアプリに同梱。ブラウザ版は初回に約6MBの辞書を読み込み）
- **検証**: Zod, neverthrow
- **テスト**: Vitest
- **スタイル**: CSS（ダーク×ゴールドのカスタムテーマ）

> 📦 kuromoji の辞書は vite プラグイン（`vite.config.ts` の `kuromojiDictPlugin`）が
> `node_modules/kuromoji/dict` からビルド時に `dist/dict` へコピーして同梱します。

### ディレクトリ構造

```
jaucp-scoring/
├── src/                   # フロントエンド（TypeScript）
│   ├── lib/               # ビジネスロジック（UI非依存）
│   │   ├── llm/           # LLMプロバイダ統合
│   │   │   ├── index.ts       # 採点ディスパッチャ
│   │   │   ├── parse.ts       # 採点JSONの抽出・検証（共通）
│   │   │   ├── openai-compat.ts # OpenAI互換API共通実装
│   │   │   ├── openrouter.ts  # OpenRouter
│   │   │   ├── gemini.ts      # Google Gemini
│   │   │   └── cerebras.ts    # Cerebras
│   │   ├── ucp-api.ts     # アンサイクロペディアAPIプロキシクライアント
│   │   ├── wikipedia.ts   # Wikipedia API連携
│   │   ├── wikitext.ts    # 内部リンク抽出・分類
│   │   ├── morphology.ts  # kuromoji 形態素解析基盤
│   │   ├── proofread.ts   # 日本語校正（wakame 移植）+ ウィキ構文チェック
│   │   ├── link-suggest.ts# リンク候補生成（内部リンク整備ツール移植）
│   │   ├── autocomplete.ts# タイトル入力補完
│   │   ├── history.ts     # 採点履歴
│   │   ├── export.ts      # Wikitext/JSONエクスポート
│   │   ├── ogp.ts         # OGP画像生成
│   │   ├── prompts.ts     # 採点プロンプトプリセット
│   │   ├── schemas.ts     # Zodスキーマ定義
│   │   ├── settings.ts    # 設定管理
│   │   ├── store.ts       # ストア抽象化（Tauri / localStorage）
│   │   ├── path-shim.ts   # kuromoji ブラウザ用 path シム
│   │   └── dom.ts         # DOMユーティリティ・トースト
│   ├── ui/                # タブごとのUIモジュール
│   ├── main.ts            # エントリーポイント
│   └── styles.css         # スタイル定義
├── tests/                 # Vitest ユニットテスト
├── src-tauri/             # バックエンド（Rust）
├── index.html             # HTMLテンプレート
└── package.json           # Node依存関係
```

### スクリプト

```bash
# 開発サーバー起動（ブラウザで動作確認）
npm run dev

# Tauriアプリを開発モードで起動
npm run tauri dev

# ビルド（配布用実行ファイル生成）
npm run tauri build

# Linter実行
npm run lint

# テスト実行
npm test
```

### トラブルシューティング

#### ビルドエラーが出る

```bash
# キャッシュをクリアして再インストール
rm -rf node_modules package-lock.json
npm install

# Rustのキャッシュもクリア
cd src-tauri
cargo clean
cd ..
```

#### APIエラーが出る

- APIキーが正しく入力されているか確認
- インターネット接続を確認
- OpenRouterの場合、クレジット残高を確認

#### アンサイクロペディア連携が失敗する

- プロキシAPI (`https://kongyo.f5.si/api`) の稼働状況を確認（`/health` エンドポイント）
- 一時的な上流エラー（Cloudflareチャレンジ等）の場合は少し待って再試行

#### アプリが起動しない（Windows）

- Windows Defenderで誤検知されている可能性
- 「詳細情報」→「実行」で起動を許可

---

## 謝辞・由来

- 採点プロンプトは [Portal:AI活用/公開プロンプト置き場](https://ja.uncyclopedia.info/wiki/Portal:AI%E6%B4%BB%E7%94%A8/%E5%85%AC%E9%96%8B%E3%83%97%E3%83%AD%E3%83%B3%E3%83%97%E3%83%88%E7%BD%AE%E3%81%8D%E5%A0%B4) のもの（ノイマン氏）を使用
- プロンプトプリセット・採点履歴・Wikitextエクスポート・OGP生成などの機能は、フォーク版 [kaji11-jp/jaucp-scoring-plus](https://github.com/kaji11-jp/jaucp-scoring-plus) のアイデアを取り込んだものです
- 日本語校正ルールは [kongyo2/wakame](https://github.com/kongyo2/wakame)（ルーツは [MoZuku](https://github.com/t3tra-dev/MoZuku)）の kuromoji ベース実装を移植
- 内部リンク検査・リンク候補生成は kongyo2 の内部リンク整備ツール（ja-ucp-maintain-help）のロジックを移植
- タイトル入力補完のパイプライン設計は [kongyo2/kongyo-spec](https://github.com/kongyo2/kongyo-spec) を参考にしています

## ライセンス

MIT License

---

## 関連リンク

- [日本語版アンサイクロペディア](https://ja.uncyclopedia.info/)
- [Portal:AI活用/公開プロンプト置き場](https://ja.uncyclopedia.info/wiki/Portal:AI%E6%B4%BB%E7%94%A8/%E5%85%AC%E9%96%8B%E3%83%97%E3%83%AD%E3%83%B3%E3%83%97%E3%83%88%E7%BD%AE%E3%81%8D%E5%A0%B4)
- [OpenRouter Documentation](https://openrouter.ai/docs)
- [Google AI Studio](https://aistudio.google.com/)
- [Cerebras Inference Docs](https://inference-docs.cerebras.ai/)
- [Cerebras Cloud](https://cloud.cerebras.ai/)
