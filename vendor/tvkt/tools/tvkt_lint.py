#!/usr/bin/env python3
"""TVKT-100 v1.0: heuristic Vietnamese technical-language linter (stdlib only).

Commands:
    python3 tools/tvkt_lint.py your_file.md
    python3 tools/tvkt_lint.py your_file.md --format json --fail-on WARNING

This tool only checks L001-L007; it does not validate technical correctness.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RULES_PATH = ROOT / "config" / "rules.json"
TERMS_PATH = ROOT / "config" / "terms.json"


def load_config() -> tuple[dict[str, Any], dict[str, Any]]:
    return (json.loads(RULES_PATH.read_text(encoding="utf-8")),
            json.loads(TERMS_PATH.read_text(encoding="utf-8")))


def masked_line(line: str) -> str:
    """Mask inline code/URLs to reduce spurious punctuation and length checks."""
    line = re.sub(r"`[^`]+`", " MÃ ", line)
    line = re.sub(r"https?://\S+", " LIÊN_KẾT ", line)
    line = re.sub(r"\[[^\]]+\]\([^)]*\)", " LIÊN_KẾT ", line)
    line = re.sub(r"[*_~]", "", line)
    return line.strip()


def count_units(text: str) -> int:
    return len(re.findall(r"\S+", text))


def split_sentences(text: str) -> list[str]:
    # Intentionally a simple heuristic. URLs and code already masked.
    chunks = re.split(r"(?<=[.!?])\s+", text.strip())
    return [x.strip() for x in chunks if x.strip()]


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
             message: str, suggestion: str = "") -> dict[str, Any]:
    return dict(rule_id=rule_id, standard_rule=standard_rule,
                severity=severity, line=line, message=message,
                suggestion=suggestion)


def lint_text(text: str, path: str = "<text>",
              rules: dict[str, Any] | None = None,
              terms: dict[str, Any] | None = None) -> dict[str, Any]:
    if rules is None or terms is None:
        rules, terms = load_config()
    findings: list[dict[str, Any]] = []
    inside_code = False
    paragraph: list[tuple[int, str]] = []

    norm_keywords = sorted(rules["normative_keywords"], key=len, reverse=True)
    norm_re = re.compile(r"(?<!\w)(?:" + "|".join(map(re.escape, norm_keywords)) + r")(?!\w)", re.I)

    def flush_paragraph() -> None:
        nonlocal paragraph
        if paragraph:
            joined = " ".join(x for _, x in paragraph)
            sent_count = len(split_sentences(joined))
            if sent_count > rules["max_sentences_per_paragraph"]:
                findings.append(_finding("L005", "TVKT-016", "WARNING", paragraph[0][0],
                    f"Đoạn có khoảng {sent_count} câu, vượt {rules['max_sentences_per_paragraph']} câu.",
                    "Cân nhắc tách đoạn theo chủ đề."))
        paragraph = []

    for index, original in enumerate(text.splitlines(), start=1):
        line = original.strip()
        if line.startswith("```") or line.startswith("~~~"):
            flush_paragraph()
            inside_code = not inside_code
            continue
        if inside_code:
            continue
        if not line or is_heading_or_table(line):
            flush_paragraph()
            continue

        line = masked_line(original)
        # No prose diagnostics on unmodified, URL-only or code-only text.
        if not line or line == "MÃ":
            flush_paragraph()
            continue

        for phrase in terms.get("discouraged_phrases", []):
            bad = phrase["phrase"]
            if re.search(r"(?<!\w)" + re.escape(bad) + r"(?!\w)", line, re.I):
                findings.append(_finding("L001", "TVKT-002", "WARNING", index,
                    f"Cụm từ không ưu tiên: '{bad}'.",
                    f"Cân nhắc: '{phrase['preferred']}'. Chỉ thay khi không đổi nghĩa."))

        matches = list(norm_re.finditer(line))
        for match in matches:
            token = match.group(0)
            if token != token.upper():
                findings.append(_finding("L006", "TVKT-011", "INFO", index,
                    f"Từ khóa quy định chưa viết hoa: '{token}'.",
                    f"Nếu đây là quy định, dùng '{token.upper()}'."))

        if matches:
            for ambiguous in rules["ambiguous_terms"]:
                if re.search(r"(?<!\w)" + re.escape(ambiguous) + r"(?!\w)", line, re.I):
                    findings.append(_finding("L002", "TVKT-003", "WARNING", index,
                        f"Từ mơ hồ trong câu quy định: '{ambiguous}'.",
                        "Bổ sung tiêu chí đo hoặc điều kiện chấp nhận; không tự bịa ngưỡng."))

        if (not any(label in line.upper() for label in rules["planning_status_labels"]) and
                any(x in line.casefold() for x in rules["planning_terms"])):
            findings.append(_finding("L007", "TVKT-023", "INFO", index,
                "Câu đề cập kế hoạch nhưng chưa thấy nhãn trạng thái trên dòng.",
                "Xem xét ghi rõ DỰ KIẾN/ĐANG PHÁT TRIỂN nếu đúng ngữ cảnh."))

        instruction = is_instruction(original, rules)
        threshold = rules["max_instruction_units"] if instruction else rules["max_descriptive_units"]
        check_id = "L003" if instruction else "L004"
        for sentence in split_sentences(line):
            units = count_units(sentence)
            if units > threshold:
                findings.append(_finding(check_id, "TVKT-016", "WARNING", index,
                    f"Câu có khoảng {units} tiếng/đơn vị, vượt ngưỡng {threshold}.",
                    "Tách câu hoặc loại cụm dư thừa; xác minh lại ý nghĩa."))

        if re.match(r"^\s*(?:[-*+]\s+|\d+[.)]\s+)", original):
            flush_paragraph()
        else:
            paragraph.append((index, line))

    flush_paragraph()
    findings.sort(key=lambda f: (f["line"], f["rule_id"], f["message"]))
    counts = {key: sum(1 for f in findings if f["severity"] == key)
              for key in ("ERROR", "WARNING", "INFO")}
    return {"file": path, "summary": counts, "findings": findings}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="TVKT-100 Markdown linter (L001-L007)")
    parser.add_argument("file", help="Đường dẫn tệp Markdown UTF-8")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--fail-on", choices=("none", "ERROR", "WARNING"), default="none")
    args = parser.parse_args(argv)
    file = Path(args.file)
    try:
        content = file.read_text(encoding="utf-8")
        result = lint_text(content, str(file))
    except (OSError, UnicodeError, ValueError, KeyError, json.JSONDecodeError) as exc:
        print(f"Không thể kiểm tra: {exc}", file=sys.stderr)
        return 2
    if args.format == "json":
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(f"TVKT-LINTER: {file} | " + ", ".join(f"{k}={v}" for k,v in result["summary"].items()))
        for f in result["findings"]:
            print(f"{f['line']}: {f['severity']} {f['rule_id']} ({f['standard_rule']}): {f['message']}")
            if f["suggestion"]:
                print(f"    → {f['suggestion']}")
        if not result["findings"]:
            print("PASS: Không tìm thấy dấu hiệu vi phạm trong phạm vi L001-L007.")
    if args.fail_on == "ERROR" and result["summary"]["ERROR"]:
        return 1
    if args.fail_on == "WARNING" and (result["summary"]["ERROR"] or result["summary"]["WARNING"]):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
