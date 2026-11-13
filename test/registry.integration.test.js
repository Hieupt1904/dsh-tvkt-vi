import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { loadSkill } from '../lib/index.js'

/**
 * Test tích hợp với registry skill thật của DSH.
 *
 * Bắt đúng lớp lỗi đã xảy ra một lần: `register()` nhận payload thiếu `source`,
 * nhưng `get()` mới là chỗ từ chối, nên lỗi chỉ lộ lúc agent nạp skill.
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

test('registry thật: đăng ký, liệt kê, nạp và gỡ skill', { skip }, async () => {
  const cordis = await import(pathToFileURL(path.join(modules, '@deepseek-ai/cordis/lib/index.js')).href)
  const skillPlugin = (await import(pathToFileURL(path.join(modules, '@deepseek-ai/dsh-skill/lib/index.js')).href)).default

  const ctx = new cordis.Context()
  ctx.plugin(skillPlugin)
  await new Promise(resolve => setTimeout(resolve, 50))

  const skills = ctx.get('skills')
  assert.ok(skills, 'registry phải có mặt sau khi mount')

  const dispose = skills.register(loadSkill())

  const catalog = await skills.list({})
  const entry = catalog.find(s => s.name === 'tvkt-vi')
  assert.ok(entry, 'skill phải xuất hiện trong catalog')
  assert.equal(entry.source, 'runtime')
  assert.equal(entry.provider, 'runtime')

  const loaded = await skills.get('tvkt-vi', {})
  assert.ok(loaded, 'skills.get() phải nạp được thân skill')
  assert.equal(typeof loaded.content, 'string')
  assert.ok(loaded.content.length > 1000)

  dispose()
  const after = await skills.list({})
  assert.equal(after.filter(s => s.name === 'tvkt-vi').length, 0, 'dispose phải gỡ sạch')
})
