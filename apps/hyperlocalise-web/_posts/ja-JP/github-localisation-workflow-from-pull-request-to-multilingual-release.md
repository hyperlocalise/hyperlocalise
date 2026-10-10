---
title: "GitHubのローカライゼーションワークフロー：プルリクエストから多言語リリースまで"
date: 2026-09-09T00:00:00.000Z
excerpt: 変更された文字列を確認し、ソースコンテンツをHyperlocaliseに送信し、レビュー済みの翻訳を取り込み、多言語のリリースノートを公開する、実用的なGitHubローカライズワークフローを構築します。
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

このガイドでは、GitHub Actions、`hyperlocalise` CLI、Hyperlocaliseプラットフォームを使って、GitHubのローカライズワークフローを設定する方法を説明します。小さな例から始め、ある製品変更が最初のプルリクエストから多言語リリースに至るまでを追っていきます。

最終的には、ワークフローは次の4つの段階を網羅するようになります：

1. エンジニアが英語のUI文字列とリリースノートを変更します。
2. GitHub はプルリクエストにローカライズ上の問題がないか確認します。
3. CLIはソースコンテンツをHyperlocaliseにプッシュし、チームが翻訳をレビューします。
4. GitHub はレビュー済みのファイルを取得し、英語、フランス語、ドイツ語のリリースノートを含むリリースを1つ公開します。

その結果、リポジトリを中心としたプロセスが実現します。エンジニアはプルリクエスト内で作業し、言語レビュー担当者はHyperlocaliseでコンテキストを確認し、リリースではGitに戻された翻訳のみを使用します。

実装の詳細に入る前に、より広範な製品パターンを知りたい場合は、[GitHub製品のローカライズに関するユースケース](/use-cases/product-localisation)をご覧ください。

## これから作るもの

ウェブアプリケーションの構成が次のようになっているとします：

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

英語はソースロケールです。フランス語とドイツ語はターゲットロケールです。JSONファイルには製品のコピーが含まれ、Markdownファイルにはリリースノートが含まれます。Hyperlocaliseはどちらも翻訳対象のコンテンツとして扱うため、インターフェースとお知らせの両方が同じレビュープロセスの対象となります。

必要なもの：

- ソースロケールが`en-US`で、`fr-FR`と`de-DE`をターゲットとするHyperlocaliseプロジェクト。
- `HYPERLOCALISE_API_KEY` GitHub Actions のシークレット;
- `HYPERLOCALISE_PROJECT_ID` GitHub Actions のシークレット; および
- ワークフローとリポジトリのシークレットを追加する権限。

組織でデプロイの承認が必要な場合は、本番用の認証情報に`localisation`のようなGitHub環境を使用してください。

## ステップ1：ソースファイルとターゲットファイルをマッピングする

リポジトリのルートに`i18n.yml`を作成してください:

```yaml
version: hyperlocalise@1.13.3

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

2つのバケットによって所有関係が明確になります。`product`は、1つのソースカタログをターゲットロケールごとに1つのカタログに対応付けます。`release-notes`は、すべての英語のMarkdownファイルを、ファイル名を維持したまま対応するロケールディレクトリに対応付けます。

設定でCLIのバージョンを固定すると、ローカル実行とCI実行の結果も一致します。例のバージョンを、チームでテスト済みのリリースに更新してください。`version`を省略する場合は、代わりにインストールアクションで`version`入力を固定してください。

プロジェクトがそのプロバイダーを使って翻訳を生成する際に、LLMプロファイルが使用されます。プロバイダーの認証情報はワークフローに追加せず、Hyperlocaliseに保存してください。GitHubランナーに必要なのは、Hyperlocaliseプロジェクトの認証情報だけです。

## ステップ 2: 製品に変更を1つ加える

バージョン1.8.0で保存済みフィルターが追加されるとします。このプルリクエストでは `locales/en-US.json`を変更します。:

```json
{
  "filters.save": "Save filter",
  "filters.saved": "Saved filters",
  "filters.saved.description": "Reuse filters across your workspace."
}
```

また、`release-notes/en-US/v1.8.0.md`も追加されます:

```markdown
# Saved filters

You can now save a filter and reuse it across your workspace.

## What changed

- Save a filter from any search results page.
- Rename or delete saved filters from workspace settings.
- Share the same filter criteria with your team.
```

機能と一緒にソースコンテンツをコミットしてください。これにより、レビュー担当者はコードの変更、UIの文言、顧客向けの説明を1つのプルリクエストで確認できます。また、Gitの履歴から、どの文言がどのリリースで公開されたかを確認できます。

`fr-FR.json`や`de-DE.json`に、英語の文字列をプレースホルダーとして手作業でコピーしないでください。コピーした原文の値は、ローカライズされていないにもかかわらず、単純なキー数のチェックでは完成しているように見えることがあります。

## ステップ 3: プルリクエストで変更された文字列を確認する

`.github/workflows/localise.yml`を追加します。最初のジョブはプルリクエストで実行され、Hyperlocaliseの指摘をGitHubの差分に限定します。

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

`github-diff: true`を使って、このアクションはプルリクエストのパッチを取得し、`hyperlocalise check --diff-stdin`に渡します。サポート対象の構造化カタログでは、注釈の対象をこのプルリクエストで変更されたキーに絞るため、作成者が無関係なバックログの対応を求められることはありません。

このアクションは JSON レポートとテキスト形式の概要もアップロードします。チェックに失敗した場合も、これらの成果物を保持してください。これらを使うと、構造上のエラー、翻訳漏れ、コンテンツに関する指摘を、インストールや設定の失敗と区別できます。

このチェックは最初のレビューゲートであり、言語レビューではありません。リポジトリの問題を早い段階で検出し、各翻訳が正確で一貫性があり、製品に適しているかどうかは引き続きレビュアーが判断します。

## ステップ 4: マージされたソースコンテンツをHyperlocaliseにプッシュする

同じ `localise.yml` ワークフローに 2 つ目のジョブを追加します:

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

ここが push の境界です。機能追加のプルリクエストが `main` にマージされると、`hl sync push` が `i18n.yml` 内のバケットを読み込み、英語の JSON ソースと Markdown ソースをリンクされた Hyperlocalise プロジェクトに送信します。

このジョブはコンテンツを外部に送信するものの Git を変更しないため、リポジトリへの読み取り専用権限を持っています。認証情報は、それを必要とするステップ内にのみ保存されます。`paths`フィルターにより、無関係なマージによって不要な同期実行が作成されるのを防ぎます。

コミットする前にも同じ操作を実行できます：

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

バケットマッピングを変更する際は、`--dry-run`を使用してください。リモートプロジェクトを更新する前に、変更内容を確認できます。

## ステップ 5: 製品の文字列とリリースノートを一緒に確認する

ソースの同期が完了したら、Hyperlocaliseで新しいコンテンツを確認してください。UI文字列とリリースノートは別々のバケットに分かれていますが、プロジェクト用語、指示、対象ロケールは共有しています。

この例では、レビュー担当者は文字どおりの正確さだけでなく、ほかの点も確認する必要があります：

| 内容            | レビューの質問                                             |
| --------------- | -------------------------------------------------------- |
| `filters.save`  | これは保存された状態ではなく、明確に操作を示していますか？    |
| `filters.saved` | その用語はナビゲーションや設定の文言に合っていますか？        |
| 説明     | UIに適合し、「ワークスペース」の用語を維持していますか？ |
| リリースタイトル   | 製品機能と同じ名前を使用していますか？        |
| リリースの箇条書き | コマンド、メニュー名、ユーザーの成果に一貫性がありますか？  |

短い文字列が曖昧な場合は、製品コンテキストやスクリーンショットを添付してください。「フィルターを保存」という文言だけでは、それがボタン、トースト通知、ページ見出しのどれなのか、翻訳者には判断できません。ここでプラットフォームはCLIを補完します。Gitがファイルを移動する一方で、Hyperlocaliseは適切な言語上の判断に必要な知識を提供します。

翻訳を取り込む前に、プロジェクトのワークフローに従ってレビューコメントを解決し、翻訳を承認してください。承認は事務的な手続きではなく、リリースのゲートとして扱ってください。

## ステップ 6: レビュー済みの翻訳を GitHub にプルする

3つ目のジョブを`localise.yml`に追加します。

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

レビュー後に **Actions** タブからこのジョブを実行します。`hl sync pull` は `i18n.yml` に記載されたパスに翻訳対象のコンテンツを書き込み、次のようなファイルを生成します。

```text
locales/fr-FR.json
locales/de-DE.json
release-notes/fr-FR/v1.8.0.md
release-notes/de-DE/v1.8.0.md
```

ワークフローは、`main`に直接コミットする代わりにプルリクエストを作成します。これにより、ブランチ保護が維持され、エンジニアが各ロケールでアプリケーションを実行する機会が得られ、リリースに含まれる翻訳が正確に記録されます。

本番環境では、依存関係のポリシーに従って、サードパーティ製アクションを完全なコミット SHA に固定してください。移動するメジャータグを使うとこのチュートリアルの読みやすさを保てますが、不変の参照を使うことでサプライチェーンのリスクを軽減できます。

## ステップ 7: 翻訳されたプルリクエストをテストする

翻訳プルリクエストで`locales/**`と`release-notes/**`が変更されるため、自動チェックが再度実行されます。アプリケーション独自のテストも必須チェックに追加してください。

少なくとも、以下を確認してください:

- すべてのターゲットカタログに新しいキーが含まれています。
- プレースホルダーと ICU 引数がソースと一致すること;
- 翻訳後のボタンがサポートされているビューポートサイズに収まる;
- Markdownの見出し、リスト、リンク、コードスパンは引き続き正しく表示されます；
- 製品とリリースノートでは同じ機能名が使用されており、
- ソース文字列はターゲットファイルに漏れませんでした。

レビュー担当者は、レンダリングされた製品も開く必要があります。ファイルレベルのレビューでは用語の誤りを見つけられますが、ボタンの文字切れや重要なテキストが隠れる改行までは確認できません。

そのチェックに合格した場合にのみ、翻訳のプルリクエストをマージしてください。Git には現在、リリースで承認された言語の状態が含まれています。

## ステップ 8: 多言語のリリースノートを公開する

GitHub Releases ではリリース本文は1つだけなので、各ロケールの内容を1つの Markdown ドキュメントにまとめます。`.github/workflows/release.yml`:

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

機能と翻訳のプルリクエストがマージされた後にのみ、タグを作成してください。

```bash
git switch main
git pull --ff-only
git tag v1.8.0
git push origin v1.8.0
```

いずれかのロケールでリリースノートが欠落している、または空の場合、リリースジョブは失敗します。これは意図的な仕様です。サイレントフォールバックを行うと、不完全なリリースを多言語対応済みと表示してしまいます。ジョブが失敗すれば、どのファイルをレビューに戻す必要があるのかをチームに正確に伝えられます。

同じタグをビルドジョブとデプロイジョブのトリガーにできます。告知が公開される前にバイナリが存在している必要がある場合は、リリースジョブがそれらのジョブに依存するようにします。

## フロー全体の動作

完成したGitHubローカライズワークフローには、明確な流れがあります：

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

各遷移には、それぞれ1つの役割があります。プルリクエストではリポジトリの変更をレビューします。Hyperlocaliseでは言語に関する判断をレビューします。タグは、レビュー済みの変更不能な状態を公開します。

## よくある失敗パターン

### PRチェックで無関係な翻訳が報告される

アクションが`pull_request`イベントで実行され、`github-diff: true`を設定することを確認してください。パッチを取得するには、アクションに`pull-requests: read`が必要です。差分に限定したチェックは、サポート対象の構造化翻訳ファイルに適用されます。バックログも可視化したい場合は、プロジェクト全体のチェックを別の定期実行ジョブにしてください。

### ソースプッシュを認証できません】【。

選択した GitHub 環境に`HYPERLOCALISE_API_KEY`と`HYPERLOCALISE_PROJECT_ID`の両方が存在することを確認してください。ジョブでその環境を宣言しない限り、環境シークレットは使用できません。また、保護された環境では承認待ちになることがあります。

### 翻訳を取得しても Git の差分は発生しません。

まず、`HYPERLOCALISE_PROJECT_ID`で指定された同じプロジェクトで翻訳作業が完了していることを確認してください。次に、`i18n.yml`の対象パスを確認してください。`hl sync pull --dry-run`をローカルで実行し、ファイルを上書きせずにダウンロード予定の内容を確認してください。

### リリースのノートが見つかりません。

タグと Markdown ファイル名は完全に一致している必要があります。タグ `v1.8.0` は `release-notes/<locale>/v1.8.0.md` を想定しています。`v` は両方の箇所で維持するか、ワークフローのパス構築を一度の意図的な規約変更で変更してください。

### 翻訳は製品リリース後に届きます。

翻訳の同期を、リリース後の管理されないタスクにしてはいけません。タグを作成する前に翻訳のプルリクエストを必須にするか、デプロイワークフローでローカライズを明示的なリリース候補チェックとして扱ってください。

## リリースチェックリスト

多言語版にタグを付ける前に、次の点を確認してください：

- [ ] ソース文字列と英語のリリースノートを統合しました;
- [ ] プルリクエストのローカライズチェックに合格した;
- [ ] `hl sync push` マージ後に完了;
- [ ] 対象言語は Hyperlocalise で確認され、承認されました;
- [ ] `hl sync pull`が翻訳のプルリクエストを作成しました;
- [ ] 自動、言語、視覚の各チェックに合格;
- [ ] 翻訳のプルリクエストがマージされたこと。そして
- [ ] 各リリースノートのロケールに、タグと一致する空でないファイルがある。

## リリースプロセスにローカライズを組み込む

GitHubのローカライズで重要なのはYAMLではありません。責任の所在が明確な引き継ぎの連続です。

`hyperlocalise` CLIはリポジトリ内のファイルをプラットフォームに接続します。GitHub Actionは、変更された文字列に対する迅速なフィードバックをエンジニアに提供します。Hyperlocaliseは、Gitだけでは提供できない文脈と承認ワークフローを言語レビュアーに提供します。最終タグは、チームがレビューした内容をそのまま公開します。

これにより、ローカライズは開発後の作業ではなく、リリース自体の一部になります。

[製品のローカライズに Hyperlocalise を活用して](/use-cases/product-localisation)リポジトリを接続し、ワークフローを確認して、多言語でリリースしましょう。
