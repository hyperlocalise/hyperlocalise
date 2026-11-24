---
title: "Sử dụng Iris từ Claude Code, Cursor và các agent khác qua MCP"
date: 2026-11-24T00:00:00.000Z
excerpt: Iris cung cấp toàn bộ bộ công cụ bản địa hóa sáng tạo qua MCP. Kết nối Claude Code, Cursor, Codex hoặc một tác nhân khác, rồi yêu cầu tác nhân bản địa hóa hình ảnh, thêm phụ đề và lồng tiếng video, đồng thời kiểm tra từng thị trường theo bảng thuật ngữ của bạn trong khi bạn theo dõi tiến độ trong ứng dụng.
category: Kỹ thuật
tags:
  - Iris
  - MCP
  - Model Context Protocol
  - Claude Code
  - Cursor
  - AI agents
  - creative localisation
  - video localisation
  - image localisation
  - localisation
  - localization
  - agentic workflows
---

Các tác nhân lập trình ngày càng giỏi trong việc bản địa hóa sản phẩm. Chúng trích xuất chuỗi, tích hợp `react-intl`, tạo pull request và kiểm tra dạng số nhiều. Chúng tôi đã viết về quy trình này cho [GitHub](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release) và [React Intl và ICU](/blog/react-intl-icu-localisation-workflow-extract-sync-and-review).

Sau đó, đợt ra mắt cần một video giới thiệu, một bộ banner mạng xã hội và bản demo sản phẩm bằng sáu ngôn ngữ, nhưng tác nhân AI không thể hỗ trợ. Các công cụ sáng tạo được thiết kế để con người nhấp qua dòng thời gian hoặc khung vẽ. Chẳng có gì để tác nhân gọi đến.

**[Iris](/iris)** hoạt động theo cách khác. Mọi tính năng trong ứng dụng đều là một công cụ MCP. Chỉ cần kết nối tác nhân của bạn một lần, tác nhân có thể mở các nội dung sáng tạo, đọc nội dung trong ảnh, bản địa hóa nội dung cho từng thị trường, tạo phụ đề và lồng tiếng cho video, kiểm tra bố cục, đồng thời đọc bảng thuật ngữ và bộ nhớ dịch của bạn. Mọi thao tác đều diễn ra trong ứng dụng Iris trên máy Mac, vì vậy bạn có thể theo dõi và can thiệp bất cứ lúc nào.

Bài viết này trình bày điều đó sẽ diễn ra như thế nào, cách kết nối và cách giao cho một tác nhân nhiệm vụ bản địa hóa sáng tạo mà nó thực sự có thể hoàn thành.

## Vì sao quyền truy cập MCP quan trọng đối với công việc sáng tạo

Hầu hết các công cụ sáng tạo đều có nút xuất, và một số cung cấp API cho một tác vụ đơn lẻ như “dịch tệp phụ đề này”. Nhưng không công cụ nào cho phép một tác nhân thực hiện toàn bộ quy trình.

Bản địa hóa một mẫu quảng cáo là cả một chuỗi quyết định: đọc nội dung, tra cứu thuật ngữ đã được phê duyệt, dịch, vẽ lại hoặc căn chỉnh thời gian, kiểm tra ở từng thị trường, sửa những chỗ chưa ổn và nhờ một người phê duyệt. Một tác nhân chỉ có thể đảm nhận toàn bộ chuỗi này nếu có thể tiếp cận mọi khâu.

Iris cung cấp tất cả những tính năng này. Máy chủ liệt kê toàn bộ bộ công cụ của mình cho mọi tác nhân được kết nối, kèm theo mô tả đầu vào và đầu ra của từng công cụ theo JSON Schema. Máy chủ cũng cung cấp những trang hướng dẫn kỹ năng mà trợ lý tích hợp sẵn của Iris sử dụng, bao gồm bản địa hóa, chỉnh sửa video, đồ họa chuyển động và thuật ngữ, để tác nhân biết quy trình phù hợp trước khi bắt đầu thay vì phải đoán.

Điều đó có nghĩa là bạn có thể giao phó một mục tiêu (“bản địa hóa chiến dịch này cho Pháp, Đức và Nhật Bản”) thay vì liệt kê từng bước.

## Nhân viên có thể làm gì thông qua Iris

| Khu vực | Tác nhân có thể làm gì |
| --- | --- |
| **Hình ảnh** | Đọc nội dung được chèn sẵn trong banner hoặc quảng cáo trên mạng xã hội, dịch nội dung đó và thiết kế lại hình ảnh với nội dung đã được phê duyệt cho từng thị trường |
| **Video** | Dựng lại phần chữ hiển thị trên màn hình của video đã hoàn tất, dịch nội dung đó và tạo phụ đề khớp thời gian với bản gốc |
| **Giọng nói** | Lồng tiếng bằng chính giọng của người nói, tạo bản lồng tiếng mới cho từng thị trường và đồng bộ chuyển động môi |
| **Thuật ngữ** | Tra cứu thuật ngữ trong bảng thuật ngữ, các bản dịch được phê duyệt và bị cấm, cũng như bộ nhớ dịch cho mọi nội dung |
| **Hướng dẫn** | Đối chiếu nội dung với tài liệu thương hiệu và tuân thủ bạn đã tải lên, đồng thời nêu các phát hiện kèm trích dẫn nguồn |
| **Chất lượng** | Kiểm tra từng thị trường để phát hiện văn bản bị tràn, chú thích vượt khỏi màn hình và ký tự bị thiếu, đồng thời xem trước các khung hình có nhiều nội dung nhất |
| **Không gian làm việc** | Đọc các dự án bản địa hóa, công việc, báo cáo QA và quy trình tự động hóa trong không gian làm việc Hyperlocalise của bạn |

Tác nhân sử dụng cùng bộ thuật ngữ và bộ nhớ dịch như mọi người khác trong không gian làm việc của bạn. Khi bản địa hóa biểu ngữ, các thuật ngữ được phê duyệt sẽ được áp dụng và các thuật ngữ bị cấm sẽ bị chặn, giống như khi có người sử dụng ứng dụng.

## Kết nối tác nhân của bạn

Iris chạy máy chủ MCP trên máy của bạn khi ứng dụng đang mở. Máy chủ chỉ có thể được truy cập từ chính máy này, tại một địa chỉ cố định:

```text
http://127.0.0.1:4747/mcp
```

### Cách nhanh chóng

Trong Iris, mở **Kết nối tác tử qua MCP**. Iris phát hiện các tác tử được cài đặt trên máy Mac của bạn và thêm máy chủ vào cấu hình của từng tác tử khi bạn chọn **Kết nối**. Iris hỗ trợ Claude Code, Claude Desktop, Cursor, VS Code (Copilot), GitHub Copilot CLI, Codex, Gemini CLI, Windsurf, Cline, Roo Code, Amp, OpenCode và một số công cụ khác.

### Thủ công

Nếu bạn muốn tự thêm, hãy đăng ký một máy chủ HTTP MCP có tên `hyperlocalise-iris`. Với Claude Code:

```bash
claude mcp add --scope user -t http hyperlocalise-iris http://127.0.0.1:4747/mcp
```

Với Cursor, hãy thêm vào `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "hyperlocalise-iris": {
      "url": "http://127.0.0.1:4747/mcp"
    }
  }
}
```

Các client chỉ có thể khởi chạy máy chủ dòng lệnh cục bộ có thể truy cập URL thông qua một cầu nối chung như `mcp-remote`.

### Kiểm tra kết nối

Khi Iris đang mở, hãy hỏi trợ lý của bạn:

```text
What screen do I have open in Hyperlocalise? Don't change anything.
```

Nội dung này nên mô tả những gì đang hiển thị trên màn hình trong ứng dụng. Nếu thiếu công cụ, hãy đảm bảo Iris đang chạy. Máy chủ chỉ hoạt động khi ứng dụng đang mở.

> **Máy chủ MCP của Iris khác với máy chủ MCP [Hyperlocalise được lưu trữ](/use-cases/localisation-for-ai-coding-agents).** Máy chủ được lưu trữ tại `hyperlocalise.com/mcp` cung cấp cho các tác tử quyền truy cập vào dự án, tệp nguồn và khóa dịch của bạn từ bất kỳ đâu. Máy chủ cục bộ của Iris bổ sung các nội dung sáng tạo (hình ảnh, video và giọng nói) trên máy Mac của bạn. Nhiều nhóm kết nối cả hai.

## Giao cho tác nhân một nhiệm vụ mà nó có thể hoàn thành.

Tác nhân hoạt động hiệu quả nhất khi có mục tiêu rõ ràng, phạm vi được xác định và một bước để con người kiểm tra kết quả. Một số câu lệnh gợi ý hiệu quả:

**Bản địa hóa banner**

```text
Open the summer-sale banner in Iris and localise it for fr-FR, de-DE and ja-JP.
Use our glossary and keep "Pro plan" in English. Check each market for overflow and
show me the results side by side. Don't export.
```

**Thêm phụ đề cho video sản phẩm**

```text
Subtitle the onboarding video for es-MX and pt-BR. Split cues at natural pauses,
keep product names together, and flag any cue that overflows the caption area.
```

**Kiểm tra nội dung trước khi phát hành**

```text
Look up the glossary terms in this ad copy for de-DE, then check the German
translation against our brand guidelines. List anything that breaks a rule,
with the guideline it breaks.
```

**Biến bản phát hành thành nội dung ra mắt**

```text
Read the release notes in this PR, write a 15-second launch video script, and build it
in Iris. Then localise the on-screen copy for our five launch markets and show me
a preview of each.
```

Đây là lúc mọi thứ trở nên thú vị. Chính agent đã triển khai tính năng này có thể tạo nội dung ra mắt cho mọi thị trường, sử dụng cùng thuật ngữ với sản phẩm.

## Luôn có người tham gia giám sát

Iris được thiết kế để tác nhân thực hiện công việc và con người phê duyệt.

- **Bạn có thể theo dõi công việc.** Tác nhân làm việc trong ứng dụng Iris trên máy Mac của bạn, vì vậy bạn có thể thấy các ấn phẩm sáng tạo thay đổi trong quá trình thực hiện và can thiệp bất cứ lúc nào.
- **Xem trước trước khi xuất.** Các tác nhân được hướng dẫn hiển thị các khung hình xem trước và chỉ tạo bản xuất cuối cùng khi bạn yêu cầu.
- **Các thay đổi trong bảng thuật ngữ cần được thống nhất.** Các tác nhân được hướng dẫn xác nhận với bạn về thuật ngữ mới trước khi thêm vào, thay vì âm thầm thay đổi cơ sở dữ liệu thuật ngữ của bạn.
- **Phê duyệt giúp không gian làm việc học hỏi.** Khi bạn phê duyệt một thị trường, nội dung đã duyệt sẽ được lưu vào bộ nhớ của không gian làm việc, để lần chạy tác nhân tiếp theo bắt đầu từ đó.

Đó cũng là nguyên tắc đằng sau mọi quy trình của Hyperlocalise, như chúng tôi đã đề cập trong [Bạn có nên tự xây dựng một tác nhân bản địa hóa?](/blog/should-you-build-your-own-localisation-agent): phần khó không phải là tạo nội dung, mà là duy trì ngữ cảnh, bảo đảm chất lượng và học hỏi từ phản hồi của con người.

## Bắt đầu

1. **[Tải Iris](/iris)** cho Mac. Ứng dụng miễn phí; việc tạo nội dung sử dụng tín dụng AI có trong các gói trả phí từ 20 USD/tháng.
2. Mở **Kết nối tác nhân qua MCP** và kết nối các tác nhân bạn sử dụng.
3. Hãy yêu cầu agent của bạn bản địa hóa một tài nguyên mà bạn sẽ phát hành trong tháng này.

Mới biết đến Iris? Hãy bắt đầu với [bài viết ra mắt](/blog/introducing-iris-ai-localisation-engine-for-multilingual-assets), hoặc đọc [Cách bản địa hóa quảng cáo hình ảnh và nội dung sáng tạo trên mạng xã hội cho từng thị trường](/blog/how-to-localise-image-ads-and-social-creatives-for-every-market) để biết quy trình mà agent của bạn sẽ làm theo.
