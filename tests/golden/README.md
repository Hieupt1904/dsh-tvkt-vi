# Golden corpus cho linter TVKT

Mỗi thư mục con là một ca kiểm thử. Quy ước:

- `*.md` — văn bản đầu vào.
- `*.expected.json` — kết quả mong đợi từ `lint_text`.

`expected.json` ghi đúng những gì corpus khẳng định:

```json
{
  "description": "vì sao ca này tồn tại",
  "labels": ["TP" | "FP-guard" | "FN-guard" | "protected" | "terminology"],
  "expect_rules": [{"rule_id": "L003", "line": 5, "count": 1}],
  "expect_absent_rules": ["L001"],
  "expect_protected_lines": [3, 4],
  "expect_unique": ["L004:12"]
}
```

Chỉ `expect_rules` / `expect_absent_rules` / `expect_protected_lines` /
`expect_unique` là bắt buộc kiểm. Không dùng "toàn bộ findings phải bằng X" cho
mọi ca, vì một thay đổi nhỏ ở tách câu sẽ làm cả corpus đỏ mà không phải lỗi.

`tests/golden/metrics.json` là baseline đã commit. Test so metrics hiện tại với
baseline và báo hồi quy; cập nhật baseline phải kèm lý do trong CHANGELOG.
