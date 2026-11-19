/**
 * Hợp đồng của tập pin DSH trong `engines.dsh`.
 *
 * Vì sao có tệp này: chính sách pin là thứ quyết định bundle cài được hay bị DSH
 * từ chối, mà trước 0.5.2 nó nằm rải ở bốn nơi (check-engine, docs-verify,
 * compat-smoke, test) và không nơi nào kiểm hình dạng chuỗi. Test này khoá hình
 * dạng đó: chỉ version chính xác, không toán tử dải, xếp tăng dần, target ở cuối.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  compareDshVersions,
  dshPinsInclude,
  parseDshPins,
  validateDshPins,
} from '../scripts/dsh-pins.mjs'

test('parseDshPins tách theo || và bỏ khoảng trắng', () => {
  assert.deepEqual(parseDshPins('0.2.2-rc.2 || 0.2.2-rc.5'), ['0.2.2-rc.2', '0.2.2-rc.5'])
  assert.deepEqual(parseDshPins('0.2.2-rc.5'), ['0.2.2-rc.5'])
  assert.deepEqual(parseDshPins('  0.2.2-rc.2||0.2.2-rc.5  '), ['0.2.2-rc.2', '0.2.2-rc.5'])
})

test('parseDshPins trả mảng rỗng cho đầu vào không phải chuỗi', () => {
  for (const value of [undefined, null, 42, {}, []]) {
    assert.deepEqual(parseDshPins(value), [])
  }
})

test('compareDshVersions xếp đúng thứ tự semver', () => {
  const ordered = ['0.2.2-rc.2', '0.2.2-rc.3', '0.2.2-rc.5', '0.2.2', '0.2.3', '0.3.0']
  for (let index = 1; index < ordered.length; index += 1) {
    assert.ok(compareDshVersions(ordered[index - 1], ordered[index]) < 0,
      `${ordered[index - 1]} phải đứng trước ${ordered[index]}`)
    assert.ok(compareDshVersions(ordered[index], ordered[index - 1]) > 0)
  }
  assert.equal(compareDshVersions('0.2.2-rc.5', '0.2.2-rc.5'), 0)
  assert.ok(compareDshVersions('0.2.2-rc.10', '0.2.2-rc.9') > 0, 'so phần số theo giá trị, không theo chuỗi')
})

test('validateDshPins nhận tập pin hợp lệ', () => {
  const result = validateDshPins('0.2.2-rc.2 || 0.2.2-rc.5', '0.2.2-rc.5')
  assert.deepEqual(result.problems, [])
  assert.equal(result.ok, true)
  assert.deepEqual(result.pins, ['0.2.2-rc.2', '0.2.2-rc.5'])
})

test('validateDshPins từ chối mọi dạng dải mở', () => {
  for (const range of [
    '>=0.2.2-rc.2 <0.3.0-0',
    '^0.2.2-rc.5',
    '~0.2.2-rc.5',
    '>=0.2.2-rc.2',
    '*',
    '0.2.2-rc.2 - 0.2.2-rc.5',
  ]) {
    const result = validateDshPins(range, '0.2.2-rc.5')
    assert.equal(result.ok, false, `phải từ chối "${range}"`)
  }
})

test('validateDshPins từ chối phần tử không phải version chính xác', () => {
  const result = validateDshPins('0.2.2-rc.2 || latest', 'latest')
  assert.equal(result.ok, false)
  assert.ok(result.problems.some(problem => problem.includes('"latest"')))
})

test('validateDshPins từ chối danh sách lộn thứ tự và phần tử lặp', () => {
  const reversed = validateDshPins('0.2.2-rc.5 || 0.2.2-rc.2', '0.2.2-rc.2')
  assert.ok(reversed.problems.some(problem => problem.includes('tăng dần')))

  const duplicated = validateDshPins('0.2.2-rc.2 || 0.2.2-rc.2', '0.2.2-rc.2')
  assert.ok(duplicated.problems.some(problem => problem.includes('lặp')))
})

test('validateDshPins đòi dshTarget là phần tử cuối', () => {
  const missing = validateDshPins('0.2.2-rc.2 || 0.2.2-rc.5', '0.2.2-rc.4')
  assert.ok(missing.problems.some(problem => problem.includes('không nằm trong')))

  const notLast = validateDshPins('0.2.2-rc.2 || 0.2.2-rc.5', '0.2.2-rc.2')
  assert.ok(notLast.problems.some(problem => problem.includes('phần tử cuối')))
})

test('validateDshPins từ chối giá trị thiếu hoặc rỗng', () => {
  for (const value of [undefined, '', '   ']) {
    assert.equal(validateDshPins(value, '0.2.2-rc.5').ok, false)
  }
})

test('dshPinsInclude chỉ khớp đúng pin, không khớp version lân cận', () => {
  const range = '0.2.2-rc.2 || 0.2.2-rc.5'
  for (const version of ['0.2.2-rc.2', '0.2.2-rc.5']) {
    assert.equal(dshPinsInclude(range, version), true, `phải khớp ${version}`)
  }
  // Đây là lý do tồn tại của tập pin: rc.3 và rc.4 chưa từng được chạy.
  for (const version of ['0.2.2-rc.3', '0.2.2-rc.4', '0.2.2', '0.2.3', undefined, 'v0.2.2-rc.5']) {
    assert.equal(dshPinsInclude(range, version), false, `không được khớp ${String(version)}`)
  }
})
