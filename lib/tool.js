/**
 * Tool `tvkt_lint` — model gọi được, chạy linter TVKT trong workspace.
 *
 * Vì sao có tool này: nếu chỉ có skill, model phải tự tìm package path của host
 * rồi chạy `python3 <đường dẫn tuyệt đối>`. Đường đó không kiểm soát được: model
 * có thể trỏ ra ngoài workspace, đặt biến môi trường `TVKT_HOME`, hoặc chạy
 * Python tuỳ ý. Tool này giữ toàn bộ phần bất định đó ở phía plugin.
 *
 * Hợp đồng lấy từ target `@deepseek-ai/dsh@0.2.2-rc.2`, không phải từ trí nhớ:
 *   - `ctx.tools.register(definition, options)`      → `dsh-tools/src/index.ts:128`
 *   - `defineTool({ name, description, parameters, output, execute, timeoutMs })`
 *                                                     → `dsh-tools/src/schema.ts:555`
 *   - `execute(args, exec: ToolRunContext)` với `exec.signal` và `exec.agent`
 *                                                     → `dsh-tools/src/contracts.ts:245`
 *   - `ctx.workingDirectory.ensure(agent, signal)`    → `dsh-working-directory/src/index.ts`
 *
 * Quy tắc an toàn được thi hành ở đây, có test tương ứng:
 *   - từ chối đường dẫn tuyệt đối và mọi `..` — không nhận path của máy;
 *   - resolve symlink rồi kiểm lại: đích cuối phải nằm trong workspace;
 *   - không đọc ngoài workspace kể cả khi đường dẫn workspace là symlink;
 *   - thời gian chờ cố định, gửi SIGTERM rồi SIGKILL, không để tiến trình mồ côi;
 *   - stdout/stderr bị chặn trần, không bao giờ đọc vô hạn;
 *   - argv là mảng: không nối chuỗi shell, không `shell: true`;
 *   - `TVKT_HOME` bị xoá khỏi môi trường con, dùng đúng bản trong gói;
 *   - "linter có finding" là kết quả bình thường; "tool lỗi" là lỗi thật.
 * @module dsh-tvkt-vi/tool
 */

import { spawn } from 'node:child_process'
import { realpath, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Gốc gói, tính từ tệp này. */
const PKG_ROOT = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '')

/** Tệp linter trong gói. Không bao giờ lấy từ biến môi trường. */
export const LINTER_FILE = path.join(PKG_ROOT, 'vendor', 'tvkt', 'tools', 'tvkt_lint.py')

/** Tên tool. */
export const TOOL_NAME = 'tvkt_lint'

/** Trần kích thước văn bản nhận qua tham số. */
export const MAX_INPUT_BYTES = 512 * 1024

/** Trần kích thước tệp được đọc trong workspace. */
export const MAX_FILE_BYTES = 256 * 1024

/** Trần thời gian một lần chạy linter. */
export const DEFAULT_TIMEOUT_MS = 15_000

/** Trần số byte đọc từ mỗi luồng của tiến trình con. */
export const MAX_STREAM_BYTES = 4 * 1024 * 1024

/** Mã lỗi nghiệp vụ, phân biệt với lỗi hệ thống. */
export const ERROR_CODES = {
  PATH_ABSOLUTE: 'TVKT_PATH_ABSOLUTE',
  PATH_ESCAPE: 'TVKT_PATH_ESCAPE',
  PATH_SYMLINK: 'TVKT_PATH_SYMLINK_ESCAPE',
  INPUT_TOO_LARGE: 'TVKT_INPUT_TOO_LARGE',
  INPUT_MISSING: 'TVKT_INPUT_MISSING',
  LINTER_FAILED: 'TVKT_LINTER_FAILED',
  LINTER_TIMEOUT: 'TVKT_LINTER_TIMEOUT',
  CANCELLED: 'TVKT_CANCELLED',
}

/** Lỗi có mã nghiệp vụ, để tầng trên phân loại được. */
export class TvtkToolError extends Error {
  /**
   * @param message - thông điệp hiển thị cho model.
   * @param code - mã trong {@link ERROR_CODES}.
   * @param cause - lỗi gốc nếu có.
   */
  constructor(message, code, cause) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'TvtkToolError'
    this.code = code
  }
}

/**
 * Kiểm tra đường dẫn tương đối của workspace và trả đường dẫn đã ghép.
 *
 * Từ chối trước khi chạm đĩa: đường dẫn tuyệt đối, `..`, ký tự NUL, đường dẫn
 * rỗng. Đây là lớp thứ nhất; lớp thứ hai là kiểm tra realpath sau khi resolve
 * symlink.
 * @param root - thư mục gốc workspace.
 * @param relative - đường dẫn model đưa.
 * @returns đường dẫn tuyệt đối nằm trong root.
 * @throws {TvtkToolError} khi đường dẫn không hợp lệ.
 */
export function resolveWorkspacePath(root, relative) {
  if (typeof relative !== 'string' || relative.trim() === '') {
    throw new TvtkToolError('path must be a non-empty workspace-relative path', ERROR_CODES.INPUT_MISSING)
  }
  if (relative.includes('\0')) {
    throw new TvtkToolError('path contains a NUL byte', ERROR_CODES.PATH_ESCAPE)
  }
  if (path.isAbsolute(relative) || /^[A-Za-z]:[\\/]/.test(relative)) {
    throw new TvtkToolError(
      `path must be workspace-relative, got an absolute path: ${relative}`,
      ERROR_CODES.PATH_ABSOLUTE)
  }
  const segments = relative.split(/[\\/]/).filter(segment => segment !== '' && segment !== '.')
  if (segments.some(segment => segment === '..')) {
    throw new TvtkToolError(`path must not traverse upward: ${relative}`, ERROR_CODES.PATH_ESCAPE)
  }
  const rootResolved = path.resolve(root)
  const target = path.resolve(rootResolved, ...segments)
  // Kiểm tra chuỗi trước khi chạm đĩa.
  if (target !== rootResolved && !target.startsWith(rootResolved + path.sep)) {
    throw new TvtkToolError(`path escapes the workspace: ${relative}`, ERROR_CODES.PATH_ESCAPE)
  }
  return target
}

/**
 * Kiểm tra lại sau khi resolve symlink: đích thật phải nằm trong workspace thật.
 * @param root - thư mục gốc workspace.
 * @param target - đường dẫn đã ghép.
 * @returns realpath của target.
 * @throws {TvtkToolError} khi symlink dẫn ra ngoài.
 */
export async function assertInsideWorkspace(root, target) {
  let realRoot
  let realTarget
  try {
    realRoot = await realpath(path.resolve(root))
  } catch (error) {
    throw new TvtkToolError('workspace directory is not accessible', ERROR_CODES.INPUT_MISSING, error)
  }
  try {
    realTarget = await realpath(target)
  } catch (error) {
    throw new TvtkToolError(
      `file does not exist in the workspace: ${path.relative(realRoot, target)}`,
      ERROR_CODES.INPUT_MISSING, error)
  }
  if (realTarget !== realRoot && !realTarget.startsWith(realRoot + path.sep)) {
    throw new TvtkToolError(
      'path resolves outside the workspace through a symlink',
      ERROR_CODES.PATH_SYMLINK)
  }
  return realTarget
}

/**
 * Đọc tệp trong workspace, có trần kích thước.
 * @param root - thư mục gốc workspace.
 * @param relative - đường dẫn tương đối.
 * @returns nội dung UTF-8 và đường dẫn hiển thị.
 * @throws {TvtkToolError} khi ra ngoài workspace, không phải tệp, hoặc quá lớn.
 */
export async function readWorkspaceFile(root, relative) {
  const joined = resolveWorkspacePath(root, relative)
  const real = await assertInsideWorkspace(root, joined)
  const info = await stat(real)
  if (!info.isFile()) {
    throw new TvtkToolError('path is not a regular file', ERROR_CODES.INPUT_MISSING)
  }
  if (info.size > MAX_FILE_BYTES) {
    throw new TvtkToolError(
      `file is ${info.size} bytes, above the ${MAX_FILE_BYTES} byte limit`,
      ERROR_CODES.INPUT_TOO_LARGE)
  }
  const text = await readFile(real, 'utf8')
  return { text, displayPath: path.relative(path.resolve(root), joined).split(path.sep).join('/') }
}

/**
 * Chạy linter với argv mảng, trần thời gian, huỷ theo signal, trần output.
 *
 * Không dùng `shell`. Tiến trình con nhận `TVKT_HOME` đã xoá nên nó dùng đúng
 * `config/` trong gói. Khi quá hạn hoặc bị huỷ: SIGTERM, rồi SIGKILL sau một
 * nhịp ngắn, và luôn `await` sự kiện `close` để không bỏ lại tiến trình mồ côi.
 * @param options - `{ text, timeoutMs, signal, stdinLabel }`.
 * @returns `{ code, stdout, stderr, timedOut, aborted }`.
 */
export function runLinter({ text, timeoutMs = DEFAULT_TIMEOUT_MS, signal, stdinLabel = '<text>' }) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    delete env.TVKT_HOME
    delete env.PYTHONPATH
    delete env.PYTHONSTARTUP

    const child = spawn(process.env.TVKT_PYTHON ?? 'python3', [LINTER_FILE, '-', '--format', 'json'], {
      cwd: path.join(PKG_ROOT, 'vendor', 'tvkt'),
      env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    const stdout = []
    const stderr = []
    let stdoutBytes = 0
    let stderrBytes = 0
    let overflow = false
    let timedOut = false
    let aborted = false
    let settled = false

    const kill = () => {
      if (child.exitCode !== null || child.signalCode !== null) return
      child.kill('SIGTERM')
      // Cho tiến trình một nhịp để thoát sạch; sau đó ép.
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      }, 250).unref?.()
    }

    const timer = setTimeout(() => { timedOut = true; kill() }, timeoutMs)
    timer.unref?.()

    const onAbort = () => { aborted = true; kill() }
    if (signal !== undefined) {
      if (signal.aborted) { onAbort() } else { signal.addEventListener('abort', onAbort, { once: true }) }
    }

    child.stdout.on('data', chunk => {
      stdoutBytes += chunk.length
      if (stdoutBytes > MAX_STREAM_BYTES) { overflow = true; kill(); return }
      stdout.push(chunk)
    })
    child.stderr.on('data', chunk => {
      stderrBytes += chunk.length
      if (stderrBytes > MAX_STREAM_BYTES) { overflow = true; kill(); return }
      stderr.push(chunk)
    })
    child.on('error', error => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new TvtkToolError(
        `cannot start the linter (${error.message})`, ERROR_CODES.LINTER_FAILED, error))
    })
    child.on('close', code => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (signal !== undefined) signal.removeEventListener('abort', onAbort)
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        timedOut,
        aborted,
        overflow,
        stdinLabel,
      })
    })

    // Ghi stdin; nếu tiến trình đã chết thì EPIPE là bình thường.
    child.stdin.on('error', () => {})
    child.stdin.end(text)
  })
}

/**
 * Phân tích stdout JSON của linter thành giá trị canonical cho tool.
 * @param raw - stdout thô.
 * @returns object kết quả.
 * @throws {TvtkToolError} khi stdout không phải JSON hợp lệ.
 */
export function parseLinterOutput(raw) {
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new TvtkToolError('linter produced unparsable output', ERROR_CODES.LINTER_FAILED, error)
  }
}

/**
 * Thực thi một lần gọi tool. Tách khỏi định nghĩa tool để test được không cần Cordis.
 *
 * Phân biệt hai kết quả rất khác nhau:
 *   - `ok: true, lint_status: 'PASS'` — không có finding;
 *   - `ok: true, lint_status: 'FINDINGS'` — có finding, đây KHÔNG phải lỗi tool.
 * Lỗi tool chỉ xảy ra khi không đọc được tệp, linter không chạy được, quá hạn
 * hoặc bị huỷ; khi đó hàm ném {@link TvtkToolError}.
 * @param args - `{ path?, text?, mode? }`.
 * @param options - `{ root, signal, timeoutMs }`.
 * @returns kết quả canonical.
 */
export async function executeLint(args, { root, signal, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const hasPath = typeof args?.path === 'string' && args.path !== ''
  const hasText = typeof args?.text === 'string'

  if (hasPath && hasText) {
    throw new TvtkToolError('provide either path or text, not both', ERROR_CODES.INPUT_MISSING)
  }
  if (!hasPath && !hasText) {
    throw new TvtkToolError('provide one of path or text', ERROR_CODES.INPUT_MISSING)
  }

  let text
  let displayPath
  if (hasText) {
    if (Buffer.byteLength(args.text, 'utf8') > MAX_INPUT_BYTES) {
      throw new TvtkToolError(
        `text is above the ${MAX_INPUT_BYTES} byte limit`, ERROR_CODES.INPUT_TOO_LARGE)
    }
    text = args.text
    displayPath = '<text>'
  } else {
    const read = await readWorkspaceFile(root, args.path)
    text = read.text
    displayPath = read.displayPath
  }

  const run = await runLinter({ text, timeoutMs, signal })
  if (run.aborted) {
    throw new TvtkToolError('lint cancelled by the caller', ERROR_CODES.CANCELLED)
  }
  if (run.timedOut) {
    throw new TvtkToolError(
      `linter exceeded ${timeoutMs} ms and was terminated`, ERROR_CODES.LINTER_TIMEOUT)
  }
  if (run.overflow) {
    throw new TvtkToolError('linter output exceeded the size limit', ERROR_CODES.LINTER_FAILED)
  }
  if (run.code !== 0) {
    throw new TvtkToolError(
      `linter exited with code ${run.code}: ${run.stderr.trim().slice(0, 500)}`,
      ERROR_CODES.LINTER_FAILED)
  }

  const result = parseLinterOutput(run.stdout)
  const findings = Array.isArray(result.findings) ? result.findings : []
  return {
    ok: true,
    file: displayPath,
    lint_status: String(result.lint_status ?? (findings.length === 0 ? 'PASS' : 'FINDINGS')),
    summary: {
      error: Number(result.summary?.ERROR ?? 0),
      warning: Number(result.summary?.WARNING ?? 0),
      info: Number(result.summary?.INFO ?? 0),
    },
    findings: findings.map(finding => ({
      rule_id: String(finding.rule_id ?? ''),
      severity: String(finding.severity ?? 'INFO'),
      line: Number(finding.line ?? 0),
      message: String(finding.message ?? ''),
      suggestion: typeof finding.suggestion === 'string' ? finding.suggestion : '',
    })),
    semantic_review: String(result.semantic_review ?? 'NOT_RUN'),
    technical_verification: String(result.technical_verification ?? 'NOT_RUN'),
  }
}

/**
 * Định nghĩa tool theo `defineTool` của target.
 *
 * `timeoutMs` khai ở đây là hợp đồng hợp tác: tool thật sự chuyển `exec.signal`
 * xuống tiến trình con và dừng được khi bị abort.
 * @param options - `{ contextLimit? }` cho phần mô tả.
 * @returns tham số cho `ctx.tools.register()`.
 */
export function toolOptions() {
  return {
    name: TOOL_NAME,
    description:
      'Lint Vietnamese technical text against the bundled TVKT-100 rules L001-L007. '
      + 'Pass a workspace-relative `path` or explicit `text`. '
      + 'Returns lint findings; findings are a normal result, not an error. '
      + 'A PASS covers only rules L001-L007: it does not certify TVKT-100 compliance '
      + 'and does not verify technical correctness.',
    parameters: {
      path: {
        type: 'string',
        description: 'Workspace-relative path to a Markdown file. Absolute paths are rejected.',
      },
      text: {
        type: 'string',
        description: 'Inline text to lint instead of a file.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          file: { type: 'string', required: true },
          lint_status: { type: 'string', required: true, enum: ['PASS', 'FINDINGS'] },
          summary: {
            type: 'object',
            required: true,
            additionalProperties: false,
            properties: {
              error: { type: 'integer', required: true },
              warning: { type: 'integer', required: true },
              info: { type: 'integer', required: true },
            },
          },
          findings: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                rule_id: { type: 'string', required: true },
                severity: { type: 'string', required: true },
                line: { type: 'integer', required: true },
                message: { type: 'string', required: true },
                suggestion: { type: 'string', required: true },
              },
            },
          },
          semantic_review: { type: 'string', required: true },
          technical_verification: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `TVKT lint ${value.file}: ${value.lint_status} — `
          + `${value.summary.error} ERROR, ${value.summary.warning} WARNING, ${value.summary.info} INFO. `
          + 'Scope: rules L001-L007 only; semantic review NOT_RUN; technical verification NOT_RUN.',
      }],
    },
    timeoutMs: DEFAULT_TIMEOUT_MS,
  }
}
