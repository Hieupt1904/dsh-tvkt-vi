#!/usr/bin/env python3
"""Rà tiếng Việt bằng linter TVKT-100 đóng gói kèm plugin, không cần tạo tệp.

Dùng:
    python3 lint-text.py                 # đọc stdin
    python3 lint-text.py bai.md          # đọc tệp
    echo "..." | python3 lint-text.py --json
    pbpaste | python3 lint-text.py --quiet

Linter nằm trong gói tại `vendor/tvkt/`. Muốn dùng bộ chuẩn TVKT-100 bản đầy
đủ trên máy, đặt `TVKT_HOME` trỏ tới thư mục gốc của bộ đó.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
DEFAULT_HOME = SKILL_DIR.parents[1] / "vendor" / "tvkt"
TVKT_HOME = Path(os.environ.get("TVKT_HOME", DEFAULT_HOME))
sys.path.insert(0, str(TVKT_HOME / "tools"))

try:
    from tvkt_lint import lint_text  # type: ignore
except Exception as exc:  # pragma: no cover - chẩn đoán môi trường
    sys.stderr.write(
        f"Không nạp được linter từ {TVKT_HOME / 'tools'}: {exc}\n"
        "Đặt TVKT_HOME trỏ tới thư mục gốc có tools/tvkt_lint.py.\n"
    )
    raise SystemExit(2)


def main(argv: list[str]) -> int:
    args = [a for a in argv[1:] if not a.startswith("--")]
    flags = set(argv[1:])
    fmt = "json" if ("--json" in flags or ("--format" in flags and "json" in flags)) else "text"

    if args:
        path = Path(args[0])
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as exc:
            sys.stderr.write(f"Không đọc được {path}: {exc}\n")
            return 2
        name = str(path)
    else:
        text = sys.stdin.read()
        name = "<stdin>"

    result = lint_text(text, name)

    if fmt == "json":
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    counts = result["summary"]
    print(f"TVKT-LINTER: {name} | ERROR={counts['ERROR']}, "
          f"WARNING={counts['WARNING']}, INFO={counts['INFO']}")
    if "--quiet" in flags:
        return 0
    for f in result["findings"]:
        print(f"{f['line']}: {f['severity']} {f['rule_id']} ({f['standard_rule']}): {f['message']}")
        if f["suggestion"]:
            print(f"    → {f['suggestion']}")
    if not result["findings"]:
        print("PASS: không thấy dấu hiệu vi phạm trong phạm vi L001-L007.")
        print("Lưu ý: PASS không chứng minh nội dung đúng kỹ thuật (TVKT-029).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
