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

本指南将带你了解如何使用 GitHub Actions、`hyperlocalise` CLI 和 Hyperlocalise 平台设置 GitHub 本地化工作流。你将从一个小示例开始，跟踪一项产品更改从首次拉取请求到多语言版本发布的全过程。

到最后，你的工作流程将涵盖四个阶段：

1. 一名工程师修改了一条英文 UI 字符串及其发行说明。
2. GitHub 会检查拉取请求中是否存在本地化问题。
3. CLI 会将源内容推送到 Hyperlocalise，团队会在此审核翻译。
4. GitHub 拉取已审核的文件，并发布一个包含英文、法文和德文发布说明的版本。

这是一个原生于代码仓库的流程。工程师在拉取请求中协作，语言审校人员在 Hyperlocalise 中结合上下文进行审核，而发布只会使用已返回 Git 的译文。

如果您想先了解更广泛的产品模式，再看实现细节，请参阅[GitHub 产品本地化用例](/use-cases/product-localisation)。

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

- 一个 Hyperlocalise 项目，其源语言区域为 `en-US`，目标语言区域为 `fr-FR` 和 `de-DE`；
- 一个 `HYPERLOCALISE_API_KEY` GitHub Actions 密钥；
- 一个 `HYPERLOCALISE_PROJECT_ID` GitHub Actions 密钥；以及
- 添加工作流和仓库机密的权限。

如果贵组织要求部署审批，请使用 GitHub 环境（例如 `localisation`）来存放生产凭据。

## 步骤 1：映射源文件和目标文件

在仓库根目录创建 `i18n.yml`：

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

这两个 bucket 明确了归属关系。`product` 将一个源目录映射到每个目标语言各自的目录。`release-notes` 将每个英文 Markdown 文件映射到对应的语言目录，同时保留文件名。

在配置中固定 CLI 版本也能让本地和 CI 运行保持一致。请将示例版本更新为团队已测试的发行版本。如果省略 `version`，请改为在安装操作中固定 `version` 输入。

当你的项目使用该提供商生成翻译时，会使用 LLM 配置文件。请将提供商凭据存储在 Hyperlocalise 中，而不要将其添加到工作流中。GitHub runner 只需要 Hyperlocalise 项目的凭据。

## 第 2 步：进行一项产品更改

假设 1.8.0 版本新增了已保存的筛选器。拉取请求更改了 `locales/en-US.json`：

```json
{
  "filters.save": "Save filter",
  "filters.saved": "Saved filters",
  "filters.saved.description": "Reuse filters across your workspace."
}
```

它还添加了`release-notes/en-US/v1.8.0.md`：

```markdown
# Saved filters

You can now save a filter and reuse it across your workspace.

## What changed

- Save a filter from any search results page.
- Rename or delete saved filters from workspace settings.
- Share the same filter criteria with your team.
```

将源内容与功能一同提交。这样，评审者就能在一个拉取请求中看到代码更改、界面文案和面向客户的说明。Git 历史记录也能显示某个版本发布时采用了哪些措辞。

不要将英文字符串手动复制到 `fr-FR.json` 或 `de-DE.json` 作为占位符。复制源值可能会让简单的键计数检查看起来完整，尽管实际上没有进行本地化。

## 第 3 步：检查拉取请求中已更改的字符串

添加 `.github/workflows/localise.yml`。第一个作业会在拉取请求上运行，并将 Hyperlocalise 检查结果限定在 GitHub 差异范围内：

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

借助 `github-diff: true`，该操作会获取拉取请求补丁并将其传递给 `hyperlocalise check --diff-stdin`。对于受支持的结构化语言资源目录，批注会聚焦于此拉取请求更改的键，而不是让作者处理无关的积压问题。

该操作还会上传其 JSON 报告和文本摘要。即使检查失败，也请保留这些文件：它们有助于区分结构错误、缺失的翻译和内容问题，以及安装或配置失败。

此检查是第一道审核关卡，而非语言审核。它会尽早发现代码库中的问题，而审核人员仍需判断每条译文是否准确、一致且适合该产品。

## 步骤 4：将合并后的源内容推送到 Hyperlocalise

向同一个`localise.yml`工作流添加第二个作业：

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

这是 push 边界。功能拉取请求合并到 `main` 后，`hl sync push` 会读取 `i18n.yml` 中的存储桶，并将英文 JSON 和 Markdown 源文件发送到关联的 Hyperlocalise 项目。

该作业对代码仓库仅有只读权限，因为它会发送内容，但不会修改 Git。其凭据仅存在于需要这些凭据的步骤中。`paths` 过滤器可防止无关的合并触发不必要的同步运行。

提交前也可以运行相同的操作：

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

更改存储桶映射时使用 `--dry-run`。它可以让你在更新远程项目之前检查计划。

## 步骤 5：一起审阅产品文案和发行说明

源同步完成后，请在 Hyperlocalise 中审核新内容。UI 文案和发布说明仍分属不同的内容区，但共用项目术语、说明和目标语言区域。

在此示例中，审阅者应检查的不只是字面准确性：

| 内容            | 审核问题                                                 |
| --------------- | -------------------------------------------------------- |
| `filters.save`  | 这明确是一个操作，而不是已保存的状态吗？    |
| `filters.saved` | 该术语是否与导航和设置文案相匹配？        |
| 描述     | 是否适合 UI 并保留“工作区”这一术语？ |
| 发布标题   | 是否与产品功能使用相同的名称？        |
| 发布要点 | 命令、菜单名称和用户结果是否一致？  |

当短字符串含义不明确时，请附上产品上下文或截图。译者如果只看到“保存筛选条件”，就无法判断它是按钮、提示消息还是页面标题。正是在这方面，平台能补足 CLI 的不足：Git 负责移动文件，而 Hyperlocalise 则承载着做出合理语言决策所需的信息。

在将翻译拉回之前，请先处理审阅意见，并按照项目工作流程批准翻译。请将批准视为发布门槛，而非行政手续。

## 步骤 6：将已审核的翻译拉取到 GitHub

在 `localise.yml` 中添加第三个作业：

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

审核后，从 **Actions** 选项卡运行此作业。`hl sync pull` 会将目标内容写入 `i18n.yml` 中的路径，生成如下文件：

```text
locales/fr-FR.json
locales/de-DE.json
release-notes/fr-FR/v1.8.0.md
release-notes/de-DE/v1.8.0.md
```

该工作流会创建拉取请求，而不是直接提交到 `main`。这样既能保留分支保护机制，让工程师有机会使用每种语言环境运行应用程序，也能记录此次发布中包含的确切译文。

在生产环境中，请根据依赖项策略，将第三方操作固定到完整的提交 SHA。可变的主版本标签能让本教程保持易读，但不可变引用可降低供应链风险。

## 第 7 步：测试已翻译的拉取请求

由于此翻译拉取请求更改了 `locales/**` 和 `release-notes/**`，自动检查将再次运行。请将应用程序自己的测试也添加到必需的检查中。

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

GitHub Releases 只有一个发布正文，因此将每种语言区域的内容汇总到一个 Markdown 文档中。添加 `.github/workflows/release.yml`:

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

确认该操作在 `pull_request` 事件上运行，并设置 `github-diff: true`。该操作需要 `pull-requests: read` 才能获取补丁。差异范围检查适用于受支持的结构化翻译文件；如果还想了解待处理内容，请在单独的定时任务中执行全项目检查。

### 源推送无法进行身份验证

检查所选 GitHub 环境中是否存在 `HYPERLOCALISE_API_KEY` 和 `HYPERLOCALISE_PROJECT_ID`。除非作业声明了该环境，否则无法使用环境密钥；受保护的环境可能需要等待批准。

### 拉取翻译后没有 Git 差异

首先确认翻译工作已在名为 `HYPERLOCALISE_PROJECT_ID` 的同一项目中完成。然后检查 `i18n.yml` 中的目标路径。在本地运行 `hl sync pull --dry-run`，检查计划下载的内容，且不要覆盖文件。

### 找不到此版本的发行说明

The tag and Markdown filename must match exactly. Tag `v1.8.0` expects `release-notes/<locale>/v1.8.0.md`. Keep the `v` in both places, or change the workflow's path construction in one deliberate convention update.

### 翻译将在产品发布后提供。

不要把翻译同步变成无人跟进的发布后任务。应在创建标签前要求提交翻译拉取请求，或将本地化明确纳入部署工作流的发布候选检查。

## 发布检查清单

在标记多语言版本之前，请确认：

- [ ] 源字符串和英文发行说明合并在一起；
- [ ] 拉取请求本地化检查已通过；
- [ ] `hl sync push` 合并后已完成；
- [ ] 目标语言已在 Hyperlocalise 中审核并获批准；
- [ ] `hl sync pull` 发起了一个翻译拉取请求；
- [ ] 自动化、语言和视觉检查均已通过；
- [ ] 翻译拉取请求已合并；并且
- [ ] 每个发行说明区域设置都有一个与标签匹配的非空文件。

## 将本地化纳入发布流程。

GitHub 本地化的关键不在于 YAML，而在于一连串责任明确的交接。

`hyperlocalise` CLI 将仓库文件连接到平台。GitHub Action 可让工程师快速了解字符串变更。Hyperlocalise 为语言审核人员提供 Git 本身无法提供的上下文和审批工作流。最终标签会准确发布团队审核过的内容。

这使本地化从开发完成后的任务转变为发布流程本身的一部分。

[探索 Hyperlocalise 产品本地化平台](/use-cases/product-localisation)，连接您的代码仓库、审核工作流和多语言发布流程。
