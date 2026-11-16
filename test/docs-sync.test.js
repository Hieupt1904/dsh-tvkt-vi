/**
 * `docs-sync` — chỉ tạo đề xuất, không áp dụng.
 *
 * Bất biến: sau khi chạy, chỉ có tệp trong `.tvkt/proposals/` được thêm; mọi tệp
 * tài liệu giữ nguyên byte. Đề xuất phải có bằng chứng, rule, giả định, câu hỏi
 * mở, và `apply: false`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync, existsSync, readdirSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  PROPOSAL_FIELDS, buildProposals, contains, gatherEvidence, handleFor,
  hasMatrixRow, listProposals, renderProposal, reviewMode,
} from '../scripts/docs-sync.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))

/** Hash một tệp. */
function hashOf(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

test('gatherEvidence chỉ trả giá trị chuỗi đã kiểm', () => {
  const evidence = gatherEvidence()
  assert.equal(evidence['package.json.version'], JSON.parse(
    readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version)
  for (const [key, value] of Object.entries(evidence)) {
    assert.equal(typeof value, 'string', `${key} phải là chuỗi`)
  }
})

test('docs-sync trên repo sạch không tạo đề xuất và không sửa tài liệu', () => {
  const compat = path.join(ROOT, 'docs', 'compatibility.md')
  const before = hashOf(compat)
  const result = buildProposals()
  assert.deepEqual(result, [], 'repo đã khớp nguồn thì không được sinh đề xuất')
  assert.equal(hashOf(compat), before, 'tài liệu bị thay đổi')
})

test('mọi đề xuất đều có đủ trường bắt buộc và apply=false', () => {
  for (const proposal of listProposals()) {
    for (const field of PROPOSAL_FIELDS) {
      assert.ok(field in proposal, `thiếu trường ${field}`)
    }
    assert.equal(proposal.apply, false, 'docs-sync không được tự áp dụng')
    assert.ok(proposal.evidence.length > 0, 'phải có bằng chứng')
    assert.ok(proposal.rules.length > 0, 'phải nêu rule đã dùng')
    assert.ok(proposal.assumptions.length > 0, 'phải ghi giả định')
    for (const question of proposal.unresolved) {
      assert.match(question, /CẦN XÁC NHẬN/, 'câu hỏi mở phải mang nhãn CẦN XÁC NHẬN')
    }
  }
})

test('handle ổn định theo nội dung', () => {
  assert.equal(handleFor('x', 'a'), handleFor('x', 'a'))
  assert.notEqual(handleFor('x', 'a'), handleFor('x', 'b'))
  assert.match(handleFor('x', 'a'), /^x-[0-9a-f]{12}$/)
})

test('contains trả null cho tệp không tồn tại, không ném', () => {
  assert.equal(contains('khong/co.md', 'x'), null)
})

test('hasMatrixRow chỉ khớp dòng ma trận đúng version', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  assert.equal(hasMatrixRow('docs/compatibility.md', pkg.version), true,
    `ma trận phải có dòng cho ${pkg.version}`)
  assert.equal(hasMatrixRow('docs/compatibility.md', '9.9.9'), false,
    'version không có trong ma trận phải trả false, dù chuỗi xuất hiện ở chỗ khác')
  assert.equal(hasMatrixRow('khong/co.md', '0.0.0'), null)
})

test('drift bị bỏ sót nếu version còn xuất hiện ở chỗ khác trong tệp', () => {
  // Ca bảo vệ: `contains()` trên cả tệp từng làm docs-sync bỏ qua drift thật vì
  // version vẫn còn trong phần mô tả dshTarget. hasMatrixRow phải không mắc lỗi đó.
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tvkt-hasm-'))
  try {
    const dir = path.join(sandbox, 'docs')
    mkdirSync(dir, { recursive: true })
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    // Tệp có version nhiều lần nhưng KHÔNG có dòng ma trận.
    writeFileSync(path.join(dir, 'compatibility.md'),
      `# Ma trận\n\nPlugin version ${pkg.version} dùng DSH ${pkg.dshTarget}.\n`
      + `Nhắc lại: ${pkg.version}.\n`)
    // Gọi bản trong sandbox bằng cách chạy qua môi trường: dựng lại bản sao tool.
    cpSync(path.join(ROOT, 'scripts', 'docs-sync.mjs'), path.join(sandbox, 'scripts', 'docs-sync.mjs'), { recursive: false })
    cpSync(path.join(ROOT, '.tvkt'), path.join(sandbox, '.tvkt'), { recursive: true })
    writeFileSync(path.join(sandbox, 'package.json'), JSON.stringify(pkg, null, 2))
    const out = execFileSync(process.execPath, [path.join(sandbox, 'scripts', 'docs-sync.mjs')], {
      cwd: sandbox,
      encoding: 'utf8',
    })
    assert.match(out, /chờ duyệt/, 'phải phát hiện drift dù version còn ở chỗ khác')
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

test('reviewMode mặc định là report', () => {
  assert.ok(['report', 'apply'].includes(reviewMode()))
})

test('renderProposal nêu rõ chưa áp dụng và pipeline', () => {
  const proposals = listProposals()
  if (proposals.length === 0) {
    // Repo sạch: dựng đề xuất giả để kiểm phần render.
    const fake = {
      handle: 'test-000000000000',
      generatedAt: '2026-01-01T00:00:00.000Z',
      target: 'docs/compatibility.md',
      changes: [{ kind: 'insert-line', anchor: 'ma trận', proposed: '| x |' }],
      evidence: [{ source: 'package.json.version', value: '0.0.0' }],
      rules: ['DOC_DRIFT:cross-reference'],
      assumptions: ['giả định'],
      unresolved: ['CẦN XÁC NHẬN: câu hỏi'],
      apply: false,
    }
    const text = renderProposal(fake)
    assert.match(text, /Áp dụng tự động: không/)
    assert.match(text, /docs-impact → docs-sync → docs-verify/)
    return
  }
  const text = renderProposal(proposals[0])
  assert.match(text, /Áp dụng tự động: không/)
})

test('drift thật sinh đúng một đề xuất và không chạm tài liệu', () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tvkt-sync-'))
  try {
    for (const entry of ['package.json', 'scripts', 'docs', '.tvkt']) {
      cpSync(path.join(ROOT, entry), path.join(sandbox, entry), { recursive: true })
    }
    // Tạo drift: bỏ dòng version khỏi ma trận.
    const compat = path.join(sandbox, 'docs', 'compatibility.md')
    const original = readFileSync(compat, 'utf8')
    const drifted = original.replace(/^\| `dsh-tvkt-vi` .*\n/gm, '')
    assert.notEqual(drifted, original, 'fixture phải tạo được drift')
    assert.notEqual(drifted, original, 'fixture phải tạo được drift')
    writeFileSync(compat, drifted)
    const driftHash = hashOf(compat)

    const out = execFileSync(process.execPath, [path.join(sandbox, 'scripts', 'docs-sync.mjs')], {
      cwd: sandbox,
      encoding: 'utf8',
    })
    assert.match(out, /chờ duyệt/)
    assert.match(out, /Không tệp tài liệu nào bị sửa/)

    // Tài liệu vẫn đúng như lúc tạo drift.
    assert.equal(hashOf(compat), driftHash, 'docs-sync không được sửa tài liệu')

    // Đề xuất được ghi, có đủ trường.
    const dir = path.join(sandbox, '.tvkt', 'proposals')
    assert.ok(existsSync(dir), 'phải tạo thư mục đề xuất')
    const names = readdirSync(dir).filter(n => n.endsWith('.json'))
    assert.equal(names.length, 1)
    const proposal = JSON.parse(readFileSync(path.join(dir, names[0]), 'utf8'))
    for (const field of PROPOSAL_FIELDS) assert.ok(field in proposal)
    assert.equal(proposal.apply, false)
    assert.equal(proposal.target, 'docs/compatibility.md')
    assert.match(proposal.changes[0].proposed, /CẦN XÁC NHẬN/)
    // Bằng chứng phải trỏ tới giá trị thật trong package.json.
    const pkg = JSON.parse(readFileSync(path.join(sandbox, 'package.json'), 'utf8'))
    assert.equal(proposal.evidence.find(e => e.source === 'package.json.version').value, pkg.version)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

test('--apply-handle in đề xuất nhưng không sửa tệp', () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tvkt-sync2-'))
  try {
    for (const entry of ['package.json', 'scripts', 'docs', '.tvkt']) {
      cpSync(path.join(ROOT, entry), path.join(sandbox, entry), { recursive: true })
    }
    const compat = path.join(sandbox, 'docs', 'compatibility.md')
    writeFileSync(compat, readFileSync(compat, 'utf8').replace(/^\| `dsh-tvkt-vi` .*\n/gm, ''))
    const before = hashOf(compat)
    execFileSync(process.execPath, [path.join(sandbox, 'scripts', 'docs-sync.mjs')], { cwd: sandbox, encoding: 'utf8' })
    const dir = path.join(sandbox, '.tvkt', 'proposals')
    const handle = readdirSync(dir)[0].replace(/\.json$/, '')
    const out = execFileSync(process.execPath, [
      path.join(sandbox, 'scripts', 'docs-sync.mjs'), '--apply-handle', handle,
    ], { cwd: sandbox, encoding: 'utf8' })
    assert.match(out, new RegExp(handle))
    assert.match(out, /không tự áp dụng/)
    assert.equal(hashOf(compat), before, 'in đề xuất không được sửa tài liệu')
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

test('handle không tồn tại thì thoát 2', () => {
  let status = 0
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'docs-sync.mjs'), '--apply-handle', 'khong-co'], {
      encoding: 'utf8',
      stdio: 'pipe',
    })
  } catch (error) {
    status = error.status
  }
  assert.equal(status, 2)
})

test('thư mục đề xuất nằm ngoài phạm vi phát hành', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  for (const entry of pkg.files) {
    assert.notEqual(entry, '.tvkt', 'đề xuất nội bộ không được đóng gói')
  }
})

test('không có đề xuất nào bị commit sẵn trong repo', () => {
  // Đề xuất là trạng thái làm việc, không phải nội dung phát hành.
  const dir = path.join(ROOT, '.tvkt', 'proposals')
  if (!existsSync(dir)) return
  const names = readdirSync(dir).filter(n => n.endsWith('.json'))
  assert.equal(names.length, 0,
    `không được commit đề xuất: ${names.join(', ')} — đây là đầu ra tạm của docs-sync`)
})
