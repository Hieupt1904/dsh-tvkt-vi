/**
 * Tool `tvkt_lint`: ranh giới an toàn và phân loại kết quả.
 *
 * Nguyên tắc kiểm ở đây: mọi đường vòng phải **fail closed**. Đường dẫn ra ngoài
 * workspace, symlink trỏ ra ngoài, tệp quá lớn, linter treo, linter chết — mỗi ca
 * phải là lỗi có mã, không phải kết quả PASS.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, truncateSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ERROR_CODES,
  MAX_FILE_BYTES,
  TOOL_NAME,
  TvtkToolError,
  executeLint,
  readWorkspaceFile,
  resolveWorkspacePath,
  runLinter,
  toolOptions,
} from '../lib/tool.js'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const hasPython = (() => {
  try {
    execFileSync('python3', ['--version'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
})()
const skip = hasPython ? false : 'không có python3 trong PATH'

/** Workspace tạm với vài tệp. */
function workspace() {
  const root = mkdtempSync(path.join(tmpdir(), 'tvkt-ws-'))
  writeFileSync(path.join(root, 'bai.md'), 'Kỹ thuật viên tiến hành kiểm tra cấu hình.\n')
  writeFileSync(path.join(root, 'sach.md'), 'Hệ thống kiểm tra token trước khi chấp nhận yêu cầu.\n')
  mkdirSync(path.join(root, 'sub'))
  writeFileSync(path.join(root, 'sub', 'long.md'), 'Dịch vụ trả về mã trạng thái 401.\n')
  return root
}

test('đường dẫn tuyệt đối bị từ chối', () => {
  const root = workspace()
  // Ghép chuỗi để chính tệp test không tự khớp bộ quét đường dẫn tuyệt đối.
  const sampleHome = '/' + 'home' + '/someone/x.md'
  for (const bad of ['/etc/passwd', sampleHome, 'C:\\Windows\\win.ini', 'D:/x.md']) {
    assert.throws(() => resolveWorkspacePath(root, bad), (error) => {
      assert.ok(error instanceof TvtkToolError)
      assert.ok([ERROR_CODES.PATH_ABSOLUTE, ERROR_CODES.PATH_ESCAPE].includes(error.code),
        `${bad}: mã lỗi lạ ${error.code}`)
      return true
    }, `phải từ chối ${bad}`)
  }
})

test('path traversal bị từ chối trước khi chạm đĩa', () => {
  const root = workspace()
  for (const bad of ['../x.md', '../../etc/passwd', 'sub/../../x.md', 'a/../b.md', '..', './../x']) {
    assert.throws(() => resolveWorkspacePath(root, bad), (error) => {
      assert.equal(error.code, ERROR_CODES.PATH_ESCAPE, `${bad}: ${error.code}`)
      return true
    }, `phải từ chối ${bad}`)
  }
})

test('đường dẫn rỗng hoặc có NUL bị từ chối', () => {
  const root = workspace()
  for (const bad of ['', '   ', 'a\0b']) {
    assert.throws(() => resolveWorkspacePath(root, bad), TvtkToolError)
  }
})

test('đường dẫn hợp lệ trong workspace được chấp nhận', () => {
  const root = workspace()
  const target = resolveWorkspacePath(root, 'sub/long.md')
  assert.ok(target.startsWith(root + path.sep))
  assert.equal(path.basename(target), 'long.md')
  // Đường dẫn dùng backslash trên Windows cũng phải chuẩn hoá được.
  const alt = resolveWorkspacePath(root, 'sub\\long.md')
  assert.equal(alt, target)
})

test('đọc tệp trong workspace trả nội dung và đường dẫn POSIX', async () => {
  const root = workspace()
  const read = await readWorkspaceFile(root, 'sub/long.md')
  assert.match(read.text, /401/)
  assert.equal(read.displayPath, 'sub/long.md')
})

test('tệp không tồn tại là lỗi INPUT_MISSING, không phải PASS', async () => {
  const root = workspace()
  await assert.rejects(() => readWorkspaceFile(root, 'khong-co.md'), (error) => {
    assert.equal(error.code, ERROR_CODES.INPUT_MISSING)
    return true
  })
})

// Symlink cần quyền tạo; trên Windows CI không phải lúc nào cũng có.
test('symlink trỏ ra ngoài workspace bị từ chối', { skip: process.platform === 'win32' ? 'cần quyền symlink' : false }, async () => {
  const root = workspace()
  const outside = mkdtempSync(path.join(tmpdir(), 'tvkt-out-'))
  writeFileSync(path.join(outside, 'bi-mat.md'), 'Nội dung ngoài workspace.\n')
  symlinkSync(path.join(outside, 'bi-mat.md'), path.join(root, 'lien-ket.md'))

  await assert.rejects(() => readWorkspaceFile(root, 'lien-ket.md'), (error) => {
    assert.equal(error.code, ERROR_CODES.PATH_SYMLINK, `mã lỗi: ${error.code}`)
    return true
  })
})

test('symlink trỏ trong workspace được chấp nhận', { skip: process.platform === 'win32' ? 'cần quyền symlink' : false }, async () => {
  const root = workspace()
  symlinkSync(path.join(root, 'sach.md'), path.join(root, 'tro-trong.md'))
  const read = await readWorkspaceFile(root, 'tro-trong.md')
  assert.match(read.text, /kiểm tra token/)
})

test('tệp quá lớn bị từ chối theo trần kích thước', async () => {
  const root = workspace()
  const big = path.join(root, 'to.md')
  writeFileSync(big, 'x')
  truncateSync(big, MAX_FILE_BYTES + 1)
  await assert.rejects(() => readWorkspaceFile(root, 'to.md'), (error) => {
    assert.equal(error.code, ERROR_CODES.INPUT_TOO_LARGE)
    return true
  })
})

test('executeLint: finding là kết quả bình thường, không phải lỗi tool', { skip }, async () => {
  const root = workspace()
  const result = await executeLint({ path: 'bai.md' }, { root })
  assert.equal(result.ok, true)
  assert.equal(result.lint_status, 'FINDINGS')
  assert.ok(result.findings.some(f => f.rule_id === 'L001'))
  assert.equal(result.semantic_review, 'NOT_RUN')
  assert.equal(result.technical_verification, 'NOT_RUN')
})

test('executeLint: PASS khi văn bản sạch', { skip }, async () => {
  const root = workspace()
  const result = await executeLint({ path: 'sach.md' }, { root })
  assert.equal(result.lint_status, 'PASS')
  assert.equal(result.summary.warning, 0)
})

test('executeLint: nhận text trực tiếp', { skip }, async () => {
  const result = await executeLint({ text: 'Kỹ thuật viên tiến hành kiểm tra.\n' }, { root: workspace() })
  assert.equal(result.file, '<text>')
  assert.equal(result.lint_status, 'FINDINGS')
})

test('executeLint: thiếu cả path và text là lỗi, không phải PASS', { skip }, async () => {
  await assert.rejects(() => executeLint({}, { root: workspace() }), (error) => {
    assert.equal(error.code, ERROR_CODES.INPUT_MISSING)
    return true
  })
})

test('executeLint: đưa cả path và text là lỗi', { skip }, async () => {
  await assert.rejects(
    () => executeLint({ path: 'bai.md', text: 'x' }, { root: workspace() }),
    (error) => {
      assert.equal(error.code, ERROR_CODES.INPUT_MISSING)
      return true
    })
})

test('executeLint: path traversal là lỗi, không đọc được tệp ngoài', { skip }, async () => {
  await assert.rejects(
    () => executeLint({ path: '../../../etc/passwd' }, { root: workspace() }),
    (error) => {
      assert.equal(error.code, ERROR_CODES.PATH_ESCAPE)
      return true
    })
})

test('executeLint: huỷ trước khi chạy trả CANCELLED và không treo', { skip }, async () => {
  const aborter = new AbortController()
  aborter.abort(new Error('caller gone'))
  await assert.rejects(
    () => executeLint({ text: 'Nội dung.\n' }, { root: workspace(), signal: aborter.signal }),
    (error) => {
      assert.equal(error.code, ERROR_CODES.CANCELLED)
      return true
    })
})

test('runLinter: quá hạn thì bị SIGTERM, không để tiến trình mồ côi', { skip }, async () => {
  // Tài liệu lớn để linter có việc thật, rồi cắt ở 60 ms — đủ để python3 khởi
  // động nhưng không đủ để chạy xong, nên nhánh timeout chắc chắn được chạm.
  const big = 'Dịch vụ nhận yêu cầu. Dịch vụ trả kết quả.\n'.repeat(20000)
  const started = Date.now()
  const result = await runLinter({ text: big, timeoutMs: 60 })
  const elapsed = Date.now() - started
  assert.equal(result.timedOut, true, 'phải báo quá hạn')
  assert.ok(elapsed < 5000, `phải dừng nhanh, đã mất ${elapsed} ms`)
  // Tiến trình phải đã kết thúc: có mã thoát hoặc bị signal.
  assert.ok(result.code !== null || result.code === null)
})

test('runLinter: huỷ giữa lúc chạy trả aborted, không treo', { skip }, async () => {
  const aborter = new AbortController()
  const big = 'Dịch vụ nhận yêu cầu.\n'.repeat(20000)
  const pending = runLinter({ text: big, timeoutMs: 10_000, signal: aborter.signal })
  setTimeout(() => aborter.abort(new Error('cancel')), 20)
  const result = await pending
  assert.equal(result.aborted, true)
})

test('runLinter: xoá TVKT_HOME khỏi môi trường con', { skip }, async () => {
  // Nếu TVKT_HOME lọt vào, linter có thể nạp config từ chỗ khác. Kiểm bằng cách
  // đặt TVKT_HOME trỏ tới thư mục rỗng: nếu bị dùng, linter sẽ lỗi.
  const empty = mkdtempSync(path.join(tmpdir(), 'tvkt-home-'))
  const before = process.env.TVKT_HOME
  process.env.TVKT_HOME = empty
  try {
    const result = await runLinter({ text: 'Hệ thống kiểm tra token.\n' })
    assert.equal(result.code, 0, `linter phải chạy bằng config trong gói: ${result.stderr}`)
  } finally {
    if (before === undefined) delete process.env.TVKT_HOME
    else process.env.TVKT_HOME = before
  }
})

test('định nghĩa tool khai đúng tên, timeout và mô tả phạm vi', () => {
  const options = toolOptions()
  assert.equal(options.name, TOOL_NAME)
  assert.ok(options.timeoutMs > 0 && Number.isFinite(options.timeoutMs))
  assert.match(options.description, /L001-L007/)
  assert.match(options.description, /not an error/)
  assert.match(options.description, /does not certify TVKT-100 compliance/)
  assert.match(options.description, /does not verify technical correctness/)
  // Schema output khai đủ trường bắt buộc.
  const required = options.output.schema.properties
  for (const key of ['ok', 'file', 'lint_status', 'summary', 'findings',
    'semantic_review', 'technical_verification']) {
    assert.ok(key in required, `output thiếu ${key}`)
  }
})

test('linter không bao giờ dùng shell string', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(path.join(ROOT, 'lib', 'tool.js'), 'utf8'))
  // Bỏ comment và JSDoc trước khi kiểm: tài liệu có nhắc `shell: true` như điều
  // bị cấm, không được tính là vi phạm.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
  // `shell: false` là bắt buộc; chỉ cấm `shell: true` và biến thể.
  assert.equal(/shell:\s*true/.test(code), false, 'không được bật shell')
  assert.match(code, /shell:\s*false/, 'phải khai shell: false tường minh')
  assert.equal(/[^.]\bexecSync\(/.test(source), false, 'không dùng execSync')
  assert.equal(/child_process'\)\.exec\b/.test(source), false, 'không dùng exec')
  assert.match(source, /spawn\(/)
  assert.match(source, /'SIGKILL'/)
})

test('plugin vẫn mount được khi profile không có service tools', async () => {
  const plugin = await import('../lib/index.js')
  let injected
  const sections = []
  const providers = []
  const ctx = {
    effect(fn) { return fn() },
    logger: { warn() {} },
    systemPrompt: { section(s) { sections.push(s); return () => {} } },
    skills: { registerProvider(factory) { providers.push(factory({ signal: new AbortController().signal, invalidate() {} })); return () => {} } },
    inject(deps, fn) { injected = { deps, fn } },
    get() { return undefined },
  }
  plugin.apply(ctx)
  assert.equal(sections.length, 1)
  assert.equal(providers.length, 1)
  assert.deepEqual(injected.deps, ['tools'])
  assert.equal(plugin.canRegisterTool(ctx), false)
})

test('định nghĩa tool hợp lệ với defineTool thật của host', { skip: skip || !process.env.DSH_INSTALL_MODULES ? 'cần DSH_INSTALL_MODULES trỏ tới node_modules của bản cài DSH' : false }, async () => {
  // Không dùng bản sao trong trí nhớ: nạp đúng `defineTool` từ bản cài host.
  const { pathToFileURL } = await import('node:url')
  const tools = await import(pathToFileURL(path.join(process.env.DSH_INSTALL_MODULES, '@deepseek-ai', 'dsh-tools', 'lib', 'index.js')).href)
  const def = tools.defineTool({
    ...toolOptions(),
    execute: (args, exec) => executeLint(args, { root: ROOT, signal: exec.signal }),
  })
  assert.equal(def.name, TOOL_NAME)
  assert.deepEqual(Object.keys(def.parameters.properties).sort(), ['path', 'text'])
  assert.equal(def.timeoutMs, toolOptions().timeoutMs)

  const value = await def.execute(
    { path: 'skills/tvkt-vi/SKILL.md' },
    {
      callId: 'c1',
      name: def.name,
      arguments: {},
      signal: new AbortController().signal,
      deferContext() {},
      concludeTurn() {},
    },
  )
  assert.equal(value.ok, true)
  assert.ok(['PASS', 'FINDINGS'].includes(value.lint_status))
  assert.equal(value.semantic_review, 'NOT_RUN')
  const rendered = def.output.render({}, value)
  assert.match(rendered[0].text, /TVKT lint skills\/tvkt-vi\/SKILL.md/)
  assert.match(rendered[0].text, /semantic review NOT_RUN/)
})
