#!/usr/bin/env node
/**
 * Gate phát hành: version đồng bộ, changelog có mục, tệp sinh không stale.
 *
 * Không publish, không tag, không tạo release. Chỉ kiểm tra điều kiện.
 *
 * Dùng:
 *   node scripts/check-release.mjs
 *
 * Mã thoát: 0 đủ điều kiện, 1 thiếu điều kiện.
 */
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_ROOT = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '')

/**
 * Chạy gate phát hành.
 * @returns `{ ok, problems, info }`.
 */
export function checkRelease() {
  const problems = []
  const info = {}

  const pkg = JSON.parse(readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'))
  info.version = pkg.version
  info.dshTarget = pkg.dshTarget

  // Metadata version trong lib/skill.js phải khớp package.json.
  const skillSource = readFileSync(path.join(PKG_ROOT, 'lib', 'skill.js'), 'utf8')
  const inCode = /metadata: \{ version: '([^']+)'/.exec(skillSource)?.[1]
  if (inCode === undefined) {
    problems.push('lib/skill.js không còn khai metadata.version ở dạng đọc được')
  } else if (inCode !== pkg.version) {
    problems.push(`lib/skill.js metadata.version=${inCode} khác package.json ${pkg.version}`)
  }

  // Frontmatter skill không mang version riêng, nhưng description phải còn khớp.
  const skillFile = path.join(PKG_ROOT, 'skills', 'tvkt-vi', 'SKILL.md')
  if (!existsSync(skillFile)) {
    problems.push('thiếu skills/tvkt-vi/SKILL.md')
  }

  // CHANGELOG phải có mục cho version hiện tại.
  const changelogFile = path.join(PKG_ROOT, 'CHANGELOG.md')
  if (!existsSync(changelogFile)) {
    problems.push('thiếu CHANGELOG.md')
  } else {
    const changelog = readFileSync(changelogFile, 'utf8')
    const hasEntry = changelog.includes(`## [${pkg.version}]`)
      || changelog.includes(`## ${pkg.version}`)
      || changelog.includes(`v${pkg.version}`)
    if (!hasEntry) problems.push(`CHANGELOG.md thiếu mục cho ${pkg.version}`)
  }

  // compatibility.md phải nêu version plugin và target.
  const compatFile = path.join(PKG_ROOT, 'docs', 'compatibility.md')
  if (!existsSync(compatFile)) {
    problems.push('thiếu docs/compatibility.md')
  } else {
    const compat = readFileSync(compatFile, 'utf8')
    if (!compat.includes(pkg.version)) problems.push(`docs/compatibility.md thiếu version ${pkg.version}`)
    if (!compat.includes(String(pkg.dshTarget))) problems.push('docs/compatibility.md thiếu dshTarget')
  }

  // Tệp sinh không được stale.
  try {
    execFileSync(process.execPath, [path.join(PKG_ROOT, 'scripts', 'gen-terms-quick.mjs'), '--check'],
      { encoding: 'utf8', stdio: 'pipe' })
  } catch {
    problems.push('skills/tvkt-vi/references/terms-quick.md stale — chạy npm run gen:terms')
  }

  return { ok: problems.length === 0, problems, info }
}

function main() {
  const result = checkRelease()
  if (result.ok) {
    console.log(`OK: đủ điều kiện phát hành ${result.info.version} trên DSH ${result.info.dshTarget}.`)
    console.log('Lưu ý: không publish, không tag. Cần người duyệt thủ công.')
    process.exit(0)
  }
  console.log(`RELEASE GATE: ${result.problems.length} điều kiện chưa đạt`)
  for (const problem of result.problems) console.log(`  ! ${problem}`)
  process.exit(1)
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main()
}
