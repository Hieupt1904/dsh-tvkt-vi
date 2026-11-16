# `.tvkt/config.json`

Trạng thái: **ĐÃ TRIỂN KHAI**, phạm vi hẹp. Tệp này cấu hình **pipeline tài liệu
của repo**, không phải cấu hình runtime của plugin.

## Phạm vi: repo-maintenance, không phải runtime

Đây là điểm dễ hiểu sai nhất, nên nói thẳng: công cụ runtime `tvkt_lint` **không
đọc tệp này**. `lib/tool.js` không tham chiếu `.tvkt/`, và linter trong
`vendor/tvkt/` nhận đầu vào là `path` hoặc `text` của lần gọi, không nhận cấu
hình dự án. Không có `include`/`exclude`/`protectedPaths` nào ảnh hưởng tới một
lần model gọi `tvkt_lint`.

Ngược lại, các script bảo trì repo (`docs-verify`, `docs-sync`, `docs-impact`)
đọc tệp này. Chúng chạy trong CI và trên máy người bảo trì, không chạy trong
phiên agent.

## Ai đọc trường nào

Ký hiệu: **ACTIVE** = đọc và có tác động hành vi; **READ_ONLY** = đọc nhưng chỉ
để báo cáo, không đổi hành vi; **NOT_USED_AT_RUNTIME** = tool `tvkt_lint` không
đọc.

| Trường | `docs-verify` | `docs-impact` | `docs-sync` | `tvkt_lint` (runtime) |
|---|---|---|---|---|
| `schemaVersion` | ACTIVE — khác `1` thì báo lỗi | — | — | NOT_USED_AT_RUNTIME |
| `include` | ACTIVE — lọc phạm vi kiểm | — | — | NOT_USED_AT_RUNTIME |
| `exclude` | ACTIVE — loại khỏi phạm vi | — | — | NOT_USED_AT_RUNTIME |
| `protectedPaths` | ACTIVE — bỏ kiểm nội dung, so hash trước/sau | — (dùng danh sách riêng trong mã) | — | NOT_USED_AT_RUNTIME |
| `generatedPaths` | READ_ONLY — chỉ đánh dấu `generated: true` trong báo cáo | — | — | NOT_USED_AT_RUNTIME |
| `changedFilesOnly` | ACTIVE — chỉ kiểm tệp trong danh sách thay đổi | — | — | NOT_USED_AT_RUNTIME |
| `reviewMode` | — | — | READ_ONLY — chỉ in ra, không tự áp dụng | NOT_USED_AT_RUNTIME |
| `rulesetVersion` | READ_ONLY — chỉ chép vào báo cáo | — | — | NOT_USED_AT_RUNTIME |

Hai trường đang bị hiểu sai trong bản 0.5.0, nay ghi đúng:

- `generatedPaths` **không** chặn sửa tệp sinh. Nó chỉ gắn nhãn trong báo cáo.
  Việc chặn nằm ở `scripts/gen-terms-quick.mjs --check` và ở test.
- `rulesetVersion` **không** đổi ngữ nghĩa rule. Đổi chuỗi này không làm linter
  chạy bộ quy tắc khác. Bộ quy tắc thật nằm trong `vendor/tvkt/config/`.

## Chính sách phiên bản

`schemaVersion` là số nguyên, hiện chỉ có `1`. Khi đổi hình dạng tệp, tăng số
này và viết migration. Công cụ từ chối `schemaVersion` khác `1` thay vì đoán.

## Mẫu glob

Hỗ trợ `**` (mọi tầng) và `*` (một tầng). Mẫu có `?` hoặc `{a,b}` bị từ chối kèm
cảnh báo, không khớp mò.

## Bảo đảm

- `docs-verify` không mở tệp để ghi. Test chụp hash toàn cây trước và sau.
- Tệp dưới `protectedPaths` được so hash trước/sau; lệch byte là lỗi nghiêm
  trọng của chính công cụ, không phải cảnh báo.
- Tệp cấu hình không làm công cụ thoát workspace: mọi đường dẫn đều ghép từ gốc
  gói và mẫu glob không nhận tiền tố tuyệt đối.

## Giới hạn và việc chưa làm

Chưa có cấu hình runtime cho `tvkt_lint`. Muốn thêm thì phải làm đủ, không thêm
nửa vời. Tiêu chí nghiệm thu cho việc đó:

1. `include`/`exclude` áp cho cả đường `text` lẫn đường `path`, có test cho cả
   hai; đường `text` không có tên tệp nên phải nêu rõ nó luôn được kiểm.
2. `protectedPaths` trả kết quả `SKIPPED_PROTECTED` thay vì im lặng bỏ qua,
   để model biết vì sao không có finding.
3. `rulesetVersion` chỉ được nhận giá trị có trong `vendor/tvkt/config/`; giá trị
   lạ là lỗi tool, không phải cảnh báo.
4. Cấu hình không được trỏ linter ra ngoài `vendor/tvkt/` và không được chứa
   đường dẫn tuyệt đối; có test chứng minh.
5. Không auto-fix, không để tool tự ghi tệp.

Việc này chưa làm trong 0.5.0 vì nó đổi hành vi tool mà chưa có nhu cầu thật từ
người dùng.
