import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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

  const provider = createSkillProvider({ pkgRoot: root })
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

test('preset khai báo đúng phần thêm PTC và không chép row của PTC', () => {
  const raw = readFileSync(fileURLToPath(new URL('../cordis.patch.yml', import.meta.url)), 'utf8')
  const rows = new Map()
  let current
  for (const line of raw.split('\n')) {
    const id = /^\s{10}- id:\s*(\S+)/.exec(line)
    if (id) { current = id[1]; rows.set(current, undefined); continue }
    const name = /^\s{12}name:\s*['"]?([^'"\s]+)['"]?\s*$/.exec(line)
    if (name && current !== undefined && rows.get(current) === undefined) rows.set(current, name[1])
  }
  // Có: bộ thực thi PTC (gọi nhiều tool một lượt).
  assert.equal(rows.get('tool-executor-ptc'), '@deepseek-ai/dsh-tool-executor-ptc')
  // Không: các row PTC cắt bớt có chủ ý — plugin manager vẫn giữ như standard.
  assert.equal(rows.get('tool-plugin-manager'), '@deepseek-ai/dsh-plugin-manager/tools')
  assert.ok(rows.has('tool-plugin-market'))
  // Không chép plugin ngoài: chúng đã ở bundle root, chép vào preset là trùng.
  for (const external of ['ego-browser', 'dsh-service', 'tool-agent-team', 'dsh-mattpocock-skills-deck']) {
    assert.ok(!rows.has(external), `không được khai lại ${external} trong preset`)
  }
})

test('số phiên bản khớp giữa package.json và metadata của skill', () => {
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  const meta = readFileSync(fileURLToPath(new URL('../lib/skill.js', import.meta.url)), 'utf8')
  const inCode = /metadata: \{ version: '([^']+)'/.exec(meta)?.[1]
  assert.equal(inCode, pkg.version, 'metadata.version trong lib/skill.js phải khớp package.json')
})

test('metadata hiển thị: locale hợp lệ, detail và icon tồn tại trong gói', () => {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))

  for (const lang of ['en', 'zh']) {
    const file = path.join(root, 'locale', `${lang}.json`)
    const meta = JSON.parse(readFileSync(file, 'utf8')).meta
    assert.equal(typeof meta.title, 'string')
    assert.ok(meta.title.length > 0)
    assert.equal(typeof meta.description, 'string')
    assert.ok(meta.description.length > 0)
    // detail phải nằm trong thư mục con, không ở gốc gói
    assert.match(meta.detail, /^[^/]+\/[^/]+\.md$/)
    assert.ok(existsSync(path.join(root, meta.detail)), `thiếu ${meta.detail}`)
  }

  assert.equal(pkg.icon, './icon.svg')
  assert.ok(existsSync(path.join(root, 'icon.svg')), 'thiếu icon.svg')
  assert.ok(readFileSync(path.join(root, 'icon.svg')).length < 256 * 1024, 'icon vượt 256 KiB')
  assert.ok(pkg.files.includes('docs'), 'phải xuất bản thư mục docs')
  assert.ok(pkg.files.includes('locale/*.json'), 'phải xuất bản locale')
  assert.ok(pkg.files.includes('icon.svg'), 'phải xuất bản icon')
  assert.equal(pkg.exports['./locale/*.json'], './locale/*.json')
})

test('manifest khai báo đúng hợp đồng bundle của DSH', () => {
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.ok(existsSync(fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))))
  // engines.dsh: DSH từ chối bundle có dải không khớp bản đang chạy.
  // Chiến lược support hiện tại là NARROW: chỉ đúng version đã kiểm chứng.
  // Xem docs/compatibility.md — mọi giá trị trong engines.dsh phải có evidence.
  assert.equal(typeof pkg.engines.dsh, 'string')
  assert.equal(pkg.engines.dsh, pkg.dshTarget,
    'engines.dsh phải pin đúng dshTarget khi chưa có CI matrix')
  assert.ok(!/[><=~^*|]/.test(pkg.engines.dsh),
    'không khai dải version khi CI chưa test dải đó')
  // Node floor phải không thấp hơn floor của host DSH được support.
  const nodeFloor = /^>=?(\d+)\.(\d+)\.(\d+)$/.exec(pkg.engines.node)
  assert.ok(nodeFloor, 'engines.node phải là sàn cụ thể')
  const [, major, minor] = nodeFloor.map(Number)
  assert.ok(major > 24 || (major === 24 && minor >= 9),
    'DSH 0.2.2-rc.2 khai engines.node ">=24.9.0"')
  // peer cordis phải có nhánh prerelease tường minh, nếu không pre-release bị loại im lặng
  assert.match(pkg.peerDependencies['@deepseek-ai/cordis'], /-0\b/)
  // không khai dsh.client: bundle này không có UI trình duyệt
  assert.equal(pkg.dsh.client, undefined)
})


test('thân skill không mang frontmatter YAML khi nạp', async () => {
  const body = await plugin.readSkillBody()
  assert.ok(!body.startsWith('---'), 'frontmatter phải bị cắt')
  assert.ok(!/^name: tvkt-vi$/m.test(body), 'không được còn trường frontmatter')
  assert.match(body, /^# TVKT-100/)
  assert.match(body, /Folder holding this skill's files:/)
})

test('parseSkill từ chối frontmatter không đóng', () => {
  assert.throws(() => plugin.parseSkill('---\nname: x\n'), /unterminated frontmatter/)
  assert.equal(plugin.parseSkill('không có frontmatter'), 'không có frontmatter')
})

test('resourceBase dùng dấu POSIX trên mọi nền tảng', () => {
  const base = plugin.skillCandidate().resourceBase
  assert.equal(base.kind, 'directory')
  assert.ok(!base.path.includes('\\'), 'phải là dấu / kể cả trên Windows')
})

test('list() báo incomplete khi tệp không đọc được, ghim khi lỗi tồn tại', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tvkt-miss-'))
  const provider = createSkillProvider({ pkgRoot: root })

  // Lỗi tạm thời (ENOENT): trả candidate để catalog còn dùng, đánh dấu chưa hoàn tất.
  const partial = await provider.list({})
  assert.equal(Array.isArray(partial), false, 'phải là observation, không phải mảng')
  assert.equal(partial.complete, false)
  assert.equal(partial.candidates.length, 1)

  // get() với lỗi tạm thời phải ném, không trả undefined.
  await assert.rejects(() => provider.get({ name: SKILL_NAME }, {}))
})

test('get() trả undefined khi tệp có nhưng hỏng frontmatter (lỗi tồn tại)', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tvkt-bad-'))
  const dir = path.join(root, 'skills', SKILL_NAME)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: tvkt-vi\n')

  const provider = createSkillProvider({ pkgRoot: root })
  const listed = await provider.list({})
  const candidates = Array.isArray(listed) ? listed : listed.candidates
  assert.equal(candidates.length, 0, 'entry lỗi tồn tại bị bỏ khỏi catalog')
  // Nạp một entry đã liệt kê mà hỏng vẫn là lỗi của lần nạp: ném ra để consumer thấy.
  await assert.rejects(() => provider.get({ name: SKILL_NAME }, {}))
})
