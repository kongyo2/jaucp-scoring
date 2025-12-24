# JAUCP Scoring Tool

日本語版アンサイクロペディアの記事採点ツール。LLMを使用して記事の品質を評価します。

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/kongyo2/jaucp-scoring)

## 機能

- **記事採点**: ユーモア、構成一貫性、フォーマット、文章の自然さ、完成度を100点満点で評価
- **改善点アドバイス**: 60点未満の記事には具体的な改善提案を表示

### ビルド

```bash
# 依存関係のインストール
npm install

# 開発モード
npm run tauri dev

# ビルド
npm run tauri build
```

## 使い方

1. 設定（⚙️）からOpenRouter APIキーを入力
2. モデルを選択
3. 評価したい記事のウィキテキストを入力
4. 「採点する」をクリック

## APIキーの取得

[OpenRouter](https://openrouter.ai/keys)でAPIキーを取得できます。

> **💡 無料モデル使用可能**: OpenRouterでは無料で利用できるモデルも提供されています。クレジットを追加しなくても、無料モデルを選択することで採点機能を利用できます。

## 技術スタック

- **フロントエンド**: TypeScript, Vite
- **バックエンド**: Tauri 2.x (Rust)
- **検証ライブラリ**: Zod, neverthrow
- **スタイル**: CSS（Editorial/Magazineダークテーマ）

## ライセンス

MIT
