#!/usr/bin/env node
/**
 * Tập pin DSH khai trong `engines.dsh`.
 *
 * Vì sao không dùng dải mở: DSH so `engines.dsh` bằng `semver.satisfies` với
 * `includePrerelease`, nên dải `>=0.2.2-rc.2 <0.3.0-0` khớp cả những version
 * chưa từng được chạy thử. Cùng lý do đó, pin đúng một version làm mỗi lần DSH
 * lên rc mới là một lần plugin bị DSH từ chối.
 *
 * Cách khai hiện tại: các version chính xác nối bằng `||`. Semver hiểu đó là
 * phép hợp của các pin chính xác, nên chỉ đúng những version đã có bằng chứng
 * mới qua được cổng. `dshTarget` là phần tử cuối: quy ước danh sách tăng dần,
 * phần tử cuối là version mới nhất đã kiểm chứng.
 *
 * Dùng:
 *   import { parseDshPins, validateDshPins, dshPinsInclude } from './dsh-pins.mjs'
 */

/** Dấu nối các pin chính xác. */
export const PIN_SEPARATOR = '||'

/** Một version chính xác, có hoặc không có nhánh pre-release. */
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/** Toán tử của dải mở. `|` không nằm trong danh sách vì `||` là dấu nối pin. */
const OPEN_RANGE_OPERATOR = /[<>=~^*]/

/**
 * Tách `engines.dsh` thành danh sách pin.
 * @param range - giá trị `engines.dsh`.
 * @returns mảng pin đã trim; mảng rỗng nếu đầu vào không phải chuỗi.
 */
export function parseDshPins(range) {
  if (typeof range !== 'string') return []
  return range
    .split(PIN_SEPARATOR)
    .map(pin => pin.trim())
    .filter(pin => pin !== '')
}

/**
 * Tách một version thành phần lõi và phần pre-release.
 * @param version - version dạng semver.
 * @returns `{ core: [major, minor, patch], prerelease: string }`.
 */
function splitVersion(version) {
  const [core, ...rest] = version.split('-')
  const [major, minor, patch] = core.split('.').map(Number)
  return { core: [major, minor, patch], prerelease: rest.join('-') }
}

/**
 * So hai version theo thứ tự semver.
 *
 * Chỉ dùng cho dữ liệu của chính tệp `package.json`, không phải semver đầy đủ:
 * không xử lý build metadata, coi mọi định danh không phải số là chuỗi so từ
 * điển, và số luôn đứng trước chuỗi trong phần pre-release.
 * @param a - version thứ nhất.
 * @param b - version thứ hai.
 * @returns số âm nếu `a < b`, 0 nếu bằng, số dương nếu `a > b`.
 */
export function compareDshVersions(a, b) {
  const left = splitVersion(a)
  const right = splitVersion(b)
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] === right.core[index]) continue
    return left.core[index] < right.core[index] ? -1 : 1
  }
  if (left.prerelease === right.prerelease) return 0
  // Bản không có pre-release đứng sau mọi bản pre-release của cùng phần lõi.
  if (left.prerelease === '') return 1
  if (right.prerelease === '') return -1
  const leftParts = left.prerelease.split('.')
  const rightParts = right.prerelease.split('.')
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    if (leftParts[index] === undefined) return -1
    if (rightParts[index] === undefined) return 1
    const leftNumeric = /^\d+$/.test(leftParts[index])
    const rightNumeric = /^\d+$/.test(rightParts[index])
    if (leftNumeric && rightNumeric) {
      const difference = Number(leftParts[index]) - Number(rightParts[index])
      if (difference !== 0) return difference < 0 ? -1 : 1
      continue
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
    if (leftParts[index] === rightParts[index]) continue
    return leftParts[index] < rightParts[index] ? -1 : 1
  }
  return 0
}

/**
 * Kiểm tập pin và quan hệ với `dshTarget`.
 * @param range - giá trị `engines.dsh`.
 * @param target - giá trị `dshTarget`.
 * @returns `{ ok, pins, problems }`.
 */
export function validateDshPins(range, target) {
  if (typeof range !== 'string' || range.trim() === '') {
    return { ok: false, pins: [], problems: ['package.json thiếu engines.dsh'] }
  }

  const problems = []
  if (OPEN_RANGE_OPERATOR.test(range)) {
    problems.push(`engines.dsh="${range}" chứa toán tử dải mở; chỉ nhận version chính xác nối bằng "${PIN_SEPARATOR}"`)
  }

  const pins = parseDshPins(range)
  const seen = new Set()
  for (const pin of pins) {
    if (!EXACT_VERSION.test(pin)) problems.push(`engines.dsh có phần tử không phải version chính xác: "${pin}"`)
    if (seen.has(pin)) problems.push(`engines.dsh lặp version ${pin}`)
    seen.add(pin)
  }

  for (let index = 1; index < pins.length; index += 1) {
    const previous = pins[index - 1]
    const current = pins[index]
    if (!EXACT_VERSION.test(previous) || !EXACT_VERSION.test(current)) continue
    if (compareDshVersions(previous, current) >= 0) {
      problems.push(`engines.dsh phải xếp tăng dần: ${previous} đứng trước ${current}`)
    }
  }

  if (target === undefined) {
    problems.push('package.json thiếu dshTarget')
  } else if (!seen.has(String(target))) {
    problems.push(`dshTarget=${target} không nằm trong engines.dsh`)
  } else if (pins[pins.length - 1] !== String(target)) {
    problems.push(`dshTarget=${target} phải là phần tử cuối của engines.dsh (version mới nhất đã kiểm chứng)`)
  }

  return { ok: problems.length === 0, pins, problems }
}

/**
 * Version đang chạy có nằm trong tập pin không.
 * @param range - giá trị `engines.dsh`.
 * @param version - version của bản cài DSH.
 * @returns true nếu khớp đúng một pin.
 */
export function dshPinsInclude(range, version) {
  return version !== undefined && parseDshPins(range).includes(String(version))
}
