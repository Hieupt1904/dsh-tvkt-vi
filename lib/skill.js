/**
 * Provider skill `tvkt-vi` cho registry của DSH.
 *
 * Vì sao dùng provider thay vì `ctx.skills.register()`: bản đăng ký runtime giữ
 * thân skill trong bộ nhớ từ lúc mount, nên sửa `SKILL.md` phải restart mới thấy.
 * Provider đọc tệp trong `get()`, đúng hợp đồng "definitions are never cached —
 * every load asks the provider for the current body", nên sửa nội dung là nhận
 * ngay ở lần nạp kế tiếp mà không cần remount.
 * @module dsh-tvkt-vi/skill
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Tên skill và tên provider dùng trong registry. */
export const SKILL_NAME = 'tvkt-vi'

/** Tên provider — không được trùng `runtime` (tên dành riêng của registry). */
export const PROVIDER_NAME = 'tvkt-vi'

/**
 * Hạng ưu tiên khi trùng tên. Registry xếp **hạng thấp thắng**, xếp tăng dần:
 * project 100/200 → runtime 250 → **provider này 300** → user 400 → bundled 600.
 * Ở mức 300, bản trong project (100/200) và bản đăng ký runtime (250) đều đè
 * được plugin, còn bản chép tay trong `~/.dsh/skills` (400) thì không — nhờ vậy
 * chỉ một bản trong gói được dùng, tránh hai bản lệch nội dung.
 */
export const SKILL_RANK = 300

/** Gốc gói, tính từ tệp này. */
const PKG_ROOT = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '')

/** Mô tả skill — thứ agent đọc trong catalog để quyết định nạp. Phải ngắn. */
export const SKILL_DESCRIPTION =
  'Soạn, rà và chuẩn hóa tiếng Việt kỹ thuật theo bộ TVKT-100 (30 quy tắc, 70 thuật ngữ, '
  + 'linter L001-L007). Dùng khi viết hoặc sửa tài liệu tiếng Việt, README, hướng dẫn vận hành, '
  + 'thông báo lỗi, mô tả API, tiêu chí kiểm thử, hoặc khi câu trả lời tiếng Việt cần chuẩn và '
  + "dễ hiểu hơn. Cũng dùng khi người dùng nói 'viết lại cho chuẩn', 'dịch sang tiếng Việt kỹ "
  + "thuật', 'rà lại tiếng Việt', 'TVKT'."

/** Thư mục và tệp của skill trong gói. */
export function skillPaths(pkgRoot = PKG_ROOT) {
  const dir = path.join(pkgRoot, 'skills', SKILL_NAME)
  return { dir, file: path.join(dir, 'SKILL.md') }
}

/**
 * Đọc thân skill từ đĩa. Gọi lại mỗi lần nạp để sửa tệp là thấy ngay.
 *
 * Thân skill trong repo không chứa đường dẫn tuyệt đối (để chép tay vào
 * `~/.dsh/skills` vẫn dùng được). Khi trả cho agent, nối thêm một dòng chỉ
 * đúng thư mục tham chiếu trên máy đang chạy.
 * @param {string} [pkgRoot] - gốc gói.
 * @returns {string} thân skill hoàn chỉnh.
 */
export function readSkillBody(pkgRoot = PKG_ROOT) {
  const { dir, file } = skillPaths(pkgRoot)
  const body = readFileSync(file, 'utf8')
  return `${body.trimEnd()}\n\n---\n\nThư mục tệp của skill trên máy này: \`${dir}\`\n`
}

/**
 * Bản mô tả skill cho catalog.
 * @param {string} [pkgRoot] - gốc gói.
 * @returns {object} candidate kèm locator cho `get()`.
 */
export function skillCandidate(pkgRoot = PKG_ROOT) {
  const { dir, file } = skillPaths(pkgRoot)
  return {
    name: SKILL_NAME,
    description: SKILL_DESCRIPTION,
    // Skill nằm trong gói plugin nên nguồn là `bundled`; hạng ưu tiên tách riêng ở SKILL_RANK.
    source: 'bundled',
    provider: PROVIDER_NAME,
    rank: SKILL_RANK,
    invocation: { modelInvocable: true, userInvocable: true },
    locator: file,
    path: file,
    resourceBase: { kind: 'directory', path: dir },
    metadata: { version: '0.1.0', standard: 'TVKT-100 v1.0' },
  }
}

/**
 * Provider cho `ctx.skills.registerProvider()`.
 * @param {string} [pkgRoot] - gốc gói.
 * @returns {{name: string, list: Function, get: Function}} provider hợp lệ.
 */
export function createSkillProvider(pkgRoot = PKG_ROOT) {
  return {
    name: PROVIDER_NAME,
    async list() {
      return [skillCandidate(pkgRoot)]
    },
    async get(candidate) {
      if (candidate?.name !== SKILL_NAME) return undefined
      const base = skillCandidate(pkgRoot)
      // Đọc lại tệp mỗi lần: đây là điểm khác biệt so với register() một lần lúc mount.
      return { ...base, content: readSkillBody(pkgRoot) }
    },
  }
}
