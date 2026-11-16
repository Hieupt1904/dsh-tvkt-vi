#!/usr/bin/env python3
"""Sinh golden corpus cho linter TVKT và ghi baseline metrics.

Corpus là **fixture có chủ đích**: mỗi tệp kiểm một hành vi đã được xác định
trước, và `expected.json` do script này ghi ra từ chính lần chạy đầu. Quy trình
đúng khi thêm ca mới:

1. Viết tệp `.md` với hành vi mong muốn, ghi rõ trong `DESCRIPTION`.
2. Chạy `python3 tests/golden/generate.py --write` để ghi `expected.json`.
3. Đọc tay kết quả. Nếu sai so với chủ đích thì sửa linter, không sửa fixture.
4. Chạy `--check` để bảo đảm expected khớp lần chạy sau.

Dùng:
    python3 tests/golden/generate.py --write     # ghi expected.json + metrics.json
    python3 tests/golden/generate.py --check     # chỉ so, thoát 1 nếu lệch
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
PKG = HERE.parents[1]
sys.path.insert(0, str(PKG / "vendor" / "tvkt" / "tools"))

from tvkt_lint import lint_text, protected_line_set, protected_spans  # noqa: E402

RULES = ["L001", "L002", "L003", "L004", "L005", "L006", "L007"]

# (thư mục, tên ca, mô tả, nhãn, văn bản)
CASES: list[tuple[str, str, str, list[str], str]] = [
    # ---------------- valid ----------------
    ("valid", "cau-ngan-dung-chu-dong",
     "Câu hướng dẫn ngắn, chủ động, chỉ dùng thuật ngữ đã duyệt.",
     ["TP"],
     "Hệ thống kiểm tra token trước khi chấp nhận yêu cầu.\n"
     "Dịch vụ trả về mã trạng thái 401 khi token hết hạn.\n"),
    ("valid", "so-thap-phan-va-version",
     "Số thập phân, version và đơn vị đo không được cắt câu sai.",
     ["TP", "segmentation"],
     "Ngưỡng mặc định là 500 ms và có thể đổi thành 1.5 giây.\n"
     "Bản 1.2.3 sửa lỗi hồi quy của bản 1.2.2.\n"),
    ("valid", "viet-tat-khong-cat-cau",
     "Viết tắt có dấu chấm không kết thúc câu.",
     ["TP", "segmentation"],
     "Văn phòng tại TP.HCM dùng e.g. mẫu này, v.v. khi cần.\n"),
    ("valid", "inline-code-va-url",
     "Identifier trong backtick và URL không bị đếm là văn xuôi.",
     ["TP", "protected"],
     "Gọi `POST /api/v1/sessions` với tham số `expires_in` để tạo phiên.\n"
     "Tài liệu ở https://example.com/api/sessions trên trang chủ.\n"),
    ("valid", "viet-anh-tron",
     "Câu Việt trộn thuật ngữ Anh vẫn đạt ngưỡng độ dài.",
     ["TP", "mixed-language"],
     "Hàm `retry()` dùng exponential backoff với jitter để tránh dồn tải.\n"),

    # ---------------- invalid ----------------
    ("invalid", "cau-hoc-thuat-dai",
     "Câu dài chứa cụm rỗng bị bắt buộc bởi L004.",
     ["TP"],
     "Trong trường hợp người dùng gửi yêu cầu mà hệ thống chưa hoàn tất việc kiểm tra "
     "tính hợp lệ của token và chưa xác minh quyền truy cập tương ứng thì hệ thống "
     "tiến hành trả về lỗi cho người dùng.\n"),
    ("invalid", "cum-khong-uu-tien",
     "Cụm không ưu tiên P001 bị bắt bởi L001.",
     ["TP", "terminology"],
     "Kỹ thuật viên tiến hành kiểm tra cấu hình trước khi triển khai.\n"),
    ("invalid", "tu-mo-ho-trong-quy-dinh",
     "Từ mơ hồ cạnh từ quy định bị bắt bởi L002.",
     ["TP"],
     "Dịch vụ PHẢI phản hồi nhanh trong mọi trường hợp.\n"),
    ("valid", "hai-doan-ngan",
     "Hai đoạn ba câu ngăn bởi dòng trống không bị báo L005.",
     ["TP"],
     "Dịch vụ nhận yêu cầu. Dịch vụ kiểm tra token. Dịch vụ đọc quyền.\n\n"
     "Dịch vụ ghi nhật ký. Dịch vụ trả kết quả. Dịch vụ đóng phiên.\n"),
    ("invalid", "doan-qua-nhieu-cau",
     "Đoạn sáu câu bị bắt bởi L005.",
     ["TP"],
     # Phải là MỘT đoạn: sáu câu trên cùng một dòng, không xuống dòng.
     "Dịch vụ nhận yêu cầu. Dịch vụ kiểm tra token. Dịch vụ đọc quyền. "
     "Dịch vụ ghi nhật ký. Dịch vụ trả kết quả. Dịch vụ đóng phiên.\n"),
    ("invalid", "tu-quy-dinh-chua-viet-hoa",
     "Từ quy định viết thường chỉ sinh INFO L006.",
     ["TP", "l006-info"],
     "Người dùng phải đăng nhập lại sau khi token hết hạn.\n"),
    ("invalid", "thieu-nhan-trang-thai",
     "Câu nói về kế hoạch thiếu nhãn trạng thái bị bắt bởi L007.",
     ["TP", "l007-info"],
     "Tính năng xuất báo cáo sẽ được triển khai trong quý sau.\n"),
    ("invalid", "cau-huong-dan-dai",
     "Dòng hướng dẫn vượt ngưỡng 30 tiếng bị bắt bởi L003.",
     ["TP"],
     "Mở tệp cấu hình của dịch vụ xác thực trong thư mục triển khai của môi trường "
     "staging rồi sửa trường thời gian chờ thành giá trị phù hợp với tải thực tế "
     "của hệ thống đang chạy.\n"),

    # ---------------- protected ----------------
    ("protected", "fence-bon-backtick",
     "Fence bốn backtick chứa fence ba backtick bên trong phải là một khối duy nhất.",
     ["protected", "FN-guard"],
     "Mở đầu hợp lệ.\n\n"
     "````markdown\n"
     "```\n"
     "Kỹ thuật viên tiến hành kiểm tra cấu hình để bảo đảm tính ổn định của dịch vụ trước giờ cao điểm.\n"
     "```\n"
     "````\n\n"
     "Kết thúc hợp lệ.\n"),
    ("protected", "fence-tilde",
     "Fence tilde và fence tilde dài đều được bảo vệ.",
     ["protected"],
     "Mở đầu.\n\n"
     "~~~\n"
     "tiến hành kiểm tra cấu hình không được báo lỗi ở đây vì đây là khối mã\n"
     "~~~\n\n"
     "~~~~\n"
     "tiến hành lưu dữ liệu cũng không được báo lỗi trong khối dài bốn dấu\n"
     "~~~~\n"),
    ("protected", "inline-nhieu-backtick",
     "Inline code dùng hai backtick chứa một backtick.",
     ["protected"],
     "Dùng `` giá trị có ` bên trong `` cho ví dụ thay thế.\n"),
    ("protected", "link-va-url",
     "URL trần và Markdown link không bị kiểm tra như văn xuôi.",
     ["protected"],
     "Xem https://example.com/tien-hanh-kiem-tra và [tài liệu này](https://example.com/thuc-hien-luu).\n"),
    ("protected", "khoi-danh-dau-du-an",
     "Block do dự án đánh dấu protected/generated không bị kiểm tra.",
     ["protected"],
     "Văn xuôi hợp lệ.\n\n"
     "<!-- tvkt:generated:begin api -->\n"
     "tiến hành kiểm tra cấu hình sẽ được triển khai ở bản kế tiếp của tài liệu này\n"
     "<!-- tvkt:generated:end -->\n\n"
     "Tiếp tục văn xuôi hợp lệ.\n"),
    ("protected", "json-yaml-shell-block",
     "Khối JSON, YAML và shell được bảo vệ toàn bộ.",
     ["protected"],
     "Cấu hình mẫu:\n\n"
     "```json\n"
     '{"tien_hanh_kiem_tra": true, "thoi_gian_cho": 500}\n'
     "```\n\n"
     "```yaml\n"
     "dich_vu:\n"
     "  tien_hanh_kiem_tra: true\n"
     "```\n\n"
     "```bash\n"
     "echo 'tiến hành kiểm tra'\n"
     "```\n"),
    ("protected", "log-chan-doan",
     "Log snippet trong block diagnostics được bảo vệ.",
     ["protected"],
     "Bản ghi lỗi:\n\n"
     "<!-- tvkt:diagnostics:begin -->\n"
     "[12:00:01] tiến hành kiểm tra cấu hình thất bại sau khi thử lại tự động ba lần\n"
     "<!-- tvkt:diagnostics:end -->\n"),

    # ---------------- terminology ----------------
    ("terminology", "identifier-giu-nguyen",
     "Identifier và endpoint trong backtick giữ nguyên, không bị coi là sai thuật ngữ.",
     ["terminology", "protected"],
     "Trường `tien_hanh_kiem_tra` và `POST /api/v1/retry` giữ nguyên tên gốc.\n"),
    ("terminology", "cum-khong-uu-tien-trong-cau",
     "Cụm không ưu tiên trong văn xuôi bị báo, kèm gợi ý thay thế.",
     ["terminology"],
     "Nhóm thực hiện lưu bản ghi sau khi nhằm mục đích giảm tải cho hàng đợi.\n"),

    # ---------------- mixed-language ----------------
    ("mixed-language", "viet-anh-cau-ngan",
     "Câu Việt trộn thuật ngữ Anh ngắn không bị báo độ dài.",
     ["mixed-language", "TP"],
     "Bật `feature flag` rồi khởi động lại worker để nạp cấu hình mới.\n"),
    ("mixed-language", "domain-va-path",
     "Domain và API path dài không làm câu bị đếm quá dài.",
     ["mixed-language", "protected"],
     "Gọi endpoint https://api.example.com/v1/reports/export với tham số lọc.\n"),
]

SPEC_CASES: list[tuple[str, str, str, str]] = [
    ("specs", "dac-ta-api-giu-nguyen-dinh-danh",
     "Đặc tả API: định danh, endpoint và mã lỗi phải giữ nguyên văn.",
     "# Đặc tả API xuất báo cáo\n\n"
     "Trường `report_id` trả về mã định danh duy nhất. Endpoint `POST /v1/reports/export`\n"
     "nhận tham số `format` và trả về `202 Accepted`. Mã lỗi `ERR_RATE_LIMIT` xuất hiện\n"
     "khi vượt giới hạn tốc độ.\n"),
    ("specs", "dac-ta-co-nhan-chua-xac-minh",
     "Đặc tả ghi nhãn chưa xác minh đúng mức quy định.",
     "# Đặc tả đồng bộ\n\n"
     "Tính năng đồng bộ hai chiều là **DỰ KIẾN**. Ngưỡng thời gian chờ là **CHƯA XÁC MINH**.\n"),
]


def rule_hits(result: dict) -> dict[str, int]:
    hits: dict[str, int] = {}
    for finding in result["findings"]:
        hits[finding["rule_id"]] = hits.get(finding["rule_id"], 0) + 1
    return hits


def expected_for(text: str, description: str, labels: list[str]) -> dict:
    result = lint_text(text, "<fixture>")
    spans = protected_spans(text)
    protected_lines = sorted(protected_line_set(text, spans))
    hits = rule_hits(result)
    return {
        "description": description,
        "labels": labels,
        "expect_absent_rules": [rid for rid in RULES if hits.get(rid, 0) == 0],
        "expect_rules": [
            {"rule_id": rid, "count": hits[rid]}
            for rid in RULES if hits.get(rid, 0) > 0
        ],
        "expect_protected_lines": protected_lines,
        "expect_unique": sorted({f"{f['rule_id']}:{f['line']}" for f in result["findings"]}),
        "observed": {
            "lint_status": result["lint_status"],
            "summary": result["summary"],
            "protected_span_kinds": sorted({s["kind"] for s in result["protected_spans"]}),
        },
    }


def build_metrics() -> dict:
    totals = {"TP": 0, "FP": 0, "FN": 0}
    per_rule: dict[str, dict[str, int]] = {
        rid: {"tp": 0, "fp": 0, "fn": 0} for rid in RULES
    }
    runtime_ms = 0.0
    documents = 0
    protected_spans_total = 0

    all_cases = [(d, n, desc, labels, text) for d, n, desc, labels, text in CASES]
    all_cases += [(d, n, desc, ["protected"], text) for d, n, desc, text in SPEC_CASES]

    for folder, name, _desc, _labels, text in all_cases:
        started = time.perf_counter()
        result = lint_text(text, f"{folder}/{name}")
        runtime_ms += (time.perf_counter() - started) * 1000.0
        documents += 1
        protected_spans_total += len(result["protected_spans"])

        expected_path = HERE / folder / f"{name}.expected.json"
        expected = json.loads(expected_path.read_text(encoding="utf-8")) if expected_path.exists() else None
        if expected is None:
            continue

        # Nhãn corpus xác nhận hành vi: rule trong expect_rules là TP, rule trong
        # expect_absent_rules với ca có nhãn tương ứng là xác nhận không có FP.
        hits = rule_hits(result)
        for rid in RULES:
            want = next((e["count"] for e in expected["expect_rules"] if e["rule_id"] == rid), 0)
            got = hits.get(rid, 0)
            if want > 0:
                matched = min(want, got)
                per_rule[rid]["tp"] += matched
                per_rule[rid]["fn"] += max(0, want - matched)
                per_rule[rid]["fp"] += max(0, got - want)
            else:
                per_rule[rid]["fp"] += got
        for rid in RULES:
            totals["TP"] += per_rule[rid]["tp"]
            totals["FP"] += per_rule[rid]["fp"]
            totals["FN"] += per_rule[rid]["fn"]

    precision = {
        rid: (v["tp"] / (v["tp"] + v["fp"]) if (v["tp"] + v["fp"]) else None)
        for rid, v in per_rule.items()
    }
    recall = {
        rid: (v["tp"] / (v["tp"] + v["fn"]) if (v["tp"] + v["fn"]) else None)
        for rid, v in per_rule.items()
    }
    return {
        "schema_version": 1,
        "corpus_documents": documents,
        "protected_spans_total": protected_spans_total,
        "total_runtime_ms": round(runtime_ms, 3),
        "per_document_ms": round(runtime_ms / documents, 3) if documents else 0.0,
        "totals": totals,
        "per_rule": per_rule,
        "precision": precision,
        "recall": recall,
        "note": (
            "TP/FP/FN tính theo kỳ vọng đã ghi trong expected.json của từng ca. "
            "L006 và L007 là INFO, không dùng làm blocking rule. "
            "Precision của rule chỉ có nghĩa trong phạm vi corpus này."
        ),
    }


def write_all() -> int:
    written = 0
    for folder, name, desc, labels, text in CASES:
        target = HERE / folder
        target.mkdir(parents=True, exist_ok=True)
        (target / f"{name}.md").write_text(text, encoding="utf-8")
        (target / f"{name}.expected.json").write_text(
            json.dumps(expected_for(text, desc, labels), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8")
        written += 1
    for folder, name, desc, text in SPEC_CASES:
        target = HERE / folder
        target.mkdir(parents=True, exist_ok=True)
        (target / f"{name}.md").write_text(text, encoding="utf-8")
        (target / f"{name}.expected.json").write_text(
            json.dumps(expected_for(text, desc, ["protected", "spec"]), ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8")
        written += 1

    (HERE / "metrics.json").write_text(
        json.dumps(build_metrics(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"đã ghi {written} ca + metrics.json")
    return 0


def check_all() -> int:
    problems: list[str] = []
    for folder, name, desc, labels, text in CASES + [(d, n, de, ["protected", "spec"], t) for d, n, de, t in SPEC_CASES]:
        path = HERE / folder / f"{name}.expected.json"
        md_path = HERE / folder / f"{name}.md"
        if not path.exists() or not md_path.exists():
            problems.append(f"{folder}/{name}: thiếu fixture hoặc expected")
            continue
        if md_path.read_text(encoding="utf-8") != text:
            problems.append(f"{folder}/{name}: tệp .md đã bị sửa tay, khác nguồn trong generate.py")
            continue
        want = json.loads(path.read_text(encoding="utf-8"))
        got = expected_for(text, desc, labels)
        if want != got:
            diff_keys = [k for k in want if want.get(k) != got.get(k)]
            problems.append(f"{folder}/{name}: expected lệch ở {diff_keys}")

    metrics_path = HERE / "metrics.json"
    current = build_metrics()
    if not metrics_path.exists():
        problems.append("thiếu metrics.json")
    else:
        committed = json.loads(metrics_path.read_text(encoding="utf-8"))
        # So phần ổn định; runtime là số đo nên chỉ so ngưỡng.
        for key in ("corpus_documents", "protected_spans_total", "totals", "per_rule", "precision", "recall"):
            if committed.get(key) != current.get(key):
                problems.append(f"metrics.{key} lệch baseline")
        if committed.get("per_document_ms", 0) > 0 and current["per_document_ms"] > committed["per_document_ms"] * 3:
            problems.append(
                f"metrics.per_document_ms tăng quá 3x: {committed['per_document_ms']} → {current['per_document_ms']}")

    if problems:
        print("GOLDEN: FAIL")
        for problem in problems:
            print(f"  ! {problem}")
        return 1
    print(f"GOLDEN: OK — {current['corpus_documents']} ca, "
          f"{current['total_runtime_ms']} ms, "
          f"protected spans {current['protected_spans_total']}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.write:
        return write_all()
    return check_all()


if __name__ == "__main__":
    raise SystemExit(main())
