# `.tvkt/config.json`

Cấu hình cho `docs-impact` và `docs-verify`. Tệp này **đã được implement**:
`scripts/docs-verify.mjs` đọc nó, và `test/docs.test.js` kiểm từng trường.

## Chính sách phiên bản

`schemaVersion` là số nguyên. Hiện chỉ có `1`. Khi đổi hình dạng tệp, tăng số
này và viết migration trong `scripts/migrate-tvkt-config.mjs`; công cụ từ chối
`schemaVersion` khác `1` thay vì đoán.

## Trường

| Trường | Kiểu | Mặc định | Ý nghĩa |
|---|---|---|---|
| `schemaVersion` | integer | `1` | Phiên bản hình dạng tệp. Bắt buộc. |
| `include` | string[] | `README.md`, `docs/**/*.md`, `skills/**/*.md` | Mẫu glob của tài liệu thuộc phạm vi kiểm. |
| `exclude` | string[] | `docs/evidence/**` | Mẫu glob loại khỏi phạm vi. `docs/evidence/` là bản sao upstream, không phải văn bản của dự án. |
| `protectedPaths` | string[] | `specs/**` | Vùng không bao giờ bị sửa tự động. `docs-verify` bỏ qua kiểm nội dung và xác nhận hash không đổi. |
| `generatedPaths` | string[] | `skills/tvkt-vi/references/terms-quick.md` | Tệp sinh; sửa phải ở generator, không sửa trực tiếp. |
| `changedFilesOnly` | boolean | `false` | Chỉ kiểm tài liệu có trong danh sách tệp thay đổi. |
| `reviewMode` | string | `report` | `report` chỉ báo; `apply` chỉ dùng ở `docs-sync` khi có người duyệt. `docs-verify` luôn chỉ đọc. |
| `rulesetVersion` | string | `TVKT-100 v1.0` | Bộ quy tắc dùng để kiểm. Đổi giá trị là đổi ngữ nghĩa rule. |

Mẫu glob hỗ trợ `**` (mọi tầng) và `*` (một tầng). Mẫu có `?` hoặc `{a,b}` bị
từ chối kèm cảnh báo, không khớp mò.

## Bảo đảm

- `docs-verify` không mở tệp để ghi. Test chụp hash toàn cây trước và sau.
- Tệp dưới `protectedPaths` bị xác nhận hash trước/sau; lệch byte là lỗi nghiêm
  trọng của chính công cụ, không phải cảnh báo.
