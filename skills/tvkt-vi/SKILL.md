---
name: tvkt-vi
description: "Soạn, rà và chuẩn hóa tiếng Việt kỹ thuật theo bộ TVKT-100 (30 quy tắc, 70 thuật ngữ, linter L001-L007). Dùng khi viết hoặc sửa tài liệu tiếng Việt, README, hướng dẫn vận hành, thông báo lỗi, mô tả API, tiêu chí kiểm thử, hoặc khi câu trả lời tiếng Việt cần chuẩn và dễ hiểu hơn. Cũng dùng khi người dùng nói 'viết lại cho chuẩn', 'dịch sang tiếng Việt kỹ thuật', 'rà lại tiếng Việt', 'TVKT'."
user-invocable: true
---

# TVKT-100 — tiếng Việt kỹ thuật có kiểm soát

Bộ chuẩn nội bộ, không phải tiêu chuẩn quốc gia và không phải bản dịch ASD-STE100. Quy tắc ngôn ngữ **không** xác minh tính đúng của nghiệp vụ, API hay mã nguồn.

Skill này đi kèm plugin `dsh-tvkt-vi`: linter nằm trong gói tại `vendor/tvkt/`, không cần cài thêm gì. Nếu trên máy có bộ TVKT-100 bản đầy đủ (bốn tệp `01-TVKT-RULES.md` … `04-TVKT-AGENT.md`), đặt `TVKT_HOME` trỏ tới thư mục gốc của bộ đó để dùng đúng bản đang lưu hành.

Đọc thêm khi cần: [thuật ngữ, cụm P001-P012, mẫu câu](references/terms-quick.md) · [mở rộng cho chat: xưng hô, chính tả, trộn tiếng Anh](references/chat-extension.md) — phần mở rộng là **đề xuất**, không thuộc TVKT-100.

## Ba chế độ

Mặc định **REVIEW** khi người dùng đưa văn bản có sẵn và không nói rõ. Nói một câu đang chạy chế độ nào rồi làm.

- **DRAFT — soạn mới.** Cần: mục đích, người đọc, phạm vi, nguồn sự thật, thuật ngữ dự án, định dạng ra. Thiếu thì dùng giả định hợp lý và ghi giả định, không hỏi từng cái. Quy trình: đọc nguồn → ghi sự thật có dẫn chiếu → dàn ý → viết theo TVKT → đánh dấu phần chưa xác minh → tự rà.
- **REVIEW — kiểm tra.** Ra danh sách vấn đề: mã quy tắc, trích đoạn, giải thích, mức độ, đề xuất, yêu cầu xác minh. **Không sửa tệp.**
- **REWRITE — chuẩn hóa.** Sao lưu bản gốc → đề xuất sửa từng đoạn → so sánh nghĩa → ghi diff → chờ duyệt → chỉ áp dụng thay đổi đã duyệt. Sửa hình thức trước; đổi nội dung kỹ thuật thì đánh dấu `CẦN XÁC NHẬN`.

## Mười nguyên tắc

1. Không tự tạo chức năng, dữ liệu, yêu cầu hay sự kiện chưa xác nhận.
2. Giữ nguyên tên mã nguồn, endpoint, trường dữ liệu, mã lỗi, định danh kỹ thuật.
3. Dùng thuật ngữ theo từ điển đã duyệt, tôn trọng nghĩa theo ngữ cảnh.
4. Ưu tiên câu chủ động, ngắn, chủ thể rõ.
5. Không đổi nghĩa kỹ thuật chỉ để câu ngắn hơn.
6. Phân biệt nội dung đã xác minh và nội dung dự kiến.
7. Nội dung mơ hồ → `CẦN XÁC NHẬN` kèm câu hỏi cụ thể.
8. Mỗi đề xuất sửa nêu mã quy tắc và lý do.
9. Không tự áp dụng thay đổi có thể tác động hành vi hệ thống.
10. Trả tài liệu chuẩn hóa **cùng** danh sách vấn đề còn tồn tại.

## 30 quy tắc, bản rút

**Từ ngữ.** 001 một khái niệm một thuật ngữ. 002 từ trực tiếp: "tiến hành kiểm tra" → "kiểm tra". 003 cấm từ mơ hồ trong yêu cầu kiểm thử ("nhanh", "ổn định", "tối ưu") — phải có tiêu chí đo. 004 giữ nguyên định danh kỹ thuật, bọc `backticks`. 005 giải thích chữ viết tắt ở lần đầu.

**Cụm danh từ.** 006 tránh chuỗi danh từ dài. 007 một đối tượng giữ một tên trong toàn tài liệu. 008 nói rõ ai sở hữu, chứa, tác động lên ai.

**Động từ.** 009 động từ cụ thể (tạo, đọc, kiểm tra, gửi, nhận, lưu, cập nhật, xóa, khóa, mở, đóng, trả về); hạn chế "xử lý", "thao tác", "tiến hành". 010 câu chủ động; bị động chỉ khi chủ thể không xác định. 011 bốn mức **PHẢI** / **KHÔNG ĐƯỢC** / **NÊN** / **ĐƯỢC PHÉP**; không dùng "có thể" thay "ĐƯỢC PHÉP". 012 không đổi động từ khác nghĩa: khởi tạo ≠ bắt đầu, xóa ≠ ẩn, lưu ≠ đồng bộ.

**Câu.** 013 mỗi câu một thông tin chính. 014 xác định chủ thể. 015 **Nếu** = điều kiện, **Khi** = thời điểm, **Sau khi** = trình tự. 016 hướng dẫn ≤ 30 tiếng, mô tả ≤ 40 tiếng, đoạn ≤ 5 câu, mỗi câu hướng dẫn một hành động. 017 tránh "và/hoặc" khi viết rõ từng trường hợp được.

**Quy trình.** 018 mỗi bước một hành động chính. 019 thứ tự theo phụ thuộc thật. 020 nêu kết quả mong đợi và cách kiểm tra. 021 cảnh báo **trước** bước rủi ro, nêu rủi ro và cách phòng tránh.

**Mô tả hệ thống.** 022 mỗi đoạn một chủ đề. 023 nhãn trạng thái **ĐÃ TRIỂN KHAI** / **ĐANG PHÁT TRIỂN** / **DỰ KIẾN** / **CHƯA XÁC MINH**. 024 mô tả hành vi: đầu vào → điều kiện → hành động → đầu ra, kể cả nhánh lỗi.

**Cảnh báo, lỗi.** 025 bốn mức **NGUY HIỂM** / **CẢNH BÁO** / **LƯU Ý** / **LỖI**. 026 lỗi có cấu trúc: đã xảy ra gì → nguyên nhân đã xác minh → cách khắc phục.

**Dấu câu, số liệu.** 027 dấu câu nhất quán, không lạm dụng "!". 028 số liệu có đơn vị (`500 ms`, `10 MB`), thời gian ISO 8601 kèm múi giờ.

**Kiểm tra, quản trị.** 029 kiểm tra trước khi xuất bản; PASS của linter không chứng minh nội dung đúng. 030 ngoại lệ có lý do, phạm vi, người duyệt, hạn rà soát.

## Linter (L001-L007)

Chạy trong thư mục skill (đường dẫn tuyệt đối in ở cuối tài liệu này):

```bash
python3 scripts/lint-text.py <<'TXT'      # rà câu đang soạn, đọc stdin
<nội dung>
TXT
python3 scripts/lint-text.py bai.md --json
python3 scripts/lint-text.py bai.md --quiet
```

L001 cụm không ưu tiên · L002 từ mơ hồ cạnh từ quy định · L003/L004 câu quá dài · L005 đoạn quá 5 câu · L006 từ quy định chưa viết hoa · L007 thiếu nhãn trạng thái. Quy tắc 001, 004, 006-010, 012-015, 017-030 cần đọc hiểu — **không** báo là "đã kiểm tự động". Linter đếm *tiếng* theo khoảng trắng nên từ ghép bị đếm thành nhiều đơn vị: coi cảnh báo là gợi ý.

## Đầu ra REVIEW/REWRITE

1. **Tóm tắt** — mục tiêu, nguồn, phạm vi, trạng thái.
2. **Nội dung đề xuất** — toàn văn (REWRITE) hoặc các đoạn cần sửa (REVIEW).
3. **Bảng thay đổi** — câu gốc | câu đề xuất | mã TVKT | lý do | độ tin cậy.
4. **CẦN XÁC NHẬN** — câu hỏi cụ thể, nguồn cần đối chiếu, tác động nếu bỏ qua.

Chỉ ghi "ĐÃ HOÀN TẤT CHUẨN HÓA NGÔN NGỮ" sau khi đã chạy các kiểm tra khả dụng và liệt kê phần chưa kiểm chứng. Không đồng nhất với "ĐÃ XÁC MINH ĐÚNG KỸ THUẬT".

## Danh sách duyệt

- [ ] Thuật ngữ nhất quán, đúng nghĩa dự án.
- [ ] Mỗi câu rõ chủ thể, hành động, kết quả.
- [ ] Yêu cầu có tiêu chí đo khi cần.
- [ ] Bước quy trình có điều kiện tiên quyết và kết quả mong đợi.
- [ ] Nội dung chưa kiểm chứng có nhãn đúng.
- [ ] Cảnh báo và nguyên nhân lỗi không suy đoán.
- [ ] Định danh kỹ thuật không bị đổi.
- [ ] Ngoại lệ được ghi nhận.
