---
title: "React IntlとICUのローカライズ：Hyperlocaliseで抽出、同期、レビューする"
date: 2026-09-24T00:00:00.000Z
excerpt: react-intl と ICU メッセージ構文をリポジトリネイティブのワークフローに組み込み、Hyperlocalise CLI でカタログを抽出し、プルリクエストで複数形を検証し、Hyperlocalise でレビューして、翻訳済み JSON を本番環境にリリースします。
category: エンジニアリング
tags:
  - react-intl
  - ICU message format
  - FormatJS
  - hyperlocalise extract
  - localization CLI
  - continuous localisation
  - software localisation
  - GitHub Actions
  - translation review
  - i18n.yml
---

React Intlではユーザー向けの文言をTypeScript内に保持しますが、翻訳者やCIにはディスク上に安定したカタログが必要です。複数形、セレクト、数値、日付などのICU構文は、実行時に問題が起きないよう、その受け渡し後も維持する必要があります。

このガイドでは、**react-intl**、**ICU**、および **`hyperlocalise` CLI** を1つのワークフローに統合する方法を紹介します：

1. Engineers write messages in `defineMessages` and `<FormattedMessage />`.
2. `hl extract`は、ソースから英語のFormatJSカタログを更新します。
3. GitHub はプルリクエストにずれやキーの不足、ICU の構造上の問題がないか確認します。
4. `hl sync push`は、レビューのためにカタログをHyperlocaliseに送信します。
5. `hl sync pull`と`hl pack`は、レビュー済みの翻訳をアプリの`lang/*.json`に戻します。

このパターンは、Hyperlocaliseが自社のWebアプリを社内で活用している方法に沿っています。同じリポジトリ内のリリースノートやReact以外のJSONについては、このチュートリアルと[プルリクエストから多言語リリースまでのGitHubローカライズワークフロー](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release)を組み合わせてください。

## これから作るもの

次のような構成の Next.js または Vite React アプリを想定します：

```text
.
├── .github/workflows/
│   └── localise.yml
├── src/
│   ├── components/
│   │   └── saved-filters-banner.messages.ts
│   └── app/
│       └── filters-page.tsx
├── lang/
│   ├── en-US.json          # extracted source catalog (FormatJS shape)
│   ├── fr-FR.json
│   └── de-DE.json
└── i18n.yml
```

英語（`en-US`）がソースロケールです。フランス語とドイツ語がターゲットです。メッセージ ID と `defaultMessage` の値は、`*.messages.ts` ファイル（クライアントモジュール）および一部のインライン記述子にあります。抽出された JSON は Hyperlocalise が同期するデータで、パックされた JSON は多くのアプリが実行時にインポートするデータです。

必要なもの：

- ソースに`en-US`、ターゲットロケールに指定したロケールを設定した Hyperlocalise プロジェクト;
- `HYPERLOCALISE_API_KEY`および`HYPERLOCALISE_PROJECT_ID`を GitHub Actions のシークレットとして、そして
- `react-intl`（または`@formatjs/intl`）はすでにアプリにインストールされています。

## ステップ 1: ICU 対応の react-intl メッセージを記述する

製品コピーは文字列リテラルとして散在させず、メッセージ記述子にまとめてください。文言を変更しても抽出とレビューが安定するよう、明示的な ID を使用してください。

`src/components/saved-filters-banner.messages.ts`:

```ts
"use client";

import { defineMessages } from "react-intl";

export const savedFiltersBannerMessages = defineMessages({
  title: {
    id: "filters.banner.title",
    defaultMessage: "Saved filters",
    description: "Heading above the saved-filters list",
  },
  savedCount: {
    id: "filters.banner.savedCount",
    defaultMessage:
      "{count, plural, =0 {No saved filters yet} one {# saved filter} other {# saved filters}}",
    description: "Banner summary of how many filters the user saved",
  },
  scope: {
    id: "filters.banner.scope",
    defaultMessage:
      "{scope, select, workspace {Shared with your workspace} personal {Only visible to you} other {Custom scope}}",
    description: "Explains who can see the saved filter set",
  },
});
```

数値や列挙値に応じて文言が変わる場合は、`defaultMessage` 内で ICU を使用してください。React Intl は実行時にメッセージ全体を評価します。翻訳者は `{count, plural, ...}` と `{scope, select, ...}` のスケルトンを保持しつつ、人が読む分岐部分を変更してください。

In a page component, pass ICU values through `formatMessage` or `<FormattedMessage />`:

```tsx
"use client";

import { FormattedMessage, useIntl } from "react-intl";
import { savedFiltersBannerMessages } from "../components/saved-filters-banner.messages";

export function FiltersPage({ savedCount, scope }: { savedCount: number; scope: string }) {
  const intl = useIntl();

  return (
    <section>
      <h1>
        <FormattedMessage {...savedFiltersBannerMessages.title} />
      </h1>
      <p>{intl.formatMessage(savedFiltersBannerMessages.savedCount, { count: savedCount })}</p>
      <p>{intl.formatMessage(savedFiltersBannerMessages.scope, { scope })}</p>
    </section>
  );
}
```

**Server Components:** do not import `*.messages.ts` from server-only modules—`defineMessages` is client-only. Either mark the UI as `"use client"` or use inline `{ id, defaultMessage, description }` objects with `getIntlShape(locale).formatMessage()` on the server. See your framework’s react-intl boundaries; the extract step still finds descriptors in `.ts` and `.tsx` files it scans.

単一の react-intl ユニットとして出荷する予定の ICU メッセージでは、`--flatten`を避けてください。フラット化すると、複数形および select の分岐が、特殊な翻訳ワークフロー向けに引き上げられます。これはランタイムカタログのデフォルトではありません。

## ステップ 2: `i18n.yml`内のカタログをマッピング

リポジトリのルート（または、モノレポで UI の近くに設定ファイルを置いている場合はアプリディレクトリの下）に `i18n.yml` を作成します。

```yaml
version: hyperlocalise@1.13.7

locales:
  source: en-US
  targets:
    - fr-FR
    - de-DE

buckets:
  ui:
    files:
      - from: lang/{{source}}.json
        to: lang/{{target}}.json

llm:
  profiles:
    default:
      provider: openai
      model: gpt-6-luna

hyperlocalise:
  project_id_env: HYPERLOCALISE_PROJECT_ID
  api_base_url: https://hyperlocalise.com/api
  api_key_env: HYPERLOCALISE_API_KEY
```

HyperlocaliseはFormatJS JSONを第一級のコンテンツとして扱います。各キーはメッセージIDで、各値には`defaultMessage`と、任意で`description`が含まれます。ICU文字列はIDごとに1つの値のままです。`run`、`check`、同期では文ごとに分割されません。

ローカルマシンと GitHub Actions で同じ抽出ツールとバリデーターが実行されるように、`i18n.yml`で CLI のバージョンを固定する（またはインストールアクションを固定する）。

## ステップ 3: CLI を使用してソースカタログを抽出する

`i18n.yml` を含むディレクトリから、英語カタログを更新します：

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"

hl extract src \
  --out-file lang/en-US.json \
  --ignore "**/*.test.ts" \
  --ignore "**/*.test.tsx" \
  --ignore "**/*.stories.tsx" \
  --ignore "**/__tests__/**"
```

`extract`は、次の場所でディスクリプターを検索するために`.ts`と`.tsx`をスキャンします:

- `defineMessage` / `defineMessages`
- `intl.formatMessage(...)`
- `<FormattedMessage ... />`

厳密な FormatJS JSON を書き出します：

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {No saved filters yet} one {# saved filter} other {# saved filters}}",
    "description": "Banner summary of how many filters the user saved"
  }
}
```

ディスクリプターに`id`が指定されていない場合、CLI は`defaultMessage`と`description`から FormatJS 互換のハッシュを生成します。明示的な ID は、差分や Hyperlocalise で確認しやすくなります。

`lang/en-US.json`をコード変更と一緒にコミットしてください。抽出コミットがない場合は、マイグレーションがない場合と同じように扱ってください。カタログが更新されるまで、プラットフォームには新しい文字列が反映されません。

任意: `--prefix-id`は、正規化されたファイルパス（`src.components.saved-filters-banner.title`）をIDの先頭に付加します。実行時バンドルで短いIDが必要な場合は、`hl pack --prefix-id`と組み合わせてください。ここでの例では、代わりに安定した論理IDを使用しています。

## ステップ 4: extract と `check` を使ってプルリクエストを保護する

追加`.github/workflows/localise.yml`：

```yaml
name: Localise

on:
  pull_request:
    paths:
      - "i18n.yml"
      - "lang/**"
      - "src/**/*.ts"
      - "src/**/*.tsx"
      - ".github/workflows/localise.yml"
  push:
    branches: [main]
    paths:
      - "i18n.yml"
      - "lang/en-US.json"
      - "src/**/*.ts"
      - "src/**/*.tsx"
  workflow_dispatch:
    inputs:
      pull_translations:
        description: Pull reviewed translations into a pull request
        required: true
        type: boolean
        default: true

concurrency:
  group: localise-${{ github.event_name }}-${{ github.ref }}
  cancel-in-progress: false

jobs:
  check:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
    steps:
      - uses: actions/checkout@v4

      - name: Install Hyperlocalise
        uses: hyperlocalise/hyperlocalise/install@v1
        with:
          version: config

      - name: Verify extracted catalog matches source
        run: |
          set -euo pipefail
          hl extract src \
            --out-file lang/en-US.json \
            --ignore "**/*.test.ts" \
            --ignore "**/*.test.tsx" \
            --ignore "**/*.stories.tsx" \
            --ignore "**/__tests__/**"
          git diff --exit-code -- lang/en-US.json

      - name: Check localisation content
        uses: hyperlocalise/hyperlocalise@v1
        with:
          check: check
          config-path: i18n.yml
          hyperlocalise-version: config
          github-diff: true
          fail-on-findings: true
          upload-artifact: true
```

2つのゲートが連携して動作します。

1. **抽出のずれ** — コード内で`defaultMessage`を編集して`hl extract`を忘れると、`git diff`でジョブが失敗します。
2. **`hyperlocalise check`** — `github-diff: true`とともに、`lang/en-US.json`内の変更されたキーとターゲットを検証し、`not_localized`、`placeholder_mismatch`、**`icu_shape_mismatch`**などの問題を検出します。

最後のチェックは ICU にとって重要です。`{count, plural, ...}`を省略したり、分岐の順序を入れ替えたりしたフランス語の文字列は、JSONをざっと見る人には問題ないように見えても、実行時に失敗します。CIで構造のずれを検出するほうが、本番環境で検出するより低コストです。

プッシュする前に、同じチェックをローカルで実行してください：

```bash
hl extract src --out-file lang/en-US.json --ignore "**/*.test.ts" --ignore "**/*.test.tsx"
git diff --exit-code -- lang/en-US.json
hl check --bucket ui
```

## ステップ 5: マージ後に抽出したカタログをプッシュする

同じワークフローに push ジョブを追加します。

```yaml
push-sources:
  if: github.event_name == 'push'
  runs-on: ubuntu-latest
  environment: localisation
  permissions:
    contents: read
  steps:
    - uses: actions/checkout@v4

    - name: Install Hyperlocalise
      uses: hyperlocalise/hyperlocalise/install@v1
      with:
        version: config

    - name: Refresh source catalog
      run: |
        hl extract src \
          --out-file lang/en-US.json \
          --ignore "**/*.test.ts" \
          --ignore "**/*.test.tsx" \
          --ignore "**/*.stories.tsx" \
          --ignore "**/__tests__/**"

    - name: Push sources
      run: hl sync push
      env:
        HYPERLOCALISE_API_KEY: ${{ secrets.HYPERLOCALISE_API_KEY }}
        HYPERLOCALISE_PROJECT_ID: ${{ secrets.HYPERLOCALISE_PROJECT_ID }}
```

マージ後、`hl sync push` は `lang/en-US.json` をリンクされた Hyperlocalise プロジェクトにアップロードします。`main` で extract を再実行すると、Git に対応するカタログがないままコードがマージされる競合状態を回避できます。

バケットパスやロケールリストを変更する場合は、`hl sync push --dry-run`を使用してください。

## ステップ 6: Hyperlocalise の ICU メッセージを確認する

翻訳者には、英語の断片だけではなく、ICUメッセージ全体を表示してください。レビューでは、ICUが1つの文字列に隠しているロケール固有の質問を確認してください：

| メッセージ                    | レビューの質問                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `filters.banner.savedCount` | `=0`、`one`、`other`の分岐は自然に読めますか？`#`は各ロケールの複数形ルールに従って正しく展開されますか？ |
| `filters.banner.scope`      | `select`は、アプリが送信するすべての`scope`値に対応していますか？`other`は安全なフォールバックですか？                             |
| 短いラベル                | 複数形の展開後も、翻訳文字列はボタンに収まりますか？                                                |

制約のあるレイアウトで複数形の分岐が表示される場合は、スクリーンショットを添付してください。Hyperlocaliseでは用語集とプロジェクトの指示がセグメントと一緒に保持されます。CLIが行うのはファイルの移動だけです。

プラットフォームで翻訳を承認してから取り込んでください。承認が言語面のゲートであり、Gitには実際にリリースされる内容が記録されます。

## ステップ 7: 翻訳を取得してランタイム用にパッケージ化する

手動プルジョブを追加する：

```yaml
pull-translations:
  if: github.event_name == 'workflow_dispatch' && inputs.pull_translations
  runs-on: ubuntu-latest
  environment: localisation
  permissions:
    contents: write
    pull-requests: write
  steps:
    - uses: actions/checkout@v4

    - name: Install Hyperlocalise
      uses: hyperlocalise/hyperlocalise/install@v1
      with:
        version: config

    - name: Refresh source catalog
      run: |
        hl extract src --out-file lang/en-US.json \
          --ignore "**/*.test.ts" \
          --ignore "**/*.test.tsx"

    - name: Pull reviewed translations
      run: hl sync pull
      env:
        HYPERLOCALISE_API_KEY: ${{ secrets.HYPERLOCALISE_API_KEY }}
        HYPERLOCALISE_PROJECT_ID: ${{ secrets.HYPERLOCALISE_PROJECT_ID }}

    - name: Pack locale catalogs
      run: hl pack --bucket ui

    - name: Create translation pull request
      uses: peter-evans/create-pull-request@v8
      with:
        branch: hyperlocalise/reviewed-translations
        delete-branch: true
        commit-message: "chore(i18n): sync reviewed react-intl catalogs"
        title: "chore(i18n): sync reviewed react-intl catalogs"
        body: |
          Pulls reviewed UI strings from Hyperlocalise.

          - `hl sync pull` — download target locale JSON
          - `hl pack` — strip translator metadata, keep id → defaultMessage

          Verify ICU placeholders, plural branches, and layout in fr-FR and de-DE before merging.
        labels: localization
```

`sync pull` writes `lang/fr-FR.json` and `lang/de-DE.json` in FormatJS shape (ids, `defaultMessage`, sometimes `description`). `hl pack` removes `description` and other metadata while preserving ICU in each `defaultMessage`—ready for bundlers that import JSON per locale.

パックされたフランス語エントリの例：

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {Aucun filtre enregistré} one {# filtre enregistré} other {# filtres enregistrés}}"
  }
}
```

アプリで翻訳のプルリクエストを開き、ロケールを切り替えて、`count = 0`、`count = 1`、`count = 5`を試してください。ICUのリグレッションは、英語以外の複数形ルールでのみ発生することがよくあります。

## ステップ 8: アプリでカタログを読み込む

パック済みのロケールファイルをインポートし、`IntlProvider`または`createIntl`にマッピングします:

```tsx
import frFR from "../lang/fr-FR.json";
import deDE from "../lang/de-DE.json";

const catalogs = {
  "fr-FR": flattenFormatJSCatalog(frFR),
  "de-DE": flattenFormatJSCatalog(deDE),
};

function flattenFormatJSCatalog(
  catalog: Record<string, { defaultMessage: string } | string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(catalog).map(([id, value]) => [
      id,
      typeof value === "string" ? value : value.defaultMessage,
    ]),
  );
}
```

英語のデフォルトのみをソースコードに保持し、翻訳先の言語のみJSONから読み込むチームもあります。どちらのパターンも、コード内の`defaultMessage`と`lang/en-US.json`がextractによって同期されていれば問題ありません。

## 完全なフローの動作

```text
feature branch
    │
    ├─ edit *.messages.ts / FormattedMessage
    ├─ hl extract → lang/en-US.json
    └─ pull request
           ├─ extract drift check
           └─ hyperlocalise check (ICU + keys, diff-scoped)
                    │
                    ▼
                  main
                    │
                    ├─ hl extract
                    └─ hl sync push → Hyperlocalise
                                         │
                                         ├─ translate + review ICU
                                         └─ approve
                                              │
                                              ▼
                                   workflow_dispatch
                                              │
                                              ├─ hl sync pull
                                              ├─ hl pack
                                              └─ translation pull request
                                                       │
                                                       └─ merge → deploy
```

Extract はコードをカタログに接続します。Sync はカタログをレビュアーに接続します。Pack はレビュー済みの JSON をバンドルに接続します。

## よくある失敗パターン

### 抽出内容のずれでプルリクエストが失敗する

Run `hl extract` locally with the same `--ignore` patterns as CI, commit `lang/en-US.json`, and push. If ids jump unexpectedly, confirm descriptors include stable `id` fields.

### `icu_shape_mismatch` それ以外は「良好な」翻訳における

分岐順序とプレースホルダー名を`en-US`と比較してください。`hl check --check icu_shape_mismatch --locale fr-FR`をローカルで実行してください。対象のJSONを修正するか、セグメントをレビューに差し戻してください。実際のICUメッセージに対するチェックを無効化しないでください。

### 実行時に、`MISSING_TRANSLATION`または英語がターゲットロケールで表示されます。

翻訳のプルリクエストがマージされ、`hl pack`が実行され、インポートがパッケージ化されたファイルを参照していることを確認してください。コード内のメッセージ ID が JSON 内のキーと一致すること（`--prefix-id`の規則も含む）を確認してください。

### `hl sync pull`は何も変えません。

`HYPERLOCALISE_PROJECT_ID`で参照されているプロジェクトの承認を確認してください。`hl sync pull --dry-run`を実行してください。`i18n.yml` `to:`のパスが、アプリがカタログをインポートする場所と一致していることを確認してください。

### パック済みファイルから誤って ICU が削除された

FormatJS JSONではデフォルトの `hl pack` を使用してください。これにより `defaultMessage` がそのまま保持されます。カタログの形式が単純なネスト型JSONでない限り、その形式向けのワークフローでpackを実行しないでください。

## リリースチェックリスト

新しい文言が必要な機能をリリースする前に:

- [ ] メッセージ記述子が抽出された `lang/en-US.json` と統合されました
- [ ] プルリクエストの抽出と `hyperlocalise check`に合格しました
- [ ] `hl sync push` は `main` に実行されました。
- [ ] Hyperlocalise で対象ロケールを確認し、承認しました
- [ ] 翻訳のプルリクエストがマージされました (`sync pull` + `pack`)
- [ ] ロケールごとに複数形と `select` の分岐を手動でQAする
- [ ] 本番デプロイではマージ済みの `lang/*.json`成果物を使用する

## 抽出処理をループに組み込んだままにする

React Intlはコピーをコンポーネントと同じ場所に配置することを推奨します。一方、Hyperlocaliseはレビュー済みのファイルベースの翻訳を推奨します。**`hl extract`**コマンドを使えば、基本的なカタログのために別途FormatJS CLIを導入することなく、両者をつなげられます。

プルリクエストでは**`check`**を使ってICUの構造を保護してください。レビューワークフローには**sync**を使用してください。プルの間、翻訳者がGitでリッチなメタデータを保持しながら、本番用バンドルを軽量に保つには**`pack`**を使用してください。

UI文字列に加えてMarkdown形式のリリースノートも含む、GitHubのリリース全体の流れについては、[GitHubのローカライズワークフロー：プルリクエストから多言語リリースまで](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release)をご覧ください。または、[Hyperlocaliseで製品のローカライズについて詳しく見る](/use-cases/product-localisation)。
