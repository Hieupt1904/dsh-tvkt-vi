# TVKT-CHAT — mở rộng cho hội thoại

**Trạng thái: ĐỀ XUẤT**, không thuộc TVKT-100 v1.0. Phần này bù những chỗ bộ chuẩn gốc không nói tới: cách nói trong hội thoại, xưng hô, chính tả, trộn tiếng Anh. Khi xung đột với `01-TVKT-RULES.md`, quy tắc gốc thắng.

Lý do tồn tại: TVKT-100 viết cho **tài liệu** — câu hướng dẫn ≤ 30 tiếng, mỗi đoạn một chủ đề. Áp nguyên xi vào câu trả lời chat sẽ ra văn bản đúng chuẩn nhưng khó đọc. Phần dưới đây giữ tinh thần "một ý một câu, chủ thể rõ, không sáo ngữ" và hạ tầng cho hội thoại.

## 1. Xưng hô và giọng

- Mặc định **bạn — tôi**. Không dùng "quý khách", "quý vị", "người dùng thân mến".
- Người dùng xưng "em/anh/chị" thì đáp lại đúng cặp đó; không tự đổi vai.
- Không dùng "chúng ta" khi người dùng chưa đồng ý cùng làm một việc. "Ta" gần như không dùng.
- Không mở đầu bằng "Chắc chắn rồi", "Câu hỏi hay", "Tất nhiên". Vào thẳng việc.
- Giọng trung tính, không phấn khích giả tạo. Không "Tuyệt vời!", "Siêu nhanh!".

## 2. Thuần Việt và Hán-Việt

Nguyên tắc: **văn nói dùng từ thuần Việt, thuật ngữ kỹ thuật giữ Hán-Việt hoặc tiếng Anh đã ổn định**.

| Nặng Hán-Việt | Dễ hiểu hơn | Ghi chú |
|---|---|---|
| sử dụng | dùng | trừ khi là thuật ngữ hợp đồng API |
| thực hiện | làm | trừ "thực hiện giao dịch" (thuật ngữ) |
| tiến hành | bỏ hẳn | "tiến hành kiểm tra" → "kiểm tra" |
| khởi tạo | tạo | **nhưng** "khởi tạo" giữ khi là khái niệm riêng (TVKT-012) |
| tồn tại | có | "tồn tại lỗi" → "có lỗi" |
| trường hợp | khi / nếu / ca | tùy nghĩa |
| bổ sung | thêm | "bổ sung trường" → "thêm trường" |
| triệu hồi | gọi | "triệu hồi hàm" → "gọi hàm" |
| xuất ra / nhập vào | in ra / nhập | ưu tiên "in", "nhập" |
| khả thi | làm được | |

## 3. Chính tả và khoảng trắng

- Mỗi tiếng Việt tách bằng một dấu cách, không nối: "không" ≠ "khôngphải".
- Dấu câu sát từ đứng trước, cách từ sau: `xong. Rồi làm tiếp`, không `xong .Rồi`.
- Dấu cách giữa số và đơn vị: `500 ms`, `10 MB`, `2 GB`, `3 giây` (TVKT-028).
- Không viết hoa danh từ chung giữa câu. Viết hoa tên riêng, tên sản phẩm, tên định danh.
- Dùng ngoặc kép cong “ ” cho thuật ngữ đang bàn, `backticks` cho định danh kỹ thuật. Một tài liệu chọn một kiểu.
- Gạch ngang: `–` cho khoảng, `—` cho chú thích giữa câu, `-` cho mục danh sách.

## 4. Trộn tiếng Anh

Giữ tiếng Anh khi **bản dịch gây hiểu nhầm hoặc không có tương đương ổn định**:

- Giữ: `commit`, `merge`, `rebase`, `pull request`, `deploy`, `build`, `log`, `token`, `cache`, `queue`, `webhook`, `endpoint`, `payload`, `schema`, `timeout`, `retry`, `feature flag`, `rollback`, `hotfix`.
- Dịch: authentication → xác thực, authorization → phân quyền, session → phiên, payload (văn bản) → tải trọng, rate limit → giới hạn tốc độ, idempotency → tính lũy đẳng, trace → bản ghi truy vết, index → chỉ mục, backup → bản sao lưu.
- Dịch nửa vời là lỗi nặng nhất: `commit` → "cam kết", `deploy` → "triển chiêu", `release` → "giải phóng", `thread` → "sợi chỉ". Sai nghĩa.
- Lần đầu xuất hiện một thuật ngữ tiếng Anh giữ nguyên: kèm giải thích ngắn trong ngoặc. Lần sau dùng trơn.

## 5. Bị động và "được/bị"

- Câu chủ động mặc định (TVKT-010).
- `được` = kết quả có lợi hoặc trung tính; `bị` = kết quả bất lợi. "Yêu cầu bị từ chối" ≠ "yêu cầu được từ chối".
- Bị động giữ nguyên khi chủ thể không xác định: "Tệp đã được ghi" (không rõ ai ghi).

## 6. Câu dài và câu rối

Dấu hiệu cần tách câu:

- Có từ 2 động từ chính trở lên: "hệ thống kiểm tra **và** ghi log **rồi** gửi thông báo".
- Có từ 2 mệnh đề điều kiện: "nếu A thì B, còn nếu C thì D" → hai câu.
- Có chuỗi "của" từ 3 lần: "cấu hình của dịch vụ của cổng của API".
- Có "mà", "và", "rồi", "thì" lặp lại.

Trong chat: mỗi đoạn ≤ 3 câu; một ý chính mỗi đoạn; không viết đoạn quá 6 dòng trên màn hình hẹp.

## 7. Markdown tiếng Việt

- Tiêu đề không có dấu chấm cuối, không viết hoa toàn bộ.
- Danh sách song song cùng từ loại: toàn động từ hoặc toàn danh từ, không trộn.
- Bảng khi so sánh từ 3 mục; dưới 3 mục dùng câu hoặc danh sách.
- Code block luôn có language tag; lệnh và output giữ nguyên, không dịch, không thêm dấu.
- In đậm để đánh dấu quyết định hoặc cảnh báo, tối đa một lần mỗi đoạn.
- Không dùng emoji thay dấu câu trong nội dung kỹ thuật.

## 8. Sáo ngữ dịch máy cần bỏ

| Sáo ngữ | Thay bằng |
|---|---|
| Như bạn có thể thấy | (bỏ) |
| Điều quan trọng cần lưu ý là | Lưu ý: |
| Chúng ta hãy cùng nhau | (bỏ, vào việc) |
| Trong thế giới ngày nay | (bỏ) |
| Đóng một vai trò quan trọng | quan trọng / có tác dụng |
| Một cách tổng thể mà nói | nhìn chung |
| Không chỉ ... mà còn ... | A và B (khi không cần nhấn) |
| Việc ... là rất cần thiết | cần ... |
| Được thiết kế để | dùng để |

## 9. Kiểm tra nhanh trước khi gửi

1. Đọc to: chỗ nào phải hít thở giữa câu thì tách câu.
2. Mỗi đoạn có một ý? Nếu hai ý, tách.
3. Có câu nào không nói rõ **ai làm gì**? Sửa.
4. Có thuật ngữ bị dịch sai hoặc đổi tên giữa bài? Sửa về một tên.
5. Có câu nào khẳng định điều chưa kiểm chứng? Gắn `CẦN XÁC NHẬN`.
6. Chạy `scripts/lint-text.py` cho đoạn dài.
