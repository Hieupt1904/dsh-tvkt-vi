#!/usr/bin/env python3
"""Đo KPI của linter và prompt trên một cây tài liệu, để so với baseline đã commit.

Chỉ đọc. Không sửa rule, không sửa tài liệu, không gọi mạng.

Dùng:
    python3 tests/bench/bench.py                 # in báo cáo
    python3 tests/bench/bench.py --json          # in JSON
    python3 tests/bench/bench.py --compare       # so với baseline đã commit
    python3 tests/bench/bench.py --write-baseline

Mã thoát: 0 trong ngưỡng, 1 hồi quy so với baseline, 2 lỗi môi trường.

Ngưỡng hồi quy (cố định, không tự nới):
    - false positive của rule blocking tăng lên               → fail
    - p95 latency tăng quá 3x baseline                        → fail
    - số finding WARNING trên corpus giảm (nghi false negative) → fail, trừ khi
      baseline được cập nhật kèm lý do trong CHANGELOG.
"""
from __future__ import annotations

import argparse
import glob
import json
import statistics
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
PKG = HERE.parents[1]
BASELINE = HERE / "baseline.json"
sys.path.insert(0, str(PKG / "vendor" / "tvkt" / "tools"))

from tvkt_lint import lint_text  # noqa: E402

BLOCKING_RULES = ("L001", "L002", "L003", "L004", "L005")
REPEATS = 5


# Thư mục chứa fixture cố tình vi phạm: loại khỏi corpus đo tải.
EXCLUDED_DIRS = ("node_modules", "tests/golden")


def corpus_files() -> list[Path]:
    """Tài liệu thật của dự án.

    Loại `tests/golden/**`: đó là fixture có chủ đích vi phạm rule, nên đưa vào
    corpus đo sẽ làm số finding tăng vô nghĩa và che tín hiệu thật.
    """
    files = []
    for name in glob.glob(str(PKG / "**" / "*.md"), recursive=True):
        rel = Path(name).relative_to(PKG).as_posix()
        if any(rel.startswith(prefix) or f"/{prefix}/" in f"/{rel}" for prefix in EXCLUDED_DIRS):
            continue
        files.append(Path(name))
    return sorted(files)


def measure() -> dict:
    files = corpus_files()
    latencies: list[float] = []
    per_rule: dict[str, int] = {}
    per_severity: dict[str, int] = {"ERROR": 0, "WARNING": 0, "INFO": 0}
    total_findings = 0
    protected_spans = 0

    for path in files:
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            continue
        for _ in range(REPEATS):
            started = time.perf_counter()
            result = lint_text(text, str(path))
            latencies.append((time.perf_counter() - started) * 1000.0)
        protected_spans += len(result["protected_spans"])
        total_findings += len(result["findings"])
        for finding in result["findings"]:
            per_rule[finding["rule_id"]] = per_rule.get(finding["rule_id"], 0) + 1
            per_severity[finding["severity"]] = per_severity.get(finding["severity"], 0) + 1

    latencies.sort()
    count = len(latencies)
    return {
        "schema_version": 1,
        "corpus_documents": len(files),
        "measurements": count,
        "latency_ms": {
            "p50": round(statistics.median(latencies), 3) if count else 0.0,
            "p95": round(latencies[min(count - 1, int(count * 0.95))], 3) if count else 0.0,
            "p99": round(latencies[min(count - 1, int(count * 0.99))], 3) if count else 0.0,
            "max": round(latencies[-1], 3) if count else 0.0,
        },
        "findings_total": total_findings,
        "findings_by_severity": per_severity,
        "findings_by_rule": dict(sorted(per_rule.items())),
        "blocking_findings": sum(per_rule.get(rule, 0) for rule in BLOCKING_RULES),
        "protected_spans_total": protected_spans,
        "note": (
            "Latency đo trên chính cây tài liệu của repo, không phải tải tổng hợp. "
            "Số finding là của corpus này, không phải precision — precision nằm ở "
            "tests/golden/metrics.json."
        ),
    }


def golden_metrics() -> dict:
    path = PKG / "tests" / "golden" / "metrics.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def compare(current: dict, baseline: dict) -> list[str]:
    problems: list[str] = []
    base_latency = baseline.get("latency_ms", {})
    if base_latency.get("p95", 0) > 0:
        if current["latency_ms"]["p95"] > base_latency["p95"] * 3:
            problems.append(
                f"p95 latency {current['latency_ms']['p95']} ms vượt 3x baseline "
                f"{base_latency['p95']} ms")

    base_by_rule = baseline.get("findings_by_rule", {})
    for rule in BLOCKING_RULES:
        before = base_by_rule.get(rule, 0)
        now = current["findings_by_rule"].get(rule, 0)
        if now < before:
            problems.append(
                f"{rule}: {now} finding < baseline {before} — nghi false negative, "
                "kiểm tra lại thay vì hạ baseline")

    # Precision/recall của golden corpus: FP tăng là hồi quy; TP giảm là mất năng lực.
    base_golden_fp = baseline.get("golden", {}).get("totals", {}).get("FP")
    current_golden = current.get("golden", {}).get("totals", {})
    if base_golden_fp is not None and current_golden.get("FP", 0) > base_golden_fp:
        problems.append(f"golden FP {current_golden.get('FP')} > baseline {base_golden_fp}")
    base_golden_tp = baseline.get("golden", {}).get("totals", {}).get("TP")
    if base_golden_tp is not None and current_golden.get("TP", 0) < base_golden_tp:
        problems.append(f"golden TP {current_golden.get('TP')} < baseline {base_golden_tp}")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--compare", action="store_true")
    parser.add_argument("--write-baseline", action="store_true")
    args = parser.parse_args()

    current = measure()
    current["golden"] = golden_metrics()

    if args.write_baseline:
        BASELINE.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"đã ghi {BASELINE.relative_to(PKG)}")
        return 0

    if args.json:
        print(json.dumps(current, ensure_ascii=False, indent=2))
        return 0

    latency = current["latency_ms"]
    golden = current.get("golden", {})
    print(f"corpus: {current['corpus_documents']} tệp, {current['measurements']} lần đo")
    print(f"latency: p50={latency['p50']} ms p95={latency['p95']} ms "
          f"p99={latency['p99']} ms max={latency['max']} ms")
    print(f"findings: {current['findings_total']} "
          f"({current['findings_by_severity']}), blocking={current['blocking_findings']}")
    print(f"protected spans: {current['protected_spans_total']}")
    if golden:
        totals = golden.get("totals", {})
        print(f"golden: TP={totals.get('TP')} FP={totals.get('FP')} FN={totals.get('FN')} "
              f"trên {golden.get('corpus_documents')} ca")

    if not args.compare:
        return 0
    if not BASELINE.exists():
        print(f"chưa có baseline {BASELINE.relative_to(PKG)}; chạy --write-baseline một lần.")
        return 2
    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
    problems = compare(current, baseline)
    if problems:
        print("\nHỒI QUY:")
        for problem in problems:
            print(f"  ! {problem}")
        return 1
    print("\nOK: không có hồi quy so với baseline.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
