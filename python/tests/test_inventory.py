"""
Inventory optimization engine-ийн unit test (Phase 4 §18, §19 + хилийн утгууд).

Дискэнд юу ч бичихгүй, бизнесийн хуурамч өгөгдөл үүсгэхгүй — зөвхөн цэвэр
функцүүдийг санах ойд шалгана.

Ажиллуулах:
    set PYTHONIOENCODING=utf-8
    python python/tests/test_inventory.py
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from inventory.engine import (  # noqa: E402
    Position,
    StatusParams,
    TransferCandidate,
    ceil_qty,
    classify_status,
    compute_balance,
    decide,
    floor_qty,
    new_purchase_qty,
    optimize,
    plan_transfers_for_sku,
    target_months,
)

PARAMS = StatusParams.defaults()
DPM = PARAMS.days_per_month

# Phase 1-ийн бодлогын матриц (DB seed-тэй ижил)
TARGETS = {
    ("WAREHOUSE", "A", "X"): 45, ("WAREHOUSE", "A", "Y"): 40, ("WAREHOUSE", "A", "Z"): 30,
    ("WAREHOUSE", "B", "X"): 40, ("WAREHOUSE", "B", "Y"): 35, ("WAREHOUSE", "B", "Z"): 25,
    ("WAREHOUSE", "C", "X"): 30, ("WAREHOUSE", "C", "Y"): 25, ("WAREHOUSE", "C", "Z"): 15,
    ("PHARMACY", "A", "X"): 30, ("PHARMACY", "A", "Y"): 25, ("PHARMACY", "A", "Z"): 15,
    ("PHARMACY", "B", "X"): 25, ("PHARMACY", "B", "Y"): 20, ("PHARMACY", "B", "Z"): 10,
    ("PHARMACY", "C", "X"): 15, ("PHARMACY", "C", "Y"): 10, ("PHARMACY", "C", "Z"): 7,
}


def resolve_target(location_type: str, abc: str, xyz: str) -> int:
    """Production-той ижил дүрэм: «Эм ханган нийлүүлэх төв БОЛОН БУСАД» багана нь
    PHARMACY биш аливаа байршлын төрөлд үйлчилнэ (run_inventory.load_policy-тэй мөр)."""
    hit = TARGETS.get((location_type, abc, xyz))
    if hit is not None:
        return hit
    if location_type != "PHARMACY":
        hit = TARGETS.get(("WAREHOUSE", abc, xyz))
        if hit is not None:
            return hit
    raise KeyError(f"InventoryPolicy олдсонгүй: {location_type}/{abc}{xyz}")


failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"   {detail}" if detail and not ok else ""))
    if not ok:
        failures.append(f"{name} {detail}")


def close(a: float, b: float, tol: float = 1e-9) -> bool:
    return math.isclose(a, b, rel_tol=tol, abs_tol=tol)


def position(**kw) -> Position:
    base = dict(
        product_code="P", product_name=None, location_code="L1", location_type="WAREHOUSE",
        channel_code=None, company_code="C1", abc="A", xyz="X", abc_xyz="AX",
        average_monthly_sales=0.0, current_stock=0.0, current_stock_value=0.0, unit_cost=None,
    )
    base.update(kw)
    return Position(**base)


# ─────────────────────────────────────────────────────────────
print("1) TARGET MONTHS (§3)")
check("AX агуулах 45/30 = 1.5", close(target_months(45, DPM), 1.5))
check("CZ эмийн сан 7/30 = 0.2333…", close(target_months(7, DPM), 7 / 30))
check("daysPerMonth = 30 тохиргооноос", close(DPM, 30.0), f"got {DPM}")

print("\n2) CEILING (§10)")
check("125.4 → 126", ceil_qty(125.4) == 126, f"got {ceil_qty(125.4)}")
check("126.0 → 126 (нэмэгдэхгүй)", ceil_qty(126.0) == 126, f"got {ceil_qty(126.0)}")
check("float чимээ 126.0000000001 → 126", ceil_qty(126.0000000001) == 126,
      f"got {ceil_qty(126.0000000001)}")
check("сөрөг → 0", ceil_qty(-5.2) == 0)
check("floor 100.9 → 100", floor_qty(100.9) == 100)

# ─────────────────────────────────────────────────────────────
print("\n3) ⭐ ТЕСТ КЕЙС §18 — P10001 / AX / агуулах")
b = compute_balance(avg_monthly_sales=1000, current_stock=500, target_days=45, days_per_month=DPM)
check("Recommended = 1000 × 45/30 = 1500", close(b.recommended_stock, 1500.0),
      f"got {b.recommended_stock}")
check("Current Stock Days = 500/1000×30 = 15", close(b.current_stock_days, 15.0),
      f"got {b.current_stock_days}")
check("Shortage = 1500 − 500 = 1000", close(b.shortage, 1000.0), f"got {b.shortage}")
check("Excess = 0", close(b.excess, 0.0))

# Өөр байршилд 700 илүүдэлтэй
candidates = [
    TransferCandidate("P10001", "WH_A", "C1", shortage=1000.0, surplus=0.0, unit_cost=None),
    TransferCandidate("P10001", "WH_B", "C1", shortage=0.0, surplus=700.0, unit_cost=None),
]
items = plan_transfers_for_sku(candidates)
check("Transfer 1 санал үүссэн", len(items) == 1, f"got {len(items)}")
if items:
    check("Transfer Qty = MIN(1000, 700) = 700", items[0].quantity == 700, f"got {items[0].quantity}")
    check("WH_B → WH_A чиглэлтэй",
          items[0].from_location_code == "WH_B" and items[0].to_location_code == "WH_A")
transfer_in = sum(i.quantity for i in items if i.to_location_code == "WH_A")
purchase = new_purchase_qty(b.recommended_stock, b.current_stock, transfer_in)
check("Үлдсэн дутагдал → New Purchase = 300", purchase == 300, f"got {purchase}")

# ─────────────────────────────────────────────────────────────
print("\n4) ⭐ ТЕСТ КЕЙС §19 — CZ / эмийн сан")
b2 = compute_balance(avg_monthly_sales=300, current_stock=200, target_days=7, days_per_month=DPM)
check("Recommended = 300 × 7/30 = 70", close(b2.recommended_stock, 70.0),
      f"got {b2.recommended_stock}")
check("Current Stock Days = 200/300×30 = 20", close(b2.current_stock_days, 20.0),
      f"got {b2.current_stock_days}")
check("Excess = 200 − 70 = 130", close(b2.excess, 130.0), f"got {b2.excess}")
check("Shortage = 0", close(b2.shortage, 0.0))
check("20 > 7 × 1.5 = 10.5", b2.current_stock_days > 7 * PARAMS.overstock_factor)

status, label = classify_status(300, b2.current_stock_days, 200, 7, "Z", PARAMS)
check("Төлөв = OVERSTOCK (Хэт их нөөцтэй)", status == "OVERSTOCK", f"got {status}/{label}")
decision, dec_label, _ = decide(300, 200, status, 0, 0)
check("Шийдвэр = STOP_PURCHASE", decision == "STOP_PURCHASE", f"got {decision}")

# ─────────────────────────────────────────────────────────────
print("\n5) INVENTORY STATUS дүрмүүд (§11)")
check("дундаж = 0 → NO_MOVEMENT (Хөдөлгөөнгүй)",
      classify_status(0, 0, 50, 45, "X", PARAMS)[0] == "NO_MOVEMENT")
check("stockDays = 7 → STOCKOUT_RISK (хилийн утга ОРНО)",
      classify_status(100, 7, 23, 45, "X", PARAMS)[0] == "STOCKOUT_RISK")
check("stockDays = 5 → STOCKOUT_RISK",
      classify_status(100, 5, 17, 45, "X", PARAMS)[0] == "STOCKOUT_RISK")
check("stockDays = 20 < target 45 → LOW_STOCK",
      classify_status(100, 20, 67, 45, "X", PARAMS)[0] == "LOW_STOCK")
check("stockDays = 45 = target → OPTIMAL",
      classify_status(100, 45, 150, 45, "X", PARAMS)[0] == "OPTIMAL")
check("stockDays = 67.5 = target×1.5 → OPTIMAL (хилийн утга ОРНО)",
      classify_status(100, 67.5, 225, 45, "X", PARAMS)[0] == "OPTIMAL")
check("stockDays = 68 > target×1.5 → OVERSTOCK",
      classify_status(100, 68, 227, 45, "X", PARAMS)[0] == "OVERSTOCK")
check("XYZ=Z, stockDays = 50 > target 45, ≤ 67.5 → SLOW_MOVING",
      classify_status(100, 50, 167, 45, "Z", PARAMS)[0] == "SLOW_MOVING",
      f"got {classify_status(100, 50, 167, 45, 'Z', PARAMS)[0]}")
check("XYZ=X, stockDays = 50 → OPTIMAL (Z биш тул SLOW_MOVING болохгүй)",
      classify_status(100, 50, 167, 45, "X", PARAMS)[0] == "OPTIMAL")
check("XYZ=Z, stockDays = 80 → OVERSTOCK (priority-гоор SLOW_MOVING-г дарна)",
      classify_status(100, 80, 267, 45, "Z", PARAMS)[0] == "OVERSTOCK")

print("\n   ⚠️ Хилийн онцгой тохиолдол: target <= stockout threshold")
s7, _ = classify_status(300, 7.0, 70, 7, "Z", PARAMS)
check("CZ эмийн сан (target=7), stockDays=7 → STOCKOUT_RISK нь OPTIMAL-г дарна",
      s7 == "STOCKOUT_RISK", f"got {s7}")

# ─────────────────────────────────────────────────────────────
print("\n6) ШИЛЖҮҮЛГИЙН ХЯЗГААР (§12)")
c = [
    TransferCandidate("P", "D", "C1", shortage=300.0, surplus=0.0, unit_cost=None),
    TransferCandidate("P", "S", "C1", shortage=0.0, surplus=100.4, unit_cost=None),
]
items = plan_transfers_for_sku(c)
check("CEILING илүүдлээс давбал FLOOR болно (100.4 → 100, 101 БИШ)",
      items[0].quantity == 100, f"got {items[0].quantity}")

c2 = [
    TransferCandidate("P", "D", "C1", shortage=50.4, surplus=0.0, unit_cost=None),
    TransferCandidate("P", "S", "C1", shortage=0.0, surplus=900.0, unit_cost=None),
]
items2 = plan_transfers_for_sku(c2)
check("дутагдлаар хязгаарлагдвал CEILING (50.4 → 51)",
      items2[0].quantity == 51, f"got {items2[0].quantity}")

c3 = [
    TransferCandidate("P", "D", "C1", shortage=100.0, surplus=0.0, unit_cost=None),
    TransferCandidate("P", "S1", "C1", shortage=0.0, surplus=30.0, unit_cost=None),
    TransferCandidate("P", "S2", "C1", shortage=0.0, surplus=80.0, unit_cost=None),
]
items3 = plan_transfers_for_sku(c3)
check("илүүдэл их эх үүсвэр ЭХЭНД (S2 = 80)",
      items3[0].from_location_code == "S2", f"got {items3[0].from_location_code}")
check("хоёр эх үүсвэрээс нийт 100", sum(i.quantity for i in items3) == 100,
      f"got {sum(i.quantity for i in items3)}")

c4 = [
    TransferCandidate("P", "D", "CO_A", shortage=100.0, surplus=0.0, unit_cost=None),
    TransferCandidate("P", "S", "CO_B", shortage=0.0, surplus=100.0, unit_cost=None),
]
check("cross-company хориглосон үед шилжүүлэг гарахгүй",
      len(plan_transfers_for_sku(c4, allow_cross_company=False)) == 0)
check("cross-company зөвшөөрсөн үед шилжүүлэг гарна",
      len(plan_transfers_for_sku(c4, allow_cross_company=True)) == 1)

check("илүүдэлгүй бол шилжүүлэг байхгүй",
      plan_transfers_for_sku([TransferCandidate("P", "D", "C1", 100.0, 0.0, None)]) == [])

# ─────────────────────────────────────────────────────────────
print("\n7) БҮРЭН OPTIMIZER — §18-ыг end-to-end")
result = optimize(
    [
        position(product_code="P10001", location_code="WH_A", abc="A", xyz="X", abc_xyz="AX",
                 average_monthly_sales=1000, current_stock=500),
        position(product_code="P10001", location_code="WH_B", abc="A", xyz="X", abc_xyz="AX",
                 average_monthly_sales=100, current_stock=850),
    ],
    resolve_target,
)
rows = {r.position.location_code: r for r in result.rows}
check("WH_A: shortage = 1000", close(rows["WH_A"].balance.shortage, 1000.0),
      f"got {rows['WH_A'].balance.shortage}")
check("WH_B: recommended = 100×1.5 = 150, excess = 700",
      close(rows["WH_B"].balance.excess, 700.0), f"got {rows['WH_B'].balance.excess}")
check("WH_A transfer_in = 700", rows["WH_A"].transfer_in_qty == 700,
      f"got {rows['WH_A'].transfer_in_qty}")
check("WH_B transfer_out = 700", rows["WH_B"].transfer_out_qty == 700)
check("WH_A new purchase = 300", rows["WH_A"].new_purchase_qty == 300,
      f"got {rows['WH_A'].new_purchase_qty}")
check("WH_A шийдвэр = TRANSFER", rows["WH_A"].decision == "TRANSFER",
      f"got {rows['WH_A'].decision}")

print("\n   Хөдөлгөөнгүй → PROMOTION")
r2 = optimize([position(product_code="DEAD", average_monthly_sales=0, current_stock=40)],
              resolve_target)
check("дундаж=0, үлдэгдэлтэй → NO_MOVEMENT", r2.rows[0].stock_status == "NO_MOVEMENT")
check("шийдвэр = PROMOTION", r2.rows[0].decision == "PROMOTION", f"got {r2.rows[0].decision}")
check("PROMOTION үед худалдан авалт 0", r2.rows[0].new_purchase_qty == 0)

print("\n   OVERSTOCK үед худалдан авалт САНАЛ БОЛГОХГҮЙ")
r3 = optimize([position(abc="C", xyz="Z", abc_xyz="CZ", location_type="PHARMACY",
                        average_monthly_sales=300, current_stock=200)], resolve_target)
check("CZ эмийн сан → OVERSTOCK", r3.rows[0].stock_status == "OVERSTOCK")
check("шийдвэр = STOP_PURCHASE", r3.rows[0].decision == "STOP_PURCHASE")
check("худалдан авалт 0", r3.rows[0].new_purchase_qty == 0)

print("\n   Зохистой → MONITOR")
r4 = optimize([position(average_monthly_sales=100, current_stock=150)], resolve_target)
check("stockDays = 45 → OPTIMAL", r4.rows[0].stock_status == "OPTIMAL",
      f"got {r4.rows[0].stock_status}")
check("шийдвэр = MONITOR", r4.rows[0].decision == "MONITOR", f"got {r4.rows[0].decision}")

print("\n   Target days тохиргооноос ирнэ (hardcode биш)")
try:
    optimize([position(abc="A", xyz="Q", location_type="PHARMACY")], resolve_target)
    check("тохиргоо олдохгүй үед алдаа", False, "алдаа шидээгүй")
except KeyError:
    check("InventoryPolicy олдохгүй бол алдаа шиднэ (чимээгүй default руу унахгүй)", True)


# ─────────────────────────────────────────────────────────────
print("\n8) ⭐ ШИЛЖҮҮЛГИЙН ДАВУУ ЭРХИЙН ШАТЛАЛ")

# WH_A дутагдалтай. Эх сурвалж: нэг ХХК-ийн ЭМИЙН САН (илүүдэл бага) ба
# ӨӨР ХХК-ийн агуулах (илүүдэл их). Компани доторх нь ЭХЭЛЖ сонгогдох ёстой.
tiered = [
    TransferCandidate("P", "WH_A", "C1", shortage=100.0, surplus=0.0, unit_cost=None,
                      location_type="WAREHOUSE"),
    TransferCandidate("P", "PH_1", "C1", shortage=0.0, surplus=60.0, unit_cost=None,
                      location_type="PHARMACY"),
    TransferCandidate("P", "WH_B", "C2", shortage=0.0, surplus=500.0, unit_cost=None,
                      location_type="WAREHOUSE"),
]
items = plan_transfers_for_sku(tiered)
first = items[0] if items else None
check("компани доторх суваг ЭХЭЛЖ сонгогдоно (илүүдэл багатай ч)",
      first is not None and first.from_location_code == "PH_1"
      and first.tier_code == "SAME_COMPANY",
      f"got {first.from_location_code if first else None}/{first.tier_code if first else None}")
check("компани доторх илүүдэл дуусмагц л компани хооронд шилжинэ",
      len(items) == 2 and items[1].from_location_code == "WH_B"
      and items[1].tier_code == "CROSS_COMPANY",
      f"got {[(i.from_location_code, i.tier_code) for i in items]}")
check("нийт шилжүүлэг = дутагдал 100", sum(i.quantity for i in items) == 100,
      f"got {sum(i.quantity for i in items)}")

print("\n   Компани доторх нь хүрэлцвэл компани хооронд ОГТ санал болгохгүй")
enough = [
    TransferCandidate("P", "WH_A", "C1", shortage=50.0, surplus=0.0, unit_cost=None,
                      location_type="WAREHOUSE"),
    TransferCandidate("P", "PH_1", "C1", shortage=0.0, surplus=80.0, unit_cost=None,
                      location_type="PHARMACY"),
    TransferCandidate("P", "WH_B", "C2", shortage=0.0, surplus=900.0, unit_cost=None,
                      location_type="WAREHOUSE"),
]
items2 = plan_transfers_for_sku(enough)
check("бүгд SAME_COMPANY, өөр ХХК ашиглагдаагүй",
      all(i.tier_code == "SAME_COMPANY" for i in items2)
      and sum(i.quantity for i in items2) == 50,
      f"got {[(i.from_location_code, i.tier_code, i.quantity) for i in items2]}")

print("\n   Нэг ХХК-ийн агуулах хооронд ч мөн 1-р шат")
same_wh = [
    TransferCandidate("P", "WH_A", "C1", shortage=50.0, surplus=0.0, unit_cost=None,
                      location_type="WAREHOUSE"),
    TransferCandidate("P", "WH_A2", "C1", shortage=0.0, surplus=80.0, unit_cost=None,
                      location_type="WAREHOUSE"),
]
items3 = plan_transfers_for_sku(same_wh)
check("нэг ХХК-ийн хоёр агуулах → SAME_COMPANY",
      items3[0].tier_code == "SAME_COMPANY", f"got {items3[0].tier_code}")

print("\n   Cross-company хориглосон үед 2-р шат бүхэлдээ алгасагдана")
items4 = plan_transfers_for_sku(tiered, allow_cross_company=False)
check("зөвхөн нэг ХХК-ийн эх сурвалж ашиглагдана",
      all(i.from_location_code == "PH_1" for i in items4)
      and sum(i.quantity for i in items4) == 60,
      f"got {[(i.from_location_code, i.tier_code) for i in items4]}")


# ─────────────────────────────────────────────────────────────
print("\n9) ⭐ ЗОРИЛТОТ ХОНОГ — «ХАНГАН НИЙЛҮҮЛЭХ ТӨВ БОЛОН БУСАД»")

# Хүснэгт 2 баганатай: «Эм ханган нийлүүлэх төв болон бусад» | «Эмийн сан».
# Тиймээс PHARMACY биш аливаа төрөл WAREHOUSE-ийн утгыг өвлөнө.
r_wh = optimize([position(abc="A", xyz="X", location_type="WAREHOUSE",
                          average_monthly_sales=100, current_stock=0)], resolve_target)
check("агуулах AX → 45 хоног", r_wh.rows[0].balance.target_days == 45,
      f"got {r_wh.rows[0].balance.target_days}")

r_ph = optimize([position(abc="A", xyz="X", location_type="PHARMACY",
                          average_monthly_sales=100, current_stock=0)], resolve_target)
check("эмийн сан AX → 30 хоног", r_ph.rows[0].balance.target_days == 30,
      f"got {r_ph.rows[0].balance.target_days}")

r_fb = optimize([position(abc="C", xyz="Z", location_type="DISTRIBUTION_HUB",
                          average_monthly_sales=100, current_stock=0)], resolve_target)
check("PHARMACY биш шинэ төрөл CZ → «болон бусад» = 15 хоног",
      r_fb.rows[0].balance.target_days == 15, f"got {r_fb.rows[0].balance.target_days}")


# ─────────────────────────────────────────────────────────────
print()
if failures:
    print(f"АМЖИЛТГҮЙ: {len(failures)}")
    for f in failures:
        print(f"  • {f}")
    raise SystemExit(1)

print("Бүх тест PASS")
raise SystemExit(0)
