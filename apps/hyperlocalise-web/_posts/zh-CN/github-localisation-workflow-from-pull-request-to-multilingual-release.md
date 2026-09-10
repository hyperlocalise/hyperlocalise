---
title: "GitHub 本地化工作流：从拉取请求到多语言发布"
date: 2026-09-09T00:00:00.000Z
excerpt: 构建一个实用的 GitHub 本地化工作流，用于检查已更改的字符串，将源内容发送到 Hyperlocalise，带回经过审核的翻译，并发布多语言版本的发行说明。
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

本指南将引导你使用 GitHub Actions、`hyperlocalise` CLI 和 Hyperlocalise 平台设置 GitHub 本地化工作流。你将从一个小型示例开始，跟随一项产品变更从首次拉取请求到多语言发布的全过程。

到最后，您的工作流程将涵盖四个阶段：

1. 一名工程师更改了英文界面字符串及其发布说明。
2. GitHub 会检查拉取请求中是否存在本地化问题。
3. CLI 将源内容推送到 Hyperlocalise，团队会在其中审核翻译。
4. GitHub 拉取经过审核的文件，并发布一个包含英文、法文和德文说明的版本。

最终形成了一套以代码仓库为核心的流程。工程师留在拉取请求中，语言审校人员在 Hyperlocalise 中结合上下文开展工作，而发布流程只会使用已回到 Git 的翻译。

如果你想在了解实现细节之前先了解更广泛的产品模式，请参阅[GitHub 产品本地化用例](/use-cases/product-localisation)。

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

英语是源语言区域设置。法语和德语是目标语言区域设置。JSON 文件包含产品文案，而 Markdown 文件包含发布说明。Hyperlocalise 将两者都视为可翻译内容，因此同一轮审核涵盖界面和公告。

你将需要：

- 一个 Hyperlocalise 项目，其源语言为 `en-US`，目标语言为 `fr-FR` 和 `de-DE`；
- 一个 `HYPERLOCALISE_API_KEY` GitHub Actions 密钥；
- 一个 `HYPERLOCALISE_PROJECT_ID` GitHub Actions 密钥；以及
- 添加工作流和仓库机密的权限。

如果您的组织要求部署审批，请使用类似 `localisation` 的 GitHub 环境来存储生产凭据。

## 步骤 1：映射源文件和目标文件

在仓库根目录创建 `i18n.yml`：

```yaml
version: hyperlocalise@1.11.0

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
      model: gpt-5.6-luna

hyperlocalise:
  project_id_env: HYPERLOCALISE_PROJECT_ID
  api_base_url: https://hyperlocalise.com/api
  api_key_env: HYPERLOCALISE_API_KEY
```

这两个存储桶明确了所有权。`product`将一个源目录映射到每个目标语言区域设置对应的一个目录。`release-notes`将每个英文 Markdown 文件映射到相应的语言区域目录，同时保留其文件名。

在配置中固定 CLI 版本，也能让本地运行和 CI 运行保持一致。将示例版本更新为团队已测试过的版本。如果省略 `version`，请改为在安装操作中固定 `version` 输入。

LLM 配置文件用于项目通过该提供商生成翻译时。请将提供商凭据存储在 Hyperlocalise 中，而不是将其添加到工作流中。GitHub runner 只需要 Hyperlocalise 项目的凭据。

## 步骤 2：进行一项产品更改

假设 1.8.0 版本新增了已保存的筛选条件。该拉取请求更改了 `locales/en-US.json`：

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

将源内容与功能一同提交。这能让审阅者在一个拉取请求中看到代码变更、界面文案和面向客户的说明。这也意味着，Git 历史记录可以回答某个版本发布时采用了哪些措辞。

不要将英文字符串原样复制到 `fr-FR.json` 或 `de-DE.json` 中作为占位符。复制的源文本值可能会通过简单的键数量检查，看起来像是完整的，但实际上并未进行本地化。

## 步骤 3：检查拉取请求中更改的字符串

添加 `.github/workflows/localise.yml`。第一个任务在拉取请求上运行，并将 Hyperlocalise 检查结果限定在 GitHub 差异范围内：

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

借助 `github-diff: true`，该操作会获取拉取请求补丁，并将其传递给 `hyperlocalise check --diff-stdin`。对于受支持的结构化目录，批注会聚焦于此拉取请求更改的键，而不是让作者处理无关的积压问题。

该操作还会上传其 JSON 报告和文本摘要。当检查失败时，请保留这些构件：它们可以区分结构错误、缺少翻译和内容发现与安装或配置失败。

这项检查是第一道审核关卡，而不是语言审查。它会尽早发现存储库问题，同时由审阅者决定每条翻译是否准确、一致且适合产品。

## 步骤 4：将合并后的源内容推送到 Hyperlocalise

向同一个 `localise.yml` 工作流添加第二个作业：

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

这是推送边界。功能拉取请求合并到 `main` 后，`hl sync push` 会读取 `i18n.yml` 中的存储桶，并将英文 JSON 和 Markdown 源文件发送到关联的 Hyperlocalise 项目。

该作业具有只读仓库权限，因为它会发送内容，但不会修改 Git。其凭据仅存在于需要使用凭据的步骤中。`paths`过滤器可防止无关的合并操作创建不必要的同步运行。

You can run the same operation before committing:

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

更改存储桶映射时使用 `--dry-run`。它可以让你在更新远程项目之前检查计划。

## 第 5 步：一起审核产品字符串和发行说明

源内容同步完成后，请在 Hyperlocalise 中查看新内容。界面字符串和发行说明仍分别归类，但它们共用项目术语、说明和目标区域设置。

对于这个示例，审阅者应检查的不仅是字面准确性：

| 内容         | 审核问题                                          |
| --------------- | -------------------------------------------------------- |
| `filters.save`  | 这是否明确表示一个操作，而不是已保存的状态？    |
| `filters.saved` | 该术语是否与导航和设置文案一致？        |
| 描述     | 是否适合 UI 并保留“工作区”术语？ |
| 发布标题   | 是否使用与产品功能相同的名称？        |
| 发布要点 | 命令、菜单名称和用户结果是否一致？  |

当短字符串存在歧义时，请附上产品上下文或屏幕截图。只看到“保存筛选条件”时，译者无法判断它是按钮标签、提示消息还是页面标题。正是这些上下文让平台成为 CLI 的补充：Git 负责移动文件，而 Hyperlocalise 则携带了做出合理语言决策所需的知识。

按照项目工作流程解决审阅评论并批准翻译，然后再将其拉回。将批准视为发布门槛，而不是行政步骤。

## 第 6 步：将审核后的翻译拉取到 GitHub

向 `localise.yml` 添加第三个作业：

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

审核后从 **Actions** 选项卡运行此作业。`hl sync pull` 会将目标内容写入 `i18n.yml` 中的路径，从而生成如下文件：

```text
locales/fr-FR.json
locales/de-DE.json
release-notes/fr-FR/v1.8.0.md
release-notes/de-DE/v1.8.0.md
```

该工作流会创建拉取请求，而不是直接提交到 `main`。这样既能保留分支保护机制，也让工程师有机会使用每种语言环境运行应用，并记录发布中包含的确切翻译。

在生产环境中，请根据你的依赖策略，将第三方 actions 固定到完整的提交 SHA。使用可移动的主版本标签可以让本教程保持易读，但不可变引用能够降低供应链风险。

## 步骤 7：测试翻译后的拉取请求

自动检查将再次运行，因为翻译拉取请求更改了 `locales/**` 和 `release-notes/**`。还要将应用自己的测试添加到必需的检查中。

至少验证：

- 每个目标目录都包含新键；
- 占位符和 ICU 参数与源文本一致；
- 翻译后的按钮适合支持的视口尺寸；
- Markdown 标题、列表、链接和代码片段仍可正确渲染；
- 产品和发行说明使用相同的功能名称；并且
- 源字符串没有泄漏到目标文件中。

审阅者还应打开渲染后的产品。文件级审阅可以发现术语错误，但无法发现按钮被截断或换行导致重要文本被隐藏的问题。

仅在这些检查通过后合并翻译拉取请求。Git 现在包含该版本已批准的语言状态。

## 步骤 8：发布多语言版本说明

GitHub Releases 只有一个发布正文，因此请将每个区域设置的内容汇编成一个 Markdown 文档。添加 `.github/workflows/release.yml`：

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

如果任何语言区域的发布说明缺失或为空，发布任务就会失败。这是有意为之的。静默回退会将不完整的发布标记为多语言；而任务失败则会明确告知团队需要将哪个文件退回审核。

同一个标签可以驱动你的构建和部署作业。如果公告正式发布前必须存在二进制文件，请让发布作业依赖于这些作业。

## 完整流程的行为方式

已完成的 GitHub 本地化工作流方向明确：

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

每个环节各司其职。拉取请求负责审查代码仓库的变更。Hyperlocalise 负责审查语言决策。标签用于发布一个不可变且已经过审查的状态。

## 常见失败模式

### PR 检查报告了不相关的翻译

确认该操作会在 `pull_request` 事件上运行，并设置 `github-diff: true`。该操作需要 `pull-requests: read`，以便获取补丁。差异范围检查适用于受支持的结构化翻译文件；如果还希望查看积压任务，请将完整项目检查安排在单独的定时任务中。

### Source push cannot authenticate

检查选定的 GitHub 环境中是否存在 `HYPERLOCALISE_API_KEY` 和 `HYPERLOCALISE_PROJECT_ID`。除非作业声明使用该环境，否则无法使用环境机密；受保护的环境可能需要等待批准。

### 拉取翻译不会产生 Git 差异

首先确认翻译工作已在名为 `HYPERLOCALISE_PROJECT_ID` 的同一项目中完成。然后检查 `i18n.yml` 中的目标路径。在本地运行 `hl sync pull --dry-run`，以检查计划的下载内容，而不覆盖文件。

### 该发布版本找不到其说明

标签和 Markdown 文件名必须完全匹配。标签 `v1.8.0` 需要 `release-notes/<locale>/v1.8.0.md`。请在两处都保留 `v`，或者通过一次有意的约定更新来更改工作流的路径构建。

### 翻译将在产品发布后提供

不要把翻译同步变成发布后的无人负责任务。应在创建标签之前要求提交翻译拉取请求，或在部署工作流中将本地化建模为明确的发布候选检查。

## 发布检查清单

在标记多语言版本之前，请确认：

- [ ] 源字符串和英文发布说明合并在一起；
- [ ] 拉取请求本地化检查已通过；
- [ ] `hl sync push` 合并后已完成；
- [ ] 目标语言已在 Hyperlocalise 中审核并批准；
- [ ] `hl sync pull` 已发起翻译拉取请求；
- [ ] 自动化、语言和视觉检查已通过；
- [ ] 翻译拉取请求已合并；并且
- [ ] 每个发行说明语言区域都有一个与标签匹配的非空文件。

## 将本地化纳入发布流程

GitHub 本地化的重要部分不是 YAML，而是一系列可追责的交接。

The `hyperlocalise` CLI 将代码仓库文件连接到平台。GitHub Action 可让工程师快速了解字符串变更。Hyperlocalise 为语言审核人员提供 Git 单独无法提供的上下文和审批工作流。最终标签会准确发布团队审核过的内容。

这就将本地化从开发之后的任务转变为发布本身的一部分。

[探索 Hyperlocalise 的产品本地化](/use-cases/product-localisation)，连接您的代码库、审核工作流和多语言发布。
