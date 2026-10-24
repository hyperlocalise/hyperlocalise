---
title: "Quy trình bản địa hóa GitHub: Từ yêu cầu kéo đến bản phát hành đa ngôn ngữ"
date: 2026-09-09T00:00:00.000Z
excerpt: Xây dựng quy trình bản địa hóa GitHub thiết thực để kiểm tra các chuỗi đã thay đổi, gửi nội dung nguồn đến Hyperlocalise, nhận lại các bản dịch đã được duyệt và xuất bản ghi chú phát hành đa ngôn ngữ.
category: Kỹ thuật
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

Hướng dẫn này sẽ giúp bạn thiết lập quy trình bản địa hóa GitHub bằng GitHub Actions, CLI `hyperlocalise` và nền tảng Hyperlocalise. Bạn sẽ bắt đầu với một ví dụ nhỏ và theo dõi một thay đổi sản phẩm từ pull request đầu tiên đến bản phát hành đa ngôn ngữ.

Khi kết thúc, quy trình làm việc của bạn sẽ bao gồm bốn giai đoạn:

1. Một kỹ sư thay đổi chuỗi giao diện bằng tiếng Anh và ghi chú phát hành tương ứng.
2. GitHub kiểm tra pull request để phát hiện các vấn đề về bản địa hóa.
3. CLI đẩy nội dung nguồn lên Hyperlocalise, nơi nhóm xem xét các bản dịch.
4. GitHub lấy các tệp đã được duyệt và phát hành một bản phát hành kèm ghi chú bằng tiếng Anh, tiếng Pháp và tiếng Đức.

Đây là quy trình được tích hợp trực tiếp vào kho mã. Các kỹ sư vẫn làm việc trong các pull request, người đánh giá ngôn ngữ làm việc với ngữ cảnh trong Hyperlocalise, và bản phát hành chỉ sử dụng những bản dịch đã được đưa trở lại Git.

Nếu bạn muốn xem mô hình sản phẩm tổng quát trước các chi tiết triển khai, hãy xem [trường hợp sử dụng bản địa hóa sản phẩm GitHub](/use-cases/product-localisation).

## Chúng ta sẽ xây dựng gì

Giả sử một ứng dụng web có cấu trúc như sau:

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

Tiếng Anh là ngôn ngữ nguồn. Tiếng Pháp và tiếng Đức là ngôn ngữ đích. Các tệp JSON chứa nội dung sản phẩm, còn các tệp Markdown chứa ghi chú phát hành. Hyperlocalise coi cả hai đều là nội dung cần dịch, vì vậy cùng một quy trình đánh giá sẽ bao gồm cả giao diện lẫn thông báo.

Bạn sẽ cần:

- một dự án Hyperlocalise với `en-US` làm ngôn ngữ nguồn và `fr-FR` cùng `de-DE` làm ngôn ngữ đích;
- một bí mật GitHub Actions; `HYPERLOCALISE_API_KEY`
- một `HYPERLOCALISE_PROJECT_ID` bí mật GitHub Actions; và
- quyền thêm quy trình làm việc và bí mật của kho lưu trữ.

Sử dụng môi trường GitHub như `localisation` để lưu thông tin xác thực cho môi trường production nếu tổ chức của bạn yêu cầu phê duyệt triển khai.

## Bước 1: ánh xạ các tệp nguồn và đích

Tạo `i18n.yml` tại thư mục gốc của kho lưu trữ:

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

Hai bucket xác định rõ quyền sở hữu. `product` ánh xạ một danh mục nguồn sang một danh mục cho mỗi ngôn ngữ đích. `release-notes` ánh xạ mọi tệp Markdown tiếng Anh sang thư mục ngôn ngữ tương ứng, đồng thời giữ nguyên tên tệp.

Việc cố định phiên bản CLI trong cấu hình cũng giúp các lần chạy cục bộ và CI thống nhất. Cập nhật phiên bản ví dụ thành phiên bản phát hành mà nhóm của bạn đã kiểm thử. Nếu bỏ qua `version`, hãy cố định đầu vào `version` trong hành động cài đặt thay thế.

Hồ sơ LLM được sử dụng khi dự án của bạn tạo bản dịch bằng nhà cung cấp đó. Hãy lưu thông tin xác thực của nhà cung cấp trong Hyperlocalise thay vì thêm chúng vào quy trình làm việc. Trình chạy GitHub chỉ cần thông tin xác thực cho dự án Hyperlocalise.

## Bước 2: thực hiện một thay đổi về sản phẩm

Giả sử phiên bản 1.8.0 bổ sung bộ lọc đã lưu. Yêu cầu kéo thay đổi `locales/en-US.json`:

```json
{
  "filters.save": "Save filter",
  "filters.saved": "Saved filters",
  "filters.saved.description": "Reuse filters across your workspace."
}
```

Nó cũng bổ sung `release-notes/en-US/v1.8.0.md`:

```markdown
# Saved filters

You can now save a filter and reuse it across your workspace.

## What changed

- Save a filter from any search results page.
- Rename or delete saved filters from workspace settings.
- Share the same filter criteria with your team.
```

Commit nội dung nguồn cùng với tính năng. Nhờ vậy, người đánh giá có thể xem thay đổi mã, nội dung giao diện và phần giải thích dành cho khách hàng trong cùng một pull request. Điều này cũng giúp lịch sử Git cho biết nội dung nào đã được phát hành cùng với một phiên bản.

Đừng chép nguyên văn các chuỗi tiếng Anh vào `fr-FR.json` hoặc `de-DE.json` làm giá trị giữ chỗ. Giá trị nguồn được sao chép có thể trông đầy đủ khi kiểm tra số lượng khóa đơn giản, dù thực tế chưa được bản địa hóa.

## Bước 3: kiểm tra các chuỗi đã thay đổi trong pull request

Thêm `.github/workflows/localise.yml`. Công việc đầu tiên chạy trên các pull request và giới hạn các phát hiện của Hyperlocalise trong phần khác biệt của GitHub:

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

Với `github-diff: true`, tác vụ tải bản vá của pull request xuống và chuyển cho `hyperlocalise check --diff-stdin`. Đối với các danh mục có cấu trúc được hỗ trợ, chú thích tập trung vào các khóa được thay đổi trong pull request này thay vì yêu cầu tác giả xử lý những mục tồn đọng không liên quan.

Tác vụ này cũng tải lên báo cáo JSON và bản tóm tắt dạng văn bản. Hãy giữ lại các tệp này khi bước kiểm tra thất bại: chúng giúp phân biệt lỗi cấu trúc, bản dịch còn thiếu và các phát hiện về nội dung với lỗi cài đặt hoặc cấu hình.

Bước kiểm tra này là vòng đánh giá đầu tiên, không phải đánh giá ngôn ngữ. Nó giúp phát hiện sớm các vấn đề trong kho mã, còn người đánh giá vẫn quyết định liệu từng bản dịch có chính xác, nhất quán và phù hợp với sản phẩm hay không.

## Bước 4: đẩy nội dung nguồn đã hợp nhất lên Hyperlocalise

Thêm một job thứ hai vào cùng quy trình làm việc `localise.yml`:

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

Đây là ranh giới của lần push. Sau khi pull request tính năng được hợp nhất vào `main`, `hl sync push` đọc các bucket trong `i18n.yml` và gửi các nguồn JSON và Markdown tiếng Anh đến dự án Hyperlocalise được liên kết.

Tác vụ có quyền chỉ đọc đối với kho lưu trữ vì tác vụ gửi nội dung ra ngoài nhưng không sửa đổi Git. Thông tin xác thực của tác vụ chỉ tồn tại trong bước cần dùng đến chúng. Bộ lọc `paths` ngăn các lần hợp nhất không liên quan tạo ra những lần chạy đồng bộ không cần thiết.

Bạn có thể chạy thao tác tương tự trước khi commit:

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

Sử dụng `--dry-run` khi thay đổi các ánh xạ bucket. Tính năng này cho phép bạn kiểm tra kế hoạch trước khi cập nhật dự án từ xa.

## Bước 5: cùng nhau xem xét các chuỗi trong sản phẩm và ghi chú phát hành

Sau khi quá trình đồng bộ nguồn hoàn tất, hãy xem lại nội dung mới trong Hyperlocalise. Các chuỗi giao diện người dùng và ghi chú phát hành vẫn nằm trong các nhóm riêng biệt, nhưng dùng chung thuật ngữ, hướng dẫn và ngôn ngữ đích của dự án.

Đối với ví dụ này, người đánh giá nên kiểm tra không chỉ độ chính xác theo nghĩa đen:

| Nội dung         | Câu hỏi đánh giá                                          |
| --------------- | -------------------------------------------------------- |
| `filters.save`  | Điều này có rõ ràng là một hành động, chứ không phải trạng thái đã lưu không?    |
| `filters.saved` | Thuật ngữ có phù hợp với nội dung điều hướng và cài đặt không?        |
| Mô tả     | Có phù hợp với giao diện người dùng và giữ nguyên thuật ngữ “workspace” không? |
| Tiêu đề bản phát hành   | Có sử dụng cùng tên với tính năng của sản phẩm không?        |
| Các gạch đầu dòng về bản phát hành | Các lệnh, tên menu và kết quả đối với người dùng có nhất quán không?  |

Đính kèm ngữ cảnh sản phẩm hoặc ảnh chụp màn hình khi một chuỗi ngắn còn mơ hồ. Người dịch chỉ thấy “Lưu bộ lọc” sẽ không thể biết đó là nhãn nút, thông báo dạng toast hay tiêu đề trang. Đây là lúc nền tảng bổ trợ cho CLI: Git di chuyển các tệp, còn Hyperlocalise lưu giữ kiến thức cần thiết để đưa ra quyết định ngôn ngữ phù hợp.

Hãy giải quyết các nhận xét đánh giá và phê duyệt bản dịch theo quy trình dự án của bạn trước khi kéo chúng về. Hãy xem việc phê duyệt là điều kiện để phát hành, không phải một bước hành chính.

## Bước 6: đưa các bản dịch đã được rà soát vào GitHub

Thêm công việc thứ ba vào `localise.yml`:

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

Chạy tác vụ này từ tab **Actions** sau khi xem xét. `hl sync pull` ghi nội dung đích vào các đường dẫn trong `i18n.yml`, tạo ra các tệp như:

```text
locales/fr-FR.json
locales/de-DE.json
release-notes/fr-FR/v1.8.0.md
release-notes/de-DE/v1.8.0.md
```

Quy trình tạo pull request thay vì commit trực tiếp vào `main`. Điều này giúp duy trì cơ chế bảo vệ nhánh, tạo cơ hội cho các kỹ sư chạy ứng dụng với từng ngôn ngữ và ghi lại chính xác các bản dịch được đưa vào bản phát hành.

Đối với môi trường production, hãy ghim các action của bên thứ ba vào SHA commit đầy đủ theo chính sách dependency của bạn. Các thẻ phiên bản chính có thể thay đổi giúp hướng dẫn này dễ đọc hơn, nhưng các tham chiếu bất biến sẽ giảm rủi ro chuỗi cung ứng.

## Bước 7: kiểm tra pull request đã dịch

Bản kiểm tra tự động sẽ chạy lại vì yêu cầu kéo bản dịch thay đổi `locales/**` và `release-notes/**`. Hãy thêm cả các bài kiểm thử của ứng dụng bạn vào danh sách kiểm tra bắt buộc.

Ít nhất, hãy xác minh:

- mọi danh mục đích đều chứa các khóa mới;
- các placeholder và đối số ICU khớp với bản nguồn;
- các nút đã dịch hiển thị vừa vặn ở các kích thước màn hình được hỗ trợ;
- Tiêu đề Markdown, danh sách, liên kết và đoạn mã vẫn hiển thị chính xác;
- sản phẩm và ghi chú phát hành sử dụng cùng một tên tính năng; và
- Các chuỗi nguồn không bị rò rỉ vào các tệp đích.

Người đánh giá cũng nên mở sản phẩm đã được kết xuất. Việc đánh giá ở cấp độ tệp giúp phát hiện lỗi thuật ngữ, nhưng không thể phát hiện nút bị cắt hoặc ngắt dòng khiến nội dung quan trọng bị ẩn.

Chỉ hợp nhất pull request bản dịch khi các bước kiểm tra đó đạt yêu cầu. Git hiện chứa trạng thái ngôn ngữ đã được phê duyệt cho bản phát hành.

## Bước 8: xuất bản ghi chú phát hành đa ngôn ngữ

GitHub Releases chỉ có một nội dung phát hành, vì vậy hãy ghép từng ngôn ngữ thành một tài liệu Markdown. Thêm `.github/workflows/release.yml`:

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

Chỉ tạo thẻ sau khi các yêu cầu kéo tính năng và bản dịch đã được hợp nhất:

```bash
git switch main
git pull --ff-only
git tag v1.8.0
git push origin v1.8.0
```

Tác vụ phát hành sẽ thất bại nếu ghi chú của bất kỳ locale nào bị thiếu hoặc để trống. Điều đó là có chủ ý. Cơ chế dự phòng âm thầm sẽ gắn nhãn một bản phát hành chưa hoàn chỉnh là đa ngôn ngữ; tác vụ thất bại cho nhóm biết chính xác tệp nào cần được gửi lại để duyệt.

Cùng một thẻ có thể điều khiển các công việc xây dựng và triển khai của bạn. Hãy để công việc phát hành phụ thuộc vào các công việc đó nếu các tệp nhị phân phải tồn tại trước khi thông báo được công bố.

## Cách toàn bộ quy trình hoạt động

Quy trình bản địa hóa GitHub hoàn chỉnh có định hướng rõ ràng:

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

Mỗi bước chuyển tiếp có một trách nhiệm. Pull request xem xét các thay đổi trong kho lưu trữ. Hyperlocalise xem xét các quyết định về ngôn ngữ. Thẻ phát hành một trạng thái bất biến đã được xem xét.

## Các lỗi thường gặp

### Quá trình kiểm tra PR báo cáo các bản dịch không liên quan.

Xác nhận rằng hành động chạy trên một sự kiện `pull_request` và đặt `github-diff: true`. Hành động cần `pull-requests: read` để có thể tải bản vá. Kiểm tra theo phạm vi diff áp dụng cho các tệp bản dịch có cấu trúc được hỗ trợ; hãy giữ các lượt kiểm tra toàn bộ dự án trong một tác vụ được lên lịch riêng nếu bạn cũng muốn theo dõi các mục tồn đọng.

### Không thể xác thực nguồn đẩy

Kiểm tra xem cả `HYPERLOCALISE_API_KEY` và `HYPERLOCALISE_PROJECT_ID` có tồn tại trong môi trường GitHub được chọn hay không. Các secret của môi trường sẽ không khả dụng trừ khi job khai báo môi trường đó, và các môi trường được bảo vệ có thể phải chờ phê duyệt.

### Việc kéo bản dịch về không tạo ra Git diff

Trước tiên, hãy xác nhận rằng công việc dịch thuật đã hoàn tất trong cùng dự án có tên là `HYPERLOCALISE_PROJECT_ID`. Sau đó, kiểm tra các đường dẫn đích trong `i18n.yml`. Chạy `hl sync pull --dry-run` cục bộ để kiểm tra nội dung tải xuống dự kiến mà không ghi đè lên các tệp.

### Bản phát hành không thể tìm thấy ghi chú của mình

The tag and Markdown filename must match exactly. Tag `v1.8.0` expects `release-notes/<locale>/v1.8.0.md`. Keep the `v` in both places, or change the workflow's path construction in one deliberate convention update.

### Bản dịch sẽ được cung cấp sau khi sản phẩm phát hành.

Đừng biến việc đồng bộ bản dịch thành một tác vụ hậu phát hành không được theo dõi. Hãy yêu cầu pull request bản dịch trước khi tạo tag, hoặc đưa việc bản địa hóa thành một bước kiểm tra ứng viên phát hành rõ ràng trong quy trình triển khai.

## Danh sách kiểm tra phát hành

Trước khi gắn thẻ phiên bản đa ngôn ngữ, hãy xác nhận rằng:

- [ ] chuỗi nguồn và ghi chú phát hành tiếng Anh được hợp nhất với nhau;
- [ ] kiểm tra bản địa hóa của pull request đã đạt;
- [ ] `hl sync push` đã hoàn tất sau khi hợp nhất;
- [ ] các ngôn ngữ đích đã được xem xét và phê duyệt trong Hyperlocalise;
- [ ] `hl sync pull` đã mở một pull request dịch thuật;
- [ ] các bước kiểm tra tự động, ngôn ngữ và hình ảnh đã đạt;
- [ ] pull request bản dịch đã được hợp nhất; và
- [ ] mọi ngôn ngữ của ghi chú phát hành đều có tệp không trống khớp với thẻ.

## Duy trì bản địa hóa trong quy trình phát hành

Điều quan trọng trong quá trình bản địa hóa GitHub không phải là YAML, mà là chuỗi các bước bàn giao có trách nhiệm giải trình.

CLI `hyperlocalise` kết nối các tệp trong kho lưu trữ với nền tảng. GitHub Action giúp kỹ sư nhanh chóng nhận phản hồi về các chuỗi đã thay đổi. Hyperlocalise cung cấp cho người duyệt ngôn ngữ ngữ cảnh và quy trình phê duyệt mà chỉ Git không thể đáp ứng. Thẻ cuối cùng sẽ xuất bản chính xác những gì nhóm đã duyệt.

Điều đó biến bản địa hóa từ một công việc sau khi phát triển thành một phần của chính quá trình phát hành.

[Khám phá Hyperlocalise để bản địa hóa sản phẩm](/use-cases/product-localisation) để kết nối kho lưu trữ, quy trình đánh giá và các bản phát hành đa ngôn ngữ.
