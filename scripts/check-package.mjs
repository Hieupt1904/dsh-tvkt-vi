#!/usr/bin/env node
/**
 * Kiểm tra gói npm trước khi phát hành.
 *
 * Ba việc:
 *   1. `npm pack --dry-run` phải chứa đúng bộ tệp cần thiết và không chứa rác
 *      (`__pycache__`, `*.pyc`, tarball cũ, `node_modules`).
 *   2. Không tệp nào trong gói chứa đường dẫn tuyệt đối của máy phát triển.
 *   3. Không tệp nào trong gói chứa mẫu trông như bí mật.
 *
 * Không publish, không upload. Chỉ đọc.
 *
 * Dùng:
 *   node scripts/check-package.mjs
 *   node scripts/check-package.mjs --json
 *
 * Mã thoát: 0 sạch, 1 có vi phạm, 2 không chạy được npm.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_ROOT = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '')

/** Tệp bắt buộc phải có trong gói. */
export const REQUIRED = [
  'package.json',
  'cordis.patch.yml',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  'NOTICE',
  'icon.svg',
  'lib/index.js',
  'lib/contract.js',
  'lib/skill.js',
  'scripts/dsh-pins.mjs',
  'locale/en.json',
  'locale/zh.json',
  'skills/tvkt-vi/SKILL.md',
  'skills/tvkt-vi/references/terms-quick.md',
  'skills/tvkt-vi/scripts/lint-text.py',
  'vendor/tvkt/config/rules.json',
  'vendor/tvkt/config/terms.json',
  'vendor/tvkt/tools/tvkt_lint.py',
  'docs/compatibility.md',
  'docs/evidence/standard.patch.yml',
  'docs/evidence/ptc.patch.yml',
]

/** Mẫu tên tệp không được xuất hiện trong gói. */
export const FORBIDDEN_PATTERNS = [
  { pattern: /(^|\/)__pycache__\//, reason: 'bytecode Python không được phát hành' },
  { pattern: /\.pyc$/, reason: 'bytecode Python không được phát hành' },
  { pattern: /(^|\/)node_modules\//, reason: 'dependency không được đóng gói' },
  { pattern: /\.tgz$/, reason: 'tarball cũ không được nằm trong tarball mới' },
  { pattern: /(^|\/)(test|tests)\//, reason: 'test không nằm trong gói phát hành' },
  { pattern: /(^|\/)\.env/, reason: 'tệp môi trường không được phát hành' },
]

/** Mẫu nội dung không được xuất hiện. */
export const CONTENT_PATTERNS = [
  { pattern: /\/home\/[a-z][\w.-]*\//, reason: 'đường dẫn tuyệt đối Linux của máy phát triển' },
  { pattern: /C:\\\\Users\\\\/i, reason: 'đường dẫn tuyệt đối Windows' },
  { pattern: /\/Users\/[A-Za-z][\w.-]*\//, reason: 'đường dẫn tuyệt đối macOS' },
  { pattern: /\bsk-[A-Za-z0-9_-]{16,}/, reason: 'chuỗi giống API key' },
  { pattern: /\bsk-amr-[A-Za-z0-9_-]{8,}/, reason: 'chuỗi giống API key' },
  { pattern: /\buser_[A-Za-z0-9]{20,}/, reason: 'chuỗi giống token' },
  { pattern: /AKIA[0-9A-Z]{16}/, reason: 'chuỗi giống AWS access key' },
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, reason: 'private key' },
  { pattern: /(password|passwd|secret|token)\s*[:=]\s*['"][^'"\s]{12,}['"]/i, reason: 'giá trị giống bí mật' },
]

/** Tệp nhị phân, không quét nội dung. */
const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|zip|gz|tgz)$/i

/**
 * Lấy danh sách tệp mà npm sẽ đóng gói.
 * @returns `{ files: string[], size: number }`.
 */
export function packedFiles() {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: PKG_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const parsed = JSON.parse(out)
  const entry = Array.isArray(parsed) ? parsed[0] : parsed
  return {
    files: entry.files.map(f => f.path).sort(),
    size: entry.unpackedSize ?? entry.size ?? 0,
  }
}

/**
 * Kiểm tra gói và trả kết quả có cấu trúc.
 * @returns `{ ok, problems, files }`.
 */
export function checkPackage() {
  const problems = []
  let packed
  try {
    packed = packedFiles()
  } catch (error) {
    return { ok: false, problems: [`không chạy được npm pack --dry-run: ${error.message}`], files: [] }
  }

  const files = new Set(packed.files)
  for (const required of REQUIRED) {
    if (!files.has(required)) problems.push(`THIẾU trong gói: ${required}`)
  }
  for (const file of packed.files) {
    for (const rule of FORBIDDEN_PATTERNS) {
      if (rule.pattern.test(file)) problems.push(`KHÔNG ĐƯỢC đóng gói ${file} — ${rule.reason}`)
    }
  }
  for (const file of packed.files) {
    if (BINARY.test(file)) continue
    let text
    try {
      text = readFileSync(path.join(PKG_ROOT, file), 'utf8')
    } catch {
      continue
    }
    for (const rule of CONTENT_PATTERNS) {
      const match = rule.pattern.exec(text)
      if (match === null) continue
      const line = text.slice(0, match.index).split('\n').length
      // Không in giá trị khớp: chỉ in tên quy tắc và vị trí.
      problems.push(`${file}:${line} khớp mẫu "${rule.reason}"`)
    }
  }

  return { ok: problems.length === 0, problems, files: packed.files, size: packed.size }
}

function main() {
  const json = process.argv.includes('--json')
  const result = checkPackage()
  if (json) {
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.ok ? 0 : 1)
  }
  if (result.ok) {
    console.log(`OK: ${result.files.length} tệp, ${result.size} byte chưa nén, không có mẫu cấm.`)
    process.exit(0)
  }
  console.log(`PACKAGE: ${result.problems.length} vi phạm`)
  for (const problem of result.problems) console.log(`  ! ${problem}`)
  process.exit(1)
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main()
}
