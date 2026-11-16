/**
 * Số ngữ nghĩa của bench không được phụ thuộc số lần lặp.
 *
 * Vì sao có tệp này: `bench.py` lặp mỗi tài liệu `REPEATS` lần để lấy mẫu
 * latency. Số finding và số protected span là thuộc tính của tài liệu, nên phải
 * lấy từ một lần chạy canonical. Test này khoá lại: đổi số lần lặp từ 5 sang 10
 * chỉ được đổi số mẫu latency.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const BENCH = path.join(ROOT, 'tests', 'bench', 'bench.py')

const hasPython = (() => {
  try {
    execFileSync('python3', ['--version'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
})()
const skip = hasPython ? false : 'không có python3'

/** Chạy bench với số lần lặp cho trước, trả JSON. */
function runBench(repeats) {
  const out = execFileSync('python3', [BENCH, '--json'], {
    encoding: 'utf8',
    env: { ...process.env, TVKT_BENCH_REPEATS: String(repeats) },
  })
  return JSON.parse(out)
}

test('số ngữ nghĩa không đổi khi REPEATS đổi 5 → 10', { skip }, () => {
  const five = runBench(5)
  const ten = runBench(10)

  // Số mẫu latency phải đổi theo số lần lặp.
  assert.equal(five.repeats, 5)
  assert.equal(ten.repeats, 10)
  assert.equal(ten.measurements, five.measurements * 2,
    'gấp đôi số lần lặp phải gấp đôi số mẫu latency')

  // Mọi số ngữ nghĩa phải giữ nguyên.
  for (const key of ['corpus_documents', 'findings_total', 'protected_spans_total',
    'findings_by_rule', 'findings_by_severity', 'blocking_findings']) {
    assert.deepEqual(ten[key], five[key], `REPEATS làm đổi ${key}`)
  }
})

test('số ngữ nghĩa lấy từ lần chạy canonical và linter deterministic', { skip }, () => {
  const report = runBench(5)
  assert.equal(report.semantic_source, 'first repeat')
  assert.deepEqual(report.repeat_mismatches, [],
    'cùng đầu vào phải cho cùng đầu ra trên mọi lần lặp')
})

test('findings_total bằng tổng số finding thật của corpus', { skip }, () => {
  const report = runBench(5)
  const perRule = Object.values(report.findings_by_rule).reduce((sum, n) => sum + n, 0)
  const perSeverity = Object.values(report.findings_by_severity).reduce((sum, n) => sum + n, 0)
  assert.equal(report.findings_total, perRule, 'findings_total lệch tổng theo rule')
  assert.equal(report.findings_total, perSeverity, 'findings_total lệch tổng theo mức')
})

test('file baseline khai đúng nhãn nguồn ngữ nghĩa', { skip }, () => {
  // Không so số finding với baseline đã commit: sửa một tài liệu là đổi số, nên
  // phép so đó sẽ fail mọi PR tài liệu. Cổng hồi quy thật là `bench.py --compare`,
  // và nó cố ý không so `findings_total`.
  const baseline = JSON.parse(readFileSync(path.join(ROOT, 'tests', 'bench', 'baseline.json'), 'utf8'))
  assert.equal(baseline.semantic_source, 'first repeat')
  assert.ok(Number.isInteger(baseline.repeats) && baseline.repeats >= 1)
  assert.deepEqual(baseline.repeat_mismatches, [])
})
