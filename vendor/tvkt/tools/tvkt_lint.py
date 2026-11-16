#!/usr/bin/env python3
"""TVKT-100 v1.0: heuristic Vietnamese technical-language linter (stdlib only).

Phạm vi: chỉ L001-L007. Công cụ này **không** xác minh tính đúng kỹ thuật của
nội dung, và một kết quả sạch **không** có nghĩa "tài liệu đã đạt TVKT-100".
Muốn kết luận đó cần review ngữ nghĩa của người hoặc model.

Commands:
    python3 tools/tvkt_lint.py your_file.md
    python3 tools/tvkt_lint.py your_file.md --format json --fail-on WARNING
    cat bai.md | python3 tools/tvkt_lint.py -

Cấu trúc output (schema_version 2):
    {
      "schema_version": 2,
      "file": "...",
      "lint_status": "PASS" | "FINDINGS" | "ERROR",
      "rules_executed": ["L001", ...],
      "rules_skipped": [{"rule_id": "L006", "reason": "..."}],
      "summary": {"ERROR": n, "WARNING": n, "INFO": n},
      "findings": [...],
      "protected_spans": [...],
      "semantic_review": "NOT_RUN",
      "technical_verification": "NOT_RUN"
    }

`lint_status: PASS` chỉ nói "không thấy dấu hiệu vi phạm trong phạm vi L001-L007".
Nó không nói tài liệu tuân thủ TVKT-100, và không nói nội dung đúng kỹ thuật.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Iterable

SCHEMA_VERSION = 2
ROOT = Path(__file__).resolve().parents[1]
RULES_PATH = ROOT / "config" / "rules.json"
TERMS_PATH = ROOT / "config" / "terms.json"

# Trạng thái review ngữ nghĩa và kiểm chứng kỹ thuật do công cụ này không làm.
NOT_RUN = "NOT_RUN"


# ---------------------------------------------------------------------------
# Cấu hình
# ---------------------------------------------------------------------------
def load_config() -> tuple[dict[str, Any], dict[str, Any]]:
    rules = json.loads(RULES_PATH.read_text(encoding="utf-8"))
    terms = json.loads(TERMS_PATH.read_text(encoding="utf-8"))
    return rules, terms


# ---------------------------------------------------------------------------
# Vùng được bảo vệ
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class Span:
    """Một vùng văn bản không được kiểm tra và không được sửa."""

    kind: str
    start: int          # offset byte trong văn bản gốc (theo ký tự Python)
    end: int
    start_line: int     # 1-based
    end_line: int
    delimiter: str = ""

    def as_dict(self) -> dict[str, Any]:
        return asdict(self)


def _line_offsets(text: str) -> list[int]:
    """Offset đầu mỗi dòng, chỉ số 0 ứng với dòng 1."""
    offsets = [0]
    for match in re.finditer(r"\n", text):
        offsets.append(match.end())
    return offsets


def _line_of(offsets: list[int], pos: int) -> int:
    """Số dòng 1-based chứa offset."""
    lo, hi = 0, len(offsets) - 1
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if offsets[mid] <= pos:
            lo = mid
        else:
            hi = mid - 1
    return lo + 1


FENCE_OPEN_RE = re.compile(r"^(?P<indent>[ ]{0,3})(?P<fence>`{3,}|~{3,})(?P<info>[^\n]*)$")


def find_fenced_code(text: str, offsets: list[int]) -> list[Span]:
    """Khoanh các khối fenced code.

    Quy tắc CommonMark áp dụng ở đây:
      - fence mở là >= 3 dấu ` hoặc ~ ở đầu dòng (tối đa 3 space thụt lề);
      - fence đóng phải cùng loại ký tự và dài **ít nhất** bằng fence mở;
      - thông tin sau fence mở (info string) không được chứa ` nếu là backtick;
      - fence không đóng thì kéo tới hết tệp, để phần đuôi không bị kiểm tra nhầm.

    Bản 0.4.0 đảo trạng thái ở mọi dòng bắt đầu bằng ``` nên một fence 4 dấu
    chứa ``` bên trong bị đóng sớm, và nội dung sau đó bị kiểm tra như văn xuôi.
    """
    spans: list[Span] = []
    lines = text.split("\n")
    index = 0
    while index < len(lines):
        match = FENCE_OPEN_RE.match(lines[index])
        if match is None:
            index += 1
            continue
        fence = match.group("fence")
        char = fence[0]
        info = match.group("info")
        if char == "`" and "`" in info:
            # Dòng có backtick trong info string không phải fence mở.
            index += 1
            continue
        open_pos = offsets[index]
        close_index = None
        close_re = re.compile(r"^[ ]{0,3}" + re.escape(char) + "{" + str(len(fence)) + r",}[ \t]*$")
        for probe in range(index + 1, len(lines)):
            if close_re.match(lines[probe]):
                close_index = probe
                break
        if close_index is None:
            end_pos = len(text)
            end_line = len(lines)
        else:
            end_pos = offsets[close_index] + len(lines[close_index])
            end_line = close_index + 1
        spans.append(Span("fenced-code", open_pos, end_pos, index + 1, end_line, fence))
        index = (close_index + 1) if close_index is not None else len(lines)
    return spans


INLINE_CODE_RE = re.compile(r"(?P<ticks>`+)(?:(?!\1).)+?(?P=ticks)", re.S)
URL_RE = re.compile(r"(?:https?|ftp)://[^\s<>\"'`\[\]]+")
MD_LINK_RE = re.compile(r"!?\[[^\]\n]*\]\((?:[^()\n]|\([^()\n]*\))*\)")
HTML_TAG_RE = re.compile(r"</?[A-Za-z][\w:-]*(?:\s[^<>]*)?/?>")
MASK_TOKEN_RE = re.compile(r"`[^`\n]+`")
PLACEHOLDER_RE = re.compile(r"\b[A-Z][A-Z0-9_]{2,}\b")


def find_inline_spans(text: str, offsets: list[int], fenced: list[Span]) -> list[Span]:
    """Khoanh inline code, URL, Markdown link, thẻ HTML trong phần văn xuôi."""
    fenced_ranges = [(span.start, span.end) for span in fenced]

    def inside_fence(pos: int) -> bool:
        return any(start <= pos < end for start, end in fenced_ranges)

    spans: list[Span] = []
    patterns = [
        ("inline-code", INLINE_CODE_RE),
        ("url", URL_RE),
        ("markdown-link", MD_LINK_RE),
        ("html-tag", HTML_TAG_RE),
    ]
    for kind, pattern in patterns:
        for match in pattern.finditer(text):
            if inside_fence(match.start()):
                continue
            spans.append(Span(kind, match.start(), match.end(),
                              _line_of(offsets, match.start()),
                              _line_of(offsets, match.end() - 1 if match.end() else match.start()),
                              match.group(0)[:12]))
    return spans


def find_marked_blocks(text: str, offsets: list[int]) -> list[Span]:
    """Khoanh vùng do dự án đánh dấu: generated block và log/chuẩn đoán.

    Cú pháp được hỗ trợ, tất cả đều là comment HTML để không hiện ra khi render:

        <!-- tvkt:protected:begin -->  ...  <!-- tvkt:protected:end -->
        <!-- tvkt:generated:begin id -->  ...  <!-- tvkt:generated:end -->
        <!-- tvkt:diagnostics:begin -->  ...  <!-- tvkt:diagnostics:end -->

    Vùng thiếu dấu kết thúc thì kéo tới hết tệp.
    """
    spans: list[Span] = []
    marker = re.compile(r"<!--\s*tvkt:(?P<kind>protected|generated|diagnostics):(?P<edge>begin|end)\b[^>]*-->")
    open_span: dict[str, int] = {}
    for match in marker.finditer(text):
        kind = match.group("kind")
        edge = match.group("edge")
        if edge == "begin":
            open_span.setdefault(kind, match.start())
            continue
        start = open_span.pop(kind, None)
        if start is None:
            continue
        spans.append(Span(f"{kind}-block", start, match.end(),
                          _line_of(offsets, start), _line_of(offsets, match.end() - 1)))
    for kind, start in open_span.items():
        spans.append(Span(f"{kind}-block", start, len(text),
                          _line_of(offsets, start), len(text.split("\n"))))
    return spans


def protected_spans(text: str, include_marked: bool = True) -> list[Span]:
    """Toàn bộ vùng được bảo vệ, đã sắp xếp theo offset."""
    offsets = _line_offsets(text)
    fenced = find_fenced_code(text, offsets)
    spans = list(fenced)
    spans.extend(find_inline_spans(text, offsets, fenced))
    if include_marked:
        spans.extend(find_marked_blocks(text, offsets))
    spans.sort(key=lambda s: (s.start, s.end))
    return spans


def protected_line_set(text: str, spans: Iterable[Span]) -> set[int]:
    """Tập số dòng nằm trọn trong một vùng bảo vệ."""
    lines: set[int] = set()
    for span in spans:
        lines.update(range(span.start_line, span.end_line + 1))
    return lines


def mask_spans(text: str, spans: Iterable[Span]) -> str:
    """Che các vùng bảo vệ bằng khoảng trắng, giữ nguyên số dòng và độ dài dòng.

    Nhờ vậy mọi offset và số dòng tính trên văn bản đã che vẫn trùng với bản gốc,
    nên không cần ánh xạ lại vị trí finding.
    """
    chars = list(text)
    for span in spans:
        for pos in range(span.start, min(span.end, len(chars))):
            if chars[pos] != "\n":
                chars[pos] = " "
    return "".join(chars)


def sha256(text: str) -> str:
    import hashlib

    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Kiểm tra câu và đơn vị
# ---------------------------------------------------------------------------
def count_units(text: str) -> int:
    return len(re.findall(r"\S+", text))


# Viết tắt tiếng Việt và tiếng Anh thường gặp. Dấu chấm sau chúng không kết thúc câu.
ABBREVIATIONS = {
    "tp", "tp.", "q.", "p.", "tx", "tt", "cb", "nv", "vd", "v.v", "vv",
    "e.g", "i.e", "etc", "vs", "fig", "no", "mr", "mrs", "dr", "ms", "st",
    "inc", "ltd", "co", "approx", "ch", "sec", "eq", "ref", "al",
}


def split_sentences(text: str) -> list[str]:
    """Tách câu theo dấu kết thúc, bỏ qua viết tắt, số thập phân và version.

    Đây vẫn là heuristic, nhưng đã xử lý các ca hay làm sai số tiếng:
    `1.2.3`, `3.5 ms`, `e.g.`, `TP.HCM`, `Node.js`, `v1.2`.
    """
    parts: list[str] = []
    start = 0
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch not in ".!?":
            i += 1
            continue
        # Dấu chấm giữa hai chữ số là phần thập phân hoặc version: không phải hết câu.
        if ch == "." and 0 < i < n - 1 and text[i - 1].isdigit() and text[i + 1].isdigit():
            i += 1
            continue
        # Sau dấu câu phải là hết chuỗi, khoảng trắng hoặc xuống dòng. Nếu là ký tự
        # khác (dấu đóng ngoặc, chữ liền) thì dấu câu này không kết thúc câu.
        after = i + 1
        if after < n and text[after] not in " \t\n":
            i += 1
            continue
        while after < n and text[after] in " \t":
            after += 1
        if ch == ".":
            word = re.search(r"([A-Za-zÀ-ỹ][\wÀ-ỹ.]*)$", text[start:i + 1])
            tail = (word.group(1) if word else "").lower()
            if tail in ABBREVIATIONS or tail.endswith(".js") or tail.endswith(".py"):
                i += 1
                continue
        parts.append(text[start:after].strip())
        start = after
        i = after
    if text[start:].strip():
        parts.append(text[start:].strip())
    return [p for p in parts if p]


def is_heading_or_table(line: str) -> bool:
    stripped = line.lstrip()
    return (stripped.startswith("#") or stripped.startswith("|") or
            bool(re.match(r"^\s*[-:| ]{3,}\s*$", line)))


def is_instruction(line: str, rules: dict[str, Any]) -> bool:
    x = re.sub(r"^\s*(?:[-*+]\s+|\d+[.)]\s+)", "", line, count=1)
    x = x.strip()
    if re.match(r"^Bước\s+\d+\b", x, re.IGNORECASE):
        return True
    for verb in rules["imperative_leads"]:
        if re.match(r"^" + re.escape(verb) + r"(?:\s|[.:,]|$)", x, re.IGNORECASE):
            return True
    return False


def _finding(rule_id: str, standard_rule: str, severity: str, line: int,
             message: str, suggestion: str = "", **extra: Any) -> dict[str, Any]:
    out = dict(rule_id=rule_id, standard_rule=standard_rule, severity=severity,
               line=line, message=message, suggestion=suggestion)
    out.update(extra)
    return out


# ---------------------------------------------------------------------------
# Linter
# ---------------------------------------------------------------------------
DEFAULT_RULES: dict[str, Any] = {
    "version": "unknown",
    "max_instruction_units": 30,
    "max_descriptive_units": 40,
    "max_sentences_per_paragraph": 5,
    "normative_keywords": ["PHẢI", "KHÔNG ĐƯỢC", "NÊN", "ĐƯỢC PHÉP"],
    "ambiguous_terms": [],
    "planning_terms": [],
    "planning_status_labels": [],
    "imperative_leads": [],
}

DEFAULT_TERMS: dict[str, Any] = {"version": "unknown", "terms": [], "discouraged_phrases": []}


def lint_text(text: str, path: str = "<text>",
              rules: dict[str, Any] | None = None,
              terms: dict[str, Any] | None = None,
              include_marked: bool = True) -> dict[str, Any]:
    """Kiểm tra văn bản và trả kết quả có schema ổn định.

    Vùng bảo vệ (fenced code, inline code, URL, Markdown link, thẻ HTML, block
    do dự án đánh dấu) được che trước khi kiểm tra: không sinh finding và không
    bị sửa. Một khi thân tài liệu chứa vùng bảo vệ thì hash của văn bản gốc vẫn
    là hash của input không đổi — linter không bao giờ trả về văn bản đã sửa.
    """
    if rules is None or terms is None:
        rules, terms = load_config()

    findings: list[dict[str, Any]] = []
    spans = protected_spans(text, include_marked=include_marked)
    masked = mask_spans(text, spans)
    fenced_lines = protected_line_set(text, [s for s in spans if s.kind == "fenced-code"])
    any_protected_lines = protected_line_set(text, spans)

    paragraph: list[tuple[int, str]] = []

    norm_keywords = sorted(rules["normative_keywords"], key=len, reverse=True)
    norm_re = re.compile(
        r"(?<!\w)(?:" + "|".join(map(re.escape, norm_keywords)) + r")(?!\w)", re.I)

    def flush_paragraph() -> None:
        nonlocal paragraph
        if paragraph:
            joined = " ".join(x for _, x in paragraph)
            sent_count = len(split_sentences(joined))
            if sent_count > rules["max_sentences_per_paragraph"]:
                findings.append(_finding(
                    "L005", "TVKT-016", "WARNING", paragraph[0][0],
                    f"Đoạn có khoảng {sent_count} câu, vượt {rules['max_sentences_per_paragraph']} câu.",
                    "Cân nhắc tách đoạn theo chủ đề."))
        paragraph = []

    masked_lines = masked.split("\n")
    original_lines = text.split("\n")

    for index, line in enumerate(masked_lines, start=1):
        if index in any_protected_lines:
            # Dòng nằm trong vùng bảo vệ kéo dài nhiều dòng: bỏ qua hoàn toàn.
            if index in fenced_lines:
                flush_paragraph()
            continue
        stripped = line.strip()
        if not stripped:
            flush_paragraph()
            continue
        if is_heading_or_table(stripped):
            flush_paragraph()
            continue
        # Dòng chỉ còn token che: không có văn xuôi để kiểm tra.
        if not re.search(r"[^\s📄]", stripped):
            flush_paragraph()
            continue

        for phrase in terms.get("discouraged_phrases", []):
            bad = phrase["phrase"]
            if re.search(r"(?<!\w)" + re.escape(bad) + r"(?!\w)", stripped, re.I):
                findings.append(_finding(
                    "L001", "TVKT-002", "WARNING", index,
                    f"Cụm từ không ưu tiên: '{bad}'.",
                    f"Cân nhắc: '{phrase['preferred']}'. Chỉ thay khi không đổi nghĩa.",
                    phrase_id=phrase.get("id", "")))

        matches = list(norm_re.finditer(stripped))
        for match in matches:
            token = match.group(0)
            if token != token.upper():
                findings.append(_finding(
                    "L006", "TVKT-011", "INFO", index,
                    f"Từ khóa quy định chưa viết hoa: '{token}'.",
                    f"Nếu đây là quy định, dùng '{token.upper()}'."))

        if matches:
            for ambiguous in rules["ambiguous_terms"]:
                if re.search(r"(?<!\w)" + re.escape(ambiguous) + r"(?!\w)", stripped, re.I):
                    findings.append(_finding(
                        "L002", "TVKT-003", "WARNING", index,
                        f"Từ mơ hồ trong câu quy định: '{ambiguous}'.",
                        "Bổ sung tiêu chí đo hoặc điều kiện chấp nhận; không tự bịa ngưỡng."))

        if (not any(label in stripped.upper() for label in rules["planning_status_labels"]) and
                any(x in stripped.casefold() for x in rules["planning_terms"])):
            findings.append(_finding(
                "L007", "TVKT-023", "INFO", index,
                "Câu đề cập kế hoạch nhưng chưa thấy nhãn trạng thái trên dòng.",
                "Xem xét ghi rõ DỰ KIẾN/ĐANG PHÁT TRIỂN nếu đúng ngữ cảnh."))

        original_visible = original_lines[index - 1] if index - 1 < len(original_lines) else line
        instruction = is_instruction(original_visible, rules)
        threshold = rules["max_instruction_units"] if instruction else rules["max_descriptive_units"]
        check_id = "L003" if instruction else "L004"
        for sentence in split_sentences(stripped):
            units = count_units(sentence)
            if units > threshold:
                findings.append(_finding(
                    check_id, "TVKT-016", "WARNING", index,
                    f"Câu có khoảng {units} tiếng/đơn vị, vượt ngưỡng {threshold}.",
                    "Tách câu hoặc loại cụm dư thừa; xác minh lại ý nghĩa."))

        if re.match(r"^\s*(?:[-*+]\s+|\d+[.)]\s+)", original_visible):
            flush_paragraph()
        else:
            paragraph.append((index, stripped))

    flush_paragraph()
    findings.sort(key=lambda f: (f["line"], f["rule_id"], f["message"]))
    counts = {key: sum(1 for f in findings if f["severity"] == key)
              for key in ("ERROR", "WARNING", "INFO")}

    rules_executed = ["L001", "L002", "L003", "L004", "L005", "L006", "L007"]
    rules_skipped = [{
        "rule_id": "L006",
        "reason": "Còn false positive trên chữ thường không mang nghĩa quy định; "
                  "giữ mức INFO, chưa nâng thành blocking.",
    }]

    return {
        "schema_version": SCHEMA_VERSION,
        "file": path,
        "input_sha256": sha256(text),
        "lint_status": "FINDINGS" if findings else "PASS",
        "rules_executed": rules_executed,
        "rules_skipped": rules_skipped,
        "rule_semantics": {
            "L001": "cụm từ không ưu tiên (WARNING)",
            "L002": "từ mơ hồ trong câu quy định (WARNING)",
            "L003": "câu hướng dẫn dài (WARNING)",
            "L004": "câu mô tả dài (WARNING)",
            "L005": "đoạn quá nhiều câu (WARNING)",
            "L006": "từ khóa quy định chưa viết hoa (INFO)",
            "L007": "thiếu nhãn trạng thái khi nói về kế hoạch (INFO)",
        },
        "summary": counts,
        "findings": findings,
        "protected_spans": [s.as_dict() for s in spans],
        "protected_span_count": len(spans),
        "semantic_review": NOT_RUN,
        "technical_verification": NOT_RUN,
        "limitations": [
            "Chỉ kiểm tra L001-L007; 23 quy tắc còn lại của TVKT-100 cần review ngữ nghĩa.",
            "PASS không có nghĩa tài liệu tuân thủ TVKT-100.",
            "PASS không có nghĩa nội dung đúng kỹ thuật.",
            "Tách câu là heuristic; sai số ở viết tắt hiếm và cấu trúc bất thường.",
        ],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="TVKT-100 Markdown linter (L001-L007)")
    parser.add_argument("file", help="Đường dẫn tệp Markdown UTF-8, hoặc - để đọc stdin")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--fail-on", choices=("none", "ERROR", "WARNING"), default="none")
    parser.add_argument("--quiet", action="store_true", help="Chỉ in dòng tổng hợp")
    args = parser.parse_args(argv)

    try:
        if args.file == "-":
            content = sys.stdin.read()
            name = "<stdin>"
        else:
            file = Path(args.file)
            content = file.read_text(encoding="utf-8")
            name = str(file)
        result = lint_text(content, name)
    except (OSError, UnicodeError, ValueError, KeyError, json.JSONDecodeError) as exc:
        print(f"LỖI: không thể kiểm tra. Nguyên nhân: {exc}", file=sys.stderr)
        return 2

    if args.format == "json":
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0

    print(f"TVKT-LINTER: {name} | " + ", ".join(f"{k}={v}" for k, v in result["summary"].items()))
    if args.quiet:
        return 0
    for finding in result["findings"]:
        print(f"{finding['line']}: {finding['severity']} {finding['rule_id']} "
              f"({finding['standard_rule']}): {finding['message']}")
        if finding["suggestion"]:
            print(f"    → {finding['suggestion']}")
    if not result["findings"]:
        print("PASS (L001-L007): không thấy dấu hiệu vi phạm trong phạm vi đã kiểm tra.")
        print("Không kết luận tuân thủ TVKT-100; không kết luận đúng kỹ thuật.")
    print(f"semantic_review={result['semantic_review']} "
          f"technical_verification={result['technical_verification']}")
    if args.fail_on == "ERROR" and result["summary"]["ERROR"]:
        return 1
    if args.fail_on == "WARNING" and (result["summary"]["ERROR"] or result["summary"]["WARNING"]):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
