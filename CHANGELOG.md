# Changelog

Theo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), phiên bản theo [SemVer](https://semver.org/lang/vi/).

## [0.5.0] — 2026-11-15

Bản này sửa ba lỗi mà 0.4.0 không phát hiện được vì test và checker đều quá yếu,
rồi dựng lại phần kiểm chứng để lỗi cùng loại không quay lại.

### Sửa

- **P1 — provider skill nhận `control` của registry.** `lib/index.js` gọi
  `registerProvider(() => createSkillProvider({ logger }))`, bỏ mất tham số
  `control` mà `SkillRegistry.registerProvider` luôn truyền
  (`create: (control: SkillProviderControl) => SkillProvider`). Hệ quả:
  `control.invalidate()` ném `TypeError`, che mất lỗi gốc khi skill hỏng
  frontmatter hoặc không đọc được. Nay factory nhận `control`; `invalidate()`
  chỉ gọi khi registration còn sống, và lỗi đọc mang `cause` gốc.
- **P1 — preset thiếu nested config so với `standard`.** Checker cũ chỉ so
  id/module nên bỏ qua bốn chỗ lệch thật: `tool-fs.config.applyPatch`,
  `skill-filesystem.config.customSkillDirs`,
  `tool-subagent-control.config.interrupt`, và văn bản `plan-mode.section`.
  Nay `cordis.patch.yml` chép nguyên văn base `standard` từ
  `@deepseek-ai/dsh-web-app@0.2.2-rc.2`, chỉ giữ override có chủ ý.
- **P2 — `engines` tuyên bố rộng hơn thực tế.** `engines.dsh` từng là
  `>=0.2.0-rc.1 <0.3.0-0` (12 version chưa từng chạy); `engines.node` là `>=18`
  trong khi host DSH khai `>=24.9.0`. Nay pin đúng `0.2.2-rc.2` và `>=24.9.0`.
- **P2 — `terms-quick.md` gộp thuật ngữ `proposed` vào nhóm chuẩn** và chứa
  đường dẫn tuyệt đối của máy phát triển. Nay tệp được sinh từ `terms.json`,
  tách rõ `approved` / `proposed`, và test chặn đường dẫn tuyệt đối.
- **P2 — linter đóng fence sai.** Bản cũ đảo trạng thái ở mọi dòng bắt đầu bằng
  ` ``` `, nên fence bốn dấu chứa fence ba dấu bị đóng sớm và nội dung sau đó bị
  kiểm như văn xuôi. Nay fence đóng phải cùng loại và đủ dài; fence chưa đóng
  kéo tới hết tệp.
- **P2 — tách câu cắt sai ở số thập phân và viết tắt.** `1.5 giây`, `TP.HCM`,
  `e.g.` từng kết thúc câu, làm số tiếng sai.

### Thêm

- **Tool model-facing `tvkt_lint`** chạy linter trong workspace. Từ chối đường
  dẫn tuyệt đối và `..`, kiểm realpath sau symlink, trần kích thước, timeout
  `15 s` gửi SIGTERM rồi SIGKILL, huỷ theo `exec.signal`, argv mảng, xoá
  `TVKT_HOME` khỏi môi trường con. "Có finding" là kết quả, không phải lỗi tool.
- **`scripts/check-drift.mjs` so cấu trúc**: parse YAML bằng `js-yaml` với thẻ
  `!!js` đúng ngữ nghĩa `cordis-plugin-include`, deep compare, allowlist hẹp
  `INTENTIONAL_DIFFS`, in đường dẫn dạng `rows.tool-fs.config.applyPatch`.
- **Baseline upstream đã vendor** tại `docs/evidence/` (sha256 ghi trong
  `docs/compatibility.md`) để drift test không phụ thuộc bản cài có thể bị vá.
- **Golden corpus 26 ca** (`tests/golden/`) với expected JSON và baseline
  TP/FP/FN; **bench** (`tests/bench/`) đo latency percentile có ngưỡng hồi quy.
- **`docs-impact`** (chỉ đọc, nêu ứng viên tài liệu kèm bằng chứng) và
  **`docs-verify`** (phân loại `VERIFIED` / `DOC_DRIFT` / `SPEC_CONFLICT` /
  `NEEDS_HUMAN_REVIEW`, không ghi tệp). **`docs-sync`** chỉ tạo đề xuất patch
  trong `.tvkt/proposals/`, không áp dụng.
- **`.tvkt/config.json`** với `schemaVersion` và tài liệu từng trường.
- **CI** (`.github/workflows/ci.yml`) chạy toàn bộ gate, không publish.
- **`docs/kaizen.md`** ghi KPI, baseline và ngưỡng hồi quy cố định.

### Ngữ nghĩa

- Preset `tvkt-vi` vẫn là base `standard` **cộng** row `tool-executor-ptc`
  (từ preset `ptc`) **cộng** row `tool-tvkt`. PTC là thay đổi ngữ nghĩa:
  model gọi nhiều tool trong một lượt. Các khác biệt khác của `ptc`
  (`tool-plugin-manager.disabled`, `workflow-ptc.disabled`, `tool-workflow.disabled`)
  **không** được chép.
- `L006` và `L007` vẫn ở mức `INFO`, không blocking. Precision 100% trong golden
  corpus không phải precision thực địa.

### Kiểm chứng runtime

Một lần chạy thật trên `dsh 0.2.2-rc.2` với `DSH_HOME` riêng đã xác nhận:
bundle được nhận, preset compose đủ nested config (`applyPatch`,
`customSkillDirs`, `interrupt`, row `tool-tvkt`), session mang
`agentPreset: "tvkt-vi"`, `skills/list` trả `tvkt-vi` từ đúng thư mục gói,
model trích nguyên hợp đồng ngôn ngữ, và `run_code` gọi được `tools.skill`.
Bản ghi ở `docs/evidence/smoke/`.

### Chưa làm

- Model gọi `tvkt_lint` trong session sống. Không có RPC liệt kê tool của
  session nên chưa kiểm được đường này; `defineTool` đã chạy thật ở test tích hợp.
- Profile `headless` trong home sạch: `permission-presets` báo thiếu
  `defaultPreset` — lỗi của profile template, không phải plugin.

## [0.4.0] — 2026-11-15

Đợt này đối chiếu provider với `@deepseek-ai/dsh-skill-office` — provider skill đóng gói chính thức của DSH — và sửa những chỗ lệch.

### Sửa

- **Đọc tệp bất đồng bộ có `signal`.** Trước đây `get()` đọc đồng bộ, không huỷ được khi consumer abort. Nay dùng `readFile` với `options.signal`, đúng hợp đồng "implementations should settle promptly when `options.signal` aborts".
- **Lỗi đọc không còn giả vờ thành công.** `list()` trả `{ candidates, complete }`: lỗi tạm thời (ENOENT, tệp đang ghi) cho `complete: false` để registry tự thử lại thay vì ghim catalog rỗng; lỗi tồn tại (EACCES, frontmatter hỏng) bỏ entry khỏi catalog.
- **`get()` ném lỗi thay vì trả `undefined`** khi tệp có mà hỏng, và gọi `control.invalidate()` với lỗi tồn tại.
- **Cắt frontmatter YAML** khỏi thân skill: trước đây agent đọc cả khối YAML như nội dung.
- **`resourceBase` dùng dấu `/`** thay vì `path.sep`, để consumer ghép liên kết tương đối trên Windows.
- **Chẩn đoán bằng tiếng Anh** và ghi qua `ctx.logger`, nơi người vận hành tìm; cảnh báo lặp lại được khử trùng.

### Thêm

- `parseSkill()` xuất khẩu công khai, từ chối frontmatter không đóng.
- 5 test mới cho các ngữ nghĩa trên (tổng 21).

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
