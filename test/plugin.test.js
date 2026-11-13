import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import * as plugin from '../lib/index.js'
import { CONTRACT_TEXT, SECTION_NAME, SECTION_ORDER } from '../lib/contract.js'

/** Context Cordis giả: ghi lại mọi đăng ký, không cần runtime thật. */
function fakeContext() {
  const sections = []
  const skills = []
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
      register(skill) {
        skills.push(skill)
        return () => {}
      },
    },
  }
  return { ctx, sections, skills, effects }
}

test('bản đăng ký skill qua được kiểm tra của registry', () => {
  // Hợp đồng của SkillDefinition: thiếu `source` thì skills.get() từ chối
  // với lỗi "loaded skill … source must be a string", dù register() thành công.
  const skill = plugin.loadSkill()
  assert.equal(typeof skill.source, 'string')
  assert.equal(skill.source, 'runtime')
  assert.equal(typeof skill.provider === 'string' || skill.provider === undefined, true)
  assert.equal(typeof skill.content, 'string')
  assert.equal(typeof skill.path, 'string')
  assert.ok(skill.path.endsWith('SKILL.md'))
  assert.deepEqual(skill.resourceBase.kind, 'directory')
  assert.ok(skill.resourceBase.path.endsWith('skills/tvkt-vi'))
  assert.ok(skill.content.length > 1000)
})

test('mount đăng ký đúng một section prompt và một skill', () => {
  const { ctx, sections, skills, effects } = fakeContext()
  plugin.apply(ctx)

  assert.equal(sections.length, 1)
  assert.equal(sections[0].name, SECTION_NAME)
  assert.equal(sections[0].order, SECTION_ORDER)
  assert.ok(sections[0].text.length > 500, 'hợp đồng ngôn ngữ phải có nội dung thật')

  assert.equal(skills.length, 1)
  assert.equal(skills[0].name, 'tvkt-vi')
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

test('skill đăng ký khớp frontmatter trên đĩa', () => {
  const { ctx, skills } = fakeContext()
  plugin.apply(ctx)

  const path = fileURLToPath(new URL('../skills/tvkt-vi/SKILL.md', import.meta.url))
  const raw = readFileSync(path, 'utf8')
  const name = /^name:\s*(\S+)$/m.exec(raw)?.[1]
  assert.equal(name, skills[0].name, 'tên skill trong frontmatter phải trùng tên đăng ký')

  assert.ok(skills[0].content.includes('# TVKT-100'), 'thân skill phải được nạp')
  assert.ok(skills[0].content.includes('Thư mục tệp của skill'), 'phải nối đường dẫn thư mục thật')
  assert.ok(!skills[0].content.includes('{{'), 'không được để {{…}} trong thân skill')
})

test('mô tả skill đủ để agent tự chọn nạp', () => {
  assert.ok(plugin.SKILL_DESCRIPTION.includes('TVKT-100'))
  assert.ok(plugin.SKILL_DESCRIPTION.includes('tiếng Việt'))
  assert.ok(plugin.SKILL_DESCRIPTION.length < 1000, 'mô tả phải ngắn, catalog đọc mỗi bước')
})

test('thân skill dưới ngưỡng pruner 8192 code point', () => {
  const path = fileURLToPath(new URL('../skills/tvkt-vi/SKILL.md', import.meta.url))
  const raw = readFileSync(path, 'utf8')
  const points = [...raw].length
  assert.ok(points < 8192, `thân skill ${points} code point, vượt ngưỡng pruner`)
})

test('plugin khai báo inject đúng hai dịch vụ', () => {
  assert.deepEqual([...plugin.inject].sort(), ['skills', 'systemPrompt'])
  assert.equal(plugin.name, 'tvkt-vi')
})
