"""
Phase 5-ийн нэгтгэл — Excel эх сурвалжаас.

Web application-д энэ нь PostgreSQL дээр хийгддэг
(`src/services/analysis/price-control.service.ts`). CLI горимд DB байхгүй тул
Phase 2-ын ingest pipeline-ыг ашиглана.

⚠️ Үнийн benchmark-ийн цонх = lookback сарууд (calculation month ОРОХГҮЙ) —
   систем даяар нэг ижил цонх ашиглаж байгаа тул үр дүн харьцуулагдана.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ingest.detect import detect_sheet  # noqa: E402
from ingest.pipeline import build_masters, process_sheet, read_workbook  # noqa: E402

from .engine import PurchaseLine  # noqa: E402

# role → нормчилсон мөрийн талбар
DIMENSION_FIELD = {
    "SUPPLIER": "supplier_code",
    "LOCATION": "location_code",
    "CHANNEL": "channel_code",
}


def build_purchase_lines(
    path: Path,
    periods: list[str],
    dimension: str = "SUPPLIER",
) -> tuple[dict[str, list[PurchaseLine]], dict[str, str | None], dict]:
    """
    Буцаах: (lines_by_product, name_by_product, meta)

    ⚠️ ERROR төлөвтэй мөрүүд ОРОХГҮЙ (DB-д ч орохгүй).
    """
    field = DIMENSION_FIELD.get(dimension)
    if field is None:
        raise ValueError(f"Дэмжигдээгүй хэмжээст: {dimension}")

    sheets = read_workbook(path)
    detections = [detect_sheet(s.name, s.index, s.headers) for s in sheets]
    master, _ = build_masters(sheets, detections)
    results = [process_sheet(s, d, master) for s, d in zip(sheets, detections)]

    period_set = set(periods)
    lines_by_product: dict[str, list[PurchaseLine]] = {}
    name_by_product: dict[str, str | None] = {}

    rows_used = 0
    rows_missing_dimension = 0
    rows_outside_window = 0

    for res in results:
        if res.detection.dataset_type != "PURCHASE":
            continue

        for row, status in zip(res.normalized, res.statuses):
            if status == "ERROR":
                continue
            code = row.get("product_code")
            if not code:
                continue
            name_by_product.setdefault(code, row.get("product_name"))

            if row.get("period_key") not in period_set:
                rows_outside_window += 1
                continue

            key = row.get(field)
            if not key:
                # ⚠️ Хэмжээстийн утга байхгүй мөрийг ЧИМЭЭГҮЙ оруулахгүй
                rows_missing_dimension += 1
                continue

            rows_used += 1
            lines_by_product.setdefault(code, []).append(
                PurchaseLine(
                    product_code=code,
                    dimension_key=str(key),
                    period_key=row["period_key"],
                    quantity=float(row.get("quantity") or 0.0),
                    amount=float(row.get("amount_ex_vat") or 0.0),
                )
            )

    meta = {
        "rows_used": rows_used,
        "rows_missing_dimension": rows_missing_dimension,
        "rows_outside_window": rows_outside_window,
        "products_with_purchases": len(lines_by_product),
        "dimension": dimension,
    }
    return lines_by_product, name_by_product, meta


def build_monthly_sales_by_sku(path: Path, periods: list[str]) -> dict[str, list[float]]:
    """SKU бүрийн сар тус бүрийн тоо хэмжээ (хандлага тооцоход)."""
    sheets = read_workbook(path)
    detections = [detect_sheet(s.name, s.index, s.headers) for s in sheets]
    master, _ = build_masters(sheets, detections)
    results = [process_sheet(s, d, master) for s, d in zip(sheets, detections)]

    period_index = {p: i for i, p in enumerate(periods)}
    monthly: dict[str, list[float]] = {}

    for res in results:
        if res.detection.dataset_type != "SALES":
            continue
        for row, status in zip(res.normalized, res.statuses):
            if status == "ERROR":
                continue
            code = row.get("product_code")
            idx = period_index.get(row.get("period_key"))
            if not code or idx is None:
                continue
            bucket = monthly.setdefault(code, [0.0] * len(periods))
            bucket[idx] += float(row.get("quantity") or 0.0)

    return monthly
