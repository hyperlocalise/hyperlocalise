---
title: "React Intl 和 ICU 本地化：使用 Hyperlocalise 提取、同步和审核"
date: 2026-09-24T00:00:00.000Z
excerpt: 将 react-intl 和 ICU 消息语法接入原生仓库工作流——使用 Hyperlocalise CLI 提取翻译目录，在拉取请求中验证复数规则，在 Hyperlocalise 中审核，并将翻译后的 JSON 部署到生产环境。
category: 工程
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

React Intl 将面向用户的文案保存在 TypeScript 中，但译者和 CI 需要磁盘上有一份稳定的目录。ICU 语法（复数、选择、数字和日期）必须在交接过程中保持不变，以免运行时出错。

本指南将展示如何将 **react-intl**、**ICU** 和 **`hyperlocalise` CLI** 整合到一个工作流中：

1. 工程师用 `defineMessages` 和 `<FormattedMessage />` 编写消息。
2. `hl extract` 从源文件刷新英文 FormatJS 目录。
3. GitHub 会检查拉取请求是否存在偏差、缺失键和 ICU 结构问题。
4. `hl sync push` 将目录发送给 Hyperlocalise 进行审核。
5. `hl sync pull` 和 `hl pack` 会将审核后的翻译带回 `lang/*.json`，供您的应用使用。

这种模式展示了 Hyperlocalise 如何在自己的 Web 应用中使用 dogfooding。对于同一代码库中的发行说明和非 React JSON，请将本教程与[从拉取请求到多语言发布的 GitHub 本地化工作流](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release)结合使用。

## 我们将构建的内容

假设一个采用以下目录结构的 Next.js 或 Vite React 应用：

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

英语（`en-US`）是源语言区域。法语和德语是目标语言区域。消息 ID 和 `defaultMessage` 值位于 `*.messages.ts` 文件（客户端模块）中，也偶尔出现在内联描述符中。Hyperlocalise 会同步提取的 JSON；许多应用会在运行时导入打包后的 JSON。

你将需要：

- 一个 Hyperlocalise 项目，以 `en-US` 为源语言及您的目标区域设置；
- 并将`HYPERLOCALISE_API_KEY`和`HYPERLOCALISE_PROJECT_ID`作为 GitHub Actions 密钥；并
- `react-intl`（或 `@formatjs/intl`）已安装在应用中。

## 步骤 1：编写支持 ICU 的 react-intl 消息

将产品文案集中放在消息描述符中，而不要散落为字符串字面量。使用明确的 ID，以便在措辞更改时，提取和审核流程保持稳定。

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

当文案取决于数字或枚举值时，请在`defaultMessage`中使用 ICU。React Intl 会在运行时评估完整消息；翻译人员必须保留`{count, plural, ...}`和`{scope, select, ...}`骨架，同时更改人类可读的分支。

在页面组件中，通过`formatMessage`或`<FormattedMessage />`传递 ICU 值：

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

**服务器组件：**不要从仅限服务器端的模块导入 `*.messages.ts`——`defineMessages` 仅限客户端使用。请将 UI 标记为 `"use client"`，或在服务器端使用内联 `{ id, defaultMessage, description }` 对象和 `getIntlShape(locale).formatMessage()`。请参阅框架的 react-intl 边界说明；提取步骤仍会在其扫描的 `.ts` 和 `.tsx` 文件中查找描述符。

对于打算作为单个 react-intl 单元发布的 ICU 消息，请避免使用 `--flatten`。扁平化会将复数和选择分支提取出来，以便用于专门的翻译工作流；这并非运行时目录的默认做法。

## 第 2 步：映射目录 `i18n.yml`

在仓库根目录（如果 monorepo 将配置文件放在 UI 旁边，则在你的应用目录下）创建 `i18n.yml`：

```yaml
version: hyperlocalise@1.12.1

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

Hyperlocalise 将 FormatJS JSON 视为一等内容：每个键都是一个消息 ID，每个值都包含 `defaultMessage`，并可选择包含 `description`。ICU 字符串在每个 ID 下保持为单个值——`run`、`check` 和 sync 不会对它们进行句子拆分。

将 CLI 版本固定在 `i18n.yml`（或固定安装操作），以确保本地计算机和 GitHub Actions 运行相同的提取器和验证器。

## 第 3 步：使用 CLI 提取源目录

从包含`i18n.yml`的目录中，刷新英文目录：

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

在 `extract` 和 `.ts` 中扫描 `.tsx`，查找以下位置的描述符：

- `defineMessage` / `defineMessages`
- `intl.formatMessage(...)`
- `<FormattedMessage ... />`

它会写入严格的 FormatJS JSON：

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {No saved filters yet} one {# saved filter} other {# saved filters}}",
    "description": "Banner summary of how many filters the user saved"
  }
}
```

如果描述符省略 `id`，CLI 会根据 `defaultMessage` 和 `description` 生成与 FormatJS 兼容的哈希。显式指定的 ID 更便于在差异中和 Hyperlocalise 中审核。

将 `lang/en-US.json` 与代码更改一并提交。将缺失的提取提交视同缺失的迁移：在目录更新之前，平台永远看不到新字符串。

可选：`--prefix-id` 会在 id 前加上规范化文件路径（`src.components.saved-filters-banner.title`）。当运行时 bundle 需要短 id 时，将它与 `hl pack --prefix-id` 配对使用。此处的示例使用的是稳定的逻辑 id。

## 第 4 步：使用 extract 和 `check`保护拉取请求

添加 `.github/workflows/localise.yml`：

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

两道门协同工作：

1. **提取漂移** — 如果有人在代码中编辑了 `defaultMessage`，却忘了 `hl extract`，任务就会在 `git diff` 失败。
2. **`hyperlocalise check`** — 与 `github-diff: true` 配合使用，可检查 `lang/en-US.json` 中已更改的键和目标是否存在 `not_localized`、`placeholder_mismatch` 和 **`icu_shape_mismatch`** 等问题。

最后一项检查对 ICU 至关重要：法语字符串如果遗漏了 `{count, plural, ...}` 或调整了分支顺序，人工快速浏览 JSON 时可能看不出问题，但运行时会出错。在 CI 中发现结构偏差，比在生产环境中发现要省钱得多。

推送前在本地运行相同的检查：

```bash
hl extract src --out-file lang/en-US.json --ignore "**/*.test.ts" --ignore "**/*.test.tsx"
git diff --exit-code -- lang/en-US.json
hl check --bucket ui
```

## 第 5 步：合并后推送提取出的语言目录

向同一工作流添加一个 push 作业：

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

合并后，`hl sync push` 会将 `lang/en-US.json` 上传到关联的 Hyperlocalise 项目。在 `main` 上重新运行 extract，可避免代码已合并但 Git 中尚无匹配翻译资源的竞态问题。

更改存储桶路径或区域设置列表时使用 `hl sync push --dry-run`。

## 第 6 步：在 Hyperlocalise 中审核 ICU 消息

翻译人员应看到完整的 ICU 消息，而不是孤立的英文片段。在审核时，询问那些因 ICU 将内容合并为单个字符串而隐藏的、与语言区域相关的问题：

| 消息                        | 审核问题                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `filters.banner.savedCount` | `=0`、`one` 和 `other` 分支读起来自然吗？`#` 是否能根据每种语言环境的复数规则正确展开？ |
| `filters.banner.scope`      | `select` 是否涵盖应用发送的每个 `scope` 值？`other` 是安全的备用方案吗？                             |
| 短标签                | 翻译后的字符串在复数扩展后仍能放进按钮吗？                                                |

当复数分支出现在受限布局中时，请附上屏幕截图。Hyperlocalise 会将术语表和项目说明与片段一并保留——CLI 只负责移动文件。

在拉取译文之前，请先在平台中批准译文。批准是语言审核关卡；Git 会记录实际发布的内容。

## 步骤 7：拉取翻译并打包以供运行时使用

添加一个手动拉取作业：

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

`sync pull`以 FormatJS 格式写入`lang/fr-FR.json`和`lang/de-DE.json`（包含 id、`defaultMessage`，有时还包含`description`）。`hl pack`会移除`description`和其他元数据，同时保留每个`defaultMessage`中的 ICU——可供按语言区域导入 JSON 的打包工具使用。

打包的法语条目示例：

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {Aucun filtre enregistré} one {# filtre enregistré} other {# filtres enregistrés}}"
  }
}
```

在应用中打开翻译拉取请求，切换语言区域，并测试 `count = 0`、`count = 1` 和 `count = 5`。ICU 回归问题通常只会在非英语复数规则下出现。

## 步骤 8：在应用中加载翻译目录

导入打包的区域设置文件，并将其映射到 `IntlProvider` 或 `createIntl`：

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

有些团队只在源代码中保留英文默认值，而只为目标语言加载 JSON——只要代码中的 `defaultMessage` 和 `lang/en-US.json` 通过 extract 保持一致，这两种模式都可行。

## 完整流程的行为方式

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

提取将代码与翻译目录连接起来。同步将翻译目录与审核人员连接起来。打包将审核后的 JSON 纳入你的构建包。

## 常见失败模式

### 拉取请求因提取内容漂移而失败

在本地使用与 CI 相同的 `--ignore`模式运行 `hl extract`，提交 `lang/en-US.json` 并推送。如果 ID 意外跳变，请确认描述符包含稳定的 `id`字段。

### `icu_shape_mismatch` 在一份其他方面都“不错”的译文中

将分支顺序和占位符名称与`en-US`进行比较。在本地运行`hl check --check icu_shape_mismatch --locale fr-FR`。修复目标 JSON，或将该片段退回审核——对于真正的 ICU 消息，不要屏蔽此检查。

### 运行时会在目标区域设置中显示 `MISSING_TRANSLATION` 或英文

确认翻译拉取请求已合并、`hl pack` 已运行，并且导入指向打包后的文件。验证代码中的消息 ID 与 JSON 中的键相匹配（包括任何 `--prefix-id` 约定）。

### `hl sync pull`不会改变任何内容

确认 `HYPERLOCALISE_PROJECT_ID` 引用的项目中的审批。运行 `hl sync pull --dry-run`。确保 `i18n.yml` `to:` 路径与应用导入目录的位置相匹配。

### 打包文件中的 ICU 被错误移除

对 FormatJS JSON 使用默认的 `hl pack`——它会保持 `defaultMessage` 完整。除非你的目录结构是普通嵌套 JSON，否则不要使用针对普通嵌套 JSON 的工作流运行 pack。

## 发布检查清单

在发布依赖新文案的功能之前：

- [ ] 消息描述符与提取的 `lang/en-US.json` 合并了
- [ ] 拉取请求提取和`hyperlocalise check`已通过
- [ ] `hl sync push` 在 `main` 上运行
- [ ] 目标语言区域已在 Hyperlocalise 中审核并批准
- [ ] 翻译拉取请求已合并 (`sync pull` + `pack`)
- [ ] 按语言环境对复数和 `select` 分支进行手动 QA
- [ ] 生产环境部署使用合并后的 `lang/*.json`构件

## 让提取工具及时了解情况。

React Intl 鼓励将文案与代码共置；Hyperlocalise 鼓励使用经过审核的文件翻译。**`hl extract`** 命令连接了这两个世界，无需为基础目录采用单独的 FormatJS CLI。

使用 **`check`**，以在拉取请求中保护 ICU 结构。使用 **sync** 进行审核者工作流。使用 **`pack`**，这样既能保持生产包精简，又能让译者在两次拉取之间将丰富的元数据保留在 Git 中。

如需了解更全面的 GitHub 发布流程——包括 Markdown 发布说明和 UI 字符串——请继续阅读[GitHub 本地化工作流程：从拉取请求到多语言发布](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release)，或[探索 Hyperlocalise 上的产品本地化](/use-cases/product-localisation)。
