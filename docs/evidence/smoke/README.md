# Bằng chứng runtime smoke (2026-11-15)

Đây là **bản ghi một lần chạy thật** của `dsh 0.2.2-rc.2`, không phải mô tả.

Ghi chú 0.5.2: bản ghi dưới đây đo trên pin `0.2.2-rc.2`. Từ 0.5.2, `engines.dsh`
khai thêm pin `0.2.2-rc.5`; smoke chạy lại được trên pin đó bằng
`DSH_INSTALL_MODULES` trỏ prefix tạm, và CI chạy matrix qua cả hai pin. Phần
profile end-to-end trong tài liệu này **chưa** đo lại trên `0.2.2-rc.5`.
Mục đích: biến "chưa có runtime smoke" thành một mốc có thể kiểm lại.

## Cách chạy

```bash
export DSH_HOME=/tmp/dsh-smoke          # home riêng, KHÔNG đụng profile đang dùng
dsh --profile tvktsmoke --from-default-profile web --dump-config
dsh plugin --profile tvktsmoke add ./dsh-tvkt-vi-0.5.0.tgz
dsh --profile tvktsmoke --no-open --port 0      # in ra URL kèm token
```

Sau đó mở URL trong browser để nhận cookie `dsh-auth-…` (httpOnly, HttpOnly +
SameSite=Strict, không có trong `document.cookie`), rồi gọi RPC qua `/api`.

## Kết quả đã quan sát

| Hạng mục | Kết quả |
|---|---|
| Bundle được DSH tự nhận | `package.json` của profile có `dsh.profile.bundles` chứa `dsh-tvkt-vi` |
| Composition | `dsh --dump-config` in ra `# == dsh-tvkt-vi` với hai entry `dsh-tvkt-vi` và `preset-tvkt-vi` |
| Nested config của preset | `applyPatch: false`, `customSkillDirs`, `interrupt: false`, row `tool-tvkt` đều có mặt |
| Tạo session với preset | `session/create` trả `agentPreset: "tvkt-vi"` |
| Skill discovery | `skills/list` trả **58 skill**, có `tvkt-vi` với `path` trỏ vào `node_modules/dsh-tvkt-vi/skills/tvkt-vi/SKILL.md` |
| Model chạy thật | 1 turn, 3 step, `uncachedInputTokens: 23322` |
| Prompt contract có hiệu lực | Model trích nguyên quy tắc "giữ nguyên định danh kỹ thuật … bọc trong `backticks`" — câu này chỉ có trong `CONTRACT_TEXT` và skill |
| Skill load qua tool | Model gọi `run_code` → `tools.skill({ name: "tvkt-vi" })`, kết quả trả về dòng 19/33/84 của SKILL.md |
| PTC executor hoạt động | Chính lệnh trên là `run_code`, tức row `tool-executor-ptc` đang có hiệu lực |

## Chưa quan sát được

- **Tool `tvkt_lint` qua RPC**: không có endpoint RPC nào liệt kê tool của session.
  `defineTool` đã chạy thật ở `test/tool.test.js` (test tích hợp `DSH_INSTALL_MODULES`),
  nhưng chưa có một lần gọi `tvkt_lint` từ model trong session sống.
- **Profile `headless` trong home sạch**: `@deepseek-ai/dsh-permission-presets` báo
  "composed sandbox and approval defaults match no preset", chỉ ra thiếu
  `defaultPreset` trong profile tối giản — lỗi của profile template, không phải plugin.

## Ghi chú về phương thức RPC

Endpoint `/api` chỉ POST. Envelope:

```json
{"type":"client-request","rpcId":"1","method":"<endpoint>","payload":{"args":{"request":{...}}}}
```

`method` phải **trùng** path endpoint (`skills/list`). Thiếu `args` hoặc sai tên
trường thì gateway trả `gateway/bad-request` kèm danh sách trường thiếu.
