"""
Ingest pipeline CLI — Excel файлыг унших, таних, шалгах, тайлагнах.

Web upload (`/upload` хуудас) болон энэ CLI хоёр ЯГ ИЖИЛ тохиргоог
(`src/config/dataset-signatures.json`, `src/config/validation-rules.json`)
ашигладаг тул үр дүн зөрөхгүй.

Ажиллуулах:
    set PYTHONIOENCODING=utf-8
    python python/run_ingest.py "C:/Users/fm2.tp/Downloads/Data AI.xlsx"
    python python/run_ingest.py "<file>" --json report.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from ingest.pipeline import run  # noqa: E402


def fmt(n: int) -> str:
    return f"{n:,}"


def main() -> int:
    ap = argparse.ArgumentParser(description="Excel ingest — detect / validate / report")
    ap.add_argument("excel", help="Эх Excel файлын зам (.xlsx / .xls)")
    ap.add_argument("--json", dest="json_out", help="Тайланг JSON болгож хадгалах зам")
    ap.add_argument("--max-issues", type=int, default=200, help="Хэвлэх алдааны дээд тоо")
    args = ap.parse_args()

    path = Path(args.excel)
    if not path.exists():
        print(f"Файл олдсонгүй: {path}")
        return 1

    report = run(path, max_issue_rows=args.max_issues)

    f = report["file"]
    print("=" * 74)
    print("FILE")
    print(f"  Нэр        : {f['name']}")
    print(f"  Хэмжээ     : {fmt(f['sizeBytes'])} bytes ({f['sizeBytes'] / 1024 / 1024:.2f} MB)")
    print(f"  Sheet тоо  : {f['sheetCount']}")
    print(f"  Мөр тоо    : {fmt(f['totalRows'])}")

    print("\n" + "=" * 74)
    print("SHEET DETECTION")
    for s in report["sheets"]:
        print(
            f"  [{s['index']}] {s['name']:<12} → {s['datasetType']:<9} "
            f"conf={s['confidence']:.2f}  rows={fmt(s['rowCount'])}  cols={s['columnCount']}"
        )
        print(f"       {s['reason']}")
        if s["unmappedColumns"]:
            print(f"       ⚠ mapping-гүй багана: {s['unmappedColumns']}")

    m = report["masters"]
    print("\n" + "=" * 74)
    print("MASTER DATA")
    print(f"  Бүтээгдэхүүн : {fmt(m['products'])}  (master sheet: {m['productSourceSheet']})")
    print(f"  Байршил      : {fmt(m['locations'])}  (master sheet: {m['locationSourceSheet']})")
    print(f"  Суваг        : {fmt(m['channels'])}  (шалгалт алгасав: {m['channelCheckSkipped']})")

    q = report["quality"]
    print("\n" + "=" * 74)
    print("DATA QUALITY")
    print(f"  VALID   : {fmt(q['valid'])}")
    print(f"  WARNING : {fmt(q['warning'])}")
    print(f"  ERROR   : {fmt(q['error'])}")
    print(f"  TOTAL   : {fmt(q['total'])}")

    print("\n  Дүрэм тус бүрээр:")
    if not report["issueSummary"]:
        print("    (ямар ч асуудал илрээгүй)")
    for item in report["issueSummary"]:
        mark = "✗" if item["severity"] == "ERROR" else "⚠"
        print(f"    {mark} {item['severity']:<8} {item['code']:<28} {fmt(item['count'])}")

    print("\n  Insert хийгдэх мөр (ERROR-гүй):")
    for s in report["sheets"]:
        if s["datasetType"] in ("SALES", "PURCHASE", "STOCK"):
            print(f"    {s['name']:<12} {fmt(s['insertableRows'])} / {fmt(s['rowCount'])}")

    print(f"\n  Хугацааны хамрах хүрээ: {len(report['periodsAvailable'])} сар")
    if report["periodsAvailable"]:
        print(f"    {report['periodsAvailable'][0]} … {report['periodsAvailable'][-1]}")

    if args.json_out:
        out = Path(args.json_out)
        out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nJSON тайлан хадгалав: {out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
