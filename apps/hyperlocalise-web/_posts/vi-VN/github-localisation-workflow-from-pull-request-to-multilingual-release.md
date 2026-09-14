---
title: "Quy trình bản địa hóa GitHub: Từ pull request đến bản phát hành đa ngôn ngữ"
date: 2026-09-09T00:00:00.000Z
excerpt: Xây dựng quy trình bản địa hóa GitHub thực tiễn để kiểm tra các chuỗi đã thay đổi, gửi nội dung nguồn đến Hyperlocalise, đưa các bản dịch đã được đánh giá trở lại và xuất bản ghi chú phát hành đa ngôn ngữ.
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

Hướng dẫn này sẽ giúp bạn thiết lập quy trình bản địa hóa GitHub với GitHub Actions, CLI `hyperlocalise` và nền tảng Hyperlocalise. Bạn sẽ bắt đầu với một ví dụ nhỏ và theo dõi một thay đổi sản phẩm từ pull request đầu tiên đến bản phát hành đa ngôn ngữ.

Đến cuối cùng, quy trình của bạn sẽ bao gồm bốn giai đoạn:

1. Một kỹ sư thay đổi một chuỗi giao diện người dùng bằng tiếng Anh và ghi chú phát hành của chuỗi đó.
2. GitHub kiểm tra pull request để phát hiện các vấn đề về bản địa hóa.
3. CLI đẩy nội dung nguồn lên Hyperlocalise, nơi nhóm xem xét các bản dịch.
4. GitHub kéo các tệp đã được xem xét và phát hành một bản phát hành kèm ghi chú bằng tiếng Anh, tiếng Pháp và tiếng Đức.

Kết quả là một quy trình tự nhiên với kho mã. Kỹ sư làm việc trong các pull request, người đánh giá ngôn ngữ làm việc với ngữ cảnh trong Hyperlocalise, và bản phát hành chỉ sử dụng những bản dịch đã được đưa trở lại Git.

Nếu bạn muốn xem mẫu hình sản phẩm tổng quát trước các chi tiết triển khai, hãy xem [trường hợp sử dụng bản địa hóa sản phẩm GitHub](/use-cases/product-localisation).

## Những gì chúng ta sẽ xây dựng

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

Tiếng Anh là ngôn ngữ nguồn. Tiếng Pháp và tiếng Đức là các ngôn ngữ đích. Các tệp JSON chứa nội dung sản phẩm, trong khi các tệp Markdown chứa ghi chú phát hành. Hyperlocalise coi cả hai là nội dung cần dịch, vì vậy cùng một quy trình đánh giá sẽ bao quát cả giao diện và thông báo.

Bạn sẽ cần:

- một dự án Hyperlocalise với `en-US` là ngôn ngữ nguồn và `fr-FR` và `de-DE` là các ngôn ngữ đích;
- một `HYPERLOCALISE_API_KEY` bí mật GitHub Actions;
- một `HYPERLOCALISE_PROJECT_ID` secret GitHub Actions; và
- quyền thêm quy trình làm việc và các bí mật của kho lưu trữ.

Sử dụng một môi trường GitHub chẳng hạn như `localisation` cho thông tin xác thực production nếu tổ chức của bạn yêu cầu phê duyệt triển khai.

## Bước 1: lập bản đồ các tệp nguồn và tệp đích

Tạo `i18n.yml` tại thư mục gốc của kho lưu trữ:

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

Hai nhóm này làm rõ quyền sở hữu. `product` ánh xạ một danh mục nguồn sang một danh mục cho mỗi locale đích. `release-notes` ánh xạ mọi tệp Markdown tiếng Anh vào thư mục locale tương ứng đồng thời giữ nguyên tên tệp.

Việc cố định phiên bản CLI trong cấu hình cũng giúp các lần chạy cục bộ và CI nhất quán với nhau. Hãy cập nhật phiên bản ví dụ thành bản phát hành mà nhóm của bạn đã kiểm thử. Nếu bỏ qua `version`, thay vào đó hãy cố định đầu vào `version` trong hành động cài đặt.

Hồ sơ LLM được sử dụng khi dự án của bạn tạo bản dịch bằng nhà cung cấp đó. Lưu thông tin xác thực của nhà cung cấp trong Hyperlocalise thay vì thêm chúng vào quy trình. GitHub runner chỉ cần thông tin xác thực cho dự án Hyperlocalise.

## Bước 2: thực hiện một thay đổi đối với sản phẩm

Giả sử phiên bản 1.8.0 bổ sung các bộ lọc đã lưu. Pull request thay đổi `locales/en-US.json`:

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

Commit nội dung nguồn cùng với tính năng. Điều này giúp người đánh giá có thể xem thay đổi mã, nội dung giao diện và phần giải thích dành cho khách hàng trong cùng một pull request. Đồng thời, lịch sử Git có thể cho biết nội dung nào đã được phát hành cùng với một phiên bản.

Không được sao chép nguyên văn các chuỗi tiếng Anh vào `fr-FR.json` hoặc `de-DE.json` làm giá trị giữ chỗ. Một giá trị nguồn được sao chép có thể trông đầy đủ khi kiểm tra số lượng khóa đơn giản, mặc dù chưa hề thực hiện bản địa hóa.

## Bước 3: kiểm tra các chuỗi đã thay đổi trong pull request

Thêm `.github/workflows/localise.yml`. Tác vụ đầu tiên chạy trên các yêu cầu kéo và giới hạn các phát hiện của Hyperlocalise trong phần khác biệt của GitHub:

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

Với `github-diff: true`, tác vụ sẽ lấy bản vá của pull request và chuyển nó cho `hyperlocalise check --diff-stdin`. Đối với các danh mục có cấu trúc được hỗ trợ, chú thích tập trung vào những khóa đã thay đổi trong pull request này thay vì yêu cầu tác giả xử lý các công việc tồn đọng không liên quan.

Tác vụ cũng tải lên báo cáo JSON và bản tóm tắt dạng văn bản. Hãy giữ lại các tệp này khi một lượt kiểm tra không thành công: chúng phân biệt các lỗi cấu trúc, bản dịch bị thiếu và các vấn đề về nội dung với lỗi cài đặt hoặc cấu hình.

Bước kiểm tra này là cổng rà soát đầu tiên, không phải rà soát ngôn ngữ. Nó phát hiện sớm các vấn đề trong kho lưu trữ, trong khi người đánh giá vẫn quyết định liệu mỗi bản dịch có chính xác, nhất quán và phù hợp với sản phẩm hay không.

## Bước 4: đẩy nội dung nguồn đã hợp nhất lên Hyperlocalise

Thêm một job thứ hai vào cùng workflow `localise.yml`:

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

Đây là ranh giới push. Sau khi pull request tính năng được hợp nhất vào `main`, `hl sync push` đọc các bucket trong `i18n.yml` và gửi các nguồn JSON và Markdown bằng tiếng Anh đến dự án Hyperlocalise được liên kết.

Tác vụ có quyền chỉ đọc đối với kho lưu trữ vì nó gửi nội dung ra ngoài nhưng không sửa đổi Git. Thông tin xác thực của tác vụ chỉ tồn tại trong bước cần đến chúng. Bộ lọc `paths` ngăn các lần hợp nhất không liên quan tạo ra những lần chạy đồng bộ không cần thiết.

Bạn có thể chạy cùng thao tác trước khi commit:

```bash
export HYPERLOCALISE_API_KEY="your-api-key"
export HYPERLOCALISE_PROJECT_ID="your-project-id"
hl sync push --dry-run
hl sync push
```

Sử dụng `--dry-run` khi thay đổi ánh xạ bucket. Lệnh này cho phép bạn kiểm tra kế hoạch trước khi cập nhật dự án từ xa.

## Bước 5: cùng xem xét các chuỗi sản phẩm và ghi chú phát hành

Sau khi quá trình đồng bộ nguồn hoàn tất, hãy xem lại nội dung mới trong Hyperlocalise. Các chuỗi giao diện người dùng và ghi chú phát hành vẫn nằm trong các nhóm riêng biệt, nhưng chúng dùng chung thuật ngữ dự án, hướng dẫn và ngôn ngữ đích.

Đối với ví dụ này, người đánh giá nên kiểm tra nhiều hơn là độ chính xác theo nghĩa đen:

| Nội dung         | Câu hỏi đánh giá                                          |
| --------------- | -------------------------------------------------------- |
| `filters.save`  | Đây có rõ ràng là một hành động, thay vì một trạng thái đã lưu không?    |
| `filters.saved` | Thuật ngữ có phù hợp với nội dung điều hướng và cài đặt không?        |
| Mô tả     | Có phù hợp với giao diện người dùng và duy trì thuật ngữ “không gian làm việc” không? |
| Tiêu đề bản phát hành   | Có sử dụng cùng tên với tính năng sản phẩm không?        |
| Các gạch đầu dòng về bản phát hành | Các lệnh, tên menu và kết quả của người dùng có nhất quán không? |

Đính kèm ngữ cảnh sản phẩm hoặc ảnh chụp màn hình khi một chuỗi ngắn còn mơ hồ. Một biên dịch viên chỉ thấy “Save filter” sẽ không thể biết đó là nhãn của một nút, một thông báo nhanh hay tiêu đề trang. Ngữ cảnh đó là phần mà nền tảng bổ trợ cho CLI: Git di chuyển tệp, còn Hyperlocalise truyền tải kiến thức cần thiết để đưa ra quyết định ngôn ngữ phù hợp.

Giải quyết các nhận xét đánh giá và phê duyệt bản dịch theo quy trình làm việc của dự án trước khi kéo chúng về. Hãy coi việc phê duyệt là một cổng phát hành, không phải một bước hành chính.

## Bước 6: kéo các bản dịch đã được duyệt vào GitHub

Thêm tác vụ thứ ba vào `localise.yml`:

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

Quy trình này sẽ mở một pull request thay vì commit trực tiếp vào `main`. Điều đó giúp duy trì cơ chế bảo vệ nhánh, cho phép các kỹ sư chạy ứng dụng với từng locale và ghi lại chính xác các bản dịch được đưa vào bản phát hành.

Đối với môi trường production, hãy ghim các action của bên thứ ba vào SHA commit đầy đủ theo chính sách dependency của bạn. Việc sử dụng các tag chính có thể thay đổi giúp hướng dẫn này dễ đọc, nhưng các tham chiếu bất biến sẽ giảm rủi ro đối với chuỗi cung ứng.

## Bước 7: kiểm thử pull request đã dịch

Kiểm tra tự động sẽ chạy lại vì pull request bản dịch thay đổi `locales/**` và `release-notes/**`. Đồng thời, hãy thêm các bài kiểm tra riêng của ứng dụng vào danh sách kiểm tra bắt buộc.

Tối thiểu, hãy xác minh:

- mỗi danh mục đích đều chứa các khóa mới;
- các placeholder và đối số ICU khớp với văn bản nguồn;
- các nút đã dịch vừa với kích thước khung nhìn được hỗ trợ;
- Các tiêu đề Markdown, danh sách, liên kết và các đoạn mã nội tuyến vẫn hiển thị chính xác;
- sản phẩm và ghi chú phát hành sử dụng cùng một tên tính năng; và
- Các chuỗi nguồn không bị lọt vào các tệp đích.

Người đánh giá cũng nên mở sản phẩm đã kết xuất. Việc đánh giá ở cấp độ tệp có thể phát hiện lỗi thuật ngữ, nhưng không thể cho thấy một nút bị cắt hoặc một ngắt dòng che khuất văn bản quan trọng.

Chỉ hợp nhất pull request bản dịch khi các bước kiểm tra đó đạt yêu cầu. Git hiện đã chứa trạng thái ngôn ngữ được phê duyệt của bản phát hành.

## Bước 8: xuất bản ghi chú phát hành đa ngôn ngữ

GitHub Releases chỉ có một nội dung bản phát hành, vì vậy hãy tập hợp từng ngôn ngữ vào một tài liệu Markdown duy nhất. Thêm `.github/workflows/release.yml`:

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

Chỉ tạo tag sau khi các pull request về tính năng và bản dịch đã được hợp nhất:

```bash
git switch main
git pull --ff-only
git tag v1.8.0
git push origin v1.8.0
```

Tác vụ phát hành sẽ thất bại nếu ghi chú của bất kỳ ngôn ngữ nào bị thiếu hoặc để trống. Đây là chủ ý. Việc tự động dùng nội dung dự phòng một cách im lặng sẽ gắn nhãn cho một bản phát hành chưa hoàn chỉnh là đa ngôn ngữ; tác vụ thất bại sẽ cho nhóm biết chính xác tệp nào cần được đưa lại qua quy trình xem xét.

Cùng một thẻ có thể điều khiển các tác vụ xây dựng và triển khai của bạn. Hãy đặt tác vụ phát hành phụ thuộc vào những tác vụ đó nếu các tệp nhị phân phải tồn tại trước khi thông báo được công khai.

## Cách toàn bộ quy trình hoạt động

Quy trình bản địa hóa GitHub hoàn chỉnh có hướng đi rõ ràng:

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

### Kiểm tra PR báo cáo các bản dịch không liên quan

Xác nhận hành động chạy trên một sự kiện `pull_request` và thiết lập `github-diff: true`. Hành động cần `pull-requests: read` để có thể tìm nạp bản vá. Việc kiểm tra theo phạm vi diff áp dụng cho các tệp bản dịch có cấu trúc được hỗ trợ; nếu cũng muốn theo dõi phần tồn đọng, hãy chạy các lượt kiểm tra toàn dự án trong một tác vụ theo lịch riêng.

### Nguồn push không thể xác thực

Kiểm tra để đảm bảo cả `HYPERLOCALISE_API_KEY` và `HYPERLOCALISE_PROJECT_ID` đều tồn tại trong môi trường GitHub đã chọn. Các secret của môi trường không khả dụng trừ khi job khai báo môi trường đó, và các môi trường được bảo vệ có thể phải chờ phê duyệt.

### Việc kéo bản dịch không tạo ra Git diff

Trước tiên, hãy xác nhận rằng công việc dịch đã hoàn tất trong cùng dự án có tên là `HYPERLOCALISE_PROJECT_ID`. Sau đó, kiểm tra các đường dẫn đích trong `i18n.yml`. Chạy `hl sync pull --dry-run` cục bộ để kiểm tra nội dung tải xuống dự kiến mà không ghi đè các tệp.

### Bản phát hành không thể tìm thấy ghi chú của bản phát hành.

Thẻ và tên tệp Markdown phải khớp chính xác. Thẻ `v1.8.0` yêu cầu `release-notes/<locale>/v1.8.0.md`. Giữ `v` ở cả hai vị trí hoặc thay đổi cách xây dựng đường dẫn của quy trình trong một lần cập nhật quy ước có chủ đích.

### Bản dịch sẽ có sau khi sản phẩm được phát hành

Đừng biến việc đồng bộ bản dịch thành một tác vụ không được theo dõi sau khi phát hành. Hãy yêu cầu PR bản dịch trước khi tạo tag hoặc coi việc bản địa hóa là một bước kiểm tra rõ ràng đối với bản phát hành ứng viên trong quy trình triển khai của bạn.

## Danh sách kiểm tra phát hành

Trước khi gắn thẻ một phiên bản đa ngôn ngữ, hãy xác nhận rằng:

- [ ] chuỗi nguồn và ghi chú phát hành bằng tiếng Anh được hợp nhất với nhau;
- [ ] kiểm tra bản địa hóa pull request đã đạt;
- [ ] `hl sync push` đã hoàn tất sau khi hợp nhất;
- [ ] các ngôn ngữ đích đã được xem xét và phê duyệt trong Hyperlocalise;
- [ ] `hl sync pull` đã mở một pull request dịch thuật;
- [ ] đã vượt qua các bước kiểm tra tự động, ngôn ngữ và trực quan;
- [ ] pull request bản dịch đã được hợp nhất; và
- [ ] mọi locale ghi chú phát hành đều có tệp không rỗng khớp với thẻ.

## Giữ bản địa hóa trong quy trình phát hành

Phần quan trọng của việc bản địa hóa GitHub không phải là YAML. Mà là chuỗi các lần bàn giao có trách nhiệm giải trình.

CLI `hyperlocalise` kết nối các tệp trong kho lưu trữ với nền tảng. GitHub Action cung cấp phản hồi nhanh chóng cho kỹ sư về các chuỗi đã thay đổi. Hyperlocalise cung cấp cho người đánh giá ngôn ngữ ngữ cảnh và quy trình phê duyệt mà Git không thể cung cấp. Thẻ cuối cùng xuất bản chính xác những gì nhóm đã đánh giá.

Điều đó biến việc bản địa hóa từ một nhiệm vụ sau khi phát triển thành một phần của chính quá trình phát hành.

[Khám phá Hyperlocalise để bản địa hóa sản phẩm](/use-cases/product-localisation) để kết nối các kho lưu trữ, xem xét quy trình làm việc và phát hành đa ngôn ngữ.
