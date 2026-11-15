# Changelog

Theo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), phiên bản theo [SemVer](https://semver.org/lang/vi/).

## [0.3.0] — 2026-11-15

### Thêm

- Metadata hiển thị theo spec của DSH: `locale/en.json` + `locale/zh.json` với `meta.title`, `meta.description`, `meta.detail`; tài liệu chi tiết ở `docs/DETAIL.md` và `docs/DETAIL.zh.md`; icon SVG tự chứa ở `icon.svg` (280 byte, dưới hạn 256 KiB).
- `exports` cho `./locale/*.json` và `./icon`; `files` xuất bản `locale`, `docs`, `icon.svg`.
- `engines.dsh: ">=0.2.0-rc.1 <0.3.0-0"`: DSH từ chối cài bundle có dải không khớp bản đang chạy, thay vì lỗi khó hiểu lúc mount.
- Test cho hợp đồng manifest và metadata hiển thị (tổng 16).

### Sửa

- `peerDependencies` của `@deepseek-ai/cordis` dùng dải có nhánh prerelease tường minh. Dải không có `-0` loại bỏ im lặng mọi bản pre-release của harness, đúng lỗi mà hướng dẫn đóng gói của DSH cảnh báo.
- Không đóng gói `vendor/tvkt/tools/__pycache__` nữa: thêm `vendor/.npmignore` để đường dẫn tương đối của linter vẫn giữ nguyên.

## [0.2.1] — 2026-11-15

### Sửa

- Thân skill không còn vi phạm linter của chính nó: dòng tóm tắt quy tắc 002 và 003 trích nguyên cụm bị cấm nên bị L001/L002 bắt, và hai đoạn của phần 30 quy tắc vượt 5 câu (L005). Viết lại thành mô tả kiểu lỗi thay vì liệt kê cụm từ.
- Chạy `python3 skills/tvkt-vi/scripts/lint-text.py skills/tvkt-vi/SKILL.md` giờ trả 0 WARNING.

## [0.2.0] — 2026-11-15

### Thêm

- Preset `tvkt-vi` mang thêm `tool-executor-ptc` (lấy từ preset `ptc`): 24 row, trong đó 23 row khớp `standard`. Hệ quả: `run_code` thành công cụ gọi trực tiếp duy nhất — xem mục "Phạm vi tool" trong README để bỏ lại.
- `scripts/check-drift.mjs` so cả **id lẫn tên module** với `standard` và `ptc`, có allowlist `INTENTIONAL_EXTRAS`, cảnh báo khi row rời khỏi `ptc`.
- Test khẳng định preset **không** khai lại plugin ở bundle root (`ego-browser`, `dsh-service`, `tool-agent-team`, `dsh-mattpocock-skills-deck`).
- Mục "Phạm vi tool của mode" và "Độ trễ của từng loại thay đổi" trong README.

### Sửa

- Skill đăng ký qua `ctx.skills.registerProvider()` thay cho `ctx.skills.register()`: `get()` đọc `SKILL.md` mỗi lần nạp, nên sửa tài liệu không cần restart. Bản cũ giữ thân skill trong bộ nhớ từ lúc mount.
- Thêm `source: 'bundled'`, `path`, `resourceBase` vào candidate — thiếu `source` thì `register()` nhận nhưng `skills.get()` từ chối với lỗi `loaded skill … source must be a string`.
- Sửa chú thích thứ tự hạng trong `lib/skill.js`: hạng thấp thắng, nên thứ tự tăng dần là project 100/200 → runtime 250 → provider 300 → user 400 → bundled 600.

## [0.1.0] — 2026-11-13

### Thêm

- Hợp đồng ngôn ngữ TVKT-100 chèn vào system prompt ở order `10150` — sau hướng dẫn công cụ, trước persona suffix.
- Skill `tvkt-vi`: 30 quy tắc rút gọn, 70 thuật ngữ, ba chế độ DRAFT/REVIEW/REWRITE.
- Agent preset `tvkt-vi` (mode "Tiếng Việt chuẩn (TVKT-100)") với persona và bộ tool của `standard`.
- Linter L001–L007 đóng gói trong `vendor/tvkt/`, kèm `scripts/lint-text.py` rà stdin.
- 9 test, gồm test tích hợp với registry skill thật của DSH.
