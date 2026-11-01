---
title: "React Intl 与 ICU 本地化：使用 Hyperlocalise 提取、同步和审核"
date: 2026-09-24T00:00:00.000Z
excerpt: 将 react-intl 和 ICU 消息语法接入适配代码仓库的工作流——使用 Hyperlocalise CLI 提取目录，在拉取请求中验证复数形式，在 Hyperlocalise 中审核，并将翻译后的 JSON 发布到生产环境。
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

React Intl 将面向用户的文案保存在 TypeScript 中，但译者和 CI 需要磁盘上有一份稳定的目录。ICU 语法——复数、选择项、数字和日期——必须在交接过程中保持不变，以免运行时出错。

本指南展示如何将 **react-intl**、**ICU** 和 **`hyperlocalise` CLI** 集成到一个工作流中：

1. Engineers write messages in `defineMessages` and `<FormattedMessage />`.
2. `hl extract` 从源代码刷新英文 FormatJS 目录。
3. GitHub 会检查拉取请求是否存在偏差、缺失的键以及 ICU 格式问题。
4. `hl sync push`将目录发送给 Hyperlocalise 进行审核。
5. `hl sync pull` 和 `hl pack` 会将已审核的翻译带回 `lang/*.json`，供您的应用使用。

这种模式与 Hyperlocalise 自用其 Web 应用的方式相符。对于同一代码仓库中的发布说明和非 React JSON，请将本教程与[从拉取请求到多语言发布的 GitHub 本地化工作流](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release)结合使用。

## 我们将构建什么

假设一个 Next.js 或 Vite React 应用采用以下目录结构：

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

英语 (`en-US`) 是源语言区域。法语和德语是目标语言。消息 ID 和 `defaultMessage` 值位于 `*.messages.ts` 文件（客户端模块）中，偶尔也会出现在内联描述符中。Hyperlocalise 会同步提取出的 JSON；许多应用会在运行时导入打包后的 JSON。

你需要：

- 一个 Hyperlocalise 项目，以 `en-US` 为源语言，并使用你的目标区域设置；
- 并将 `HYPERLOCALISE_API_KEY` 和 `HYPERLOCALISE_PROJECT_ID` 设为 GitHub Actions 密钥；并且
- `react-intl`（或 `@formatjs/intl`）已安装在应用中。

## 第 1 步：编写支持 ICU 的 react-intl 消息

将产品文案放在消息描述符中，不要散落在字符串字面量里。使用显式 ID，以便在文案更改时仍能稳定地提取和审核。

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

对于你打算作为单个 react-intl 单元发布的 ICU 消息，请避免使用 `--flatten`。扁平化会提取复数和 select 分支，以供专门的翻译工作流使用；它不是运行时目录的默认处理方式。

## 第 2 步：映射目录 `i18n.yml`

在仓库根目录（如果 monorepo 将配置与 UI 放在一起，则在你的应用目录下）创建 `i18n.yml`：

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

Hyperlocalise 将 FormatJS JSON 视为一等内容：每个键都是一个消息 ID，每个值都包含 `defaultMessage`，并可选包含 `description`。ICU 字符串在每个 ID 下保持为单个值——`run`、`check` 和 sync 不会将它们拆分成句子。

将 `i18n.yml` 中的 CLI 版本固定（或固定安装操作），以便本地计算机和 GitHub Actions 运行相同的提取器和验证器。

## 步骤 3：使用 CLI 提取源目录

从包含`i18n.yml`的目录中，刷新英语目录：

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

`extract` 会扫描 `.ts` 和 `.tsx` 中的描述符：

- `defineMessage` / `defineMessages`
- `intl.formatMessage(...)`
- `<FormattedMessage ... />`

它会写入严格符合 FormatJS 规范的 JSON：

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {No saved filters yet} one {# saved filter} other {# saved filters}}",
    "description": "Banner summary of how many filters the user saved"
  }
}
```

如果描述符省略 `id`，CLI 会根据 `defaultMessage` 和 `description` 生成与 FormatJS 兼容的哈希值。显式 ID 在差异对比和 Hyperlocalise 中更便于审核。

将提取提交 `lang/en-US.json` 与代码更改一同提交。把缺少提取提交视同缺少迁移：目录更新前，平台永远不会看到新字符串。

可选：`--prefix-id` 会在 ID 前添加规范化文件路径（`src.components.saved-filters-banner.title`）。当运行时包需要短 ID 时，将它与 `hl pack --prefix-id` 配对使用。此处的示例使用稳定的逻辑 ID。

## 步骤 4：使用 extract 和 `check` 保护拉取请求

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

两道闸门协同工作：

1. **提取内容漂移** — 如果有人在代码中编辑了 `defaultMessage`，却忘了编辑 `hl extract`，任务就会在 `git diff` 失败。
2. **`hyperlocalise check`** — 与 `github-diff: true` 配合使用，可验证 `lang/en-US.json` 中已更改的键和目标是否存在 `not_localized`、`placeholder_mismatch` 和 **`icu_shape_mismatch`** 等问题。

最后这项检查对 ICU 很重要：法语字符串如果漏掉 `{count, plural, ...}` 或调整了分支顺序，人工快速浏览 JSON 时可能看不出问题，但运行时就会出错。在 CI 中发现结构偏差，比在生产环境中发现要便宜得多。

推送前在本地运行相同的检查：

```bash
hl extract src --out-file lang/en-US.json --ignore "**/*.test.ts" --ignore "**/*.test.tsx"
git diff --exit-code -- lang/en-US.json
hl check --bucket ui
```

## 步骤 5：合并后推送提取出的语言目录

在同一工作流中添加一个 push 作业：

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

合并后，`hl sync push` 会将 `lang/en-US.json` 上传到关联的 Hyperlocalise 项目。在 `main` 上重新运行 extract，可避免代码已合并但 Git 中没有匹配的目录文件所导致的竞态问题。

更改存储桶路径或语言区域列表时，请使用 `hl sync push --dry-run`。

## 第 6 步：在 Hyperlocalise 中检查 ICU 消息

译者应查看完整的 ICU 消息，而不是孤立的英文片段。在审核时，应针对 ICU 字符串中未体现的语言区域特定问题进行提问：

| 消息                     | 审核问题                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `filters.banner.savedCount` | `=0`、`one` 和 `other` 分支读起来是否自然？`#` 是否能根据每种语言区域的复数规则正确展开？ |
| `filters.banner.scope`      | `select` 是否涵盖应用发送的每个 `scope` 值？`other` 是安全的回退选项吗？                             |
| 短标签                | 复数展开后，翻译后的字符串仍然能放进按钮吗？                                                |

当复数分支出现在受限布局中时，请附上屏幕截图。Hyperlocalise 会将术语表和项目说明与文本片段一同保存，CLI 仅负责移动文件。

请先在平台中批准译文，再将其拉取回来。审批是语言准入关卡；Git 会记录实际发布的内容。

## 步骤 7：拉取翻译并打包以供运行时使用

添加手动拉取作业：

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

打包法语条目的示例：

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {Aucun filtre enregistré} one {# filtre enregistré} other {# filtres enregistrés}}"
  }
}
```

在应用中打开翻译拉取请求，切换语言区域，并测试 `count = 0`、`count = 1` 和 `count = 5`。ICU 回归问题通常只会在非英语复数规则下出现。

## 第 8 步：在应用中加载目录

导入打包后的区域设置文件，并将它们映射到 `IntlProvider` 或 `createIntl`：

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

有些团队只在源代码中保留英文默认值，并仅为目标语言加载 JSON——只要代码中的 `defaultMessage` 和 `lang/en-US.json` 通过 extract 保持一致，这两种模式都可行。

## 完整流程如何运行

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

提取将代码连接到目录。同步将目录连接到审核者。打包将审核后的 JSON 接入你的构建包。

## 常见失败模式

### 拉取请求因提取内容漂移而失败

Run `hl extract` locally with the same `--ignore` patterns as CI, commit `lang/en-US.json`, and push. If ids jump unexpectedly, confirm descriptors include stable `id` fields.

### `icu_shape_mismatch`在一份其他方面都“不错”的翻译中

将分支顺序和占位符名称与 `en-US` 进行比较。在本地运行 `hl check --check icu_shape_mismatch --locale fr-FR`。修复目标 JSON 或将该片段退回审核——不要对真实 ICU 消息屏蔽此检查。

### 运行时会在目标语言区域中显示 `MISSING_TRANSLATION` 或英文

确认翻译拉取请求已合并、`hl pack` 已运行，并且导入指向打包后的文件。验证代码中的消息 ID 与 JSON 中的键匹配（包括任何 `--prefix-id` 约定）。

### `hl sync pull`不会改变任何内容

确认 `HYPERLOCALISE_PROJECT_ID` 中引用的项目的审批。运行 `hl sync pull --dry-run`。确保 `i18n.yml` `to:` 路径与应用导入目录的位置一致。

### 打包文件被误剥离了 ICU

在 FormatJS JSON 中使用默认的 `hl pack`，它会保持 `defaultMessage` 完好。除非你的目录结构就是普通嵌套 JSON，否则不要使用相应的工作流运行 pack。

## 发布检查清单

在发布依赖新文案的功能之前：

- [ ] 消息描述符与提取的 `lang/en-US.json` 合并了
- [ ] 拉取请求摘录和 `hyperlocalise check` 已通过
- [ ] `hl sync push` 在 `main` 上运行
- [ ] 已在 Hyperlocalise 中审核并批准目标语言区域
- [ ] 翻译拉取请求已合并 (`sync pull` + `pack`)
- [ ] 针对每个语言环境的复数和 `select` 分支进行手动 QA
- [ ] 生产部署使用合并后的 `lang/*.json` 构建产物

## 让提取任务也保持同步。

React Intl 鼓励将文案与代码放在一起；Hyperlocalise 则鼓励使用经过审核、基于文件的翻译。**`hl extract`** 命令在不采用单独的 FormatJS CLI 来管理基础目录的情况下，连接了这两种方式。

在拉取请求中使用 **`check`** 保护 ICU 结构。使用 **sync** 进行审核者工作流。使用 **`pack`**，让生产环境的 bundle 保持精简，同时让译者在两次拉取之间将丰富的元数据保留在 Git 中。

如需了解更全面的 GitHub 发布流程，包括 UI 字符串和 Markdown 发布说明，请继续阅读 [GitHub 本地化工作流：从拉取请求到多语言发布](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release)，或 [探索 Hyperlocalise 上的产品本地化](/use-cases/product-localisation)。
