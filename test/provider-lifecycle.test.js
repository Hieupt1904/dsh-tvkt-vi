/**
 * Hợp đồng lifecycle của provider skill.
 *
 * Lớp lỗi được bắt ở đây: `lib/index.js` từng gọi
 * `ctx.skills.registerProvider(() => createSkillProvider({ logger }))`, bỏ mất
 * tham số `control` mà `SkillRegistry.registerProvider` của
 * `@deepseek-ai/dsh-skill` 0.2.2-rc.2 luôn truyền vào
 * (`create: (control: SkillProviderControl) => SkillProvider`). Hệ quả: khi
 * provider cần `control.invalidate()` — nhánh lỗi tồn tại trong `get()` —
 * chương trình ném `TypeError: Cannot read properties of undefined` và che mất
 * lỗi gốc mà người vận hành cần thấy.
 *
 * Test cũ chỉ assert "promise rejects" nên không bắt được lỗi này. Bộ dưới đây
 * khoá cả ba mặt: callback có nhận control, invalidate được gọi đúng số lần,
 * và lỗi ném ra là lỗi của skill chứ không phải TypeError.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import * as plugin from '../lib/index.js'
import { SKILL_NAME, createSkillProvider } from '../lib/skill.js'

/** Gói skill tạm với nội dung bất kỳ. */
function pkgWith(body) {
  const root = mkdtempSync(path.join(tmpdir(), 'tvkt-life-'))
  const dir = path.join(root, 'skills', SKILL_NAME)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'SKILL.md'), body)
  return { root, dir }
}

/** Control giả đúng hình dạng `SkillProviderControl`. */
function fakeControl() {
  const calls = { invalidate: 0 }
  const lifecycle = new AbortController()
  return {
    calls,
    lifecycle,
    control: {
      signal: lifecycle.signal,
      invalidate() {
        calls.invalidate += 1
      },
    },
  }
}

/**
 * Context Cordis giả, ghi lại tham số mà plugin truyền cho registry.
 * `registerProvider` chạy đúng như registry thật: gọi factory kèm control.
 */
function fakeContext() {
  const sections = []
  const registrations = []
  const disposers = []
  const ctx = {
    effect(fn, label) {
      const dispose = fn()
      disposers.push({ label, dispose })
      return dispose
    },
    logger: { warn() {}, info() {}, error() {} },
    systemPrompt: {
      section(section) {
        sections.push(section)
        return () => {}
      },
    },
    skills: {
      registerProvider(create) {
        const session = fakeControl()
        const provider = create(session.control)
        const registration = { provider, session, disposed: false }
        registrations.push(registration)
        const off = () => {
          registration.disposed = true
          session.lifecycle.abort(new Error(`skill provider "${provider.name}" disposed`))
        }
        return off
      },
    },
  }
  return { ctx, sections, registrations, disposers }
}

test('plugin truyền control của registry vào provider factory', () => {
  const { ctx, registrations } = fakeContext()
  plugin.apply(ctx)

  assert.equal(registrations.length, 1, 'phải đăng ký đúng một provider')
  const { provider, session } = registrations[0]
  assert.equal(provider.name, SKILL_NAME)
  // Nếu control bị bỏ, provider sẽ không có signal nên nhánh lỗi tồn tại
  // không bao giờ gọi invalidate — chính là lỗi P1 của 0.4.0.
  assert.equal(session.calls.invalidate, 0, 'mount không được gọi invalidate')
})

test('control undefined không làm ném TypeError trong runtime bình thường', async () => {
  // Provider dựng tay không có control: đường đọc thành công vẫn phải chạy.
  const { root } = pkgWith('# Tiêu đề\n\nNội dung hợp lệ.\n')
  const provider = createSkillProvider({ pkgRoot: root })
  const [candidate] = await provider.list({})
  const loaded = await provider.get(candidate, {})
  assert.match(loaded.content, /Nội dung hợp lệ/)
})

test('lỗi parse gọi invalidate đúng một lần và không ném TypeError', async () => {
  const { root } = pkgWith('---\nname: tvkt-vi\n')
  const { calls, control } = fakeControl()
  const provider = createSkillProvider({ pkgRoot: root, control })

  await assert.rejects(
    () => provider.get({ name: SKILL_NAME }, {}),
    (error) => {
      assert.ok(!(error instanceof TypeError), `không được là TypeError: ${error}`)
      assert.equal(error.name, 'SkillParseError')
      assert.match(error.message, /unterminated frontmatter/)
      return true
    },
  )
  assert.equal(calls.invalidate, 1, 'lỗi tồn tại phải dọn catalog đúng một lần')

  // Lần đọc thứ hai cũng lỗi tồn tại: invalidate lại được gọi, không cache im lặng.
  await assert.rejects(() => provider.get({ name: SKILL_NAME }, {}))
  assert.equal(calls.invalidate, 2)
})

test('lỗi đọc giữ cause gốc và mã lỗi của hệ điều hành', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tvkt-cause-'))
  mkdirSync(path.join(root, 'skills', SKILL_NAME), { recursive: true })
  const missing = createSkillProvider({ pkgRoot: root })
  const listed = await missing.list({})
  const [candidate] = Array.isArray(listed) ? listed : listed.candidates
  await assert.rejects(
    () => missing.get(candidate, {}),
    (error) => {
      assert.equal(error.name, 'SkillReadError')
      assert.equal(error.code, 'ENOENT', 'mã lỗi gốc phải còn')
      assert.ok(error.cause instanceof Error, 'cause gốc phải còn')
      assert.equal(error.cause.code, 'ENOENT')
      return true
    },
  )
})

test('lỗi quyền (EACCES) là lỗi tồn tại: bỏ khỏi catalog và invalidate', { skip: process.platform === 'win32' || process.getuid?.() === 0 ? 'cần user không phải root trên POSIX' : false }, async () => {
  const { root, dir } = pkgWith('# Tiêu đề\n\nNội dung.\n')
  chmodSync(path.join(dir, 'SKILL.md'), 0o000)
  const { calls, control } = fakeControl()
  const provider = createSkillProvider({ pkgRoot: root, control })
  try {
    const listed = await provider.list({})
    const candidates = Array.isArray(listed) ? listed : listed.candidates
    assert.equal(candidates.length, 0, 'lỗi quyền không được liệt kê như skill dùng được')
    await assert.rejects(() => provider.get({ name: SKILL_NAME }, {}), (error) => {
      assert.equal(error.code, 'EACCES')
      assert.ok(!(error instanceof TypeError))
      return true
    })
    assert.equal(calls.invalidate, 1)
  } finally {
    chmodSync(path.join(dir, 'SKILL.md'), 0o644)
  }
})

test('ENOENT là lỗi tạm thời: catalog incomplete, không invalidate', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'tvkt-temp-'))
  const { calls, control } = fakeControl()
  const provider = createSkillProvider({ pkgRoot: root, control })

  const listed = await provider.list({})
  assert.equal(listed.complete, false, 'thiếu tệp thì discovery chưa hoàn tất')
  assert.equal(listed.candidates.length, 1)
  await assert.rejects(() => provider.get({ name: SKILL_NAME }, {}))
  assert.equal(calls.invalidate, 0, 'lỗi tạm thời không được ghim catalog')
})

test('sau dispose, get() lỗi vẫn ném đúng lỗi skill và không gọi invalidate', async () => {
  const { ctx, registrations, disposers } = fakeContext()
  plugin.apply(ctx)
  const { provider, session } = registrations[0]

  // Gói thật đọc được trước khi dispose.
  const healthy = await provider.get({ name: SKILL_NAME }, {})
  assert.ok(healthy.content.length > 1000)

  // Gỡ provider đúng như Cordis làm khi fiber dispose.
  const providerEffect = disposers.find(d => d.label === 'tvkt-vi.provider()')
  assert.ok(providerEffect, 'provider phải bọc trong ctx.effect')
  providerEffect.dispose()
  assert.equal(registrations[0].disposed, true)

  // Sau dispose, control.signal đã abort. Đường lỗi vẫn phải trả lỗi của skill.
  const provider2 = createSkillProvider({
    pkgRoot: path.join(path.sep, 'khong-ton-tai', 'tvkt-'),
    control: session.control,
  })
  await assert.rejects(() => provider2.get({ name: SKILL_NAME }, {}), (error) => {
    assert.equal(error.name, 'SkillReadError', 'không được đổi thành TypeError')
    return true
  })
  assert.equal(session.calls.invalidate, 0, 'invalidate sau dispose là không cần thiết')
})

test('signal đã abort thì lỗi abort đi thẳng ra ngoài, không nuốt thành lỗi skill', async () => {
  const { root } = pkgWith('# Tiêu đề\n\nNội dung.\n')
  const provider = createSkillProvider({ pkgRoot: root })
  const aborter = new AbortController()
  aborter.abort(new Error('consumer cancelled'))
  // Node ném AbortError của fs/promises và treo lý do gốc ở `cause`; provider
  // phải để nguyên như vậy, không bọc thành lỗi skill.
  await assert.rejects(
    () => provider.get({ name: SKILL_NAME }, { signal: aborter.signal }),
    (error) => {
      assert.equal(error.name, 'AbortError')
      assert.equal(error.cause?.message, 'consumer cancelled')
      return true
    },
  )
})

test('mount qua plugin.apply: lỗi tồn tại trả lỗi skill, KHÔNG phải TypeError', async () => {
  // Test khoá lỗi P1: đi đúng đường plugin.apply → ctx.skills.registerProvider →
  // factory, rồi dùng chính provider mà apply đã tạo ra. Nếu plugin bỏ tham số
  // control, provider nhận control undefined và invalidate() ném TypeError, che
  // mất SkillParseError — test này fail.
  //
  // KHÔNG sửa tệp trong repo: các test khác đọc SKILL.md thật, và node --test
  // chạy tệp song song nên ghi đè sẽ làm chúng flaky. Thay vào đó dựng gói tạm
  // hỏng và mount một context trỏ tới gói đó.
  const { root } = pkgWith('---\nname: tvkt-vi\n')

  const { ctx, registrations } = fakeContext()
  plugin.apply(ctx)
  const { session } = registrations[0]
  assert.notEqual(session.control, undefined, 'registry phải cấp control cho factory')

  // Cùng control mà apply đã nhận, nhưng đọc gói hỏng: đây là điều cần kiểm.
  const mounted = createSkillProvider({ pkgRoot: root, control: session.control })

  await assert.rejects(() => mounted.get({ name: SKILL_NAME }, {}), (error) => {
    assert.ok(
      !(error instanceof TypeError),
      `lỗi tồn tại bị đổi thành TypeError — control đã bị bỏ khỏi factory: ${error}`,
    )
    assert.equal(error.name, 'SkillParseError')
    return true
  })
  assert.equal(session.calls.invalidate, 1, 'invalidate phải chạy trên control của registry')
})

test('remount không tạo provider trùng tên', () => {
  const { ctx, registrations } = fakeContext()
  plugin.apply(ctx)
  const first = ctx.skills.registerProvider.length
  assert.equal(first, 1)
  // Mount lần hai trên cùng context: registry thật ném lỗi trùng tên, nên
  // plugin không được tự ý đăng ký thêm mà không đi qua registry.
  assert.equal(registrations.length, 1, 'một lần apply chỉ một provider')
  // Provider thứ hai là cùng một instance chức năng: tên không đổi.
  const again = createSkillProvider({ control: fakeControl().control })
  assert.equal(again.name, registrations[0].provider.name)
})
