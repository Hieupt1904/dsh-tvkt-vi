#!/usr/bin/env node
/**
 * Sinh `skills/tvkt-vi/references/terms-quick.md` từ `vendor/tvkt/config/terms.json`.
 *
 * Vì sao phải sinh thay vì chép tay: bản chép tay 0.4.0 gộp cả 47 thuật ngữ
 * `proposed` vào mục "Thuật ngữ chuẩn", nên người đọc tưởng T024-T070 đã được
 * duyệt. Nó còn chứa đường dẫn tuyệt đối của máy phát triển
 * (`/home/<user>/...`), vô nghĩa với người dùng gói.
 *
 * Nguồn sự thật duy nhất là `terms.json`. Trạng thái trong từ điển quyết định
 * nhóm hiển thị; generator không tự nâng hay hạ trạng thái nào.
 *
 * Dùng:
 *   node scripts/gen-terms-quick.mjs            # ghi tệp
 *   node scripts/gen-terms-quick.mjs --check    # chỉ so, không ghi; thoát 1 nếu lệch
 *   node scripts/gen-terms-quick.mjs --stdout    # in ra stdout
 *
 * Mã thoát: 0 khớp hoặc đã ghi, 1 tệp committed bị stale, 2 lỗi dữ liệu.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PKG_ROOT = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '')
const TERMS_FILE = path.join(PKG_ROOT, 'vendor', 'tvkt', 'config', 'terms.json')
const OUT_FILE = path.join(PKG_ROOT, 'skills', 'tvkt-vi', 'references', 'terms-quick.md')

/** Nhóm hiển thị, theo đúng thứ tự xuất ra. */
const GROUPS = [
  {
    status: 'approved',
    title: 'Thuật ngữ đã duyệt',
    intro: 'Dùng các thuật ngữ này. Đây là nhóm duy nhất được coi là chuẩn.',
  },
  {
    status: 'proposed',
    title: 'Thuật ngữ đề xuất',
    intro: 'Đang chờ duyệt. Dùng được nếu dự án đã chấp nhận, nhưng không được gọi là chuẩn.',
  },
  {
    status: 'contextual',
    title: 'Thuật ngữ theo ngữ cảnh',
    intro: 'Chỉ dùng khi ngữ cảnh nêu rõ; không thay thế thuật ngữ đã duyệt.',
  },
  {
    status: 'deprecated',
    title: 'Thuật ngữ ngừng dùng',
    intro: 'Không dùng cho văn bản mới. Chỉ giữ để đọc tài liệu cũ.',
  },
]

/**
 * Đọc và kiểm tra từ điển.
 * @param file - đường dẫn terms.json.
 * @returns dữ liệu đã kiểm.
 */
export function readTerms(file = TERMS_FILE) {
  const data = JSON.parse(readFileSync(file, 'utf8'))
  if (!Array.isArray(data.terms)) throw new Error(`${file}: thiếu mảng "terms"`)
  const ids = new Set()
  for (const term of data.terms) {
    for (const key of ['id', 'term', 'status']) {
      if (typeof term[key] !== 'string' || term[key] === '') {
        throw new Error(`${file}: thuật ngữ thiếu trường "${key}": ${JSON.stringify(term)}`)
      }
    }
    if (ids.has(term.id)) throw new Error(`${file}: id trùng ${term.id}`)
    ids.add(term.id)
    if (!GROUPS.some(g => g.status === term.status)) {
      throw new Error(`${file}: ${term.id} có status lạ "${term.status}"`)
    }
  }
  if (!Array.isArray(data.discouraged_phrases)) {
    throw new Error(`${file}: thiếu mảng "discouraged_phrases"`)
  }
  return data
}

/**
 * Nhóm thuật ngữ theo trạng thái, giữ thứ tự id.
 * @param terms - mảng thuật ngữ.
 * @returns map status → mảng.
 */
export function groupTerms(terms) {
  const out = new Map(GROUPS.map(g => [g.status, []]))
  for (const term of terms) out.get(term.status).push(term)
  for (const list of out.values()) list.sort((a, b) => a.id.localeCompare(b.id, 'en'))
  return out
}

/** Thoát ký tự Markdown trong ô bảng. */
function cell(text) {
  return String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()
}

/**
 * Dựng nội dung quick reference.
 * @param data - dữ liệu từ điển đã đọc.
 * @returns chuỗi Markdown.
 */
export function renderQuickReference(data) {
  const grouped = groupTerms(data.terms)
  const lines = []

  lines.push('# Bảng thuật ngữ nhanh (T001-T070)')
  lines.push('')
  lines.push('<!-- TỆP SINH TỰ ĐỘNG — không sửa tay. -->')
  lines.push('<!-- Nguồn: vendor/tvkt/config/terms.json. Sinh lại: node scripts/gen-terms-quick.mjs -->')
  lines.push('')
  lines.push(`Từ điển phiên bản ${data.version ?? 'không rõ'}. `
    + `${data.terms.length} thuật ngữ, ${data.discouraged_phrases.length} cụm không ưu tiên.`)
  lines.push('')
  if (typeof data.description === 'string' && data.description !== '') {
    lines.push(`Ghi chú nguồn: ${data.description}`)
    lines.push('')
  }
  lines.push('Chỉ nhóm **đã duyệt** là chuẩn. Nhóm **đề xuất** chưa được phê duyệt: dùng thì')
  lines.push('phải nói rõ là đề xuất, không được gọi là thuật ngữ chuẩn của dự án.')
  lines.push('')

  for (const group of GROUPS) {
    const list = grouped.get(group.status)
    if (list.length === 0) continue
    lines.push(`## ${group.title} (${list.length})`)
    lines.push('')
    lines.push(group.intro)
    lines.push('')
    lines.push('| Mã | Thuật ngữ | Định nghĩa | Phạm vi |')
    lines.push('|---|---|---|---|')
    for (const term of list) {
      lines.push(`| ${cell(term.id)} | ${cell(term.term)} | ${cell(term.definition)} | ${cell(term.scope)} |`)
    }
    lines.push('')
  }

  lines.push(`## Cụm không ưu tiên (${data.discouraged_phrases.length})`)
  lines.push('')
  lines.push('Không tự thay thế bằng tìm chuỗi. Đọc câu, xác định nghĩa, rồi mới sửa.')
  lines.push('')
  lines.push('| Mã | Không ưu tiên | Ưu tiên | Điều kiện | Mức |')
  lines.push('|---|---|---|---|---|')
  const phrases = [...data.discouraged_phrases].sort((a, b) => a.id.localeCompare(b.id, 'en'))
  for (const item of phrases) {
    lines.push(`| ${cell(item.id)} | ${cell(item.phrase)} | ${cell(item.preferred)} `
      + `| ${cell(item.note)} | ${cell(item.severity)} |`)
  }
  lines.push('')

  const approved = data.terms.filter(t => t.status === 'approved')
  if (approved.length > 0) {
    // Danh sách có thứ tự, mỗi dòng một nhóm ngắn: một dòng dài liệt kê toàn bộ
    // thuật ngữ vừa khó đọc vừa vi phạm ngưỡng câu của chính bộ chuẩn này.
    lines.push('## Danh sách phẳng nhóm đã duyệt')
    lines.push('')
    lines.push('Chỉ để tra nhanh; nghĩa và phạm vi xem bảng phía trên.')
    lines.push('')
    const chunk = 8
    for (let i = 0; i < approved.length; i += chunk) {
      const slice = approved.slice(i, i + chunk).map(t => t.term)
      lines.push(`- ${slice.join(' · ')}`)
    }
    lines.push('')
  }

  return `${lines.join('\n').trimEnd()}\n`
}

function main() {
  const args = process.argv.slice(2)
  const check = args.includes('--check')
  const toStdout = args.includes('--stdout')

  let data
  try {
    data = readTerms()
  } catch (error) {
    console.error(`LỖI: không đọc được từ điển. Nguyên nhân: ${error.message}`)
    process.exit(2)
  }

  const rendered = renderQuickReference(data)

  if (toStdout) {
    process.stdout.write(rendered)
    process.exit(0)
  }

  if (check) {
    if (!existsSync(OUT_FILE)) {
      console.error(`STALE: thiếu ${path.relative(PKG_ROOT, OUT_FILE)}. Chạy: node scripts/gen-terms-quick.mjs`)
      process.exit(1)
    }
    const current = readFileSync(OUT_FILE, 'utf8')
    if (current !== rendered) {
      console.error('STALE: skills/tvkt-vi/references/terms-quick.md không khớp terms.json.')
      console.error('Chạy: node scripts/gen-terms-quick.mjs')
      process.exit(1)
    }
    console.log('OK: quick reference khớp terms.json.')
    process.exit(0)
  }

  writeFileSync(OUT_FILE, rendered)
  console.log(`đã ghi ${path.relative(PKG_ROOT, OUT_FILE)} `
    + `(${data.terms.length} thuật ngữ, ${data.discouraged_phrases.length} cụm)`)
  process.exit(0)
}

if (process.argv[1] !== undefined
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main()
}
