"""
§30 — БҮРЭН ГИНЖИН ХЭЛХЭЭНИЙ END-TO-END ШАЛГАЛТ (бодит өгөгдөл дээр).

Excel Upload → Validation → Processing → ABC → XYZ → ABCXYZ →
Average Monthly Sales → Target Days → Target Months → Recommended Stock →
Current Stock → Current Stock Days → Shortage/Excess → Inventory Status →
Transfer Decision → Purchase Decision → Purchase Price Control →
Gross Margin Risk → AI Recommendation

Энэ тест нь ЗӨВХӨН функц дуудахаас гадна ДАВХАРГА ХООРОНДЫН ТОГТВОРТОЙ
БАЙДЛЫГ (invariants) шалгана — өөрөөр хэлбэл нэг давхаргын гаралт нөгөөгийн
оролттой зөрчилдөж байгаа эсэхийг.

Ажиллуулах:
    set PYTHONIOENCODING=utf-8
    python python/tests/test_end_to_end.py "C:/Users/fm2.tp/Downloads/Data AI.xlsx"
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from analysis.aggregate import aggregate_from_excel  # noqa: E402
from analysis.config import Settings, lookback_periods  # noqa: E402
from analysis.engine import build_matrix, run_abc_xyz  # noqa: E402
from ingest.pipeline import run as run_ingest  # noqa: E402
from inventory.aggregate import build_positions  # noqa: E402
from inventory.engine import StatusParams, optimize  # noqa: E402
from pricing.aggregate import build_monthly_sales_by_sku, build_purchase_lines  # noqa: E402
from pricing.engine import (  # noqa: E402
    REVENUE_MISSING_REASON,
    assess_margin_risk,
    build_benchmark,
    compute_margin,
    compute_sales_trend,
    load_rules,
    recommend,
)

import json

failures: list[str] = []
step = 0


def section(title: str) -> None:
    global step
    step += 1
    print(f"\n{'─' * 76}\n{step:2d}. {title}")


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"   {'PASS' if ok else 'FAIL'}  {name}" + (f"   {detail}" if detail and not ok else ""))
    if not ok:
        failures.append(f"{name} :: {detail}")


def close(a: float, b: float, tol: float = 1e-6) -> bool:
    return math.isclose(a, b, rel_tol=tol, abs_tol=tol)


def main(excel: Path) -> int:
    settings = Settings()
    periods = lookback_periods(settings.calculation_month, settings.lookback_months)
    params = StatusParams.defaults()
    policy = {
        (r["locationType"], r["abcClass"], r["xyzClass"]): r["targetDays"]
        for r in json.loads(
            (Path(__file__).resolve().parents[2] / "src/config/analysis-defaults.json")
            .read_text(encoding="utf-8")
        )["inventoryPolicy"]
    }

    print("=" * 76)
    print("§30 END-TO-END ГИНЖИН ХЭЛХЭЭ")
    print(f"   Файл             : {excel.name}")
    print(f"   Calculation month: {settings.calculation_month}")
    print(f"   Lookback         : {periods[0]} … {periods[-1]} ({len(periods)} сар)")

    # ── 1. UPLOAD + VALIDATION ──
    section("EXCEL UPLOAD → VALIDATION → PROCESSING")
    report = run_ingest(excel, max_issue_rows=0)
    q = report["quality"]
    print(f"      VALID {q['valid']:,} · WARNING {q['warning']:,} · ERROR {q['error']:,}")
    check("бүх sheet танигдсан",
          all(s["datasetType"] != "UNKNOWN" for s in report["sheets"]),
          str([s["datasetType"] for s in report["sheets"]]))
    check("мөрийн тоо тэнцэнэ (valid+warning+error = total)",
          q["valid"] + q["warning"] + q["error"] == q["total"])
    check("ERROR мөр байхгүй (бодит өгөгдөл цэвэр)", q["error"] == 0, f"{q['error']}")
    check("insert хийгдэх мөр = нийт − error",
          sum(s["insertableRows"] for s in report["sheets"]
              if s["datasetType"] in ("SALES", "PURCHASE", "STOCK")) == q["total"] - q["error"])

    # ── 2. ABC ──
    section("ABC (SALES VALUE — мөнгөн дүнгээр)")
    aggregates, agg_meta = aggregate_from_excel(excel, periods, settings.calculation_month, "ALL")
    rows = run_abc_xyz(aggregates, settings.abc_a, settings.abc_b,
                       settings.xyz_x, settings.xyz_y, len(periods))
    total_value = sum(r.sales_value for r in rows)
    print(f"      SKU {len(rows):,} · нийт борлуулалтын дүн {total_value:,.0f}")

    check("эрэмбэ мөнгөн дүнгээр буурна",
          all(rows[i].sales_value >= rows[i + 1].sales_value for i in range(len(rows) - 1)))
    check("rank 1..N дараалалтай", [r.rank for r in rows] == list(range(1, len(rows) + 1)))
    check("эзлэх хувийн нийлбэр = 1", close(sum(r.sales_share for r in rows), 1.0, 1e-9),
          f"{sum(r.sales_share for r in rows)}")
    check("хуримтлагдсан хувь монотон өснө",
          all(rows[i].cumulative_share <= rows[i + 1].cumulative_share + 1e-12
              for i in range(len(rows) - 1)))
    check("сүүлийн хуримтлагдсан = 100%", close(rows[-1].cumulative_share, 1.0, 1e-9),
          f"{rows[-1].cumulative_share}")
    check("A ангилал ⇔ cum <= 0.70",
          all((r.abc == "A") == (r.cumulative_share <= settings.abc_a) for r in rows))
    check("C ангилал ⇔ cum > 0.90",
          all((r.abc == "C") == (r.cumulative_share > settings.abc_b) for r in rows))
    abc_counts = {c: sum(1 for r in rows if r.abc == c) for c in "ABC"}
    print(f"      A {abc_counts['A']} · B {abc_counts['B']} · C {abc_counts['C']}")

    # ── 3. XYZ ──
    section("XYZ (SALES QUANTITY — population stdev)")
    for r in rows[:0] or rows:
        pass
    bad_avg = [r for r in rows
               if not close(r.average_monthly_qty, sum(r.monthly_qty) / len(periods), 1e-9)]
    check("дундаж = Σ сарын тоо / БҮТЭН сарын тоо", not bad_avg,
          f"{len(bad_avg)} зөрүүтэй")
    bad_cv = [r for r in rows
              if r.average_monthly_qty != 0
              and not close(r.cv, r.std_dev / abs(r.average_monthly_qty), 1e-9)]
    check("CV = stdDev / |дундаж|", not bad_cv, f"{len(bad_cv)} зөрүүтэй")
    check("дундаж = 0 ⇔ CV = None ба XYZ = Z",
          all((r.average_monthly_qty == 0) == (r.cv is None) for r in rows)
          and all(r.xyz == "Z" for r in rows if r.cv is None))
    check("дундаж = 0 ⇔ NO_MOVEMENT",
          all((r.average_monthly_qty == 0) == (r.inventory_status == "NO_MOVEMENT")
              for r in rows))
    check("monthlyQty урт = lookback сарын тоо",
          all(len(r.monthly_qty) == len(periods) for r in rows))

    # ── 4. ABCXYZ ──
    section("ABC + XYZ = 9 ХОСОЛСОН АНГИЛАЛ")
    check("abc_xyz = abc + xyz", all(r.abc_xyz == r.abc + r.xyz for r in rows))
    matrix = build_matrix(rows)
    check("матриц 9 нүдтэй", len(matrix) == 9)
    check("нүднүүдийн SKU нийлбэр = нийт SKU",
          sum(c["skuCount"] for c in matrix) == len(rows))
    check("нүднүүдийн дүнгийн нийлбэр = нийт дүн",
          close(sum(c["salesValue"] for c in matrix), total_value, 1e-6))

    # ── 5–9. НӨӨЦИЙН БАЛАНС ──
    section("AVG SALES → TARGET → RECOMMENDED → STOCK DAYS → SHORTAGE/EXCESS")
    positions, pos_meta = build_positions(
        excel, periods, settings.calculation_month,
        settings.abc_a, settings.abc_b, settings.xyz_x, settings.xyz_y, "ALL")
    inv = optimize(positions, lambda lt, a, x: policy[(lt, a, x)], params)
    print(f"      Байрлал {len(inv.rows):,} · SKU {inv.summary['skus']} · "
          f"байршил {inv.summary['locations']}")

    bad = []
    for r in inv.rows:
        p, b = r.position, r.balance
        want_target = policy[(p.location_type, p.abc, p.xyz)]
        if b.target_days != want_target:
            bad.append(("target", p.product_code, p.location_code))
        if not close(b.target_months, want_target / params.days_per_month, 1e-9):
            bad.append(("months", p.product_code, p.location_code))
        if not close(b.recommended_stock, p.average_monthly_sales * b.target_months, 1e-6):
            bad.append(("recommended", p.product_code, p.location_code))
        want_days = 0.0 if p.average_monthly_sales == 0 else (
            b.current_stock / p.average_monthly_sales * params.days_per_month)
        if not close(b.current_stock_days, want_days, 1e-6):
            bad.append(("days", p.product_code, p.location_code))
        if not close(b.shortage, max(b.recommended_stock - b.current_stock, 0), 1e-6):
            bad.append(("shortage", p.product_code, p.location_code))
        if not close(b.excess, max(b.current_stock - b.recommended_stock, 0), 1e-6):
            bad.append(("excess", p.product_code, p.location_code))
        if b.shortage > 0 and b.excess > 0:
            bad.append(("both", p.product_code, p.location_code))
    check("бүх балансын томьёо мөр бүрт таарна", not bad, f"{len(bad)} зөрчил: {bad[:3]}")
    check("target days тохиргооны матрицаас ирнэ (18 хослол)",
          len({(r.position.location_type, r.position.abc, r.position.xyz)
               for r in inv.rows}) <= 18)

    # ── 10. INVENTORY STATUS ──
    section("INVENTORY STATUS")
    for code, count in sorted(inv.summary["byStatus"].items(), key=lambda kv: -kv[1]):
        print(f"      {code:<16} {count:>6,}")
    check("төлөвийн нийлбэр = байрлалын тоо",
          sum(inv.summary["byStatus"].values()) == len(inv.rows))
    check("NO_MOVEMENT ⇔ дундаж борлуулалт 0",
          all((r.stock_status == "NO_MOVEMENT") == (r.position.average_monthly_sales == 0)
              for r in inv.rows))
    check("OPTIMAL мөрүүд target..target×1.5 хооронд",
          all(r.balance.target_days <= r.balance.current_stock_days
              <= r.balance.target_days * params.overstock_factor + 1e-9
              for r in inv.rows if r.stock_status == "OPTIMAL"))

    # ── 11. TRANSFER ──
    section("TRANSFER DECISION")
    print(f"      Шилжүүлгийн санал {len(inv.transfers):,} мөр · "
          f"{inv.summary['totalTransferQty']:,} ширхэг")
    excess_by = {(r.position.product_code, r.position.location_code): r.balance.excess
                 for r in inv.rows}
    short_by = {(r.position.product_code, r.position.location_code): r.balance.shortage
                for r in inv.rows}
    out_by: dict[tuple, int] = {}
    in_by: dict[tuple, int] = {}
    for t in inv.transfers:
        out_by[(t.product_code, t.from_location_code)] = \
            out_by.get((t.product_code, t.from_location_code), 0) + t.quantity
        in_by[(t.product_code, t.to_location_code)] = \
            in_by.get((t.product_code, t.to_location_code), 0) + t.quantity

    over_out = [(k, v, excess_by.get(k, 0)) for k, v in out_by.items()
                if v > excess_by.get(k, 0) + 1e-9]
    check("⚠️ эх үүсвэрээс гарсан тоо ИЛҮҮДЛЭЭС ХЭТРЭХГҮЙ (§12)",
          not over_out, f"{len(over_out)} зөрчил: {over_out[:3]}")
    over_in = [(k, v, short_by.get(k, 0)) for k, v in in_by.items()
               if v > math.ceil(short_by.get(k, 0) - 1e-9) + 1e-9]
    check("хүлээн авсан тоо дутагдлаас (CEILING) хэтрэхгүй",
          not over_in, f"{len(over_in)} зөрчил: {over_in[:3]}")
    check("бүх шилжүүлгийн тоо БҮХЭЛ ба эерэг",
          all(isinstance(t.quantity, int) and t.quantity > 0 for t in inv.transfers))
    check("эх үүсвэр ≠ хүлээн авагч",
          all(t.from_location_code != t.to_location_code for t in inv.transfers))
    check("мөрийн transfer_in/out нь төлөвлөгөөтэй таарна",
          all(r.transfer_in_qty == in_by.get(
              (r.position.product_code, r.position.location_code), 0)
              and r.transfer_out_qty == out_by.get(
                  (r.position.product_code, r.position.location_code), 0)
              for r in inv.rows))

    # ── 12. PURCHASE ──
    section("PURCHASE DECISION")
    print(f"      Худалдан авалт {inv.summary['totalPurchaseQty']:,.0f} ширхэг")
    bad_purchase = []
    for r in inv.rows:
        want = math.ceil(round(r.balance.recommended_stock - r.balance.current_stock
                               - r.transfer_in_qty, 9))
        want = max(0, want)
        if r.decision in ("STOP_PURCHASE", "PROMOTION"):
            if r.new_purchase_qty != 0:
                bad_purchase.append((r.position.product_code, "stop үед 0 байх ёстой"))
        elif r.new_purchase_qty != want:
            bad_purchase.append((r.position.product_code, f"{r.new_purchase_qty} != {want}"))
    check("§13 худалдан авалт = CEILING(recommended − current − transferIn)",
          not bad_purchase, f"{len(bad_purchase)} зөрчил: {bad_purchase[:3]}")
    check("бүх худалдан авалтын тоо БҮХЭЛ",
          all(isinstance(r.new_purchase_qty, int) for r in inv.rows))
    check("STOP_PURCHASE ⇒ худалдан авалт 0",
          all(r.new_purchase_qty == 0 for r in inv.rows if r.decision == "STOP_PURCHASE"))
    check("TRANSFER шийдвэр ⇒ шилжүүлэг хүлээн авна",
          all(r.transfer_in_qty > 0 for r in inv.rows if r.decision == "TRANSFER"))
    check("NEW_PURCHASE шийдвэр ⇒ худалдан авалт > 0",
          all(r.new_purchase_qty > 0 for r in inv.rows if r.decision == "NEW_PURCHASE"))

    # ── 13. PURCHASE PRICE CONTROL ──
    section("PURCHASE PRICE CONTROL")
    rules = load_rules()
    lines_by_product, name_by_product, price_meta = build_purchase_lines(
        excel, periods, rules["priceDimension"])
    benchmarks = [build_benchmark(c, name_by_product.get(c), l, rules["priceDimension"])
                  for c, l in lines_by_product.items()]
    usable = [b for b in benchmarks if b.min_unit_price is not None]
    total_saving = sum(b.potential_saving or 0 for b in usable)
    print(f"      Benchmark {len(usable)} SKU · боломжит хэмнэлт {total_saving:,.0f} ₮")

    check("min <= max", all(b.min_unit_price <= b.max_unit_price for b in usable))
    check("gap = max − min",
          all(close(b.price_gap, b.max_unit_price - b.min_unit_price, 1e-6) for b in usable))
    check("gap% = gap / min × 100",
          all(close(b.price_gap_pct, b.price_gap / b.min_unit_price * 100, 1e-6)
              for b in usable if b.min_unit_price > 0))
    check("⚠️ бүх нэгж үнэ эерэг (тэг үнийн хамгаалалт ажиллаж байна)",
          all(p.unit_price > 0 for b in usable for p in b.points))
    check("gap% боломжийн хязгаарт (< 100,000%)",
          all(b.price_gap_pct < 100_000 for b in usable),
          f"max={max((b.price_gap_pct for b in usable), default=0):,.0f}")
    check("боломжит хэмнэлт сөрөг биш",
          all((b.potential_saving or 0) >= -1e-6 for b in usable))
    check("ганц эх сурвалжтай ⇒ хэмнэлт 0",
          all(close(b.potential_saving, 0.0, 1e-6) for b in usable if b.source_count == 1))
    check("TOP3 нь 3-аас ихгүй",
          all(len(b.lowest_top) <= 3 and len(b.highest_top) <= 3 for b in usable))
    check("хамгийн хямд #1 = min unit price",
          all(close(b.lowest_top[0].unit_price, b.min_unit_price, 1e-9) for b in usable))

    # ── 14. GROSS MARGIN ──
    section("GROSS MARGIN RISK")
    profit, margin, reason = compute_margin(None, 1.0)
    check("⚠️ орлого байхгүй ⇒ ашиг None (0 БИШ)", profit is None)
    check("⚠️ орлого байхгүй ⇒ маржин None (0% БИШ)", margin is None)
    check("шалтгаан заавал буцна", reason == REVENUE_MISSING_REASON)
    at_risk_count = sum(1 for b in benchmarks
                        if assess_margin_risk(b.price_gap_pct, b.price_change_pct,
                                              b.potential_saving)[0])
    print(f"      MARGIN RISK flag: {at_risk_count} SKU")

    # ── 15. AI ──
    section("AI RECOMMENDATION")
    monthly_by_sku = build_monthly_sales_by_sku(excel, periods)
    bench_by_sku = {b.product_code: b for b in benchmarks}
    surplus_by_sku: dict[str, float] = {}
    for r in inv.rows:
        if r.balance.excess > 0:
            surplus_by_sku[r.position.product_code] = \
                surplus_by_sku.get(r.position.product_code, 0.0) + r.balance.excess

    recs = []
    for r in inv.rows:
        code = r.position.product_code
        b = bench_by_sku.get(code)
        trend, trend_pct, _, _ = compute_sales_trend(
            monthly_by_sku.get(code, [0.0] * len(periods)))
        recs.append((r, recommend({
            "abc": r.position.abc, "xyz": r.position.xyz,
            "stock_status": r.stock_status, "decision": r.decision,
            "location_code": r.position.location_code,
            "current_stock": r.balance.current_stock,
            "current_stock_days": r.balance.current_stock_days,
            "target_days": r.balance.target_days,
            "shortage": r.balance.shortage, "excess": r.balance.excess,
            "shortage_value": r.shortage_value, "excess_value": r.excess_value,
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
            "sales_trend": trend, "sales_trend_pct": trend_pct,
        })))

    print(f"      Зөвлөмж {len(recs):,}")
    check("зөвлөмжийн тоо = байрлалын тоо", len(recs) == len(inv.rows))
    check("⚠️ §10 AI нь engine-ийн ТООГ ӨӨРЧЛӨӨГҮЙ",
          all(rec["recommended_quantity"] == (r.transfer_in_qty if r.transfer_in_qty > 0
                                              else r.new_purchase_qty)
              for r, rec in recs))
    check("stop_purchase ⇔ шийдвэр STOP_PURCHASE",
          all(rec["stop_purchase"] == (r.decision == "STOP_PURCHASE") for r, rec in recs))
    check("purchase_required ⇔ худалдан авалт > 0",
          all(rec["purchase_required"] == (r.new_purchase_qty > 0) for r, rec in recs))
    required_keys = {"risk", "priority", "reason", "impact", "recommended_action",
                     "transfer_possible", "purchase_required", "stop_purchase",
                     "recommended_quantity"}
    check("§9 бүх талбар байна", all(required_keys <= set(rec) for _, rec in recs))
    check("бүх reason/impact/action хоосон биш",
          all(rec["reason"] and rec["impact"] and rec["recommended_action"] for _, rec in recs))

    # ── 16. ДАВХАРГА ХООРОНДЫН ТОГТВОРТОЙ БАЙДАЛ ──
    section("ДАВХАРГА ХООРОНДЫН ТОГТВОРТОЙ БАЙДАЛ")
    abc_by_sku = {r.product_code: r.abc_xyz for r in rows}
    mismatched = [r.position.product_code for r in inv.rows
                  if abc_by_sku.get(r.position.product_code) != r.position.abc_xyz]
    check("Phase 3-ын ABCXYZ = Phase 4-д ашигласан ангилал",
          not mismatched, f"{len(mismatched)} зөрүү")
    sku_in_inv = {r.position.product_code for r in inv.rows}
    check("нөөцийн бүх SKU нь ABC-XYZ ангилалтай", sku_in_inv <= set(abc_by_sku),
          f"{len(sku_in_inv - set(abc_by_sku))} ангилалгүй")
    check("нэг SKU нэг ангилалтай (байршлаас хамаарахгүй)",
          all(len({r.position.abc_xyz for r in inv.rows
                   if r.position.product_code == code}) == 1
              for code in list(sku_in_inv)[:50]))

    print("\n" + "=" * 76)
    if failures:
        print(f"АМЖИЛТГҮЙ: {len(failures)}")
        for f in failures:
            print(f"  • {f}")
        return 1
    print("БҮХ ГИНЖИН ХЭЛХЭЭ БҮРЭН PASS")
    return 0


if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(
        r"C:\Users\fm2.tp\Downloads\Data AI.xlsx")
    if not path.exists():
        print(f"Файл олдсонгүй: {path}")
        raise SystemExit(1)
    raise SystemExit(main(path))
