"""
SKU түвшний нэгтгэл — Excel эх сурвалжаас.

Web application-д энэ нэгтгэл PostgreSQL дээр `groupBy`-аар хийгддэг
(`src/services/analysis/sales-aggregation.ts`). CLI горимд DB байхгүй тул
Phase 2-ын ingest pipeline-ыг ашиглан ЯГ ИЖИЛ дүрмээр нэгтгэнэ:

  • зөвхөн ERROR биш мөрүүд оролцоно (DB-д ч ERROR мөр орохгүй)
  • SKU-гийн хамрах хүрээ = lookback-д борлуулалттай ∪ calc month-д үлдэгдэлтэй
  • борлуулалтгүй сар = 0 (дундаж нь БҮТЭН саруудын тоонд хуваагдана)
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ingest.detect import detect_sheet  # noqa: E402
from ingest.pipeline import build_masters, process_sheet, read_workbook  # noqa: E402

from .engine import SkuAggregate  # noqa: E402

SCOPE_TO_LOCATION_TYPE = {"WAREHOUSE": "WAREHOUSE", "PHARMACY": "PHARMACY"}


def aggregate_from_excel(
    path: Path,
    periods: list[str],
    stock_period: str,
    scope: str = "ALL",
) -> tuple[list[SkuAggregate], dict]:
    """
    Буцаах: (aggregates, meta)

    meta нь тайланд хэрэгтэй нэмэлт тоонууд:
        skus_with_sales, skus_stock_only, rows_used, rows_skipped_error
    """
    sheets = read_workbook(path)
    detections = [detect_sheet(s.name, s.index, s.headers) for s in sheets]
    master, _ = build_masters(sheets, detections)
    results = [process_sheet(s, d, master) for s, d in zip(sheets, detections)]

    period_set = set(periods)
    sales_value: dict[str, float] = {}
    monthly: dict[str, dict[str, float]] = {}
    stock_products: set[str] = set()
    names: dict[str, str | None] = {}

    rows_used = 0
    rows_skipped_error = 0

    for res in results:
        dataset = res.detection.dataset_type
        if dataset not in ("SALES", "STOCK"):
            continue

        for row, status in zip(res.normalized, res.statuses):
            code = row.get("product_code")
            if not code:
                continue
            names.setdefault(code, row.get("product_name"))

            if status == "ERROR":
                rows_skipped_error += 1
                continue

            if scope != "ALL" and row.get("location_type") != SCOPE_TO_LOCATION_TYPE[scope]:
                continue

            if dataset == "SALES":
                if row.get("period_key") not in period_set:
                    continue
                rows_used += 1
                sales_value[code] = sales_value.get(code, 0.0) + float(row.get("cogs_amount") or 0.0)
                bucket = monthly.setdefault(code, {})
                key = row["period_key"]
                bucket[key] = bucket.get(key, 0.0) + float(row.get("quantity") or 0.0)

            elif dataset == "STOCK":
                if row.get("period_key") == stock_period:
                    stock_products.add(code)

    universe = set(sales_value) | set(monthly) | stock_products

    aggregates = [
        SkuAggregate(
            product_code=code,
            product_name=names.get(code),
            sales_value=sales_value.get(code, 0.0),
            # ⚠️ Сар бүрийг ЗААВАЛ дүүргэнэ — борлуулалтгүй сар = 0
            monthly_qty=[monthly.get(code, {}).get(period, 0.0) for period in periods],
        )
        for code in sorted(universe)
    ]

    meta = {
        "skus_with_sales": len(set(sales_value)),
        "skus_stock_only": len(stock_products - set(sales_value)),
        "rows_used": rows_used,
        "rows_skipped_error": rows_skipped_error,
        "universe": len(universe),
    }
    return aggregates, meta
