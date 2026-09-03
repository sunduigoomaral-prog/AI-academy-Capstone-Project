"""
DASHBOARD VIEW — шүүлт ба нэгтгэлийн давхарга.

`src/services/dashboard/dashboard.service.ts`-ийн Python хувилбар. Streamlit UI
энд дуудна — тооцооллыг UI дотор ХИЙХГҮЙ.

⚠️ Шүүлтүүр нь ХАРАГДАЦЫН сонголт. ABC–XYZ ангилал урьдын адил SKU түвшний
   ДЭЛХИЙ борлуулалтаар хийгдсэн хэвээр — шүүсэн болгонд дахин ангилахгүй
   (Next.js хувилбартай ижил зан төлөв).

⚠️ Эх өгөгдөлд байхгүй утгыг ЗОХИОХГҮЙ — `unavailable_reason`-той None буцаана.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable

# ─────────────────────────────────────────────────────────────────────
# §26 — өнгөний систем (src/config/color-system.ts-тэй ижил)
# ─────────────────────────────────────────────────────────────────────

STATUS_TONE: dict[str, dict[str, str]] = {
    "STOCKOUT_RISK": {"labelMn": "Нөөц дуусах эрсдэлтэй", "bg": "#fef2f2",
                      "fg": "#991b1b", "dot": "#ef4444"},
    "LOW_STOCK": {"labelMn": "Нөөц багассан", "bg": "#fff7ed",
                  "fg": "#9a3412", "dot": "#f97316"},
    "OVERSTOCK": {"labelMn": "Хэт их нөөцтэй", "bg": "#faf5ff",
                  "fg": "#6b21a8", "dot": "#a855f7"},
    "NO_MOVEMENT": {"labelMn": "Хөдөлгөөнгүй", "bg": "#f1f5f9",
                    "fg": "#1e293b", "dot": "#475569"},
    "SLOW_MOVING": {"labelMn": "Удаан эргэлттэй", "bg": "#eff6ff",
                    "fg": "#1e40af", "dot": "#3b82f6"},
    "OPTIMAL": {"labelMn": "Зохистой", "bg": "#f0fdf4",
                "fg": "#166534", "dot": "#22c55e"},
}

DECISION_TONE: dict[str, dict[str, str]] = {
    "TRANSFER": {"labelMn": "Шилжүүлэх", "bg": "#eff6ff", "fg": "#1e40af"},
    "NEW_PURCHASE": {"labelMn": "Шинээр худалдан авах", "bg": "#ecfdf5", "fg": "#065f46"},
    "STOP_PURCHASE": {"labelMn": "Худалдан авалт зогсоох", "bg": "#fef2f2", "fg": "#991b1b"},
    "MONITOR": {"labelMn": "Хяналтад байлгах", "bg": "#f1f5f9", "fg": "#334155"},
    "PROMOTION": {"labelMn": "Борлуулалт идэвхжүүлэх", "bg": "#f5f3ff", "fg": "#5b21b6"},
}

ABC_XYZ_TONE: dict[str, dict[str, str]] = {
    "AX": {"bg": "#bbf7d0", "fg": "#052e16"},
    "AY": {"bg": "#bbf7d0", "fg": "#052e16"},
    "AZ": {"bg": "#fed7aa", "fg": "#431407"},
    "BX": {"bg": "#bbf7d0", "fg": "#052e16"},
    "BY": {"bg": "#fef08a", "fg": "#422006"},
    "BZ": {"bg": "#fdba74", "fg": "#431407"},
    "CX": {"bg": "#d9f99d", "fg": "#1a2e05"},
    "CY": {"bg": "#fdba74", "fg": "#431407"},
    "CZ": {"bg": "#fca5a5", "fg": "#450a0a"},
}

PRIORITY_TONE: dict[str, dict[str, str]] = {
    "CRITICAL": {"bg": "#fef2f2", "fg": "#991b1b"},
    "HIGH": {"bg": "#fff7ed", "fg": "#9a3412"},
    "MEDIUM": {"bg": "#fefce8", "fg": "#854d0e"},
    "LOW": {"bg": "#f1f5f9", "fg": "#334155"},
}

LOCATION_TYPE_LABEL = {
    "WAREHOUSE": "Эм ханган нийлүүлэх төв",
    "PHARMACY": "Эмийн сан",
}

NOT_AVAILABLE = "N/A"
MISSING_SOURCE_FIELD = "Missing source field"

#: Эх өгөгдөлд сувгийн бие даасан хэмжээст байхгүй (docs/01 §5)
CHANNEL_UNAVAILABLE_REASON = (
    "Эх өгөгдөлд сувгийн бие даасан лавлах байхгүй — `Суваг` багана нь "
    "байршлын код агуулна."
)

ABC_ORDER = ("A", "B", "C")
XYZ_ORDER = ("X", "Y", "Z")
XYZ_LABEL = {"X": "X тогтвортой", "Y": "Y дунд", "Z": "Z хэлбэлзэлтэй"}


# ─────────────────────────────────────────────────────────────────────
# Шүүлтүүр
# ─────────────────────────────────────────────────────────────────────

@dataclass
class Filter:
    """Толгойн глобал шүүлтүүр. Хоосон жагсаалт = хязгаарлахгүй."""

    product_codes: list[str] = field(default_factory=list)
    company_codes: list[str] = field(default_factory=list)
    location_type: str | None = None
    location_codes: list[str] = field(default_factory=list)
    manufacturers: list[str] = field(default_factory=list)

    @property
    def is_active(self) -> bool:
        return bool(
            self.product_codes
            or self.company_codes
            or self.location_type
            or self.location_codes
            or self.manufacturers
        )

    def matches_location(self, location_code: str, location_type: str,
                         company_code: str | None) -> bool:
        if self.location_type and location_type != self.location_type:
            return False
        if self.location_codes and location_code not in self.location_codes:
            return False
        if self.company_codes and company_code not in self.company_codes:
            return False
        return True

    def matches_product(self, product_code: str) -> bool:
        return not self.product_codes or product_code in self.product_codes


def filter_options(data: dict) -> dict:
    """Шүүлтүүрийн сонголтууд — БҮГД эх өгөгдлөөс."""
    companies: dict[str, dict[str, Any]] = {}
    locations: dict[str, dict[str, Any]] = {}

    for row in data["inventory"]:
        p = row.position
        loc = locations.setdefault(p.location_code, {
            "code": p.location_code,
            "type": p.location_type,
            "company_code": p.company_code,
        })
        if p.company_code:
            entry = companies.setdefault(p.company_code, {
                "code": p.company_code, "warehouse_count": 0, "pharmacy_count": 0,
                "_seen": set(),
            })
            if loc["code"] not in entry["_seen"]:
                entry["_seen"].add(loc["code"])
                if p.location_type == "PHARMACY":
                    entry["pharmacy_count"] += 1
                else:
                    entry["warehouse_count"] += 1

    for entry in companies.values():
        entry.pop("_seen", None)

    products = sorted(
        {(r.position.product_code, r.position.product_name) for r in data["inventory"]}
    )
    manufacturers = sorted(
        {r.position.manufacturer for r in data["inventory"] if r.position.manufacturer}
    )

    return {
        "companies": [companies[c] for c in sorted(companies)],
        "location_types": [
            {"code": code, "label_mn": label}
            for code, label in LOCATION_TYPE_LABEL.items()
            if any(loc["type"] == code for loc in locations.values())
        ],
        "locations": [locations[c] for c in sorted(locations)],
        "products": [{"code": c, "name": n} for c, n in products],
        "manufacturers": manufacturers,
        # ⚠️ Тусдаа сувгийн хэмжээст эх өгөгдөлд БАЙХГҮЙ
        "channels": [],
        "channel_unavailable_reason": CHANNEL_UNAVAILABLE_REASON,
    }


# ─────────────────────────────────────────────────────────────────────
# Нэгтгэл
# ─────────────────────────────────────────────────────────────────────

def _share(part: float, whole: float) -> float | None:
    return None if whole <= 0 else part / whole


#: §26 — 6 төлөвийг удирдлагад ойлгомжтой 4 бүлэг болгоно.
#: ⚠️ Энэ бол ХАРАГДАЦЫН бүлэглэл. Үндсэн 6 төлөв хэвээр хадгалагдана.
RISK_GROUPS: list[dict] = [
    {"code": "RISK", "label_mn": "Эрсдэлтэй", "hue": "#e5484d",
     "statuses": ("STOCKOUT_RISK", "LOW_STOCK")},
    {"code": "WATCH", "label_mn": "Анхаарах", "hue": "#f5a524",
     "statuses": ("SLOW_MOVING", "NO_MOVEMENT")},
    {"code": "HEALTHY", "label_mn": "Эрүүл", "hue": "#17a34a",
     "statuses": ("OPTIMAL",)},
    {"code": "EXCESS", "label_mn": "Илүүдэлтэй", "hue": "#8b5cf6",
     "statuses": ("OVERSTOCK",)},
]

#: Нөөцийн хоногийн бүлэг — дээд хязгаар (сүүлийнх нь хязгааргүй)
STOCK_DAY_BUCKETS: list[tuple[str, float | None]] = [
    ("0–7 хоног", 7), ("8–15 хоног", 15), ("16–30 хоног", 30),
    ("31–60 хоног", 60), ("60+ хоног", None),
]


def risk_groups(rows: list) -> list[dict]:
    """Төлөв бүрийн байрлалын тоо ба нөөцийн өртгийг 4 бүлгээр."""
    total_positions = len(rows)
    out = []
    for group in RISK_GROUPS:
        picked = [r for r in rows if r.stock_status in group["statuses"]]
        out.append({
            **group,
            "count": len(picked),
            "share": _share(len(picked), total_positions),
            "value": sum(r.position.current_stock_value for r in picked),
            "quantity": sum(r.balance.current_stock for r in picked),
        })
    return out


def stock_day_distribution(rows: list) -> list[dict]:
    """Нөөц хэдэн хоног хүрэлцэхээр байгааг бүлэглэнэ."""
    counts = {label: 0 for label, _ in STOCK_DAY_BUCKETS}
    for r in rows:
        days = r.balance.current_stock_days
        for label, upper in STOCK_DAY_BUCKETS:
            if upper is None or days <= upper:
                counts[label] += 1
                break
    peak = max(counts.values()) or 1
    return [{"label": label, "count": counts[label], "ratio": counts[label] / peak}
            for label, _ in STOCK_DAY_BUCKETS]


def top_rows(rows: list, *, status: tuple[str, ...] | None = None,
             decision: str | None = None, key=None, limit: int = 10) -> list:
    """Эрэмбэлсэн эхний N мөр. `key` нь эрэмбэлэх утгыг буцаана."""
    picked = list(rows)
    if status:
        picked = [r for r in picked if r.stock_status in status]
    if decision:
        picked = [r for r in picked if r.decision == decision]
    if key is not None:
        picked.sort(key=key, reverse=True)
    return picked[:limit]


def _kpis(rows: list, positions: int) -> list[dict]:
    """§2 KPI — dashboard.service.ts-ийн жагсаалттай ЯГ ИЖИЛ дараалал."""

    def status_count(code: str) -> int:
        return sum(1 for r in rows if r.stock_status == code)

    def decision_count(code: str) -> int:
        return sum(1 for r in rows if r.decision == code)

    def status_kpi(key: str, code: str) -> dict:
        count = status_count(code)
        share = _share(count, positions)
        return {
            "key": key,
            "label_mn": STATUS_TONE[code]["labelMn"],
            "value": count,
            "sub": None if share is None else f"{share * 100:.1f}%",
            "format": "int",
            "tone": code,
        }

    return [
        {"key": "skuCount", "label_mn": "Нийт SKU",
         "value": len({r.position.product_code for r in rows}), "format": "int"},
        {"key": "salesValue", "label_mn": "Нийт борлуулалт (₮)",
         "value": sum(r.position.sales_value for r in rows),
         "sub": "⚠️ өртгөөр (орлого байхгүй)", "format": "money"},
        {"key": "salesQty", "label_mn": "Борлуулалтын тоо",
         "value": sum(r.position.sales_qty for r in rows), "format": "int"},
        {"key": "stockQty", "label_mn": "Нийт нөөц",
         "value": sum(r.balance.current_stock for r in rows), "format": "int"},
        {"key": "stockValue", "label_mn": "Нөөцийн өртөг (₮)",
         "value": sum(r.position.current_stock_value for r in rows), "format": "money"},
        # ⚠️ §28 — эх өгөгдөлд ОРЛОГО байхгүй тул тоо ЗОХИОХГҮЙ
        {"key": "grossProfit", "label_mn": "Gross Profit", "value": None,
         "unavailable_reason": MISSING_SOURCE_FIELD, "format": "money"},
        {"key": "grossMargin", "label_mn": "Gross Margin %", "value": None,
         "unavailable_reason": MISSING_SOURCE_FIELD, "format": "percent"},
        status_kpi("critical", "STOCKOUT_RISK"),
        status_kpi("lowStock", "LOW_STOCK"),
        status_kpi("excess", "OVERSTOCK"),
        status_kpi("stagnant", "NO_MOVEMENT"),
        status_kpi("slowMoving", "SLOW_MOVING"),
        {"key": "newPurchase", "label_mn": "Шинээр худалдан авах",
         "value": sum(r.new_purchase_qty for r in rows),
         "sub": f"{decision_count('NEW_PURCHASE')} байрлал", "format": "int"},
        {"key": "transfer", "label_mn": "Шилжүүлэх",
         "value": sum(r.transfer_in_qty for r in rows),
         "sub": f"{decision_count('TRANSFER')} байрлал", "format": "int"},
    ]


def _matrix(rows: list) -> list[dict]:
    """ABC × XYZ 9 нүд — шүүсэн байрлалуудаас."""
    total_value = sum(r.position.sales_value for r in rows)
    risky = {"STOCKOUT_RISK", "LOW_STOCK", "NO_MOVEMENT", "OVERSTOCK", "SLOW_MOVING"}

    cells: dict[str, dict] = {}
    for abc in ABC_ORDER:
        for xyz in XYZ_ORDER:
            key = f"{abc}{xyz}"
            cells[key] = {
                "abcXyz": key, "abc": abc, "xyz": xyz, "skus": set(),
                "salesValue": 0.0, "salesQty": 0.0, "currentStock": 0.0,
                "recommendedStock": 0.0, "riskCount": 0,
            }

    for r in rows:
        cell = cells.get(r.position.abc_xyz)
        if cell is None:
            continue
        cell["skus"].add(r.position.product_code)
        cell["salesValue"] += r.position.sales_value
        cell["salesQty"] += r.position.sales_qty
        cell["currentStock"] += r.balance.current_stock
        cell["recommendedStock"] += r.balance.recommended_stock
        if r.stock_status in risky:
            cell["riskCount"] += 1

    out = []
    for key, cell in cells.items():
        out.append({
            "abcXyz": key,
            "abc": cell["abc"],
            "xyz": cell["xyz"],
            "skuCount": len(cell["skus"]),
            "salesValue": cell["salesValue"],
            "salesShare": _share(cell["salesValue"], total_value),
            "salesQty": cell["salesQty"],
            "currentStock": cell["currentStock"],
            "recommendedStock": cell["recommendedStock"],
            "riskCount": cell["riskCount"],
            "tone": ABC_XYZ_TONE[key],
        })
    return out


def _balance(rows: list) -> list[dict]:
    total = len(rows)
    out = []
    for code, tone in STATUS_TONE.items():
        picked = [r for r in rows if r.stock_status == code]
        out.append({
            "code": code,
            "label_mn": tone["labelMn"],
            "tone": tone,
            "count": len(picked),
            "share": _share(len(picked), total),
            "quantity": sum(r.balance.current_stock for r in picked),
            "value": sum(r.position.current_stock_value for r in picked),
        })
    out.sort(key=lambda x: -x["count"])
    return out


def _auto_answers(rows: list, transfers: list) -> list[dict]:
    """§13 — систем автоматаар хариулах асуултууд."""
    risky = [r for r in rows if r.stock_status in ("STOCKOUT_RISK", "LOW_STOCK")]
    avg_days = (
        sum(r.balance.current_stock_days for r in risky) / len(risky) if risky else None
    )
    purchase = [r for r in rows if r.decision == "NEW_PURCHASE"]
    transfer_rows = [r for r in rows if r.decision == "TRANSFER"]
    stagnant = [r for r in rows if r.stock_status == "NO_MOVEMENT"]
    stop = [r for r in rows if r.decision == "STOP_PURCHASE"]

    return [
        {"question_mn": "Аль SKU нөөц дуусах эрсдэлтэй вэ?",
         "answer": f"{sum(1 for r in rows if r.stock_status == 'STOCKOUT_RISK'):,}",
         "unit_mn": "байрлал"},
        {"question_mn": "Хэдэн хоногийн нөөц үлдсэн бэ?",
         "answer": None if avg_days is None else f"{avg_days:.1f}",
         "unavailable_reason": None if avg_days is not None else "Эрсдэлтэй байрлал алга",
         "unit_mn": "хоног (эрсдэлтэй байрлалын дундаж)"},
        {"question_mn": "Хэдийг захиалах шаардлагатай вэ?",
         "answer": f"{sum(r.new_purchase_qty for r in rows):,}", "unit_mn": "ширхэг"},
        {"question_mn": "Шинээр татан авах уу?",
         "answer": f"{len(purchase):,}", "unit_mn": "байрлалд тийм"},
        {"question_mn": "Эсвэл өөр байршлаас шилжүүлэх үү?",
         "answer": f"{len(transfer_rows):,}",
         "unit_mn": f"байрлалд боломжтой ({sum(r.transfer_in_qty for r in rows):,} ш)"},
        {"question_mn": "Аль бараа хөдөлгөөнгүй байна?",
         "answer": f"{len(stagnant):,}", "unit_mn": "байрлал"},
        {"question_mn": "Аль барааны худалдан авалтыг зогсоох вэ?",
         "answer": f"{len(stop):,}", "unit_mn": "байрлал"},
    ]


# ─────────────────────────────────────────────────────────────────────
# Үндсэн үүсгэгч
# ─────────────────────────────────────────────────────────────────────

def build_view(data: dict, flt: Filter | None = None) -> dict:
    """`collect()`-ийн үр дүнг шүүж, дэлгэцэд бэлэн нэгтгэл буцаана."""
    flt = flt or Filter()

    rows = [
        r for r in data["inventory"]
        if flt.matches_product(r.position.product_code)
        and (not flt.manufacturers or r.position.manufacturer in flt.manufacturers)
        and flt.matches_location(r.position.location_code, r.position.location_type,
                                 r.position.company_code)
    ]

    # Байршлын шүүлтэд тохирох кодууд — шилжүүлэг, эрсдэлийн мөрөнд ашиглана
    in_scope = {r.position.location_code for r in data["inventory"]
                if flt.matches_location(r.position.location_code, r.position.location_type,
                                        r.position.company_code)}

    # ⚠️ Шилжүүлэг ХОЁР байршилтай — эх үүсвэр ЭСВЭЛ хүлээн авагч таарвал хамаарна.
    #    Нэг талыг нь шүүвэл тухайн ХХК руу ИРЖ буй бараа алга болно.
    transfers = [
        t for t in data["transfers"]
        if flt.matches_product(t.product_code)
        and (t.from_location_code in in_scope or t.to_location_code in in_scope)
    ]

    keys = {(r.position.product_code, r.position.location_code) for r in rows}
    recommendations = [
        rec for rec in data["recommendations"]
        if (rec["product_code"], rec["location_code"]) in keys
    ]
    risk_rows = [
        r for r in data["riskRows"] if (r["productCode"], r["locationCode"]) in keys
    ]
    stagnant_rows = [
        r for r in data["stagnantRows"] if (r["productCode"], r["locationCode"]) in keys
    ]

    codes_in_scope = {r.position.product_code for r in rows}
    benchmarks = [
        b for b in data["benchmarks"]
        if b.product_code in codes_in_scope and b.min_unit_price is not None
    ]

    tier_totals: dict[str, dict[str, Any]] = {}
    for t in transfers:
        entry = tier_totals.setdefault(t.tier_code,
                                       {"label_mn": t.tier_label_mn, "count": 0, "quantity": 0})
        entry["count"] += 1
        entry["quantity"] += t.quantity

    return {
        "meta": data["meta"],
        "filter_active": flt.is_active,
        "scope": {
            "positions": len(rows),
            "skus": len(codes_in_scope),
            "locations": len({r.position.location_code for r in rows}),
        },
        "kpis": _kpis(rows, len(rows)),
        "matrix": _matrix(rows),
        "balance": _balance(rows),
        "risk_groups": risk_groups(rows),
        "stock_days": stock_day_distribution(rows),
        "auto_answers": _auto_answers(rows, transfers),
        "rows": rows,
        "transfers": transfers,
        "transfer_tiers": [
            {"code": code, **entry}
            for code, entry in sorted(tier_totals.items(), key=lambda kv: -kv[1]["quantity"])
        ],
        "recommendations": recommendations,
        "risk_rows": risk_rows,
        "stagnant_rows": stagnant_rows,
        "benchmarks": benchmarks,
        "margin_risk_codes": {c for c in data["marginRiskCodes"] if c in codes_in_scope},
        "margin_risk_reasons": data["marginRiskReasons"],
        "quality": data["quality"],
        "name_by_code": data["nameByCode"],
    }


def monthly_sales_series(data: dict, flt: Filter | None = None) -> list[dict]:
    """Сар бүрийн борлуулалтын тоо — ABC–XYZ мөрийн `monthly_qty`-аас.

    ⚠️ `monthly_qty` нь SKU түвшинд тул БАЙРШЛААР задрахгүй. Байршлын
       шүүлтүүр идэвхтэй үед энэ график бүрэн зөв биш тул `partial=True`
       гэж тэмдэглэж, UI дээр анхааруулга харуулна.
    """
    flt = flt or Filter()
    periods = data["meta"]["periods"]

    codes: set[str] | None = None
    if flt.product_codes:
        codes = set(flt.product_codes)

    totals = [0.0] * len(periods)
    for row in data["abcXyz"]:
        if codes is not None and row.product_code not in codes:
            continue
        for i, qty in enumerate(row.monthly_qty):
            totals[i] += qty

    location_filtered = bool(flt.company_codes or flt.location_type or flt.location_codes)
    return [
        {"period": period, "quantity": total, "partial": location_filtered}
        for period, total in zip(periods, totals)
    ]
