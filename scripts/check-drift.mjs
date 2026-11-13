#!/usr/bin/env node
/**
 * So danh sách plugin của preset `tvkt-vi` với preset `standard` của bản DSH
 * đang cài. Một row trỏ module không còn tồn tại làm hỏng cả preset, nên chạy
 * sau mỗi lần nâng cấp DSH.
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

/** Lấy id các plugin trong khối `plugins:` của một tệp patch. */
function pluginIds(file) {
  const lines = readFileSync(file, 'utf8').split('\n')
  const start = lines.findIndex(l => /^\s{8}plugins:\s*$/.test(l))
  if (start < 0) throw new Error(`${file}: không thấy khối "plugins:"`)
  const ids = []
  for (const line of lines.slice(start + 1)) {
    const m = /^\s{10}- id:\s*(\S+)/.exec(line)
    if (m) { ids.push(m[1]); continue }
    if (line.trim() === '') continue
    if (/^\s{0,8}\S/.test(line)) break
  }
  return ids
}

/** Tìm standard.patch.yml trong các vị trí thường gặp. */
function locateStandard() {
  const home = process.env.DSH_HOME ?? path.join(process.env.HOME ?? '', '.dsh')
  const candidates = [
    process.argv[2],
    path.join(home, 'profiles/web/node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml'),
  ].filter(Boolean)

  try {
    const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
    candidates.push(path.join(root, '@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-web-app/presets/standard.patch.yml'))
  } catch { /* npm không có cũng không sao */ }

  return candidates.find(p => existsSync(p))
}

const standard = locateStandard()
if (!standard) {
  console.error('Không tìm thấy standard.patch.yml. Truyền đường dẫn trực tiếp:\n'
    + '  node scripts/check-drift.mjs /duong/dan/standard.patch.yml')
  process.exit(2)
}

const mine = pluginIds(path.join(PKG_ROOT, 'cordis.patch.yml'))
const theirs = pluginIds(standard)

const missing = theirs.filter(id => !mine.includes(id))
const extra = mine.filter(id => !theirs.includes(id))

console.log(`chuẩn : ${standard}`)
console.log(`tvkt  : ${mine.length} row · standard: ${theirs.length} row`)

if (missing.length === 0 && extra.length === 0) {
  console.log('OK: preset tvkt-vi khớp standard.')
  process.exit(0)
}

if (missing.length) {
  console.log(`\nTHIẾU ${missing.length} row (standard có, tvkt-vi không có):`)
  for (const id of missing) console.log(`  - ${id}`)
}
if (extra.length) {
  console.log(`\nTHỪA ${extra.length} row (tvkt-vi có, standard không có):`)
  for (const id of extra) console.log(`  + ${id}`)
}
console.log('\nSửa khối "plugins:" trong cordis.patch.yml cho khớp, rồi chạy lại.')
process.exit(1)
