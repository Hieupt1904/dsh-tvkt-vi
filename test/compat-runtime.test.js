/**
 * Compatibility smoke chạy trên đúng DSH target đã pin.
 *
 * Vì sao là test riêng: `npm test` mặc định không có bản cài DSH, nên phần này
 * bỏ qua khi thiếu môi trường. CI có job riêng cài đúng target rồi chạy, và job
 * đó là bằng chứng thật cho cột Verified trong `docs/compatibility.md`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { resolveInstallModules, runCompatSmoke, smokeScope } from '../scripts/compat-smoke.mjs'

const modules = resolveInstallModules()
const skip = modules === undefined
  ? 'không tìm thấy bản cài DSH (đặt DSH_INSTALL_MODULES để chỉ đường)'
  : false

test('compat smoke: mọi kiểm đạt trên target đã pin', { skip }, async () => {
  const report = await runCompatSmoke({ modules })
  const failed = report.checks.filter(check => !check.ok)
  assert.deepEqual(failed, [], 'kiểm không đạt: ' + JSON.stringify(failed, null, 1))
  assert.equal(report.verdict, 'VERIFIED')
  assert.equal(report.runtime.dsh, report.pkg.dshTarget,
    'smoke phải chạy trên đúng version đã pin, không phải bản cài khác')

  // Mỗi acceptance criterion phải có mặt, không được lặng lẽ bỏ bớt.
  const required = [
    'target-version',
    'bundle-row-resolution',
    'prompt-section-once',
    'skill-provider-once',
    'tool-registered-once',
    'lint-reports-finding',
    'lint-passes-clean-text',
    'dispose-removes-registrations',
  ]
  const ids = report.checks.map(check => check.id)
  for (const id of required) assert.ok(ids.includes(id), 'thiếu kiểm ' + id)
})

test('compat smoke: phạm vi nêu rõ phần chưa kiểm', () => {
  const scope = smokeScope().join(' ')
  assert.match(scope, /Không chạy model/)
  assert.match(scope, /dsh web/)
})

test('compat smoke: thiếu bản cài thì báo ENVIRONMENT_MISSING, không giả VERIFIED', async () => {
  const report = await runCompatSmoke({ modules: undefined })
  assert.equal(report.ok, false)
  assert.equal(report.verdict, 'ENVIRONMENT_MISSING')
})
