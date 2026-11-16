#!/usr/bin/env node
/**
 * Kiểm tra drift cấu trúc giữa preset `tvkt-vi` và preset `standard` của DSH.
 *
 * Vì sao không so row id/module nữa: bản 0.4.0 chỉ so id và module, nên
 * `tool-fs` thiếu `config.applyPatch`, `skill-filesystem` thiếu
 * `config.customSkillDirs`, `tool-subagent-control` thiếu `config.interrupt`
 * — tất cả đều lọt. Một preset thiếu `customSkillDirs` vẫn "khớp" theo kiểm tra
 * cũ nhưng mất thư mục skill của `@deepseek-ai/dsh-agent-preset`.
 *
 * Cách làm hiện tại: parse YAML bằng `js-yaml` với thẻ `!!js` đúng ngữ nghĩa
 * `cordis-plugin-include` 0.2.2-rc.2 (`src/index.ts:16`), chuẩn hoá object rồi
 * deep compare toàn bộ cây `config.plugins` của preset.
 *
 * Nguồn chuẩn, theo thứ tự ưu tiên:
 *   1. `docs/evidence/standard.patch.yml` — bản sao nguyên gốc từ npm
 *      `@deepseek-ai/dsh-web-app@0.2.2-rc.2`, kèm sha256 trong `docs/compatibility.md`.
 *   2. `--standard <path>` — đường dẫn do người vận hành chỉ định.
 *   3. Bản cài đang chạy (fallback), kèm cảnh báo rằng bản cài có thể đã bị vá cục bộ.
 *
 * Khác biệt có chủ ý phải khai báo trong `INTENTIONAL_DIFFS`; mọi khác biệt khác
 * làm lệnh thoát với mã 1.
 *
 * Dùng:
 *   node scripts/check-drift.mjs
 *   node scripts/check-drift.mjs --standard /duong/dan/standard.patch.yml
 *   node scripts/check-drift.mjs --json
 *
 * Mã thoát: 0 không drift, 1 có drift ngoài allowlist, 2 không tìm thấy dữ liệu chuẩn.
 */
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import yamlModule from 'js-yaml'

const require = createRequire(import.meta.url)
const yaml = yamlModule

const PKG_ROOT = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '')
const MINE_FILE = path.join(PKG_ROOT, 'cordis.patch.yml')
const VENDORED_STANDARD = path.join(PKG_ROOT, 'docs', 'evidence', 'standard.patch.yml')
const VENDORED_PTC = path.join(PKG_ROOT, 'docs', 'evidence', 'ptc.patch.yml')

/** Thẻ `!!js` đúng như `cordis-plugin-include` 0.2.2-rc.2 dựng. */
const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
  kind: 'scalar',
  resolve: data => typeof data === 'string',
  construct: data => ({ __jsExpr: data }),
  predicate: value => isJsExpr(value),
  represent: data => data.__jsExpr,
})

/** Schema của entry list Cordis. */
const ENTRY_SCHEMA = yaml.JSON_SCHEMA.extend(JsExpr)

/** Đây có phải marker `!!js` không. */
export function isJsExpr(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && '__jsExpr' in value
}

/**
 * Đọc một tệp patch thành mảng entry.
 * @param file - đường dẫn tệp YAML.
 * @returns mảng entry đã parse.
 */
export function readPatch(file) {
  const text = readFileSync(file, 'utf8')
  const parsed = yaml.load(text, { schema: ENTRY_SCHEMA, filename: file })
  if (!Array.isArray(parsed)) throw new Error(`${file}: patch phải là một sequence`)
  // Patch bundle của DSH là danh sách thao tác (`- insert: [...]`), nên entry
  // thật nằm trong `insert`. Chấp nhận cả dạng entry phẳng để gọi trực tiếp được.
  const entries = []
  for (const op of parsed) {
    if (op !== null && typeof op === 'object' && Array.isArray(op.insert)) entries.push(...op.insert)
    else entries.push(op)
  }
  return entries
}

/**
 * Lấy mảng row `config.plugins` của preset trong một patch bundle.
 * @param entries - mảng entry của patch.
 * @param presetId - id preset cần lấy; bỏ trống thì lấy preset đầu tiên có `config.plugins`.
 * @returns mảng row plugin.
 */
export function presetRows(entries, presetId) {
  for (const entry of entries) {
    const rows = entry?.config?.plugins
    if (!Array.isArray(rows)) continue
    if (presetId === undefined || entry.config.id === presetId) return rows
  }
  throw new Error(`không tìm thấy preset${presetId === undefined ? '' : ` "${presetId}"`} có config.plugins`)
}

/**
 * Chuẩn hoá để so sánh: sắp xếp khóa, giữ nguyên mảng theo thứ tự.
 * `!!js` giữ nguyên văn biểu thức, đúng ngữ nghĩa runtime.
 * @param value - giá trị bất kỳ.
 * @returns cấu trúc đã chuẩn hoá.
 */
export function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize)
  if (isJsExpr(value)) return { __jsExpr: String(value.__jsExpr).trim() }
  if (value !== null && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort()) out[key] = normalize(value[key])
    return out
  }
  return value
}

/** Chuỗi mô tả ngắn cho một giá trị, dùng trong thông điệp diff. */
function describe(value) {
  if (value === undefined) return '(không có)'
  if (isJsExpr(value)) return `!!js ${value.__jsExpr}`
  return JSON.stringify(value)
}

/**
 * So đệ quy hai giá trị, trả về danh sách đường dẫn lệch.
 *
 * Đường dẫn có dạng `rows.tool-fs.config.applyPatch` để người đọc tìm đúng chỗ
 * trong `cordis.patch.yml` mà không phải đọc cả tệp.
 * @param expected - giá trị chuẩn từ upstream.
 * @param actual - giá trị trong preset của plugin.
 * @param base - tiền tố đường dẫn.
 * @param out - mảng nhận kết quả.
 */
export function diffTree(expected, actual, base, out = []) {
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      out.push({ path: base, expected: describe(expected), actual: describe(actual) })
      return out
    }
    const max = Math.max(expected.length, actual.length)
    for (let i = 0; i < max; i += 1) {
      diffTree(expected[i], actual[i], `${base}[${i}]`, out)
    }
    return out
  }
  if (isJsExpr(expected) || isJsExpr(actual)) {
    const left = isJsExpr(expected) ? String(expected.__jsExpr).trim() : undefined
    const right = isJsExpr(actual) ? String(actual.__jsExpr).trim() : undefined
    if (left !== right) out.push({ path: base, expected: describe(expected), actual: describe(actual) })
    return out
  }
  if (expected !== null && typeof expected === 'object'
    && actual !== null && typeof actual === 'object') {
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      diffTree(expected[key], actual[key], base === '' ? key : `${base}.${key}`, out)
    }
    return out
  }
  if (expected !== actual) out.push({ path: base, expected: describe(expected), actual: describe(actual) })
  return out
}

/**
 * Khác biệt có chủ ý so với `standard`.
 *
 * Mỗi mục phải nêu lý do; đây là allowlist hẹp theo đúng đường dẫn, không phải
 * "bỏ qua cả row". Thêm mục mới là thay đổi có ý thức, cần người duyệt.
 */
/** Khác biệt có nguồn gốc từ preset `ptc`; chỉ nhóm này mới bị đối chiếu ngược. */
export const PTC_SOURCED = ['rows.tool-executor-ptc']

export const INTENTIONAL_DIFFS = [
  {
    path: 'rows.persona.config.prefix',
    reason: 'Persona tiếng Việt của preset tvkt-vi thay câu mặc định của standard.',
  },
  {
    path: 'rows.tool-executor-ptc',
    reason: 'Row PTC lấy từ preset `ptc`: gọi nhiều tool trong một lượt. Đây là thay đổi ngữ nghĩa có chủ ý.',
  },
  {
    path: 'rows.tool-tvkt',
    reason: 'Row mount plugin gốc `dsh-tvkt-vi` để preset có tool tvkt_lint; không có trong standard.',
  },
]

/** Tập hợp hành vi của preset `ptc` mà plugin cố ý KHÔNG chép. */
export const PTC_NOT_ADOPTED = [
  'rows.tool-plugin-manager.disabled',
  'rows.delegation.config[3].disabled',
  'rows.delegation.config[4].disabled',
]

/**
 * Gom row theo `id` để so ổn định khi thứ tự đổi.
 * @param rows - mảng row.
 * @returns map id → row đã chuẩn hoá.
 */
export function indexRows(rows) {
  const out = {}
  for (const row of rows) {
    if (row === null || typeof row !== 'object' || row.id === undefined) {
      throw new Error(`row thiếu id: ${JSON.stringify(row).slice(0, 120)}`)
    }
    out[row.id] = normalize(row)
  }
  return out
}

/** Tìm bản cài DSH đang chạy, dùng làm nguồn fallback. */
function installedPreset(name) {
  const home = process.env.DSH_HOME ?? path.join(process.env.HOME ?? '', '.dsh')
  const candidates = []
  try {
    const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
    candidates.push(path.join(root,
      `@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-web-app/presets/${name}.patch.yml`))
  } catch { /* npm không có cũng không sao */ }
  candidates.push(path.join(home,
    `profiles/web/node_modules/@deepseek-ai/dsh-web-app/presets/${name}.patch.yml`))
  return candidates.find(file => existsSync(file))
}

/** Đọc tham số dòng lệnh. */
function parseArgs(argv) {
  const flags = { json: false, standard: undefined, ptc: undefined }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--json') flags.json = true
    else if (arg === '--standard') { flags.standard = argv[i + 1]; i += 1 }
    else if (arg === '--ptc') { flags.ptc = argv[i + 1]; i += 1 }
    else if (arg === '--help' || arg === '-h') flags.help = true
  }
  return flags
}

/**
 * Chạy so sánh và trả kết quả có cấu trúc.
 * @param options - nguồn standard/ptc và cờ json.
 * @returns `{ exitCode, report }`.
 */
export function checkDrift({ standard, ptc, source } = {}) {
  const standardFile = standard ?? VENDORED_STANDARD
  if (!existsSync(standardFile)) {
    return {
      exitCode: 2,
      report: { error: `không tìm thấy standard.patch.yml: ${standardFile}` },
    }
  }
  const ptcFile = ptc ?? VENDORED_PTC

  const standardRows = indexRows(presetRows(readPatch(standardFile), 'standard'))
  const mineRows = indexRows(presetRows(readPatch(MINE_FILE), 'tvkt-vi'))

  const diffs = []
  for (const id of Object.keys(standardRows)) {
    if (!(id in mineRows)) {
      diffs.push({ path: `rows.${id}`, expected: '(có)', actual: '(thiếu row)' })
      continue
    }
    diffs.push(...diffTree(standardRows[id], mineRows[id], `rows.${id}`))
  }
  for (const id of Object.keys(mineRows)) {
    if (!(id in standardRows)) {
      diffs.push({ path: `rows.${id}`, expected: '(không có)', actual: '(thừa row)' })
    }
  }

  const allowed = new Set(INTENTIONAL_DIFFS.map(item => item.path))
  const isAllowed = diffPath => [...allowed].some(prefix =>
    diffPath === prefix || diffPath.startsWith(`${prefix}.`) || diffPath.startsWith(`${prefix}[`))

  const unexpected = diffs.filter(d => !isAllowed(d.path))
  const accepted = diffs.filter(d => isAllowed(d.path))

  // Đối chiếu row PTC: row `tool-executor-ptc` phải còn tồn tại trong preset ptc,
  // nếu không thì việc chép nó vào preset tvkt-vi là hành vi chết.
  const ptcNote = []
  if (existsSync(ptcFile)) {
    const ptcRows = indexRows(presetRows(readPatch(ptcFile), 'ptc'))
    // Chỉ đối chiếu ngược những row thật sự chép từ `ptc`. Row do plugin tự
    // thêm (`tool-tvkt`) không có nguồn gốc ở đó nên không thuộc phép kiểm này.
    for (const path of PTC_SOURCED) {
      const match = /^rows\.([\w-]+)$/.exec(path)
      if (match === null) continue
      const id = match[1]
      if (id in mineRows && !(id in ptcRows)) {
        ptcNote.push(`row ${id} không còn trong ptc.patch.yml của target — nguồn gốc của nó đã biến mất`)
      }
    }
  }

  const report = {
    standard: { file: standardFile, source: source ?? (standardFile === VENDORED_STANDARD ? 'vendored' : 'external'), rows: Object.keys(standardRows).length },
    mine: { file: MINE_FILE, rows: Object.keys(mineRows).length },
    intentional: INTENTIONAL_DIFFS,
    accepted,
    unexpected,
    ptcNotAdopted: PTC_NOT_ADOPTED,
    notes: ptcNote,
    ok: unexpected.length === 0 && ptcNote.length === 0,
  }
  return { exitCode: report.ok ? 0 : 1, report }
}

function main() {
  const flags = parseArgs(process.argv.slice(2))
  if (flags.help) {
    console.log(`Dùng: node scripts/check-drift.mjs [--standard <file>] [--ptc <file>] [--json]

So toàn bộ cấu trúc preset tvkt-vi với preset standard của DSH target.
Khác biệt có chủ ý phải khai báo trong INTENTIONAL_DIFFS.`)
    process.exit(0)
  }

  let standardSource
  let standardPath = flags.standard
  if (standardPath === undefined) {
    if (existsSync(VENDORED_STANDARD)) {
      standardSource = 'vendored'
    } else {
      standardPath = installedPreset('standard')
      standardSource = 'installed (có thể đã bị vá cục bộ)'
      if (standardPath === undefined) {
        console.error('Không tìm thấy standard.patch.yml. Truyền đường dẫn trực tiếp:\n'
          + '  node scripts/check-drift.mjs --standard /duong/dan/standard.patch.yml')
        process.exit(2)
      }
    }
  }

  const { exitCode, report } = checkDrift({
    standard: standardPath ?? VENDORED_STANDARD,
    ptc: flags.ptc,
    source: standardSource,
  })

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2))
    process.exit(exitCode)
  }

  if (report.error) {
    console.error(report.error)
    process.exit(exitCode)
  }

  console.log(`chuẩn : ${report.standard.file} (${report.standard.source})`)
  console.log(`tvkt  : ${report.mine.rows} row · standard: ${report.standard.rows} row`)
  if (report.accepted.length > 0) {
    console.log(`khác biệt có chủ ý: ${report.accepted.length} đường dẫn`)
    for (const item of report.accepted) {
      const reason = INTENTIONAL_DIFFS.find(d => item.path === d.path
        || item.path.startsWith(`${d.path}.`) || item.path.startsWith(`${d.path}[`))?.reason
      console.log(`  = ${item.path}${reason ? ` — ${reason}` : ''}`)
    }
  }

  if (report.ok) {
    console.log('OK: cấu trúc preset khớp standard cộng đúng các khác biệt đã khai báo.')
    process.exit(0)
  }

  console.log('')
  if (report.unexpected.length > 0) {
    console.log(`DRIFT ${report.unexpected.length} đường dẫn ngoài allowlist:`)
    for (const item of report.unexpected) {
      console.log(`  ! ${item.path}`)
      console.log(`      standard: ${item.expected}`)
      console.log(`      tvkt    : ${item.actual}`)
    }
  }
  for (const note of report.notes) console.log(`  ? ${note}`)
  console.log('\nSửa "config.plugins" trong cordis.patch.yml cho khớp upstream, hoặc khai báo'
    + ' khác biệt có chủ ý trong INTENTIONAL_DIFFS kèm lý do.')
  process.exit(1)
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main()
}
