# JAUCP Scoring Tool

日本語版アンサイクロペディアの記事採点ツール。AI（LLM）を使用して記事の品質を自動評価します。

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/kongyo2/jaucp-scoring)

## 📋 目次

- [[このツールについて]](#このツールについて)
- [[機能]](#機能)
- [[インストール方法]](#インストール方法)
- [[使い方]](#使い方)
- [[開発者向け情報]](#開発者向け情報)
- [[ライセンス]](#ライセンス)

---

## このツールについて

このツールは、日本語版アンサイクロペディアに記事を投稿する前に、その品質をAIで採点するためのデスクトップアプリケーションです。

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

### 主な機能

- 🤖 **AI採点**: OpenRouterまたはGoogle Geminiを使った自動採点
- 📊 **詳細評価**: 5つの評価軸ごとに得点と理由を表示
- 💡 **改善提案**: 60点未満の記事には改善アドバイスを提示
- 🔧 **Wikipedia存在確認**: {{ウィキペディア}}テンプレート整備を補助
- 🎨 **ダークテーマ**: 目に優しいエディトリアル風デザイン

### 対応プロバイダ

- **OpenRouter**: 複数のAIモデルから選択可能（Claude、GPT-4など）
- **Google Gemini**: Geminiシリーズのモデルを直接利用

---

## インストール方法

### 📦 簡単インストール（Windows）

1. [[Releases](https://github.com/kongyo2/jaucp-scoring/releases)](https://github.com/kongyo2/jaucp-scoring/releases) ページにアクセス
2. 最新版の `.msi` または `.exe` ファイルをダウンロード
3. ダウンロードしたファイルを実行してインストール

---

### 🛠️ 開発版を使う場合

開発版を自分でビルドして使いたい場合は、以下の手順に従ってください。

#### 前提ソフトウェアのインストール

以下のソフトウェアが必要です:

##### 1. Node.js（JavaScriptの実行環境）

**Windowsの場合:**

1. [[Node.js公式サイト](https://nodejs.org/)](https://nodejs.org/) にアクセス
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

1. [[rustup公式サイト](https://rustup.rs/)](https://rustup.rs/) にアクセス
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

---

## 使い方

### 1. APIキーの取得

このツールを使うには、AIサービスのAPIキーが必要です。以下のいずれかを選んでください。

#### 🔹 [OpenRouter](https://openrouter.ai/)（推奨）

複数のAIモデルを1つのAPIキーで利用できるサービスです。

1. [OpenRouter](https://openrouter.ai/)にアクセス
2. 「Sign In」から新規登録（GitHubアカウントなどでログイン可能）
3. ログイン後、[[API Keys](https://openrouter.ai/keys)](https://openrouter.ai/keys) ページに移動
4. 「Create Key」をクリックしてAPIキーを作成
5. 表示されたキー（`sk-or-...`で始まる文字列）をコピー

> **💡 無料モデル使用可能**: OpenRouterでは無料で利用できるモデルも提供されています。クレジットを追加しなくても、無料モデルを選択することで採点機能を利用できます。

**💰 料金について:**
- 従量課金制（使った分だけ支払い）
- クレジットカード登録が必要
- モデルによって料金が異なる（1記事あたり数円〜数十円程度）
- 初回$5分の無料クレジットあり

#### 🔹 Google Gemini

Googleの提供するAIサービスです。

1. [[Google AI Studio](https://aistudio.google.com/apikey)](https://aistudio.google.com/apikey) にアクセス
2. Googleアカウントでログイン
3. 「Get API Key」→「Create API key」をクリック
4. 表示されたキー（`AIza...`で始まる文字列）をコピー

**💰 料金について:**
- 無料枠が大きい（月60リクエスト/分まで無料）
- 無料枠を超えると従量課金
- クレジットカード登録不要（無料枠内なら）

### 2. ツールの設定

1. アプリを起動
2. 右上の **⚙️ 設定ボタン** をクリック
3. 設定画面で以下を入力:
   - **プロバイダ**: OpenRouterまたはGeminiを選択
   - **APIキー**: コピーしたAPIキーを貼り付け
4. 「保存」をクリック

設定が完了すると、モデル一覧が自動的に読み込まれます。

### 3. 記事の採点

1. **モデルを選択**: ヘッダーのドロップダウンから使用するAIモデルを選択
2. **記事を入力**: 評価したい記事のウィキテキストを入力欄に貼り付け
3. **採点する**: 「採点する」ボタンをクリック
4. **結果を確認**: 数秒〜数十秒で採点結果が表示されます

### 4. Wikipedia存在確認（ユーティリティ機能）

`{{ウィキペディア}}`系テンプレートの整備を補助する機能です。

1. 「ユーティリティ」タブをクリック
2. 記事タイトルを入力
3. 「確認」をクリック
4. 日本語版・英語版Wikipediaの存在、リダイレクト状況を確認
5. 適切なテンプレートコードが自動生成されるので、コピーして使用

---

## 開発者向け情報

### 技術スタック

- **フロントエンド**: TypeScript, Vite
- **バックエンド**: Tauri 2.x (Rust)
- **検証**: Zod, neverthrow
- **スタイル**: CSS（カスタムダークテーマ）

### ディレクトリ構造

```
jaucp-scoring/
├── src/               # フロントエンド（TypeScript）
│   ├── lib/          # ビジネスロジック
│   │   ├── gemini.ts     # Gemini API連携
│   │   ├── models.ts     # OpenRouterモデル管理
│   │   ├── schemas.ts    # Zodスキーマ定義
│   │   ├── scoring.ts    # 採点ロジック
│   │   ├── settings.ts   # 設定管理
│   │   └── wikipedia.ts  # Wikipedia API連携
│   ├── main.ts       # エントリーポイント
│   └── styles.css    # スタイル定義
├── src-tauri/        # バックエンド（Rust）
│   ├── src/
│   │   ├── lib.rs    # メインロジック
│   │   └── main.rs   # エントリーポイント
│   └── Cargo.toml    # Rust依存関係
├── index.html        # HTMLテンプレート
└── package.json      # Node依存関係
```

### スクリプト

```bash
# 開発サーバー起動
npm run dev

# Tauriアプリを開発モードで起動
npm run tauri dev

# ビルド（配布用実行ファイル生成）
npm run tauri build

# Linter実行
npm run lint
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

#### アプリが起動しない（Windows）

- Windows Defenderで誤検知されている可能性
- 「詳細情報」→「実行」で起動を許可

---

## ライセンス

MIT License





---

## 関連リンク

- [[日本語版アンサイクロペディア](https://ja.uncyclopedia.info/)](https://ja.uncyclopedia.info/)
- [[Portal:AI活用/公開プロンプト置き場](https://ja.uncyclopedia.info/wiki/Portal:AI%E6%B4%BB%E7%94%A8/%E5%85%AC%E9%96%8B%E3%83%97%E3%83%AD%E3%83%B3%E3%83%97%E3%83%88%E7%BD%AE%E3%81%8D%E5%A0%B4)](https://ja.uncyclopedia.info/wiki/Portal:AI%E6%B4%BB%E7%94%A8/%E5%85%AC%E9%96%8B%E3%83%97%E3%83%AD%E3%83%B3%E3%83%97%E3%83%88%E7%BD%AE%E3%81%8D%E5%A0%B4)
- [[OpenRouter Documentation](https://openrouter.ai/docs)](https://openrouter.ai/docs)
- [[Google AI Studio](https://aistudio.google.com/)](https://aistudio.google.com/)
