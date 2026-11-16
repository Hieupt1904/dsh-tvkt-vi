/**
 * Cầu nối giữa tool `tvkt_lint` và registry tools của host.
 *
 * Vì sao tách thành tệp riêng: `@deepseek-ai/dsh-tools` là peer của host, không
 * phải dependency runtime của plugin. Nếu import trực tiếp ở `lib/index.js` thì
 * mọi profile không cài gói đó sẽ không mount được bundle. Tệp này chỉ được nạp
 * động khi context đã có service `tools`.
 *
 * Hợp đồng dùng ở đây, đối chiếu trên target `@deepseek-ai/dsh@0.2.2-rc.2`:
 *   - `defineTool(options)`            → `dsh-tools/src/schema.ts:555`
 *   - `ctx.tools.register(def)`        → `dsh-tools/src/index.ts:128`
 *   - `exec.agent`, `exec.signal`      → `dsh-tools/src/contracts.ts:245`
 *   - `ctx.workingDirectory.ensure()`  → `dsh-working-directory/lib/types/index.d.ts:90`
 * @module dsh-tvkt-vi/tool-register
 */

import { executeLint, toolOptions } from './tool.js'

/**
 * Dựng `execute` cho tool, bám hợp đồng của target.
 *
 * Workspace gốc lấy từ `ctx.workingDirectory.ensure(agent, signal)`. Nếu không có
 * service đó hoặc không có agent, tool không biết workspace nên chỉ nhận `text`.
 * @param ctx - context Cordis có service `tools`.
 * @param defineTool - hàm dựng tool của `@deepseek-ai/dsh-tools`.
 * @returns hàm `execute`.
 */
export function makeExecute(ctx, defineTool) {
  void defineTool
  return async (args, exec) => {
    let root
    if (exec.agent !== undefined && typeof ctx.get('workingDirectory')?.ensure === 'function') {
      root = await ctx.get('workingDirectory').ensure(exec.agent, exec.signal)
    }
    if (args?.path !== undefined && root === undefined) {
      const { TvtkToolError, ERROR_CODES } = await import('./tool.js')
      throw new TvtkToolError(
        'this profile has no working directory service, so path input is unavailable; pass text instead',
        ERROR_CODES.INPUT_MISSING)
    }
    return executeLint(args, { root: root ?? process.cwd(), signal: exec.signal })
  }
}

/**
 * Đăng ký tool vào registry của context.
 * @param ctx - context Cordis có service `tools`.
 * @returns disposer của registry.
 * @throws {Error} khi không nạp được `@deepseek-ai/dsh-tools`.
 */
export async function registerLintTool(ctx) {
  const tools = ctx.get('tools')
  if (tools === undefined || typeof tools.register !== 'function') {
    throw new Error('service "tools" is unavailable in this profile')
  }
  let defineTool
  try {
    ({ defineTool } = await import('@deepseek-ai/dsh-tools'))
  } catch (error) {
    throw new Error('cannot load @deepseek-ai/dsh-tools from the host installation', { cause: error })
  }
  const options = toolOptions()
  const definition = defineTool({ ...options, execute: makeExecute(ctx, defineTool) })
  return ctx.effect(() => tools.register(definition), 'tvkt-vi.tool()')
}
