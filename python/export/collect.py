"""
Excel export-д зориулж бүх фазын үр дүнг цуглуулна.

⚠️ Тооцоолол ЭНД ХИЙГДЭХГҮЙ — зөвхөн өмнөх фазуудын engine-үүдийг дуудаж,
   гаралтыг нэг бүтэц болгож цэгцэлнэ.
"""

from __future__ import annotations

import json
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
    PRIORITY_ORDER,
    REVENUE_MISSING_REASON,
    assess_margin_risk,
    build_benchmark,
    compute_sales_trend,
    load_rules,
    recommend,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]

STATUS_LABEL = {
    "STOCKOUT_RISK": "Нөөц дуусах эрсдэлтэй",
    "LOW_STOCK": "Нөөц багассан",
    "OVERSTOCK": "Хэт их нөөцтэй",
    "NO_MOVEMENT": "Хөдөлгөөнгүй",
    "SLOW_MOVING": "Удаан эргэлттэй",
    "OPTIMAL": "Зохистой",
}

RECOMMENDATION_BY_STATUS = {
    "NO_MOVEMENT": "Худалдан авалт зогсоох + борлуулалт идэвхжүүлэх / шилжүүлэх",
}


def _period_index(periods: list[str]) -> dict[str, int]:
    return {p: i for i, p in enumerate(periods)}


def collect(excel: Path, scope: str = "ALL") -> dict:
    settings = Settings()
    periods = lookback_periods(settings.calculation_month, settings.lookback_months)
    params = StatusParams.defaults()
    rules = load_rules()

    _policy_table = {
        (r["locationType"], r["abcClass"], r["xyzClass"]): r["targetDays"]
        for r in json.loads(
            (PROJECT_ROOT / "src/config/analysis-defaults.json").read_text(encoding="utf-8")
        )["inventoryPolicy"]
    }

    def policy(location_type: str, abc: str, xyz: str) -> int:
        """«Эм ханган нийлүүлэх төв БОЛОН БУСАД» — PHARMACY биш төрөл WAREHOUSE-ийг өвлөнө."""
        hit = _policy_table.get((location_type, abc, xyz))
        if hit is not None:
            return hit
        if location_type != "PHARMACY":
            hit = _policy_table.get(("WAREHOUSE", abc, xyz))
            if hit is not None:
                return hit
        raise KeyError(f"InventoryPolicy олдсонгүй: {location_type}/{abc}{xyz}")

    # ── Data quality (Phase 2) ──
    ingest_report = run_ingest(excel, max_issue_rows=0)

    # ── ABC-XYZ (Phase 3) ──
    aggregates, _ = aggregate_from_excel(excel, periods, settings.calculation_month, scope)
    abc_rows = run_abc_xyz(aggregates, settings.abc_a, settings.abc_b,
                           settings.xyz_x, settings.xyz_y, len(periods))
    matrix_base = build_matrix(abc_rows)
    abc_by_code = {r.product_code: r for r in abc_rows}
    name_by_code = {r.product_code: r.product_name for r in abc_rows}

    # ── Нөөц (Phase 4) ──
    positions, _ = build_positions(excel, periods, settings.calculation_month,
                                   settings.abc_a, settings.abc_b,
                                   settings.xyz_x, settings.xyz_y, scope)
    inv = optimize(positions, policy, params)

    # ── Үнэ (Phase 5) ──
    lines_by_product, _, _ = build_purchase_lines(excel, periods, rules["priceDimension"])
    benchmarks = [build_benchmark(c, name_by_code.get(c), l, rules["priceDimension"])
                  for c, l in lines_by_product.items()]
    bench_by_code = {b.product_code: b for b in benchmarks}

    margin_risk_codes: set[str] = set()
    margin_risk_reasons: dict[str, list[str]] = {}
    for b in benchmarks:
        at_risk, reasons, _ = assess_margin_risk(b.price_gap_pct, b.price_change_pct,
                                                 b.potential_saving)
        if at_risk:
            margin_risk_codes.add(b.product_code)
            margin_risk_reasons[b.product_code] = reasons

    # ── AI (Phase 5) ──
    monthly_by_sku = build_monthly_sales_by_sku(excel, periods)
    surplus_by_sku: dict[str, float] = {}
    for r in inv.rows:
        if r.balance.excess > 0:
            surplus_by_sku[r.position.product_code] = \
                surplus_by_sku.get(r.position.product_code, 0.0) + r.balance.excess

    recs = []
    for r in inv.rows:
        code = r.position.product_code
        b = bench_by_code.get(code)
        trend, trend_pct, _, _ = compute_sales_trend(
            monthly_by_sku.get(code, [0.0] * len(periods)))
        rec = recommend({
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
        })
        rec.update(product_code=code, product_name=r.position.product_name,
                   location_code=r.position.location_code,
                   abc_xyz=r.position.abc_xyz,
                   shortage_value=r.shortage_value, excess_value=r.excess_value)
        recs.append(rec)

    recs.sort(key=lambda x: (PRIORITY_ORDER[x["priority"]],
                             -((x["shortage_value"] or 0) + (x["excess_value"] or 0))))

    # ── Матрицыг нөөцийн тоогоор баяжуулах ──
    by_class: dict[str, dict] = {c["abcXyz"]: {**c, "salesQty": 0.0, "currentStock": 0.0,
                                               "recommendedStock": 0.0, "riskCount": 0}
                                 for c in matrix_base}
    for r in abc_rows:
        cell = by_class.get(r.abc_xyz)
        if cell:
            cell["salesQty"] += sum(r.monthly_qty)
    risky = {"STOCKOUT_RISK", "LOW_STOCK", "NO_MOVEMENT", "OVERSTOCK", "SLOW_MOVING"}
    for r in inv.rows:
        cell = by_class.get(r.position.abc_xyz)
        if cell:
            cell["currentStock"] += r.balance.current_stock
            cell["recommendedStock"] += r.balance.recommended_stock
            if r.stock_status in risky:
                cell["riskCount"] += 1
    matrix = [by_class[c["abcXyz"]] for c in matrix_base]

    # ── Нөөцийн тэнцвэрийн хураангуй ──
    total_positions = len(inv.rows) or 1
    balance_summary = []
    for code, label in STATUS_LABEL.items():
        rows = [r for r in inv.rows if r.stock_status == code]
        balance_summary.append({
            "code": code,
            "labelMn": label,
            "count": len(rows),
            "share": len(rows) / total_positions,
            "quantity": sum(r.balance.current_stock for r in rows),
            "value": sum(r.position.current_stock_value for r in rows),
        })
    balance_summary.sort(key=lambda x: -x["count"])

    # ── Эрсдэлтэй мөрүүд ──
    rec_by_key = {(r["product_code"], r["location_code"]): r for r in recs}
    risk_rows = []
    for r in inv.rows:
        key = (r.position.product_code, r.position.location_code)
        rec = rec_by_key.get(key)
        if rec is None or rec["priority"] not in ("CRITICAL", "HIGH"):
            continue
        risk_rows.append({
            "priority": rec["priority"],
            "productCode": r.position.product_code,
            "productName": r.position.product_name,
            "abcXyz": r.position.abc_xyz,
            "locationCode": r.position.location_code,
            "currentStock": r.balance.current_stock,
            "stockDays": r.balance.current_stock_days,
            "targetDays": r.balance.target_days,
            "shortage": r.balance.shortage,
            "shortageValue": r.shortage_value,
            "risk": rec["risk"],
            "action": rec["recommended_action"],
        })
    risk_rows.sort(key=lambda x: (PRIORITY_ORDER[x["priority"]], -(x["shortageValue"] or 0)))

    # ── Хөдөлгөөнгүй ──
    idx = _period_index(periods)
    last_sale_period: dict[str, str] = {}
    for code, qty in monthly_by_sku.items():
        for p, q in zip(periods, qty):
            if q != 0:
                last_sale_period[code] = p
    last_purchase_period: dict[str, str] = {}
    for code, lines in lines_by_product.items():
        valid = [l.period_key for l in lines if l.quantity > 0]
        if valid:
            last_purchase_period[code] = max(valid)

    stagnant_rows = []
    for r in inv.rows:
        if r.stock_status != "NO_MOVEMENT" or r.balance.current_stock <= 0:
            continue
        code = r.position.product_code
        last_sale = last_sale_period.get(code)
        months_since = (len(periods) - idx[last_sale]) if last_sale else None
        stagnant_rows.append({
            "productCode": code,
            "productName": r.position.product_name,
            "locationCode": r.position.location_code,
            "currentStock": r.balance.current_stock,
            "stockValue": r.position.current_stock_value,
            # ⚠️ Огнооны оронд САР — эх өгөгдөлд өдөр байхгүй
            "lastSalesPeriod": last_sale,
            "monthsSinceLastSale": months_since,
            "lastPurchasePeriod": last_purchase_period.get(code),
            "recommendation": RECOMMENDATION_BY_STATUS["NO_MOVEMENT"],
        })
    stagnant_rows.sort(key=lambda x: -x["stockValue"])

    # ── Чанарын хураангуй ──
    rule_msgs = {r["code"]: r["messageMn"] for r in json.loads(
        (PROJECT_ROOT / "src/config/validation-rules.json").read_text(encoding="utf-8"))["rules"]}
    quality_issues = [
        {"sheet": "—", "code": item["code"], "severity": item["severity"],
         "count": item["count"], "message": rule_msgs.get(item["code"], "")}
        for item in ingest_report["issueSummary"]
    ]

    excess_by_key = {(r.position.product_code, r.position.location_code): r.balance.excess
                     for r in inv.rows}
    shortage_by_key = {(r.position.product_code, r.position.location_code): r.balance.shortage
                       for r in inv.rows}
    transfer_in_by_key = {(r.position.product_code, r.position.location_code): r.transfer_in_qty
                          for r in inv.rows}

    bench_usable = [b for b in benchmarks if b.min_unit_price is not None]

    return {
        "meta": {
            "sourceFile": excel.name,
            "calculationMonth": settings.calculation_month,
            "periods": periods,
            "skuCount": len(abc_rows),
            "locationCount": inv.summary["locations"],
            "totalSalesValue": sum(r.sales_value for r in abc_rows),
            "totalSalesQty": sum(sum(r.monthly_qty) for r in abc_rows),
            "totalStockQty": sum(r.balance.current_stock for r in inv.rows),
            "totalStockValue": sum(r.position.current_stock_value for r in inv.rows),
            "totalShortage": inv.summary["totalShortage"],
            "totalShortageValue": sum(r.shortage_value or 0 for r in inv.rows),
            "totalExcess": inv.summary["totalExcess"],
            "totalExcessValue": sum(r.excess_value or 0 for r in inv.rows),
            "totalTransferQty": inv.summary["totalTransferQty"],
            "totalPurchaseQty": inv.summary["totalPurchaseQty"],
            "purchaseSkuCount": sum(1 for r in inv.rows if r.new_purchase_qty > 0),
            "stopPurchaseCount": sum(1 for r in inv.rows if r.decision == "STOP_PURCHASE"),
            "benchmarkedProducts": len(bench_usable),
            "multiSourceProducts": sum(1 for b in bench_usable if b.source_count > 1),
            "totalPotentialSaving": sum(b.potential_saving or 0 for b in bench_usable),
            "marginRiskProducts": len(margin_risk_codes),
            "byStatus": inv.summary["byStatus"],
            "marginReason": REVENUE_MISSING_REASON,
        },
        "abcXyz": abc_rows,
        "matrix": matrix,
        "inventory": inv.rows,
        "transfers": inv.transfers,
        "benchmarks": benchmarks,
        "recommendations": recs,
        "riskRows": risk_rows,
        "stagnantRows": stagnant_rows,
        "balanceSummary": balance_summary,
        "quality": {**ingest_report["quality"], "issues": quality_issues},
        "nameByCode": name_by_code,
        "excessByKey": excess_by_key,
        "shortageByKey": shortage_by_key,
        "transferInByKey": transfer_in_by_key,
        "marginRiskCodes": margin_risk_codes,
        "marginRiskReasons": margin_risk_reasons,
        "abcByCode": abc_by_code,
    }
