"""
Excel багана → нормчилсон нэрийн mapping (Python тал).

⚠️ Энэ файл нь `src/config/source-mapping.ts`-ийн толин тусгал.
   Нэгийг өөрчилвөл нөгөөг нь ЗААВАЛ хамт өөрчилнө.
   Багана нэмэхээсээ өмнө `python/inspect_excel.py`-аар Excel-ийг шалгана.
"""

from __future__ import annotations

from typing import Final

SHEET_PURCHASE: Final = "Purchase"
SHEET_SALES: Final = "Sales"
SHEET_STOCK: Final = "Stock"

# ── Эх багануудын БОДИТ нэрс ────────────────────────────────────────
COL_PRODUCT_CODE: Final = "Дотоод код"
COL_PRODUCT_NAME: Final = "Бүтээгдэхүүний нэрс"
COL_MANUFACTURER: Final = "Үйлдвэрлэгч "  # ⚠️ төгсгөлд space байна
COL_EXCLUSIVITY: Final = "Ангилал"
COL_YEAR: Final = "Он"
COL_MONTH: Final = "Сар"
COL_LOCATION_TYPE: Final = "Төрөл"
COL_LOCATION_CODE: Final = "Суваг"
COL_COMPANY_CODE: Final = "ХХК"
COL_SUPPLIER_CODE: Final = "ТА харилцагч"
COL_QUANTITY: Final = "Тоо"
COL_STOCK_QTY: Final = "Үлдэглэл"
COL_AMOUNT_ORTOG: Final = "Өртөг"  # Sales = COGS, Stock = үлдэгдлийн өртөг
COL_PURCHASE_AMOUNT: Final = "ТА НӨАТгүй дүн"

# ── source_column → normalized_column ───────────────────────────────
SALES_MAP: Final[dict[str, str]] = {
    COL_PRODUCT_CODE: "product_code",
    COL_PRODUCT_NAME: "product_name",
    COL_MANUFACTURER: "manufacturer_name",
    COL_EXCLUSIVITY: "exclusivity",
    COL_QUANTITY: "quantity",
    COL_AMOUNT_ORTOG: "cogs_amount",  # ⚠️ орлого биш
    COL_YEAR: "year",
    COL_MONTH: "month",
    COL_LOCATION_TYPE: "location_type",
    COL_LOCATION_CODE: "location_code",
    COL_COMPANY_CODE: "company_code",
}

PURCHASE_MAP: Final[dict[str, str]] = {
    COL_PRODUCT_CODE: "product_code",
    COL_PRODUCT_NAME: "product_name",
    COL_MANUFACTURER: "manufacturer_name",
    COL_EXCLUSIVITY: "exclusivity",
    COL_SUPPLIER_CODE: "supplier_code",
    COL_QUANTITY: "quantity",
    COL_PURCHASE_AMOUNT: "amount_ex_vat",
    COL_YEAR: "year",
    COL_MONTH: "month",
    COL_LOCATION_TYPE: "location_type",
    COL_LOCATION_CODE: "location_code",
    COL_COMPANY_CODE: "company_code",
}

STOCK_MAP: Final[dict[str, str]] = {
    COL_PRODUCT_CODE: "product_code",
    COL_PRODUCT_NAME: "product_name",
    COL_MANUFACTURER: "manufacturer_name",
    COL_EXCLUSIVITY: "exclusivity",
    COL_STOCK_QTY: "quantity_on_hand",
    COL_AMOUNT_ORTOG: "stock_value",
    COL_YEAR: "year",
    COL_MONTH: "month",
    COL_LOCATION_TYPE: "location_type",
    COL_LOCATION_CODE: "location_code",
    COL_COMPANY_CODE: "company_code",
}

SHEET_MAPS: Final[dict[str, dict[str, str]]] = {
    SHEET_SALES: SALES_MAP,
    SHEET_PURCHASE: PURCHASE_MAP,
    SHEET_STOCK: STOCK_MAP,
}

# ── Утгын mapping ───────────────────────────────────────────────────
LOCATION_TYPE_MAP: Final[dict[str, str]] = {"ЭХНТ": "WAREHOUSE", "ЭС": "PHARMACY"}
EXCLUSIVITY_MAP: Final[dict[str, str]] = {"Ex": "EX", "Non-ex": "NON_EX"}

# pandas-д дамжуулах dtype — product code заавал текст
READ_DTYPES: Final[dict[str, type]] = {COL_PRODUCT_CODE: str}


def period_key(year: int, month: int) -> str:
    """Он + Сар → 'YYYY-MM'. Эх өгөгдөлд огнооны багана байхгүй."""
    return f"{int(year):04d}-{int(month):02d}"


def normalize_product_code(raw: object) -> str:
    """⚠️ int болгохгүй — '0100139' гэсэн тэргүүлэх 0 хадгалагдана."""
    return str(raw).strip()


def normalize_text(raw: object | None) -> str | None:
    if raw is None:
        return None
    value = " ".join(str(raw).split())
    return value or None


def validate_headers(sheet_name: str, headers: list[str]) -> list[str]:
    """Хүлээгдэж буй багана дутуу байвал жагсаалт буцаана (чимээгүй өнгөрөхгүй)."""
    expected = set(SHEET_MAPS[sheet_name])
    return sorted(expected - set(headers))
