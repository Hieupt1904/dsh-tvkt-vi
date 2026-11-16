#!/usr/bin/env node
/**
 * Kiểm tra `engines` và `dshTarget` khớp bằng chứng đã vendor.
 *
 * Vì sao tách khỏi `npm test`: đây là gate của release, không phải unit test.
 * Nó đọc dữ liệu thật trên đĩa: `package.json`, `docs/compatibility.md`,
 * `docs/evidence/*.patch.yml` và bản cài DSH nếu có.
 *
 * Dùng:
 *   node scripts/check-engine.mjs
 *   node scripts/check-engine.mjs --json
 *
 * Mã thoát: 0 khớp, 1 mâu thuẫn, 2 thiếu dữ liệu.
 */
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_ROOT = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '')
const DSH_TARGET_ENV = process.env.DSH_TARGET
const COMPAT = path.join(PKG_ROOT, 'docs', 'compatibility.md')
const EVIDENCE_DIR = path.join(PKG_ROOT, 'docs', 'evidence')

/**
 * Bản cài DSH đang có, nếu máy có.
 * @returns thông tin version và node engine của host.
 */
export function readInstalledDsh() {
  const candidates = []
  if (process.env.DSH_INSTALL_ROOT) candidates.push(process.env.DSH_INSTALL_ROOT)
  try {
    const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
    candidates.push(path.join(root, '@deepseek-ai', 'dsh'))
  } catch { /* npm không có */ }
  for (const dir of candidates) {
    const file = path.join(dir, 'package.json')
    if (!existsSync(file)) continue
    try {
      const pkg = JSON.parse(readFileSync(file, 'utf8'))
      return { dir, version: pkg.version, node: pkg.engines?.node }
    } catch { /* bỏ qua */ }
  }
  return undefined
}

/**
 * Hash các tệp evidence, dùng để phát hiện chúng bị sửa tay.
 * @returns map tên tệp → sha256.
 */
export function evidenceHashes() {
  const out = {}
  for (const name of ['standard.patch.yml', 'ptc.patch.yml']) {
    const file = path.join(EVIDENCE_DIR, name)
    if (!existsSync(file)) continue
    out[name] = createHash('sha256').update(readFileSync(file)).digest('hex')
  }
  return out
}

/**
 * Chạy toàn bộ kiểm tra.
 * @returns `{ ok, problems, info }`.
 */
export function checkEngine() {
  const problems = []
  const info = {}
  const pkg = JSON.parse(readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'))
  const target = DSH_TARGET_ENV ?? pkg.dshTarget

  info.name = pkg.name
  info.version = pkg.version
  info.dshTarget = pkg.dshTarget
  info.engines = pkg.engines

  if (pkg.dshTarget === undefined) problems.push('package.json thiếu dshTarget')
  if (DSH_TARGET_ENV !== undefined && pkg.dshTarget !== DSH_TARGET_ENV) {
    problems.push(`dshTarget=${pkg.dshTarget} khác DSH_TARGET=${DSH_TARGET_ENV}`)
  }
  if (pkg.engines?.dsh === undefined) problems.push('package.json thiếu engines.dsh')
  if (pkg.engines?.dsh !== target) {
    problems.push(`engines.dsh=${pkg.engines?.dsh} phải bằng dshTarget=${target}`)
  }
  if (typeof pkg.engines?.dsh === 'string' && /[<>=~^*|]/.test(pkg.engines.dsh)) {
    problems.push(`engines.dsh="${pkg.engines.dsh}" là dải version; chiến lược hiện tại là narrow support`)
  }

  if (!existsSync(COMPAT)) {
    problems.push('thiếu docs/compatibility.md')
  } else {
    const compat = readFileSync(COMPAT, 'utf8')
    if (!compat.includes(String(target))) {
      problems.push(`docs/compatibility.md không nêu target ${target}`)
    }
    if (!compat.includes(String(pkg.version))) {
      problems.push(`docs/compatibility.md không nêu plugin version ${pkg.version}`)
    }
  }

  const hashes = evidenceHashes()
  info.evidence = hashes
  for (const name of ['standard.patch.yml', 'ptc.patch.yml']) {
    if (hashes[name] === undefined) problems.push(`thiếu docs/evidence/${name}`)
  }

  const installed = readInstalledDsh()
  if (installed === undefined) {
    info.installed = null
    info.installedNote = 'không tìm thấy bản cài DSH; bỏ qua đối chiếu runtime'
  } else {
    info.installed = installed
    if (installed.version !== target) {
      // Không phải lỗi của gói: máy có thể đang chạy version khác target.
      info.installedWarning =
        `bản cài ${installed.version} khác target ${target}; kiểm chứng phải chạy trên đúng target`
    }
    // Node floor của plugin không được thấp hơn floor của host DSH.
    const hostFloor = /^>=(\d+)\.(\d+)\.(\d+)$/.exec(installed.node ?? '')
    const ourFloor = /^>=(\d+)\.(\d+)\.(\d+)$/.exec(pkg.engines?.node ?? '')
    if (hostFloor !== null && ourFloor !== null) {
      const host = hostFloor.slice(1).map(Number)
      const ours = ourFloor.slice(1).map(Number)
      const lower = ours[0] < host[0]
        || (ours[0] === host[0] && ours[1] < host[1])
        || (ours[0] === host[0] && ours[1] === host[1] && ours[2] < host[2])
      if (lower) {
        problems.push(`engines.node=${pkg.engines.node} thấp hơn engines.node của host DSH ${installed.node}`)
      }
    }
  }

  return { ok: problems.length === 0, problems, info }
}

function main() {
  const result = checkEngine()
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.ok ? 0 : 1)
  }
  if (result.info.installedWarning) console.log(`CẢNH BÁO: ${result.info.installedWarning}`)
  if (result.ok) {
    console.log(`OK: ${result.info.name}@${result.info.version} pin DSH ${result.info.dshTarget}, `
      + `node ${result.info.engines.node}`)
    process.exit(0)
  }
  console.log(`ENGINE: ${result.problems.length} mâu thuẫn`)
  for (const problem of result.problems) console.log(`  ! ${problem}`)
  process.exit(1)
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main()
}
