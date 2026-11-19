# Kaizen / PDCA cho dsh-tvkt-vi

Vòng cải tiến liên tục cho plugin TVKT. Mỗi mục dưới đây gắn với một lệnh chạy
được, không phải khẩu hiệu. Số liệu ghi ở đây là **số đã đo** trên
`2026-11-19T14:10+07:00`, Node `v24.22.3`, Python `3.12.3` (đối chứng `3.11.15`),
DSH `0.2.2-rc.2` và `0.2.2-rc.5` (hai pin đang khai trong `engines.dsh`).

## PLAN — KPI và mục tiêu

| KPI | Mục tiêu | Cách đo | Trạng thái hiện tại |
|---|---|---|---|
| Install/mount thành công trên support matrix | 100% | `npm run cli:engine` + `npm run compat:smoke` | 2/2 pin đã khai; smoke chạy trong CI ở job `compat-smoke` theo matrix và chạy lại được trên máy |
| Regression P0/P1 về lifecycle | 0 | `test/provider-lifecycle.test.js` | 0 (10 test, trong đó 1 test fail khi tái hiện lỗi P1 cũ) |
| Vùng bảo vệ giữ nguyên byte | 100% | `test/linter.test.js`, `test/docs.test.js` | 100% (hash trước/sau) |
| Ghi trái phép vào đặc tả | 0 | `test/docs.test.js` ca spec-conflict | 0 |
| Precision của rule blocking | ≥ 95% | `tests/golden/metrics.json` | 36 ca, 266 TP, 0 FP **theo định nghĩa của corpus**; 2 false positive đã biết được ghi riêng ở `tests/golden/README.md` |
| False positive của rule blocking | < 5% | như trên | chưa đo được ngoài corpus; xem mục giới hạn bên dưới |
| p95 latency của linter | đo trước, đặt mục tiêu sau | `python3 tests/bench/bench.py` | Xem `tests/bench/baseline.json` — số đo dao động giữa các lần chạy nên tài liệu này không chép số cứng; chạy lệnh để lấy giá trị hiện tại |
| Prompt token overhead | đo và baseline | `CONTRACT_TEXT.length` | 1776 ký tự ≈ 710 token (ước lượng thô, chia 2.5) — **CẦN XÁC NHẬN** bằng tokenizer thật |
| Lỗi provider/tool không bắt được | 0 trong test suite | `npm test` | 0 |

Ghi chú về con số precision: corpus golden do chính dự án viết, nên precision
100% chỉ nói "rule làm đúng điều corpus khẳng định". Nó không nói precision trên
văn bản thật của người dùng.

## DO — việc chạy trên mỗi PR

CI (`.github/workflows/ci.yml`) chạy tự động:

1. `npm run cli:engine` — engines khớp target đã pin.
2. `npm test` — 170 test: unit, integration registry thật, drift, golden, tool, docs, kaizen, canonical fact, bench invariant, thứ tự section.
3. `npm run lint:skill`.
4. `npm run check-drift` — so toàn bộ cây cấu hình preset.
5. `npm run check:terms` — tệp sinh không stale.
6. `python3 tests/golden/generate.py --check` — corpus reproducible.
7. `node scripts/check-package.mjs` — gói không chứa rác, đường dẫn tuyệt đối, bí mật.
8. `npm pack --dry-run`.
9. Quét bí mật và đường dẫn tuyệt đối trên toàn repo. Đây là kiểm mẫu chuỗi; nó không thay được một secret scanner.
10. Job `compat-smoke`: matrix theo từng pin trong `engines.dsh`, cài đúng pin
    của dòng matrix, chốt version bằng `engines.dsh`, rồi chạy
    `node scripts/compat-smoke.mjs`.

Chạy trên máy, một lệnh:

```bash
npm run verify          # gồm cả docs:verify và bench
python3 tests/bench/bench.py --compare
python3 tests/bench/bench.py --json
```

Runtime smoke **nằm trong CI** từ bước này, ở job `compat-smoke`. Job đó cài đúng
pin của dòng matrix, không cài HEAD, và không gọi model nên không cần API key. Nó
boot service thật của pin đó rồi mount package; phạm vi chi tiết ở
`docs/compatibility.md`.

Chạy trên một pin cụ thể ở máy: dựng prefix tạm rồi trỏ `DSH_INSTALL_MODULES` vào
đó, đừng cài đè bản đang dùng.

```bash
npm install --prefix /tmp/dsh-pin @deepseek-ai/dsh@0.2.2-rc.5
DSH_INSTALL_MODULES=/tmp/dsh-pin/node_modules node scripts/compat-smoke.mjs
```

Bản ghi lần chạy tay đầu tiên, kèm phần chưa quan sát được, vẫn ở
`docs/evidence/smoke/README.md`.

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

### Giới hạn của phép đo hiện tại

- `metrics.json` sinh kỳ vọng từ chính đầu ra của linter, nên `FP = 0` nghĩa là
  corpus đồng ý với linter. Đó không phải precision thực địa, và không được đọc
  như một lời khai về chất lượng tiếng Việt nói chung.
- Hai false positive đã biết, ghi ở `tests/golden/README.md`: ngoặc kép không phải
  vùng bảo vệ, và `{{…}}` không phải vùng bảo vệ.
- Corpus chỉ hiểu Markdown. Tệp `.mdx` chưa được hỗ trợ.

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

1. **Gọi `tvkt_lint` từ model trong session sống.** Smoke đã chứng minh tool có
   trong registry và chạy đúng khi được gọi. Phần còn thiếu là một lần model tự
   chọn nó: không có RPC nào liệt kê tool của session, nên phải dựa vào một prompt
   buộc model dùng tool rồi đọc `tool/result` trong session log. Điều kiện nghiệm
   thu: có bản ghi chứng minh model gọi `tvkt_lint` và nhận kết quả có cấu trúc.
2. **Viết tay kỳ vọng golden để đo false positive thật.** Hiện kỳ vọng sinh từ
   đầu ra linter. Điều kiện nghiệm thu: mỗi ca có kỳ vọng do người viết, và
   `metrics.json` báo được FP > 0 khi linter báo sai.
3. **Bảo vệ ngoặc kép và placeholder.** Điều kiện nghiệm thu: hai ca
   `known-false-positive` chuyển sang `expect_absent_rules` và vẫn xanh; không
   đổi ngưỡng 30/40 tiếng, không đổi từ điển.
4. **Đo prompt overhead bằng tokenizer thật.** Thay ước lượng chia 2.5 bằng số
   đếm token thật, rồi mới đặt ngân sách.
5. **Cấu hình runtime cho `tvkt_lint`** (`include`, `exclude`,
   `protectedPaths`, `rulesetVersion`) theo tiêu chí ở `.tvkt/README.md`. Chỉ làm
   khi có nhu cầu thật từ người dùng.
6. **Đồng bộ release GitHub với npm.** Release mới nhất đang là `v0.4.0` trong khi
   npm có `0.5.0`. Điều kiện nghiệm thu: tarball tên cố định của release trỏ đúng
   version mới nhất trên npm.
7. **Hỗ trợ Windows.** Điều kiện nghiệm thu ở `docs/compatibility.md`: có job
   Windows, dò trình thông dịch không dùng shell, giữ argv dạng mảng, và test lại
   đường `path`/`symlink`/`timeout`/`abort` trên runner đó.
8. **Port linter deterministic sang JS.** Bỏ phụ thuộc `python3` ở phía runtime.
   Chỉ làm nếu đo được là giữ nguyên hành vi trên toàn golden corpus.
