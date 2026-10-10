---
title: "React IntlとICUのローカライズ：Hyperlocaliseで抽出、同期、レビューする"
date: 2026-09-24T00:00:00.000Z
excerpt: react-intlとICUメッセージ構文をリポジトリに最適化されたワークフローに組み込みましょう。Hyperlocalise CLIでカタログを抽出し、プルリクエストで複数形を検証し、Hyperlocaliseでレビューして、翻訳済みJSONを本番環境にリリースできます。
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

React Intlではユーザー向けの文言をTypeScript内に保持しますが、翻訳者とCIにはディスク上の安定したカタログが必要です。複数形、セレクト、数値、日付などのICU構文は、実行時に問題を起こすことなく、その受け渡しを経ても維持されなければなりません。

このガイドでは、**react-intl**、**ICU**、**`hyperlocalise` CLI** を1つのワークフローに統合する方法を説明します：

1. エンジニアは`defineMessages`と`<FormattedMessage />`でメッセージを書きます。
2. `hl extract` はソースから英語のFormatJSカタログを更新します。
3. GitHub はプルリクエストをチェックし、ドリフト、キーの欠落、ICU の構造上の問題を確認します。
4. `hl sync push`がカタログをレビューのためにHyperlocaliseに送信します。
5. `hl sync pull` と `hl pack` を使うと、レビュー済みの翻訳をアプリ用の `lang/*.json` に戻せます。

このパターンは、Hyperlocalise が自社のウェブアプリをどのようにドッグフーディングしているかを示しています。同じリポジトリ内のリリースノートや React 以外の JSON については、このチュートリアルを、[プルリクエストから多言語リリースまでの GitHub ローカライズワークフロー](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release)と組み合わせてください。

## 作成するもの

次のような構成の Next.js または Vite の React アプリを想定します:

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

英語（`en-US`）がソースロケールです。フランス語とドイツ語が翻訳先です。メッセージ ID と `defaultMessage` の値は、`*.messages.ts` ファイル（クライアントモジュール）と、一部のインライン記述子にあります。抽出された JSON は Hyperlocalise が同期に使用し、パックされた JSON は多くのアプリが実行時にインポートします。

必要なもの：

- ソースを`en-US`、ターゲットロケールをお客様のロケールとするHyperlocaliseプロジェクト;
- `HYPERLOCALISE_API_KEY` と `HYPERLOCALISE_PROJECT_ID` を GitHub Actions のシークレットとして設定し、さらに
- `react-intl`（または`@formatjs/intl`）はすでにアプリにインストールされています。

## ステップ 1: ICU 対応の react-intl メッセージを記述する

製品コピーはメッセージ記述子にまとめ、文字列リテラルとして分散させないでください。文言が変わっても抽出とレビューが安定するよう、明示的な ID を使用してください。

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

コピーが数値や列挙型に依存する場合は、`defaultMessage`内でICUを使用してください。React Intlは実行時にメッセージ全体を評価します。翻訳者は`{count, plural, ...}`と`{scope, select, ...}`の骨組みを維持しながら、人が読める分岐部分を変更してください。

ページコンポーネントでは、ICU の値を`formatMessage`または`<FormattedMessage />`を介して渡します:

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

**サーバーコンポーネント:** サーバー専用モジュールから`*.messages.ts`をインポートしないでください。`defineMessages`はクライアント専用です。UIに`"use client"`を指定するか、サーバー上で`getIntlShape(locale).formatMessage()`を使ってインライン`{ id, defaultMessage, description }`オブジェクトを使用してください。react-intlの境界については、使用しているフレームワークのドキュメントを参照してください。抽出ステップでは、スキャン対象の`.ts`ファイルと`.tsx`ファイル内の記述子も引き続き検出されます。

単一の react-intl ユニットとして配信する予定の ICU メッセージでは、`--flatten`を避けてください。フラット化すると、複数形とセレクトの分岐が特殊な翻訳ワークフロー向けに切り出されます。ランタイムカタログでは、これがデフォルトではありません。

## ステップ 2: `i18n.yml`内のカタログをマッピングする

リポジトリのルート（または、モノレポで設定ファイルを UI の隣に置いている場合はアプリのディレクトリ内）に`i18n.yml`を作成します。

```yaml
version: hyperlocalise@1.13.3

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

Hyperlocalise は FormatJS JSON を第一級コンテンツとして扱います。各キーはメッセージ ID で、各値には `defaultMessage` と任意の `description` が含まれます。ICU 文字列は ID ごとに 1 つの値のままです。`run`、`check`、同期処理では、これらを文単位に分割しません。

ローカルマシンと GitHub Actions で同じ抽出ツールとバリデーターが実行されるよう、`i18n.yml`内のCLIバージョンを固定する（またはインストールアクションを固定する）。

## ステップ 3: CLI でソースカタログを抽出する

`i18n.yml`を含むディレクトリで、英語カタログを更新します:

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

`extract`は、次の場所にあるディスクリプターを探すために`.ts`と`.tsx`をスキャンします:

- `defineMessage` / `defineMessages`
- `intl.formatMessage(...)`
- `<FormattedMessage ... />`

厳密なFormatJS JSONを書き出します：

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {No saved filters yet} one {# saved filter} other {# saved filters}}",
    "description": "Banner summary of how many filters the user saved"
  }
}
```

記述子に`id`が含まれていない場合、CLI は`defaultMessage`と`description`から FormatJS 互換のハッシュを生成します。明示的な ID は、diff や Hyperlocalise で確認しやすくなります。

コード変更と一緒に`lang/en-US.json`をコミットしてください。抽出コミットが欠けている場合は、マイグレーションが欠けている場合と同じように扱ってください。カタログが更新されるまで、プラットフォームには新しい文字列が反映されません。

任意: `--prefix-id`は、IDのプレフィックスとして正規化されたファイルパス（`src.components.saved-filters-banner.title`）を付加します。実行時バンドルが短いIDを想定している場合は、`hl pack --prefix-id`と組み合わせてください。ここでの例では、代わりに安定した論理IDを使用しています。

## ステップ 4: extract と `check` でプルリクエストを保護する

`.github/workflows/localise.yml`を追加:

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

2つのゲートが連携して機能します。

1. **抽出内容のずれ** — コード内の`defaultMessage`を編集して`hl extract`を忘れると、ジョブは`git diff`で失敗します。
2. **`hyperlocalise check`** — `github-diff: true`とともに、`lang/en-US.json`内の変更されたキーと対象を検証し、`not_localized`、`placeholder_mismatch`、**`icu_shape_mismatch`**などの問題を検出します。

この最後のチェックは ICU にとって重要です。`{count, plural, ...}`を削除したり分岐の順序を入れ替えたりしたフランス語の文字列は、JSON をざっと見ただけでは問題ないように見えても、実行時に失敗します。CI で構造のずれを検出するほうが、本番環境で検出するより低コストです。

プッシュする前に、同じチェックをローカルで実行してください：

```bash
hl extract src --out-file lang/en-US.json --ignore "**/*.test.ts" --ignore "**/*.test.tsx"
git diff --exit-code -- lang/en-US.json
hl check --bucket ui
```

## ステップ 5: マージ後に抽出したカタログをプッシュする

同じワークフローにプッシュジョブを追加します。

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

マージ後、`hl sync push` が `lang/en-US.json` をリンク済みの Hyperlocalise プロジェクトにアップロードします。`main` で extract を再実行すると、対応するカタログが Git にない状態でコードがマージされる競合を回避できます。

バケットパスやロケールリストを変更する際は、`hl sync push --dry-run`を使用してください。

## ステップ 6: Hyperlocalise で ICU メッセージを確認する

翻訳者には、切り離された英語の断片ではなく、ICUメッセージ全体を見せる必要があります。レビューでは、ICUが1つの文字列に隠しているロケール固有の疑問点を確認してください：

| メッセージ                  | レビューの質問                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `filters.banner.savedCount` | `=0`、`one`、`other`の各ブランチは自然に読めますか？`#`は各ロケールの複数形ルールに従って正しく展開されますか？ |
| `filters.banner.scope`      | アプリが送信するすべての`scope`値を`select`はカバーしていますか？`other`は安全なフォールバックですか？          |
| 短いラベル                  | 複数形の展開後も、翻訳文字列はボタンに収まりますか？                                                            |

制約のあるレイアウトで複数形の分岐が表示される場合は、スクリーンショットを添付してください。Hyperlocaliseでは、用語集とプロジェクトの指示をセグメントと一緒に保持します。CLIはファイルを移動するだけです。

翻訳をプラットフォーム上で承認してから、プルバックしてください。承認が言語面でのゲートであり、Gitには実際にリリースされる内容が記録されます。

## ステップ 7: 翻訳を取得し、ランタイム用にパッケージ化する

手動のプルジョブを追加する:

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

`sync pull`は、FormatJS形式（ID、`lang/fr-FR.json`、場合によっては`lang/de-DE.json`）で`defaultMessage`と`description`を書き出します。`hl pack`は`description`やその他のメタデータを削除しつつ、各`defaultMessage`内のICUを保持します。ロケールごとのJSONをインポートするバンドラーですぐに使用できます。

フランス語のパック済みエントリの例:

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {Aucun filtre enregistré} one {# filtre enregistré} other {# filtres enregistrés}}"
  }
}
```

アプリで翻訳プルリクエストを開き、ロケールを切り替えて、`count = 0`、`count = 1`、`count = 5`をテストしてください。ICUのリグレッションは、英語以外の複数形ルールでのみ発生することがよくあります。

## ステップ 8: アプリでカタログを読み込む

圧縮されたロケールファイルをインポートし、`IntlProvider`または`createIntl`にマッピングします：

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

英語のデフォルトはソースコード内にのみ保持し、翻訳対象の言語についてのみJSONを読み込むチームもあります。どちらのパターンも、コード内の `defaultMessage` と `lang/en-US.json` が extract を通じて一致していれば機能します。

## フロー全体の動作

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

Extractはコードとカタログをつなぎます。Syncはカタログとレビュアーをつなぎます。Packはレビュー済みのJSONをバンドルにつなぎます。

## よくある失敗例

### プルリクエストが抽出内容のずれで失敗する

CIと同じ`--ignore`パターンで`hl extract`をローカルで実行し、`lang/en-US.json`をコミットしてプッシュしてください。IDが予期せず飛ぶ場合は、ディスクリプターに安定した`id`フィールドが含まれていることを確認してください。

### それ以外は「良い」翻訳における`icu_shape_mismatch`

分岐の順序とプレースホルダー名を`en-US`と比較してください。`hl check --check icu_shape_mismatch --locale fr-FR`をローカルで実行してください。対象のJSONを修正するか、このセグメントをレビューに戻してください。実際のICUメッセージの場合は、チェックを無効にしないでください。

### ターゲット ロケールでは、実行時に`MISSING_TRANSLATION`または英語が表示されます

翻訳のプルリクエストがマージされ、`hl pack`が実行され、インポート先がパック済みファイルを指していることを確認してください。コード内のメッセージ ID が JSON 内のキーと一致していること（`--prefix-id`の規則がある場合はそれも含む）を確認してください。

### `hl sync pull`は何も変更しません

`HYPERLOCALISE_PROJECT_ID`で参照されているプロジェクトの承認を確認します。`hl sync pull --dry-run`を実行します。`i18n.yml` `to:`のパスが、アプリがカタログをインポートする場所と一致していることを確認します。

### パック済みファイルから誤って ICU が削除された

FormatJS JSON ではデフォルトの `hl pack` を使用してください。これにより `defaultMessage` がそのまま保持されます。カタログの形式が通常のネストされた JSON でない限り、通常のネストされた JSON 用のワークフローで pack を実行しないでください。

## リリースチェックリスト

新しい文言に依存する機能をリリースする前に:

- [ ] メッセージ記述子が抽出済みの`lang/en-US.json`とマージされました
- [ ] プルリクエストの抽出と `hyperlocalise check` が通過しました
- [ ] `hl sync push` は `main` に実行されました。
- [ ] Hyperlocalise で対象ロケールがレビューされ、承認済みです。
- [ ] 翻訳のプルリクエストがマージされました (`sync pull` + `pack`)
- [ ] 各ロケールで複数形と `select` 分岐を手動で QAする
- [ ] 本番デプロイではマージ済みの `lang/*.json` アーティファクトを使用する

## extractにも常に情報を共有する

React Intlはコピーをコンポーネントと同じ場所に配置することを推奨し、Hyperlocaliseはレビュー済みのファイルベースの翻訳を推奨します。**`hl extract`**コマンドは、基本的なカタログのために別個のFormatJS CLIを導入することなく、両者の世界をつなぎます。

プルリクエストで ICU の構造を保護するには **`check`** を使用してください。レビューワークフローには **sync** を使用してください。翻訳者が pull 間に Git で詳細なメタデータを保持しながら、本番バンドルを軽量に保つには **`pack`** を使用してください。

UI文字列に加えてMarkdownのリリースノートも含めた、GitHubのリリースに関するより幅広いストーリーについては、[GitHub localisation workflow: from pull request to multilingual release](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release)をご覧ください。または、[Hyperlocaliseでの製品ローカライズについて詳しく見る](/use-cases/product-localisation)。
