"""
Inventory optimization — CLI verification.

Web application-ийн `/api/analysis/inventory/run` endpoint-той ИЖИЛ engine,
ИЖИЛ тохиргоо (`src/config/inventory-status-rules.json`,
`src/config/analysis-defaults.json`) ашиглана.

Ажиллуулах:
    set PYTHONIOENCODING=utf-8
    python python/run_inventory.py "C:/Users/fm2.tp/Downloads/Data AI.xlsx"
    python python/run_inventory.py "<file>" --sku 0100248
    python python/run_inventory.py "<file>" --decision NEW_PURCHASE --top 20
    python python/run_inventory.py "<file>" --json out.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from analysis.config import Settings, lookback_periods  # noqa: E402
from inventory.aggregate import build_positions  # noqa: E402
from inventory.engine import StatusParams, optimize  # noqa: E402

# Phase 1-ийн бодлогын матриц — CLI горимд DB байхгүй тул seed-ээс уншина
POLICY_PATH = Path(__file__).resolve().parents[1] / "src" / "config" / "analysis-defaults.json"


def load_policy():
    with POLICY_PATH.open(encoding="utf-8") as fh:
        rows = json.load(fh)["inventoryPolicy"]
    table = {(r["locationType"], r["abcClass"], r["xyzClass"]): r["targetDays"] for r in rows}

    def resolve(location_type: str, abc: str, xyz: str) -> int:
        """«Эм ханган нийлүүлэх төв БОЛОН БУСАД» — PHARMACY биш төрөл WAREHOUSE-ийг өвлөнө."""
        hit = table.get((location_type, abc, xyz))
        if hit is not None:
            return hit
        if location_type != "PHARMACY":
            hit = table.get(("WAREHOUSE", abc, xyz))
            if hit is not None:
                return hit
        raise KeyError(f"InventoryPolicy олдсонгүй: {location_type}/{abc}{xyz}")

    return resolve


def num(value: float) -> str:
    return f"{value:,.0f}"


def main() -> int:
    ap = argparse.ArgumentParser(description="Inventory optimization engine")
    ap.add_argument("excel")
    ap.add_argument("--calculation-month")
    ap.add_argument("--lookback", type=int)
    ap.add_argument("--scope", choices=["ALL", "WAREHOUSE", "PHARMACY"])
    ap.add_argument("--top", type=int, default=15)
    ap.add_argument("--sku", action="append", default=[])
    ap.add_argument("--decision", help="Тодорхой шийдвэрээр шүүх")
    ap.add_argument("--no-cross-company", action="store_true",
                    help="Өөр ХХК хооронд шилжүүлэхийг хориглох")
    ap.add_argument("--json", dest="json_out")
    args = ap.parse_args()

    path = Path(args.excel)
    if not path.exists():
        print(f"Файл олдсонгүй: {path}")
        return 1

    settings = Settings(args.calculation_month, args.lookback, args.scope)
    periods = lookback_periods(settings.calculation_month, settings.lookback_months)
    params = StatusParams.defaults()
    resolve_target = load_policy()

    print("=" * 80)
    print("SETTINGS")
    print(f"  Calculation month  : {settings.calculation_month}  (дундажид ОРОХГҮЙ)")
    print(f"  Lookback           : {settings.lookback_months} сар → {periods[0]} … {periods[-1]}")
    print(f"  Days per month     : {params.days_per_month:g}")
    print(f"  Нөөц дуусах хязгаар : {params.stockout_days_threshold:g} хоног")
    print(f"  Хэт их коэффициент  : {params.overstock_factor:g}×")
    print(f"  Cross-company шилжүүлэг: {'ХОРИГЛОСОН' if args.no_cross_company else 'зөвшөөрсөн'}")

    positions, meta = build_positions(
        path, periods, settings.calculation_month,
        settings.abc_a, settings.abc_b, settings.xyz_x, settings.xyz_y, settings.scope,
    )

    result = optimize(positions, resolve_target, params,
                      allow_cross_company=not args.no_cross_company)
    s = result.summary

    print("\n" + "=" * 80)
    print("SCOPE")
    print(f"  Байрлал (SKU × байршил) : {s['positions']:,}")
    print(f"  SKU                     : {s['skus']:,}")
    print(f"  Байршил                 : {s['locations']}")
    if meta["skipped_unclassified"]:
        print(f"  ⚠ ABC-XYZ ангилалгүй тул алгассан: {meta['skipped_unclassified']}")

    print("\n" + "=" * 80)
    print("INVENTORY STATUS")
    labels = {r.stock_status: r.stock_status_label for r in result.rows}
    for code, count in sorted(s["byStatus"].items(), key=lambda kv: -kv[1]):
        print(f"  {labels.get(code, code):<24} {code:<16} {count:>6,}")

    print("\nDECISION")
    dec_labels = {r.decision: r.decision_label for r in result.rows}
    for code, count in sorted(s["byDecision"].items(), key=lambda kv: -kv[1]):
        print(f"  {dec_labels.get(code, code):<24} {code:<16} {count:>6,}")

    print("\n" + "=" * 80)
    print("НЭГТГЭЛ")
    print(f"  Нийт дутагдал (ширхэг) : {num(s['totalShortage'])}")
    print(f"  Нийт илүүдэл (ширхэг)  : {num(s['totalExcess'])}")
    print(f"  Шилжүүлгийн санал      : {len(result.transfers):,} мөр, {num(s['totalTransferQty'])} ширхэг")
    print(f"  Худалдан авалтын санал : {num(s['totalPurchaseQty'])} ширхэг")

    shortage_value = sum(r.shortage_value or 0 for r in result.rows)
    excess_value = sum(r.excess_value or 0 for r in result.rows)
    print(f"  Дутагдлын мөнгөн дүн   : {num(shortage_value)}")
    print(f"  Илүүдлийн мөнгөн дүн   : {num(excess_value)}")

    rows = result.rows
    if args.decision:
        rows = [r for r in rows if r.decision == args.decision]

    if args.top > 0:
        print("\n" + "=" * 80)
        title = f"TOP {args.top}" + (f" ({args.decision})" if args.decision else " (дутагдлын дүнгээр)")
        print(title)
        ordered = sorted(rows, key=lambda r: -(r.shortage_value or 0))[: args.top]
        print(f"  {'Код':<10} {'Байршил':>8} {'Хос':>4} {'Дундаж':>9} {'Үлдэгдэл':>10} "
              f"{'Хоног':>7} {'Зорилт':>7} {'Дутагдал':>9} {'Шилж.':>6} {'Худ.авалт':>10} {'Шийдвэр':<14}")
        for r in ordered:
            print(
                f"  {r.position.product_code:<10} {r.position.location_code:>8} "
                f"{r.position.abc_xyz:>4} {r.position.average_monthly_sales:>9.1f} "
                f"{r.balance.current_stock:>10.1f} {r.balance.current_stock_days:>7.1f} "
                f"{r.balance.target_days:>7.0f} {r.balance.shortage:>9.1f} "
                f"{r.transfer_in_qty:>6} {r.new_purchase_qty:>10} {r.decision:<14}"
            )

    if result.transfers:
        print("\n" + "=" * 80)
        print(f"ШИЛЖҮҮЛГИЙН САНАЛ (эхний 10 / нийт {len(result.transfers):,})")
        for t in sorted(result.transfers, key=lambda t: -t.quantity)[:10]:
            print(f"  {t.product_code:<10} {t.from_location_code} → {t.to_location_code}  "
                  f"{t.quantity:>7,} ширхэг")

    for code in args.sku:
        code = code.strip().upper()
        print("\n" + "=" * 80)
        print(f"SKU ДЭЛГЭРЭНГҮЙ — {code}")
        sku_rows = [r for r in result.rows if r.position.product_code == code]
        if not sku_rows:
            print("  олдсонгүй")
            continue
        for r in sorted(sku_rows, key=lambda r: r.position.location_code):
            p, b = r.position, r.balance
            print(f"\n  ── {p.location_code} ({p.location_type}) · {p.abc_xyz}")
            print(f"     Дундаж сарын борлуулалт = {p.average_monthly_sales:,.4f}")
            print(f"     Target days = {b.target_days:g}  →  Target months = {b.target_months:.4f}")
            print(f"     Recommended = {p.average_monthly_sales:,.4f} × {b.target_months:.4f} "
                  f"= {b.recommended_stock:,.2f}")
            print(f"     Current stock = {b.current_stock:,.2f}")
            if p.average_monthly_sales:
                print(f"     Stock days = {b.current_stock:,.2f} / {p.average_monthly_sales:,.4f} × "
                      f"{params.days_per_month:g} = {b.current_stock_days:,.2f}")
            else:
                print("     Stock days = 0  (дундаж борлуулалт = 0)")
            print(f"     Shortage = {b.shortage:,.2f}   Excess = {b.excess:,.2f}")
            print(f"     Төлөв = {r.stock_status} ({r.stock_status_label})")
            print(f"     Transfer in = {r.transfer_in_qty}   out = {r.transfer_out_qty}   "
                  f"New purchase = {r.new_purchase_qty}")
            print(f"     ⭐ Шийдвэр = {r.decision} ({r.decision_label})")

    if args.json_out:
        payload = {
            "settings": {
                "calculationMonth": settings.calculation_month,
                "periodsUsed": periods,
                "scope": settings.scope,
                "daysPerMonth": params.days_per_month,
                "stockoutDaysThreshold": params.stockout_days_threshold,
                "overstockFactor": params.overstock_factor,
                "allowCrossCompany": not args.no_cross_company,
            },
            "summary": s,
            "transfers": [t.__dict__ for t in result.transfers],
            "rows": [
                {
                    "productCode": r.position.product_code,
                    "productName": r.position.product_name,
                    "locationCode": r.position.location_code,
                    "locationType": r.position.location_type,
                    "channelCode": r.position.channel_code,
                    "abcXyz": r.position.abc_xyz,
                    "averageMonthlySales": r.position.average_monthly_sales,
                    "targetDays": r.balance.target_days,
                    "targetMonths": r.balance.target_months,
                    "recommendedStock": r.balance.recommended_stock,
                    "currentStock": r.balance.current_stock,
                    "currentStockDays": r.balance.current_stock_days,
                    "shortage": r.balance.shortage,
                    "excess": r.balance.excess,
                    "stockStatus": r.stock_status,
                    "transferInQty": r.transfer_in_qty,
                    "newPurchaseQty": r.new_purchase_qty,
                    "decision": r.decision,
                }
                for r in result.rows
            ],
        }
        Path(args.json_out).write_text(json.dumps(payload, ensure_ascii=False, indent=2),
                                       encoding="utf-8")
        print(f"\nJSON хадгалав: {args.json_out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
