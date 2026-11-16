/**
 * Quyết định portability: bản này khai support Linux/macOS, không khai Windows.
 *
 * Vì sao có tệp này: plugin gọi Python qua tiến trình con. Trên Windows tên trình
 * thông dịch thường là `python` hoặc `py`, không phải `python3`, và CI chưa có
 * runner Windows. Không có bằng chứng thì không được tuyên bố cross-platform.
 * Test dưới đây khoá đúng mức đã kiểm: một biến môi trường để đổi trình thông
 * dịch, và tài liệu phải nói rõ phần chưa kiểm.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runLinter } from '../lib/tool.js'
import { pythonExecutable, verify } from '../scripts/docs-verify.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const hasPython = (() => {
  try {
    execFileSync('python3', ['--version'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
})()

/** Đặt biến môi trường trong phạm vi một hàm rồi trả lại giá trị cũ. */
function withEnv(name, value, fn) {
  const before = process.env[name]
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
  try {
    return fn()
  } finally {
    if (before === undefined) delete process.env[name]
    else process.env[name] = before
  }
}

test('TVKT_PYTHON đổi được trình thông dịch của tool runtime', { skip: hasPython ? false : 'không có python3' }, async () => {
  const bogus = path.join(tmpdir(), 'khong-co-trinh-thong-dich-nay')
  await withEnv('TVKT_PYTHON', bogus, async () => {
    await assert.rejects(
      () => runLinter({ text: 'Hệ thống kiểm tra dữ liệu.', timeoutMs: 5000 }),
      /cannot start the linter/,
      'phải báo lỗi khởi động, không lặng lẽ dùng python3 mặc định')
  })
})

test('pythonExecutable đọc TVKT_PYTHON, mặc định là python3', () => {
  // Xoá biến trước khi kiểm mặc định: máy chạy test có thể đang đặt TVKT_PYTHON.
  withEnv('TVKT_PYTHON', undefined, () => {
    assert.equal(pythonExecutable(), 'python3')
  })
  withEnv('TVKT_PYTHON', '/duong/dan/python-cua-toi', () => {
    assert.equal(pythonExecutable(), '/duong/dan/python-cua-toi')
  })
})

test('docs-verify không báo VERIFIED khi không chạy được Python', () => {
  const bogus = path.join(tmpdir(), 'khong-co-trinh-thong-dich-nay')
  withEnv('TVKT_PYTHON', bogus, () => {
    const report = verify({})
    assert.notEqual(report.verdict, 'VERIFIED', 'linter lỗi không được coi là VERIFIED')
    assert.ok(report.results.some(entry => entry.checks.lint === 'ERROR'),
      'mỗi tệp phải ghi nhận linter lỗi, không im lặng bỏ qua')
  })
})

test('compatibility khai ma trận OS và không nhận Windows', () => {
  const compat = readFileSync(path.join(ROOT, 'docs', 'compatibility.md'), 'utf8')
  assert.match(compat, /Linux|Ubuntu/, 'phải nêu nền đã kiểm')
  assert.match(compat, /Windows/, 'phải nói rõ Windows ở trạng thái nào')
  assert.equal(/Windows.*(ĐÃ TRIỂN KHAI|Verified)/.test(compat), false,
    'chưa có bằng chứng chạy Windows thì không được nhận')
})

test('README nêu rõ giới hạn nền tảng thay vì khai bừa', () => {
  const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8')
  // Câu "Đường dẫn đa nền tảng" nói về dấu phân cách, không phải về hỗ trợ OS,
  // nên phép kiểm này chỉ chặn lời khai hỗ trợ Windows.
  assert.match(readme, /Chưa có bằng chứng chạy trên Windows/,
    'phải nêu giới hạn nền tảng')
  assert.equal(/chạy trên Windows và Linux|hỗ trợ mọi hệ điều hành|Windows:?s*ĐÃ TRIỂN KHAI/i.test(readme), false,
    'chưa có bằng chứng thì không được khai hỗ trợ Windows')
})
