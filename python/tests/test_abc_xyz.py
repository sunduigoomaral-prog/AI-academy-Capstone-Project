"""
ABC-XYZ engine-ийн unit test (Phase 3 §9).

Шалгах зүйлс:
  ABC   0–70% = A · 70–90% = B · 90%+ = C
  XYZ   CV <= 0.25 = X · 0.25 < CV <= 0.50 = Y · CV > 0.50 = Z
  Zero sales → XYZ = Z, inventory_status = NO_MOVEMENT (Хөдөлгөөнгүй)

Бүх тоо гараар шалгаж болохоор сонгосон. Дискэнд юу ч бичихгүй.

Ажиллуулах:
    set PYTHONIOENCODING=utf-8
    python python/tests/test_abc_xyz.py
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from analysis.engine import (  # noqa: E402
    SkuAggregate,
    build_matrix,
    classify_abc,
    classify_one_xyz,
    coefficient_of_variation,
    mean,
    population_std_dev,
    run_abc_xyz,
)

A, B = 0.70, 0.90
X, Y = 0.25, 0.50

failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"   {detail}" if detail and not ok else ""))
    if not ok:
        failures.append(f"{name} {detail}")


def close(a: float, b: float, tol: float = 1e-9) -> bool:
    return math.isclose(a, b, rel_tol=tol, abs_tol=tol)


def close_opt(value: float | None, expected: float, tol: float = 1e-9) -> bool:
    """None-safe харьцуулалт. ⚠️ `value or -1` бичиж БОЛОХГҮЙ — 0.0 нь falsy."""
    return value is not None and close(value, expected, tol)


# ─────────────────────────────────────────────────────────────
print("1) СТАТИСТИК — population stddev (STDEV.P)")

# [2,4,4,4,5,5,7,9]: mean=5, STDEV.P=2 (сурах бичгийн сонгодог жишээ)
vals = [2, 4, 4, 4, 5, 5, 7, 9]
check("mean([2,4,4,4,5,5,7,9]) = 5", close(mean(vals), 5.0), f"got {mean(vals)}")
check("STDEV.P = 2 (STDEV.S = 2.138 БИШ)", close(population_std_dev(vals), 2.0),
      f"got {population_std_dev(vals)}")
check("CV = 2/5 = 0.4", close_opt(coefficient_of_variation(vals), 0.4))
check("тогтмол цуваа → stdDev = 0", close(population_std_dev([10, 10, 10, 10, 10, 10]), 0.0))
check("хоосон цуваа → 0", close(population_std_dev([]), 0.0))

# ─────────────────────────────────────────────────────────────
print("\n2) ABC — хилийн утгууд (0–70% A, 70–90% B, 90%+ C)")

# Нийт = 100. Хуримтлагдсан: 70 → 90 → 100
res = classify_abc([("P1", 70.0), ("P2", 20.0), ("P3", 10.0)], A, B)
by_code = {r[0]: r for r in res}
check("cum = 70.00% яг хилийн утга → A", by_code["P1"][4] == "A", f"got {by_code['P1'][4]}")
check("cum = 90.00% яг хилийн утга → B", by_code["P2"][4] == "B", f"got {by_code['P2'][4]}")
check("cum = 100% → C", by_code["P3"][4] == "C", f"got {by_code['P3'][4]}")
check("share зөв (70/100 = 0.70)", close(by_code["P1"][2], 0.70))
check("хуримтлагдсан өсөж явна", close(by_code["P2"][3], 0.90))

# 70%-иас яг дээш → B болох ёстой
res2 = classify_abc([("Q1", 70.5), ("Q2", 29.5)], A, B)
q = {r[0]: r for r in res2}
check("cum = 70.5% (> 70) → B", q["Q1"][4] == "B", f"got {q['Q1'][4]}")

# 90%-иас яг дээш → C
res3 = classify_abc([("R1", 60.0), ("R2", 30.5), ("R3", 9.5)], A, B)
r3 = {r[0]: r for r in res3}
check("cum = 60% → A", r3["R1"][4] == "A")
check("cum = 90.5% (> 90) → C", r3["R2"][4] == "C", f"got {r3['R2'][4]}")

print("\n   ABC — эрэмбэ ба тусгай тохиолдол")
res4 = classify_abc([("Z", 10.0), ("A", 10.0), ("M", 80.0)], A, B)
check("ихээс бага руу эрэмбэлнэ", [r[0] for r in res4][0] == "M", f"got {[r[0] for r in res4]}")
check("дүн тэнцвэл кодоор тогтвортой", [r[0] for r in res4][1:] == ["A", "Z"],
      f"got {[r[0] for r in res4]}")
check("rank 1-ээс эхэлнэ", [r[5] for r in res4] == [1, 2, 3])

res5 = classify_abc([("N1", 0.0), ("N2", 0.0)], A, B)
check("нийт дүн = 0 → бүгд C (бүгд A БИШ)", all(r[4] == "C" for r in res5),
      f"got {[r[4] for r in res5]}")

try:
    classify_abc([("E", 1.0)], 0.9, 0.7)
    check("буруу threshold → алдаа", False, "алдаа шидээгүй")
except ValueError:
    check("буруу threshold (A > B) → алдаа шиднэ", True)

# ─────────────────────────────────────────────────────────────
print("\n3) XYZ — хилийн утгууд (X <= 0.25, 0.25 < Y <= 0.50, Z > 0.50)")

# Тогтмол эрэлт: CV = 0 → X
avg, sd, cv, xyz, status, months = classify_one_xyz([100] * 6, X, Y)
check("тогтмол эрэлт → CV = 0 → X", xyz == "X" and close_opt(cv, 0.0), f"cv={cv}, xyz={xyz}")
check("тогтмол эрэлт → ACTIVE", status == "ACTIVE")
check("дундаж = 100", close(avg, 100.0))

# CV яг 0.25 → X (хилийн утга ОРНО)
# mean=100, STDEV.P=25 болгох цуваа: [75,125] давтвал stdDev=25
avg, sd, cv, xyz, *_ = classify_one_xyz([75, 125, 75, 125, 75, 125], X, Y)
check("CV = 0.25 яг хил → X", close_opt(cv, 0.25) and xyz == "X", f"cv={cv}, xyz={xyz}")

# CV яг 0.50 → Y (хилийн утга ОРНО)
avg, sd, cv, xyz, *_ = classify_one_xyz([50, 150, 50, 150, 50, 150], X, Y)
check("CV = 0.50 яг хил → Y", close_opt(cv, 0.50) and xyz == "Y", f"cv={cv}, xyz={xyz}")

# CV 0.25-аас арай их → Y
avg, sd, cv, xyz, *_ = classify_one_xyz([70, 130, 70, 130, 70, 130], X, Y)
check("CV = 0.30 → Y", close_opt(cv, 0.30) and xyz == "Y", f"cv={cv}, xyz={xyz}")

# CV 0.50-аас их → Z
avg, sd, cv, xyz, *_ = classify_one_xyz([0, 0, 0, 0, 0, 600], X, Y)
check("маш хэлбэлзэлтэй → CV > 0.5 → Z", cv is not None and cv > 0.5 and xyz == "Z", f"cv={cv}, xyz={xyz}")

print("\n   XYZ — тэг борлуулалт (Хөдөлгөөнгүй)")
avg, sd, cv, xyz, status, months = classify_one_xyz([0, 0, 0, 0, 0, 0], X, Y)
check("бүх сар 0 → XYZ = Z", xyz == "Z", f"got {xyz}")
check("бүх сар 0 → CV = None", cv is None, f"got {cv}")
check("бүх сар 0 → NO_MOVEMENT (Хөдөлгөөнгүй)", status == "NO_MOVEMENT", f"got {status}")
check("бүх сар 0 → дундаж = 0", close(avg, 0.0))
check("бүх сар 0 → борлуулалттай сар = 0", months == 0)

print("\n   XYZ — дундаж нь БҮТЭН саруудын тоонд хуваагдана")
avg, sd, cv, xyz, status, months = classify_one_xyz([60, 0, 0, 0, 0, 0], X, Y)
check("нэг сард 60, дундаж = 10 (60/6, 60/1 БИШ)", close(avg, 10.0), f"got {avg}")
check("борлуулалттай сар = 1", months == 1)
check("нэг л удаа зарагдсан → Z", xyz == "Z", f"cv={cv}")

# ─────────────────────────────────────────────────────────────
print("\n4) ABC + XYZ хосолсон ангилал")

aggs = [
    SkuAggregate("HIGH_STABLE", "Их, тогтвортой", 700.0, [100] * 6),
    SkuAggregate("MID_VAR", "Дунд, хэлбэлзэлтэй", 200.0, [70, 130, 70, 130, 70, 130]),
    SkuAggregate("LOW_DEAD", "Бага, хөдөлгөөнгүй", 100.0, [0, 0, 0, 0, 0, 60]),
    SkuAggregate("NO_SALES", "Борлуулалтгүй", 0.0, [0] * 6),
]
rows = run_abc_xyz(aggs, A, B, X, Y, expected_months=6)
by = {r.product_code: r for r in rows}

check("HIGH_STABLE → AX", by["HIGH_STABLE"].abc_xyz == "AX", f"got {by['HIGH_STABLE'].abc_xyz}")
check("MID_VAR → BY", by["MID_VAR"].abc_xyz == "BY", f"got {by['MID_VAR'].abc_xyz}")
check("LOW_DEAD → CZ", by["LOW_DEAD"].abc_xyz == "CZ", f"got {by['LOW_DEAD'].abc_xyz}")
check("NO_SALES → CZ + NO_MOVEMENT",
      by["NO_SALES"].abc_xyz == "CZ" and by["NO_SALES"].inventory_status == "NO_MOVEMENT",
      f"got {by['NO_SALES'].abc_xyz}/{by['NO_SALES'].inventory_status}")
check("abc_xyz = abc + xyz", all(r.abc_xyz == r.abc + r.xyz for r in rows))

print("\n   Оролтын бүрэн бүтэн байдал")
try:
    run_abc_xyz([SkuAggregate("BAD", None, 10.0, [1, 2, 3])], A, B, X, Y, expected_months=6)
    check("сарын тоо зөрвөл алдаа", False, "алдаа шидээгүй")
except ValueError:
    check("monthlyQty урт зөрвөл алдаа шиднэ", True)

print("\n   Матриц")
matrix = build_matrix(rows)
check("матриц 9 нүдтэй", len(matrix) == 9, f"got {len(matrix)}")
check("нүднүүдийн SKU нийлбэр = нийт SKU",
      sum(c["skuCount"] for c in matrix) == len(rows))
check("эзлэх хувийн нийлбэр = 1", close(sum(c["salesShare"] for c in matrix), 1.0, 1e-9))
ax = next(c for c in matrix if c["abcXyz"] == "AX")
check("AX нүдэнд 1 SKU, 70%", ax["skuCount"] == 1 and close(ax["salesShare"], 0.7))

# ─────────────────────────────────────────────────────────────
print()
if failures:
    print(f"АМЖИЛТГҮЙ: {len(failures)}")
    for f in failures:
        print(f"  • {f}")
    raise SystemExit(1)

print("Бүх тест PASS")
raise SystemExit(0)
