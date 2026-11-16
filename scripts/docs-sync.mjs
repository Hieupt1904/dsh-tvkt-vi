#!/usr/bin/env node
/**
 * `docs-sync` — tạo **đề xuất patch** cho tài liệu. Không áp dụng gì.
 *
 * Đây là bước thứ ba của pipeline:
 *
 *   docs-impact → gather evidence → docs-sync patch proposal
 *     → docs-verify → human review → apply
 *
 * Ba ràng buộc cứng, mỗi ràng buộc có test:
 *   1. Chỉ ghi một tệp: bản đề xuất trong `.tvkt/proposals/`. Không sửa tài liệu.
 *   2. Mọi thay đổi đề xuất phải ghi nguồn bằng chứng, rule ID đã dùng, giả định,
 *      và câu hỏi chưa giải quyết.
 *   3. Không đủ bằng chứng thì ghi `CẦN XÁC NHẬN`; không bịa nội dung.
 *
 * Công cụ này chỉ làm phần máy làm được: chép giá trị đã kiểm từ nguồn sự thật
 * (ví dụ version trong `package.json`) vào chỗ tài liệu đang lệch, và luôn đặt
 * kết quả vào hàng đợi duyệt. Phần cần hiểu ngữ nghĩa thì không đụng vào.
 *
 * Dùng:
 *   node scripts/docs-sync.mjs                     # sinh đề xuất, không áp dụng
 *   node scripts/docs-sync.mjs --apply-handle H    # in patch của một đề xuất
 *
 * Mã thoát: 0 sinh xong (kể cả khi không có gì để sửa), 2 lỗi đầu vào.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_ROOT = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '')
const PROPOSAL_DIR = path.join(PKG_ROOT, '.tvkt', 'proposals')
const CONFIG_FILE = path.join(PKG_ROOT, '.tvkt', 'config.json')

/** Template cho một đề xuất. Trường nào cũng bắt buộc có mặt. */
export const PROPOSAL_FIELDS = [
  'handle',
  'generatedAt',
  'target',
  'changes',
  'evidence',
  'rules',
  'assumptions',
  'unresolved',
  'apply',
]

/**
 * Đọc dữ liệu nguồn sự thật mà đề xuất được phép chép.
 * @returns object các giá trị đã kiểm.
 */
export function gatherEvidence() {
  const pkgPath = path.join(PKG_ROOT, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const evidence = {
    'package.json.version': pkg.version,
    'package.json.dshTarget': pkg.dshTarget,
    'package.json.engines.node': pkg.engines?.node,
    'package.json.engines.dsh': pkg.engines?.dsh,
    'package.json.dsh.bundle.patch': pkg.dsh?.bundle?.patch,
  }
  // Chỉ giữ giá trị là chuỗi; các trường khác không dùng để chép.
  for (const [key, value] of Object.entries(evidence)) {
    if (typeof value !== 'string') delete evidence[key]
  }
  return evidence
}

/**
 * Kiểm tra một tệp tài liệu có chứa giá trị nguồn không.
 * @param file - đường dẫn tương đối repo.
 * @param value - giá trị cần tìm.
 * @returns true/false, hoặc null nếu không đọc được tệp.
 */
export function contains(file, value) {
  const full = path.join(PKG_ROOT, file)
  if (!existsSync(full)) return null
  return readFileSync(full, 'utf8').includes(value)
}

/**
 * Tệp có một dòng của bảng ma trận cho đúng version này không.
 *
 * `contains()` trên cả tệp là quá thô: version có thể xuất hiện ở chỗ khác (ví
 * dụ trong `.dshTarget`) nên drift thật bị bỏ qua. Hàm này chỉ xét dòng bảng.
 * @param file - đường dẫn tương đối repo.
 * @param version - version plugin.
 * @returns true/false, hoặc null nếu không đọc được tệp.
 */
export function hasMatrixRow(file, version) {
  const full = path.join(PKG_ROOT, file)
  if (!existsSync(full)) return null
  const pattern = new RegExp(`^\\|\\s*\`dsh-tvkt-vi\`\\s+${version.replace(/\./g, '\\.')}\\s*\\|`, 'm')
  return pattern.test(readFileSync(full, 'utf8'))
}

/**
 * Sinh đề xuất từ bằng chứng.
 *
 * Chỉ đề xuất khi máy xác định được chính xác chuỗi cần chèn và vị trí có ngữ
 * nghĩa rõ. Mọi trường hợp khác vào `unresolved`.
 * @returns danh sách đề xuất.
 */
export function buildProposals() {
  const evidence = gatherEvidence()
  const proposals = []

  // Ca duy nhất hiện được tự động hoá: `docs/compatibility.md` phải nêu version
  // plugin hiện tại. Nếu thiếu, chèn một dòng vào bảng ma trận — thay đổi nhỏ,
  // kiểm được, và vẫn qua người duyệt.
  const compat = 'docs/compatibility.md'
  const version = evidence['package.json.version']
  if (version !== undefined && hasMatrixRow(compat, version) === false) {
    const handle = handleFor('compat-version', `${compat}:${version}`)
    proposals.push({
      handle,
      generatedAt: new Date().toISOString(),
      target: compat,
      changes: [{
        kind: 'insert-line',
        anchor: 'ma trận tương thích',
        proposed: `| \`dsh-tvkt-vi\` ${version} | \`${evidence['package.json.dshTarget']}\` | — | CẦN XÁC NHẬN: chưa chạy kiểm chứng | (chưa đo) |`,
      }],
      evidence: [
        { source: 'package.json.version', value: version },
        { source: 'package.json.dshTarget', value: evidence['package.json.dshTarget'] },
      ],
      rules: ['DOC_DRIFT:cross-reference'],
      assumptions: [
        'Dòng mới thuộc bảng "Ma trận" của docs/compatibility.md.',
      ],
      unresolved: [
        'CẦN XÁC NHẬN: ngày kiểm chứng thật của version này là gì?',
        'CẦN XÁC NHẬN: Node và trạng thái verified tương ứng là gì?',
      ],
      apply: false,
    })
  }

  return proposals
}

/**
 * Handle ổn định cho một đề xuất: 12 ký tự hex của hash nội dung.
 * @param kind - loại đề xuất.
 * @param payload - chuỗi phân biệt.
 * @returns handle.
 */
export function handleFor(kind, payload) {
  return `${kind}-${createHash('sha256').update(payload).digest('hex').slice(0, 12)}`
}

/**
 * Sinh, ghi đề xuất, và trả đường dẫn. Không sửa tài liệu.
 * @returns `{ written, proposals }`.
 */
export function generate() {
  const proposals = buildProposals()
  if (proposals.length === 0) return { written: [], proposals }
  mkdirSync(PROPOSAL_DIR, { recursive: true })
  const written = []
  for (const proposal of proposals) {
    for (const field of PROPOSAL_FIELDS) {
      if (!(field in proposal)) throw new Error(`đề xuất thiếu trường ${field}`)
    }
    const file = path.join(PROPOSAL_DIR, `${proposal.handle}.json`)
    writeFileSync(file, `${JSON.stringify(proposal, null, 2)}\n`, { mode: 0o600 })
    written.push(path.relative(PKG_ROOT, file).split(path.sep).join('/'))
  }
  return { written, proposals }
}

/** Liệt kê đề xuất đang chờ duyệt. */
export function listProposals() {
  if (!existsSync(PROPOSAL_DIR)) return []
  return readdirSync(PROPOSAL_DIR)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => JSON.parse(readFileSync(path.join(PROPOSAL_DIR, name), 'utf8')))
}

/** Đọc cấu hình để biết có được phép áp dụng hay không. */
export function reviewMode() {
  if (!existsSync(CONFIG_FILE)) return 'report'
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')).reviewMode ?? 'report'
  } catch {
    return 'report'
  }
}

/**
 * Render một đề xuất thành diff văn bản để người đọc duyệt.
 * @param proposal - đề xuất.
 * @returns chuỗi mô tả.
 */
export function renderProposal(proposal) {
  const lines = [
    `# Đề xuất ${proposal.handle}`,
    '',
    `Tệp đích: \`${proposal.target}\``,
    `Sinh lúc: ${proposal.generatedAt}`,
    `Áp dụng tự động: ${proposal.apply ? 'có' : 'không — cần người duyệt'}`,
    '',
    '## Thay đổi đề xuất',
    '',
  ]
  for (const change of proposal.changes) {
    lines.push(`- ${change.kind} tại ${change.anchor}`)
    lines.push(`  + ${change.proposed}`)
  }
  lines.push('', '## Bằng chứng', '')
  for (const item of proposal.evidence) lines.push(`- \`${item.source}\` = ${item.value}`)
  lines.push('', '## Rule đã dùng', '')
  for (const rule of proposal.rules) lines.push(`- ${rule}`)
  lines.push('', '## Giả định', '')
  for (const assumption of proposal.assumptions) lines.push(`- ${assumption}`)
  lines.push('', '## Còn phải xác nhận', '')
  for (const question of proposal.unresolved) lines.push(`- ${question}`)
  lines.push('', 'Đề xuất này chưa được áp dụng. Pipeline: docs-impact → docs-sync → '
    + 'docs-verify → người duyệt → apply.')
  return `${lines.join('\n')}\n`
}

function main() {
  const argv = process.argv.slice(2)
  const handleIndex = argv.indexOf('--apply-handle')
  if (handleIndex >= 0) {
    const handle = argv[handleIndex + 1]
    const proposal = listProposals().find(p => p.handle === handle)
    if (proposal === undefined) {
      console.error(`LỖI: không có đề xuất ${handle}.`)
      process.exit(2)
    }
    process.stdout.write(renderProposal(proposal))
    console.log(`\nChế độ cấu hình: ${reviewMode()} (docs-sync không tự áp dụng ở bất kỳ chế độ nào).`)
    process.exit(0)
  }

  const result = generate()
  if (result.proposals.length === 0) {
    console.log('docs-sync: không có đề xuất nào. Tài liệu đã khớp các giá trị nguồn đã kiểm.')
    process.exit(0)
  }
  for (const file of result.written) console.log(`đề xuất: ${file}`)
  console.log(`\n${result.proposals.length} đề xuất đang chờ duyệt. Không tệp tài liệu nào bị sửa.`)
  process.exit(0)
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main()
}
