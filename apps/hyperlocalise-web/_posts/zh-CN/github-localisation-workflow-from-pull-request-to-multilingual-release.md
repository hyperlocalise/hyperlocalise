---
title: "GitHub 本地化工作流程：从拉取请求到多语言版本发布"
date: 2026-09-09T00:00:00.000Z
excerpt: 构建一套实用的 GitHub 本地化工作流，用于检查已更改的字符串、将源内容发送到 Hyperlocalise、取回审核后的译文，并发布多语言版本的发行说明。
category: 工程
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

到最后，你的工作流程将涵盖四个阶段：

1. 一名工程师修改了一条英文 UI 字符串及其发行说明。
2. GitHub 会检查拉取请求中是否存在本地化问题。
3. CLI 会将源内容推送到 Hyperlocalise，团队会在此审核翻译。
4. GitHub 拉取已审核的文件，并发布一个包含英文、法文和德文发布说明的版本。

这是一个原生于代码仓库的流程。工程师在拉取请求中协作，语言审校人员在 Hyperlocalise 中结合上下文进行审核，而发布只会使用已返回 Git 的译文。

If you want the broader product pattern before the implementation details, see the [GitHub product localisation use case](/use-cases/product-localisation).

## 我们将构建的内容

假设一个 Web 应用具有以下结构：

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

英语是源语言区域设置。法语和德语是目标语言区域设置。JSON 文件存放产品文案，Markdown 文件存放发布说明。Hyperlocalise 将两者都视为可翻译内容，因此同一轮审核会同时涵盖界面和公告。

你将需要：

- a Hyperlocalise project with `en-US` as its source locale and `fr-FR` and `de-DE` as targets;
- a `HYPERLOCALISE_API_KEY` GitHub Actions secret;
- a `HYPERLOCALISE_PROJECT_ID` GitHub Actions secret; and
- 添加工作流和仓库机密的权限。

Use a GitHub environment such as `localisation` for production credentials if your organisation requires deployment approvals.

## 步骤 1：映射源文件和目标文件

Create `i18n.yml` at the repository root:

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

The two buckets make ownership explicit. `product` maps one source catalogue to one catalogue per target locale. `release-notes` maps every English Markdown file to the equivalent locale directory while preserving its filename.

Pinning the CLI in the configuration also makes local and CI runs agree. Update the example version to the release your team has tested. If you omit `version`, pin the `version` input in the install action instead.

当你的项目使用该提供商生成翻译时，会使用 LLM 配置文件。请将提供商凭据存储在 Hyperlocalise 中，而不要将其添加到工作流中。GitHub runner 只需要 Hyperlocalise 项目的凭据。

## 第 2 步：进行一项产品更改

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

将源内容与功能一同提交。这样，评审者就能在一个拉取请求中看到代码更改、界面文案和面向客户的说明。Git 历史记录也能显示某个版本发布时采用了哪些措辞。

Do not hand-copy English strings into `fr-FR.json` or `de-DE.json` as placeholders. A copied source value can look complete to a simple key-count check even though no localisation happened.

## 第 3 步：检查拉取请求中已更改的字符串

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

该操作还会上传其 JSON 报告和文本摘要。即使检查失败，也请保留这些文件：它们有助于区分结构错误、缺失的翻译和内容问题，以及安装或配置失败。

此检查是第一道审核关卡，而非语言审核。它会尽早发现代码库中的问题，而审核人员仍需判断每条译文是否准确、一致且适合该产品。

## 步骤 4：将合并后的源内容推送到 Hyperlocalise

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

提交前也可以运行相同的操作：

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

Use `--dry-run` when changing bucket mappings. It lets you inspect the plan before updating the remote project.

## 步骤 5：一起审阅产品文案和发行说明

源同步完成后，请在 Hyperlocalise 中审核新内容。UI 文案和发布说明仍分属不同的内容区，但共用项目术语、说明和目标语言区域。

在此示例中，审阅者应检查的不只是字面准确性：

| 内容            | 审核问题                                                 |
| --------------- | -------------------------------------------------------- |
| `filters.save`  | Is this clearly an action, rather than a saved state?    |
| `filters.saved` | Does the term match navigation and settings copy?        |
| 描述     | 是否适合 UI 并保留“工作区”这一术语？ |
| 发布标题   | 是否与产品功能使用相同的名称？        |
| 发布要点 | 命令、菜单名称和用户结果是否一致？  |

当短字符串含义不明确时，请附上产品上下文或截图。译者如果只看到“保存筛选条件”，就无法判断它是按钮、提示消息还是页面标题。正是在这方面，平台能补足 CLI 的不足：Git 负责移动文件，而 Hyperlocalise 则承载着做出合理语言决策所需的信息。

在将翻译拉回之前，请先处理审阅意见，并按照项目工作流程批准翻译。请将批准视为发布门槛，而非行政手续。

## 步骤 6：将已审核的翻译拉取到 GitHub

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

在生产环境中，请根据依赖项策略，将第三方操作固定到完整的提交 SHA。可变的主版本标签能让本教程保持易读，但不可变引用可降低供应链风险。

## 第 7 步：测试已翻译的拉取请求

The automated check will run again because the translation pull request changes `locales/**` and `release-notes/**`. Add your application's own tests to the required checks as well.

至少验证：

- 每个目标目录都包含这些新键；
- 占位符和 ICU 参数与源文本一致；
- 翻译后的按钮在支持的视口尺寸下均能完整显示；
- Markdown 标题、列表、链接和代码片段仍可正确呈现；
- 产品和发行说明使用相同的功能名称；并且
- 源字符串没有泄漏到目标文件中。

审核人员还应打开渲染后的产品进行检查。文件级审查可以发现术语错误，但无法发现按钮被截断或换行导致重要文本被隐藏的问题。

仅在这些检查通过后才合并翻译拉取请求。Git 现在包含此版本已批准的语言状态。

## 第 8 步：发布多语言版本说明

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

仅在功能和翻译拉取请求合并后创建标签：

```bash
git switch main
git pull --ff-only
git tag v1.8.0
git push origin v1.8.0
```

如果任何语言区域的发行说明缺失或为空，发行任务就会失败。这是有意为之。静默回退会让不完整的发行版本被标记为多语言；任务失败则会明确告知团队需要将哪个文件重新提交审核。

同一个标签可以触发构建和部署作业。如果公告发布前必须先生成二进制文件，请让发布作业依赖于这些作业。

## 完整流程的运行方式

完善后的 GitHub 本地化工作流方向明确：

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

每个环节各司其职。拉取请求用于审查仓库变更。Hyperlocalise 负责审查语言决策。标签用于发布不可变且已完成审查的状态。

## 常见故障模式

### PR 检查报告了无关的翻译

Confirm the action runs on a `pull_request` event and sets `github-diff: true`. The action needs `pull-requests: read` so it can fetch the patch. Diff-scoped checking applies to supported structured translation files; keep full-project checks in a separate scheduled job if you also want backlog visibility.

### 源推送无法进行身份验证

Check that both `HYPERLOCALISE_API_KEY` and `HYPERLOCALISE_PROJECT_ID` exist in the selected GitHub environment. Environment secrets are not available unless the job declares that environment, and protected environments may wait for approval.

### 拉取翻译后没有 Git 差异

First confirm that translation work has finished in the same project named by `HYPERLOCALISE_PROJECT_ID`. Then check the target paths in `i18n.yml`. Run `hl sync pull --dry-run` locally to inspect the planned download without overwriting files.

### 找不到此版本的发行说明

The tag and Markdown filename must match exactly. Tag `v1.8.0` expects `release-notes/<locale>/v1.8.0.md`. Keep the `v` in both places, or change the workflow's path construction in one deliberate convention update.

### 翻译将在产品发布后提供。

不要把翻译同步变成无人跟进的发布后任务。应在创建标签前要求提交翻译拉取请求，或将本地化明确纳入部署工作流的发布候选检查。

## 发布检查清单

在标记多语言版本之前，请确认：

- [ ] 源字符串和英文发行说明合并在一起；
- [ ] 拉取请求本地化检查已通过；
- [ ] `hl sync push` completed after merge;
- [ ] 目标语言已在 Hyperlocalise 中审核并获批准；
- [ ] `hl sync pull` opened a translation pull request;
- [ ] 自动化、语言和视觉检查均已通过；
- [ ] 翻译拉取请求已合并；并且
- [ ] 每个发行说明区域设置都有一个与标签匹配的非空文件。

## 将本地化纳入发布流程。

GitHub 本地化的关键不在于 YAML，而在于一连串责任明确的交接。

The `hyperlocalise` CLI connects repository files to the platform. The GitHub Action gives engineers fast feedback on changed strings. Hyperlocalise gives language reviewers the context and approval workflow that Git alone cannot provide. The final tag publishes exactly what the team reviewed.

这使本地化从开发完成后的任务转变为发布流程本身的一部分。

[Explore Hyperlocalise for product localisation](/use-cases/product-localisation) to connect your repositories, review workflows, and multilingual releases.
