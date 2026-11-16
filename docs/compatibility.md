# Ma trận tương thích

Trạng thái: **ĐÃ TRIỂN KHAI** cho version dưới đây. Không version nào khác có
evidence chạy thật.

## Chiến lược support

Chiến lược hiện tại là **narrow support**: `engines.dsh` pin đúng một version đã
kiểm chứng, không khai dải. Lý do:

- Dải cũ `>=0.2.0-rc.1 <0.3.0-0` bao trùm 12 version đã publish
  (`0.2.0-rc.1` … `0.2.2-rc.3`). CI chưa từng chạy trên bất kỳ version nào
  trong số đó, nên lời khai đó là chưa xác minh.
- Các seam API mà plugin dùng (`skills.registerProvider`, `systemPrompt.section`,
  bundle patch format) là nội bộ và đã đổi giữa các release. Khai rộng dải mà
  không test là hứa điều chưa biết.

Muốn mở rộng: thêm version vào ma trận bên dưới **kèm** một lần chạy
compatibility thật, rồi mới nới `engines.dsh`.

## Ma trận

| Plugin | DSH (version/tag) | Node | Trạng thái | Ngày kiểm chứng |
|---|---|---|---|---|
| `dsh-tvkt-vi` 0.5.0 | `0.2.2-rc.2` | `>=24.9.0`, đo trên `v24.22.3` | Verified: unit + integration + drift + **CI xanh trên Ubuntu** + **runtime smoke** trên profile `dsh` riêng + cài từ npm registry | 2026-11-16T08:52+07:00 |

Cột "Verified" chỉ mang nghĩa: các lệnh ở mục *Bằng chứng* đã chạy và thoát 0
trên đúng cặp version ghi trong bảng. Nó không có nghĩa "chạy đúng mọi cấu hình".

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

| API | Tệp trong target | Chữ ký / hình dạng |
|---|---|---|
| `skills.registerProvider` | `@deepseek-ai/dsh-skill/src/index.ts:390` | `registerProvider(create: (control: SkillProviderControl) => SkillProvider): () => void` |
| `SkillProviderControl` | `@deepseek-ai/dsh-skill/lib/types/index.d.ts` | `{ signal: AbortSignal, invalidate: () => void }` |
| `SkillProviderObservation` | cùng tệp | `{ candidates: readonly SkillCandidate[], complete: boolean }` |
| `systemPrompt.section` | `@deepseek-ai/dsh-system-prompt/src/index.ts:485` | `section(section: PromptSection): () => void` |
| `PromptSection` | cùng gói, `lib/types/index.d.ts:47` | `{ name, order, text: string \| ((ctx) => string), interpolate?, complete? }` |
| Thẻ `!!js` trong patch | `@deepseek-ai/cordis-plugin-include/src/index.ts:16` | scalar → `{ __jsExpr: <chuỗi biểu thức> }` |
| Hạng skill | `@deepseek-ai/dsh-skill/src/index.ts` | `RUNTIME_RANK = 250`, `BUNDLED_SKILL_RANK = 600`, hạng thấp thắng trong **cùng một layer** |

## Giới hạn đã biết

1. **Preset mang thay đổi ngữ nghĩa PTC.** Preset `tvkt-vi` lấy base `standard`
   và thêm row `tool-executor-ptc` từ preset `ptc`. Đây là thay đổi ngữ nghĩa có
   chủ ý: model gọi nhiều tool trong một lượt. Các khác biệt còn lại của `ptc`
   (`tool-plugin-manager.disabled`, `workflow-ptc.disabled`,
   `tool-workflow.disabled`) **không** được chép.
2. **Bản cài DSH cục bộ có thể đã bị vá.** Máy phát triển này có công cụ
   `dsh-purge` vá `persona.prefix` và `plan-mode` section ngay trong gói cài.
   Vì vậy drift checker mặc định so với bản sao vendor từ npm
   (`docs/evidence/`), không so với bản cài. Đọc bản cài sẽ thấy text khác
   upstream nguyên gốc.
3. **`engines.dsh` là một giá trị chính xác.** Semver coi `0.2.2-rc.2` là một
   version cụ thể; nó không khớp `0.2.2-rc.3`. Nâng DSH là thay đổi cần kiểm
   chứng lại, không phải tự động được phép.
4. **Runtime smoke đã có, nhưng chưa phủ tool `tvkt_lint` từ model.** Một lần
   chạy thật trên `DSH_HOME` riêng đã xác nhận: bundle được nhận, preset compose
   đủ nested config, session mang `agentPreset: "tvkt-vi"`, `skills/list` trả
   `tvkt-vi` từ đúng thư mục gói, model trích nguyên hợp đồng ngôn ngữ, và
   `run_code` gọi được `tools.skill`. Chi tiết ở `docs/evidence/smoke/`.
   **Chưa** quan sát: model gọi `tvkt_lint` trong session sống (không có RPC
   liệt kê tool), và profile `headless` trong home sạch (lỗi `permission-presets`
   của profile template, không phải plugin).
5. **Node floor lấy từ host, không từ code plugin.** Bản thân `lib/*.js` chạy
   được trên Node cũ hơn, nhưng plugin chỉ có nghĩa khi host DSH chạy được, và
   host khai `>=24.9.0`.

## API bổ sung từ 0.5.0

| API | Tệp trong target | Chữ ký |
|---|---|---|
| `ctx.tools.register` | `@deepseek-ai/dsh-tools/src/index.ts:128` | `register(definition: ToolDefinition, options?): () => void` |
| `defineTool` | `@deepseek-ai/dsh-tools/src/schema.ts:555` | `defineTool<S, O>(options: DefineToolOptions<S, O>): ToolDefinition` |
| `ToolRunContext` | `@deepseek-ai/dsh-tools/src/contracts.ts:245` | `{ ...ToolExecution, deferContext(), concludeTurn() }`, có `agent` và `signal` |
| `workingDirectory.ensure` | `@deepseek-ai/dsh-working-directory/lib/types/index.d.ts:90` | `ensure(agent: Agent, signal?: AbortSignal): Promise<string>` |

## Bằng chứng phát hành

| Hạng mục | Giá trị |
|---|---|
| npm | `dsh-tvkt-vi@0.5.0`, dist-tag `latest` |
| Tarball shasum | `dfad9d34c65c4f6a183c4ebb09eb725cba8984d4` (khớp bản build local) |
| CI run | `ci` #43788353640, commit `6bdcb6c`, kết luận `success` (verify 18 s, security scan 5 s) |
| Cài lại từ registry | `npm install dsh-tvkt-vi@0.5.0` trong thư mục sạch, `import()` chạy được, `readSkillBody()` trả 5911 ký tự |
| Commit | `d98643d` P1 provider · `c715b06` preset · `78c062a` linter + từ điển · `8e8eafa` tool · `6bdcb6c` CI + docs |

## Cách kiểm chứng lại

```bash
npm ci --include=dev
npm test                 # unit + integration registry + drift
npm run lint:skill
npm run check-drift
npm pack --dry-run
```
