# Ma trận tương thích

Trạng thái: **ĐÃ TRIỂN KHAI** cho đúng cặp version dưới đây. Không version DSH nào
khác có bằng chứng chạy thật.

## Chiến lược support

Chiến lược hiện tại là **narrow support**: `engines.dsh` pin đúng một version đã
kiểm chứng, không khai dải. Lý do:

- Dải cũ `>=0.2.0-rc.1 <0.3.0-0` bao trùm 12 version đã publish
  (`0.2.0-rc.1` … `0.2.2-rc.3`). CI chưa từng chạy trên bất kỳ version nào trong
  số đó, nên lời khai đó là chưa xác minh.
- Các seam API mà plugin dùng (`skills.registerProvider`, `systemPrompt.section`,
  định dạng bundle patch) là nội bộ và đã đổi giữa các release.
- Chính upstream công bố trạng thái chưa ổn định. README của
  `deepseek-ai/deepseek-harness` đọc ngày 2026-11-16 ghi: *"DeepSeek Harness is in
  developer preview and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING
  CHANGES.**"* Lưu ý phạm vi: đó là README ở HEAD của upstream, **không** phải tài
  liệu của `0.2.2-rc.2`, nên nó không dùng làm contract cho target. Nó chỉ củng cố
  chiến lược pin hẹp.

Muốn mở rộng: thêm version vào ma trận bên dưới **kèm** một lần chạy
compatibility thật, rồi mới nới `engines.dsh`.

## Ma trận

| Plugin | DSH (version/tag) | Node | Trạng thái | Ngày kiểm chứng |
|---|---|---|---|---|
| `dsh-tvkt-vi` 0.5.1 | `0.2.2-rc.2` | `>=24.9.0`, đo trên `v24.22.3` | Verified: unit + tích hợp registry + drift + docs-verify + runtime smoke `scripts/compat-smoke.mjs` | 2026-11-16T09:20+07:00 |

Cột trạng thái chỉ mang nghĩa: các lệnh ở mục *Bằng chứng* đã chạy và thoát 0
trên đúng cặp version ghi trong bảng. Nó không có nghĩa "chạy đúng mọi cấu hình".

## Nền tảng và Python

Plugin gọi Python qua tiến trình con cho linter. Tên trình thông dịch lấy từ biến
`TVKT_PYTHON`, mặc định `python3`. Đây là toàn bộ phạm vi nền tảng đã kiểm:

| Nền tảng | Trạng thái | Bằng chứng |
|---|---|---|
| Ubuntu (`ubuntu-latest` của GitHub Actions) | **ĐÃ TRIỂN KHAI** | job `verify` và `compat-smoke` trong `.github/workflows/ci.yml` |
| Linux khác | CHƯA XÁC NHẬN | không có runner |
| macOS | CHƯA XÁC NHẬN | không có runner |
| Windows | **KHÔNG hỗ trợ** trong 0.5.x | xem lý do bên dưới |

Lý do chưa hỗ trợ Windows, nêu cụ thể để lần sau không phải đoán lại:

1. Trên Windows tên trình thông dịch thường là `python` hoặc `py`, không phải
   `python3`. Mặc định hiện tại sẽ không khởi động được.
2. Chưa có runner Windows trong CI, nên mọi lời khai sẽ là chưa xác minh.
3. Đường dẫn trong script và trong `package.json` dùng `/`, chỉ đúng trên
   Linux/macOS.

Muốn nhận Windows thì tiêu chí nghiệm thu là: có job Windows trong CI, có bước
dò trình thông dịch (`py -3`, `python`, `python3`) không dùng shell, giữ argv
dạng mảng, và test lại đường `path`/`symlink`/`timeout`/`abort` trên runner đó.

| Python | Trạng thái | Bằng chứng |
|---|---|---|
| 3.12.3 | **ĐÃ TRIỂN KHAI** | `tests/golden/generate.py --check`, `tests/bench/bench.py --compare`, `node --test` |
| 3.11.15 | **ĐÃ TRIỂN KHAI** | cùng bộ lệnh, kết quả golden và bench trùng khớp |
| < 3.11 | CHƯA XÁC NHẬN | không có trình thông dịch để chạy |

## Bằng chứng

### Upstream target

| Hạng mục | Giá trị |
|---|---|
| Gói | `@deepseek-ai/dsh@0.2.2-rc.2` |
| Preset nguồn | `@deepseek-ai/dsh-web-app@0.2.2-rc.2` |
| `docs/evidence/standard.patch.yml` | sha256 `e40bb192ed3b835312c2acd2ccd64d3bc4b85f80a7bc95b132cb18fbee190b5d` |
| `docs/evidence/ptc.patch.yml` | sha256 `838665e063dc8bcab4caf24e41ec848373c434df4262feb981306944e1cec7fd` |
| Nguồn tệp | `npm pack @deepseek-ai/dsh-web-app@0.2.2-rc.2`, thư mục `package/presets/` |
| `engines.node` của DSH | `>=24.9.0` |

### API seam đã đối chiếu

Đối chiếu trên chính bản cài `0.2.2-rc.2` trong `node_modules` của gói `dsh`, không
dựa vào tài liệu hay trí nhớ. Mọi mục dưới đây đọc trực tiếp từ tệp khai báo kiểu
hoặc mã nguồn đi kèm gói.

| API | Tệp trong target | Chữ ký đã đọc | Plugin gọi ở đâu |
|---|---|---|---|
| `skills.registerProvider` | `@deepseek-ai/dsh-skill/src/index.ts:390` | `registerProvider(create: (control: SkillProviderControl) => SkillProvider): () => void` | `lib/index.js` |
| `SkillProviderControl` | `dsh-skill/lib/types/index.d.ts:188` | `{ signal: AbortSignal, invalidate: () => void }` | `lib/skill.js` |
| `SkillProvider.list` | `dsh-skill/lib/types/index.d.ts:178` | `Promise<readonly SkillCandidate[] \| SkillProviderObservation>` | `lib/skill.js` |
| `SkillProviderObservation` | `dsh-skill/lib/types/index.d.ts:159` | `{ candidates, complete }` | `lib/skill.js` |
| `SystemPrompt.section` | `dsh-system-prompt/src/index.ts:485` | `section(section: PromptSection): () => void` | `lib/index.js` |
| `SystemPrompt.getSectionOrder` | `dsh-system-prompt/src/index.ts:501` | `getSectionOrder(name: PromptSectionOrderName): number` | `test/section-order.test.js` |
| `PromptSection` | `dsh-system-prompt/lib/types/index.d.ts:47` | `{ name, order, text, interpolate?, complete? }` | `lib/contract.js` |
| `ToolsService.register` | `dsh-tools/src/index.ts:128` | `register(definition: ToolDefinition, options?): () => void` | `lib/tool-register.js` |
| `defineTool` | `dsh-tools/src/schema.ts:555` | `defineTool<S, O>(options: DefineToolOptions<S, O>): ToolDefinition` | `lib/tool-register.js` |
| `ToolRunContext` | `dsh-tools/src/contracts.ts:245` | `ToolExecution` cộng `deferContext()`, `concludeTurn()`; có `agent` và `signal` | `lib/tool-register.js` |
| `workingDirectory.ensure` | `dsh-working-directory/lib/types/index.d.ts:90` | `ensure(agent: Agent, signal?: AbortSignal): Promise<string>` | `lib/tool-register.js` |
| `cordis.Context.plugin` | `@deepseek-ai/cordis` | nhận module có `apply` | `scripts/compat-smoke.mjs` |

### Thứ tự section trong prompt

`SECTION_ORDER = 10150` trong `lib/contract.js` vẫn hợp lệ với `0.2.2-rc.2`. Bảng
phân bổ của target (`dsh-system-prompt/src/index.ts:136`) có `WEB_SURFACE: 10100`
và `DEPLOYMENT_PERSONA_SUFFIX: 10200`, không có mục nào bằng `10150`. Nhờ vậy hợp
đồng nằm sau phần web surface và trước suffix của persona.

**Nợ nâng cấp đã biết:** target chỉ cấp vị trí theo bảng tên cố định; không có
API cấp phát vị trí cho plugin bên ngoài. Vì vậy `10150` là số tự chọn trong một
khoảng trống, không phải suất được cấp. Khi nâng target, phải chạy
`node --test test/section-order.test.js`; test đó đối chiếu số này với bảng phân
bổ thật của bản cài và fail nếu có va chạm hoặc nếu thứ tự đảo. Chỉ đổi sang
allocator khi target có API đó **và** có bằng chứng chạy thật.

### Runtime smoke

`scripts/compat-smoke.mjs` boot service thật của target trong một cây cài tạm,
mount package, rồi kiểm từng điểm:

| Kiểm | Kỳ vọng |
|---|---|
| `target-version` | bản cài trùng `package.json.dshTarget` |
| `bundle-row-resolution` | mọi row `name` trong `cordis.patch.yml` phân giải được trong bản cài |
| `prompt-section-once` | section `tvkt-vi:language-contract` xuất hiện đúng một lần |
| `prompt-section-order` | section nằm giữa persona-prefix và persona-suffix |
| `skill-provider-once` | catalog có đúng một entry `tvkt-vi` |
| `skill-loads` | `skills.get()` trả thân skill |
| `tool-registered-once` | registry có đúng một tool `tvkt_lint` |
| `lint-reports-finding` | câu `Hệ thống tiến hành kiểm tra.` cho `L001` mức WARNING |
| `lint-passes-clean-text` | câu sạch cho `PASS`, 0 ERROR, 0 WARNING |
| `dispose-removes-registrations` | sau `dispose` không còn section, tool hay skill |

Bản ghi lần chạy đầu, kèm phần chưa quan sát được, nằm ở
`docs/evidence/smoke/`. Từ 0.5.0 hậu kiểm, smoke chạy lại được ở mọi máy có bản
cài đúng target qua `npm run compat:smoke`.

Phạm vi của smoke, nói rõ để không hiểu quá: nó boot service thật và mount module
plugin, **không** chạy model, **không** gọi mạng, và **không** kiểm profile đầu
cuối qua `dsh web`.

## Giới hạn đã biết

1. **Preset mang thay đổi ngữ nghĩa PTC.** Preset `tvkt-vi` lấy base `standard`
   và thêm row `tool-executor-ptc` từ preset `ptc`. Đây là thay đổi ngữ nghĩa có
   chủ ý: model gọi nhiều tool trong một lượt. Các khác biệt còn lại của `ptc`
   **không** được chép.
2. **Bản cài DSH cục bộ có thể đã bị vá.** Máy phát triển này có công cụ
   `dsh-purge` vá `persona.prefix` và section `plan-mode` ngay trong gói cài.
   Vì vậy drift checker mặc định so với bản sao vendor từ npm.
3. **`engines.dsh` là một giá trị chính xác.** Semver coi `0.2.2-rc.2` là một
   version cụ thể; nó không khớp `0.2.2-rc.3`. Nâng DSH cần kiểm chứng lại.
4. **Model chưa được quan sát là gọi `tvkt_lint` trong session sống.** Runtime
   smoke chứng minh tool có trong registry và chạy đúng khi được gọi, nhưng
   không chứng minh model tự chọn nó.
5. **Node floor lấy từ host.** `lib/*.js` chạy được trên Node cũ hơn, nhưng
   plugin chỉ có nghĩa khi host DSH chạy được, và host khai `>=24.9.0`.
6. **Release tarball đi sau npm.** Release GitHub mới nhất là `v0.4.0` trong khi
   npm có `0.5.0`.
7. **Index Discover chưa có entry này.** Kiểm ngày 2026-11-16: tải `index.json`
   (5.643 entry) và tìm `dsh-tvkt-vi` được 0 lần khớp, dù PR danh mục đã merge.

## Bằng chứng phát hành

| Hạng mục | Giá trị |
|---|---|
| npm | `dsh-tvkt-vi@0.5.0`, dist-tag `latest`, publish lúc 2026-11-16T01:50:12Z |
| Repo GitHub | public |
| Entry danh mục | PR #15602 `MERGED` lúc 2026-11-15T17:30:30Z |
| CI run | `ci` #43788353640, commit `6bdcb6c`, kết luận `success` (trước thay đổi của 0.5.0 hậu kiểm này) |
| Cài lại từ registry | `npm install dsh-tvkt-vi@0.5.0` trong thư mục sạch, `import()` chạy được, `readSkillBody()` trả 5911 ký tự |

## Cách kiểm chứng lại

```bash
npm ci --include=dev
node scripts/check-engine.mjs
npm test                  # unit + tích hợp registry + canonical fact + bench invariant
npm run lint:skill
npm run check-drift
npm run check:terms
npm run docs:verify
python3 tests/golden/generate.py --check
python3 tests/bench/bench.py --compare
node scripts/check-package.mjs
npm pack --dry-run

# cần bản cài DSH đúng target
DSH_INSTALL_MODULES="$(npm root -g)/@deepseek-ai/dsh/node_modules" npm run compat:smoke
```
