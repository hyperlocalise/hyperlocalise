---
title: "Danh sách kiểm tra phát hành"
description: "Kiểm tra bản cập nhật tài liệu trước khi đồng bộ hóa nội dung đã dịch."
---

# Danh sách kiểm tra phát hành

Ship updates without breaking placeholders like `{{locale}}` or flags such as `--dry-run`.

Use the [status reference](https://example.com/docs/status?tab=cli#dry-run) before you push changes.

Liên kết tham khảo cũng nên được giữ lại: [Hướng dẫn dòng lệnh][cli-guide] và ![Sơ đồ](https://example.com/assets/flow(chart).png).

> Giữ các nhãn lặp lại ổn định.
> Giữ các nhãn lặp lại không thay đổi.
>
> Preserve `MDPH_0_END` as literal prose, not as a parser token.

- Xem lại "Tóm tắt đồng bộ" trong cửa sổ终端。
- Xác nhận rằng các liên kết trong [Hướng dẫn khắc phục sự cố](https://example.com/docs/troubleshooting#common-errors) vẫn còn hoạt động.
- Không dịch `hyperlocalise run --group docs`.
- Escape characters like `\*literal asterisks\*` and `docs\[archive]` carefully.

| Bước | Người chịu trách nhiệm | Ghi chú |
| ---- | ----- | ----- |
| Prepare | Docs | Replace only the sentence, not `docs/{{locale}}/index.mdx`. |
| Verify | QA | Check "Sync summary" appears in the report and review [CLI guide][cli-guide]. |
| Publish | Ops | Upload ![Diagram](https://example.com/assets/flow(chart).png) after approval. |

1. Mở `docs/index.mdx`.
2. Tìm kiếm "Tóm tắt đồng bộ".
3. So sánh với bản ghi chú phiên bản trước.

- Mục cha
  - Ghi chú đệ quy với [Khắc phục sự cố](https://example.com/docs/troubleshooting#common-errors) và `{{locale}}`

```bash
hyperlocalise run --group docs --dry-run
```

Lưu ý cuối cùng: "Tóm tắt đồng bộ hóa" phải nhất quán trên danh sách kiểm tra và báo cáo.

[cli-guide]: https://example.com/docs/cli(reference)
