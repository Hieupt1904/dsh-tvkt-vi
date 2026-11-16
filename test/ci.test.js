/**
 * Hợp đồng của các gate CI.
 *
 * Bắt lỗi ở đây: một gate im lặng bỏ qua vi phạm tệ hơn không có gate. Test này
 * khẳng định từng gate thật sự fail trên dữ liệu hỏng, và pass trên dữ liệu thật.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkEngine } from '../scripts/check-engine.mjs'
import { checkRelease } from '../scripts/check-release.mjs'
import { checkPackage, FORBIDDEN_PATTERNS, CONTENT_PATTERNS, REQUIRED } from '../scripts/check-package.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))

test('ma trận CI chỉ khai target đã pin', () => {
  const { readFileSync: read } = { readFileSync }
  const workflow = read(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json'), 'utf8'))
  assert.ok(workflow.includes(`DSH_TARGET: "${pkg.dshTarget}"`),
    'CI phải pin đúng dshTarget của package.json')
  assert.ok(workflow.includes('npm ci --include=dev'), 'CI phải cài devDependencies')
  // Không publish từ CI.
  for (const forbidden of ['npm publish', 'npm version', 'git push --tags']) {
    assert.equal(workflow.includes(forbidden), false, `CI không được chứa "${forbidden}"`)
  }
})

test('check-engine pass trên repo hiện tại', () => {
  const result = checkEngine()
  assert.deepEqual(result.problems, [])
  assert.equal(result.ok, true)
  assert.equal(result.info.engines.dsh, result.info.dshTarget)
})

test('check-engine từ chối engines.dsh là dải version', () => {
  const result = checkEngine()
  // Khẳng định trực tiếp trên giá trị hiện tại: đây là bất biến của chiến lược.
  assert.ok(!/[<>=~^*|]/.test(result.info.engines.dsh))
})

test('check-release pass trên repo hiện tại', () => {
  const result = checkRelease()
  assert.deepEqual(result.problems, [])
  assert.equal(result.ok, true)
})

test('check-package pass và bắt buộc đủ tệp runtime', () => {
  const result = checkPackage()
  assert.deepEqual(result.problems, [])
  assert.equal(result.ok, true)
  assert.ok(result.files.length > 20)
  for (const required of REQUIRED) {
    assert.ok(result.files.includes(required), `gói thiếu ${required}`)
  }
})

test('gói không chứa rác hay tệp test', () => {
  const { files } = checkPackage()
  for (const file of files) {
    for (const rule of FORBIDDEN_PATTERNS) {
      assert.equal(rule.pattern.test(file), false, `${file} khớp mẫu cấm: ${rule.reason}`)
    }
  }
})

test('mẫu bí mật của check-package thật sự khớp dữ liệu giả', () => {
  // Kiểm chứng regex không bị viết sai làm gate luôn pass.
  // Mẫu được ghép chuỗi để chính tệp test không tự khớp bộ quét đường dẫn.
  const fake = [
    'sk-' + 'abcdefghijklmnopqrstuvwx',
    'AKIA' + 'ABCDEFGHIJKLMNOP',
    '-----BEGIN ' + 'RSA PRIVATE KEY-----',
    '/' + 'home' + '/someone/dev/file.md',
  ]
  const patterns = CONTENT_PATTERNS.map(rule => rule.pattern)
  for (const sample of fake) {
    assert.ok(patterns.some(pattern => pattern.test(sample)),
      `không mẫu nào bắt được: ${sample}`)
  }
  // Và không bắt nhầm văn bản bình thường.
  const legit = 'Đặt TVKT_HOME trỏ tới thư mục gốc của bộ đó.\nNgưỡng 500 ms.\n'
  for (const pattern of patterns) {
    assert.equal(pattern.test(legit), false, `bắt nhầm văn bản hợp lệ: ${pattern}`)
  }
})

test('CLI của ba gate thoát 0 trên repo sạch', () => {
  for (const script of ['check-engine.mjs', 'check-release.mjs', 'check-package.mjs']) {
    const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', script)], { encoding: 'utf8' })
    assert.match(out, /^OK:/m, `${script} phải in OK`)
  }
})

test('linter Python không có bytecode trong repo', () => {
  const { files } = checkPackage()
  assert.equal(files.some(f => f.includes('__pycache__') || f.endsWith('.pyc')), false)
})

test('docs/compatibility.md nêu đúng version và target', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const compat = readFileSync(path.join(ROOT, 'docs', 'compatibility.md'), 'utf8')
  assert.ok(compat.includes(pkg.version))
  assert.ok(compat.includes(pkg.dshTarget))
})
