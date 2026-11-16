/**
 * Quản trị từ điển: `terms-quick.md` phải sinh được từ `terms.json`.
 *
 * Lớp lỗi được bắt ở đây: bản chép tay 0.4.0 gộp cả 47 thuật ngữ `proposed`
 * (T024-T070) vào mục "Thuật ngữ chuẩn", nên người đọc coi chúng là đã duyệt.
 * Nó còn mang đường dẫn tuyệt đối của máy phát triển.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { groupTerms, readTerms, renderQuickReference } from '../scripts/gen-terms-quick.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const TERMS = path.join(ROOT, 'vendor', 'tvkt', 'config', 'terms.json')
const QUICK = path.join(ROOT, 'skills', 'tvkt-vi', 'references', 'terms-quick.md')
const GENERATOR = path.join(ROOT, 'scripts', 'gen-terms-quick.mjs')

const data = readTerms(TERMS)

/**
 * Liệt kê tệp sẽ được phát hành, bỏ node_modules, .git, docs và tests.
 *
 * `docs` bị loại vì docs/evidence chứa bản sao preset upstream: đó là dữ liệu
 * bằng chứng, không phải văn bản của plugin. `tests` bị loại vì test tự chứa
 * mẫu để kiểm chính bộ quét — mẫu đó không đi vào gói.
 */
function packageFiles(dir = ROOT, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'docs' || entry === 'tests') continue
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) packageFiles(full, out)
    else out.push(full)
  }
  return out
}

test('terms.json là nguồn sự thật: id duy nhất, status hợp lệ', () => {
  assert.equal(data.terms.length, 70)
  const ids = new Set(data.terms.map(t => t.id))
  assert.equal(ids.size, 70, 'id phải duy nhất')
  for (const term of data.terms) {
    assert.ok(['approved', 'proposed', 'contextual', 'deprecated'].includes(term.status),
      `${term.id} có status lạ: ${term.status}`)
  }
})

test('quick reference committed khớp đầu ra generator', () => {
  const generated = renderQuickReference(data)
  const committed = readFileSync(QUICK, 'utf8')
  assert.equal(committed, generated,
    'terms-quick.md bị stale — chạy: node scripts/gen-terms-quick.mjs')
})

test('generator --check phát hiện tệp stale', () => {
  // --check trên tệp hiện tại phải thoát 0.
  const code = execFileSync(process.execPath, [GENERATOR, '--check'], { encoding: 'utf8' })
  assert.match(code, /OK: quick reference khớp terms.json/)
})

test('thuật ngữ proposed KHÔNG nằm trong nhóm approved', () => {
  const grouped = groupTerms(data.terms)
  const approvedIds = new Set(grouped.get('approved').map(t => t.id))
  const proposed = grouped.get('proposed')
  assert.equal(proposed.length, 47, 'T024-T070 là proposed')
  for (const term of proposed) {
    assert.ok(!approvedIds.has(term.id), `${term.id} vừa approved vừa proposed`)
  }

  // Kiểm tra trên tệp Markdown: mọi dòng bảng ở mục approved phải là id approved.
  const md = readFileSync(QUICK, 'utf8')
  const approvedSection = md.split('## Thuật ngữ đã duyệt')[1].split('## Thuật ngữ đề xuất')[0]
  const rows = [...approvedSection.matchAll(/^\| (T\d+) \|/gm)].map(m => m[1])
  assert.equal(rows.length, 23, 'mục approved phải có đúng 23 thuật ngữ')
  for (const id of rows) {
    const term = data.terms.find(t => t.id === id)
    assert.equal(term.status, 'approved', `${id} (${term.term}) không phải approved`)
  }
})

test('mục đề xuất mang nhãn chưa phê duyệt', () => {
  const md = readFileSync(QUICK, 'utf8')
  assert.match(md, /## Thuật ngữ đề xuất \(47\)/)
  assert.match(md, /chưa được phê duyệt/i)
  assert.match(md, /Chỉ nhóm \*\*đã duyệt\*\* là chuẩn/)
})

test('tệp trong gói không chứa đường dẫn tuyệt đối của máy phát triển', () => {
  const bad = []
  for (const file of packageFiles()) {
    if (/\.(png|jpg|svg|tgz|pyc)$/.test(file)) continue
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch { continue }
    for (const pattern of [/\/home\/[a-z][\w.-]*\//, /C:\\\\Users\\\\/i, /\/Users\/[A-Za-z]/]) {
      if (pattern.test(text)) bad.push(`${path.relative(ROOT, file)} khớp ${pattern}`)
    }
  }
  assert.deepEqual(bad, [], `còn đường dẫn tuyệt đối:\n${bad.join('\n')}`)
})

test('quick reference ghi rõ nguồn gốc, không phải đường dẫn máy', () => {
  const md = readFileSync(QUICK, 'utf8')
  assert.match(md, /TỆP SINH TỰ ĐỘNG/)
  assert.match(md, /vendor\/tvkt\/config\/terms\.json/)
  assert.ok(!md.includes('/home/'), 'không được có đường dẫn tuyệt đối')
})

test('generator từ chối dữ liệu hỏng thay vì sinh tệp sai', () => {
  const broken = JSON.parse(JSON.stringify(data))
  broken.terms[0].status = 'approvedmạng' // giá trị lạ
  const tmp = path.join(ROOT, 'node_modules', '.tvkt-broken-terms.json')
  writeFileSync(tmp, JSON.stringify(broken))
  try {
    assert.throws(() => readTerms(tmp), /status lạ/)
  } finally {
    rmSync(tmp, { force: true })
  }
})
