/**
 * Bất biến canonical fact của `docs-verify`.
 *
 * Vì sao có tệp này: README 0.5.0 từng nêu `0.4.0`, `Node ≥ 18` và dải DSH cũ
 * trong khi `package.json` đã là `0.5.0`, `>=24.9.0`, `0.2.2-rc.2`. `docs:verify`
 * vẫn kết luận VERIFIED, nên drift không ai bắt. Mỗi ca dưới đây khoá một kiểu
 * drift đó lại, và khoá cả chiều ngược: câu kể lịch sử không được bắt oan.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  checkCanonicalFacts,
  claimsRepoPrivate,
  claimsRepoPublic,
  duplicateH2,
  parseVersionTuple,
  stripFencedCode,
  tupleAtLeast,
} from '../scripts/docs-verify.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))

/** `package.json` hiện hành, dùng làm nguồn sự thật. */
const PKG = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

const NL = String.fromCharCode(10)
const FENCE = String.fromCharCode(96, 96, 96)
const TICK = String.fromCharCode(96)

/** README tối thiểu nhưng đúng mọi canonical fact. */
function cleanReadme(pkg = PKG) {
  const floor = String(pkg.engines.node).replace(/^>=\s*/, '')
  return [
    '# dsh-tvkt-vi',
    '',
    '## Cài từ npm',
    '',
    'Version trong gói: ' + TICK + pkg.version + TICK + ' (chưa chắc trùng ' + TICK + 'latest' + TICK + ' của npm).',
    '',
    'Profile ghi ' + TICK + '^' + pkg.version + TICK + ' và mount bundle ngay.',
    '',
    '## Hợp đồng bundle',
    '',
    '| Dải DSH hỗ trợ | ' + TICK + 'engines.dsh: "' + pkg.engines.dsh + '"' + TICK + ' |',
    '',
    '## Cài sang máy khác',
    '',
    'Máy đích cần: ' + TICK + 'dsh' + TICK + ' đã cài, Node ≥ ' + floor + ', ' + TICK + 'python3' + TICK + ' cho linter.',
    '',
  ].join(NL)
}

/** `docs/compatibility.md` tối thiểu nhưng đúng. */
function cleanCompat(pkg = PKG) {
  return [
    '# Ma trận',
    '',
    '| Plugin | DSH |',
    '|---|---|',
    '| `dsh-tvkt-vi` ' + TICK + pkg.version + TICK + ' | ' + TICK + pkg.engines.dsh + TICK + ' |',
    '',
    'Target: ' + TICK + pkg.dshTarget + TICK,
    '',
  ].join(NL)
}

/** Chạy kiểm và trả về các detail của DOC_DRIFT. */
function driftDetails(readme, { pkg = PKG, compat = cleanCompat(pkg) } = {}) {
  return checkCanonicalFacts({ pkg, readme, compat }).map(finding => finding.detail)
}

test('README sạch: không có DOC_DRIFT', () => {
  const findings = checkCanonicalFacts({
    pkg: PKG, readme: cleanReadme(), compat: cleanCompat(),
  })
  assert.deepEqual(findings, [])
})

test('version registry cũ bị bắt thành DOC_DRIFT', () => {
  const readme = cleanReadme().replace(TICK + PKG.version + TICK, TICK + '0.4.0' + TICK)
  const details = driftDetails(readme)
  assert.ok(details.some(d => d.includes('0.4.0')), 'phải bắt version cũ: ' + JSON.stringify(details))
  const findings = checkCanonicalFacts({ pkg: PKG, readme, compat: cleanCompat() })
  assert.equal(findings[0].kind, 'DOC_DRIFT')
  assert.equal(findings[0].evidence, 'package.json.version')
})

test('sàn Node cũ bị bắt, sàn mới hơn thì không', () => {
  const old = cleanReadme().replace(/Node ≥ [0-9.]+/, 'Node ≥ 18')
  assert.ok(driftDetails(old).some(d => d.includes('Node ≥ 18')), 'phải bắt Node ≥ 18')
  const newer = cleanReadme().replace(/Node ≥ [0-9.]+/, 'Node ≥ 25.1.0')
  assert.deepEqual(driftDetails(newer), [], 'sàn cao hơn package.json là hợp lệ')
})

test('dải DSH cũ bị bắt', () => {
  const readme = cleanReadme().replace(
    'engines.dsh: "' + PKG.engines.dsh + '"',
    'engines.dsh: ">=0.2.0-rc.1 <0.3.0-0"')
  const details = driftDetails(readme)
  assert.ok(details.some(d => d.includes('>=0.2.0-rc.1')),
    'phải bắt dải cũ: ' + JSON.stringify(details))
})

test('mục H2 trùng tên bị bắt', () => {
  const readme = cleanReadme()
    + NL + '## Cài sang máy khác' + NL + NL + 'Cài một lần, sau đó DSH tự kéo cập nhật.' + NL
  const details = driftDetails(readme)
  assert.ok(details.some(d => d.includes('Cài sang máy khác')),
    'phải bắt mục trùng: ' + JSON.stringify(details))
})

test('version lịch sử trong câu kể chuyện không bị bắt oan', () => {
  const readme = cleanReadme()
    + NL + 'Đã mô phỏng bằng ' + TICK + 'npm install github:Hieupt1904/dsh-tvkt-vi' + TICK + ' ra 0.3.0.' + NL
    + NL + 'Bản 0.2.1 và 0.3.0 dùng dải cũ; lịch sử đó nằm ở CHANGELOG.' + NL
  assert.deepEqual(driftDetails(readme), [],
    'số version trong câu lịch sử không phải canonical fact')
})

test('CHANGELOG lặp mục theo version là hợp lệ', () => {
  const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8')
  assert.ok(changelog.includes('## [0.4.0]'), 'CHANGELOG phải còn mục lịch sử')
  assert.deepEqual(duplicateH2(changelog), [],
    'CHANGELOG không phải tài liệu hiện hành nên không áp chính sách một bản')
})

test('public và private cùng lúc bị bắt; câu điều kiện thì không', () => {
  const contradictory = cleanReadme()
    + NL + 'Repo đã public, có topic ' + TICK + 'dsh-plugin' + TICK + '.' + NL
    + NL + 'Repro **private**, nên máy đích phải có quyền đọc.' + NL
  assert.ok(driftDetails(contradictory).some(d => d.includes('public')), 'phải bắt mâu thuẫn')

  const conditional = cleanReadme()
    + NL + 'Repo đã public, có topic ' + TICK + 'dsh-plugin' + TICK + '.' + NL
    + NL + 'Repo private thì bước này trả 404 và không có thông báo nào.' + NL
  assert.deepEqual(driftDetails(conditional), [],
    'câu điều kiện không phải tuyên bố trạng thái')
  assert.equal(claimsRepoPrivate('Repo private thì bước này trả 404.'), false)
  assert.equal(claimsRepoPrivate('Repro **private**, nên máy đích cần quyền đọc.'), true)
  assert.equal(claimsRepoPublic('Repo đã public, có topic ' + TICK + 'dsh-plugin' + TICK + '.'), true)
  assert.equal(claimsRepoPublic('repo phải giữ public.'), false, 'yêu cầu, không phải tuyên bố')
})

test('dải mở trong engines.dsh bị bắt', () => {
  const pkg = { ...PKG, engines: { ...PKG.engines, dsh: '>=0.2.0-rc.1 <0.3.0-0' } }
  const details = driftDetails(cleanReadme(pkg), { pkg, compat: cleanCompat(pkg) })
  assert.ok(details.some(d => d.includes('dải mở')), JSON.stringify(details))
})

test('dshTarget không phải phần tử cuối của tập pin bị bắt', () => {
  const pkg = { ...PKG, dshTarget: '0.2.2-rc.2' }
  const details = driftDetails(cleanReadme(pkg), { pkg, compat: cleanCompat(pkg) })
  assert.ok(details.some(d => d.includes('phần tử cuối')), JSON.stringify(details))
})

test('tập pin xếp lộn thứ tự bị bắt', () => {
  const pkg = {
    ...PKG,
    engines: { ...PKG.engines, dsh: '0.2.2-rc.5 || 0.2.2-rc.2' },
    dshTarget: '0.2.2-rc.2',
  }
  const details = driftDetails(cleanReadme(pkg), { pkg, compat: cleanCompat(pkg) })
  assert.ok(details.some(d => d.includes('tăng dần')), JSON.stringify(details))
})

test('compatibility thiếu version hoặc engines.dsh bị bắt', () => {
  const stale = driftDetails(cleanReadme(), { compat: '# Ma trận' + NL + NL + 'Chưa nêu gì.' + NL })
  assert.ok(stale.some(d => d.includes(PKG.version)), 'phải bắt thiếu version')
  assert.ok(stale.some(d => d.includes(PKG.engines.dsh)), 'phải bắt thiếu engines.dsh')
})

test('mục H2 nằm trong khối code không bị đếm', () => {
  const text = [
    '# Tài liệu',
    '',
    FENCE + 'text',
    '## Cài sang máy khác',
    '## Cài sang máy khác',
    FENCE,
    '',
    '## Cài sang máy khác',
    '',
    'Nội dung.',
  ].join(NL)
  assert.deepEqual(duplicateH2(text), [])
  assert.ok(!stripFencedCode(text).includes('## Cài sang máy khác' + NL + '## Cài sang máy khác'))
})

test('parseVersionTuple và tupleAtLeast so sánh đúng', () => {
  assert.deepEqual(parseVersionTuple('24.9.0'), [24, 9, 0])
  assert.deepEqual(parseVersionTuple('18'), [18, 0, 0])
  assert.equal(parseVersionTuple('24.9.0-rc.1'), undefined)
  assert.equal(tupleAtLeast([24, 9, 0], [24, 9, 0]), true)
  assert.equal(tupleAtLeast([24, 10, 0], [24, 9, 0]), true)
  assert.equal(tupleAtLeast([18, 0, 0], [24, 9, 0]), false)
  assert.equal(tupleAtLeast([24, 8, 9], [24, 9, 0]), false)
})

test('README và compatibility thật của repo phải qua mọi bất biến', () => {
  const findings = checkCanonicalFacts({
    pkg: PKG,
    readme: readFileSync(path.join(ROOT, 'README.md'), 'utf8'),
    compat: readFileSync(path.join(ROOT, 'docs', 'compatibility.md'), 'utf8'),
  })
  assert.deepEqual(findings, [],
    'README/compatibility đang lệch package.json: ' + JSON.stringify(findings, null, 1))
})

test('README thật chỉ có một bản mỗi mục H2 hiện hành', () => {
  const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8')
  assert.deepEqual(duplicateH2(readme), [])
})
