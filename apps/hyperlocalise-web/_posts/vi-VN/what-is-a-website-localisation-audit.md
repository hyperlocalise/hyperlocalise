---
title: Kiểm tra bản địa hóa website là gì?
date: 2026-08-13T00:00:00.000Z
excerpt: Dịch một website chỉ là bước khởi đầu. Một cuộc kiểm tra bản địa hóa đánh giá việc triển khai kỹ thuật, chất lượng ngôn ngữ, bối cảnh sản phẩm và trải nghiệm trực quan — đồng thời cho bạn biết cần khắc phục điều gì trước tiên.
category: Sản phẩm
tags:
  - localisation audit
  - website localisation
  - localisation
  - localization
  - hreflang
  - translation quality
  - visual QA
  - product localisation
  - AI translation
  - SEO
  - terminology consistency
  - RTL
---

Dịch một trang web mới chỉ là bước khởi đầu của quá trình bản địa hóa.

A site can have translated pages and still give international users a poor experience. A missing `hreflang` tag can hurt discoverability. An untranslated call to action can confuse visitors. A technically correct translation can still use the wrong product term. A longer German string can break a button on mobile.

Câu hỏi mà một cuộc kiểm tra bản địa hóa trả lời không phải là "có bao nhiêu chuỗi được dịch?" Mà là:

> **Trang web của bạn có mang lại cảm giác như thực sự được xây dựng dành cho người dùng ở khu vực này không?**

Hyperlocalise Localisation Audit kiểm tra một trang web trên bốn khía cạnh — kỹ thuật, ngôn ngữ, ngữ cảnh và hình ảnh — rồi đưa ra một Điểm bản địa hóa duy nhất trên thang điểm 100, cùng với các vấn đề cần khắc phục trước tiên.

## Phạm vi của một cuộc kiểm tra bản địa hóa

Một cuộc kiểm tra bản địa hóa không phải là công cụ kiểm tra bản dịch, cũng không phải là cuộc kiểm tra website chung chung.

Các công cụ đánh giá hiệu suất, khả năng tiếp cận và SEO xem xét cách triển khai. Công tác QA bản dịch tập trung vào độ chính xác, ngữ pháp và tính trôi chảy. Không công cụ nào cho thấy toàn diện về một trang web đa ngôn ngữ.

Một cuộc kiểm tra bản địa hóa kết hợp cả hai góc nhìn:

| Kiểm toán       | Trọng số | Giải đáp vấn đề gì                                       |
| ---------------- | -----: | ----------------------------------------------------- |
| Kiểm tra kỹ thuật  |    25% | Bản địa hóa có được triển khai đúng cách không?                |
| Kiểm tra ngôn ngữ |    25% | Bản dịch có chính xác, tự nhiên và nhất quán không?   |
| Kiểm tra ngữ cảnh |    25% | Bản địa hóa có phù hợp với ngữ cảnh sản phẩm của bạn không? |
| Đánh giá trực quan |    25% | Giao diện người dùng đã bản địa hóa có hiển thị và hoạt động chính xác không?      |

Bạn nhận được điểm tổng thể, điểm cho từng lĩnh vực và các phát hiện có thể hành động kèm theo mức độ nghiêm trọng, bằng chứng và độ tin cậy.

## Cách diễn giải điểm số

Điểm tổng thể là một chỉ báo về tình trạng, không thay thế cho các phát hiện chi tiết. Luôn xem xét các vấn đề có mức độ nghiêm trọng cao nhất trước tiên.

| Điểm  | Xếp hạng         | Ý nghĩa                                                              |
| ------ | ----------------- | -------------------------------------------------------------------- |
| 90–100 | Xuất sắc | Trải nghiệm được bản địa hóa đang ở trạng thái rất tốt |
| 75–89  | Tốt              | Trang web nhìn chung được bản địa hóa tốt, nhưng vẫn còn một số vấn đề cần cải thiện |
| 50–74  | Cần cải thiện | Người dùng có thể gặp phải các vấn đề bản địa hóa đáng chú ý                 |
| 25–49  | Kém               | Những thiếu sót đáng kể trong bản địa hóa đang ảnh hưởng đến trải nghiệm           |
| 0–24   | Nghiêm trọng      | Trải nghiệm được bản địa hóa có các vấn đề nghiêm trọng cần được giải quyết |

Một trang web có thể đạt điểm tổng thể tốt nhưng vẫn có một vấn đề nghiêm trọng trong quy trình thanh toán, định tuyến hoặc trên một trang có lượng truy cập cao. Điểm số cho bạn biết cần xem xét ở đâu. Các phát hiện cho bạn biết cần khắc phục điều gì.

## Đánh giá kỹ thuật: bản địa hóa đã được triển khai đúng cách chưa?

Kiểm tra kỹ thuật đánh giá cơ sở hạ tầng phía sau một trang web đa ngôn ngữ: khả năng được phát hiện, định tuyến, định dạng, khả năng tiếp cận, và liệu người dùng cũng như các công cụ tìm kiếm có thể truy cập đúng ngôn ngữ hay không.

### Phát hiện và định tuyến ngôn ngữ địa phương

Pages should declare their language and locale correctly, for example `<html lang="fr-FR">`. The audit looks for missing language declarations, incorrect language or region codes, locale/content mismatches, and inconsistent identifiers.

Nó cũng kiểm tra xem các trang được bản địa hóa có sử dụng cấu trúc URL nhất quán hay không:

```text
/en/pricing
/fr/pricing
/de/pricing
```

Các lỗi thường gặp bao gồm thiếu tuyến đường đã bản địa hóa, URL ngôn ngữ bị hỏng, chuyển hướng không chính xác, bất ngờ chuyển về ngôn ngữ mặc định và các vấn đề về duy trì ngôn ngữ.

### Language switcher and `hreflang`

Visitors should be able to change locale without losing the page they are viewing. Switching from `/fr/pricing` should land on `/de/pricing`, not the German homepage.

The audit also checks the relationships between localised versions of a page: missing `hreflang`, incorrect language or region codes, invalid URLs, missing reciprocal or self-references, incorrect `x-default`, and conflicts with canonical URLs.

Các trang được bản địa hóa nhìn chung nên đặt canonical về chính chúng. Một trang định giá bằng tiếng Pháp đặt canonical về phiên bản tiếng Anh là một lỗi SEO phổ biến:

```text
/fr/pricing
canonical → /en/pricing
```

### Siêu dữ liệu, sơ đồ trang web và dữ liệu có cấu trúc

Important page metadata should be localised: titles, meta descriptions, Open Graph titles and descriptions, `og:locale`, and social sharing metadata.

Bản kiểm tra cũng xác định xem các URL đã được bản địa hóa có xuất hiện trong sơ đồ trang web và phân giải chính xác hay không, đồng thời, khi thích hợp, kiểm tra xem dữ liệu có cấu trúc như Sản phẩm, Trang web, Breadcrumbs, Câu hỏi thường gặp, Tổ chức, Bài viết và Doanh nghiệp địa phương đã được bản địa hóa hay chưa.

### Định dạng quốc tế và khả năng tiếp cận

Các giá trị phụ thuộc vào ngôn ngữ và khu vực phải phù hợp với ngôn ngữ và khu vực:

```text
US:  $1,234.56
DE:  1.234,56 €
FR:  1 234,56 €
```

Điều đó bao gồm ngày tháng, thời gian, số liệu, tiền tệ, đơn vị đo lường và múi giờ.

Accessibility localisation covers `lang`, `aria-label`, accessible names, form labels, validation messages, and image `alt` text.

## Kiểm tra ngôn ngữ: Ngôn ngữ có chính xác, tự nhiên và nhất quán không?

Đánh giá Ngôn ngữ xem xét ngôn ngữ trên trang. Hoạt động này không chỉ kiểm tra xem văn bản đã được dịch hay chưa mà còn xem bản dịch có truyền tải đúng ý nghĩa và nghe tự nhiên đối với người dùng ở ngôn ngữ đích hay không.

### Tính đầy đủ và độ chính xác

Nội dung chưa được dịch sẽ được đánh dấu, trong khi tên thương hiệu, tên sản phẩm, URL, địa chỉ email, mã, danh từ riêng và các thuật ngữ tiếng Anh được sử dụng có chủ đích được xem là những ngoại lệ được chấp nhận.

Một trang bằng tiếng Pháp có nội dung:

```text
Bienvenue sur notre site.

Start your free trial
```

sẽ bị đánh dấu vì lời kêu gọi hành động chưa được dịch.

Các bước kiểm tra độ chính xác sẽ tìm những nội dung bị thiếu hoặc bị thêm, cách diễn giải không chính xác, số liệu sai, thao tác sản phẩm không đúng và thuật ngữ không chính xác.

### Độ trôi chảy, thuật ngữ và giọng điệu thương hiệu

Bản dịch có thể đúng về mặt kỹ thuật nhưng vẫn nghe không tự nhiên. Quy trình kiểm tra sẽ tìm các cách diễn đạt gượng gạo, cấu trúc câu không tự nhiên, lỗi ngữ pháp và chính tả, dấu vết của bản dịch máy cũng như các quy ước viết đặc thù của từng địa phương.

Nó cũng xác định các khái niệm được dịch khác nhau trên toàn bộ trang web:

```text
Workspace

Page 1 → Espace de travail
Page 2 → Workspace
Page 3 → Espace Workspace
```

Không gian làm việc

Giọng thương hiệu được đánh giá dựa trên sắc thái mong muốn — chuyên nghiệp, thân thiện, súc tích, kỹ thuật, đàm thoại, cao cấp hoặc vui nhộn — cùng với ngữ pháp và phong cách phù hợp với từng ngôn ngữ, chẳng hạn như cách viết hoa, dấu câu, mức độ trang trọng và sự hòa hợp.

## Kiểm tra theo ngữ cảnh: bản dịch có phù hợp với sản phẩm này không?

Bối cảnh là một trong những khía cạnh dễ bị bỏ sót nhất khi bản địa hóa.

Một bản dịch có thể hoàn toàn đúng ngữ pháp nhưng vẫn không phù hợp với nơi nó xuất hiện. Từ "Hủy" có thể có nghĩa là đóng hộp thoại, hủy gói đăng ký, hủy đơn hàng hoặc dừng một thao tác. Bản dịch phù hợp phụ thuộc vào ngữ cảnh của sản phẩm.

Kiểm tra ngữ cảnh sử dụng ngữ cảnh về trang, giao diện người dùng, thuật ngữ và sản phẩm để đánh giá xem bản dịch có hợp lý trong ngữ cảnh được sử dụng hay không.

### Mục đích của UI, sản phẩm và CTA

Quá trình kiểm tra đánh giá vị trí xuất hiện của chuỗi — nút, điều hướng, biểu mẫu, cửa sổ phương thức, chú giải công cụ, tiêu đề, thông báo lỗi, thông báo, menu hoặc thanh toán — và đối chiếu ngôn ngữ với các khái niệm sản phẩm trên trang: tên tính năng, gói, cài đặt, khái niệm tài khoản, hành động trong quy trình và thuật ngữ sản phẩm.

Các lời kêu gọi hành động cần được đặc biệt chú ý. "Bắt đầu dùng thử miễn phí", "Đặt ngay", "Lưu thay đổi", "Xóa tài khoản" và "Nâng cấp" phải truyền đạt đúng hành động mong muốn trong ngôn ngữ đích, không chỉ là một cách diễn đạt tương đương chung chung.

### Thuật ngữ, bộ nhớ dịch và văn hóa

Vui lòng cung cấp văn bản cần dịch.

Khi có các bản dịch đã được phê duyệt trước đó, quy trình kiểm tra có thể xác định những sai lệch so với bộ nhớ dịch thuật.

Việc thích ứng văn hóa xem xét tiền tệ, ngày tháng, đơn vị đo lường, địa chỉ, số điện thoại, thông lệ thanh toán, các ví dụ địa phương, tham chiếu văn hóa và thành ngữ. Không phải mọi khác biệt đều là lỗi. Khi phù hợp, các phát hiện về văn hóa được trình bày dưới dạng khuyến nghị hoặc vấn đề cần xem xét.

Bối cảnh đối tượng cũng rất quan trọng. Ngôn ngữ phù hợp với một sản phẩm du lịch dành cho người tiêu dùng có thể không phù hợp với một công cụ dành cho nhà phát triển doanh nghiệp, một sản phẩm tài chính hoặc lĩnh vực chăm sóc sức khỏe.

## Kiểm tra trực quan: trang web đã bản địa hóa có thực sự hoạt động không?

Ngôn ngữ làm thay đổi kích thước, hình dạng và bố cục của nội dung. Kiểm tra trực quan đánh giá các trang đã kết xuất để tìm ra những vấn đề không thể phát hiện chỉ từ các chuỗi nguồn.

### Tràn nội dung, bố cục và độ dài văn bản વધ

Tiếng Anh "Bắt đầu dùng thử miễn phí" trở thành tiếng Đức "Kostenlose Testversion starten". Nếu phiên bản tiếng Đức không còn vừa với nút, bản kiểm tra sẽ gắn cờ phiên bản đó.

Các vấn đề trực quan khác bao gồm văn bản bị cắt hoặc rút gọn, dấu ba chấm không mong muốn, nội dung điều hướng và bảng bị tràn, các phần tử chồng lấn, lưới bị hỏng, nội dung bị căn chỉnh sai, cửa sổ phương thức bị tràn, ngắt dòng không mong muốn và khoảng cách không chính xác.

Các trang được bản địa hóa cũng có thể hiển thị khác nhau ở các chiều rộng dành cho thiết bị di động, máy tính bảng và máy tính để bàn. Quá trình kiểm tra có thể đánh giá các bố cục chính trên những điểm ngắt đó.

### RTL, phông chữ và tài nguyên được bản địa hóa

Đối với các ngôn ngữ RTL như tiếng Ả Rập và tiếng Do Thái, quá trình kiểm tra sẽ xem xét hướng văn bản, việc phản chiếu bố cục, điều hướng, căn chỉnh, biểu tượng, biểu mẫu, thanh bên và hộp thoại.

Kiểu chữ phải hỗ trợ các hệ chữ đích — bao gồm tiếng Ả Rập, tiếng Trung, tiếng Nhật, tiếng Hàn, tiếng Thái, tiếng Việt và chữ Kirin. Các glyph bị thiếu, phông chữ dự phòng không mong muốn, kiểu chữ không nhất quán, chiều cao dòng không chính xác và các vấn đề về hiển thị sẽ bị đánh dấu.

Các tài sản trực quan dành riêng cho ngôn ngữ cũng rất quan trọng. Một trang tiếng Pháp chứa ảnh chụp màn hình giao diện người dùng bằng tiếng Anh vẫn là một thiếu sót về bản địa hóa, ngay cả khi mọi chuỗi trên trang đều đã được dịch.

Cuộc kiểm tra cũng xem xét liệu các thay đổi bản địa hóa có làm thay đổi thứ bậc trực quan hay không: tiêu đề trở nên quá dài, CTA bị xuống dòng, văn bản quan trọng mất đi sự nhấn mạnh, các thẻ có chiều cao không đồng nhất và điều hướng trở nên khó lướt.

## Cách các phát hiện được ưu tiên hóa

Không phải vấn đề nào cũng có mức độ ảnh hưởng như nhau. Mỗi phát hiện đều được gán một mức độ nghiêm trọng để các nhóm có thể ưu tiên khắc phục những vấn đề quan trọng trước.

Các vấn đề **Nghiêm trọng** có thể gây ảnh hưởng nghiêm trọng đến trải nghiệm bản địa hóa: không có ngôn ngữ phù hợp, trang hoàn toàn chưa được dịch, cung cấp sai ngôn ngữ, đơn vị tiền tệ thanh toán không chính xác, lỗi bố cục RTL nghiêm trọng hoặc tuyến đường bản địa hóa không thể truy cập.

**High** issues affect usability, SEO, or translation quality: missing `hreflang`, an untranslated primary CTA, a major translation error, broken navigation, clipped important text, or incorrect product terminology.

Các vấn đề **Trung bình** dễ nhận thấy và cần được khắc phục: thuật ngữ không nhất quán, thiếu siêu dữ liệu đã bản địa hóa, nội dung phụ chưa được dịch, tràn hiển thị nhỏ hoặc thiếu văn bản thay thế đã bản địa hóa.

Các phát hiện **Mức thấp** là những cải thiện về chất lượng: cách diễn đạt hơi thiếu tự nhiên, sự không nhất quán nhỏ về văn phong, các vấn đề nhỏ về định dạng hoặc những cải thiện siêu dữ liệu không bắt buộc.

Các mục **Thông tin** là những đề xuất hoặc cơ hội không nhất thiết là lỗi.

AI-powered findings also include a confidence level where appropriate. High-confidence findings are more likely to be objective or deterministic — for example, missing `hreflang`. Lower-confidence findings, such as a potential cultural adaptation issue, should be treated as recommendations for review rather than definitive errors.

## Cách thức kiểm tra hoạt động

Quá trình kiểm tra bắt đầu từ URL của website, phát hiện các ngôn ngữ bản địa hóa hiện có, thu thập dữ liệu trên các trang đã bản địa hóa, trích xuất nội dung và siêu dữ liệu, kết xuất các trang, sau đó chạy bốn công cụ phân tích trước khi tính điểm và tạo báo cáo.

Locale discovery uses signals such as URL structure, `hreflang`, sitemaps, language selectors, HTML metadata, and domains or subdomains.

Việc hiển thị trang thực tế rất quan trọng. Các vấn đề về giao diện do nội dung được dịch thường không tồn tại trong mã nguồn HTML. Báo cáo bao gồm Điểm bản địa hóa tổng thể, điểm của bốn mô-đun, các vấn đề được nhóm theo mức độ nghiêm trọng, các trang bị ảnh hưởng, bằng chứng, độ tin cậy và các hành động được đề xuất.

## Từ các phát hiện đến chất lượng liên tục

Một cuộc kiểm tra không nên chỉ dừng lại ở việc cho bạn biết điều gì không ổn.

Khi Hyperlocalise xác định một vấn đề, phát hiện đó có thể trở thành điểm khởi đầu để khắc phục: nội dung chưa được dịch có thể được dịch, các thuật ngữ không nhất quán có thể được đối chiếu với các thuật ngữ đã được phê duyệt, các vi phạm thuật ngữ trong bảng thuật ngữ có thể được cập nhật, siêu dữ liệu còn thiếu có thể được bản địa hóa, và tình trạng tràn nội dung hiển thị có thể được xử lý trong nội dung hoặc bố cục.

Điều đó tạo ra một quy trình làm việc liên tục: kiểm tra, tìm ra vấn đề, khắc phục, kiểm tra lại, giám sát và phát hiện các hồi quy.

Localisation is not a one-time project. Every new feature, page, release, or translation can introduce new problems — new English strings, missing translations, glossary violations, broken `hreflang`, incorrect metadata, visual overflow, or routing regressions.

Đối với các nhóm phát hành liên tục, mục tiêu là chuyển từ việc kiểm tra bản địa hóa một lần sang giám sát chất lượng bản địa hóa liên tục.

This is the same shift we described in [What Is Translation Intelligence?](/blog/what-is-translation-intelligence): translation output is no longer the bottleneck. Judgement, context, and regression detection are.

## Các câu hỏi thường gặp

### Đây có phải là công cụ kiểm tra bản dịch không?

Không hẳn. Công cụ kiểm tra bản dịch chủ yếu tập trung vào chất lượng ngôn ngữ. Hyperlocalise Localisation Audit đánh giá toàn bộ trang web đã được bản địa hóa, bao gồm triển khai kỹ thuật, SEO, ngữ cảnh sản phẩm và giao diện người dùng trực quan.

### Một website được dịch có tự động đạt điểm cao không?

No. A website can have fully translated content and still have problems with `hreflang`, locale routing, currency, date formatting, terminology, product context, visual layout, and accessibility. The score evaluates the overall experience.

### Bản kiểm tra có thể phát hiện nội dung chưa được dịch không?

Có. Công cụ này phân tích các trang đã được bản địa hóa để xác định nội dung dường như vẫn còn ở ngôn ngữ nguồn, đồng thời tính đến tên thương hiệu, URL, tên sản phẩm và các nội dung khác có thể được giữ nguyên một cách có chủ ý.

### Nó có thể phát hiện bản dịch sai không?

Kiểm tra có thể xác định các vấn đề tiềm ẩn liên quan đến ý nghĩa, độ trôi chảy, thuật ngữ, ngữ pháp và tính nhất quán. Các phát hiện do AI hỗ trợ bao gồm thông tin về độ tin cậy, giúp các nhóm phân biệt những phát hiện chắc chắn với những mục có thể cần con người xem xét.

### Nó có thể phát hiện các vấn đề về hình ảnh không?

Có. Visual Audit đánh giá các trang đã bản địa hóa được hiển thị và có thể xác định tình trạng văn bản bị tràn, bố cục bị hỏng, các vấn đề về khả năng thích ứng, vấn đề RTL và các vấn đề về tài sản đã bản địa hóa.

### Điểm số thấp có nghĩa là trang web không thể sử dụng được phải không?

Không nhất thiết. Điểm số là một chỉ báo về tình trạng. Luôn xem xét từng phát hiện và mức độ nghiêm trọng của chúng. Một trang web có thể có điểm tổng thể tốt nhưng vẫn có một vấn đề nghiêm trọng ảnh hưởng đến một trang quan trọng hoặc luồng người dùng.

## Phát hiện các vấn đề bản địa hóa trước khi người dùng của bạn nhận ra

Các cuộc kiểm tra website truyền thống đo lường hiệu suất, khả năng tiếp cận và SEO. Kiểm tra QA bản dịch đo lường độ chính xác, ngữ pháp và độ trôi chảy. Một cuộc kiểm tra bản địa hóa đặt ra đồng thời bốn câu hỏi:

- Bản địa hóa đã được triển khai đúng cách chưa?
- Bản dịch có chính xác và tự nhiên không?
- Điều này có phù hợp với sản phẩm, đối tượng và tình huống không?
- Trải nghiệm được bản địa hóa có thực sự hiệu quả đối với người dùng không?

Kết hợp lại, những câu trả lời đó sẽ cung cấp một bức tranh đầy đủ hơn về tình trạng bản địa hoá.

If you are building products for more than one market, that picture is worth having before customers find the gaps themselves. [Run a free localisation audit](/localisation-audit) or read more about [context-aware localisation](/blog/ai-translation-is-not-enough-context-aware-localisation).
