"""
ABC-XYZ ENGINE — ЦЭВЭР ФУНКЦҮҮД (Python тал).

⚠️ Энэ модуль нь `src/analytics/`-ийн TypeScript хувилбарын ТОЛИН ТУСГАЛ.
   Threshold-ууд `src/config/analysis-defaults.json`-оос ирдэг тул хоёр
   давхаргын үр дүн зөрөхгүй.

ABC — SALES VALUE (мөнгөн дүн). ⚠️ Тоо хэмжээгээр ABC хийхгүй.
XYZ — SALES QUANTITY, population standard deviation (STDEV.P).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Iterable, Sequence

ABC_XYZ_CLASSES = ["AX", "AY", "AZ", "BX", "BY", "BZ", "CX", "CY", "CZ"]


# ── Статистик ────────────────────────────────────────────────────────

def mean(values: Sequence[float]) -> float:
    if not values:
        return 0.0
    return sum(values) / len(values)


def population_std_dev(values: Sequence[float]) -> float:
    """STDEV.P — n-д хуваана (STDEV.S шиг n-1 БИШ)."""
    n = len(values)
    if n == 0:
        return 0.0
    mu = mean(values)
    variance = sum((v - mu) ** 2 for v in values) / n
    return math.sqrt(max(0.0, variance))


def coefficient_of_variation(values: Sequence[float]) -> float | None:
    """stdDev / |mean|. Дундаж = 0 бол None."""
    mu = mean(values)
    if mu == 0:
        return None
    return population_std_dev(values) / abs(mu)


# ── Оролт / гаралт ───────────────────────────────────────────────────

@dataclass
class SkuAggregate:
    product_code: str
    product_name: str | None
    sales_value: float
    monthly_qty: list[float] = field(default_factory=list)


@dataclass
class AbcXyzRow:
    product_code: str
    product_name: str | None
    abc: str
    xyz: str
    abc_xyz: str
    sales_value: float
    sales_share: float
    cumulative_share: float
    monthly_qty: list[float]
    average_monthly_qty: float
    std_dev: float
    cv: float | None
    inventory_status: str
    months_with_sales: int
    rank: int


# ── ABC ──────────────────────────────────────────────────────────────

def classify_abc(items: Iterable[tuple[str, float]], a_threshold: float, b_threshold: float):
    """
    (product_code, sales_value) → эрэмбэлсэн ABC үр дүн.

    A: cumulative <= a_threshold
    B: a_threshold < cumulative <= b_threshold
    C: cumulative > b_threshold

    Нийт дүн <= 0 бол бүгд C (тэглэвэл бүгд A болох утгагүй үр дүн гарна).
    """
    if not (0 < a_threshold < b_threshold < 1):
        raise ValueError(
            f"ABC threshold буруу: 0 < A({a_threshold}) < B({b_threshold}) < 1 байх ёстой"
        )

    # Дүнгээр буурахаар, тэнцвэл кодоор өсөхөөр — үр дүн ҮРГЭЛЖ давтагдана
    ordered = sorted(items, key=lambda x: (-x[1], x[0]))
    total = sum(value for _, value in ordered)

    results = []
    if total <= 0:
        for index, (code, value) in enumerate(ordered):
            results.append((code, value, 0.0, 0.0, "C", index + 1))
        return results

    running = 0.0
    last = len(ordered) - 1
    for index, (code, value) in enumerate(ordered):
        share = value / total
        running += share
        cumulative = min(running, 1.0) if index == last else running
        if cumulative <= a_threshold:
            abc = "A"
        elif cumulative <= b_threshold:
            abc = "B"
        else:
            abc = "C"
        results.append((code, value, share, cumulative, abc, index + 1))
    return results


# ── XYZ ──────────────────────────────────────────────────────────────

def classify_one_xyz(monthly_qty: Sequence[float], x_threshold: float, y_threshold: float):
    """
    Буцаах: (average, std_dev, cv, xyz, inventory_status, months_with_sales)

    Дундаж = 0 → cv=None, XYZ='Z', status='NO_MOVEMENT' (Хөдөлгөөнгүй)
    """
    if not (0 < x_threshold < y_threshold):
        raise ValueError(
            f"XYZ threshold буруу: 0 < X({x_threshold}) < Y({y_threshold}) байх ёстой"
        )

    average = mean(monthly_qty)
    std_dev = population_std_dev(monthly_qty)
    months_with_sales = sum(1 for q in monthly_qty if q != 0)

    if average == 0:
        return (0.0, std_dev, None, "Z", "NO_MOVEMENT", months_with_sales)

    cv = std_dev / abs(average)
    if cv <= x_threshold:
        xyz = "X"
    elif cv <= y_threshold:
        xyz = "Y"
    else:
        xyz = "Z"
    return (average, std_dev, cv, xyz, "ACTIVE", months_with_sales)


# ── Нэгтгэсэн engine ─────────────────────────────────────────────────

def run_abc_xyz(
    aggregates: Sequence[SkuAggregate],
    a_threshold: float,
    b_threshold: float,
    x_threshold: float,
    y_threshold: float,
    expected_months: int,
) -> list[AbcXyzRow]:
    for item in aggregates:
        if len(item.monthly_qty) != expected_months:
            raise ValueError(
                f"SKU {item.product_code}: monthly_qty урт {len(item.monthly_qty)}, "
                f"хүлээсэн {expected_months}. Борлуулалтгүй сарыг 0-ээр дүүргэсэн эсэхийг шалгана уу."
            )

    by_code = {a.product_code: a for a in aggregates}
    abc_results = classify_abc(
        [(a.product_code, a.sales_value) for a in aggregates], a_threshold, b_threshold
    )

    rows: list[AbcXyzRow] = []
    for code, value, share, cumulative, abc, rank in abc_results:
        agg = by_code[code]
        average, std_dev, cv, xyz, status, months = classify_one_xyz(
            agg.monthly_qty, x_threshold, y_threshold
        )
        rows.append(
            AbcXyzRow(
                product_code=code,
                product_name=agg.product_name,
                abc=abc,
                xyz=xyz,
                abc_xyz=f"{abc}{xyz}",
                sales_value=value,
                sales_share=share,
                cumulative_share=cumulative,
                monthly_qty=list(agg.monthly_qty),
                average_monthly_qty=average,
                std_dev=std_dev,
                cv=cv,
                inventory_status=status,
                months_with_sales=months,
                rank=rank,
            )
        )
    return rows


def build_matrix(rows: Sequence[AbcXyzRow]) -> list[dict]:
    """9 нүдтэй матрицын нэгтгэл — dashboard-ийн ҮНДСЭН үзүүлэлт."""
    total = sum(r.sales_value for r in rows)
    matrix = []
    for cls in ABC_XYZ_CLASSES:
        cell_rows = [r for r in rows if r.abc_xyz == cls]
        value = sum(r.sales_value for r in cell_rows)
        matrix.append(
            {
                "abcXyz": cls,
                "skuCount": len(cell_rows),
                "salesValue": value,
                "salesShare": (value / total) if total > 0 else 0.0,
            }
        )
    return matrix
