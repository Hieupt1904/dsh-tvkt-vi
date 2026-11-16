/**
 * Provider skill `tvkt-vi` cho registry của DSH.
 *
 * Vì sao dùng provider thay vì `ctx.skills.register()`: bản đăng ký runtime giữ
 * thân skill trong bộ nhớ từ lúc mount, nên sửa `SKILL.md` phải restart mới thấy.
 * Provider đọc tệp trong `get()`, đúng hợp đồng "definitions are never cached —
 * every load asks the provider for the current body".
 *
 * Mẫu theo `@deepseek-ai/dsh-skill-office`: đọc bất đồng bộ có `signal`, phân
 * biệt lỗi tạm thời với lỗi tồn tại (dùng `complete: false` và `invalidate()`),
 * và trả `resourceBase` dạng POSIX để consumer giải liên kết tương đối trên
 * mọi nền tảng. Lỗi hiển thị cho người dùng bằng tiếng Anh, như mọi chẩn đoán
 * của host.
 * @module dsh-tvkt-vi/skill
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Tên skill. */
export const SKILL_NAME = 'tvkt-vi'

/** Tên provider — registry dành riêng `runtime` nên không được trùng. */
export const PROVIDER_NAME = 'tvkt-vi'

/**
 * Hạng ưu tiên khi trùng tên. Registry xếp **hạng thấp thắng**, xếp tăng dần:
 * project 100/200 → runtime 250 → **provider này 300** → user 400 → bundled 600.
 * Ở mức 300, bản trong project (100/200) và bản đăng ký runtime (250) đều đè
 * được plugin, còn bản chép tay trong `~/.dsh/skills` (400) thì không — nhờ vậy
 * chỉ một bản trong gói được dùng, tránh hai bản lệch nội dung.
 */
export const SKILL_RANK = 300

/** Mô tả skill — thứ agent đọc trong catalog để quyết định nạp. Phải ngắn. */
export const SKILL_DESCRIPTION =
  'Soạn, rà và chuẩn hóa tiếng Việt kỹ thuật theo bộ TVKT-100 (30 quy tắc, 70 thuật ngữ, '
  + 'linter L001-L007). Dùng khi viết hoặc sửa tài liệu tiếng Việt, README, hướng dẫn vận hành, '
  + 'thông báo lỗi, mô tả API, tiêu chí kiểm thử, hoặc khi câu trả lời tiếng Việt cần chuẩn và '
  + "dễ hiểu hơn. Cũng dùng khi người dùng nói 'viết lại cho chuẩn', 'dịch sang tiếng Việt kỹ "
  + "thuật', 'rà lại tiếng Việt', 'TVKT'."

/** Gốc gói, tính từ tệp này. */
const PKG_ROOT = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '')

/** Thư mục và tệp của skill trong gói. */
export function skillPaths(pkgRoot = PKG_ROOT) {
  const dir = path.join(pkgRoot, 'skills', SKILL_NAME)
  return { dir, file: path.join(dir, 'SKILL.md') }
}

/** Lỗi parse frontmatter: sửa tệp mới khỏi, nên coi là lỗi tồn tại. */
class SkillParseError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SkillParseError'
  }
}

/**
 * Cắt frontmatter YAML khỏi thân skill.
 *
 * Skill nằm trong gói nên metadata đã nằm ở hằng số; giữ frontmatter sẽ làm
 * thân tệp mang theo một khối YAML mà agent đọc như nội dung.
 * @param raw - toàn văn SKILL.md.
 * @param file - đường dẫn, chỉ dùng trong thông điệp lỗi.
 * @returns thân skill không frontmatter.
 * @throws {Error} khi frontmatter mở mà không đóng.
 */
export function parseSkill(raw, file = 'SKILL.md') {
  const text = raw.replace(/^\uFEFF/, '')
  if (!text.startsWith('---\n')) return text
  // Dòng đóng phải là một dòng chỉ có '---'; chuỗi '---x' không kết thúc frontmatter.
  const close = /\r?\n---[ \t]*(?:\r?\n|$)/.exec(text.slice(4))
  if (close === null) throw new SkillParseError(`${file}: unterminated frontmatter`)
  // Cắt luôn dòng trống ngay sau frontmatter để thân skill bắt đầu bằng tiêu đề.
  return text.slice(4 + close.index + close[0].length).replace(/^\r?\n/, '')
}

/**
 * Đọc thân skill bất đồng bộ, tôn trọng `signal`.
 *
 * Thân skill trong repo không chứa đường dẫn tuyệt đối (để chép tay vào
 * `~/.dsh/skills` vẫn dùng được). Khi trả cho agent, nối thêm một dòng chỉ
 * đúng thư mục tham chiếu trên máy đang chạy.
 * @param pkgRoot - gốc gói.
 * @param signal - tín hiệu huỷ của consumer.
 * @returns thân skill đã cắt frontmatter và nối đường dẫn thư mục.
 */
export async function readSkillBody(pkgRoot = PKG_ROOT, signal) {
  const { dir, file } = skillPaths(pkgRoot)
  let raw
  try {
    raw = await readFile(file, { encoding: 'utf8', signal })
  } catch (error) {
    // Huỷ theo signal là đường đi bình thường: ném nguyên lỗi abort.
    if (signal?.aborted === true) throw error
    throw wrapSkillError(`cannot read skill "${SKILL_NAME}" at ${file}`, error, 'SkillReadError')
  }
  return `${parseSkill(raw, file).trimEnd()}\n\n---\n\nFolder holding this skill's files: \`${dir}\`\n`
}

/**
 * Bản mô tả skill cho catalog. Đồng bộ: chỉ dựng từ hằng số và đường dẫn.
 * @param pkgRoot - gốc gói.
 * @returns candidate kèm locator cho `get()`.
 */
export function skillCandidate(pkgRoot = PKG_ROOT) {
  const { dir, file } = skillPaths(pkgRoot)
  return {
    name: SKILL_NAME,
    description: SKILL_DESCRIPTION,
    // Skill nằm trong gói plugin nên nguồn là `bundled`; hạng ưu tiên riêng.
    source: 'bundled',
    provider: PROVIDER_NAME,
    rank: SKILL_RANK,
    invocation: { modelInvocable: true, userInvocable: true },
    locator: file,
    path: file,
    // POSIX separators: consumer ghép liên kết tương đối trên mọi nền tảng.
    resourceBase: { kind: 'directory', path: dir.split(path.sep).join('/') },
    metadata: { version: '0.5.0', standard: 'TVKT-100 v1.0' },
  }
}

/** Lỗi đọc có còn tồn tại sau khi sửa tệp không (quyền, sai chỗ) hay sẽ tự khỏi. */
function isPersistent(error) {
  const code = error?.code
  return code === 'EACCES' || code === 'EPERM' || code === 'ENOTDIR'
}

/**
 * Dựng một lỗi mang đủ ngữ cảnh mà không bọc lại lỗi gốc thành một kiểu khác.
 *
 * `cause` giữ lỗi gốc để `console` và log của host in được chuỗi nhân quả; khi
 * môi trường không nhận `cause` thì vẫn còn `originalName` và `originalCode`.
 * Mục tiêu là không bao giờ biến lỗi tồn tại (parse, quyền) thành TypeError.
 * @param message - thông điệp hiển thị cho người vận hành.
 * @param error - lỗi gốc.
 * @param name - tên lớp lỗi của plugin.
 * @returns lỗi mới giữ nguyên thông điệp gốc ở phần đuôi.
 */
function wrapSkillError(message, error, name) {
  const detail = error instanceof Error ? error.message : String(error)
  const wrapped = new Error(`${message}: ${detail}`, { cause: error })
  wrapped.name = name
  if (error && typeof error === 'object') {
    if (typeof error.code === 'string') wrapped.code = error.code
    if (error.name) wrapped.originalName = error.name
  }
  return wrapped
}

/**
 * Provider cho `ctx.skills.registerProvider()`.
 *
 * `control` do registry cấp cho từng lần đăng ký (`signal` + `invalidate`).
 * Provider phải giữ đúng đối tượng đó: `invalidate()` chỉ có tác dụng khi
 * registration còn sống, và gọi nó sau `dispose()` là vô hại theo hợp đồng
 * upstream. Vì vậy ở đây chỉ gọi `invalidate()` khi registry thực sự đã truyền
 * control, không bao giờ gọi trên giá trị undefined.
 *
 * Lỗi đọc và lỗi huỷ theo signal được ném lại nguyên vẹn, nên cause gốc còn
 * trong `SkillReadError.cause`. Lỗi parse frontmatter ném `SkillParseError`.
 * @param options - `{ pkgRoot, logger, control }`; logger nhận cảnh báo một lần mỗi lỗi.
 * @returns provider hợp lệ theo `SkillProvider`.
 */
export function createSkillProvider({ pkgRoot = PKG_ROOT, logger, control } = {}) {
  const reported = new Map()

  /** Còn sống theo lời registry nói, và registry có cấp control hay không. */
  function registrationLive() {
    return control !== undefined && control.signal?.aborted !== true
  }

  async function readWithState(signal) {
    try {
      const content = await readSkillBody(pkgRoot, signal)
      reported.clear()
      return { kind: 'loaded', content }
    } catch (error) {
      // Huỷ theo signal của consumer không phải lỗi của skill.
      if (signal?.aborted === true) throw error
      const persistent = error instanceof SkillParseError || isPersistent(error)
      const failure = String(error?.message ?? error)
      if (reported.get('read') !== failure) {
        reported.set('read', failure)
        logger?.warn?.(`dsh-tvkt-vi: skill "${SKILL_NAME}" is unavailable: ${failure}`)
      }
      return { kind: 'failed', error, persistent }
    }
  }

  return {
    name: PROVIDER_NAME,
    async list(options = {}) {
      const read = await readWithState(options.signal)
      // Lỗi đọc làm discovery KHÔNG hoàn tất, trừ khi lỗi tồn tại: như vậy
      // registry trả incomplete và tự thử lại thay vì ghim một catalog rỗng.
      if (read.kind === 'failed') {
        return { candidates: read.persistent ? [] : [skillCandidate(pkgRoot)], complete: read.persistent }
      }
      return [skillCandidate(pkgRoot)]
    },
    async get(candidate, options = {}) {
      if (candidate?.name !== SKILL_NAME) return undefined
      const { rank: _rank, locator: _locator, ...summary } = skillCandidate(pkgRoot)
      const read = await readWithState(options.signal)
      if (read.kind === 'failed') {
        // Entry đã được liệt kê hợp lệ nên đây là lỗi của lần nạp này, kể cả
        // khi là lỗi tồn tại: ném ra để consumer biết, và dọn catalog để lần
        // đọc sau không còn entry này. `invalidate()` chỉ gọi khi registration
        // còn sống — sau dispose thì catalog không còn gì để dọn.
        if (read.persistent && registrationLive()) control.invalidate()
        throw read.error
      }
      return { ...summary, content: read.content }
    },
  }
}
