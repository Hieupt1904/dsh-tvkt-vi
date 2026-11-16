/**
 * dsh-tvkt-vi — chuẩn tiếng Việt kỹ thuật (TVKT-100) cho DeepSeek Harness.
 *
 * Plugin làm ba việc, cả ba idempotent và tự gỡ khi Cordis dispose:
 *   1. Chèn section "Chuẩn tiếng Việt" vào system prompt của mọi agent.
 *   2. Đăng ký provider skill `tvkt-vi` đọc `skills/tvkt-vi/SKILL.md` mỗi lần nạp.
 *   3. Đăng ký tool `tvkt_lint` khi profile có service `tools`.
 *
 * Provider (không phải đăng ký runtime) là cố ý: registry không cache thân skill,
 * nên sửa SKILL.md có hiệu lực ở lần nạp kế tiếp mà không cần restart.
 *
 * `inject` chỉ liệt kê `systemPrompt` và `skills` vì đó là điều kiện để plugin
 * chạy được. Tool là phần thêm: profile không có `tools` thì plugin vẫn hoạt
 * động, chỉ thiếu tool. Vì vậy tool được đăng ký qua `ctx.inject`, không đưa
 * vào `inject` cấp plugin — nếu không, mọi profile không có `tools` sẽ không
 * mount được bundle.
 * @module dsh-tvkt-vi
 */

import { CONTRACT_TEXT, SECTION_NAME, SECTION_ORDER } from './contract.js'
import { createSkillProvider } from './skill.js'

export { parseSkill, readSkillBody, skillCandidate, skillPaths } from './skill.js'
export { SKILL_DESCRIPTION, SKILL_NAME, SKILL_RANK } from './skill.js'
export {
  ERROR_CODES,
  LINTER_FILE,
  TOOL_NAME,
  TvtkToolError,
  executeLint,
  readWorkspaceFile,
  resolveWorkspacePath,
  runLinter,
  toolOptions,
} from './tool.js'

/** Tên plugin Cordis. */
export const name = 'tvkt-vi'

/** Dịch vụ cần có trước khi apply. */
export const inject = ['systemPrompt', 'skills']

/**
 * Có nên đăng ký tool trong profile này không.
 *
 * `defineTool` và `ctx.tools.register` là một phần của `@deepseek-ai/dsh-tools`,
 * không phải `@deepseek-ai/dsh-tools` chắc chắn có mặt trong mọi profile. Thiếu
 * service là bình thường (ví dụ profile tối giản), không phải lỗi mount.
 * @param ctx - context Cordis.
 * @returns true khi profile có service `tools`.
 */
export function canRegisterTool(ctx) {
  try {
    return ctx.get('tools') !== undefined && typeof ctx.get('tools')?.register === 'function'
  } catch {
    return false
  }
}

/**
 * Đăng ký tool `tvkt_lint` nếu profile có service `tools`.
 *
 * Ưu tiên đường `ctx.inject` (Cordis lo thứ tự phụ thuộc); nếu context không có
 * `inject` — như trong unit test — thì đăng ký ngay khi service đã có.
 * @param ctx - context Cordis.
 */
function attachTool(ctx) {
  const register = () => {
    // Import động: `@deepseek-ai/dsh-tools` là peer của host, không phải dependency
    // bắt buộc của plugin. Không có nó thì bỏ qua tool, không làm hỏng mount.
    import('./tool-register.js')
      .then(module => module.registerLintTool(ctx))
      .catch(error => {
        ctx.logger?.warn?.(`dsh-tvkt-vi: tool "tvkt_lint" not registered: ${String(error)}`)
      })
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['tools'], register)
    return
  }
  if (canRegisterTool(ctx)) register()
}

/**
 * Gắn section prompt, provider skill và (nếu có) tool lint vào context hiện tại.
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

  attachTool(ctx)
}
