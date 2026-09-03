"""
Phase 5 CLI — үнийн хяналт + маржины эрсдэл + AI шийдвэрийн engine.

Web application-ийн `/api/analysis/price-control` болон
`/api/analysis/ai-recommendations`-тай ИЖИЛ engine, ИЖИЛ тохиргоо.

Ажиллуулах:
    set PYTHONIOENCODING=utf-8
    python python/run_price_control.py "C:/Users/fm2.tp/Downloads/Data AI.xlsx"
    python python/run_price_control.py "<file>" --sku 0101005
    python python/run_price_control.py "<file>" --dimension LOCATION
    python python/run_price_control.py "<file>" --json out.json
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
from pricing.aggregate import build_monthly_sales_by_sku, build_purchase_lines  # noqa: E402
from pricing.engine import (  # noqa: E402
    PRIORITY_ORDER,
    REVENUE_MISSING_REASON,
    assess_margin_risk,
    build_benchmark,
    compute_margin,
    compute_sales_trend,
    load_rules,
    recommend,
)

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


def num(value) -> str:
    if value is None:
        return "—"
    return f"{value:,.0f}"


def main() -> int:
    ap = argparse.ArgumentParser(description="Purchase price control + AI decision engine")
    ap.add_argument("excel")
    ap.add_argument("--calculation-month")
    ap.add_argument("--lookback", type=int)
    ap.add_argument("--dimension", choices=["SUPPLIER", "LOCATION", "CHANNEL"])
    ap.add_argument("--top", type=int, default=10)
    ap.add_argument("--sku", action="append", default=[])
    ap.add_argument("--json", dest="json_out")
    args = ap.parse_args()

    path = Path(args.excel)
    if not path.exists():
        print(f"Файл олдсонгүй: {path}")
        return 1

    rules = load_rules()
    dimension = args.dimension or rules["priceDimension"]
    settings = Settings(args.calculation_month, args.lookback, None)
    periods = lookback_periods(settings.calculation_month, settings.lookback_months)

    print("=" * 84)
    print("SETTINGS")
    print(f"  Calculation month : {settings.calculation_month}  (худалдан авалт ОРОХГҮЙ)")
    print(f"  Сүүлийн бүтэн сар : {periods[-1]}")
    print(f"  Цонх              : {periods[0]} … {periods[-1]}")
    print(f"  Үнэ харьцуулах хэмжээст : {dimension}")
    if dimension == "SUPPLIER":
        print("      ⚠️ Шаардлагад 'channel' гэсэн ч эх өгөгдөлд суваг байхгүй.")
        print("         Бодит үнийн зөрүү нийлүүлэгчээр үүсдэг (docs/08 §A).")

    # ── §1–§6 Үнийн benchmark ──
    lines_by_product, name_by_product, meta = build_purchase_lines(path, periods, dimension)
    benchmarks = [
        build_benchmark(code, name_by_product.get(code), lines, dimension)
        for code, lines in lines_by_product.items()
    ]
    benchmarks.sort(key=lambda b: -(b.potential_saving or 0))

    usable = [b for b in benchmarks if b.min_unit_price is not None]
    multi = [b for b in usable if b.source_count > 1]
    excluded = [b for b in benchmarks if b.excluded_reason is not None]

    print("\n" + "=" * 84)
    print("PURCHASE PRICE BENCHMARK")
    print(f"  Ашигласан худалдан авалтын мөр : {meta['rows_used']:,}")
    print(f"  Цонхны гадна үлдсэн мөр        : {meta['rows_outside_window']:,}")
    if meta["rows_missing_dimension"]:
        print(f"  ⚠ Хэмжээстийн утгагүй мөр      : {meta['rows_missing_dimension']:,}")
    print(f"  Benchmark хийсэн SKU           : {len(usable):,}")
    print(f"  1-ээс олон эх сурвалжтай SKU   : {len(multi):,}")
    if excluded:
        print(f"  ⚠ Benchmark боломжгүй SKU      : {len(excluded):,} (тэг үнэ / зөвхөн буцаалт)")

    total_saving = sum(b.potential_saving or 0 for b in usable)
    print(f"\n  §6 Нийт боломжит хэмнэлт       : {num(total_saving)} ₮")

    sev_counts: dict[str, int] = {}
    for b in usable:
        if b.gap_severity:
            sev_counts[b.gap_severity] = sev_counts.get(b.gap_severity, 0) + 1
    print("  §5 Үнийн зөрүүний зэрэглэл     :", sev_counts or "зөрүүгүй")

    inc_counts: dict[str, int] = {}
    for b in usable:
        if b.price_increase_severity:
            inc_counts[b.price_increase_severity] = inc_counts.get(b.price_increase_severity, 0) + 1
    print("  §8 Өртөг өсөлтийн зэрэглэл     :", inc_counts or "өсөлтгүй")

    if args.top > 0 and multi:
        print("\n" + "-" * 84)
        print(f"ТОП {args.top} — ҮНИЙН ЗӨРҮҮ (боломжит хэмнэлтээр)")
        print(f"  {'Код':<10} {'Эх с.':>5} {'Хамгийн бага':>14} {'Хамгийн их':>14} "
              f"{'Зөрүү %':>9} {'Зэрэг':>9} {'Хэмнэлт':>14}")
        for b in [x for x in benchmarks if x.source_count > 1][: args.top]:
            print(f"  {b.product_code:<10} {b.source_count:>5} "
                  f"{b.min_unit_price:>14,.1f} {b.max_unit_price:>14,.1f} "
                  f"{(b.price_gap_pct or 0):>8.1f}% {str(b.gap_severity or '—'):>9} "
                  f"{num(b.potential_saving):>14}")

    rising = sorted([b for b in usable if (b.price_change_pct or 0) > 0],
                    key=lambda b: -(b.price_change_pct or 0))
    if rising:
        print("\n" + "-" * 84)
        print(f"ТОП {min(args.top, len(rising))} — ӨРТӨГ ӨСӨЛТ")
        print(f"  {'Код':<10} {'Эхний сар':>10} {'Сүүлийн сар':>12} {'Эхний үнэ':>13} "
              f"{'Сүүлийн үнэ':>13} {'Өөрчлөлт':>10} {'Зэрэг':>9}")
        for b in rising[: args.top]:
            print(f"  {b.product_code:<10} {b.first_period:>10} {b.last_period:>12} "
                  f"{b.first_unit_price:>13,.1f} {b.last_unit_price:>13,.1f} "
                  f"{b.price_change_pct:>9.1f}% {str(b.price_increase_severity or '—'):>9}")

    # ── §7 Маржин ──
    print("\n" + "=" * 84)
    print("§7 GROSS PROFIT / MARGIN")
    profit, margin, reason = compute_margin(None, 1.0)
    print(f"  Gross Profit  : {profit}")
    print(f"  Gross Margin  : {margin}")
    print(f"  ⚠️ Шалтгаан    : {reason}")

    # ── §9 AI engine (Phase 4-ийн үр дүн дээр) ──
    params = StatusParams.defaults()
    policy = load_policy()
    positions, pos_meta = build_positions(
        path, periods, settings.calculation_month,
        settings.abc_a, settings.abc_b, settings.xyz_x, settings.xyz_y, "ALL",
    )
    inv = optimize(positions, policy, params)

    monthly_by_sku = build_monthly_sales_by_sku(path, periods)
    bench_by_sku = {b.product_code: b for b in benchmarks}

    # Тухайн SKU-д өөр байршилд илүүдэл байгаа эсэх
    surplus_by_sku: dict[str, float] = {}
    for r in inv.rows:
        if r.balance.excess > 0:
            surplus_by_sku[r.position.product_code] = (
                surplus_by_sku.get(r.position.product_code, 0.0) + r.balance.excess
            )

    recs = []
    for r in inv.rows:
        code = r.position.product_code
        b = bench_by_sku.get(code)
        trend, trend_pct, _, _ = compute_sales_trend(monthly_by_sku.get(code, [0.0] * len(periods)))
        at_risk, risk_reasons, _ = assess_margin_risk(
            b.price_gap_pct if b else None,
            b.price_change_pct if b else None,
            b.potential_saving if b else None,
        )
        ctx = {
            "abc": r.position.abc,
            "xyz": r.position.xyz,
            "stock_status": r.stock_status,
            "decision": r.decision,
            "location_code": r.position.location_code,
            "current_stock": r.balance.current_stock,
            "current_stock_days": r.balance.current_stock_days,
            "target_days": r.balance.target_days,
            "shortage": r.balance.shortage,
            "excess": r.balance.excess,
            "shortage_value": r.shortage_value,
            "excess_value": r.excess_value,
            "transfer_in_qty": r.transfer_in_qty,
            "new_purchase_qty": r.new_purchase_qty,
            "transfer_available": surplus_by_sku.get(code, 0.0) > 0,
            "price_gap_pct": b.price_gap_pct if b else None,
            "price_change_pct": b.price_change_pct if b else None,
            "min_unit_price": b.min_unit_price if b else None,
            "max_unit_price": b.max_unit_price if b else None,
            "min_source_key": b.min_source_key if b else None,
            "potential_saving": b.potential_saving if b else None,
            "margin_unavailable_reason": REVENUE_MISSING_REASON,
            "sales_trend": trend,
            "sales_trend_pct": trend_pct,
        }
        rec = recommend(ctx)
        rec.update(
            product_code=code,
            product_name=r.position.product_name,
            location_code=r.position.location_code,
            abc_xyz=r.position.abc_xyz,
            shortage_value=r.shortage_value,
            excess_value=r.excess_value,
            potential_saving=(b.potential_saving if b else None),
            margin_at_risk=at_risk,
            margin_risk_reasons=risk_reasons,
            sales_trend=trend,
            sales_trend_pct=trend_pct,
        )
        recs.append(rec)

    print("\n" + "=" * 84)
    print("§9 AI DECISION ENGINE")
    print(f"  Зөвлөмж үүссэн байрлал : {len(recs):,}")
    by_priority: dict[str, int] = {}
    by_risk: dict[str, int] = {}
    for rec in recs:
        by_priority[rec["priority"]] = by_priority.get(rec["priority"], 0) + 1
        by_risk[rec["risk"]] = by_risk.get(rec["risk"], 0) + 1
    print("\n  Priority:")
    for k in sorted(by_priority, key=lambda x: PRIORITY_ORDER[x]):
        print(f"    {k:<10} {by_priority[k]:>6,}")
    print("\n  Risk ангилал:")
    for k, v in sorted(by_risk.items(), key=lambda kv: -kv[1]):
        print(f"    {k:<24} {v:>6,}")

    margin_risk = [r for r in recs if r["margin_at_risk"]]
    print(f"\n  §8 MARGIN RISK flag-тай байрлал: {len(margin_risk):,} "
          f"({len({r['product_code'] for r in margin_risk})} SKU)")

    # ── §12 Менежерийн хураангуй ──
    top_n = rules["managementSummary"]["topN"]
    print("\n" + "=" * 84)
    print(f"§12 AI MANAGEMENT SUMMARY (TOP {top_n})")

    def show(title: str, rows: list, value_fn, unit: str = "") -> None:
        print(f"\n  ── {title}")
        if not rows:
            print("     (байхгүй)")
            return
        for i, rec in enumerate(rows[:top_n], 1):
            v = value_fn(rec)
            print(f"     {i}. {rec['product_code']:<10} {rec.get('location_code',''):>8} "
                  f"{rec['abc_xyz']:>4}  {rec['priority']:<8} {num(v):>14}{unit}")
            print(f"        WHY    : {rec['reason']}")
            print(f"        IMPACT : {rec['impact']}")
            print(f"        ACTION : {rec['recommended_action']}")

    ranked = sorted(recs, key=lambda r: (PRIORITY_ORDER[r["priority"]],
                                         -((r["shortage_value"] or 0) + (r["excess_value"] or 0))))
    show("TOP RISKS", ranked, lambda r: (r["shortage_value"] or 0) + (r["excess_value"] or 0), " ₮")
    show("TOP PURCHASE ACTIONS",
         sorted([r for r in recs if r["purchase_required"]], key=lambda r: -(r["shortage_value"] or 0)),
         lambda r: r["recommended_quantity"], " ш")
    show("TOP TRANSFER ACTIONS",
         sorted([r for r in recs if r["transfer_possible"] and r["recommended_quantity"] > 0],
                key=lambda r: -r["recommended_quantity"]),
         lambda r: r["recommended_quantity"], " ш")
    show("TOP STOP PURCHASE",
         sorted([r for r in recs if r["stop_purchase"]], key=lambda r: -(r["excess_value"] or 0)),
         lambda r: r["excess_value"], " ₮")
    # ⚠️ Үнийн эрсдэл нь SKU түвшний — байршил бүрээр давхардуулахгүй.
    #    SKU тус бүрээс хамгийн өндөр priority-тэй нэг мөрийг үлдээнэ.
    price_risk_by_sku: dict[str, dict] = {}
    for r in (x for x in recs if x["margin_at_risk"]):
        best = price_risk_by_sku.get(r["product_code"])
        if best is None or PRIORITY_ORDER[r["priority"]] < PRIORITY_ORDER[best["priority"]]:
            price_risk_by_sku[r["product_code"]] = r
    show("TOP PRICE RISKS",
         sorted(price_risk_by_sku.values(), key=lambda r: -(r["potential_saving"] or 0)),
         lambda r: r["potential_saving"], " ₮")

    # ── SKU дэлгэрэнгүй ──
    for code in args.sku:
        code = code.strip().upper()
        b = bench_by_sku.get(code)
        print("\n" + "=" * 84)
        print(f"SKU ДЭЛГЭРЭНГҮЙ — {code}")
        if b is None or b.min_unit_price is None:
            print("  Benchmark байхгүй" + (f": {b.excluded_reason}" if b else ""))
        else:
            print(f"  Нэр: {b.product_name}")
            print(f"\n  §2 Эх сурвалж тус бүрийн сүүлийн худалдан авалт:")
            print(f"    {'Эх сурвалж':<12} {'Сүүлийн сар':>12} {'Тоо':>10} {'Дүн':>16} "
                  f"{'Нэгж үнэ':>13} {'Хямд#':>6} {'Үнэтэй#':>8}")
            for p in b.points:
                print(f"    {p.dimension_key:<12} {p.last_purchase_period:>12} {p.quantity:>10,.1f} "
                      f"{p.amount:>16,.1f} {p.unit_price:>13,.1f} {p.lowest_rank:>6} {p.highest_rank:>8}")
            print(f"\n  §3 Хамгийн хямд TOP3 : "
                  f"{[(p.dimension_key, round(p.unit_price,1)) for p in b.lowest_top]}")
            print(f"  §4 Хамгийн үнэтэй TOP3: "
                  f"{[(p.dimension_key, round(p.unit_price,1)) for p in b.highest_top]}")
            print(f"\n  §5 Min={b.min_unit_price:,.1f} ({b.min_source_key})  "
                  f"Max={b.max_unit_price:,.1f} ({b.max_source_key})")
            print(f"      Gap = {b.price_gap:,.1f}   Gap% = {b.price_gap_pct:.2f}%   "
                  f"Зэрэг = {b.gap_severity}")
            print(f"\n  §6 Нийт худалдан авалт {b.total_quantity:,.1f} ш, "
                  f"өртөг {b.total_cost:,.1f}")
            print(f"      Хамгийн бага үнээр: {b.total_quantity:,.1f} × {b.min_unit_price:,.1f} = "
                  f"{b.total_quantity * b.min_unit_price:,.1f}")
            print(f"      Боломжит хэмнэлт = {b.potential_saving:,.1f}")
            if b.price_change_pct is not None:
                print(f"\n  §8 Өртөг {b.first_period} → {b.last_period}: "
                      f"{b.first_unit_price:,.1f} → {b.last_unit_price:,.1f} "
                      f"({b.price_change_pct:+.1f}%)")

    if args.json_out:
        payload = {
            "settings": {
                "calculationMonth": settings.calculation_month,
                "periodsUsed": periods,
                "priceDimension": dimension,
            },
            "meta": {**meta, **pos_meta},
            "totalPotentialSaving": total_saving,
            "benchmarks": [
                {
                    "productCode": b.product_code,
                    "productName": b.product_name,
                    "sourceCount": b.source_count,
                    "minUnitPrice": b.min_unit_price,
                    "maxUnitPrice": b.max_unit_price,
                    "minSourceKey": b.min_source_key,
                    "maxSourceKey": b.max_source_key,
                    "priceGap": b.price_gap,
                    "priceGapPct": b.price_gap_pct,
                    "gapSeverity": b.gap_severity,
                    "potentialSaving": b.potential_saving,
                    "priceChangePct": b.price_change_pct,
                    "excludedReason": b.excluded_reason,
                }
                for b in benchmarks
            ],
            "recommendations": recs,
        }
        Path(args.json_out).write_text(json.dumps(payload, ensure_ascii=False, indent=2),
                                       encoding="utf-8")
        print(f"\nJSON хадгалав: {args.json_out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
