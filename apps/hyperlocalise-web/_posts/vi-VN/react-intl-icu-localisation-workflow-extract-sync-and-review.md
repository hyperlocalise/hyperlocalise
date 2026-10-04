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

Hướng dẫn này chỉ cách kết nối **react-intl**, **ICU** và **CLI `hyperlocalise`** thành một quy trình làm việc:

1. Các kỹ sư viết thông điệp bằng `defineMessages` và `<FormattedMessage />`.
2. `hl extract` làm mới danh mục FormatJS tiếng Anh từ nguồn.
3. GitHub kiểm tra pull request để phát hiện sai lệch, khóa bị thiếu và lỗi cấu trúc ICU.
4. `hl sync push` gửi danh mục đến Hyperlocalise để xem xét.
5. `hl sync pull` và `hl pack` đưa các bản dịch đã được duyệt trở lại `lang/*.json` cho ứng dụng của bạn.

Mẫu này phản ánh cách Hyperlocalise tự sử dụng ứng dụng web của mình. Đối với ghi chú phát hành và JSON không dùng React trong cùng kho lưu trữ, hãy kết hợp hướng dẫn này với [quy trình bản địa hóa GitHub từ pull request đến bản phát hành đa ngôn ngữ](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release).

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

Tiếng Anh (`en-US`) là ngôn ngữ nguồn. Tiếng Pháp và tiếng Đức là ngôn ngữ đích. Mã thông báo và giá trị `defaultMessage` nằm trong các tệp `*.messages.ts` (mô-đun phía máy khách) và đôi khi trong các bộ mô tả nội tuyến. Hyperlocalise đồng bộ hóa dữ liệu từ JSON đã trích xuất; nhiều ứng dụng nhập JSON đã đóng gói khi chạy.

Bạn sẽ cần:

- một dự án Hyperlocalise với `en-US` làm ngôn ngữ nguồn và các ngôn ngữ đích của bạn;
- `HYPERLOCALISE_API_KEY` và `HYPERLOCALISE_PROJECT_ID` dưới dạng secrets của GitHub Actions; và
- `react-intl` (hoặc `@formatjs/intl`) đã được cài đặt trong ứng dụng.

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

Sử dụng ICU bên trong `defaultMessage` khi nội dung phụ thuộc vào số hoặc enum. React Intl đánh giá toàn bộ thông điệp trong thời gian chạy; người dịch phải giữ nguyên các khung `{count, plural, ...}` và `{scope, select, ...}`, đồng thời thay đổi các nhánh hiển thị nội dung dễ hiểu.

Trong một thành phần trang, truyền các giá trị ICU thông qua `formatMessage` hoặc `<FormattedMessage />`:

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

**Thành phần Server:** không import `*.messages.ts` từ các mô-đun chỉ dành cho server—`defineMessages` chỉ dành cho client. Hãy đánh dấu giao diện người dùng bằng `"use client"` hoặc dùng các đối tượng `{ id, defaultMessage, description }` nội tuyến với `getIntlShape(locale).formatMessage()` trên server. Xem ranh giới react-intl của framework bạn; bước trích xuất vẫn tìm thấy các descriptor trong các tệp `.ts` và `.tsx` mà nó quét.

Tránh `--flatten` trên các thông điệp ICU mà bạn định phát hành dưới dạng đơn vị react-intl riêng lẻ. Việc làm phẳng đưa các nhánh số nhiều và lựa chọn lên cấp cao hơn để phục vụ quy trình dịch chuyên biệt; đây không phải là tùy chọn mặc định cho danh mục runtime.

## Bước 2: ánh xạ danh mục trong `i18n.yml`

Tạo `i18n.yml` tại thư mục gốc của kho lưu trữ (hoặc trong thư mục ứng dụng của bạn nếu monorepo lưu cấu hình bên cạnh giao diện người dùng):

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

Hyperlocalise xem FormatJS JSON là nội dung hạng nhất: mỗi khóa là một mã thông báo, mỗi giá trị bao gồm `defaultMessage` và `description` tùy chọn. Các chuỗi ICU luôn là một giá trị cho mỗi mã thông báo—`run`, `check` và nội dung đồng bộ không chia chúng thành các câu riêng.

Cố định phiên bản CLI trong `i18n.yml` (hoặc cố định phiên bản của action cài đặt) để máy cục bộ và GitHub Actions chạy cùng một trình trích xuất và các trình xác thực.

## Bước 3: trích xuất danh mục nguồn bằng CLI

Từ thư mục chứa `i18n.yml`, làm mới danh mục tiếng Anh:

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

`extract` quét `.ts` và `.tsx` để tìm bộ mô tả trong:

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

Nếu descriptor không có `id`, CLI sẽ tạo một mã băm tương thích với FormatJS từ `defaultMessage` và `description`. ID tường minh giúp dễ xem xét hơn trong các bản diff và trong Hyperlocalise.

Commit `lang/en-US.json` cùng với thay đổi mã. Hãy coi việc thiếu commit trích xuất giống như thiếu migration: nền tảng sẽ không thấy các chuỗi mới cho đến khi catalog được cập nhật.

Tùy chọn: `--prefix-id` thêm tiền tố đường dẫn tệp đã chuẩn hóa (`src.components.saved-filters-banner.title`) vào các id. Kết hợp với `hl pack --prefix-id` khi các gói runtime yêu cầu id ngắn. Các ví dụ ở đây sử dụng id logic ổn định.

## Bước 4: bảo vệ các pull request bằng extract và `check`

Thêm `.github/workflows/localise.yml`:

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

1. **Sai lệch bản trích xuất** — nếu ai đó chỉnh sửa `defaultMessage` trong mã nhưng quên `hl extract`, tác vụ sẽ thất bại ở `git diff`.
2. **`hyperlocalise check`** — cùng với `github-diff: true`, xác thực các khóa đã thay đổi trong `lang/en-US.json` và các mục tiêu để tìm các vấn đề như `not_localized`, `placeholder_mismatch` và **`icu_shape_mismatch`**.

Lần kiểm tra cuối cùng đó rất quan trọng đối với ICU: một chuỗi tiếng Pháp làm mất `{count, plural, ...}` hoặc đảo thứ tự các nhánh có thể trông vẫn ổn nếu con người chỉ xem lướt JSON, nhưng sẽ gây lỗi khi chạy. Phát hiện sự sai lệch về cấu trúc trong CI sẽ tiết kiệm hơn so với phát hiện khi đã đưa vào môi trường thực tế.

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

Sau khi hợp nhất, `hl sync push` tải `lang/en-US.json` lên dự án Hyperlocalise được liên kết. Chạy lại extract trên `main` giúp tránh tình trạng chạy đua khi mã được hợp nhất mà không có danh mục tương ứng trong Git.

Sử dụng `hl sync push --dry-run` khi bạn thay đổi đường dẫn bucket hoặc danh sách ngôn ngữ.

## Bước 6: xem lại các thông điệp ICU trong Hyperlocalise

Người dịch nên thấy toàn bộ thông điệp ICU, chứ không phải các đoạn tiếng Anh riêng lẻ. Khi rà soát, hãy đặt những câu hỏi đặc thù theo ngôn ngữ mà ICU ẩn trong một chuỗi duy nhất:

| Tin nhắn                    | Câu hỏi đánh giá                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `filters.banner.savedCount` | Các nhánh `=0`, `one` và `other` có đọc tự nhiên không? `#` có được mở rộng chính xác theo quy tắc số nhiều của từng ngôn ngữ không? |
| `filters.banner.scope`      | `select` có bao quát mọi giá trị `scope` mà ứng dụng gửi không? `other` có phải là phương án dự phòng an toàn không?                             |
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

`sync pull` ghi `lang/fr-FR.json` và `lang/de-DE.json` theo định dạng FormatJS (id, `defaultMessage`, đôi khi có `description`). `hl pack` loại bỏ `description` và siêu dữ liệu khác, đồng thời giữ nguyên ICU trong từng `defaultMessage`—sẵn sàng cho các trình đóng gói nhập JSON theo từng ngôn ngữ.

Ví dụ về mục tiếng Pháp được đóng gói:

```json
{
  "filters.banner.savedCount": {
    "defaultMessage": "{count, plural, =0 {Aucun filtre enregistré} one {# filtre enregistré} other {# filtres enregistrés}}"
  }
}
```

Mở pull request bản dịch trong ứng dụng, chuyển đổi ngôn ngữ và kiểm tra `count = 0`, `count = 1` và `count = 5`. Lỗi hồi quy ICU thường chỉ xuất hiện với các quy tắc số nhiều không phải tiếng Anh.

## Bước 8: tải danh mục vào ứng dụng.

Nhập các tệp ngôn ngữ được đóng gói và ánh xạ chúng vào `IntlProvider` hoặc `createIntl`:

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

Một số nhóm chỉ giữ các giá trị mặc định tiếng Anh trong mã nguồn và chỉ tải JSON cho các ngôn ngữ đích—cả hai cách đều hoạt động nếu `defaultMessage` trong mã và `lang/en-US.json` luôn đồng bộ với nhau thông qua bước trích xuất.

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

Chạy `hl extract` cục bộ với cùng các mẫu `--ignore` như CI, commit `lang/en-US.json` rồi push. Nếu ID tăng bất ngờ, hãy xác nhận rằng các descriptor bao gồm các trường `id` ổn định.

### `icu_shape_mismatch` trên một bản dịch “tốt” về mọi mặt khác

So sánh thứ tự các nhánh và tên biến giữ chỗ với `en-US`. Chạy `hl check --check icu_shape_mismatch --locale fr-FR` trên máy cục bộ. Sửa JSON đích hoặc gửi lại phân đoạn để xem xét—đừng bỏ qua bước kiểm tra các thông báo ICU thực sự.

### Runtime hiển thị `MISSING_TRANSLATION` hoặc tiếng Anh trong ngôn ngữ đích

Xác nhận pull request bản dịch đã được hợp nhất, `hl pack` đã chạy và các câu lệnh import trỏ đến các tệp đã đóng gói. Xác minh các ID thông điệp trong mã khớp với các khóa trong JSON (bao gồm cả quy ước `--prefix-id`).

### `hl sync pull` không thay đổi gì

Xác nhận các phê duyệt trong dự án được tham chiếu bởi `HYPERLOCALISE_PROJECT_ID`. Chạy `hl sync pull --dry-run`. Đảm bảo các đường dẫn `i18n.yml` `to:` khớp với nơi ứng dụng nhập các danh mục.

### Các tệp đã nén bị loại bỏ ICU do nhầm lẫn

Dùng mặc định `hl pack` trên JSON FormatJS—cách này giữ nguyên `defaultMessage`. Đừng chạy pack với các quy trình dành cho JSON lồng nhau thông thường, trừ khi đó là cấu trúc catalog của bạn.

## Danh sách kiểm tra phát hành

Trước khi phát hành một tính năng phụ thuộc vào nội dung mới:

- [ ] Các bộ mô tả thông báo đã được hợp nhất với `lang/en-US.json`
- [ ] Bản trích xuất yêu cầu kéo và `hyperlocalise check` đã đạt.
- [ ] `hl sync push` đã chạy trên `main`
- [ ] Các ngôn ngữ đích đã được xem xét và phê duyệt trong Hyperlocalise
- [ ] Yêu cầu kéo bản dịch đã được hợp nhất (`sync pull` + `pack`)
- [ ] Kiểm thử QA thủ công các nhánh số nhiều và `select` cho từng locale
- [ ] Bản triển khai production sử dụng các artifact đã hợp nhất `lang/*.json`

## Giữ phần trích xuất trong vòng lặp

React Intl khuyến khích đặt nội dung văn bản cùng nơi với mã, còn Hyperlocalise khuyến khích sử dụng bản dịch đã được duyệt và lưu trong tệp. Lệnh **`hl extract`** kết nối hai thế giới đó mà không cần dùng một CLI FormatJS riêng cho các danh mục cơ bản.

Dùng **`check`** để bảo vệ cấu trúc ICU trong các yêu cầu kéo. Dùng **sync** cho quy trình làm việc của người đánh giá. Dùng **`pack`** để giữ cho các gói production gọn nhẹ, đồng thời người dịch vẫn giữ siêu dữ liệu phong phú trong Git giữa các lần kéo.

Để có cái nhìn toàn diện hơn về quy trình phát hành GitHub—bao gồm ghi chú phát hành Markdown cùng với chuỗi giao diện—hãy tiếp tục với [Quy trình bản địa hóa GitHub: từ pull request đến bản phát hành đa ngôn ngữ](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release), hoặc [khám phá bản địa hóa sản phẩm trên Hyperlocalise](/use-cases/product-localisation).
