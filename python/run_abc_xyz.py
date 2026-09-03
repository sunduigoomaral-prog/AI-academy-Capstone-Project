"""
ABC-XYZ тооцоолол — CLI verification.

Web application-ийн `/api/analysis/abc-xyz/run` endpoint-той ИЖИЛ engine,
ИЖИЛ тохиргоо (`src/config/analysis-defaults.json`) ашиглана.

Ажиллуулах:
    set PYTHONIOENCODING=utf-8
    python python/run_abc_xyz.py "C:/Users/fm2.tp/Downloads/Data AI.xlsx"
    python python/run_abc_xyz.py "<file>" --sku 0100139 --sku 0111442
    python python/run_abc_xyz.py "<file>" --scope WAREHOUSE --top 20
    python python/run_abc_xyz.py "<file>" --json out.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from analysis.aggregate import aggregate_from_excel  # noqa: E402
from analysis.config import Settings, lookback_periods  # noqa: E402
from analysis.engine import build_matrix, run_abc_xyz  # noqa: E402


def money(value: float) -> str:
    return f"{value:,.0f}"


def pct(value: float) -> str:
    return f"{value * 100:.2f}%"


def main() -> int:
    ap = argparse.ArgumentParser(description="ABC-XYZ analysis engine")
    ap.add_argument("excel", help="Эх Excel файлын зам")
    ap.add_argument("--calculation-month", help="YYYY-MM (default: тохиргооноос)")
    ap.add_argument("--lookback", type=int, help="Бүтэн сарын тоо (default: тохиргооноос)")
    ap.add_argument("--scope", choices=["ALL", "WAREHOUSE", "PHARMACY"])
    ap.add_argument("--top", type=int, default=15, help="Хэдэн SKU хэвлэх")
    ap.add_argument("--sku", action="append", default=[], help="Тодорхой SKU-г дэлгэрэнгүй харах")
    ap.add_argument("--json", dest="json_out", help="Үр дүнг JSON болгож хадгалах")
    args = ap.parse_args()

    path = Path(args.excel)
    if not path.exists():
        print(f"Файл олдсонгүй: {path}")
        return 1

    settings = Settings(args.calculation_month, args.lookback, args.scope)
    periods = lookback_periods(settings.calculation_month, settings.lookback_months)

    print("=" * 78)
    print("CALCULATION SETTINGS")
    print(f"  Calculation month : {settings.calculation_month}  (дундажид ОРОХГҮЙ)")
    print(f"  Сүүлийн бүтэн сар : {periods[-1]}")
    print(f"  Lookback          : {settings.lookback_months} сар → {', '.join(periods)}")
    print(f"  ABC basis         : {settings.abc_basis}  (МӨНГӨН дүн, тоо хэмжээ БИШ)")
    print(f"  Sales scope       : {settings.scope}")
    print(f"  ABC threshold     : A <= {settings.abc_a}, B <= {settings.abc_b}")
    print(f"  XYZ threshold     : X <= {settings.xyz_x}, Y <= {settings.xyz_y}")

    aggregates, meta = aggregate_from_excel(
        path, periods, settings.calculation_month, settings.scope
    )

    rows = run_abc_xyz(
        aggregates,
        settings.abc_a,
        settings.abc_b,
        settings.xyz_x,
        settings.xyz_y,
        expected_months=len(periods),
    )

    total_value = sum(r.sales_value for r in rows)

    print("\n" + "=" * 78)
    print("SKU UNIVERSE")
    print(f"  Нийт SKU                : {meta['universe']}")
    print(f"  Борлуулалттай           : {meta['skus_with_sales']}")
    print(f"  Зөвхөн үлдэгдэлтэй      : {meta['skus_stock_only']}  (→ Хөдөлгөөнгүй нэр дэвшигч)")
    print(f"  Ашигласан борлуулалтын мөр: {meta['rows_used']:,}")
    print(f"  Нийт борлуулалтын дүн   : {money(total_value)}")

    print("\n" + "=" * 78)
    print("ABC-XYZ MATRIX  (⭐ ҮНДСЭН АНГИЛАЛ)")
    matrix = build_matrix(rows)
    by_class = {cell["abcXyz"]: cell for cell in matrix}
    print(f"  {'':<4} {'X':>22} {'Y':>22} {'Z':>22}")
    for abc in "ABC":
        cells = []
        for xyz in "XYZ":
            cell = by_class[f"{abc}{xyz}"]
            cells.append(f"{cell['skuCount']:>4} SKU {pct(cell['salesShare']):>8}")
        print(f"  {abc:<4} {cells[0]:>22} {cells[1]:>22} {cells[2]:>22}")

    print(f"\n  {'Ангилал':<8} {'SKU':>6} {'Борлуулалтын дүн':>20} {'Эзлэх %':>10}")
    for cell in matrix:
        print(
            f"  {cell['abcXyz']:<8} {cell['skuCount']:>6} "
            f"{money(cell['salesValue']):>20} {pct(cell['salesShare']):>10}"
        )

    no_move = [r for r in rows if r.inventory_status == "NO_MOVEMENT"]
    print(f"\n  Хөдөлгөөнгүй (NO_MOVEMENT): {len(no_move)} SKU")

    print("\n" + "=" * 78)
    print(f"TOP {args.top} SKU (мөнгөн дүнгээр)")
    header = (
        f"  {'#':>3} {'Код':<10} {'ABC':>3} {'XYZ':>3} {'Хос':>4} "
        f"{'Дүн':>16} {'Эзлэх':>7} {'Хурим.':>8} {'Дундаж':>9} {'StdDev':>9} {'CV':>7}"
    )
    print(header)
    for row in rows[: args.top]:
        cv_text = "—" if row.cv is None else f"{row.cv:.4f}"
        print(
            f"  {row.rank:>3} {row.product_code:<10} {row.abc:>3} {row.xyz:>3} {row.abc_xyz:>4} "
            f"{money(row.sales_value):>16} {pct(row.sales_share):>7} {pct(row.cumulative_share):>8} "
            f"{row.average_monthly_qty:>9.2f} {row.std_dev:>9.2f} {cv_text:>7}"
        )

    if args.sku:
        print("\n" + "=" * 78)
        print("SKU ДЭЛГЭРЭНГҮЙ ШАЛГАЛТ")
        by_code = {r.product_code: r for r in rows}
        for code in args.sku:
            row = by_code.get(code.strip().upper())
            if row is None:
                print(f"\n  {code}: олдсонгүй")
                continue
            print(f"\n  ── {row.product_code} · {row.product_name or '(нэргүй)'}")
            print(f"     Сарын тоо хэмжээ ({', '.join(periods)}):")
            print(f"       {[round(q, 2) for q in row.monthly_qty]}")
            print(f"     Нийлбэр            = {sum(row.monthly_qty):,.2f}")
            print(
                f"     Дундаж             = {sum(row.monthly_qty):,.2f} / {len(periods)} "
                f"= {row.average_monthly_qty:,.4f}"
            )
            print(f"     StdDev (STDEV.P)   = {row.std_dev:,.4f}")
            if row.cv is None:
                print("     CV                 = тодорхойлогдохгүй (дундаж = 0)")
            else:
                print(
                    f"     CV                 = {row.std_dev:,.4f} / {abs(row.average_monthly_qty):,.4f} "
                    f"= {row.cv:.6f}"
                )
            print(f"     Борлуулалтын дүн   = {money(row.sales_value)}  (эзлэх {pct(row.sales_share)})")
            print(f"     Хуримтлагдсан      = {pct(row.cumulative_share)}  (эрэмбэ {row.rank})")
            print(f"     ABC                = {row.abc}   XYZ = {row.xyz}")
            print(f"     ⭐ abc_xyz         = {row.abc_xyz}")
            print(f"     Inventory status   = {row.inventory_status}")

    if args.json_out:
        payload = {
            "settings": {
                "calculationMonth": settings.calculation_month,
                "lookbackMonths": settings.lookback_months,
                "periodsUsed": periods,
                "scope": settings.scope,
                "abcBasis": settings.abc_basis,
                "thresholds": {
                    "abcA": settings.abc_a,
                    "abcB": settings.abc_b,
                    "xyzX": settings.xyz_x,
                    "xyzY": settings.xyz_y,
                },
            },
            "meta": meta,
            "totalSalesValue": total_value,
            "matrix": matrix,
            "rows": [
                {
                    "product_code": r.product_code,
                    "product_name": r.product_name,
                    "abc": r.abc,
                    "xyz": r.xyz,
                    "abc_xyz": r.abc_xyz,
                    "sales_value": r.sales_value,
                    "sales_share": r.sales_share,
                    "cumulative_share": r.cumulative_share,
                    "monthly_qty": r.monthly_qty,
                    "average_monthly_qty": r.average_monthly_qty,
                    "std_dev": r.std_dev,
                    "cv": r.cv,
                    "inventory_status": r.inventory_status,
                    "months_with_sales": r.months_with_sales,
                    "rank": r.rank,
                }
                for r in rows
            ],
        }
        Path(args.json_out).write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"\nJSON хадгалав: {args.json_out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
