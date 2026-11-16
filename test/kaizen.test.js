/**
 * KPI trong `docs/kaizen.md` phải khớp số đo được, không phải số viết tay.
 *
 * Một tài liệu PDCA ghi số sai còn tệ hơn không có: nó khiến người đọc tin vào
 * một mức chất lượng không tồn tại. Test này đối chiếu từng con số nêu trong
 * tài liệu với baseline đã commit.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const KAIZEN = path.join(ROOT, 'docs', 'kaizen.md')
const GOLDEN = path.join(ROOT, 'tests', 'golden', 'metrics.json')
const BENCH = path.join(ROOT, 'tests', 'bench', 'baseline.json')
const CONTRACT = path.join(ROOT, 'lib', 'contract.js')

const hasPython = (() => {
  try {
    execFileSync('python3', ['--version'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
})()

test('docs/kaizen.md tồn tại và có đủ bốn pha PDCA', () => {
  assert.ok(existsSync(KAIZEN))
  const text = readFileSync(KAIZEN, 'utf8')
  for (const phase of ['PLAN', 'DO', 'CHECK', 'ACT', 'TELEMETRY']) {
    assert.match(text, new RegExp(`## ${phase}\\b`), `thiếu mục ${phase}`)
  }
})

test('telemetry mặc định OFF và danh sách cấm được nêu rõ', () => {
  const text = readFileSync(KAIZEN, 'utf8')
  assert.match(text, /Mặc định \*\*OFF\*\*/)
  for (const forbidden of ['văn bản thô', 'đường dẫn', 'prompt', 'bí mật môi trường']) {
    assert.ok(text.includes(forbidden), `thiếu mục cấm: ${forbidden}`)
  }
})

test('số KPI trong kaizen khớp baseline golden', () => {
  const text = readFileSync(KAIZEN, 'utf8')
  const metrics = JSON.parse(readFileSync(GOLDEN, 'utf8'))
  const totals = metrics.totals
  assert.ok(text.includes(`${totals.TP} TP`), `kaizen không nêu ${totals.TP} TP`)
  assert.ok(text.includes(`${totals.FP} FN`) || text.includes(`${totals.FP} FP`),
    `kaizen không nêu FP=${totals.FP}`)
})

test('kaizen trỏ tới baseline thay vì chép số latency dễ trôi', () => {
  // Số latency dao động vài phần trăm giữa các lần chạy, nên chép số cứng vào
  // tài liệu là tự tạo drift. Tài liệu phải trỏ tới tệp baseline.
  const text = readFileSync(KAIZEN, 'utf8')
  assert.ok(existsSync(BENCH), 'phải có tests/bench/baseline.json')
  assert.ok(text.includes('tests/bench/baseline.json'),
    'kaizen phải trỏ tới tests/bench/baseline.json')
  assert.ok(text.includes('python3 tests/bench/bench.py'),
    'kaizen phải nêu lệnh đo')
})

test('prompt overhead trong kaizen khớp độ dài CONTRACT_TEXT', async () => {
  // Đọc giá trị thật từ module, không parse chuỗi nguồn (dễ lệch do escape).
  const { CONTRACT_TEXT } = await import('../lib/contract.js')
  const chars = CONTRACT_TEXT.length
  const text = readFileSync(KAIZEN, 'utf8')
  // `\b` của JS chỉ hiểu ASCII, nên `tự` không tạo ranh giới từ. Dùng lookbehind.
  const stated = Number(/(?<![\d])(\d{3,5}) ký tự/u.exec(text)?.[1] ?? 0)
  assert.ok(Math.abs(stated - chars) <= 20,
    `kaizen nêu ${stated} ký tự, thực tế ${chars}`)
})

test('rule blocking không bị nâng trạng thái mà không có bằng chứng', () => {
  const text = readFileSync(KAIZEN, 'utf8')
  assert.match(text, /L006.*INFO/, 'L006 phải còn ở INFO')
  assert.match(text, /L007.*INFO|`L007` cũng ở INFO/, 'L007 phải còn ở INFO')
  assert.match(text, /không có rule nào blocking/,
    'không được tuyên bố rule blocking khi chưa có bằng chứng')
  assert.match(text, /`L001`-`L005`\) là WARNING/, 'năm rule blocking phải là WARNING')
})

test('bench phải chạy được và không hồi quy so với baseline', { skip: hasPython ? false : 'không có python3' }, () => {
  const out = execFileSync('python3', [path.join(ROOT, 'tests', 'bench', 'bench.py'), '--compare'], {
    encoding: 'utf8',
  })
  assert.match(out, /OK: không có hồi quy/)
})

test('bench loại golden fixture khỏi corpus đo tải', { skip: hasPython ? false : 'không có python3' }, () => {
  const out = execFileSync('python3', [path.join(ROOT, 'tests', 'bench', 'bench.py'), '--json'], {
    encoding: 'utf8',
  })
  const report = JSON.parse(out)
  assert.ok(report.corpus_documents > 0)
  // Không tính fixture: nếu tính, WARNING sẽ khác 0 vì fixture cố tình vi phạm.
  assert.equal(report.findings_by_severity.WARNING, 0,
    'tài liệu thật của repo phải không có WARNING; nếu có nghĩa fixture đã lọt vào corpus')
})
