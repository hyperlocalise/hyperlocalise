---
title: "Bản địa hóa React Intl và ICU: Trích xuất, đồng bộ và đánh giá với Hyperlocalise"
date: 2026-09-24T00:00:00.000Z
excerpt: Tích hợp react-intl và cú pháp thông điệp ICU vào quy trình làm việc tích hợp sẵn trong repo—trích xuất catalog bằng Hyperlocalise CLI, xác thực số nhiều trong các pull request, duyệt trong Hyperlocalise và đưa JSON đã dịch lên môi trường production.
category: Kỹ thuật
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

React Intl lưu trữ nội dung hiển thị cho người dùng trong TypeScript, nhưng người dịch và CI cần một danh mục ổn định trên đĩa. Cú pháp ICU—số nhiều, lựa chọn, số và ngày tháng—phải được giữ nguyên trong quá trình chuyển giao đó để không gây lỗi khi chạy.

This guide shows how to connect **react-intl**, **ICU**, and the **`hyperlocalise` CLI** into one workflow:

1. Engineers write messages in `defineMessages` and `<FormattedMessage />`.
2. `hl extract` refreshes the English FormatJS catalog from source.
3. GitHub kiểm tra pull request để phát hiện sai lệch, khóa bị thiếu và lỗi cấu trúc ICU.
4. `hl sync push` sends the catalog to Hyperlocalise for review.
5. `hl sync pull` and `hl pack` bring reviewed translations back into `lang/*.json` for your app.

The pattern matches how Hyperlocalise dogfoods its own web app. For release notes and non-React JSON in the same repository, combine this tutorial with the [GitHub localisation workflow from pull request to multilingual release](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release).

## Những gì chúng ta sẽ xây dựng

Giả sử một ứng dụng Next.js hoặc Vite React có cấu trúc như sau:

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

English (`en-US`) is the source locale. French and German are targets. Message ids and `defaultMessage` values live in `*.messages.ts` files (client modules) and in occasional inline descriptors. Extracted JSON is what Hyperlocalise syncs; packed JSON is what many apps import at runtime.

Bạn sẽ cần:

- a Hyperlocalise project with `en-US` as source and your target locales;
- `HYPERLOCALISE_API_KEY` and `HYPERLOCALISE_PROJECT_ID` as GitHub Actions secrets; and
- `react-intl` (or `@formatjs/intl`) already installed in the app.

## Bước 1: viết các thông điệp react-intl có hỗ trợ ICU

Giữ nội dung sản phẩm trong các bộ mô tả thông điệp, không rải rác dưới dạng chuỗi ký tự. Dùng ID tường minh để việc trích xuất và đánh giá vẫn ổn định khi câu chữ thay đổi.

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

Use ICU inside `defaultMessage` when copy depends on numbers or enums. React Intl evaluates the full message at runtime; translators must preserve `{count, plural, ...}` and `{scope, select, ...}` skeletons while changing the human-readable branches.

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

Avoid `--flatten` on ICU messages you intend to ship as single react-intl units. Flattening hoists plural and select branches for specialized translation workflows; it is not the default for runtime catalogs.

## Step 2: map catalogs in `i18n.yml`

Create `i18n.yml` at the repository root (or under your app directory if the monorepo keeps config next to the UI):

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

Hyperlocalise treats FormatJS JSON as first-class content: each key is a message id, each value includes `defaultMessage` and optional `description`. ICU strings stay one value per id—`run`, `check`, and sync do not sentence-split them.

Pin the CLI version in `i18n.yml` (or pin the install action) so local machines and GitHub Actions run the same extractor and validators.

## Bước 3: trích xuất danh mục nguồn bằng CLI

From the directory that contains `i18n.yml`, refresh the English catalog:

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

`extract` scans `.ts` and `.tsx` for descriptors in:

- `defineMessage` / `defineMessages`
- `intl.formatMessage(...)`
- `<FormattedMessage ... />`

Nó ghi JSON FormatJS theo định dạng nghiêm ngặt:

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {No saved filters yet} one {# saved filter} other {# saved filters}}",
    "description": "Banner summary of how many filters the user saved"
  }
}
```

If a descriptor omits `id`, the CLI generates a FormatJS-compatible hash from `defaultMessage` and `description`. Explicit ids are easier to review in diffs and in Hyperlocalise.

Commit `lang/en-US.json` together with the code change. Treat a missing extract commit the same way you would a missing migration: the platform never sees new strings until the catalog updates.

Optional: `--prefix-id` prefixes ids with the normalized file path (`src.components.saved-filters-banner.title`). Pair it with `hl pack --prefix-id` when runtime bundles expect short ids. The examples here use stable logical ids instead.

## Step 4: guard pull requests with extract and `check`

Add `.github/workflows/localise.yml`:

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

Hai cổng hoạt động cùng nhau:

1. **Extract drift** — if someone edits `defaultMessage` in code but forgets `hl extract`, the job fails on `git diff`.
2. **`hyperlocalise check`** — with `github-diff: true`, validates changed keys in `lang/en-US.json` and targets for problems such as `not_localized`, `placeholder_mismatch`, and **`icu_shape_mismatch`**.

That last check matters for ICU: a French string that drops `{count, plural, ...}` or permutes branches may look fine to a human skimming JSON but will fail at runtime. Catching shape drift in CI is cheaper than catching it in production.

Chạy các bước kiểm tra tương tự trên máy của bạn trước khi đẩy:

```bash
hl extract src --out-file lang/en-US.json --ignore "**/*.test.ts" --ignore "**/*.test.tsx"
git diff --exit-code -- lang/en-US.json
hl check --bucket ui
```

## Bước 5: đẩy danh mục đã trích xuất lên sau khi hợp nhất

Thêm một công việc push vào cùng quy trình làm việc:

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

After merge, `hl sync push` uploads `lang/en-US.json` to the linked Hyperlocalise project. Re-running extract on `main` avoids a race where code merged without a matching catalog in Git.

Use `hl sync push --dry-run` when you change bucket paths or locale lists.

## Bước 6: xem lại các thông điệp ICU trong Hyperlocalise

Người dịch nên thấy toàn bộ thông điệp ICU, chứ không phải các đoạn tiếng Anh riêng lẻ. Khi rà soát, hãy đặt những câu hỏi đặc thù theo ngôn ngữ mà ICU ẩn trong một chuỗi duy nhất:

| Tin nhắn                    | Câu hỏi đánh giá                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `filters.banner.savedCount` | Do `=0`, `one`, and `other` branches read naturally? Does `#` expand correctly for each locale’s plural rules? |
| `filters.banner.scope`      | Does `select` cover every `scope` value the app sends? Is `other` a safe fallback?                             |
| Nhãn ngắn                | Các chuỗi đã dịch vẫn vừa với các nút sau khi mở rộng dạng số nhiều?                                                |

Đính kèm ảnh chụp màn hình khi có nhánh số nhiều trong bố cục bị giới hạn. Hyperlocalise lưu bảng thuật ngữ và hướng dẫn dự án cùng với phân đoạn—CLI chỉ di chuyển các tệp.

Phê duyệt các bản dịch trên nền tảng trước khi kéo chúng về. Việc phê duyệt là cổng kiểm duyệt ngôn ngữ; Git ghi nhận những gì thực sự được phát hành.

## Bước 7: tải bản dịch và đóng gói để chạy

Thêm một tác vụ kéo thủ công:

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

Ví dụ về mục tiếng Pháp được đóng gói:

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {Aucun filtre enregistré} one {# filtre enregistré} other {# filtres enregistrés}}"
  }
}
```

Open the translation pull request in the app, switch locales, and exercise `count = 0`, `count = 1`, and `count = 5`. ICU regressions often appear only on non-English plural rules.

## Bước 8: tải danh mục vào ứng dụng.

Import packed locale files and map them into `IntlProvider` or `createIntl`:

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

Some teams keep English defaults only in source code and load JSON for targets only—both patterns work if `defaultMessage` in code and `lang/en-US.json` stay aligned via extract.

## Cách toàn bộ quy trình hoạt động

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

Trích xuất kết nối mã nguồn với các danh mục. Đồng bộ kết nối các danh mục với người đánh giá. Đóng gói kết nối JSON đã được duyệt với gói ứng dụng của bạn.

## Các lỗi thường gặp

### Pull request không thành công do dữ liệu trích xuất bị sai lệch

Run `hl extract` locally with the same `--ignore` patterns as CI, commit `lang/en-US.json`, and push. If ids jump unexpectedly, confirm descriptors include stable `id` fields.

### `icu_shape_mismatch` on an otherwise “good” translation

Compare branch order and placeholder names to `en-US`. Run `hl check --check icu_shape_mismatch --locale fr-FR` locally. Fix the target JSON or send the segment back to review—do not silence the check for real ICU messages.

### Runtime shows `MISSING_TRANSLATION` or English in a target locale

Confirm the translation pull request merged, `hl pack` ran, and imports point at the packed files. Verify message ids in code match keys in JSON (including any `--prefix-id` convention).

### `hl sync pull` changes nothing

Confirm approvals in the project referenced by `HYPERLOCALISE_PROJECT_ID`. Run `hl sync pull --dry-run`. Ensure `i18n.yml` `to:` paths match where the app imports catalogs.

### Các tệp đã nén bị loại bỏ ICU do nhầm lẫn

Use default `hl pack` on FormatJS JSON—it keeps `defaultMessage` intact. Do not run pack with workflows meant for plain nested JSON unless that is your catalog shape.

## Danh sách kiểm tra phát hành

Trước khi phát hành một tính năng phụ thuộc vào nội dung mới:

- [ ] Message descriptors merged with extracted `lang/en-US.json`
- [ ] Pull request extract and `hyperlocalise check` passed
- [ ] `hl sync push` ran on `main`
- [ ] Các ngôn ngữ đích đã được xem xét và phê duyệt trong Hyperlocalise
- [ ] Translation pull request merged (`sync pull` + `pack`)
- [ ] Manual QA on plural and `select` branches per locale
- [ ] Production deploy uses the merged `lang/*.json` artifacts

## Giữ phần trích xuất trong vòng lặp

React Intl encourages colocated copy; Hyperlocalise encourages reviewed, file-backed translations. The **`hl extract`** command bridges those worlds without adopting a separate FormatJS CLI for basic catalogs.

Use **`check`** to protect ICU shape in pull requests. Use **sync** for reviewer workflow. Use **`pack`** so production bundles stay lean while translators keep rich metadata in Git between pulls.

For a wider GitHub release story—including Markdown release notes alongside UI strings—continue with [GitHub localisation workflow: from pull request to multilingual release](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release), or [explore product localisation on Hyperlocalise](/use-cases/product-localisation).
