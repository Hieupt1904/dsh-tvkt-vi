/**
 * Khoá thứ tự section của hợp đồng ngôn ngữ với bảng phân bổ của ĐÚNG target.
 *
 * Vì sao có tệp này: `SECTION_ORDER = 10150` là số tự chọn trong một khoảng trống
 * của bảng phân bổ do host sở hữu. Bảng đó là nội bộ và đổi giữa các release.
 * Không có test thì lần nâng target sẽ không ai biết số này đã va chạm hay đã
 * nằm sai chỗ.
 *
 * Hai lớp kiểm, cố ý tách:
 *   1. Lớp API công khai — `getSectionOrder('WEB_SURFACE')` và
 *      `getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX')` trên service thật.
 *   2. Lớp bảng phân bổ — đọc `SECTION_ORDERS` trong mã nguồn đi kèm gói để phát
 *      hiện va chạm với một suất đã cấp. Lớp này cần mã nguồn, không chỉ khai báo
 *      kiểu; thiếu mã nguồn thì bỏ qua kèm lý do, không đoán.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { SECTION_ORDER } from '../lib/contract.js'
import { resolveInstallModules } from '../scripts/compat-smoke.mjs'

const modules = resolveInstallModules()
const skip = modules === undefined
  ? 'không tìm thấy bản cài DSH (đặt DSH_INSTALL_MODULES để chỉ đường)'
  : false

/** Bảng phân bổ section trong mã nguồn của target, nếu gói có kèm mã nguồn. */
function allocationTable() {
  const file = path.join(modules, '@deepseek-ai', 'dsh-system-prompt', 'src', 'index.ts')
  if (!existsSync(file)) return undefined
  const source = readFileSync(file, 'utf8')
  const block = /const SECTION_ORDERS = \{([\s\S]*?)\} as const/.exec(source)
  if (block === null) return undefined
  const table = {}
  for (const match of block[1].matchAll(/([A-Z][A-Z0-9_]*):\s*(-?\d+)/g)) {
    table[match[1]] = Number(match[2])
  }
  return Object.keys(table).length > 0 ? table : undefined
}

/** Mount service thật của target và trả về nó. */
async function mountSystemPrompt() {
  const { Context } = await import(pathToFileURL(
    path.join(modules, '@deepseek-ai', 'cordis', 'lib', 'index.js')).href)
  const { default: SystemPrompt } = await import(pathToFileURL(
    path.join(modules, '@deepseek-ai', 'dsh-system-prompt', 'lib', 'index.js')).href)
  const ctx = new Context()
  ctx.plugin(SystemPrompt)
  await new Promise(resolve => setTimeout(resolve, 100))
  return ctx.get('systemPrompt')
}

test('SECTION_ORDER nằm giữa WEB_SURFACE và persona suffix theo API của target', { skip }, async () => {
  const systemPrompt = await mountSystemPrompt()
  const webSurface = systemPrompt.getSectionOrder('WEB_SURFACE')
  const personaSuffix = systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX')
  assert.equal(typeof webSurface, 'number')
  assert.equal(typeof personaSuffix, 'number')
  assert.ok(SECTION_ORDER > webSurface,
    `SECTION_ORDER ${SECTION_ORDER} phải sau WEB_SURFACE ${webSurface}`)
  assert.ok(SECTION_ORDER < personaSuffix,
    `SECTION_ORDER ${SECTION_ORDER} phải trước DEPLOYMENT_PERSONA_SUFFIX ${personaSuffix}`)
})

test('SECTION_ORDER không trùng suất nào trong bảng phân bổ của target', { skip }, () => {
  const table = allocationTable()
  if (table === undefined) {
    // Không có mã nguồn thì không kết luận; lớp API ở trên vẫn đã chạy.
    return
  }
  const collisions = Object.entries(table).filter(([, order]) => order === SECTION_ORDER)
  assert.deepEqual(collisions, [],
    `SECTION_ORDER ${SECTION_ORDER} đã bị cấp cho ${collisions.map(([name]) => name).join(', ')}`)
})

test('bảng phân bổ của target vẫn có hai mốc mà contract dựa vào', { skip }, () => {
  const table = allocationTable()
  if (table === undefined) return
  // Nếu target đổi tên hoặc bỏ hai mốc này, phép kiểm phía trên mất hiệu lực.
  assert.equal(typeof table.WEB_SURFACE, 'number', 'thiếu WEB_SURFACE trong bảng phân bổ')
  assert.equal(typeof table.DEPLOYMENT_PERSONA_SUFFIX, 'number',
    'thiếu DEPLOYMENT_PERSONA_SUFFIX trong bảng phân bổ')
})

test('SECTION_ORDER là số nguyên hữu hạn', () => {
  assert.equal(Number.isInteger(SECTION_ORDER), true)
  assert.ok(Number.isFinite(SECTION_ORDER))
})
