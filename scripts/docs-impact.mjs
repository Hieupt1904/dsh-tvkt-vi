#!/usr/bin/env node
/**
 * `docs-impact` — chỉ đọc. Nhận diff code/config/API, trả về tài liệu có thể bị
 * ảnh hưởng kèm bằng chứng ánh xạ. Không sửa tệp nào.
 *
 * Vì sao cần bước này: sửa code rồi sửa tài liệu theo cảm tính là cách tạo
 * DOC_DRIFT. Bước impact chỉ nêu *ứng viên* và *vì sao*; nó không khẳng định tài
 * liệu nào sai, và không đề xuất nội dung mới.
 *
 * Đầu vào: danh sách tệp thay đổi (từ `git diff --name-only` hoặc tệp văn bản).
 * Đầu ra: mỗi tệp tài liệu kèm liên kết tới tệp nguồn đã gây ra nó, cùng mức tin
 * cậy và lý do. Không có bằng chứng thì ghi `NEEDS_HUMAN_REVIEW`, không đoán.
 *
 * Dùng:
 *   node scripts/docs-impact.mjs --changed-files changed.txt [--json]
 *   git diff --name-only main...HEAD | node scripts/docs-impact.mjs --stdin
 *
 * Mã thoát: 0 luôn, trừ 2 khi thiếu đầu vào. Đây là công cụ đọc.
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_ROOT = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '')

/**
 * Bản đồ ảnh hưởng: mẫu tệp nguồn → tài liệu phải xem lại, kèm lý do.
 *
 * `evidence` là tên trường thật trong nguồn, để người đọc tự kiểm lại thay vì
 * tin vào bảng này.
 */
export const IMPACT_RULES = [
  {
    id: 'contract-text',
    source: /^lib\/contract\.js$/,
    docs: ['README.md', 'docs/DETAIL.md', 'skills/tvkt-vi/SKILL.md'],
    evidence: 'CONTRACT_TEXT, SECTION_NAME, SECTION_ORDER',
    reason: 'Nội dung prompt và thứ tự section hiển thị trong mô tả tính năng.',
  },
  {
    id: 'skill-metadata',
    source: /^lib\/skill\.js$/,
    docs: ['README.md', 'docs/DETAIL.md', 'skills/tvkt-vi/SKILL.md'],
    evidence: 'SKILL_NAME, SKILL_DESCRIPTION, SKILL_RANK, skillCandidate()',
    reason: 'Tên, mô tả và hạng ưu tiên của skill là nội dung người dùng đọc.',
  },
  {
    id: 'tool-api',
    source: /^lib\/(tool|tool-register)\.js$/,
    docs: ['README.md', 'docs/DETAIL.md', 'docs/compatibility.md'],
    evidence: 'TOOL_NAME, toolOptions(), ERROR_CODES, giới hạn kích thước và timeout',
    reason: 'Tool model-facing là giao diện mới; mô tả phải khớp tham số và phạm vi.',
  },
  {
    id: 'preset',
    source: /^cordis\.patch\.yml$/,
    docs: ['README.md', 'docs/compatibility.md', 'docs/DETAIL.md'],
    evidence: 'config.plugins của preset tvkt-vi',
    reason: 'Tập tool của preset là hành vi người dùng thấy được.',
  },
  {
    id: 'engines',
    source: /^package\.json$/,
    docs: ['docs/compatibility.md', 'README.md'],
    evidence: 'engines.dsh, engines.node, dshTarget',
    reason: 'Ma trận tương thích và hướng dẫn cài phụ thuộc các trường này.',
  },
  {
    id: 'dictionary',
    source: /^vendor\/tvkt\/config\/(terms|rules)\.json$/,
    docs: ['skills/tvkt-vi/references/terms-quick.md', 'README.md', 'docs/DETAIL.md'],
    evidence: 'terms[].status, discouraged_phrases, các ngưỡng trong rules.json',
    reason: 'Từ điển là nguồn sự thật của bảng thuật ngữ và của linter.',
  },
  {
    id: 'linter',
    source: /^vendor\/tvkt\/tools\/tvkt_lint\.py$|^skills\/tvkt-vi\/scripts\/lint-text\.py$/,
    docs: ['docs/DETAIL.md', 'skills/tvkt-vi/SKILL.md', 'README.md'],
    evidence: 'schema_version, rules_executed, lint_status, protected_spans',
    reason: 'Hợp đồng output của linter là thứ tài liệu mô tả.',
  },
  {
    id: 'drift-checker',
    source: /^scripts\/check-drift\.mjs$|^docs\/evidence\//,
    docs: ['docs/compatibility.md', 'README.md'],
    evidence: 'INTENTIONAL_DIFFS, PTC_SOURCED, bản sao preset đã vendor',
    reason: 'Bản sao upstream là bằng chứng nêu trong ma trận tương thích.',
  },
  {
    id: 'spec',
    source: /^specs\//,
    docs: [],
    evidence: 'không tự động',
    reason: 'SPEC_PROTECTED: đặc tả là nguồn, không phải đích.',
  },
]

/** Tài liệu luôn protected: không bao giờ được tự động sửa. */
export const PROTECTED_PATHS = [/^specs\//]

/**
 * Phân loại một tệp thay đổi.
 * @param file - đường dẫn POSIX tương đối repo.
 * @returns danh sách ứng viên tài liệu kèm bằng chứng.
 */
export function classify(file) {
  if (PROTECTED_PATHS.some(pattern => pattern.test(file))) {
    return [{
      doc: file,
      confidence: 'protected',
      rule: 'spec',
      evidence: 'specs/** là protected',
      reason: 'Không sửa đặc tả để khớp code. Xung đột phải báo SPEC_CONFLICT.',
    }]
  }
  const out = []
  for (const rule of IMPACT_RULES) {
    if (!rule.source.test(file)) continue
    for (const doc of rule.docs) {
      out.push({
        doc,
        confidence: 'direct',
        rule: rule.id,
        evidence: rule.evidence,
        reason: rule.reason,
      })
    }
  }
  return out
}

/**
 * Chạy impact analysis trên danh sách tệp.
 * @param changedFiles - mảng đường dẫn.
 * @returns báo cáo có cấu trúc.
 */
export function impact(changedFiles) {
  const byDoc = new Map()
  const noRule = []

  for (const file of changedFiles) {
    const candidates = classify(file)
    if (candidates.length === 0) {
      // Tệp không có bản đồ: không đoán. Chỉ ghi nhận để người duyệt xem.
      noRule.push(file)
      continue
    }
    for (const candidate of candidates) {
      const entry = byDoc.get(candidate.doc) ?? {
        doc: candidate.doc,
        protected: candidate.confidence === 'protected',
        sources: [],
      }
      entry.sources.push({
        source: file,
        rule: candidate.rule,
        evidence: candidate.evidence,
        reason: candidate.reason,
      })
      byDoc.set(candidate.doc, entry)
    }
  }

  const docs = [...byDoc.values()].sort((a, b) => a.doc.localeCompare(b.doc, 'en'))
  return {
    tool: 'docs-impact',
    mode: 'read-only',
    changed_files: changedFiles.length,
    candidates: docs,
    unmapped: noRule,
    needs_human_review: noRule.length > 0
      ? ['Có tệp thay đổi không ánh xạ tới tài liệu nào; người duyệt phải quyết định.']
      : [],
    writes: [],
  }
}

/**
 * Đọc danh sách tệp từ stdin (mỗi dòng một đường dẫn).
 * @returns mảng đường dẫn chuẩn hoá POSIX.
 */
export function readStdinSync() {
  const text = readFileSync(0, 'utf8')
  return text.split('\n')
    .map(line => line.trim())
    .filter(line => line !== '')
    .map(line => line.split(path.sep).join('/'))
}

function main() {
  const argv = process.argv.slice(2)
  const json = argv.includes('--json')
  let files = []

  const flagIndex = argv.indexOf('--changed-files')
  if (flagIndex >= 0) {
    const file = argv[flagIndex + 1]
    if (file === undefined || !existsSync(file)) {
      console.error('LỖI: --changed-files cần đường dẫn tệp tồn tại.')
      process.exit(2)
    }
    files = readFileSync(file, 'utf8').split('\n')
      .map(line => line.trim())
      .filter(line => line !== '')
      .map(line => line.split(path.sep).join('/'))
  } else if (argv.includes('--stdin')) {
    files = readStdinSync()
  } else {
    console.error('Dùng: node scripts/docs-impact.mjs --changed-files <file> [--json]\n'
      + '     git diff --name-only main...HEAD | node scripts/docs-impact.mjs --stdin [--json]')
    process.exit(2)
  }

  const report = impact(files)
  if (json) {
    console.log(JSON.stringify(report, null, 2))
    process.exit(0)
  }

  console.log(`docs-impact (chỉ đọc): ${report.changed_files} tệp thay đổi`)
  if (report.candidates.length === 0) console.log('  không có ứng viên tài liệu')
  for (const candidate of report.candidates) {
    console.log(`  → ${candidate.doc}${candidate.protected ? ' [PROTECTED]' : ''}`)
    for (const source of candidate.sources) {
      console.log(`      từ ${source.source} (rule ${source.rule}) — bằng chứng: ${source.evidence}`)
    }
  }
  for (const file of report.unmapped) console.log(`  ? ${file}: không ánh xạ tới tài liệu nào`)
  console.log('Không ghi tệp nào. Bước này không kết luận tài liệu đúng hay sai.')
  process.exit(0)
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main()
}
