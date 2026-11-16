# Golden corpus cho linter TVKT

Corpus hiện có **36 ca**. Mỗi ca là một cặp tệp trong thư mục con:

- `*.md` — văn bản đầu vào.
- `*.expected.json` — điều corpus khẳng định về kết quả `lint_text`.

Nguồn sinh là danh sách `CASES` trong `tests/golden/generate.py`. Sửa ca thì sửa
ở đó rồi chạy `python3 tests/golden/generate.py --write`.

## Cấu trúc `expected.json`

```json
{
  "description": "vì sao ca này tồn tại",
  "labels": ["protected", "terminology"],
  "expect_rules": [{ "rule_id": "L003", "count": 1 }],
  "expect_absent_rules": ["L001"],
  "expect_protected_lines": [3, 4],
  "expect_unique": ["L004:12"],
  "observed": { "lint_status": "PASS", "summary": {}, "protected_span_kinds": [] }
}
```

Nhãn đang dùng: `TP`, `protected`, `terminology`, `segmentation`, `mixed-language`,
`unicode`, `FN-guard`, `l006-info`, `l007-info`, `spec`, `known-false-positive`.

## Giới hạn quan trọng: kỳ vọng sinh từ chính hành vi hiện tại

`--write` sinh `expect_rules` bằng cách chạy linter rồi ghi lại những gì nó báo.
Vì vậy `FP = 0` trong `metrics.json` nghĩa là **corpus đồng ý với linter**, không
phải là linter không có false positive. Muốn đo precision thật thì kỳ vọng phải
do người viết tay, độc lập với đầu ra của linter — việc đó chưa làm.

Đọc `metrics.json` theo đúng nghĩa đó: số liệu chỉ có giá trị trong phạm vi
corpus này, và không nói gì về chất lượng tiếng Việt nói chung.

## False positive đã biết

Hai ca dưới đây mang nhãn `known-false-positive`. Chúng ghi lại hành vi hiện tại
để lần sửa sau có chỗ bám, không phải để khẳng định hành vi đó là đúng.

| Ca | Hiện tượng | Vì sao là false positive |
|---|---|---|
| `mixed-language/tu-mo-ho-trong-quote` | ngoặc kép **không** phải vùng bảo vệ, nên từ mơ hồ được trích dẫn vẫn bị `L002` báo | tài liệu kỹ thuật thường trích dẫn một từ để bàn về nó; đó không phải lỗi dùng từ |
| `protected/placeholder-khong-duoc-bao-ve` | `{{…}}` không phải vùng bảo vệ, nên `L001` vẫn báo cụm bên trong | placeholder là chỗ trống chờ thay, không phải văn xuôi |

Đối chứng: `mixed-language/tu-mo-ho-trong-inline-code` cho thấy mã nội tuyến **được**
bảo vệ, nên đây là khoảng trống của ngoặc kép và placeholder, không phải lỗi chung
của cơ chế bảo vệ.

## Đã phủ

- Fence 3/4/5 backtick lồng nhau; fence tilde; fence chưa đóng.
- Inline code một và nhiều backtick; Markdown link có dấu ngoặc trong URL; URL trần.
- Thẻ HTML có thuộc tính chứa cụm bị cấm.
- Block `tvkt:protected`, `tvkt:generated`, `tvkt:diagnostics`.
- JSON/YAML/shell block; log chẩn đoán.
- Số thập phân, version, viết tắt; câu Việt trộn thuật ngữ Anh.
- Cùng một câu ở dạng NFC và NFD.
- `xử lý` dùng theo nghĩa cụ thể (từ điển chỉ chặn cụm `thao tác xử lý`).

## Chưa phủ

- **MDX.** Linter chỉ hiểu Markdown. Tệp `.mdx` chưa được hỗ trợ và chưa có trong
  corpus; thêm parser MDX là việc riêng, không làm trong bước này.
- Kỳ vọng do người viết tay để đo precision thật.
- Văn bản người dùng thật ngoài corpus.

## Chạy

```bash
python3 tests/golden/generate.py --check    # so corpus với hành vi hiện tại
python3 tests/golden/generate.py --write    # ghi lại sau khi sửa CASES
```

`tests/golden/metrics.json` là baseline đã commit. `bench.py --compare` so metrics
hiện tại với baseline và báo hồi quy; cập nhật baseline phải kèm lý do trong
CHANGELOG.
