---
title: "GitHubローカライゼーションワークフロー：プルリクエストから多言語リリースまで"
date: 2026-09-09T00:00:00.000Z
excerpt: 変更された文字列をチェックし、ソースコンテンツをHyperlocaliseに送信して、レビュー済みの翻訳を取り込み、多言語のリリースノートを公開する、実用的なGitHubローカライゼーションワークフローを構築しましょう。
category: エンジニアリング
tags:
  - github localization
  - GitHub localisation workflow
  - localize release notes
  - multilingual release
  - localization GitHub Actions
  - localisation CLI
  - continuous localisation
  - software localisation
  - release automation
  - translation review
---

このガイドでは、GitHub Actions、`hyperlocalise` CLI、Hyperlocaliseプラットフォームを使って、GitHubのローカライズワークフローを設定する方法を説明します。小さな例から始め、1つの製品変更が最初のプルリクエストから多言語でのリリースに至るまでを追っていきます。

最終的に、ワークフローは次の4つの段階を網羅します：

1. エンジニアが英語の UI 文字列とそのリリースノートを変更します。
2. GitHubはプルリクエストにローカライズ上の問題がないか確認します。
3. CLIはソースコンテンツをHyperlocaliseに送信し、チームが翻訳を確認します。
4. GitHub はレビュー済みのファイルを取得し、英語、フランス語、ドイツ語のリリースノートを含むリリースを1つ公開します。

リポジトリに根ざしたプロセスです。エンジニアはプルリクエスト内で作業し、言語レビュー担当者は Hyperlocalise で文脈を確認しながら作業します。リリースには Git に戻された翻訳のみを使用します。

実装の詳細を見る前に、より広範な製品パターンを知りたい場合は、[GitHub製品のローカライズのユースケース](/use-cases/product-localisation)をご覧ください。

## 作成するもの

Webアプリケーションが次のような構造になっているとします：

```text
.
├── .github/workflows/
│   ├── localise.yml
│   └── release.yml
├── locales/
│   ├── en-US.json
│   ├── de-DE.json
│   └── fr-FR.json
├── release-notes/
│   ├── en-US/v1.8.0.md
│   ├── de-DE/v1.8.0.md
│   └── fr-FR/v1.8.0.md
└── i18n.yml
```

英語がソースロケールです。フランス語とドイツ語がターゲットロケールです。JSONファイルには製品コピーが含まれ、Markdownファイルにはリリースノートが含まれます。Hyperlocaliseではどちらも翻訳対象コンテンツとして扱われるため、同じレビューサイクルでインターフェースとお知らせの両方を確認できます。

必要なもの：

- ソースロケールが `en-US`で、ターゲットが `fr-FR`と `de-DE`の Hyperlocalise プロジェクト;
- `HYPERLOCALISE_API_KEY` GitHub Actions シークレット;
- `HYPERLOCALISE_PROJECT_ID` GitHub Actions のシークレットであり、
- ワークフローとリポジトリのシークレットを追加する権限。

組織で本番環境の認証情報にデプロイ承認が必要な場合は、`localisation` のような GitHub 環境を使用してください。

## ステップ 1: ソースファイルとターゲットファイルを対応付ける

リポジトリのルートに `i18n.yml` を作成してください:

```yaml
version: hyperlocalise@1.13.6

locales:
  source: en-US
  targets:
    - fr-FR
    - de-DE

buckets:
  product:
    files:
      - from: locales/{{source}}.json
        to: locales/{{target}}.json
  release-notes:
    files:
      - from: release-notes/{{source}}/*.md
        to: release-notes/{{target}}/*.md

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

2つのバケットによって所有関係が明確になります。`product`は、1つのソースカタログをターゲットロケールごとに1つのカタログへ対応付けます。`release-notes`は、すべての英語のMarkdownファイルを、ファイル名を保持したまま対応するロケールディレクトリに対応付けます。

設定でCLIのバージョンを固定すると、ローカルとCIでの実行内容も一致します。例のバージョンを、チームでテストしたリリースに更新してください。`version`を省略する場合は、代わりにインストールアクションで`version`入力を固定してください。

プロジェクトがそのプロバイダーを使って翻訳を生成する際に、LLMプロファイルが使用されます。プロバイダーの認証情報はワークフローに追加せず、Hyperlocaliseに保存してください。GitHubランナーに必要なのは、Hyperlocaliseプロジェクトの認証情報だけです。

## ステップ 2：製品を1つ変更する

バージョン 1.8.0 で保存済みフィルターが追加されるとします。プルリクエストで変更される内容は `locales/en-US.json` です：

```json
{
  "filters.save": "Save filter",
  "filters.saved": "Saved filters",
  "filters.saved.description": "Reuse filters across your workspace."
}
```

さらに、`release-notes/en-US/v1.8.0.md`も追加されます:

```markdown
# Saved filters

You can now save a filter and reuse it across your workspace.

## What changed

- Save a filter from any search results page.
- Rename or delete saved filters from workspace settings.
- Share the same filter criteria with your team.
```

機能と一緒にソースコンテンツをコミットします。これにより、レビュー担当者は1つのプルリクエストでコードの変更、UIの文言、顧客向けの説明を確認できます。また、Gitの履歴から、リリース時にどの文言が使われていたかを確認できます。

英語の文字列を`fr-FR.json`または`de-DE.json`に手作業でコピーして、プレースホルダーとして使わないでください。コピーしたソース値は、ローカライズされていないにもかかわらず、単純なキー数チェックでは完成しているように見えることがあります。

## ステップ 3: プルリクエスト内の変更された文字列を確認する

`.github/workflows/localise.yml`を追加します。最初のジョブはプルリクエストで実行され、Hyperlocaliseの検出結果をGitHubの差分に限定します。

```yaml
name: Localise

on:
  pull_request:
    paths:
      - "i18n.yml"
      - "locales/**"
      - "release-notes/**"
      - ".github/workflows/localise.yml"
  push:
    branches: [main]
    paths:
      - "i18n.yml"
      - "locales/en-US.json"
      - "release-notes/en-US/**"
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

      - name: Check changed localisation content
        uses: hyperlocalise/hyperlocalise@v1
        with:
          check: check
          config-path: i18n.yml
          hyperlocalise-version: config
          github-diff: true
          fail-on-findings: true
          upload-artifact: true
```

`github-diff: true`を使用して、アクションはプルリクエストのパッチを取得し、`hyperlocalise check --diff-stdin`に渡します。対応している構造化カタログでは、作成者に無関係な未対応項目の解決を求めるのではなく、このプルリクエストで変更されたキーに注釈を付けます。

このアクションは、JSONレポートとテキストの概要もアップロードします。チェックに失敗した場合も、これらの成果物は保持してください。構造上のエラー、翻訳の不足、コンテンツに関する指摘を、インストールや設定の失敗と切り分けるのに役立ちます。

このチェックは最初のレビュー段階であり、言語レビューではありません。リポジトリの問題を早期に検出しますが、各翻訳が正確で、一貫性があり、製品に適切かどうかは引き続きレビュアーが判断します。

## ステップ 4: マージ済みのソースコンテンツを Hyperlocalise にプッシュする

同じ `localise.yml` ワークフローに2つ目のジョブを追加します:

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

    - name: Push source content
      run: hl sync push
      env:
        HYPERLOCALISE_API_KEY: ${{ secrets.HYPERLOCALISE_API_KEY }}
        HYPERLOCALISE_PROJECT_ID: ${{ secrets.HYPERLOCALISE_PROJECT_ID }}
```

これが push の境界です。機能プルリクエストが `main` にマージされると、`hl sync push` は `i18n.yml` 内のバケットを読み込み、英語の JSON ソースと Markdown ソースをリンクされた Hyperlocalise プロジェクトに送信します。

このジョブにはリポジトリへの読み取り専用権限が付与されています。コンテンツを送信するだけで、Git は変更しません。認証情報は、それを必要とするステップ内でのみ使用できます。`paths`フィルターにより、無関係なマージによって不要な同期が実行されるのを防ぎます。

コミット前に同じ操作を実行できます：

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

バケットのマッピングを変更するときに`--dry-run`を使用すると、リモートプロジェクトを更新する前に計画を確認できます。

## ステップ 5: 製品の文字列とリリースノートを一緒に確認する

ソースの同期が完了したら、Hyperlocaliseで新しいコンテンツを確認してください。UI文字列とリリースノートは別々のバケットに分かれていますが、プロジェクト用語、指示、対象ロケールは共通です。

この例では、レビュー担当者は文字どおりの正確さだけでなく、より多くの点を確認する必要があります。:

| 内容            | レビューの質問                                             |
| --------------- | -------------------------------------------------------- |
| `filters.save`  | これは保存された状態ではなく、明確にアクションですか？    |
| `filters.saved` | 用語はナビゲーションや設定の文言に合っていますか？        |
| 説明     | UIに適合し、「workspace」という用語を維持していますか？ |
| リリースタイトル   | 製品機能と同じ名称を使用していますか？        |
| リリースの箇条書き | コマンド、メニュー名、ユーザーが得られる結果に一貫性がありますか？  |

短い文字列が曖昧な場合は、製品のコンテキストやスクリーンショットを添付してください。翻訳者が「フィルターを保存」という文字列だけを見ても、それがボタンのラベルなのか、トースト通知なのか、ページの見出しなのかは分かりません。プラットフォームは、まさにそうした場面でCLIを補完します。Gitがファイルを移動する一方で、Hyperlocaliseは適切な言語上の判断に必要な知識を提供します。

レビューコメントを解決し、プロジェクトのワークフローに従って翻訳を承認してから、翻訳を取り込み直してください。承認は事務的な手続きではなく、リリースの必須条件として扱ってください。

## ステップ 6: レビュー済みの翻訳を GitHub に取り込む

`localise.yml`に3つ目のジョブを追加します:

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

    - name: Pull reviewed translations
      run: hl sync pull
      env:
        HYPERLOCALISE_API_KEY: ${{ secrets.HYPERLOCALISE_API_KEY }}
        HYPERLOCALISE_PROJECT_ID: ${{ secrets.HYPERLOCALISE_PROJECT_ID }}

    - name: Create translation pull request
      uses: peter-evans/create-pull-request@v8
      with:
        branch: hyperlocalise/reviewed-translations
        delete-branch: true
        commit-message: "chore(i18n): sync reviewed translations"
        title: "chore(i18n): sync reviewed translations"
        body: |
          Pulls the latest reviewed product strings and release notes from
          Hyperlocalise. Check terminology, placeholders, links, and locale
          coverage before merging.
        labels: localization
```

レビュー後に**Actions**タブからこのジョブを実行します。 `hl sync pull`は、`i18n.yml`内のパスに翻訳先のコンテンツを書き込み、次のようなファイルを生成します。

```text
locales/fr-FR.json
locales/de-DE.json
release-notes/fr-FR/v1.8.0.md
release-notes/de-DE/v1.8.0.md
```

このワークフローでは、`main`に直接コミットする代わりに、プルリクエストを作成します。これにより、ブランチ保護が維持され、エンジニアが各ロケールでアプリケーションを実行して確認できるようになり、リリースに含まれる翻訳の内容が正確に記録されます。

本番環境では、依存関係ポリシーに従って、サードパーティ製アクションを完全なコミットSHAに固定してください。メジャータグは更新されるため、このチュートリアルを読みやすい状態に保てますが、変更されない参照を使用するとサプライチェーンのリスクを軽減できます。

## ステップ 7: 翻訳済みプルリクエストをテストする

翻訳プルリクエストで`locales/**`と`release-notes/**`が変更されるため、自動チェックが再度実行されます。アプリケーション独自のテストも必須チェックに追加してください。

最低限、次の点を確認してください：

- すべてのターゲットカタログに新しいキーが含まれています;
- プレースホルダーと ICU 引数はソースと一致します;
- 翻訳後のボタンが、サポート対象のビューポートサイズ内に収まること;
- Markdownの見出し、リスト、リンク、コードスパンは引き続き正しく表示されます;
- 製品とリリースノートでは同じ機能名が使用されています。また、
- ソース文字列がターゲットファイルに漏れ出していない。

レビュアーは、レンダリングされた製品も開く必要があります。ファイル単位のレビューでは用語の誤りを見つけられますが、ボタンの表示切れや重要なテキストを隠してしまう改行までは確認できません。

それらのチェックに合格した場合にのみ、翻訳のプルリクエストをマージしてください。Git には、リリースで承認された言語の状態が反映されています。

## ステップ 8: 多言語のリリースノートを公開する

GitHub Releases ではリリース本文は1つだけなので、各ロケールの内容を1つのMarkdownドキュメントにまとめます。`.github/workflows/release.yml`を追加します：

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build multilingual release notes
        env:
          VERSION: ${{ github.ref_name }}
        run: |
          set -euo pipefail
          mkdir -p dist

          for locale in en-US fr-FR de-DE; do
            file="release-notes/${locale}/${VERSION}.md"
            test -s "${file}" || {
              echo "Missing release notes: ${file}" >&2
              exit 1
            }
          done

          {
            printf '# English\n\n'
            cat "release-notes/en-US/${VERSION}.md"
            printf '\n\n---\n\n# Français\n\n'
            cat "release-notes/fr-FR/${VERSION}.md"
            printf '\n\n---\n\n# Deutsch\n\n'
            cat "release-notes/de-DE/${VERSION}.md"
          } > dist/release-notes.md

      - name: Publish GitHub release
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh release create "${{ github.ref_name }}" --verify-tag --notes-file dist/release-notes.md
```

機能と翻訳のプルリクエストがマージされた後にのみタグを作成してください：

```bash
git switch main
git pull --ff-only
git tag v1.8.0
git push origin v1.8.0
```

いずれかのロケールのリリースノートが存在しない、または空の場合、リリースジョブは失敗します。これは意図的な動作です。何も通知せずにフォールバックすると、不完全なリリースを多言語対応済みと誤って表示してしまいます。ジョブが失敗すれば、どのファイルをレビューに戻す必要があるのかチームに正確に伝わります。

同じタグでビルドジョブとデプロイジョブを実行できます。アナウンスを公開する前にバイナリが存在している必要がある場合は、リリースジョブがそれらのジョブに依存するようにします。

## フロー全体の動作方法

完成したGitHubのローカライズワークフローには、明確な方向性があります:

```text
feature branch
    │
    ├─ change English strings and release notes
    └─ pull request: Hyperlocalise check + application tests
             │
             ▼
           main
             │
             └─ hl sync push → Hyperlocalise
                                  │
                                  ├─ translate
                                  ├─ review
                                  └─ approve
                                       │
                                       ▼
                              manual hl sync pull
                                       │
                                       ▼
                           translation pull request
                                       │
                                       ├─ checks
                                       ├─ visual QA
                                       └─ merge
                                            │
                                            ▼
                                       version tag
                                            │
                                            └─ multilingual GitHub release
```

各遷移には一つの責務があります。プルリクエストはリポジトリの変更をレビューします。Hyperlocalise は言語に関する判断をレビューします。タグは、すでにレビュー済みの不変な状態を公開します。

## よくある失敗パターン

### PRチェックで無関係な翻訳が報告されます

アクションが`pull_request`イベントで実行され、`github-diff: true`を設定することを確認してください。パッチを取得できるよう、アクションには`pull-requests: read`が必要です。差分に限定したチェックは、サポート対象の構造化された翻訳ファイルに適用されます。バックログも確認したい場合は、プロジェクト全体のチェックを別の定期実行ジョブにしてください。

### ソースのプッシュを認証できません

選択した GitHub 環境に `HYPERLOCALISE_API_KEY` と `HYPERLOCALISE_PROJECT_ID` の両方が存在することを確認してください。ジョブでその環境を宣言しない限り、環境シークレットは利用できません。また、保護された環境では承認待ちになる場合があります。

### 翻訳を取得しても Git の差分は発生しません。

まず、同じプロジェクト `HYPERLOCALISE_PROJECT_ID` で翻訳作業が完了したことを確認してください。次に、`i18n.yml` のターゲットパスを確認してください。ファイルを上書きせずに、`hl sync pull --dry-run` をローカルで実行して、ダウンロード予定の内容を確認してください。

### リリースのノートが見つかりません。

The tag and Markdown filename must match exactly. Tag `v1.8.0` expects `release-notes/<locale>/v1.8.0.md`. Keep the `v` in both places, or change the workflow's path construction in one deliberate convention update.

### 翻訳は製品リリース後に届きます。

翻訳の同期を、追跡されないリリース後のタスクにしてはいけません。タグを作成する前に翻訳のプルリクエストを必須にするか、デプロイワークフローでローカライズを明示的なリリース候補チェックとして扱ってください。

## リリースチェックリスト

多言語版にタグを付ける前に、以下を確認してください：

- [ ] ソース文字列と英語のリリースノートが一緒にマージされました;
- [ ] プルリクエストのローカライズチェックに合格した;
- [ ] `hl sync push` マージ後に完了;
- [ ] 対象言語が Hyperlocalise で確認され、承認されました;
- [ ] `hl sync pull` が翻訳のプルリクエストを作成しました;
- [ ] 自動、言語、および視覚的なチェックに合格しました;
- [ ] 翻訳のプルリクエストがマージされたこと、そして
- [ ] すべてのリリースノートのロケールに、タグに一致する空でないファイルがある。

## ローカライズをリリースプロセスに組み込む

GitHubのローカライズで重要なのはYAMLではありません。責任の所在が明確な引き継ぎの連続です。

`hyperlocalise` CLI はリポジトリのファイルをプラットフォームに接続します。GitHub Action は、変更された文字列についてエンジニアに迅速なフィードバックを提供します。Hyperlocalise は、Git だけでは実現できないコンテキストと承認ワークフローを言語レビュー担当者に提供します。最後のタグによって、チームがレビューした内容がそのまま公開されます。

これにより、ローカライズは開発後の作業ではなく、リリースそのものの一部になります。

[製品のローカライズに Hyperlocalise を活用し](/use-cases/product-localisation)、リポジトリ、レビューワークフロー、多言語リリースを連携しましょう。
