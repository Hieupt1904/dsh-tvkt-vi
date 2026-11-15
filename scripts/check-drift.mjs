#!/usr/bin/env node
/**
 * So danh sách plugin của preset `tvkt-vi` với preset `standard` và `ptc` của
 * bản DSH đang cài. Một row trỏ module không còn tồn tại làm hỏng cả preset,
 * nên chạy sau mỗi lần nâng cấp DSH.
 *
 * Dùng:
 *   node scripts/check-drift.mjs
 *   node scripts/check-drift.mjs /path/to/standard.patch.yml
 *
 * Mã thoát: 0 khớp, 1 lệch, 2 không tìm thấy tệp chuẩn.
 */
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_ROOT = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '')

/**
 * Row cố ý thêm ngoài `standard`, kèm module phải khớp.
 * `tool-executor-ptc` lấy từ preset `ptc` — gọi nhiều tool trong một lượt.
 */
const INTENTIONAL_EXTRAS = new Map([
  ['tool-executor-ptc', '@deepseek-ai/dsh-tool-executor-ptc'],
])

/** Lấy cặp id → name trong khối `plugins:` của một tệp patch. */
function pluginRows(file) {
  const lines = readFileSync(file, 'utf8').split('\n')
  const start = lines.findIndex(l => /^\s{8}plugins:\s*$/.test(l))
  if (start < 0) throw new Error(`${file}: không thấy khối "plugins:"`)
  const rows = new Map()
  let current
  for (const line of lines.slice(start + 1)) {
    const id = /^\s{10}- id:\s*(\S+)/.exec(line)
    if (id) { current = id[1]; rows.set(current, undefined); continue }
    const name = /^\s{12}name:\s*['"]?([^'"\s]+)['"]?\s*$/.exec(line)
    if (name && current !== undefined && rows.get(current) === undefined) {
      rows.set(current, name[1])
      continue
    }
    if (line.trim() === '') continue
    if (/^\s{0,8}\S/.test(line)) break
  }
  return rows
}

/** Tìm patch của một preset trong bản cài DSH. */
function locatePreset(id) {
  if (id === 'standard' && process.argv[2]) return process.argv[2]
  const home = process.env.DSH_HOME ?? path.join(process.env.HOME ?? '', '.dsh')
  const candidates = [
    path.join(home, `profiles/web/node_modules/@deepseek-ai/dsh-web-app/presets/${id}.patch.yml`),
  ]
  try {
    const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
    candidates.push(path.join(root,
      `@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-web-app/presets/${id}.patch.yml`))
  } catch { /* npm không có cũng không sao */ }
  return candidates.find(p => existsSync(p))
}

const standardFile = locatePreset('standard')
const ptcFile = locatePreset('ptc')
if (!standardFile) {
  console.error('Không tìm thấy standard.patch.yml. Truyền đường dẫn trực tiếp:\n'
    + '  node scripts/check-drift.mjs /duong/dan/standard.patch.yml')
  process.exit(2)
}

const mine = pluginRows(path.join(PKG_ROOT, 'cordis.patch.yml'))
const standard = pluginRows(standardFile)
const ptc = ptcFile ? pluginRows(ptcFile) : new Map()

const problems = []

const missing = [...standard.keys()].filter(id => !mine.has(id))
if (missing.length) {
  problems.push(`THIẾU ${missing.length} row so với standard:\n`
    + missing.map(id => `  - ${id}`).join('\n'))
}

const extras = [...mine.keys()].filter(id => !standard.has(id))
const unexpected = extras.filter(id => !INTENTIONAL_EXTRAS.has(id))
if (unexpected.length) {
  problems.push(`THỪA ${unexpected.length} row không có trong danh sách cố ý:\n`
    + unexpected.map(id => `  + ${id}`).join('\n'))
}

for (const id of extras) {
  const expected = INTENTIONAL_EXTRAS.get(id)
  if (!expected) continue
  if (mine.get(id) !== expected) {
    problems.push(`SAI MODULE cho ${id}: cần ${expected}, đang là ${mine.get(id)}`)
  }
  if (ptc.size && !ptc.has(id)) {
    problems.push(`ROW ${id} không còn trong preset ptc của bản DSH này — xem lại có nên giữ`)
  }
}

const wrongNames = [...standard.entries()]
  .filter(([id, name]) => mine.has(id) && name && mine.get(id) !== name)
  .map(([id, name]) => `  ! ${id}: standard=${name} tvkt=${mine.get(id)}`)
if (wrongNames.length) problems.push(`LỆCH MODULE:\n${wrongNames.join('\n')}`)

console.log(`chuẩn : ${standardFile}`)
console.log(`tvkt  : ${mine.size} row · standard: ${standard.size} row · ptc: ${ptc.size} row`)
if (extras.length) console.log(`cố ý thêm: ${extras.join(', ')}`)

if (problems.length === 0) {
  console.log('OK: preset tvkt-vi khớp standard + phần thêm có chủ ý.')
  process.exit(0)
}
console.log('')
for (const p of problems) console.log(p)
console.log('\nSửa khối "plugins:" trong cordis.patch.yml cho khớp, rồi chạy lại.')
process.exit(1)
