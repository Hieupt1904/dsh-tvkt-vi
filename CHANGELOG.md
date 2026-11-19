# Changelog

Theo [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), phiên bản theo [SemVer](https://semver.org/lang/vi/).

## [0.5.2] — 2026-11-19

Bản này chỉ sửa **khai báo tương thích**: không đổi ngữ nghĩa TVKT-100, không đổi
ngưỡng 30/40 tiếng, không sửa từ điển, không đổi hợp đồng prompt hay thân skill.

### Fixed

- **Pin đúng một version DSH làm bundle bị từ chối trên pin mới.** `engines.dsh`
  là `0.2.2-rc.2` nên trên DSH `0.2.2-rc.5` plugin manager báo
  `incompatible with DSH 0.2.2-rc.5 (requires 0.2.2-rc.2)` và đề nghị gỡ.

  Đo trên chính cặp đó: `presets/standard.patch.yml` và `presets/ptc.patch.yml`
  của `dsh-web-app@0.2.2-rc.2` và `@0.2.2-rc.5` **trùng byte**; chữ ký API plugin
  dùng trùng; `compat-smoke` đạt cả 11 kiểm trên rc.5. Cùng một mã, hai kết luận:
  lỗi nằm ở lời khai hẹp hơn bằng chứng, không nằm ở plugin.

### Changed

- **`engines.dsh` thành tập pin chính xác.** Nay là
  `"0.2.2-rc.2 || 0.2.2-rc.5"`.
- **Cổng vẫn hẹp đúng bằng bằng chứng.** Semver coi `||` là phép hợp của hai pin
  chính xác, nên `0.2.2-rc.3` và `0.2.2-rc.4` tiếp tục bị từ chối.
- **`dshTarget` trỏ `0.2.2-rc.5`.** Quy ước: danh sách xếp tăng dần, phần tử cuối
  là version mới nhất đã kiểm chứng và là target của mọi lần đo.
- **`scripts/dsh-pins.mjs` (mới)** — một nguồn duy nhất để tách, kiểm và so tập
  pin: từ chối toán tử dải mở, phần tử không phải version chính xác, phần tử lặp,
  danh sách lộn thứ tự, và `dshTarget` không phải phần tử cuối.
- **`check-engine`, `docs-verify`, `compat-smoke`, `test/*` dùng chung module đó.**
  Trước đây mỗi nơi tự so `engines.dsh === dshTarget`, nên đổi chính sách phải sửa
  bốn chỗ và rất dễ sót một chỗ.
- **`compat-smoke` tự dò ba bố cục cài đặt.** `resolveInstallModules` trước đây
  chỉ thử `<root>/@deepseek-ai/dsh/node_modules`, nên trên một bản cài hoisted
  (gói con nằm ngay dưới root) nó lặng lẽ rơi về bản cài khác và smoke đo sai
  runtime. Nay thử cả `<root>/@deepseek-ai/dsh/node_modules`, `<root>`, và
  `<root>/node_modules`, và chỉ nhận thư mục thật sự có cả `cordis` lẫn
  `dsh-tools`.
- **CI chạy matrix trên từng pin.** `matrix.dsh` phải bằng đúng `engines.dsh` theo
  cùng thứ tự; `test/ci.test.js` so cả hai chiều nên thêm pin mà quên CI (hoặc
  ngược lại) là fail. Bước chốt version đọc `engines.dsh` thay vì một biến env rời.
- **`docs/compatibility.md` viết lại phần chiến lược support**: nêu lý do không
  dùng dải mở (khớp cả rc.3/rc.4 chưa đo) và lý do không pin đơn (từ chối oan khi
  DSH lên rc), kèm ma trận hai dòng có mốc thời gian.
- **`docs-verify` neo canonical fact vào version của gói, không vào `latest` npm.**
  Giữa bump và publish hai giá trị đó khác nhau, buộc tài liệu phải nói sai một
  trong hai. Trạng thái registry ghi riêng ở bảng trạng thái chợ.

### Verified

- `compat-smoke` trên `0.2.2-rc.5`: 11/11 kiểm đạt, gồm `prompt-section-order`
  (section hợp đồng ở vị trí 2, giữa persona-prefix 1 và persona-suffix 3).
- `check-drift` với `--standard` trỏ preset của `dsh-web-app@0.2.2-rc.5`: 0 drift
  ngoài ba khác biệt có chủ ý đã khai.
- `compat-smoke` trên `0.2.2-rc.2` vẫn đạt 11/11: pin cũ không hồi quy.

## [0.5.1] — 2026-11-16

Đợt hậu kiểm sau 0.5.0. Không đổi ngữ nghĩa TVKT-100, không đổi ngưỡng 30/40 tiếng,
không sửa từ điển, không đổi `dshTarget`. Bản này sửa drift tài liệu, làm
`docs:verify` bắt được đúng loại drift đó, và thêm smoke chạy trên đúng DSH target.

### Fixed

- **README nêu canonical fact cũ.** Bản 0.5.0 vẫn ghi `0.4.0` trên registry,
  `Node ≥ 18`, và `engines.dsh: ">=0.2.0-rc.1 <0.3.0-0"` trong khi `package.json`
  đã là `0.5.0`, `>=24.9.0`, `0.2.2-rc.2`. Nay README khớp `package.json`.
- **`package-lock.json` lệch `package.json`.** Lock vẫn khai `version: 0.4.0`,
  `engines.dsh` dải cũ và `node >=18`. Nay cùng giá trị với `package.json`.
- **README tự mâu thuẫn về trạng thái repo.** Một mục nói repo đã public, một mục
  sau nói `Repro **private**`. Kiểm trực tiếp: repo public.
- **Mục H2 trùng trong README.** `Trạng thái trên chợ plugin` và `Cài sang máy
  khác` mỗi mục có hai bản, bản sau lặp và lệch. Nay mỗi mục một bản.
- **Trạng thái chợ và release sai.** Entry danh mục đã merge từ
  `2026-11-15T17:30:30Z` nhưng README còn ghi "đang chờ duyệt"; index công bố
  chưa có entry. Nay ghi đúng kèm bằng chứng và mốc kiểm.
- **`bench.py` lấy số ngữ nghĩa từ lần lặp cuối.** Số finding, protected span,
  per-rule và per-severity giờ lấy từ lần chạy đầu và được đối chiếu với mọi lần
  lặp; lệch nhau là hồi quy, không im lặng lấy kết quả cuối.
- **`docs/kaizen.md` nêu số test cũ và nói smoke không nằm trong CI.**

### Added

- **`scripts/compat-smoke.mjs`** — compatibility smoke chạy trên đúng
  `dshTarget`: dựng cây cài tạm, symlink các gói `@deepseek-ai/*` của bản cài,
  boot `SystemPrompt` + `SkillRegistry` + `ToolsService` + executor native thật,
  mount package, rồi kiểm section, skill, tool, kết quả lint và dọn đăng ký khi
  `dispose`. Không gọi model, không gọi mạng.
- **`test/section-order.test.js`** — khoá `SECTION_ORDER = 10150` với bảng phân bổ
  section của bản cài: hai mốc `WEB_SURFACE`/`DEPLOYMENT_PERSONA_SUFFIX` qua API
  công khai, và phát hiện va chạm với suất đã cấp.
- **`test/docs-canonical.test.js`** — 14 ca khoá canonical fact: version, sàn
  Node, dải DSH, mục H2 trùng, mâu thuẫn public/private, và chiều ngược là câu kể
  lịch sử không bị bắt oan.
- **`test/bench.test.js`** — số ngữ nghĩa không đổi khi `REPEATS` đi từ 5 sang 10.
- **`test/portability.test.js`** — quyết định nền tảng có test: `TVKT_PYTHON` được
  tôn trọng, `docs-verify` không báo VERIFIED khi Python lỗi, và tài liệu phải
  nêu rõ giới hạn nền tảng.
- **10 ca golden mới** (tổng 36): fence 5 backtick, fence chưa đóng, link có dấu
  ngoặc trong URL, thẻ HTML có thuộc tính chứa cụm cấm, block `protected` và
  `diagnostics`, từ mơ hồ trong mã nội tuyến, từ mơ hồ trong ngoặc kép, NFC/NFD,
  và `xử lý` theo nghĩa cụ thể.
- **Job `compat-smoke` trong CI** cài đúng `DSH_TARGET`, chốt `dsh --version`,
  chạy smoke và các test cần bản cài thật.
- **SBOM CycloneDX** ở release gate, và **`npm audit --audit-level=high`** ở job
  security.

### Changed

- **`docs:verify` bắt canonical-fact drift.** Thêm các bất biến: version registry,
  `engines.dsh`, dải version ghi vào profile, sàn Node không thấp hơn
  `package.json`, `engines.dsh` bằng `dshTarget`, không mâu thuẫn public/private,
  không trùng mục H2, và `compatibility.md` nêu đủ version cùng target. Phép kiểm
  chỉ đọc mẫu hẹp, nên câu kể lịch sử và câu điều kiện không bị bắt oan.
- **`docs/compatibility.md`** viết lại theo bằng chứng đọc trực tiếp từ bản cài
  `0.2.2-rc.2`, thêm ma trận nền tảng, ma trận Python, bảng seam API kèm vị trí
  tệp, và mục nợ nâng cấp của `SECTION_ORDER`.
- **`.tvkt/README.md`** nêu rõ tệp cấu hình này là repo-maintenance, không phải
  runtime, kèm bảng trường nào được ai đọc. `generatedPaths` và `rulesetVersion`
  được ghi đúng là chỉ đọc để báo cáo, không đổi hành vi.
- **`docs-verify` dùng `TVKT_PYTHON`** thay vì gọi cứng `python3`, cùng biến với
  tool runtime.
- **Action trong CI pin bằng commit SHA** thay vì tag trôi.
- **`baseline.json` của bench sinh lại** vì corpus tài liệu đã đổi (thêm tài liệu
  và sửa README). Số ngữ nghĩa mới: 10 tài liệu, 31 finding INFO, 0 WARNING.

### Security

- Giữ `permissions: contents: read` ở mọi job; không job nào cần quyền ghi.
- Pin `actions/checkout`, `actions/setup-node`, `actions/upload-artifact` bằng
  commit SHA, ghi kèm tên version trong comment.
- Ghi rõ bước quét bí mật hiện có là **kiểm mẫu chuỗi**, không phải secret
  scanner đầy đủ: không đọc lịch sử git, không kiểm entropy, không thay được việc
  quay vòng khóa khi khóa đã lộ.
- Thêm `npm audit --audit-level=high` cho toàn bộ cây dependency.

### Compatibility

- DSH target vẫn là `!!!0.2.2-rc.2`!!!, không đổi, vì chưa có bằng chứng chạy thật
  trên version khác.
- Node `>=24.9.0`; đo trên `v24.22.3`.
- Python: đo trên `3.12.3` và `3.11.15`, kết quả golden và bench trùng khớp.
- Nền tảng: Ubuntu trong CI. macOS và Linux khác **CHƯA XÁC NHẬN**. Windows
  **không** được nhận trong 0.5.x, kèm lý do và tiêu chí nghiệm thu.

### Known limitations

- Kỳ vọng của golden corpus sinh từ chính đầu ra linter, nên `FP = 0` nghĩa là
  corpus đồng ý với linter, không phải precision thực địa.
- Hai false positive đã biết: ngoặc kép và `{{…}}` không phải vùng bảo vệ.
- Model chưa được quan sát là tự gọi `tvkt_lint` trong session sống.
- Release GitHub mới nhất là `v0.4.0` trong khi npm có `0.5.0`; index Discover
  chưa có entry.
- Corpus chỉ hiểu Markdown; `.mdx` chưa hỗ trợ.
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
