/**
 * dsh-tvkt-vi — chuẩn tiếng Việt kỹ thuật (TVKT-100) cho DeepSeek Harness.
 *
 * Plugin làm hai việc, cả hai idempotent và tự gỡ khi Cordis dispose:
 *   1. Chèn section "Chuẩn tiếng Việt" vào system prompt của mọi agent.
 *   2. Đăng ký provider skill `tvkt-vi` đọc `skills/tvkt-vi/SKILL.md` mỗi lần nạp.
 *
 * Provider (không phải đăng ký runtime) là cố ý: registry không cache thân skill,
 * nên sửa SKILL.md có hiệu lực ở lần nạp kế tiếp mà không cần restart.
 * @module dsh-tvkt-vi
 */

import { CONTRACT_TEXT, SECTION_NAME, SECTION_ORDER } from './contract.js'
import { createSkillProvider } from './skill.js'

export { parseSkill, readSkillBody, skillCandidate, skillPaths } from './skill.js'
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

  // Factory là `(control: SkillProviderControl) => SkillProvider`, đúng chữ ký
  // của `SkillRegistry.registerProvider` trong `@deepseek-ai/dsh-skill`
  // 0.2.2-rc.2 (`src/index.ts:390`). Bỏ tham số này thì `control` là undefined
  // và mọi lần provider gọi `control.invalidate()` sẽ ném TypeError, che mất
  // lỗi gốc của lần đọc tệp.
  ctx.effect(
    () => ctx.skills.registerProvider(control => createSkillProvider({ logger: ctx.logger, control })),
    'tvkt-vi.provider()',
  )
}
