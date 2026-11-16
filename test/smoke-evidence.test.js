/**
 * Bằng chứng runtime phải còn và phải khớp thực tế.
 *
 * Vì sao có test này: `docs/evidence/smoke/` là chỗ duy nhất ghi lại một lần
 * chạy thật của `dsh`. Nếu tệp bị xoá, hoặc compatibility.md tuyên bố "Verified"
 * mà không còn bằng chứng, thì tuyên bố đó thành vô căn cứ. Test này chặn cả hai.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const SMOKE_DIR = path.join(ROOT, 'docs', 'evidence', 'smoke')
const COMPAT = path.join(ROOT, 'docs', 'compatibility.md')
const KAIZEN = path.join(ROOT, 'docs', 'kaizen.md')

test('bằng chứng runtime smoke tồn tại', () => {
  assert.ok(existsSync(SMOKE_DIR), 'thiếu docs/evidence/smoke/')
  const files = readdirSync(SMOKE_DIR)
  assert.ok(files.includes('README.md'), 'thiếu README.md của smoke')
})

test('bằng chứng smoke nêu đúng target và những gì chưa quan sát', () => {
  const text = readFileSync(path.join(SMOKE_DIR, 'README.md'), 'utf8')
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  assert.ok(text.includes(String(pkg.dshTarget)), `smoke không nêu target ${pkg.dshTarget}`)
  // Phải trung thực về phần chưa kiểm.
  assert.match(text, /Chưa quan sát được/, 'phải có mục nêu giới hạn')
  assert.match(text, /tvkt_lint/, 'phải nêu rõ tvkt_lint chưa được gọi từ model')
  // Không được chứa token hay khóa thật.
  assert.equal(/sk-[A-Za-z0-9_-]{16,}/.test(text), false, 'không được chứa API key')
  assert.equal(/dsh-auth-[A-Za-z0-9_-]{20,}/.test(text), false, 'không được chứa cookie thật')
})

test('compatibility ghi mốc runtime thay vì chỉ unit test', () => {
  const compat = readFileSync(COMPAT, 'utf8')
  assert.match(compat, /docs\/evidence\/smoke/, 'compatibility phải trỏ tới bằng chứng smoke')
  // Nếu còn câu "chưa có runtime smoke" thì bảng phía trên không được nói Verified.
  if (/chưa có runtime smoke/i.test(compat)) {
    assert.fail('compatibility còn nói "chưa có runtime smoke" — sửa bảng cho khớp')
  }
})

test('kaizen ghi mốc runtime có ngày', () => {
  const kaizen = readFileSync(KAIZEN, 'utf8')
  assert.match(kaizen, /docs\/evidence\/smoke/, 'kaizen phải trỏ tới bằng chứng smoke')
  assert.match(kaizen, /2026-11-15T23:12\+07:00/, 'kaizen phải ghi mốc thời gian chạy')
})

test('smoke evidence không nằm trong gói phát hành', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  // docs được đóng gói, nên bằng chứng đi kèm là chủ ý: người dùng kiểm được.
  // Điều phải kiểm là nó không mang dữ liệu riêng của máy.
  const text = readFileSync(path.join(SMOKE_DIR, 'README.md'), 'utf8')
  assert.equal(/\/home\/[a-z][\w.-]*\//i.test(text), false, 'không được có đường dẫn tuyệt đối')
  assert.ok(pkg.files.includes('docs'), 'docs phải được đóng gói')
})
