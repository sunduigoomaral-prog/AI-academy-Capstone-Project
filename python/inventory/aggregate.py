"""
Байрлал түвшний нэгтгэл — Excel эх сурвалжаас.

Web application-д энэ нь PostgreSQL дээр `groupBy`-аар хийгддэг
(`src/services/analysis/inventory-aggregation.ts`). CLI горимд DB байхгүй тул
Phase 2-ын ingest pipeline + Phase 3-ын ABC-XYZ engine-ийг ашиглана.

Grain: (product_code, location_code)
  • average_monthly_sales = тухайн БАЙРШЛЫН lookback нийлбэр / бүтэн сарын тоо
  • current_stock         = calculation month дахь тухайн байршлын үлдэгдэл
  • abc / xyz             = SKU ТҮВШНИЙ ангилал (Phase 3), байршлаас хамаарахгүй
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from analysis.aggregate import aggregate_from_excel  # noqa: E402
from analysis.engine import run_abc_xyz  # noqa: E402
from ingest.detect import detect_sheet  # noqa: E402
from ingest.pipeline import build_masters, process_sheet, read_workbook  # noqa: E402

from .engine import Position  # noqa: E402


def build_positions(
    path: Path,
    periods: list[str],
    stock_period: str,
    abc_a: float,
    abc_b: float,
    xyz_x: float,
    xyz_y: float,
    scope: str = "ALL",
) -> tuple[list[Position], dict]:
    """Буцаах: (positions, meta)"""

    # ── 1) SKU түвшний ABC-XYZ (Phase 3) ──
    aggregates, agg_meta = aggregate_from_excel(path, periods, stock_period, scope)
    abc_rows = run_abc_xyz(aggregates, abc_a, abc_b, xyz_x, xyz_y, len(periods))
    class_by_sku = {r.product_code: (r.abc, r.xyz, r.abc_xyz) for r in abc_rows}
    name_by_sku = {r.product_code: r.product_name for r in abc_rows}

    # ── 2) Байрлал түвшний борлуулалт ба үлдэгдэл ──
    sheets = read_workbook(path)
    detections = [detect_sheet(s.name, s.index, s.headers) for s in sheets]
    master, _ = build_masters(sheets, detections)
    results = [process_sheet(s, d, master) for s, d in zip(sheets, detections)]

    period_set = set(periods)
    sales_qty: dict[tuple[str, str], float] = {}
    sales_value: dict[tuple[str, str], float] = {}
    #: Орлого — багана байгаа мөрүүд дээр л хуримтлагдана
    net_sales: dict[tuple[str, str], float] = {}
    has_net_sales = False
    #: Эх өгөгдөлд БАЙГАА бүх сар — хэрэглэгчид сонгуулахад ашиглана
    seen_periods: set[str] = set()
    stock_qty: dict[tuple[str, str], float] = {}
    stock_value: dict[tuple[str, str], float] = {}
    location_meta: dict[str, dict] = {}

    for res in results:
        dataset = res.detection.dataset_type
        if dataset not in ("SALES", "STOCK"):
            continue

        for row, status in zip(res.normalized, res.statuses):
            if status == "ERROR":
                continue
            code = row.get("product_code")
            location = row.get("location_code")
            if not code or not location:
                continue

            location_meta.setdefault(
                location,
                {
                    "type": row.get("location_type"),
                    "company": row.get("company_code"),
                    # ⚠️ Эх өгөгдөлд сувгийн хэмжээст БАЙХГҮЙ (docs/01 §5)
                    "channel": None,
                },
            )

            key = (code, location)
            if row.get("period_key"):
                seen_periods.add(row["period_key"])
            if dataset == "SALES":
                if row.get("period_key") in period_set:
                    sales_qty[key] = sales_qty.get(key, 0.0) + float(row.get("quantity") or 0.0)
                    # ⚠️ `cogs_amount` нь ӨРТӨГ — орлого БИШ (docs/01 §7)
                    sales_value[key] = (
                        sales_value.get(key, 0.0) + float(row.get("cogs_amount") or 0.0)
                    )
                    revenue = row.get("net_sales_amount")
                    if revenue is not None:
                        has_net_sales = True
                        net_sales[key] = net_sales.get(key, 0.0) + float(revenue)
            elif dataset == "STOCK" and row.get("period_key") == stock_period:
                stock_qty[key] = stock_qty.get(key, 0.0) + float(row.get("quantity_on_hand") or 0.0)
                stock_value[key] = stock_value.get(key, 0.0) + float(row.get("stock_value") or 0.0)

    # ── 3) Байрлалын universe: борлуулалттай ∪ үлдэгдэлтэй ──
    universe = set(sales_qty) | set(stock_qty)
    months = len(periods)

    positions: list[Position] = []
    skipped_unclassified = 0

    for code, location in sorted(universe):
        classes = class_by_sku.get(code)
        if classes is None:
            # ABC-XYZ ангилалгүй SKU-г ЧИМЭЭГҮЙ оруулахгүй — тоолж тайлагнана
            skipped_unclassified += 1
            continue

        abc, xyz, abc_xyz = classes
        meta = location_meta.get(location, {})
        qty = stock_qty.get((code, location), 0.0)
        value = stock_value.get((code, location), 0.0)

        positions.append(
            Position(
                product_code=code,
                product_name=name_by_sku.get(code),
                location_code=location,
                location_type=meta.get("type") or "WAREHOUSE",
                channel_code=meta.get("channel"),
                company_code=meta.get("company"),
                abc=abc,
                xyz=xyz,
                abc_xyz=abc_xyz,
                average_monthly_sales=sales_qty.get((code, location), 0.0) / months,
                current_stock=qty,
                current_stock_value=value,
                unit_cost=(value / qty) if qty else None,
                sales_qty=sales_qty.get((code, location), 0.0),
                sales_value=sales_value.get((code, location), 0.0),
                manufacturer=(master.products.get(code) or {}).get("manufacturer_name"),
                # ⚠️ Багана огт байхгүй бол None — 0 гэж таамаглахгүй
                net_sales_amount=(net_sales.get((code, location), 0.0)
                                  if has_net_sales else None),
            )
        )

    meta = {
        **agg_meta,
        "has_net_sales": has_net_sales,
        "available_periods": sorted(seen_periods),
        "positions": len(positions),
        "locations": len({p.location_code for p in positions}),
        "skus": len({p.product_code for p in positions}),
        "skipped_unclassified": skipped_unclassified,
    }
    return positions, meta
