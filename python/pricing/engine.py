"""
PURCHASE PRICE CONTROL + MARGIN + SALES TREND + AI ENGINE (Python тал).

⚠️ `src/analytics/pricing/`, `src/analytics/trend/`,
   `src/analytics/recommendation/ai-rule-engine.ts`-ийн ТОЛИН ТУСГАЛ.
   Дүрмүүд `src/config/price-control-rules.json`-оос ирдэг тул хоёр давхаргын
   үр дүн зөрөхгүй.

Гол анхааруулгууд:
  • Огноо байхгүй → "сүүлийн худалдан авалт" = сүүлийн САР, тухайн сарын
    ЖИГНЭСЭН ДУНДАЖ үнэ.
  • Тэг нэгж үнэ benchmark-д ОРОХГҮЙ (эс тэгвэл gap% хязгааргүй болно).
  • Борлуулалтын ОРЛОГО эх өгөгдөлд байхгүй → gross profit/margin = None.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable, Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RULES_PATH = PROJECT_ROOT / "src" / "config" / "price-control-rules.json"


@lru_cache(maxsize=1)
def load_rules() -> dict[str, Any]:
    with RULES_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


def params() -> dict[str, Any]:
    return load_rules()["params"]


REVENUE_MISSING_REASON = (
    "Борлуулалтын орлогын багана эх өгөгдөлд байхгүй (Sales.Өртөг нь COGS). "
    "Орлогын өгөгдөл ачаалагдсаны дараа ашиг ба маржин автоматаар тооцогдоно."
)


# ── §1–§6: Үнийн benchmark ───────────────────────────────────────────

@dataclass
class PurchaseLine:
    product_code: str
    dimension_key: str
    period_key: str
    quantity: float
    amount: float


@dataclass
class PricePoint:
    dimension_key: str
    last_purchase_period: str
    quantity: float
    amount: float
    unit_price: float
    lowest_rank: int = 0
    highest_rank: int = 0


@dataclass
class PriceBenchmark:
    product_code: str
    product_name: str | None
    dimension: str
    source_count: int = 0
    points: list[PricePoint] = field(default_factory=list)
    lowest_top: list[PricePoint] = field(default_factory=list)
    highest_top: list[PricePoint] = field(default_factory=list)
    min_unit_price: float | None = None
    max_unit_price: float | None = None
    min_source_key: str | None = None
    max_source_key: str | None = None
    price_gap: float | None = None
    price_gap_pct: float | None = None
    gap_severity: str | None = None
    total_quantity: float = 0.0
    total_cost: float = 0.0
    weighted_avg_unit_price: float | None = None
    # §6 — эх сурвалж бүрийн СҮҮЛИЙН худалдан авалтын нийлбэр
    current_quantity: float = 0.0
    current_cost: float = 0.0
    potential_saving: float | None = None
    first_period: str | None = None
    last_period: str | None = None
    first_unit_price: float | None = None
    last_unit_price: float | None = None
    price_change_pct: float | None = None
    price_increase_severity: str | None = None
    excluded_reason: str | None = None


def gap_severity_of(gap_pct: float | None) -> str | None:
    if gap_pct is None:
        return None
    for level in load_rules()["gapSeverity"]:
        if gap_pct >= level["minGapPct"]:
            return level["code"]
    return None


def price_increase_severity_of(change_pct: float | None) -> str | None:
    if change_pct is None:
        return None
    for level in load_rules()["priceIncreaseSeverity"]:
        if change_pct >= level["minIncreasePct"]:
            return level["code"]
    return None


def _usable(line: PurchaseLine) -> bool:
    p = params()
    if p["excludeReturns"] and line.quantity <= 0:
        return False
    if line.quantity == 0:
        return False
    unit = line.amount / line.quantity
    return unit >= p["minValidUnitPrice"]


def build_benchmark(
    product_code: str,
    product_name: str | None,
    lines: Sequence[PurchaseLine],
    dimension: str | None = None,
) -> PriceBenchmark:
    dimension = dimension or load_rules()["priceDimension"]
    p = params()

    total_quantity = sum(l.quantity for l in lines)
    total_cost = sum(l.amount for l in lines)

    bench = PriceBenchmark(
        product_code=product_code,
        product_name=product_name,
        dimension=dimension,
        total_quantity=total_quantity,
        total_cost=total_cost,
        weighted_avg_unit_price=(total_cost / total_quantity) if total_quantity > 0 else None,
    )

    usable = [l for l in lines if _usable(l)]
    if not usable:
        bench.excluded_reason = (
            "Утга учиртай нэгж үнэтэй худалдан авалтын мөр олдсонгүй "
            "(тэг тоо/дүн эсвэл буцаалт)."
        )
        return bench

    # Эх сурвалж × сар нэгтгэл
    buckets: dict[str, dict[str, dict[str, float]]] = {}
    for line in usable:
        per = buckets.setdefault(line.dimension_key, {})
        entry = per.setdefault(line.period_key, {"quantity": 0.0, "amount": 0.0})
        entry["quantity"] += line.quantity
        entry["amount"] += line.amount

    points: list[PricePoint] = []
    for key, periods in buckets.items():
        last = max(periods)
        entry = periods[last]
        if entry["quantity"] <= 0:
            continue
        unit = entry["amount"] / entry["quantity"]
        if unit < p["minValidUnitPrice"]:
            continue
        points.append(
            PricePoint(
                dimension_key=key,
                last_purchase_period=last,
                quantity=entry["quantity"],
                amount=entry["amount"],
                unit_price=unit,
            )
        )

    if not points:
        bench.excluded_reason = "Сүүлийн сарын нэгж үнэ тодорхойлогдсонгүй."
        return bench

    by_lowest = sorted(points, key=lambda x: (x.unit_price, x.dimension_key))
    for i, point in enumerate(by_lowest):
        point.lowest_rank = i + 1
    by_highest = sorted(points, key=lambda x: (-x.unit_price, x.dimension_key))
    for i, point in enumerate(by_highest):
        point.highest_rank = i + 1

    min_point, max_point = by_lowest[0], by_highest[0]
    gap = max_point.unit_price - min_point.unit_price
    gap_pct = (gap / min_point.unit_price * 100) if min_point.unit_price > 0 else None

    # ⚠️ §6 — ХУГАЦААНЫ СУУРЬ ИЖИЛ БАЙХ ЁСТОЙ.
    #    min_unit_price нь эх сурвалж бүрийн СҮҮЛИЙН үнэ (§2) тул
    #    харьцуулах "одоогийн худалдан авалт" нь мөн тэр сүүлийн
    #    худалдан авалтуудын нийлбэр байна. Цонхны бүх сартай харьцуулбал
    #    сөрөг эсвэл хуурамч хэмнэлт гарна.
    current_qty = sum(p.quantity for p in points)
    current_cost = sum(p.amount for p in points)

    period_totals: dict[str, dict[str, float]] = {}
    for line in usable:
        entry = period_totals.setdefault(line.period_key, {"quantity": 0.0, "amount": 0.0})
        entry["quantity"] += line.quantity
        entry["amount"] += line.amount

    sorted_periods = sorted(period_totals)
    first_period, last_period = sorted_periods[0], sorted_periods[-1]
    first_unit = last_unit = change_pct = None
    if first_period != last_period:
        f, l = period_totals[first_period], period_totals[last_period]
        if f["quantity"] > 0 and l["quantity"] > 0:
            first_unit = f["amount"] / f["quantity"]
            last_unit = l["amount"] / l["quantity"]
            if first_unit >= p["minValidUnitPrice"]:
                change_pct = (last_unit - first_unit) / first_unit * 100

    top_n = p["topN"]
    bench.source_count = len(points)
    bench.points = by_lowest
    bench.lowest_top = by_lowest[:top_n]
    bench.highest_top = by_highest[:top_n]
    bench.min_unit_price = min_point.unit_price
    bench.max_unit_price = max_point.unit_price
    bench.min_source_key = min_point.dimension_key
    bench.max_source_key = max_point.dimension_key
    bench.price_gap = gap
    bench.price_gap_pct = gap_pct
    bench.gap_severity = gap_severity_of(gap_pct)
    bench.current_quantity = current_qty
    bench.current_cost = current_cost
    bench.potential_saving = max(0.0, current_cost - current_qty * min_point.unit_price)
    bench.first_period = first_period
    bench.last_period = last_period
    bench.first_unit_price = first_unit
    bench.last_unit_price = last_unit
    bench.price_change_pct = change_pct
    bench.price_increase_severity = price_increase_severity_of(change_pct)
    return bench


# ── §7, §8: Маржин ба эрсдэл ─────────────────────────────────────────

def compute_margin(sales_amount: float | None, sales_cost: float | None):
    """Буцаах: (gross_profit, gross_margin_pct, unavailable_reason)"""
    if sales_amount is None:
        return None, None, REVENUE_MISSING_REASON
    if sales_cost is None:
        return None, None, "Борлуулсан барааны өртөг тодорхойлогдоогүй."
    profit = sales_amount - sales_cost
    margin = (profit / sales_amount * 100) if sales_amount != 0 else None
    reason = None if margin is not None else "Борлуулалтын орлого тэг тул маржин тодорхойлогдохгүй."
    return profit, margin, reason


def assess_margin_risk(gap_pct: float | None, change_pct: float | None, potential_saving: float | None):
    """Буцаах: (is_at_risk, reasons, estimated_impact)"""
    rules = load_rules()["marginRisk"]
    reasons: list[str] = []
    if gap_pct is not None and gap_pct >= rules["requiresGapPct"]:
        reasons.append(
            f"Эх сурвалж хоорондын үнийн зөрүү {gap_pct:.1f}% (босго {rules['requiresGapPct']}%)"
        )
    if change_pct is not None and change_pct >= rules["requiresPriceIncreasePct"]:
        reasons.append(
            f"Нэгж өртөг {change_pct:.1f}% өссөн (босго {rules['requiresPriceIncreasePct']}%)"
        )
    return bool(reasons), reasons, potential_saving


# ── Sales trend ──────────────────────────────────────────────────────

TREND_LABELS = {
    "GROWING": "Өсөж байна",
    "STABLE": "Тогтвортой",
    "DECLINING": "Буурч байна",
    "NEW": "Шинээр эхэлсэн",
    "NO_SALES": "Борлуулалтгүй",
}


def compute_sales_trend(monthly_qty: Sequence[float], split_months: int | None = None):
    """Буцаах: (trend, trend_pct, recent_avg, previous_avg)"""
    p = params()
    split_months = split_months or p["salesTrendSplitMonths"]
    n = len(monthly_qty)

    if n < 2:
        total = sum(monthly_qty)
        return ("NO_SALES" if total == 0 else "STABLE"), None, float(total), 0.0

    split = min(split_months, n // 2)
    recent = list(monthly_qty[n - split:])
    previous = list(monthly_qty[max(0, n - 2 * split): n - split])

    recent_avg = sum(recent) / len(recent)
    previous_avg = (sum(previous) / len(previous)) if previous else 0.0

    if recent_avg == 0 and previous_avg == 0:
        return "NO_SALES", None, recent_avg, previous_avg
    if previous_avg == 0:
        return "NEW", None, recent_avg, previous_avg

    pct = (recent_avg - previous_avg) / abs(previous_avg) * 100
    if pct >= p["salesTrendGrowingPct"]:
        trend = "GROWING"
    elif pct <= p["salesTrendDecliningPct"]:
        trend = "DECLINING"
    else:
        trend = "STABLE"
    return trend, pct, recent_avg, previous_avg


# ── §9–§11: AI engine ────────────────────────────────────────────────

def _eval_ai(cond_type: str, ctx: dict) -> bool:
    risk = load_rules()["marginRisk"]
    if cond_type == "stockoutOnHighValue":
        return ctx["stock_status"] == "STOCKOUT_RISK" and ctx["abc"] == "A"
    if cond_type == "stockoutRisk":
        return ctx["stock_status"] in ("STOCKOUT_RISK", "LOW_STOCK")
    if cond_type == "deadStockWithValue":
        return ctx["stock_status"] == "NO_MOVEMENT" and ctx["current_stock"] > 0
    if cond_type == "highPriceGap":
        return ctx["price_gap_pct"] is not None and ctx["price_gap_pct"] >= risk["requiresGapPct"]
    if cond_type == "priceIncrease":
        return (
            ctx["price_change_pct"] is not None
            and ctx["price_change_pct"] >= risk["requiresPriceIncreasePct"]
        )
    if cond_type == "overstock":
        return ctx["stock_status"] == "OVERSTOCK"
    if cond_type == "slowMoving":
        return ctx["stock_status"] == "SLOW_MOVING"
    if cond_type == "salesDeclining":
        return ctx["sales_trend"] == "DECLINING"
    if cond_type == "always":
        return True
    raise ValueError(f"Тодорхойлогдоогүй AI дүрмийн нөхцөл: {cond_type}")


def _fmt(value: float) -> str:
    return f"{value:,.1f}"


def _build_reason(rule: dict, ctx: dict) -> str:
    """Дүрмийн ерөнхий тайлбарыг тухайн мөрийн БОДИТ тоогоор баяжуулна."""
    parts = [rule["whyMn"]]
    code = rule["code"]
    loc = ctx.get("location_code", "")

    if code in ("STOCKOUT_CRITICAL", "STOCKOUT_RISK"):
        parts.append(
            f"{loc}: одоогийн нөөц {_fmt(ctx['current_stock'])} ш = "
            f"{_fmt(ctx.get('current_stock_days', 0.0))} хоног "
            f"(зорилт {ctx.get('target_days', 0)} хоног), "
            f"дутагдал {_fmt(ctx['shortage'])} ш."
        )
    elif code == "DEAD_STOCK":
        parts.append(
            f"{loc}: {_fmt(ctx['current_stock'])} ш үлдэгдэлтэй атлаа "
            "сүүлийн хугацаанд дундаж борлуулалт 0."
        )
    elif code == "PRICE_GAP_HIGH" and ctx.get("price_gap_pct") is not None:
        parts.append(
            f"Нэгж үнэ {_fmt(ctx.get('min_unit_price') or 0)} … "
            f"{_fmt(ctx.get('max_unit_price') or 0)} "
            f"(зөрүү {ctx['price_gap_pct']:.1f}%). Хамгийн хямд эх сурвалж: "
            f"{ctx.get('min_source_key') or '—'}."
        )
    elif code == "PRICE_INCREASE" and ctx.get("price_change_pct") is not None:
        parts.append(f"Нэгж өртөг {ctx['price_change_pct']:.1f}% өссөн.")
    elif code in ("OVERSTOCK", "SLOW_MOVING"):
        parts.append(
            f"{loc}: {_fmt(ctx.get('current_stock_days', 0.0))} хоногийн нөөц "
            f"(зорилт {ctx.get('target_days', 0)} хоног), "
            f"илүүдэл {_fmt(ctx.get('excess', 0.0))} ш."
        )
    elif code == "SALES_DECLINING" and ctx.get("sales_trend_pct") is not None:
        parts.append(f"Сүүлийн үеийн борлуулалт {ctx['sales_trend_pct']:.1f}% өөрчлөгдсөн.")

    return " ".join(parts)


def _build_impact(rule: dict, ctx: dict) -> str:
    """Мөнгөн нөлөөллийг БОДИТ тоогоор. Байхгүй бол чанарын тайлбар."""
    parts = [rule["impactMn"]]
    code = rule["code"]

    if code in ("PRICE_GAP_HIGH", "PRICE_INCREASE"):
        saving = ctx.get("potential_saving")
        if saving is not None and saving > 0:
            parts.append(f"Хамгийн бага үнээр авсан бол {_fmt(saving)} ₮ хэмнэгдэх байсан.")
        # ⚠️ Маржины бодит хувийг ХЭЛЭХГҮЙ — орлогын өгөгдөл байхгүй
        reason = ctx.get("margin_unavailable_reason")
        if reason:
            parts.append(f"(Ашгийн маржин тооцогдохгүй: {reason})")

    if code in ("STOCKOUT_CRITICAL", "STOCKOUT_RISK"):
        value = ctx.get("shortage_value")
        if value is not None and value > 0:
            parts.append(f"Дутагдлын өртгийн дүн {_fmt(value)} ₮.")

    if code in ("OVERSTOCK", "SLOW_MOVING", "DEAD_STOCK"):
        value = ctx.get("excess_value")
        if value is not None and value > 0:
            parts.append(f"Боогдсон хөрөнгө {_fmt(value)} ₮.")

    return " ".join(parts)


def _build_action(rule: dict, ctx: dict, transfer_possible: bool, purchase_required: bool) -> str:
    parts = [rule["actionMn"]]

    if transfer_possible and ctx["transfer_in_qty"] > 0:
        parts.append(f"Шилжүүлэх тоо: {_fmt(ctx['transfer_in_qty'])} ш.")
    elif purchase_required:
        parts.append(f"Худалдан авах тоо: {_fmt(ctx['new_purchase_qty'])} ш.")

    if rule["code"] in ("PRICE_GAP_HIGH", "PRICE_INCREASE") and ctx.get("min_source_key"):
        parts.append(
            f"Benchmark: {ctx['min_source_key']} эх сурвалжийн "
            f"{_fmt(ctx.get('min_unit_price') or 0)} ₮ нэгж үнэ."
        )

    return " ".join(parts)


def recommend(ctx: dict) -> dict:
    """
    §9-ийн JSON бүтэц буцаана.

    ⚠️ recommended_quantity нь Phase 4-ийн бодсон тоо — ЭНД ДАХИН ТООЦООЛОХГҮЙ.
    """
    rules = sorted(load_rules()["aiRules"], key=lambda r: r["priority"])
    rule = next((r for r in rules if _eval_ai(r["condition"]["type"], ctx)), None)
    if rule is None:
        raise ValueError("AI дүрэм таарсангүй — `always` нөхцөлтэй дүрэм байх ёстой.")

    stop_purchase = ctx["decision"] == "STOP_PURCHASE"
    transfer_possible = ctx["transfer_in_qty"] > 0 or (
        ctx["shortage"] > 0 and ctx.get("transfer_available", False)
    )
    purchase_required = ctx["new_purchase_qty"] > 0

    quantity = 0
    if ctx["transfer_in_qty"] > 0:
        quantity = ctx["transfer_in_qty"]
    elif ctx["new_purchase_qty"] > 0:
        quantity = ctx["new_purchase_qty"]

    return {
        "rule_code": rule["code"],
        "risk": rule["risk"],
        "priority": rule["aiPriority"],
        "reason": _build_reason(rule, ctx),
        "impact": _build_impact(rule, ctx),
        "recommended_action": _build_action(rule, ctx, transfer_possible, purchase_required),
        "transfer_possible": transfer_possible,
        "purchase_required": purchase_required,
        "stop_purchase": stop_purchase,
        "recommended_quantity": quantity,
    }


PRIORITY_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
