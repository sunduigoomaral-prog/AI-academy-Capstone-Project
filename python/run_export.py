"""
§25 EXCEL EXPORT CLI — 17 sheet бүхий workbook үүсгэнэ.

    set PYTHONIOENCODING=utf-8
    python python/run_export.py "C:/Users/fm2.tp/Downloads/Data AI.xlsx" -o out.xlsx
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from export.collect import collect  # noqa: E402
from export.excel_export import build_workbook  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description="Excel export (17 sheet)")
    ap.add_argument("excel")
    ap.add_argument("-o", "--out", default="data/exports/inventory-report.xlsx")
    ap.add_argument("--scope", choices=["ALL", "WAREHOUSE", "PHARMACY"], default="ALL")
    args = ap.parse_args()

    src = Path(args.excel)
    if not src.exists():
        print(f"Файл олдсонгүй: {src}")
        return 1

    print("Өгөгдөл цуглуулж байна…")
    data = collect(src, args.scope)
    print("Workbook үүсгэж байна…")
    out = build_workbook(data, Path(args.out))
    size = out.stat().st_size
    print(f"\nҮүсгэв: {out}  ({size:,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
