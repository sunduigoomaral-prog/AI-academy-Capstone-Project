"""
Phase 5 engine-ийн unit test (үнийн хяналт · маржин · хандлага · AI).

Дискэнд юу ч бичихгүй, бизнесийн хуурамч өгөгдөл үүсгэхгүй.

Ажиллуулах:
    set PYTHONIOENCODING=utf-8
    python python/tests/test_pricing.py
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pricing.engine import (  # noqa: E402
    PurchaseLine,
    assess_margin_risk,
    build_benchmark,
    compute_margin,
    compute_sales_trend,
    gap_severity_of,
    price_increase_severity_of,
    recommend,
)

failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"   {detail}" if detail and not ok else ""))
    if not ok:
        failures.append(f"{name} {detail}")


def close(a, b, tol: float = 1e-6) -> bool:
    if a is None or b is None:
        return a is b
    return math.isclose(a, b, rel_tol=tol, abs_tol=tol)


def line(dim, period, qty, amount, code="P1"):
    return PurchaseLine(code, dim, period, qty, amount)


# ─────────────────────────────────────────────────────────────
print("1) UNIT PRICE + LAST PURCHASE (§1, §2)")

b = build_benchmark("P1", "Тест", [
    line("S_A", "2026-03", 100, 1_000_000),   # 10,000
    line("S_A", "2026-05", 50, 600_000),      # 12,000 ← сүүлийн сар
    line("S_B", "2026-04", 200, 1_600_000),   # 8,000
])
pts = {p.dimension_key: p for p in b.points}
check("S_A сүүлийн сар = 2026-05", pts["S_A"].last_purchase_period == "2026-05",
      f"got {pts['S_A'].last_purchase_period}")
check("S_A нэгж үнэ = 600000/50 = 12000 (өмнөх сарынх БИШ)",
      close(pts["S_A"].unit_price, 12000.0), f"got {pts['S_A'].unit_price}")
check("S_B нэгж үнэ = 8000", close(pts["S_B"].unit_price, 8000.0))

print("\n   Нэг сар дотор олон гүйлгээ → ЖИГНЭСЭН дундаж")
b2 = build_benchmark("P2", None, [
    line("S_A", "2026-05", 10, 100_000),   # 10,000
    line("S_A", "2026-05", 90, 1_800_000), # 20,000 → жигнэсэн (1.9M/100)=19,000
])
check("жигнэсэн дундаж = 1,900,000/100 = 19,000",
      close(b2.points[0].unit_price, 19000.0), f"got {b2.points[0].unit_price}")

# ─────────────────────────────────────────────────────────────
print("\n2) TOP 3 эрэмбэ (§3, §4)")
b3 = build_benchmark("P3", None, [
    line("S1", "2026-05", 10, 50_000),   # 5,000
    line("S2", "2026-05", 10, 90_000),   # 9,000
    line("S3", "2026-05", 10, 70_000),   # 7,000
    line("S4", "2026-05", 10, 110_000),  # 11,000
])
low = [p.dimension_key for p in b3.lowest_top]
high = [p.dimension_key for p in b3.highest_top]
check("хамгийн хямд TOP3 = S1, S3, S2", low == ["S1", "S3", "S2"], f"got {low}")
check("хамгийн үнэтэй TOP3 = S4, S2, S3", high == ["S4", "S2", "S3"], f"got {high}")
check("TOP3 нь 3 мөр (4 эх сурвалжаас)", len(b3.lowest_top) == 3)
check("lowest_rank 1-ээс эхэлнэ", b3.points[0].lowest_rank == 1)

# ─────────────────────────────────────────────────────────────
print("\n3) PRICE GAP (§5)")
check("min = 5,000", close(b3.min_unit_price, 5000.0))
check("max = 11,000", close(b3.max_unit_price, 11000.0))
check("gap = 6,000", close(b3.price_gap, 6000.0))
check("gap% = 6000/5000×100 = 120%", close(b3.price_gap_pct, 120.0), f"got {b3.price_gap_pct}")
check("severity = CRITICAL (>= 40%)", b3.gap_severity == "CRITICAL", f"got {b3.gap_severity}")
check("gap 25% → HIGH", gap_severity_of(25.0) == "HIGH")
check("gap 12% → MEDIUM", gap_severity_of(12.0) == "MEDIUM")
check("gap 1% → None", gap_severity_of(1.0) is None)

print("\n   Ганц эх сурвалж → зөрүү 0")
b4 = build_benchmark("P4", None, [line("S1", "2026-05", 10, 50_000)])
check("gap = 0", close(b4.price_gap, 0.0))
check("gap% = 0", close(b4.price_gap_pct, 0.0))
check("severity = None", b4.gap_severity is None)

# ─────────────────────────────────────────────────────────────
print("\n4) ⚠️ ТЭГ ҮНИЙН ХАМГААЛАЛТ (бодит өгөгдлийн алдаа)")
b5 = build_benchmark("P5", None, [
    line("S_ZERO", "2026-05", 10, 0),        # нэгж үнэ 0 → ХАСАГДАНА
    line("S_OK", "2026-05", 10, 100_000),    # 10,000
])
check("тэг үнэтэй эх сурвалж benchmark-д ОРОХГҮЙ", b5.source_count == 1,
      f"got {b5.source_count}")
check("gap% нь хязгааргүй болохгүй", b5.price_gap_pct is not None and b5.price_gap_pct < 1e6,
      f"got {b5.price_gap_pct}")
check("min = 10,000 (0 БИШ)", close(b5.min_unit_price, 10000.0))

b6 = build_benchmark("P6", None, [line("S", "2026-05", 10, 0)])
check("бүгд тэг үнэтэй → benchmark байхгүй + шалтгаан",
      b6.min_unit_price is None and b6.excluded_reason is not None)

print("\n   Буцаалт (сөрөг тоо) benchmark-д орохгүй")
b7 = build_benchmark("P7", None, [
    line("S1", "2026-05", -5, -50_000),
    line("S2", "2026-05", 10, 80_000),
])
check("сөрөг тоо хасагдана", b7.source_count == 1, f"got {b7.source_count}")

# ─────────────────────────────────────────────────────────────
print("\n5) POTENTIAL SAVING (§6)")
b8 = build_benchmark("P8", None, [
    line("CHEAP", "2026-05", 100, 500_000),   # 5,000
    line("EXPENSIVE", "2026-05", 100, 900_000),  # 9,000
])
# нийт 200 ш, бодит өртөг 1,400,000; хамгийн хямдаар 200 × 5,000 = 1,000,000
check("saving = 1,400,000 − 200×5,000 = 400,000",
      close(b8.potential_saving, 400_000.0), f"got {b8.potential_saving}")
check("нийт тоо = 200", close(b8.total_quantity, 200.0))
check("жигнэсэн дундаж = 7,000", close(b8.weighted_avg_unit_price, 7000.0))

b9 = build_benchmark("P9", None, [line("S", "2026-05", 100, 500_000)])
check("ганц эх сурвалж → saving = 0", close(b9.potential_saving, 0.0))

# ─────────────────────────────────────────────────────────────
print("\n6) ҮНИЙН ӨӨРЧЛӨЛТ (§8-д хэрэглэгдэнэ)")
b10 = build_benchmark("P10", None, [
    line("S", "2026-01", 10, 100_000),   # 10,000
    line("S", "2026-05", 10, 130_000),   # 13,000
])
check("өөрчлөлт = (13000−10000)/10000 = +30%", close(b10.price_change_pct, 30.0),
      f"got {b10.price_change_pct}")
check("severity = CRITICAL (>= 30%)", b10.price_increase_severity == "CRITICAL")
check("+18% → HIGH", price_increase_severity_of(18.0) == "HIGH")
check("+7% → MEDIUM", price_increase_severity_of(7.0) == "MEDIUM")
check("+2% → None", price_increase_severity_of(2.0) is None)
check("буурсан → None", price_increase_severity_of(-10.0) is None)

b11 = build_benchmark("P11", None, [line("S", "2026-05", 10, 100_000)])
check("нэг л сар → өөрчлөлт тодорхойлогдохгүй", b11.price_change_pct is None)

# ─────────────────────────────────────────────────────────────
print("\n7) ⚠️ GROSS MARGIN (§7) — орлого БАЙХГҮЙ")
profit, margin, reason = compute_margin(None, 1_000_000)
check("орлого None → ашиг None", profit is None)
check("орлого None → маржин None", margin is None)
# ⚠️ "орлого" гэж хайж болохгүй — мессежид "орлогЫН" (тийн ялгал) байна
check("шалтгаан тайлбарлагдана", reason is not None and "орлог" in reason.lower(),
      f"got {reason!r}")

profit, margin, reason = compute_margin(1_500_000, 1_000_000)
check("орлого БАЙВАЛ ашиг = 500,000", close(profit, 500_000.0))
check("маржин = 500000/1500000×100 = 33.33%", close(margin, 100 / 3, 1e-9), f"got {margin}")
check("шалтгаан None", reason is None)

profit, margin, reason = compute_margin(0, 100)
check("орлого 0 → маржин None + шалтгаан", margin is None and reason is not None)

# ─────────────────────────────────────────────────────────────
print("\n8) MARGIN RISK (§8)")
at_risk, reasons, impact = assess_margin_risk(25.0, None, 400_000)
check("зөрүү 25% >= 20% → эрсдэлтэй", at_risk and len(reasons) == 1)
at_risk, reasons, _ = assess_margin_risk(None, 15.0, None)
check("өртөг +15% >= 10% → эрсдэлтэй", at_risk)
at_risk, reasons, _ = assess_margin_risk(30.0, 20.0, None)
check("хоёул хангагдвал 2 шалтгаан", at_risk and len(reasons) == 2, f"got {len(reasons)}")
at_risk, reasons, _ = assess_margin_risk(5.0, 2.0, None)
check("аль нь ч босго давахгүй → эрсдэлгүй", not at_risk and not reasons)

# ─────────────────────────────────────────────────────────────
print("\n9) SALES TREND")
t, pct, r, p = compute_sales_trend([100, 100, 100, 150, 150, 150])
check("100→150 = +50% → GROWING", t == "GROWING" and close(pct, 50.0), f"got {t}/{pct}")
t, pct, _, _ = compute_sales_trend([150, 150, 150, 100, 100, 100])
check("150→100 = −33.3% → DECLINING", t == "DECLINING", f"got {t}/{pct}")
t, pct, _, _ = compute_sales_trend([100, 100, 100, 105, 105, 105])
check("+5% → STABLE", t == "STABLE", f"got {t}/{pct}")
t, pct, _, _ = compute_sales_trend([0, 0, 0, 50, 50, 50])
check("өмнө нь 0 → NEW, хувь None", t == "NEW" and pct is None, f"got {t}/{pct}")
t, pct, _, _ = compute_sales_trend([0, 0, 0, 0, 0, 0])
check("бүгд 0 → NO_SALES", t == "NO_SALES" and pct is None)
t, _, _, _ = compute_sales_trend([100, 100, 100, 110, 110, 110])
check("+10% яг хил → GROWING", t == "GROWING", f"got {t}")

# ─────────────────────────────────────────────────────────────
print("\n10) AI DECISION ENGINE (§9, §11)")


def ctx(**kw):
    base = dict(
        abc="A", xyz="X", stock_status="OPTIMAL", decision="MONITOR",
        current_stock=100.0, shortage=0.0, transfer_in_qty=0, new_purchase_qty=0,
        transfer_available=False, price_gap_pct=None, price_change_pct=None,
        sales_trend="STABLE",
    )
    base.update(kw)
    return base


r = recommend(ctx(stock_status="STOCKOUT_RISK", abc="A", shortage=500.0,
                  transfer_in_qty=300, decision="TRANSFER", transfer_available=True))
check("A ангилал + нөөц дуусах → CRITICAL", r["priority"] == "CRITICAL", f"got {r['priority']}")
check("risk = НӨӨЦ ДУУСАХ", r["risk"] == "НӨӨЦ ДУУСАХ")
check("transfer_possible = True", r["transfer_possible"] is True)
check("⚠️ recommended_quantity = Phase 4-ийн шилжүүлгийн тоо (300)",
      r["recommended_quantity"] == 300, f"got {r['recommended_quantity']}")

r = recommend(ctx(stock_status="STOCKOUT_RISK", abc="C", shortage=500.0,
                  new_purchase_qty=500, decision="NEW_PURCHASE"))
check("C ангилал + нөөц дуусах → HIGH", r["priority"] == "HIGH", f"got {r['priority']}")
check("purchase_required = True", r["purchase_required"] is True)
check("recommended_quantity = худалдан авалтын тоо (500)", r["recommended_quantity"] == 500)

r = recommend(ctx(stock_status="NO_MOVEMENT", current_stock=40.0, decision="PROMOTION"))
check("хөдөлгөөнгүй + үлдэгдэлтэй → DEAD_STOCK", r["rule_code"] == "DEAD_STOCK",
      f"got {r['rule_code']}")
check("recommended_quantity = 0", r["recommended_quantity"] == 0)

r = recommend(ctx(price_gap_pct=35.0))
check("үнийн зөрүү 35% → PRICE_GAP_HIGH", r["rule_code"] == "PRICE_GAP_HIGH",
      f"got {r['rule_code']}")
r = recommend(ctx(price_change_pct=18.0))
check("өртөг +18% → PRICE_INCREASE", r["rule_code"] == "PRICE_INCREASE", f"got {r['rule_code']}")

r = recommend(ctx(stock_status="OVERSTOCK", decision="STOP_PURCHASE"))
check("илүүдэл → OVERSTOCK", r["rule_code"] == "OVERSTOCK")
check("stop_purchase = True", r["stop_purchase"] is True)
check("stop үед recommended_quantity = 0", r["recommended_quantity"] == 0)

r = recommend(ctx(sales_trend="DECLINING"))
check("борлуулалт буурсан → SALES_DECLINING", r["rule_code"] == "SALES_DECLINING")

r = recommend(ctx())
check("эрсдэлгүй → MONITOR", r["rule_code"] == "MONITOR", f"got {r['rule_code']}")
check("MONITOR priority = LOW", r["priority"] == "LOW")

print("\n   §9 JSON бүтцийн бүрэн бүтэн байдал")
required = {"risk", "priority", "reason", "impact", "recommended_action",
            "transfer_possible", "purchase_required", "stop_purchase", "recommended_quantity"}
check("бүх шаардлагатай талбар байна", required <= set(r), f"дутуу: {required - set(r)}")
check("boolean талбарууд bool төрөлтэй",
      all(isinstance(r[k], bool) for k in ("transfer_possible", "purchase_required", "stop_purchase")))
check("recommended_quantity нь тоо", isinstance(r["recommended_quantity"], (int, float)))

print("\n   ⚠️ §10 — AI тоог ӨӨРЧЛӨХГҮЙ")
r = recommend(ctx(stock_status="LOW_STOCK", shortage=123.4, transfer_in_qty=0,
                  new_purchase_qty=124, decision="NEW_PURCHASE"))
check("engine-ийн бодсон 124-ийг хэвээр буцаана (дугуйлахгүй, өөрчлөхгүй)",
      r["recommended_quantity"] == 124, f"got {r['recommended_quantity']}")

# ─────────────────────────────────────────────────────────────
print()
if failures:
    print(f"АМЖИЛТГҮЙ: {len(failures)}")
    for f in failures:
        print(f"  • {f}")
    raise SystemExit(1)

print("Бүх тест PASS")
raise SystemExit(0)
