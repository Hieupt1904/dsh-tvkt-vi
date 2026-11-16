#!/usr/bin/env node
/**
 * `docs-verify` — kiểm tra tài liệu và **không bao giờ sửa** chúng.
 *
 * Bốn kết luận tách biệt, không gộp thành một "PASS":
 *   - VERIFIED            : mọi kiểm tra khả dụng đều đạt.
 *   - DOC_DRIFT           : tài liệu lệch so với nguồn sự thật đã biết.
 *   - SPEC_CONFLICT       : code khác đặc tả. Đặc tả KHÔNG bị sửa.
 *   - NEEDS_HUMAN_REVIEW  : kiểm tra không kết luận được, hoặc có xung đột cần người.
 *
 * Điều kiện bảo đảm cứng:
 *   - Tệp dưới `specs/**` là protected: hàm này chỉ đọc, và trước/sau khi chạy nó
 *     tự so hash của mọi tệp spec. Lệch byte là lỗi nghiêm trọng của chính công cụ.
 *   - Kết quả deterministic: cùng đầu vào và cùng version thì cùng output, nên
 *     thứ tự mọi danh sách đều được sắp xếp tường minh.
 *
 * Dùng:
 *   node scripts/docs-verify.mjs [--json] [--changed-files <file>]
 *
 * Mã thoát: 0 VERIFIED, 1 có DOC_DRIFT hoặc SPEC_CONFLICT, 2 NEEDS_HUMAN_REVIEW
 * hoặc lỗi môi trường. Không mã nào có nghĩa "đã sửa xong".
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_ROOT = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '')
const CONFIG_FILE = path.join(PKG_ROOT, '.tvkt', 'config.json')
const LINTER = path.join(PKG_ROOT, 'vendor', 'tvkt', 'tools', 'tvkt_lint.py')

/** Kết luận của một lần verify. */
export const VERDICTS = ['VERIFIED', 'DOC_DRIFT', 'SPEC_CONFLICT', 'NEEDS_HUMAN_REVIEW']

/** Phạm vi mặc định khi dự án chưa có `.tvkt/config.json`. */
export const DEFAULT_CONFIG = {
  schemaVersion: 1,
  include: ['README.md', 'docs/**/*.md', 'skills/**/*.md'],
  exclude: ['docs/evidence/**'],
  protectedPaths: ['specs/**'],
  generatedPaths: ['skills/tvkt-vi/references/terms-quick.md'],
  changedFilesOnly: false,
  reviewMode: 'report',
  rulesetVersion: 'TVKT-100 v1.0',
}

/**
 * Khớp glob tối giản, đủ cho cấu hình của dự án.
 *
 * Hỗ trợ `**` (không giới hạn tầng), `*` (trong một tầng), và tiền tố thư mục.
 * Không hỗ trợ `?`, `{a,b}`, ký tự escape: gặp mẫu đó thì báo NEEDS_HUMAN_REVIEW
 * thay vì lặng lẽ khớp sai.
 * @param pattern - mẫu glob.
 * @param file - đường dẫn POSIX tương đối repo.
 * @returns true khi khớp.
 */
export function globMatch(pattern, file) {
  const escaped = pattern
    .split('')
    .map(ch => (ch === '*' || ch === '/' || ch === '.' || ch === '-' || ch === '_'
      || ch === '$' || ch === '^' ? ch : ch.replace(/[.+?^${}()|[\]\\]/g, '\\$&')))
    .join('')
  const regex = escaped
    .replace(/\*\*\//g, '\u0000')
    .replace(/\*\*/g, '\u0001')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '(?:.*/)?')
    .replace(/\u0001/g, '.*')
  return new RegExp(`^${regex}$`).test(file)
}

/**
 * Đọc cấu hình dự án; thiếu tệp thì dùng mặc định.
 * @returns `{ config, source, problems }`.
 */
export function loadConfig() {
  if (!existsSync(CONFIG_FILE)) {
    return { config: DEFAULT_CONFIG, source: 'default', problems: [] }
  }
  const problems = []
  let config
  try {
    config = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
  } catch (error) {
    return {
      config: DEFAULT_CONFIG,
      source: 'default',
      problems: [`không đọc được .tvkt/config.json: ${error.message}; dùng cấu hình mặc định`],
    }
  }
  if (config.schemaVersion !== 1) {
    problems.push(`schemaVersion=${config.schemaVersion} không được hỗ trợ (chỉ có 1)`)
  }
  for (const key of ['include', 'exclude', 'protectedPaths', 'generatedPaths']) {
    if (config[key] !== undefined && !Array.isArray(config[key])) {
      problems.push(`${key} phải là mảng`)
    }
  }
  const merged = { ...DEFAULT_CONFIG, ...config }
  for (const list of [merged.include, merged.exclude, merged.protectedPaths, merged.generatedPaths]) {
    for (const pattern of list) {
      if (/[?{}]/.test(pattern)) problems.push(`mẫu glob chưa hỗ trợ: ${pattern}`)
    }
  }
  return { config: merged, source: '.tvkt/config.json', problems }
}

/** Liệt kê tệp Markdown trong phạm vi, bỏ node_modules và .git. */
function listMarkdown(dir = PKG_ROOT, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue
    const full = path.join(dir, entry)
    const info = statSync(full)
    if (info.isDirectory()) {
      listMarkdown(full, out)
    } else if (entry.endsWith('.md')) {
      out.push(path.relative(PKG_ROOT, full).split(path.sep).join('/'))
    }
  }
  return out.sort()
}

/** Hash toàn bộ tệp spec, dùng để chứng minh chúng không bị chạm. */
export function specHashes(config) {
  const out = {}
  for (const file of listMarkdown()) {
    if (!config.protectedPaths.some(pattern => globMatch(pattern, file))) continue
    out[file] = createHash('sha256').update(readFileSync(path.join(PKG_ROOT, file))).digest('hex')
  }
  return out
}

/** Chạy linter trên một tệp, trả JSON. */
function lint(file) {
  const out = execFileSync('python3', [LINTER, file, '--format', 'json'], {
    cwd: PKG_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return JSON.parse(out)
}

/**
 * Kiểm tra chéo: mọi giá trị trong `package.json` mà tài liệu hay nhắc tới.
 * Chỉ so những thứ kiểm được máy móc; không suy luận ngữ nghĩa.
 * @returns mảng vấn đề DOC_DRIFT.
 */
export function checkCrossReferences(config) {
  const findings = []
  const pkg = JSON.parse(readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'))
  const compatFile = path.join(PKG_ROOT, 'docs', 'compatibility.md')
  if (existsSync(compatFile)) {
    const compat = readFileSync(compatFile, 'utf8')
    if (!compat.includes(pkg.version)) {
      findings.push({
        kind: 'DOC_DRIFT',
        file: 'docs/compatibility.md',
        detail: `không nêu version plugin ${pkg.version}`,
        evidence: 'package.json.version',
      })
    }
    if (!compat.includes(String(pkg.dshTarget))) {
      findings.push({
        kind: 'DOC_DRIFT',
        file: 'docs/compatibility.md',
        detail: `không nêu dshTarget ${pkg.dshTarget}`,
        evidence: 'package.json.dshTarget',
      })
    }
  }
  // Tệp sinh phải khớp đầu ra generator.
  try {
    execFileSync(process.execPath, [path.join(PKG_ROOT, 'scripts', 'gen-terms-quick.mjs'), '--check'],
      { encoding: 'utf8', stdio: 'pipe' })
  } catch {
    findings.push({
      kind: 'DOC_DRIFT',
      file: 'skills/tvkt-vi/references/terms-quick.md',
      detail: 'tệp sinh không khớp terms.json',
      evidence: 'node scripts/gen-terms-quick.mjs --check',
    })
  }
  void config
  return findings
}

/**
 * Chạy verify. Hàm này chỉ đọc; mọi ghi đều là lỗi của chính công cụ.
 * @param options - `{ changedFiles?, skipLint? }`.
 * @returns báo cáo có cấu trúc.
 */
export function verify({ changedFiles, skipLint = false } = {}) {
  const loaded = loadConfig()
  const config = loaded.config
  const problems = [...loaded.problems]

  const before = specHashes(config)

  const inScope = listMarkdown().filter(file => {
    if (config.exclude.some(pattern => globMatch(pattern, file))) return false
    if (changedFiles !== undefined && config.changedFilesOnly) {
      if (!changedFiles.includes(file)) return false
    }
    return config.include.some(pattern => globMatch(pattern, file))
  })

  const results = []
  for (const file of inScope) {
    const protectedFile = config.protectedPaths.some(pattern => globMatch(pattern, file))
    const generated = config.generatedPaths.some(pattern => globMatch(pattern, file))
    const entry = { file, protected: protectedFile, generated, checks: {} }

    if (protectedFile) {
      entry.checks.lint = 'SKIPPED_PROTECTED'
      entry.checks.terminology = 'SKIPPED_PROTECTED'
      entry.checks.protected_regions = 'SKIPPED_PROTECTED'
    } else if (skipLint) {
      entry.checks.lint = 'SKIPPED'
    } else {
      try {
        const result = lint(path.join(PKG_ROOT, file))
        entry.checks.lint = result.lint_status
        entry.checks.findings = result.summary
        entry.checks.protected_span_count = result.protected_spans.length
        entry.checks.semantic_review = result.semantic_review
      } catch (error) {
        entry.checks.lint = 'ERROR'
        problems.push(`linter lỗi trên ${file}: ${error.message}`)
      }
    }
    results.push(entry)
  }

  const after = specHashes(config)
  const specTouched = Object.keys(before).filter(file => before[file] !== after[file])
  if (specTouched.length > 0) {
    // Không bao giờ xảy ra trong thiết kế; nếu xảy ra thì đây là lỗi nghiêm trọng.
    problems.push(`LỖI NGHIÊM TRỌNG: tệp spec bị thay đổi trong lúc verify: ${specTouched.join(', ')}`)
  }

  const crossFindings = checkCrossReferences(config)
  // INFO của linter là thông tin (ví dụ L006 chưa viết hoa), không phải lý do
  // để đòi người duyệt. Chỉ WARNING và ERROR mới vào danh sách cần xem.
  const lintFindings = results
    .filter(entry => entry.checks.lint === 'FINDINGS'
      && ((entry.checks.findings?.WARNING ?? 0) > 0 || (entry.checks.findings?.ERROR ?? 0) > 0))
    .map(entry => ({
      kind: 'NEEDS_HUMAN_REVIEW',
      file: entry.file,
      detail: `linter báo ${JSON.stringify(entry.checks.findings)}`,
      evidence: 'rules L001-L007',
    }))

  // Kiểm tra code so với spec: nếu cả hai cùng tồn tại, không kết luận bên nào
  // đúng — chỉ báo xung đột để người quyết định.
  const specFiles = Object.keys(before)
  const hasSpec = specFiles.length > 0

  let verdict = 'VERIFIED'
  if (problems.length > 0 || lintFindings.length > 0) verdict = 'NEEDS_HUMAN_REVIEW'
  if (crossFindings.length > 0) verdict = 'DOC_DRIFT'
  if (hasSpec && changedFiles !== undefined && changedFiles.some(f => /^lib\/|^cordis\.patch\.yml$/.test(f))) {
    // Có thay đổi code và có đặc tả: không tự đối chiếu ngữ nghĩa.
    verdict = verdict === 'DOC_DRIFT' ? verdict : 'NEEDS_HUMAN_REVIEW'
    lintFindings.push({
      kind: 'SPEC_CONFLICT_CANDIDATE',
      file: specFiles.join(', '),
      detail: 'code thay đổi trong khi tồn tại đặc tả; cần người đối chiếu — đặc tả không bị sửa',
      evidence: 'specs/** protected',
    })
  }

  return {
    tool: 'docs-verify',
    mode: 'read-only',
    config: { source: loaded.source, schemaVersion: config.schemaVersion, rulesetVersion: config.rulesetVersion },
    verdict,
    scope: inScope,
    results,
    findings: [...crossFindings, ...lintFindings],
    spec_protection: {
      files: Object.keys(before),
      unchanged: specTouched.length === 0,
    },
    limitations: [
      'Chỉ kiểm phần deterministic: linter L001-L007, tệp sinh, tham chiếu chéo.',
      'Không kiểm tính đúng kỹ thuật của nội dung.',
      'Không đối chiếu ngữ nghĩa giữa đặc tả và code; phần đó cần người duyệt.',
      'Không sửa tệp nào.',
    ],
    writes: [],
  }
}

/** Mã thoát theo kết luận. */
export function exitCodeFor(verdict) {
  if (verdict === 'VERIFIED') return 0
  if (verdict === 'DOC_DRIFT' || verdict === 'SPEC_CONFLICT') return 1
  return 2
}

function main() {
  const argv = process.argv.slice(2)
  const json = argv.includes('--json')
  let changedFiles
  const flagIndex = argv.indexOf('--changed-files')
  if (flagIndex >= 0) {
    const file = argv[flagIndex + 1]
    if (file === undefined || !existsSync(file)) {
      console.error('LỖI: --changed-files cần đường dẫn tồn tại.')
      process.exit(2)
    }
    changedFiles = readFileSync(file, 'utf8').split('\n').map(l => l.trim()).filter(Boolean)
  }

  const report = verify({ changedFiles, skipLint: argv.includes('--skip-lint') })
  if (json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(`docs-verify: ${report.verdict}`)
    console.log(`  phạm vi: ${report.scope.length} tệp, cấu hình từ ${report.config.source}`)
    for (const entry of report.results) {
      console.log(`  ${entry.file}: lint=${entry.checks.lint}`)
    }
    for (const finding of report.findings) {
      console.log(`  ! ${finding.kind} ${finding.file}: ${finding.detail}`)
    }
    console.log(`  spec protected: ${report.spec_protection.files.length} tệp, `
      + `không đổi=${report.spec_protection.unchanged}`)
    console.log('Không ghi tệp nào.')
  }

  process.exit(exitCodeFor(report.verdict))
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main()
}
