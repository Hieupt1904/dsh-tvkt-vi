# Kaizen / PDCA cho dsh-tvkt-vi

Vòng cải tiến liên tục cho plugin TVKT. Mỗi mục dưới đây gắn với một lệnh chạy
được, không phải khẩu hiệu. Số liệu ghi ở đây là **số đã đo** trên
`2026-11-15T22:52+07:00`, Node `v24.22.3`, Python `3.12.3`, DSH `0.2.2-rc.2`.

## PLAN — KPI và mục tiêu

| KPI | Mục tiêu | Cách đo | Trạng thái hiện tại |
|---|---|---|---|
| Install/mount thành công trên support matrix | 100% | `npm run cli:engine` + runtime smoke | 1/1 cấu hình đã khai; runtime smoke chạy thật `2026-11-15T23:12+07:00` (`docs/evidence/smoke/`) |
| Regression P0/P1 về lifecycle | 0 | `test/provider-lifecycle.test.js` | 0 (10 test, trong đó 1 test fail khi tái hiện lỗi P1 cũ) |
| Vùng bảo vệ giữ nguyên byte | 100% | `test/linter.test.js`, `test/docs.test.js` | 100% (hash trước/sau) |
| Ghi trái phép vào đặc tả | 0 | `test/docs.test.js` ca spec-conflict | 0 |
| Precision của rule blocking | ≥ 95% | `tests/golden/metrics.json` | 100% trên corpus (153 TP, 0 FP) — **precision trong phạm vi corpus**, không phải precision thực địa |
| False positive của rule blocking | < 5% | như trên | 0% trên corpus |
| p95 latency của linter | đo trước, đặt mục tiêu sau | `python3 tests/bench/bench.py` | Xem `tests/bench/baseline.json` — số đo dao động giữa các lần chạy nên tài liệu này không chép số cứng; chạy lệnh để lấy giá trị hiện tại |
| Prompt token overhead | đo và baseline | `CONTRACT_TEXT.length` | 1776 ký tự ≈ 710 token (ước lượng thô, chia 2.5) — **CẦN XÁC NHẬN** bằng tokenizer thật |
| Lỗi provider/tool không bắt được | 0 trong test suite | `npm test` | 0 |

Ghi chú về con số precision: corpus golden do chính dự án viết, nên precision
100% chỉ nói "rule làm đúng điều corpus khẳng định". Nó không nói precision trên
văn bản thật của người dùng.

## DO — việc chạy trên mỗi PR

CI (`.github/workflows/ci.yml`) chạy tự động:

1. `npm run cli:engine` — engines khớp target đã pin.
2. `npm test` — 136 test: unit, integration registry thật, drift, golden, tool, docs, kaizen.
3. `npm run lint:skill`.
4. `npm run check-drift` — so toàn bộ cây cấu hình preset.
5. `npm run check:terms` — tệp sinh không stale.
6. `python3 tests/golden/generate.py --check` — corpus reproducible.
7. `node scripts/check-package.mjs` — gói không chứa rác, đường dẫn tuyệt đối, bí mật.
8. `npm pack --dry-run`.
9. Quét bí mật và đường dẫn tuyệt đối trên toàn repo.

Chạy trên máy, một lệnh:

```bash
npm run verify          # gồm cả docs:verify và bench
python3 tests/bench/bench.py --compare
python3 tests/bench/bench.py --json
```

Runtime smoke không nằm trong CI: nó cần `DSH_HOME` riêng, một lần boot `dsh`
và API key. Quy trình ở `docs/evidence/smoke/README.md`. Lần chạy gần nhất:
`2026-11-15T23:12+07:00`.

## CHECK — so với baseline đã commit

Hai baseline, cả hai đều nằm trong git:

- `tests/golden/metrics.json` — TP/FP/FN, precision, recall theo rule.
- `tests/bench/baseline.json` — latency percentile, số finding, số protected span.

Ngưỡng hồi quy **cố định**, không tự nới:

| Phát hiện | Kết luận |
|---|---|
| FP của rule blocking tăng | HỒI QUY — fail |
| TP của golden corpus giảm | HỒI QUY — fail (mất năng lực) |
| Số finding blocking trên corpus thật giảm | Nghi false negative — fail, phải điều tra |
| p95 latency tăng quá 3x baseline | HỒI QUY — fail |

Cập nhật baseline chỉ được làm khi có lý do ghi trong CHANGELOG. Hạ baseline để
CI xanh là vi phạm quy tắc của chính tài liệu này.

## ACT — staged rollout của rule

Rule mới hoặc rule đổi ngữ nghĩa đi qua ba bước, có người duyệt ở mỗi bước:

1. **INFO** — đo trên corpus thật và trên văn bản của người dùng thật. Ghi
   precision/recall quan sát được.
2. **WARNING** — chỉ nâng khi precision đo được ≥ 95% trên mẫu độc lập với
   corpus đã dùng để phát triển rule.
3. **BLOCKING** — chỉ khi WARNING ổn định qua ít nhất hai chu kỳ phát hành.

Hiện trạng: `L006` ở mức INFO và **không** được nâng, vì còn false positive trên
chữ thường không mang nghĩa quy định. `L007` cũng ở INFO. Năm rule còn lại
(`L001`-`L005`) là WARNING, không có rule nào blocking.

Đổi trạng thái từ điển (`approved` ↔ `proposed`) cần người duyệt; generator
không tự nâng trạng thái nào.

Rollback: rule lùi một bước theo cùng thứ tự khi phát hiện hồi quy, và baseline
được cập nhật kèm lý do.

## TELEMETRY

Mặc định **OFF**. Plugin không có mã gửi dữ liệu ra ngoài, không có endpoint,
không có biến môi trường bật telemetry.

Nếu sau này có, chỉ được phép gửi **số tổng hợp**:

- `plugin_version`, `dsh_version`;
- `rule_id`, `result_count`;
- `latency_bucket`, `document_size_bucket`, `error_category`.

Tuyệt đối không gửi: văn bản thô, tên tệp, đường dẫn, prompt, mã nguồn, định
danh, diff, URL repo riêng tư, bí mật môi trường.

Kiểm chứng hiện tại: `test/ci.test.js` khẳng định gói không chứa mẫu bí mật và
`test/docs.test.js` khẳng định không tệp nào bị ghi ngoài đề xuất. Không có test
nào khẳng định "không gọi mạng" bằng cách chặn socket — đó là **CHƯA XÁC MINH**.

## Vòng PDCA kế tiếp

Thứ tự theo tác động/chi phí:

1. **Gọi `tvkt_lint` từ model trong session sống** — runtime smoke đã chứng minh
   bundle mount, preset compose, skill discovery, prompt contract và PTC đều chạy
   thật (`docs/evidence/smoke/`). Phần còn thiếu là một lần model gọi
   `tvkt_lint` thật: hiện không có RPC nào liệt kê tool của session để kiểm, nên
   phải dựa vào một prompt buộc model dùng tool rồi đọc `tool/result` trong
   session log.
2. **Đo prompt overhead bằng tokenizer thật** — thay ước lượng chia 2.5 bằng số
   đếm token thật, rồi mới đặt ngân sách.
3. **Mở rộng corpus thật để đo precision thực địa** — lấy văn bản người dùng thật
   (có đồng ý), gán nhãn tay, tính precision ngoài corpus golden.
4. **Tách preset thành `tvkt-vi-standard` và `tvkt-vi-ptc`** — chỉ làm khi
   `@deepseek-ai/dsh-agent-preset` của target cho phép khai nhiều preset trong một
   bundle. Hiện chưa xác minh được, nên giữ một preset và ghi rõ PTC là thay đổi
   ngữ nghĩa.
5. **Port linter deterministic sang JS** — bỏ phụ thuộc `python3` ở phía runtime
   tool. Chỉ làm nếu đo được là giữ nguyên hành vi trên toàn golden corpus.
