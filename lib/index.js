/**
 * dsh-tvkt-vi — chuẩn tiếng Việt kỹ thuật (TVKT-100) cho DeepSeek Harness.
 *
 * Plugin làm hai việc, cả hai idempotent và tự gỡ khi Cordis dispose:
 *   1. Chèn section "Chuẩn tiếng Việt" vào system prompt của mọi agent.
 *   2. Đăng ký provider skill `tvkt-vi` đọc thẳng từ `skills/tvkt-vi/SKILL.md`.
 *
 * Provider (không phải đăng ký runtime) là cố ý: registry không cache thân skill,
 * nên sửa SKILL.md có hiệu lực ở lần nạp kế tiếp mà không cần restart.
 * @module dsh-tvkt-vi
 */

import { CONTRACT_TEXT, SECTION_NAME, SECTION_ORDER } from './contract.js'
import { createSkillProvider } from './skill.js'

export { readSkillBody, skillCandidate, skillPaths } from './skill.js'
export { SKILL_DESCRIPTION, SKILL_NAME, SKILL_RANK } from './skill.js'

/** Tên plugin Cordis. */
export const name = 'tvkt-vi'

/** Dịch vụ cần có trước khi apply. */
export const inject = ['systemPrompt', 'skills']

/**
 * Gắn section prompt và provider skill vào context hiện tại.
 * @param {import('@deepseek-ai/cordis').Context} ctx - context Cordis.
 * @param {Record<string, never>} [_config] - plugin không có tuỳ chọn.
 */
export function apply(ctx, _config) {
  ctx.effect(() => ctx.systemPrompt.section({
    name: SECTION_NAME,
    order: SECTION_ORDER,
    text: CONTRACT_TEXT,
  }), 'tvkt-vi.section()')

  // Factory nhận control (signal + invalidate) của chính lần đăng ký này.
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider()), 'tvkt-vi.provider()')
}
