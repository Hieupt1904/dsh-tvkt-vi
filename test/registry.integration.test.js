import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { createSkillProvider } from '../lib/skill.js'

/**
 * Test tích hợp với registry skill thật của DSH.
 *
 * Bắt đúng lớp lỗi đã xảy ra một lần: payload đăng ký thiếu `source` thì
 * `register()` nhận, nhưng `get()` mới từ chối — lỗi chỉ lộ lúc agent nạp skill.
 * Test bị bỏ qua khi máy không có bản cài DSH.
 */

/** Tìm thư mục node_modules của bản cài DSH. */
function dshModules() {
  const candidates = []
  try {
    const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()
    candidates.push(path.join(root, '@deepseek-ai/dsh/node_modules'))
  } catch { /* npm không có */ }
  if (process.env.DSH_INSTALL_MODULES) candidates.push(process.env.DSH_INSTALL_MODULES)
  return candidates.find(p => existsSync(path.join(p, '@deepseek-ai/dsh-skill/lib/index.js')))
}

const modules = dshModules()
const skip = modules ? false : 'không tìm thấy bản cài DSH (đặt DSH_INSTALL_MODULES để chỉ đường)'

async function mountRegistry() {
  const cordis = await import(pathToFileURL(path.join(modules, '@deepseek-ai/cordis/lib/index.js')).href)
  const skillPlugin = (await import(pathToFileURL(path.join(modules, '@deepseek-ai/dsh-skill/lib/index.js')).href)).default
  const ctx = new cordis.Context()
  ctx.plugin(skillPlugin)
  await new Promise(resolve => setTimeout(resolve, 50))
  return ctx.get('skills')
}

test('registry thật: provider liệt kê, nạp và gỡ được skill', { skip }, async () => {
  const skills = await mountRegistry()
  assert.ok(skills, 'registry phải có mặt sau khi mount')

  const dispose = skills.registerProvider(() => createSkillProvider())

  const catalog = await skills.list({})
  const entry = catalog.find(s => s.name === 'tvkt-vi')
  assert.ok(entry, 'skill phải xuất hiện trong catalog')
  assert.equal(entry.source, 'bundled')
  assert.equal(entry.provider, 'tvkt-vi')

  const loaded = await skills.get('tvkt-vi', {})
  assert.ok(loaded, 'skills.get() phải nạp được thân skill')
  assert.ok(loaded.content.length > 1000)

  dispose()
  const after = await skills.list({})
  assert.equal(after.filter(s => s.name === 'tvkt-vi').length, 0, 'dispose phải gỡ sạch')
})

test('registry thật: sửa SKILL.md không cần đăng ký lại', { skip }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tvkt-live-'))
  const dir = path.join(root, 'skills', 'tvkt-vi')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'SKILL.md'), '# Trước\n\nNội dung cũ.\n')

  const skills = await mountRegistry()
  const dispose = skills.registerProvider(() => createSkillProvider(root))

  const before = await skills.get('tvkt-vi', {})
  assert.match(before.content, /Trước/)

  writeFileSync(path.join(dir, 'SKILL.md'), '# Sau\n\nNội dung mới, không remount.\n')

  const after = await skills.get('tvkt-vi', {})
  assert.match(after.content, /Sau/, 'provider phải đọc tệp lúc nạp, không cache từ mount')

  dispose()
})
