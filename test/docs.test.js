/**
 * `docs-impact` và `docs-verify`.
 *
 * Bất biến quan trọng nhất ở đây: đặc tả là nguồn, không phải đích. Một ca kiểm
 * thử cố tình tạo xung đột code/spec và chứng minh **không byte nào của spec bị
 * đổi**, kể cả khi verify kết luận có xung đột.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, cpSync, rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { impact, classify, IMPACT_RULES, PROTECTED_PATHS } from '../scripts/docs-impact.mjs'
import { verify, exitCodeFor, globMatch, DEFAULT_CONFIG } from '../scripts/docs-verify.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))

const hasPython = (() => {
  try {
    execFileSync('python3', ['--version'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
})()

test('docs-impact: tệp code ánh xạ tới tài liệu kèm bằng chứng', () => {
  const report = impact(['lib/tool.js'])
  assert.equal(report.mode, 'read-only')
  assert.deepEqual(report.writes, [])
  const docs = report.candidates.map(c => c.doc)
  assert.ok(docs.includes('README.md'))
  assert.ok(docs.includes('docs/compatibility.md'))
  for (const candidate of report.candidates) {
    for (const source of candidate.sources) {
      assert.equal(source.source, 'lib/tool.js')
      assert.ok(source.evidence.length > 0, 'mỗi ánh xạ phải có bằng chứng')
      assert.ok(source.reason.length > 0)
    }
  }
})

test('docs-impact: tệp không có bản đồ được đánh dấu NEEDS_HUMAN_REVIEW, không đoán', () => {
  const report = impact(['scripts/hoan-toan-moi.mjs'])
  assert.deepEqual(report.candidates, [])
  assert.deepEqual(report.unmapped, ['scripts/hoan-toan-moi.mjs'])
  assert.ok(report.needs_human_review.length > 0)
})

test('docs-impact: spec là protected, không bao giờ là đích sửa', () => {
  const report = impact(['specs/api-xuat-bao-cao.md'])
  assert.ok(PROTECTED_PATHS.some(p => p.test('specs/api-xuat-bao-cao.md')))
  const spec = report.candidates.find(c => c.doc === 'specs/api-xuat-bao-cao.md')
  assert.ok(spec, 'spec phải xuất hiện trong báo cáo')
  assert.equal(spec.protected, true)
  assert.match(spec.sources[0].reason, /Không sửa đặc tả/)
})

test('docs-impact: mọi rule đều có id, bằng chứng và lý do', () => {
  for (const rule of IMPACT_RULES) {
    assert.ok(rule.id)
    assert.ok(rule.evidence)
    assert.ok(rule.reason)
    assert.ok(rule.source instanceof RegExp)
    assert.ok(Array.isArray(rule.docs))
  }
})

test('classify trả rỗng cho tệp ngoài bản đồ', () => {
  assert.deepEqual(classify('LICENSE'), [])
})

test('docs-verify: chạy trên repo thật và không ghi tệp', () => {
  const before = snapshotTree()
  const report = verify({})
  const after = snapshotTree()
  assert.deepEqual(after, before, 'docs-verify không được thay đổi bất kỳ tệp nào')
  assert.deepEqual(report.writes, [])
  assert.equal(report.mode, 'read-only')
  assert.ok(['VERIFIED', 'DOC_DRIFT', 'NEEDS_HUMAN_REVIEW'].includes(report.verdict))
  assert.equal(report.spec_protection.unchanged, true)
})

test('docs-verify: deterministic với cùng đầu vào', () => {
  const first = verify({ skipLint: true })
  const second = verify({ skipLint: true })
  assert.deepEqual(first, second, 'hai lần chạy phải cho cùng kết quả')
})

test('docs-verify: exit code phản ánh verdict', () => {
  assert.equal(exitCodeFor('VERIFIED'), 0)
  assert.equal(exitCodeFor('DOC_DRIFT'), 1)
  assert.equal(exitCodeFor('SPEC_CONFLICT'), 1)
  assert.equal(exitCodeFor('NEEDS_HUMAN_REVIEW'), 2)
})

test('globMatch: ** và * hoạt động đúng phạm vi', () => {
  assert.equal(globMatch('README.md', 'README.md'), true)
  assert.equal(globMatch('README.md', 'docs/README.md'), false)
  assert.equal(globMatch('docs/**/*.md', 'docs/DETAIL.md'), true)
  assert.equal(globMatch('docs/**/*.md', 'docs/sub/deep.md'), true)
  assert.equal(globMatch('docs/**/*.md', 'docs/DETAIL.zh.md'), true)
  assert.equal(globMatch('docs/**/*.md', 'README.md'), false)
  assert.equal(globMatch('specs/**', 'specs/a/b.md'), true)
  assert.equal(globMatch('skills/*.md', 'skills/a.md'), true)
  assert.equal(globMatch('skills/*.md', 'skills/sub/a.md'), false)
})

test('docs-verify: linter lỗi không bị báo thành VERIFIED', () => {
  // skipLint=false trên repo thật: nếu linter lỗi, problems phải có.
  const report = verify({ skipLint: false })
  const lintErrors = report.results.filter(r => r.checks.lint === 'ERROR')
  if (lintErrors.length > 0) {
    assert.notEqual(report.verdict, 'VERIFIED', 'linter lỗi không được coi là VERIFIED')
  }
})

test('docs-verify: INFO của linter không tự động đòi người duyệt', () => {
  const report = verify({})
  for (const finding of report.findings) {
    if (finding.kind !== 'NEEDS_HUMAN_REVIEW') continue
    assert.match(finding.detail, /WARNING=[1-9]|ERROR=[1-9]|: \{"ERROR":0,"WARNING":[1-9]/,
      `finding chỉ có INFO không được vào danh sách cần duyệt: ${finding.detail}`)
  }
})

/** Hash toàn bộ cây (bỏ node_modules/.git) để chứng minh không ghi. */
function snapshotTree(dir = ROOT, out = {}) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue
    const full = path.join(dir, entry)
    const info = statSync(full)
    const rel = path.relative(ROOT, full).split(path.sep).join('/')
    if (info.isDirectory()) snapshotTree(full, out)
    else out[rel] = createHash('sha256').update(readFileSync(full)).digest('hex')
  }
  return out
}

test('xung đột code/spec không làm đổi một byte đặc tả', { skip: hasPython ? false : 'không có python3' }, () => {
  // Dựng một bản sao repo tối thiểu trong tmp để không đụng repo thật.
  const sandbox = mkdtempSync(path.join(tmpdir(), 'tvkt-docs-'))
  try {
    const needed = [
      'package.json', 'cordis.patch.yml', 'README.md', 'CHANGELOG.md',
      'lib', 'skills', 'vendor', 'scripts', 'docs',
    ]
    for (const entry of needed) {
      const from = path.join(ROOT, entry)
      const to = path.join(sandbox, entry)
      try {
        cpSync(from, to, { recursive: true })
      } catch {
        // Tệp không bắt buộc thì bỏ qua.
      }
    }
    mkdirSync(path.join(sandbox, 'specs'), { recursive: true })
    const specFile = path.join(sandbox, 'specs', 'api-xuat-bao-cao.md')
    const specText = [
      '# Đặc tả API xuất báo cáo',
      '',
      'Endpoint `POST /v1/reports/export` trả về `202 Accepted`.',
      'Trường `report_id` là mã định danh duy nhất.',
      '',
    ].join('\n')
    writeFileSync(specFile, specText)
    const specHashBefore = createHash('sha256').update(readFileSync(specFile)).digest('hex')

    // Cấu hình coi specs/** là protected.
    mkdirSync(path.join(sandbox, '.tvkt'), { recursive: true })
    writeFileSync(path.join(sandbox, '.tvkt', 'config.json'), JSON.stringify({
      schemaVersion: 1,
      include: ['README.md', 'docs/**/*.md', 'skills/**/*.md', 'specs/**/*.md'],
      exclude: ['docs/evidence/**'],
      protectedPaths: ['specs/**'],
      generatedPaths: ['skills/tvkt-vi/references/terms-quick.md'],
      changedFilesOnly: false,
      reviewMode: 'report',
      rulesetVersion: 'TVKT-100 v1.0',
    }, null, 2))

    // Chạy verify với danh sách thay đổi có code và spec. Verdict
    // NEEDS_HUMAN_REVIEW thoát mã 2 nên execFileSync sẽ ném — output vẫn có trên
    // stdout, phải đọc từ lỗi.
    let outJson
    try {
      outJson = execFileSync(process.execPath, [
        path.join(sandbox, 'scripts', 'docs-verify.mjs'),
        '--json',
        '--skip-lint',
        '--changed-files', writeChanged(path.join(sandbox, 'changed.txt'), ['lib/tool.js', 'specs/api-xuat-bao-cao.md']),
      ], { cwd: sandbox, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      outJson = error.stdout
      assert.ok([1, 2].includes(error.status), `exit code lạ: ${error.status}`)
    }
    const report = JSON.parse(outJson)

    // Đặc tả không được đổi một byte.
    const specHashAfter = createHash('sha256').update(readFileSync(specFile)).digest('hex')
    assert.equal(specHashAfter, specHashBefore, 'đặc tả bị thay đổi — vi phạm bất biến')
    assert.equal(readFileSync(specFile, 'utf8'), specText)
    assert.deepEqual(report.writes, [])

    // Spec phải được nhận là protected và bị bỏ qua kiểm tra nội dung.
    const specEntry = report.results.find(r => r.file === 'specs/api-xuat-bao-cao.md')
    assert.ok(specEntry, 'spec phải nằm trong phạm vi')
    assert.equal(specEntry.protected, true)
    assert.equal(specEntry.checks.lint, 'SKIPPED_PROTECTED')
    assert.equal(report.spec_protection.unchanged, true)
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
})

/** Ghi danh sách tệp thay đổi ra tệp, trả đường dẫn. */
function writeChanged(file, files) {
  writeFileSync(file, files.join('\n') + '\n')
  return file
}

test('cấu hình mặc định coi specs/** là protected', () => {
  assert.ok(DEFAULT_CONFIG.protectedPaths.some(p => globMatch(p, 'specs/x.md')))
  assert.equal(DEFAULT_CONFIG.reviewMode, 'report')
})
