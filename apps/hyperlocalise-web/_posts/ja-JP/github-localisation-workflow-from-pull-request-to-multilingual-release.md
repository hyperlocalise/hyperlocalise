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

This guide walks you through setting up a GitHub localization workflow with GitHub Actions, the `hyperlocalise` CLI, and the Hyperlocalise platform. You will start with a small example and follow one product change from its first pull request to a multilingual release.

最終的に、ワークフローは次の4つの段階を網羅します：

1. エンジニアが英語の UI 文字列とそのリリースノートを変更します。
2. GitHubはプルリクエストにローカライズ上の問題がないか確認します。
3. CLIはソースコンテンツをHyperlocaliseに送信し、チームが翻訳を確認します。
4. GitHub はレビュー済みのファイルを取得し、英語、フランス語、ドイツ語のリリースノートを含むリリースを1つ公開します。

リポジトリに根ざしたプロセスです。エンジニアはプルリクエスト内で作業し、言語レビュー担当者は Hyperlocalise で文脈を確認しながら作業します。リリースには Git に戻された翻訳のみを使用します。

If you want the broader product pattern before the implementation details, see the [GitHub product localisation use case](/use-cases/product-localisation).

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

- a Hyperlocalise project with `en-US` as its source locale and `fr-FR` and `de-DE` as targets;
- a `HYPERLOCALISE_API_KEY` GitHub Actions secret;
- a `HYPERLOCALISE_PROJECT_ID` GitHub Actions secret; and
- ワークフローとリポジトリのシークレットを追加する権限。

Use a GitHub environment such as `localisation` for production credentials if your organisation requires deployment approvals.

## ステップ 1: ソースファイルとターゲットファイルを対応付ける

Create `i18n.yml` at the repository root:

```yaml
version: hyperlocalise@1.13.4

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

The two buckets make ownership explicit. `product` maps one source catalogue to one catalogue per target locale. `release-notes` maps every English Markdown file to the equivalent locale directory while preserving its filename.

Pinning the CLI in the configuration also makes local and CI runs agree. Update the example version to the release your team has tested. If you omit `version`, pin the `version` input in the install action instead.

プロジェクトがそのプロバイダーを使って翻訳を生成する際に、LLMプロファイルが使用されます。プロバイダーの認証情報はワークフローに追加せず、Hyperlocaliseに保存してください。GitHubランナーに必要なのは、Hyperlocaliseプロジェクトの認証情報だけです。

## ステップ 2：製品を1つ変更する

Suppose version 1.8.0 adds saved filters. The pull request changes `locales/en-US.json`:

```json
{
  "filters.save": "Save filter",
  "filters.saved": "Saved filters",
  "filters.saved.description": "Reuse filters across your workspace."
}
```

It also adds `release-notes/en-US/v1.8.0.md`:

```markdown
# Saved filters

You can now save a filter and reuse it across your workspace.

## What changed

- Save a filter from any search results page.
- Rename or delete saved filters from workspace settings.
- Share the same filter criteria with your team.
```

機能と一緒にソースコンテンツをコミットします。これにより、レビュー担当者は1つのプルリクエストでコードの変更、UIの文言、顧客向けの説明を確認できます。また、Gitの履歴から、リリース時にどの文言が使われていたかを確認できます。

Do not hand-copy English strings into `fr-FR.json` or `de-DE.json` as placeholders. A copied source value can look complete to a simple key-count check even though no localisation happened.

## ステップ 3: プルリクエスト内の変更された文字列を確認する

Add `.github/workflows/localise.yml`. The first job runs on pull requests and scopes Hyperlocalise findings to the GitHub diff:

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

With `github-diff: true`, the action fetches the pull request patch and passes it to `hyperlocalise check --diff-stdin`. For supported structured catalogues, annotations focus on keys changed by this pull request rather than making the author resolve unrelated backlog.

このアクションは、JSONレポートとテキストの概要もアップロードします。チェックに失敗した場合も、これらの成果物は保持してください。構造上のエラー、翻訳の不足、コンテンツに関する指摘を、インストールや設定の失敗と切り分けるのに役立ちます。

このチェックは最初のレビュー段階であり、言語レビューではありません。リポジトリの問題を早期に検出しますが、各翻訳が正確で、一貫性があり、製品に適切かどうかは引き続きレビュアーが判断します。

## ステップ 4: マージ済みのソースコンテンツを Hyperlocalise にプッシュする

Add a second job to the same `localise.yml` workflow:

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

This is the push boundary. After the feature pull request merges to `main`, `hl sync push` reads the buckets in `i18n.yml` and sends the English JSON and Markdown sources to the linked Hyperlocalise project.

The job has read-only repository permission because it sends content out but does not modify Git. Its credentials live only in the step that needs them. The `paths` filter prevents unrelated merges from creating unnecessary sync runs.

コミット前に同じ操作を実行できます：

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

Use `--dry-run` when changing bucket mappings. It lets you inspect the plan before updating the remote project.

## ステップ 5: 製品の文字列とリリースノートを一緒に確認する

ソースの同期が完了したら、Hyperlocaliseで新しいコンテンツを確認してください。UI文字列とリリースノートは別々のバケットに分かれていますが、プロジェクト用語、指示、対象ロケールは共通です。

この例では、レビュー担当者は文字どおりの正確さだけでなく、より多くの点を確認する必要があります。:

| 内容            | レビューの質問                                             |
| --------------- | -------------------------------------------------------- |
| `filters.save`  | Is this clearly an action, rather than a saved state?    |
| `filters.saved` | Does the term match navigation and settings copy?        |
| 説明     | UIに適合し、「workspace」という用語を維持していますか？ |
| リリースタイトル   | 製品機能と同じ名称を使用していますか？        |
| リリースの箇条書き | コマンド、メニュー名、ユーザーが得られる結果に一貫性がありますか？  |

短い文字列が曖昧な場合は、製品のコンテキストやスクリーンショットを添付してください。翻訳者が「フィルターを保存」という文字列だけを見ても、それがボタンのラベルなのか、トースト通知なのか、ページの見出しなのかは分かりません。プラットフォームは、まさにそうした場面でCLIを補完します。Gitがファイルを移動する一方で、Hyperlocaliseは適切な言語上の判断に必要な知識を提供します。

レビューコメントを解決し、プロジェクトのワークフローに従って翻訳を承認してから、翻訳を取り込み直してください。承認は事務的な手続きではなく、リリースの必須条件として扱ってください。

## ステップ 6: レビュー済みの翻訳を GitHub に取り込む

Add a third job to `localise.yml`:

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

Run this job from the **Actions** tab after review. `hl sync pull` writes target content to the paths in `i18n.yml`, producing files such as:

```text
locales/fr-FR.json
locales/de-DE.json
release-notes/fr-FR/v1.8.0.md
release-notes/de-DE/v1.8.0.md
```

The workflow opens a pull request instead of committing directly to `main`. That preserves branch protection, gives engineers a chance to run the application with each locale, and records the exact translations included in the release.

本番環境では、依存関係ポリシーに従って、サードパーティ製アクションを完全なコミットSHAに固定してください。メジャータグは更新されるため、このチュートリアルを読みやすい状態に保てますが、変更されない参照を使用するとサプライチェーンのリスクを軽減できます。

## ステップ 7: 翻訳済みプルリクエストをテストする

The automated check will run again because the translation pull request changes `locales/**` and `release-notes/**`. Add your application's own tests to the required checks as well.

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

GitHub Releases has one release body, so assemble each locale into one Markdown document. Add `.github/workflows/release.yml`:

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

Confirm the action runs on a `pull_request` event and sets `github-diff: true`. The action needs `pull-requests: read` so it can fetch the patch. Diff-scoped checking applies to supported structured translation files; keep full-project checks in a separate scheduled job if you also want backlog visibility.

### ソースのプッシュを認証できません

Check that both `HYPERLOCALISE_API_KEY` and `HYPERLOCALISE_PROJECT_ID` exist in the selected GitHub environment. Environment secrets are not available unless the job declares that environment, and protected environments may wait for approval.

### 翻訳を取得しても Git の差分は発生しません。

First confirm that translation work has finished in the same project named by `HYPERLOCALISE_PROJECT_ID`. Then check the target paths in `i18n.yml`. Run `hl sync pull --dry-run` locally to inspect the planned download without overwriting files.

### リリースのノートが見つかりません。

The tag and Markdown filename must match exactly. Tag `v1.8.0` expects `release-notes/<locale>/v1.8.0.md`. Keep the `v` in both places, or change the workflow's path construction in one deliberate convention update.

### 翻訳は製品リリース後に届きます。

翻訳の同期を、追跡されないリリース後のタスクにしてはいけません。タグを作成する前に翻訳のプルリクエストを必須にするか、デプロイワークフローでローカライズを明示的なリリース候補チェックとして扱ってください。

## リリースチェックリスト

多言語版にタグを付ける前に、以下を確認してください：

- [ ] ソース文字列と英語のリリースノートが一緒にマージされました;
- [ ] プルリクエストのローカライズチェックに合格した;
- [ ] `hl sync push` completed after merge;
- [ ] 対象言語が Hyperlocalise で確認され、承認されました;
- [ ] `hl sync pull` opened a translation pull request;
- [ ] 自動、言語、および視覚的なチェックに合格しました;
- [ ] 翻訳のプルリクエストがマージされたこと、そして
- [ ] すべてのリリースノートのロケールに、タグに一致する空でないファイルがある。

## ローカライズをリリースプロセスに組み込む

GitHubのローカライズで重要なのはYAMLではありません。責任の所在が明確な引き継ぎの連続です。

The `hyperlocalise` CLI connects repository files to the platform. The GitHub Action gives engineers fast feedback on changed strings. Hyperlocalise gives language reviewers the context and approval workflow that Git alone cannot provide. The final tag publishes exactly what the team reviewed.

これにより、ローカライズは開発後の作業ではなく、リリースそのものの一部になります。

[Explore Hyperlocalise for product localisation](/use-cases/product-localisation) to connect your repositories, review workflows, and multilingual releases.
