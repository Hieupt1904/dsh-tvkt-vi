#!/usr/bin/env node
/**
 * Compatibility smoke chạy trên ĐÚNG target đã pin, không mock DSH.
 *
 * Vì sao cần: test unit dựng `fakeContext` nên không chứng minh được gì về hợp
 * đồng thật của host. Script này boot các service thật của target
 * (`SystemPrompt`, `SkillRegistry`, `ToolsService`, executor native), mount
 * package đang kiểm, rồi kiểm từng điểm trong acceptance criteria.
 *
 * Bố cục mô phỏng đúng profile thật: package nằm ở
 * `<tmp>/node_modules/<tên gói>`, và mọi gói `@deepseek-ai/*` của bản cài được
 * symlink cạnh đó. Nhờ vậy `import('@deepseek-ai/dsh-tools')` bên trong plugin
 * phân giải được như trên máy người dùng.
 *
 * Không gọi model, không gọi mạng, không tốn token.
 *
 * Dùng:
 *   node scripts/compat-smoke.mjs
 *   node scripts/compat-smoke.mjs --json
 *   DSH_INSTALL_MODULES=<...> node scripts/compat-smoke.mjs
 *
 * Mã thoát: 0 mọi kiểm đạt, 1 có kiểm không đạt, 2 thiếu môi trường.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { dshPinsInclude } from './dsh-pins.mjs'

const PKG_ROOT = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '')

/** Thư mục chứa các gói con của bản cài DSH. */
export function resolveInstallModules(explicit) {
  const roots = []
  if (explicit !== undefined) roots.push(explicit)
  if (process.env.DSH_INSTALL_MODULES !== undefined) roots.push(process.env.DSH_INSTALL_MODULES)
  try {
    roots.push(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim())
  } catch { /* npm không có thì bỏ qua */ }

  // Ba bố cục cùng tồn tại, và mỗi bố cục cần một đường dẫn khác:
  //   - npm toàn cục: `<root>/@deepseek-ai/dsh/node_modules`
  //   - cài cục bộ hoisted: `<root>/@deepseek-ai/*` (root đã là thư mục gói)
  //   - cài cục bộ lồng nhau: `<root>/node_modules`
  // Thử lần lượt thay vì đoán, và chỉ nhận thư mục thật sự có cả cordis lẫn
  // dsh-tools, vì đó mới là điều kiện plugin phân giải được.
  const candidates = []
  for (const root of roots) {
    candidates.push(path.join(root, '@deepseek-ai', 'dsh', 'node_modules'))
    candidates.push(root)
    candidates.push(path.join(root, 'node_modules'))
  }

  for (const candidate of candidates) {
    if (existsSync(path.join(candidate, '@deepseek-ai', 'cordis', 'lib', 'index.js'))
      && existsSync(path.join(candidate, '@deepseek-ai', 'dsh-tools', 'lib', 'index.js'))) {
      return candidate
    }
  }
  return undefined
}

/** Version của bản cài DSH chứa `modules`. */
function installedDshVersion(modules) {
  for (const candidate of [
    path.join(modules, '..', 'package.json'),
    path.join(modules, '@deepseek-ai', 'dsh', 'package.json'),
  ]) {
    if (!existsSync(candidate)) continue
    try {
      const pkg = JSON.parse(readFileSync(candidate, 'utf8'))
      if (pkg.name === '@deepseek-ai/dsh') return pkg.version
    } catch { /* thử đường khác */ }
  }
  return undefined
}

/** Chờ một nhịp để Cordis chạy xong hiệu ứng của plugin. */
function settle(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Dựng cây cài tạm: package đang kiểm cộng mọi gói `@deepseek-ai/*` của bản cài.
 * @param modules - thư mục node_modules của bản cài DSH.
 * @param pkg - `package.json` của package đang kiểm.
 * @returns đường dẫn gốc cây tạm.
 */
export function buildHarness(modules, pkg) {
  const root = mkdtempSync(path.join(tmpdir(), 'dsh-compat-'))
  const nodeModules = path.join(root, 'node_modules')
  mkdirSync(path.join(nodeModules, '@deepseek-ai'), { recursive: true })

  const scope = path.join(modules, '@deepseek-ai')
  for (const name of readdirSync(scope)) {
    symlinkSync(path.join(scope, name), path.join(nodeModules, '@deepseek-ai', name), 'dir')
  }

  cpSync(PKG_ROOT, path.join(nodeModules, pkg.name), {
    recursive: true,
    filter: source => !source.includes('/.git/')
      && !source.includes('/node_modules/')
      && !source.endsWith('.tgz')
      && !source.endsWith('/.git'),
  })
  return root
}

/**
 * Mỗi row của preset phải trỏ tới module có thật trong bản cài.
 *
 * Đây đúng là kiểu hỏng mà README cảnh báo: một row trỏ module đã bị đổi tên làm
 * cả preset không load được, và lỗi chỉ lộ lúc người dùng mở mode.
 * @param modules - thư mục node_modules của bản cài DSH.
 * @param pkg - `package.json` của package đang kiểm.
 * @returns danh sách row không phân giải được.
 */
export function unresolvedBundleRows(modules, pkg) {
  const yaml = readFileSync(path.join(PKG_ROOT, 'cordis.patch.yml'), 'utf8')
  const names = [...yaml.matchAll(/^\s+name:\s*['"]?([^'"\s]+)['"]?\s*$/gm)].map(match => match[1])
  const missing = []
  for (const name of new Set(names)) {
    if (name === 'cordis:group') continue
    if (name === pkg.name) continue
    const bare = name.split('/tools')[0]
    const target = path.join(modules, ...bare.split('/'))
    if (!existsSync(target)) missing.push(name)
  }
  return missing
}

/**
 * Chạy toàn bộ smoke.
 * @param options - `{ modules, timeoutMs }`.
 * @returns báo cáo có cấu trúc; `ok` chỉ true khi mọi kiểm đạt.
 */
export async function runCompatSmoke({ modules, timeoutMs = 60_000 } = {}) {
  const pkg = JSON.parse(readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'))
  const checks = []
  const record = (id, ok, detail) => checks.push({ id, ok, detail })

  if (modules === undefined) {
    return { ok: false, verdict: 'ENVIRONMENT_MISSING', checks, pkg }
  }

  const installed = installedDshVersion(modules)
  record('target-version', dshPinsInclude(pkg.engines?.dsh, installed),
    `bản cài ${installed ?? '(không đọc được)'} · engines.dsh ${pkg.engines?.dsh}`)

  const missingRows = unresolvedBundleRows(modules, pkg)
  record('bundle-row-resolution', missingRows.length === 0,
    missingRows.length === 0 ? 'mọi row của preset phân giải được' : `row không có module: ${missingRows.join(', ')}`)

  const harness = buildHarness(modules, pkg)
  const timer = setTimeout(() => {}, 0)
  timer.unref?.()
  try {
    const load = async relative => import(pathToFileURL(path.join(harness, 'node_modules', ...relative.split('/'))).href)
    const { Context } = await load('@deepseek-ai/cordis/lib/index.js')
    const { default: SystemPrompt } = await load('@deepseek-ai/dsh-system-prompt/lib/index.js')
    const { default: SkillRegistry } = await load('@deepseek-ai/dsh-skill/lib/index.js')
    const { default: ToolsService } = await load('@deepseek-ai/dsh-tools/lib/index.js')
    const nativeExecutor = await load('@deepseek-ai/dsh-tool-executor-native/lib/index.js')

    const ctx = new Context()
    ctx.plugin(SystemPrompt)
    ctx.plugin(SkillRegistry)
    ctx.plugin(ToolsService)
    ctx.plugin(nativeExecutor)
    await settle(150)

    const plugin = await import(pathToFileURL(
      path.join(harness, 'node_modules', pkg.name, 'lib', 'index.js')).href)
    const fiber = ctx.plugin(plugin)
    await settle(400)

    const systemPrompt = ctx.get('systemPrompt')
    const skills = ctx.get('skills')
    const tools = ctx.get('tools')
    record('services-available', systemPrompt !== undefined && skills !== undefined && tools !== undefined,
      'systemPrompt · skills · tools')

    const assembly = await systemPrompt.assemble({})
    const sectionNames = assembly.sections.map(section => section.name)
    const sectionName = 'tvkt-vi:language-contract'
    const occurrences = sectionNames.filter(name => name === sectionName).length
    record('prompt-section-once', occurrences === 1, `section "${sectionName}" xuất hiện ${occurrences} lần`)

    const prefixIndex = sectionNames.indexOf('deployment:persona-prefix')
    const suffixIndex = sectionNames.indexOf('deployment:persona-suffix')
    const mineIndex = sectionNames.indexOf(sectionName)
    record('prompt-section-order',
      mineIndex > prefixIndex && mineIndex < suffixIndex,
      `vị trí ${mineIndex} giữa persona-prefix ${prefixIndex} và persona-suffix ${suffixIndex}`)

    const catalog = await skills.list({})
    const skillEntries = catalog.filter(entry => entry.name === 'tvkt-vi')
    record('skill-provider-once', skillEntries.length === 1,
      `catalog có ${skillEntries.length} entry tvkt-vi (provider ${skillEntries[0]?.provider ?? '-'})`)

    const loaded = await skills.get('tvkt-vi', {})
    record('skill-loads', typeof loaded?.content === 'string' && loaded.content.length > 1000,
      `thân skill ${loaded?.content?.length ?? 0} ký tự`)

    const lintDefs = tools.definitions().filter(definition => definition.name === 'tvkt_lint')
    record('tool-registered-once', lintDefs.length === 1,
      `registry có ${lintDefs.length} tool tvkt_lint`)

    const signal = new AbortController().signal
    if (lintDefs.length === 1) {
      const findingRun = await lintDefs[0].execute({ text: 'Hệ thống tiến hành kiểm tra.' }, { signal })
      const firstFinding = findingRun.findings?.[0]
      record('lint-reports-finding',
        findingRun.lint_status === 'FINDINGS' && firstFinding?.rule_id === 'L001'
          && firstFinding?.severity === 'WARNING',
        `${findingRun.lint_status} · ${firstFinding?.rule_id ?? '-'} ${firstFinding?.severity ?? '-'}`)

      const cleanRun = await lintDefs[0].execute({ text: 'Hệ thống kiểm tra dữ liệu.' }, { signal })
      record('lint-passes-clean-text',
        cleanRun.lint_status === 'PASS' && cleanRun.summary.error === 0 && cleanRun.summary.warning === 0,
        `${cleanRun.lint_status} · ERROR=${cleanRun.summary.error} WARNING=${cleanRun.summary.warning}`)
    } else {
      record('lint-reports-finding', false, 'không có tool để gọi')
      record('lint-passes-clean-text', false, 'không có tool để gọi')
    }

    await fiber.dispose()
    await settle(300)
    const afterAssembly = await systemPrompt.assemble({})
    const sectionAfter = afterAssembly.sections.filter(section => section.name === sectionName).length
    const toolsAfter = tools.definitions().length
    const skillsAfter = (await skills.list({})).filter(entry => entry.name === 'tvkt-vi').length
    record('dispose-removes-registrations',
      sectionAfter === 0 && toolsAfter === 0 && skillsAfter === 0,
      `còn lại: section=${sectionAfter} tool=${toolsAfter} skill=${skillsAfter}`)
  } finally {
    rmSync(harness, { recursive: true, force: true })
    clearTimeout(timer)
  }

  const failed = checks.filter(check => !check.ok)
  return {
    ok: failed.length === 0,
    verdict: failed.length === 0 ? 'VERIFIED' : 'COMPAT_FAILURE',
    pkg: { name: pkg.name, version: pkg.version, dshTarget: pkg.dshTarget, dsh: pkg.engines?.dsh, node: pkg.engines?.node },
    runtime: { dsh: installed, node: process.version, python: pythonVersion() },
    checks,
  }
}

/** Version Python dùng cho linter, nếu máy có. */
function pythonVersion() {
  try {
    return execFileSync(process.env.TVKT_PYTHON ?? 'python3', ['-c', 'import sys; print(sys.version.split()[0])'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return undefined
  }
}

/**
 * Mức kiểm chứng của smoke này, để tài liệu không nói quá.
 * @returns mô tả ngắn.
 */
export function smokeScope() {
  return [
    'Boot service thật của target: SystemPrompt, SkillRegistry, ToolsService, executor native.',
    'Mount module plugin của package, không mount qua CLI dsh.',
    'Không chạy model, không gọi mạng.',
    'Không kiểm profile end-to-end qua dsh web.',
  ]
}

async function main() {
  const modules = resolveInstallModules()
  const report = await runCompatSmoke({ modules })
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(`compat-smoke: ${report.verdict}`)
    if (report.runtime !== undefined) {
      console.log(`  runtime: dsh ${report.runtime.dsh} · node ${report.runtime.node} · python ${report.runtime.python ?? 'không có'}`)
    }
    for (const check of report.checks) {
      console.log(`  ${check.ok ? 'ok  ' : 'FAIL'} ${check.id}: ${check.detail}`)
    }
    for (const line of smokeScope()) console.log(`  phạm vi: ${line}`)
  }
  process.exit(report.ok ? 0 : (report.verdict === 'ENVIRONMENT_MISSING' ? 2 : 1))
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main()
}
