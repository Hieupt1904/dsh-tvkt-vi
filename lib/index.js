/**
 * dsh-tvkt-vi — chuẩn tiếng Việt kỹ thuật (TVKT-100) cho DeepSeek Harness.
 *
 * Plugin làm hai việc, cả hai idempotent và tự gỡ khi Cordis dispose:
 *   1. Chèn section "Chuẩn tiếng Việt" vào system prompt của mọi agent.
 *   2. Đăng ký skill `tvkt-vi` trong bộ nhớ (không cần chép tệp vào ~/.dsh/skills).
 *
 * Nội dung skill đọc từ `skills/tvkt-vi/SKILL.md` để chỉ có một nguồn sự thật.
 * @module dsh-tvkt-vi
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONTRACT_TEXT, SECTION_NAME, SECTION_ORDER } from './contract.js'

/** Tên plugin Cordis. */
export const name = 'tvkt-vi'

/** Dịch vụ cần có trước khi apply. */
export const inject = ['systemPrompt', 'skills']

/** Thư mục gốc của gói, tính từ tệp này. */
const PKG_ROOT = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '')

/** Tên skill do plugin đăng ký. */
export const SKILL_NAME = 'tvkt-vi'

/** Mô tả skill — thứ agent đọc trong catalog để quyết định nạp. Phải ngắn. */
export const SKILL_DESCRIPTION =
  'Soạn, rà và chuẩn hóa tiếng Việt kỹ thuật theo bộ TVKT-100 (30 quy tắc, 70 thuật ngữ, '
  + 'linter L001-L007). Dùng khi viết hoặc sửa tài liệu tiếng Việt, README, hướng dẫn vận hành, '
  + 'thông báo lỗi, mô tả API, tiêu chí kiểm thử, hoặc khi câu trả lời tiếng Việt cần chuẩn và '
  + "dễ hiểu hơn. Cũng dùng khi người dùng nói 'viết lại cho chuẩn', 'dịch sang tiếng Việt kỹ "
  + "thuật', 'rà lại tiếng Việt', 'TVKT'."

/**
 * Dựng bản đăng ký skill từ tệp trên đĩa.
 *
 * `SkillRegistration` bắt buộc có `source` và (khi nạp) `provider`; thiếu `source`
 * thì registry nhận đăng ký nhưng `skills.get()` từ chối với lỗi
 * "loaded skill … source must be a string". `resourceBase` cho consumer biết
 * gốc để giải các liên kết tương đối trong thân skill.
 * @param {string} [pkgRoot] - gốc gói, mặc định lấy từ vị trí tệp này.
 * @returns {object} bản đăng ký hợp lệ cho `ctx.skills.register()`.
 */
export function loadSkill(pkgRoot = PKG_ROOT) {
  const skillDir = path.join(pkgRoot, 'skills', SKILL_NAME)
  const file = path.join(skillDir, 'SKILL.md')
  const body = readFileSync(file, 'utf8')
  const content = `${body.trimEnd()}\n\n---\n\nThư mục tệp của skill trên máy này: \`${skillDir}\`\n`
  return {
    name: SKILL_NAME,
    description: SKILL_DESCRIPTION,
    content,
    // Nguồn gốc của skill: plugin đăng ký trong bộ nhớ, không phải thư mục người dùng.
    source: 'runtime',
    // Tệp thật để consumer mở xem trước.
    path: file,
    resourceBase: { kind: 'directory', path: skillDir },
    metadata: { version: '0.1.0', standard: 'TVKT-100 v1.0' },
  }
}

/**
 * Gắn section prompt và skill vào context hiện tại.
 * @param {import('@deepseek-ai/cordis').Context} ctx - context Cordis.
 * @param {Record<string, never>} [_config] - plugin không có tuỳ chọn.
 */
export function apply(ctx, _config) {
  ctx.effect(() => ctx.systemPrompt.section({
    name: SECTION_NAME,
    order: SECTION_ORDER,
    text: CONTRACT_TEXT,
  }), 'tvkt-vi.section()')

  // Đọc một lần lúc mount: tệp skill không đổi trong vòng đời tiến trình.
  const skill = loadSkill()
  ctx.effect(() => ctx.skills.register(skill), 'tvkt-vi.skill()')
}
