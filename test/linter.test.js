/**
 * Hành vi của linter TVKT.
 *
 * Lớp lỗi được bắt ở đây: bản 0.4.0 đảo trạng thái `inside_code` ở mọi dòng bắt
 * đầu bằng ``` nên fence bốn dấu chứa fence ba dấu bị đóng sớm, và fence đóng
 * sai độ dài không được nhận. Nội dung trong khối mã bị kiểm như văn xuôi.
 *
 * Nguyên tắc của bộ test này: protected region phải **byte-identical** trước và
 * sau khi chạy, và linter không bao giờ trả về văn bản đã sửa.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const LINTER = path.join(ROOT, 'vendor', 'tvkt', 'tools', 'tvkt_lint.py')
const WRAPPER = path.join(ROOT, 'skills', 'tvkt-vi', 'scripts', 'lint-text.py')
const GOLDEN = path.join(ROOT, 'tests', 'golden')

const hasPython = (() => {
  try {
    execFileSync('python3', ['--version'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
})()
const skip = hasPython ? false : 'không có python3 trong PATH'

/**
 * Chạy linter trên một tệp và lấy JSON.
 * @param file - đường dẫn tệp.
 * @returns kết quả JSON đã parse.
 */
function lintFile(file) {
  const out = execFileSync('python3', [LINTER, file, '--format', 'json'], { encoding: 'utf8' })
  return JSON.parse(out)
}

/**
 * Chạy linter trên stdin.
 * @param text - văn bản.
 * @returns kết quả JSON đã parse.
 */
function lintText(text) {
  const out = execFileSync('python3', [LINTER, '-', '--format', 'json'], {
    input: text,
    encoding: 'utf8',
  })
  return JSON.parse(out)
}

/** Hash của một chuỗi, dùng để so byte identity. */
function sha(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

test('output có schema đầy đủ và nói rõ phạm vi', { skip }, () => {
  const result = lintText('Dịch vụ trả về mã trạng thái 401.\n')
  assert.equal(result.schema_version, 2)
  assert.equal(result.lint_status, 'PASS')
  assert.deepEqual(result.rules_executed, ['L001', 'L002', 'L003', 'L004', 'L005', 'L006', 'L007'])
  assert.equal(result.semantic_review, 'NOT_RUN')
  assert.equal(result.technical_verification, 'NOT_RUN')
  assert.ok(Array.isArray(result.limitations) && result.limitations.length > 0)
  assert.equal(typeof result.input_sha256, 'string')
  assert.ok('protected_spans' in result)
  // PASS không được ngụ ý "tuân thủ TVKT-100".
  assert.ok(result.limitations.some(line => /PASS không có nghĩa tài liệu tuân thủ TVKT-100/.test(line)))
  assert.ok(result.limitations.some(line => /PASS không có nghĩa nội dung đúng kỹ thuật/.test(line)))
})

test('lint_status FINDINGS khi có vi phạm, PASS khi sạch', { skip }, () => {
  const dirty = lintText('Kỹ thuật viên tiến hành kiểm tra cấu hình.\n')
  assert.equal(dirty.lint_status, 'FINDINGS')
  assert.ok(dirty.findings.some(f => f.rule_id === 'L001'))

  const clean = lintText('Hệ thống kiểm tra token trước khi chấp nhận yêu cầu.\n')
  assert.equal(clean.lint_status, 'PASS')
})

test('linter không trả về văn bản đã sửa: input hash không đổi', { skip }, () => {
  const text = 'Mở `` mã có ` bên trong `` rồi tiến hành kiểm tra.\n'
  const before = sha(text)
  const result = lintText(text)
  assert.equal(result.input_sha256, before)
  // Không có trường nào chứa văn bản đã rewrite.
  for (const key of ['text', 'output', 'rewritten', 'fixed']) {
    assert.equal(key in result, false, `output không được có trường ${key}`)
  }
})

test('fence bốn backtick chứa fence ba backtick là một khối bảo vệ', { skip }, () => {
  const text = [
    'Mở đầu hợp lệ.',
    '',
    '````markdown',
    '```',
    'Kỹ thuật viên tiến hành kiểm tra cấu hình để bảo đảm tính ổn định của dịch vụ trước giờ cao điểm.',
    '```',
    '````',
    '',
    'Kết thúc hợp lệ.',
    '',
  ].join('\n')
  const result = lintText(text)
  assert.deepEqual(result.findings, [], 'không được có finding trong khối mã')
  const fenced = result.protected_spans.filter(s => s.kind === 'fenced-code')
  assert.equal(fenced.length, 1, 'phải là một khối duy nhất')
  assert.equal(fenced[0].start_line, 3)
  assert.equal(fenced[0].end_line, 7)
})

test('fence đóng phải cùng loại và đủ dài', { skip }, () => {
  // Đóng bằng ba dấu khi mở bằng bốn dấu: không hợp lệ, khối kéo tới hết tệp.
  const text = 'Mở.\n\n````\ntiến hành kiểm tra\ntiến hành lưu\n'
  const result = lintText(text)
  assert.deepEqual(result.findings, [], 'khối chưa đóng phải kéo tới hết tệp')
  const fenced = result.protected_spans.filter(s => s.kind === 'fenced-code')
  // Văn bản có dòng cuối rỗng nên split tạo 6 dòng; khối kéo tới hết tệp.
  assert.equal(fenced[0].end_line, text.split('\n').length)
})

test('fence tilde tương đương fence backtick', { skip }, () => {
  const result = lintText('Mở.\n\n~~~\ntiến hành kiểm tra cấu hình\n~~~\n')
  assert.deepEqual(result.findings, [])
})

test('inline code nhiều backtick được bảo vệ', { skip }, () => {
  const result = lintText('Dùng `` giá trị có ` bên trong `` cho ví dụ.\n')
  assert.deepEqual(result.findings, [])
  assert.ok(result.protected_spans.some(s => s.kind === 'inline-code'))
})

test('URL và Markdown link được bảo vệ', { skip }, () => {
  const result = lintText('Xem https://example.com/tien-hanh-kiem-tra và [tài liệu](https://example.com/thuc-hien-luu).\n')
  assert.deepEqual(result.findings, [])
  const kinds = new Set(result.protected_spans.map(s => s.kind))
  assert.ok(kinds.has('url'))
  assert.ok(kinds.has('markdown-link'))
})

test('block do dự án đánh dấu được bảo vệ', { skip }, () => {
  const text = [
    'Văn xuôi hợp lệ.',
    '',
    '<!-- tvkt:generated:begin api -->',
    'tiến hành kiểm tra cấu hình sẽ được triển khai ở bản kế tiếp',
    '<!-- tvkt:generated:end -->',
    '',
  ].join('\n')
  const result = lintText(text)
  assert.deepEqual(result.findings, [])
  assert.ok(result.protected_spans.some(s => s.kind === 'generated-block'))
})

test('block đánh dấu thiếu dấu đóng thì kéo tới hết tệp', { skip }, () => {
  const text = 'Văn xuôi hợp lệ.\n\n<!-- tvkt:protected:begin -->\ntiến hành kiểm tra\n'
  const result = lintText(text)
  assert.deepEqual(result.findings, [])
})

test('văn xuôi ngoài khối mã vẫn bị kiểm tra', { skip }, () => {
  const text = 'Mở đầu.\n\n```\ntiến hành kiểm tra\n```\n\nKỹ thuật viên tiến hành kiểm tra cấu hình.\n'
  const result = lintText(text)
  const hits = result.findings.filter(f => f.rule_id === 'L001')
  assert.equal(hits.length, 1, 'chỉ dòng văn xuôi bị báo')
  assert.equal(hits[0].line, 7)
})

test('số thập phân, version, viết tắt không cắt câu sai', { skip }, () => {
  const result = lintText(
    'Ngưỡng mặc định là 500 ms và có thể đổi thành 1.5 giây.\n'
    + 'Bản 1.2.3 sửa lỗi của bản 1.2.2.\n'
    + 'Văn phòng tại TP.HCM dùng e.g. mẫu này, v.v. khi cần.\n')
  assert.equal(result.findings.filter(f => f.rule_id === 'L003' || f.rule_id === 'L004').length, 0,
    'không được báo câu dài do tách câu sai')
})

test('L005 bắt đoạn quá số câu, không bắt nhiều dòng riêng', { skip }, () => {
  const oneParagraph = 'Dịch vụ nhận yêu cầu. Dịch vụ kiểm tra token. Dịch vụ đọc quyền. '
    + 'Dịch vụ ghi nhật ký. Dịch vụ trả kết quả. Dịch vụ đóng phiên.\n'
  assert.ok(lintText(oneParagraph).findings.some(f => f.rule_id === 'L005'))

  // Sáu dòng liền nhau KHÔNG có dòng trống vẫn là một đoạn theo Markdown, nên
  // L005 vẫn báo. Điều phải giữ là: có dòng trống ngăn cách thì không báo.
  const splitParagraphs = 'Dịch vụ nhận yêu cầu.\nDịch vụ kiểm tra token.\nDịch vụ đọc quyền.\n\n'
    + 'Dịch vụ ghi nhật ký.\nDịch vụ trả kết quả.\nDịch vụ đóng phiên.\n'
  assert.equal(lintText(splitParagraphs).findings.filter(f => f.rule_id === 'L005').length, 0,
    'hai đoạn ba câu không được báo L005')
})

test('L006 giữ mức INFO, không blocking', { skip }, () => {
  const result = lintText('Người dùng phải đăng nhập lại.\n')
  const l006 = result.findings.filter(f => f.rule_id === 'L006')
  assert.ok(l006.length > 0)
  for (const finding of l006) assert.equal(finding.severity, 'INFO')
  assert.ok(result.rules_skipped.some(r => r.rule_id === 'L006'))
})

test('identifier trong backtick giữ nguyên, không bị coi là sai thuật ngữ', { skip }, () => {
  const result = lintText('Trường `tien_hanh_kiem_tra` và `POST /api/v1/retry` giữ nguyên.\n')
  assert.deepEqual(result.findings, [])
})

test('mọi fixture golden cho kết quả khớp expected.json', { skip }, () => {
  const folders = ['valid', 'invalid', 'protected', 'terminology', 'mixed-language', 'specs']
  let checked = 0
  for (const folder of folders) {
    const dir = path.join(GOLDEN, folder)
    assert.ok(existsSync(dir), `thiếu thư mục ${folder}`)
    for (const name of readdirSync(dir).filter(f => f.endsWith('.md'))) {
      const expectedPath = path.join(dir, name.replace(/\.md$/, '.expected.json'))
      assert.ok(existsSync(expectedPath), `thiếu expected cho ${folder}/${name}`)
      const expected = JSON.parse(readFileSync(expectedPath, 'utf8'))
      const result = lintFile(path.join(dir, name))
      const hits = {}
      for (const finding of result.findings) hits[finding.rule_id] = (hits[finding.rule_id] ?? 0) + 1
      for (const want of expected.expect_rules) {
        assert.equal(hits[want.rule_id] ?? 0, want.count,
          `${folder}/${name}: ${want.rule_id} mong ${want.count}, được ${hits[want.rule_id] ?? 0}`)
      }
      for (const rid of expected.expect_absent_rules) {
        assert.equal(hits[rid] ?? 0, 0, `${folder}/${name}: không được có ${rid}`)
      }
      const protectedLines = [...new Set(result.protected_spans.flatMap(s => {
        const out = []
        for (let l = s.start_line; l <= s.end_line; l += 1) out.push(l)
        return out
      }))].sort((a, b) => a - b)
      assert.deepEqual(protectedLines, expected.expect_protected_lines,
        `${folder}/${name}: vùng bảo vệ lệch`)
      checked += 1
    }
  }
  assert.ok(checked >= 25, `phải kiểm ít nhất 25 fixture, đã kiểm ${checked}`)
})

test('golden corpus reproducible: --check thoát 0', { skip }, () => {
  const out = execFileSync('python3', [path.join(GOLDEN, 'generate.py'), '--check'], { encoding: 'utf8' })
  assert.match(out, /GOLDEN: OK/)
})

test('wrapper skill chạy được và đọc stdin', { skip }, () => {
  const out = execFileSync('python3', [WRAPPER, '--quiet'], {
    input: 'tiến hành kiểm tra cấu hình\n',
    encoding: 'utf8',
  })
  assert.match(out, /WARNING=1/)
})

test('wrapper --json trả schema giống lõi', { skip }, () => {
  const out = execFileSync('python3', [WRAPPER, '--json'], {
    input: 'Văn xuôi hợp lệ.\n',
    encoding: 'utf8',
  })
  const result = JSON.parse(out)
  assert.equal(result.schema_version, 2)
  assert.equal(result.lint_status, 'PASS')
  assert.equal(result.semantic_review, 'NOT_RUN')
})
