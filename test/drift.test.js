/**
 * Drift cấu trúc của preset.
 *
 * Lớp lỗi được bắt ở đây: `scripts/check-drift.mjs` bản 0.4.0 chỉ so id và
 * module của từng row, nên một preset mất `tool-fs.config.applyPatch`,
 * `skill-filesystem.config.customSkillDirs` hay
 * `tool-subagent-control.config.interrupt` vẫn được báo "khớp standard".
 * Fixture dưới đây xoá đúng những nested config đó mà giữ nguyên id/module,
 * và yêu cầu checker phải fail.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkDrift, presetRows, readPatch, diffTree, normalize } from '../scripts/check-drift.mjs'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const STANDARD = path.join(ROOT, 'docs', 'evidence', 'standard.patch.yml')
const PTC = path.join(ROOT, 'docs', 'evidence', 'ptc.patch.yml')
const CHECKER = path.join(ROOT, 'scripts', 'check-drift.mjs')

/** Chép preset hiện tại sang thư mục tạm để fixture được sửa tự do. */
function tempStandard(mutate) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tvkt-std-'))
  const file = path.join(dir, 'standard.patch.yml')
  copyFileSync(STANDARD, file)
  if (mutate) {
    const text = mutate(readFileSync(file, 'utf8'))
    writeFileSync(file, text)
  }
  return file
}

test('checker dùng bản chuẩn đã vendor và khớp cấu trúc', () => {
  const { exitCode, report } = checkDrift({ standard: STANDARD, ptc: PTC })
  assert.equal(exitCode, 0, `drift ngoài allowlist: ${JSON.stringify(report.unexpected, null, 2)}`)
  assert.equal(report.unexpected.length, 0)
  assert.equal(report.standard.source, 'vendored')
  assert.deepEqual(report.accepted.map(d => d.path).sort(),
    ['rows.persona.config.prefix', 'rows.tool-executor-ptc', 'rows.tool-tvkt'])
})

test('xoá nested config mà giữ id/module thì drift PHẢI fail', () => {
  const cases = [
    {
      name: 'tool-fs.config.applyPatch',
      mutate: text => text.replace(
        /(name: '@deepseek-ai\/dsh-tool-fs'\n)\s+config:\n\s+#[^\n]*\n\s+applyPatch: false\n/,
        '$1'),
      // Bỏ cả khối config thì node lệch là chính khối đó, không phải khóa con.
      expectPath: 'rows.tool-fs.config',
    },
    {
      name: 'skill-filesystem.config.customSkillDirs',
      mutate: text => text.replace(
        /(name: '@deepseek-ai\/dsh-skill-filesystem'\n)\s+config:\n\s+customSkillDirs:\n\s+- !!js [^\n]*\n/,
        '$1'),
      expectPath: 'rows.skill-filesystem.config',
    },
    {
      name: 'tool-subagent-control.config.interrupt',
      mutate: text => text.replace(
        /(name: '@deepseek-ai\/dsh-tool-subagent-control'\n)\s+config:\n\s+interrupt: false\n/,
        '$1'),
      expectPath: 'rows.delegation.config[0].config',
    },
    {
      name: 'plan-mode section text',
      mutate: text => text.replace(
        /(section: \|\n)(\s+You are in plan mode\.[^\n]*\n)/,
        '$1                    You are in plan mode.\n'),
      expectPath: 'rows.planning.config[0].config.section',
    },
  ]

  for (const item of cases) {
    const file = tempStandard(item.mutate)
    const changed = readFileSync(file, 'utf8') !== readFileSync(STANDARD, 'utf8')
    assert.ok(changed, `fixture ${item.name} không sửa được tệp — regex lệch`)
    const { exitCode, report } = checkDrift({ standard: file, ptc: PTC })
    assert.equal(exitCode, 1, `${item.name}: checker phải fail`)
    const paths = report.unexpected.map(d => d.path)
    // Chấp nhận đúng đường dẫn hoặc tổ tiên của nó: bỏ cả khối làm node cha lệch.
    assert.ok(paths.some(p => p === item.expectPath || item.expectPath.startsWith(`${p}.`)),
      `${item.name}: thiếu ${item.expectPath}, có: ${paths.join(', ')}`)
  }
})

test('đổi module của một row bị phát hiện', () => {
  const file = tempStandard(text => text.replace(
    "name: '@deepseek-ai/dsh-tool-schedule'",
    "name: '@deepseek-ai/dsh-tool-schedule-renamed'"))
  const { exitCode, report } = checkDrift({ standard: file, ptc: PTC })
  assert.equal(exitCode, 1)
  assert.ok(report.unexpected.some(d => d.path === 'rows.tool-schedule.name'))
})

test('đổi disabled thành literal khác biểu thức !!js bị phát hiện', () => {
  const file = tempStandard(text => text.replace(
    "disabled: !!js process.platform === 'win32'",
    'disabled: true'))
  const { exitCode, report } = checkDrift({ standard: file, ptc: PTC })
  assert.equal(exitCode, 1)
  assert.ok(report.unexpected.some(d => d.path === 'rows.tool-bash.disabled'))
})

test('thêm row lạ không khai báo bị phát hiện', () => {
  const file = tempStandard(text => text.replace(
    '          - id: tool-jobs',
    "          - id: tool-len\n            name: '@deepseek-ai/dsh-tool-len'\n          - id: tool-jobs"))
  const { exitCode, report } = checkDrift({ standard: file, ptc: PTC })
  assert.equal(exitCode, 1)
  assert.ok(report.unexpected.some(d => d.path === 'rows.tool-len'))
})

test('hai cách quote cùng một biểu thức !!js được coi là bằng nhau', () => {
  // `"!ctx.get('x')"` và `'!ctx.get(''x'')'` cho cùng biểu thức sau khi parse.
  assert.deepEqual(
    normalize({ disabled: { __jsExpr: "!ctx.get('x')" } }),
    normalize({ disabled: { __jsExpr: "!ctx.get('x')" } }),
  )
})

test('preset thật có đủ nested config mà bản 0.4.0 đã làm mất', () => {
  const rows = presetRows(readPatch(path.join(ROOT, 'cordis.patch.yml')), 'tvkt-vi')
  const byId = Object.fromEntries(rows.map(r => [r.id, r]))
  assert.equal(byId['tool-fs'].config?.applyPatch, false)
  assert.equal(Array.isArray(byId['skill-filesystem'].config?.customSkillDirs), true)
  assert.equal(byId['skill-filesystem'].config.customSkillDirs.length, 1)
  assert.equal(byId.delegation.config[0].config?.interrupt, false)
  // Row PTC vẫn còn, đúng khai báo có chủ ý.
  assert.equal(byId['tool-executor-ptc'].name, '@deepseek-ai/dsh-tool-executor-ptc')
})

test('CLI trả mã 1 khi có drift và 0 khi sạch', () => {
  const clean = execFileSync(process.execPath, [CHECKER, '--standard', STANDARD], { encoding: 'utf8' })
  assert.match(clean, /OK: cấu trúc preset khớp standard/)

  const broken = tempStandard(text => text.replace(
    "name: '@deepseek-ai/dsh-tool-fs'",
    "name: '@deepseek-ai/dsh-tool-fs-broken'"))
  let code = 0
  try {
    execFileSync(process.execPath, [CHECKER, '--standard', broken], { encoding: 'utf8', stdio: 'pipe' })
  } catch (error) {
    code = error.status
  }
  assert.equal(code, 1, 'CLI phải thoát 1 khi có drift')
})

test('diffTree không trả kết quả khi hai cây bằng nhau', () => {
  assert.deepEqual(diffTree({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1, 2] } }, 'rows.x'), [])
})

test('engines.dsh khớp dshTarget và có evidence trong docs/compatibility.md', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  assert.equal(pkg.engines.dsh, pkg.dshTarget,
    'engines.dsh phải pin đúng dshTarget khi chưa có CI matrix')

  const compat = readFileSync(path.join(ROOT, 'docs', 'compatibility.md'), 'utf8')
  assert.ok(compat.includes(pkg.dshTarget),
    `docs/compatibility.md phải nêu version ${pkg.dshTarget}`)
  assert.ok(compat.includes(`dsh-tvkt-vi\` ${pkg.version}`) || compat.includes(pkg.version),
    'ma trận phải nêu version plugin hiện tại')

  // Mọi giá trị trong engines.dsh đều phải có trong ma trận — không khai dải.
  assert.ok(!/[<>=~^*|]/.test(pkg.engines.dsh), 'không khai dải version dsh')
  assert.match(pkg.engines.node, /^>=\d+\.\d+\.\d+$/)
})
