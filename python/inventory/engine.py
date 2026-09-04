"""
INVENTORY OPTIMIZATION ENGINE — ЦЭВЭР ФУНКЦҮҮД (Python тал).

⚠️ `src/analytics/inventory/` ба `src/analytics/recommendation/`-ийн
   TypeScript хувилбарын ТОЛИН ТУСГАЛ. Дүрмүүд нь
   `src/config/inventory-status-rules.json`-оос ирдэг тул хоёр давхаргын
   үр дүн зөрөхгүй.

Томьёо (Phase 4 §3–§13):
    Target Months      = Target Days / daysPerMonth
    Recommended Stock  = Average Monthly Sales × Target Months
    Current Stock Days = (Current Stock / Average Monthly Sales) × daysPerMonth
                         ⚠️ дундаж = 0 бол 0 (§7)
    Shortage           = MAX(Recommended − Current, 0)
    Excess             = MAX(Current − Recommended, 0)
    Transfer Qty       = CEILING(MIN(дутагдал, илүүдэл)), эх үүсвэрээс хэтрэхгүй
    New Purchase       = CEILING(Recommended − Current − TransferIn), <= 0 бол 0
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable, Sequence

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RULES_PATH = PROJECT_ROOT / "src" / "config" / "inventory-status-rules.json"


@lru_cache(maxsize=1)
def load_rules() -> dict[str, Any]:
    with RULES_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


@dataclass
class StatusParams:
    days_per_month: float
    stockout_days_threshold: float
    overstock_factor: float

    @staticmethod
    def defaults() -> "StatusParams":
        params = load_rules()["params"]
        return StatusParams(
            days_per_month=float(params["daysPerMonth"]),
            stockout_days_threshold=float(params["stockoutDaysThreshold"]),
            overstock_factor=float(params["overstockFactor"]),
        )


# ── Тоог бүхэл болгох (§10) ───────────────────────────────────────────

def ceil_qty(value: float) -> int:
    """CEILING. 125.4 → 126. Хөвөгч таслалын чимээг эхлээд цэвэрлэнэ."""
    if not math.isfinite(value):
        return 0
    cleaned = round(value, 9)
    return max(0, math.ceil(cleaned))


def floor_qty(value: float) -> int:
    """Эх үүсвэрийн боломжоос ХЭТРҮҮЛЭХГҮЙ бүхэл тоо."""
    if not math.isfinite(value):
        return 0
    cleaned = round(value, 9)
    return max(0, math.floor(cleaned))


# ── Баланс (§3–§9) ───────────────────────────────────────────────────

@dataclass
class Balance:
    target_days: float
    target_months: float
    recommended_stock: float
    current_stock: float
    current_stock_days: float
    shortage: float
    excess: float


def target_months(target_days: float, days_per_month: float) -> float:
    if days_per_month <= 0:
        raise ValueError(f"days_per_month 0-ээс их байх ёстой: {days_per_month}")
    return target_days / days_per_month


def current_stock_days(current_stock: float, avg_monthly_sales: float, days_per_month: float) -> float:
    """⚠️ §7 — дундаж борлуулалт 0 бол тодорхойлолтоор 0."""
    if avg_monthly_sales == 0:
        return 0.0
    return (current_stock / avg_monthly_sales) * days_per_month


def compute_balance(
    avg_monthly_sales: float,
    current_stock: float,
    target_days: float,
    days_per_month: float,
) -> Balance:
    if target_days < 0:
        raise ValueError(f"target_days сөрөг байж болохгүй: {target_days}")

    months = target_months(target_days, days_per_month)
    recommended = avg_monthly_sales * months

    return Balance(
        target_days=target_days,
        target_months=months,
        recommended_stock=recommended,
        current_stock=current_stock,
        current_stock_days=current_stock_days(current_stock, avg_monthly_sales, days_per_month),
        shortage=max(recommended - current_stock, 0.0),
        excess=max(current_stock - recommended, 0.0),
    )


def new_purchase_qty(recommended: float, current_stock: float, transfer_in: float) -> int:
    """§13 — CEILING(recommended − current − transferIn), <= 0 бол 0."""
    return ceil_qty(recommended - current_stock - transfer_in)


# ── Төлөв (§11) ──────────────────────────────────────────────────────

# ⚠️ ХИЛИЙН ХҮЛЦЭЛ — TypeScript талтай ижил.
#    Нөөцийн хоног нь нийлбэр/хуваалтаас гардаг тул 1e-14 хэмжээний хөвөгч
#    таслалын чимээ агуулж болно. Ийм чимээ ангиллыг ӨӨРЧЛӨХ ёсгүй.
#    Бодит тохиолдол: SKU 0107574 @ 300123 — Postgres 15.0000 (Зохистой) vs
#    float нийлбэр 15.000000000000016 (Удаан эргэлттэй).
EPSILON = 1e-9


def _gt(a: float, b: float) -> bool:
    return a > b + EPSILON


def _lt(a: float, b: float) -> bool:
    return a < b - EPSILON


def _lte(a: float, b: float) -> bool:
    return a <= b + EPSILON


def _gte(a: float, b: float) -> bool:
    return a >= b - EPSILON


def _param(name: str | None, params: StatusParams) -> float:
    if name == "stockoutDaysThreshold":
        return params.stockout_days_threshold
    if name == "overstockFactor":
        return params.overstock_factor
    if name == "daysPerMonth":
        return params.days_per_month
    raise ValueError(f"Тодорхойлогдоогүй дүрмийн параметр: {name}")


def _eval_status(cond_type: str, param: str | None, ctx: dict, params: StatusParams) -> bool:
    avg = ctx["avg_monthly_sales"]
    days = ctx["current_stock_days"]
    target = ctx["target_days"]
    xyz = ctx["xyz"]

    if cond_type == "avgSalesIsZero":
        return avg == 0
    if cond_type == "stockDaysLteThreshold":
        return _lte(days, _param(param, params))
    if cond_type == "stockDaysGtTargetTimesFactor":
        return _gt(days, target * _param(param, params))
    if cond_type == "xyzIsZAndStockDaysGtTarget":
        return xyz == "Z" and _gt(days, target)
    if cond_type == "stockDaysLtTargetAndGtThreshold":
        return _lt(days, target) and _gt(days, _param(param, params))
    if cond_type == "stockDaysBetweenTargetAndFactor":
        return _gte(days, target) and _lte(days, target * _param(param, params))
    raise ValueError(f"Тодорхойлогдоогүй төлөвийн нөхцөл: {cond_type}")


def classify_status(
    avg_monthly_sales: float,
    stock_days: float,
    current_stock: float,
    target_days: float,
    xyz: str,
    params: StatusParams | None = None,
) -> tuple[str, str]:
    """Буцаах: (status_code, label_mn). Эхний таарсан дүрэм ялна."""
    params = params or StatusParams.defaults()
    ctx = {
        "avg_monthly_sales": avg_monthly_sales,
        "current_stock_days": stock_days,
        "current_stock": current_stock,
        "target_days": target_days,
        "xyz": xyz,
    }
    for rule in sorted(load_rules()["statuses"], key=lambda r: r["priority"]):
        if _eval_status(rule["condition"]["type"], rule["condition"].get("param"), ctx, params):
            return rule["code"], rule["labelMn"]
    return "LOW_STOCK", "Нөөц багассан"


def _eval_decision(cond_type: str, ctx: dict) -> bool:
    if cond_type == "noMovementWithStock":
        return ctx["avg_monthly_sales"] == 0 and ctx["current_stock"] > 0
    if cond_type == "overstockOrSlowMoving":
        return ctx["stock_status"] in ("OVERSTOCK", "SLOW_MOVING")
    if cond_type == "hasTransferQty":
        return ctx["transfer_in_qty"] > 0
    if cond_type == "hasPurchaseQty":
        return ctx["new_purchase_qty"] > 0
    if cond_type == "always":
        return True
    raise ValueError(f"Тодорхойлогдоогүй шийдвэрийн нөхцөл: {cond_type}")


def decide(
    avg_monthly_sales: float,
    current_stock: float,
    stock_status: str,
    transfer_in_qty: float,
    purchase_qty: float,
) -> tuple[str, str, str]:
    """Буцаах: (decision_code, label_mn, reason_mn)."""
    ctx = {
        "avg_monthly_sales": avg_monthly_sales,
        "current_stock": current_stock,
        "stock_status": stock_status,
        "transfer_in_qty": transfer_in_qty,
        "new_purchase_qty": purchase_qty,
    }
    for rule in sorted(load_rules()["decisions"], key=lambda r: r["priority"]):
        if _eval_decision(rule["condition"]["type"], ctx):
            return rule["code"], rule["labelMn"], rule["rationaleMn"]
    return "MONITOR", "Хяналтад байлгах", "Дүрэм таараагүй."


# ── Шилжүүлэг (§12, §15) ─────────────────────────────────────────────

@dataclass
class TransferCandidate:
    product_code: str
    location_code: str
    company_code: str | None
    shortage: float
    surplus: float
    unit_cost: float | None
    location_type: str = "WAREHOUSE"
    location_priority: int | None = None


@dataclass
class TransferItem:
    product_code: str
    from_location_code: str
    to_location_code: str
    quantity: int
    priority_rank: int
    tier_code: str
    tier_label_mn: str
    reason_mn: str
    estimated_value: float | None


def _sort_key(candidate: TransferCandidate, metric: str):
    value = getattr(candidate, metric)
    priority = candidate.location_priority if candidate.location_priority is not None else 10**9
    return (-value, priority, candidate.location_code)


def default_transfer_tiers() -> list[dict]:
    """⭐ Давуу эрхийн шатлал — `inventory-status-rules.json`-оос."""
    return [t for t in load_rules()["transferPreference"]["tiers"] if t.get("enabled", True)]


def _matches_tier(
    tier: dict,
    source: TransferCandidate,
    destination: TransferCandidate,
    allow_cross_company: bool,
) -> bool:
    same_company = (
        source.company_code is not None
        and destination.company_code is not None
        and source.company_code == destination.company_code
    )
    # ⚠️ Глобал хамгаалалт — хориглосон бол ямар ч шатанд өөр ХХК хооронд явахгүй
    if not allow_cross_company and not same_company:
        return False

    scope = tier["companyScope"]
    if scope == "SAME" and not same_company:
        return False
    if scope == "DIFFERENT" and same_company:
        return False

    if tier.get("bothWarehouse"):
        return source.location_type == "WAREHOUSE" and destination.location_type == "WAREHOUSE"
    return True


def plan_transfers_for_sku(
    candidates: Sequence[TransferCandidate],
    allow_cross_company: bool = True,
    tiers: list[dict] | None = None,
) -> list[TransferItem]:
    """
    ⭐ ШАТЛАЛТ ДАВУУ ЭРХ:
        1. Нэг ХХК-ийн АГУУЛАХ хооронд   ← эхний сонголт
        2. Нэг ХХК дотор (эмийн сан оролцоно)
        3. Өөр ХХК хооронд               ← зөвшөөрсөн үед л

    Дутагдлыг эхний шатнаас эхлэн нөхнө; шат бүрийг БҮРЭН дуусгаад дараагийнх руу.
    """
    tiers = tiers if tiers is not None else default_transfer_tiers()
    # Cross-company хориглосон үед DIFFERENT шат бүхэлдээ утгагүй
    tiers = [t for t in tiers if allow_cross_company or t["companyScope"] != "DIFFERENT"]

    destinations = sorted([c for c in candidates if c.shortage > 0], key=lambda c: _sort_key(c, "shortage"))
    sources = sorted([c for c in candidates if c.surplus > 0], key=lambda c: _sort_key(c, "surplus"))

    if not destinations or not sources or not tiers:
        return []

    remaining_shortage = {d.location_code: d.shortage for d in destinations}
    remaining_surplus = {s.location_code: s.surplus for s in sources}

    items: list[TransferItem] = []
    rank = 0

    for tier in tiers:
        for destination in destinations:
            for source in sources:
                if source.location_code == destination.location_code:
                    continue
                if not _matches_tier(tier, source, destination, allow_cross_company):
                    continue

                need = remaining_shortage.get(destination.location_code, 0.0)
                available = remaining_surplus.get(source.location_code, 0.0)
                if need <= 0:
                    break
                if available <= 0:
                    continue

                quantity = ceil_qty(min(need, available))
                # ⚠️ CEILING нь эх үүсвэрийн илүүдлээс давбал FLOOR руу буулгана
                if quantity > available:
                    quantity = floor_qty(available)
                if quantity <= 0:
                    continue

                rank += 1
                unit_cost = destination.unit_cost if destination.unit_cost is not None else source.unit_cost
                items.append(
                    TransferItem(
                        product_code=destination.product_code,
                        from_location_code=source.location_code,
                        to_location_code=destination.location_code,
                        quantity=quantity,
                        priority_rank=rank,
                        tier_code=tier["code"],
                        tier_label_mn=tier["labelMn"],
                        reason_mn=(
                            f"{tier['labelMn']}: {source.location_code} дээр {available:.2f} илүүдэл, "
                            f"{destination.location_code} дээр {need:.2f} дутагдал"
                        ),
                        estimated_value=(quantity * unit_cost) if unit_cost is not None else None,
                    )
                )

                remaining_shortage[destination.location_code] = max(0.0, need - quantity)
                remaining_surplus[source.location_code] = max(0.0, available - quantity)

    return items


# ── Бүрэн optimizer ──────────────────────────────────────────────────

@dataclass
class Position:
    product_code: str
    product_name: str | None
    location_code: str
    location_type: str
    channel_code: str | None
    company_code: str | None
    abc: str
    xyz: str
    abc_xyz: str
    average_monthly_sales: float
    current_stock: float
    current_stock_value: float
    unit_cost: float | None
    # ── Байрлал тус бүрийн борлуулалт (шүүлттэй KPI-д хэрэгтэй) ──
    sales_qty: float = 0.0
    sales_value: float = 0.0
    #: Үйлдвэрлэгч — эх өгөгдлийн `Manufacturer` баганаас
    manufacturer: str | None = None
    #: Борлуулалтын ОРЛОГО (НӨАТ-гүй). Багана байхгүй бол None —
    #: ямар ч тоо зохиохгүй, ашгийн үзүүлэлт N/A хэвээр үлдэнэ.
    net_sales_amount: float | None = None


@dataclass
class DecisionRow:
    position: Position
    balance: Balance
    stock_status: str
    stock_status_label: str
    transfer_in_qty: int
    transfer_out_qty: int
    new_purchase_qty: int
    decision: str
    decision_label: str
    shortage_value: float | None
    excess_value: float | None


@dataclass
class OptimizerResult:
    rows: list[DecisionRow] = field(default_factory=list)
    transfers: list[TransferItem] = field(default_factory=list)
    summary: dict = field(default_factory=dict)


def _tier_totals(transfers: list[TransferItem]) -> dict[str, int]:
    """Шат тус бүрийн шилжүүлсэн нийт тоо."""
    totals: dict[str, int] = {}
    for t in transfers:
        totals[t.tier_code] = totals.get(t.tier_code, 0) + t.quantity
    return totals


def optimize(
    positions: Iterable[Position],
    resolve_target_days,
    params: StatusParams | None = None,
    allow_cross_company: bool = True,
) -> OptimizerResult:
    params = params or StatusParams.defaults()
    positions = list(positions)

    balances = []
    for position in positions:
        target = resolve_target_days(position.location_type, position.abc, position.xyz)
        balances.append(
            (
                position,
                compute_balance(
                    position.average_monthly_sales,
                    position.current_stock,
                    target,
                    params.days_per_month,
                ),
            )
        )

    by_sku: dict[str, list[TransferCandidate]] = {}
    for position, balance in balances:
        by_sku.setdefault(position.product_code, []).append(
            TransferCandidate(
                product_code=position.product_code,
                location_code=position.location_code,
                company_code=position.company_code,
                location_type=position.location_type,
                shortage=balance.shortage,
                surplus=balance.excess,
                unit_cost=position.unit_cost,
            )
        )

    transfers: list[TransferItem] = []
    for candidates in by_sku.values():
        transfers.extend(plan_transfers_for_sku(candidates, allow_cross_company))

    in_by: dict[tuple[str, str], int] = {}
    out_by: dict[tuple[str, str], int] = {}
    for item in transfers:
        in_by[(item.product_code, item.to_location_code)] = (
            in_by.get((item.product_code, item.to_location_code), 0) + item.quantity
        )
        out_by[(item.product_code, item.from_location_code)] = (
            out_by.get((item.product_code, item.from_location_code), 0) + item.quantity
        )

    rows: list[DecisionRow] = []
    by_status: dict[str, int] = {}
    by_decision: dict[str, int] = {}
    total_shortage = total_excess = total_purchase = 0.0

    for position, balance in balances:
        key = (position.product_code, position.location_code)
        transfer_in = in_by.get(key, 0)
        transfer_out = out_by.get(key, 0)

        purchase = new_purchase_qty(balance.recommended_stock, balance.current_stock, transfer_in)

        status, status_label = classify_status(
            position.average_monthly_sales,
            balance.current_stock_days,
            balance.current_stock,
            balance.target_days,
            position.xyz,
            params,
        )

        decision, decision_label, _ = decide(
            position.average_monthly_sales,
            balance.current_stock,
            status,
            transfer_in,
            0 if status in ("OVERSTOCK", "SLOW_MOVING") else purchase,
        )

        effective_purchase = 0 if decision in ("STOP_PURCHASE", "PROMOTION") else purchase

        by_status[status] = by_status.get(status, 0) + 1
        by_decision[decision] = by_decision.get(decision, 0) + 1
        total_shortage += balance.shortage
        total_excess += balance.excess
        total_purchase += effective_purchase

        rows.append(
            DecisionRow(
                position=position,
                balance=balance,
                stock_status=status,
                stock_status_label=status_label,
                transfer_in_qty=transfer_in,
                transfer_out_qty=transfer_out,
                new_purchase_qty=effective_purchase,
                decision=decision,
                decision_label=decision_label,
                shortage_value=(balance.shortage * position.unit_cost)
                if position.unit_cost is not None
                else None,
                excess_value=(balance.excess * position.unit_cost)
                if position.unit_cost is not None
                else None,
            )
        )

    return OptimizerResult(
        rows=rows,
        transfers=transfers,
        summary={
            "positions": len(rows),
            "skus": len(by_sku),
            "locations": len({p.location_code for p in positions}),
            "totalShortage": total_shortage,
            "totalExcess": total_excess,
            "totalTransferQty": sum(t.quantity for t in transfers),
            "totalPurchaseQty": total_purchase,
            "byStatus": by_status,
            "byDecision": by_decision,
            "transferByTier": _tier_totals(transfers),
        },
    )
