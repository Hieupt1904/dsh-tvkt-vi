import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as plugin from '../lib/index.js'
import { CONTRACT_TEXT, SECTION_NAME, SECTION_ORDER } from '../lib/contract.js'
import { SKILL_DESCRIPTION, SKILL_NAME, SKILL_RANK, createSkillProvider } from '../lib/skill.js'

const SKILL_FILE = fileURLToPath(new URL('../skills/tvkt-vi/SKILL.md', import.meta.url))

/** Context Cordis giả: ghi lại mọi đăng ký, không cần runtime thật. */
function fakeContext() {
  const sections = []
  const providers = []
  const effects = []
  const ctx = {
    effect(fn, label) {
      const dispose = fn()
      effects.push({ label, dispose })
      return dispose
    },
    systemPrompt: {
      section(section) {
        sections.push(section)
        return () => {}
      },
      getSectionOrder() {
        return 0
      },
    },
    skills: {
      registerProvider(factory) {
        providers.push(factory({ signal: new AbortController().signal, invalidate() {} }))
        return () => {}
      },
    },
  }
  return { ctx, sections, providers, effects }
}

test('mount đăng ký một section prompt và một provider skill', () => {
  const { ctx, sections, providers, effects } = fakeContext()
  plugin.apply(ctx)

  assert.equal(sections.length, 1)
  assert.equal(sections[0].name, SECTION_NAME)
  assert.equal(sections[0].order, SECTION_ORDER)
  assert.ok(sections[0].text.length > 500, 'hợp đồng ngôn ngữ phải có nội dung thật')

  assert.equal(providers.length, 1)
  assert.equal(providers[0].name, 'tvkt-vi')
  assert.equal(typeof providers[0].list, 'function')
  assert.equal(typeof providers[0].get, 'function')
  assert.equal(effects.length, 2, 'mỗi đăng ký phải bọc trong ctx.effect để tự gỡ')
})

test('section nằm sau hướng dẫn công cụ và trước persona suffix', () => {
  assert.ok(SECTION_ORDER > 3100, 'phải sau khối tool guidance')
  assert.ok(SECTION_ORDER < 10200, 'phải trước deployment persona suffix')
})

test('hợp đồng không còn chỗ trống chưa thay', () => {
  assert.ok(!CONTRACT_TEXT.includes('{{'), 'không được để {{…}} trong prompt')
  assert.ok(!CONTRACT_TEXT.includes('TVKT_HOME'), 'không được rò biến môi trường vào prompt')
})

test('candidate đủ trường để registry không từ chối', async () => {
  const [candidate] = await createSkillProvider().list({})
  assert.equal(candidate.name, SKILL_NAME)
  assert.equal(typeof candidate.source, 'string')
  assert.equal(candidate.source, 'bundled')
  assert.equal(candidate.provider, 'tvkt-vi')
  assert.equal(candidate.rank, SKILL_RANK)
  assert.equal(typeof candidate.description, 'string')
  assert.ok(candidate.invocation.modelInvocable)
  assert.deepEqual(candidate.resourceBase.kind, 'directory')
  assert.ok(candidate.path.endsWith('SKILL.md'))
  assert.ok(SKILL_RANK > 200 && SKILL_RANK < 400, 'phải thắng user dir (400) và thua project (100/200)')
})

test('description trong frontmatter khớp hằng số trong mã', () => {
  const raw = readFileSync(SKILL_FILE, 'utf8')
  const m = /^description:\s*"(.+)"$/m.exec(raw)
  assert.ok(m, 'frontmatter phải có description')
  assert.equal(m[1], SKILL_DESCRIPTION, 'hai nguồn mô tả đã lệch nhau')
  assert.equal(/^name:\s*(\S+)$/m.exec(raw)?.[1], SKILL_NAME)
})

test('get() đọc lại tệp, không cache thân skill', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tvkt-'))
  const dir = path.join(root, 'skills', SKILL_NAME)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'SKILL.md'), '# Bản một\n\nNội dung cũ.\n')

  const provider = createSkillProvider(root)
  const [candidate] = await provider.list({})
  const first = await provider.get(candidate, {})
  assert.match(first.content, /Bản một/)

  writeFileSync(path.join(dir, 'SKILL.md'), '# Bản hai\n\nNội dung mới.\n')
  const second = await provider.get(candidate, {})
  assert.match(second.content, /Bản hai/, 'sửa tệp phải thấy ngay ở lần nạp kế tiếp')
  assert.ok(!second.content.includes('Bản một'))
})

test('get() trả undefined cho tên lạ', async () => {
  const provider = createSkillProvider()
  assert.equal(await provider.get({ name: 'khac' }, {}), undefined)
})

test('thân skill dưới ngưỡng pruner 8192 code point', () => {
  const points = [...readFileSync(SKILL_FILE, 'utf8')].length
  assert.ok(points < 8192, `thân skill ${points} code point, vượt ngưỡng pruner`)
})

test('mô tả skill đủ để agent tự chọn nạp nhưng vẫn ngắn', () => {
  assert.ok(SKILL_DESCRIPTION.includes('TVKT-100'))
  assert.ok(SKILL_DESCRIPTION.includes('tiếng Việt'))
  assert.ok(SKILL_DESCRIPTION.length < 1000, 'mô tả phải ngắn, catalog đọc mỗi bước')
})

test('plugin khai báo inject đúng hai dịch vụ', () => {
  assert.deepEqual([...plugin.inject].sort(), ['skills', 'systemPrompt'])
  assert.equal(plugin.name, 'tvkt-vi')
})
