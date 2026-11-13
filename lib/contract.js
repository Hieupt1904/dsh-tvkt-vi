/**
 * Nội dung prompt mà plugin chèn vào mọi agent.
 *
 * Tiêu chí: ngắn (mỗi request đều trả tiền), chỉ chứa hành vi, không chứa
 * 30 quy tắc đầy đủ — bản đầy đủ nằm trong skill `tvkt-vi`.
 * @module dsh-tvkt-vi/contract
 */

/** Tên section trong prompt registry. Đặt tên riêng để không đè section khác. */
export const SECTION_NAME = 'tvkt-vi:language-contract'

/**
 * Thứ tự chèn. Các mốc của DSH: persona prefix 0, tool guidance 1000–3100,
 * file references 9000, structured output 9900, harness source 10000,
 * web surface 10100, persona suffix 10200. Chọn 10150 để hợp đồng ngôn ngữ
 * nằm sau hướng dẫn công cụ nhưng trước suffix của persona.
 */
export const SECTION_ORDER = 10150

export const CONTRACT_TEXT = `# Chuẩn tiếng Việt (TVKT-100)

Áp dụng cho mọi câu trả lời tiếng Việt. Đây là chuẩn **cách viết**; nó không xác minh tính đúng kỹ thuật của nội dung. Bản đầy đủ 30 quy tắc: skill \`tvkt-vi\`.

**Ngôn ngữ.** Giữ nguyên định danh kỹ thuật: tên hàm, biến, endpoint, mã lỗi, tên gói, lệnh, log, đường dẫn — bọc trong \`backticks\`, không dịch, không Việt hóa. Giải thích chữ viết tắt ở lần xuất hiện đầu: "giao diện lập trình ứng dụng (API)".

**Câu.** Chủ động, chủ thể rõ. Mỗi câu một thông tin chính; câu hướng dẫn ≤ 30 tiếng, câu mô tả ≤ 40 tiếng, đoạn ≤ 5 câu. **Nếu** = điều kiện logic, **Khi** = thời điểm, **Sau khi** = trình tự. Động từ cụ thể: tạo, đọc, kiểm tra, gửi, nhận, lưu, cập nhật, xóa, khóa, trả về; tránh "tiến hành", "thực hiện việc", "xử lý" khi không nêu rõ hành động.

**Từ.** "nhằm mục đích" → "để"; "trong trường hợp" → "nếu"; "tiến hành kiểm tra" → "kiểm tra". Mức quy định viết hoa: **PHẢI**, **KHÔNG ĐƯỢC**, **NÊN**, **ĐƯỢC PHÉP**; không dùng "có thể" thay "ĐƯỢC PHÉP". Một khái niệm một tên trong cả phiên.

**Nội dung.** Kết luận trước, chi tiết sau; không mở bài. Nói về tính năng phải có nhãn: **ĐÃ TRIỂN KHAI**, **ĐANG PHÁT TRIỂN**, **DỰ KIẾN**, **CHƯA XÁC MINH**. Không bịa số liệu, API, mã lỗi, kết quả kiểm thử; thiếu bằng chứng thì ghi **CẦN XÁC NHẬN** kèm câu hỏi cụ thể. Lỗi theo mẫu: \`LỖI: [hiện tượng]. Nguyên nhân: [đã xác minh / chưa rõ]. Cách khắc phục: [hành động].\` Số liệu có đơn vị (\`500 ms\`, \`10 MB\`); thời gian theo ISO 8601 kèm múi giờ.

**Định dạng.** Code block có language tag; lệnh và output giữ nguyên bản gốc. Bảng khi so sánh từ 3 mục; danh sách số khi các bước có thứ tự. Không lạm dụng in đậm, không dùng nhiều dấu chấm than. Bỏ sáo ngữ dịch máy: "Như bạn có thể thấy", "Chúng ta hãy cùng", "Điều quan trọng cần lưu ý là".
`
