"""
Data normalization — эх өгөгдлийг ӨӨРЧЛӨХГҮЙ, зөвхөн хуулбарыг нормчилно.

Дүрэм:
  product_code  → trim, доторх илүү зай арилгах, ТОМ ҮСЭГ.
                  ⚠️ Тэргүүлэх 0 ХЭВЭЭР үлдэнэ ("0100139"), int болгохгүй.
  product_name  → trim + доторх зай нэгтгэх
  date          → ISO 8601 сарын хэлбэр "YYYY-MM".
                  ⚠️ Эх өгөгдөлд ӨДӨР байхгүй тул өдөр ЗОХИОХГҮЙ.
  quantity/amount → тоон утга. Хөрвөхгүй бол None (0 болгож таамаглахгүй).
"""

from __future__ import annotations

import hashlib
import math
import re
from typing import Any

from .config_loader import load_signatures

_WS = re.compile(r"\s+")


def norm_text(value: Any) -> str | None:
    """Трим + доторх зайг нэг болгоно. Хоосон бол None."""
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    text = _WS.sub(" ", str(value)).strip()
    return text or None


def norm_product_code(value: Any) -> str | None:
    """
    trim + uppercase + илүү зай арилгах.
    ⚠️ Тоо болгож хөрвүүлэхгүй — '0100139' нь '100139' болох ёсгүй.
    Excel-ээс тоогоор ирсэн тохиолдолд (.0 сүүлтэй) бүхэл болгож цэвэрлэнэ.
    """
    text = norm_text(value)
    if text is None:
        return None
    text = text.replace(" ", "")
    # Excel заримдаа '100139.0' болгож өгдөг — бутархай хэсэг нь тэг бол хасна
    if re.fullmatch(r"\d+\.0+", text):
        text = text.split(".", 1)[0]
    return text.upper()


def norm_code(value: Any) -> str | None:
    """Байршил / компани / нийлүүлэгчийн код — product code-той ижил дүрэм."""
    return norm_product_code(value)


def to_number(value: Any) -> float | None:
    """Тоон утга руу хөрвүүлнэ. Боломжгүй бол None — таамгаар 0 болгохгүй."""
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return None if (isinstance(value, float) and math.isnan(value)) else float(value)
    text = norm_text(value)
    if text is None:
        return None
    # 1 234,56 / 1,234.56 хэлбэрийг зохицуулна
    cleaned = text.replace(" ", "").replace(" ", "")
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(",", "")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


def to_int(value: Any) -> int | None:
    num = to_number(value)
    if num is None:
        return None
    if num != int(num):
        return None
    return int(num)


def period_key(year: int | None, month: int | None) -> str | None:
    """ISO 8601 сарын хэлбэр. Өдөр ЗОХИОХГҮЙ."""
    if year is None or month is None:
        return None
    if not (2000 <= year <= 2100) or not (1 <= month <= 12):
        return None
    return f"{year:04d}-{month:02d}"


def map_location_type(raw: Any) -> str | None:
    """Монгол нэршил → WAREHOUSE / PHARMACY"""
    text = norm_text(raw)
    if text is None:
        return None
    return load_signatures()["valueMaps"]["locationType"].get(text.upper())


def location_type_from_code(code: str | None) -> str | None:
    """3xxxxx = агуулах, 4xxxxx = эмийн сан (бодит өгөгдөл дээр батлагдсан)."""
    if not code:
        return None
    return load_signatures()["locationCodePrefixRule"]["prefixes"].get(code[0])


def map_exclusivity(raw: Any) -> str | None:
    text = norm_text(raw)
    if text is None:
        return None
    return load_signatures()["valueMaps"]["exclusivity"].get(text.upper())


def _num_repr(value: float | None) -> str:
    """Хөвөгч таслалын дүрслэлийг тогтвортой болгоно (hash-д ашиглана)."""
    if value is None:
        return ""
    return f"{value:.6f}"


def dedupe_key(dataset_type: str, parts: list[Any], occurrence: int) -> str:
    """
    Давхардлаас хамгаалах түлхүүр.

    occurrence нь ФАЙЛ ДОТОРХ ижил бизнес-мөрийн дугаарлалт (0,1,2…).
    Ингэснээр:
      • нэг файлыг ДАХИН upload хийвэл ижил түлхүүр гарч upsert давхардуулахгүй
      • ижил хэмжээтэй ҮНЭХЭЭР тусдаа гүйлгээнүүд (эх өгөгдөлд Sales дээр 2,397 мөр)
        өөр occurrence авч ХАДГАЛАГДАНА
    """
    canonical = "|".join(
        [dataset_type]
        + [_num_repr(p) if isinstance(p, float) else ("" if p is None else str(p)) for p in parts]
        + [str(occurrence)]
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def business_tuple(dataset_type: str, row: dict[str, Any]) -> tuple:
    """dedupe-д оролцох бизнес талбарууд (dataset тус бүрээр)."""
    if dataset_type == "SALES":
        return (
            row.get("product_code"),
            row.get("location_code"),
            row.get("company_code"),
            row.get("period_key"),
            _num_repr(row.get("quantity")),
            _num_repr(row.get("cogs_amount")),
        )
    if dataset_type == "PURCHASE":
        return (
            row.get("product_code"),
            row.get("location_code"),
            row.get("company_code"),
            row.get("supplier_code"),
            row.get("period_key"),
            _num_repr(row.get("quantity")),
            _num_repr(row.get("amount_ex_vat")),
        )
    if dataset_type == "STOCK":
        return (
            row.get("product_code"),
            row.get("location_code"),
            row.get("period_key"),
        )
    raise ValueError(f"dedupe дэмжигдээгүй dataset: {dataset_type}")


def is_present(raw: Any) -> bool:
    """Эх нүд хоосон биш эсэх ("хоосон" ба "буруу утга"-г ялгахад хэрэгтэй)."""
    return norm_text(raw) is not None


def normalize_row(dataset_type: str, raw: dict[str, Any]) -> dict[str, Any]:
    """
    role → түүхий утга бүхий dict-ийг нормчилсон мөр болгоно.
    Эх dict-ийг ӨӨРЧЛӨХГҮЙ.
    """
    non_numeric: list[str] = []

    def coerce(value: Any, role: str) -> float | None:
        """Утга БАЙГАА атлаа тоо болохгүй бол тэмдэглэнэ."""
        num = to_number(value)
        if num is None and is_present(value):
            non_numeric.append(role)
        return num

    year = to_int(raw.get("year"))
    month = to_int(raw.get("month"))
    if year is None and is_present(raw.get("year")):
        non_numeric.append("year")
    if month is None and is_present(raw.get("month")):
        non_numeric.append("month")

    raw_present = {
        "year": is_present(raw.get("year")),
        "month": is_present(raw.get("month")),
        "quantity": is_present(raw.get("quantity")),
        "cogsAmount": is_present(raw.get("cogsAmount")),
        "amountExVat": is_present(raw.get("amountExVat")),
        "salesAmountExVat": is_present(raw.get("salesAmountExVat")),
        "quantityOnHand": is_present(raw.get("quantityOnHand")),
        "stockValue": is_present(raw.get("stockValue")),
    }

    row: dict[str, Any] = {
        "raw_present": raw_present,
        "non_numeric_fields": non_numeric,
        "product_code": norm_product_code(raw.get("productCode")),
        "product_name": norm_text(raw.get("productName")),
        "manufacturer_name": norm_text(raw.get("manufacturer")),
        "exclusivity": map_exclusivity(raw.get("exclusivity")),
        "exclusivity_raw": norm_text(raw.get("exclusivity")),
        "year": year,
        "month": month,
        "period_key": period_key(year, month),
        "location_code": norm_code(raw.get("locationCode")),
        "location_type": map_location_type(raw.get("locationType")),
        "location_type_raw": norm_text(raw.get("locationType")),
        "company_code": norm_code(raw.get("companyCode")),
    }

    if dataset_type == "SALES":
        qty = coerce(raw.get("quantity"), "quantity")
        amount = coerce(raw.get("cogsAmount"), "cogsAmount")
        # ⚠️ Борлуулалтын ОРЛОГО — «Худалдах НӨАТ-гүй дүн» багана байвал л.
        #    Байхгүй бол None хэвээр: тоо ЗОХИОХГҮЙ.
        net_sales = coerce(raw.get("salesAmountExVat"), "salesAmountExVat")
        row.update(
            quantity=qty,
            cogs_amount=amount,
            net_sales_amount=net_sales,
            is_return=qty is not None and qty < 0,
            unit_cogs=(amount / qty) if (qty not in (None, 0) and amount is not None) else None,
        )
    elif dataset_type == "PURCHASE":
        qty = coerce(raw.get("quantity"), "quantity")
        amount = coerce(raw.get("amountExVat"), "amountExVat")
        row.update(
            supplier_code=norm_code(raw.get("supplierCode")),
            quantity=qty,
            amount_ex_vat=amount,
            is_return=qty is not None and qty < 0,
            unit_price=(amount / qty) if (qty not in (None, 0) and amount is not None) else None,
        )
    elif dataset_type == "STOCK":
        qty = coerce(raw.get("quantityOnHand"), "quantityOnHand")
        value = coerce(raw.get("stockValue"), "stockValue")
        row.update(
            quantity_on_hand=qty,
            stock_value=value,
            unit_cost=(value / qty) if (qty not in (None, 0) and value is not None) else None,
        )
    elif dataset_type == "PRODUCT":
        row.update(atc_code=norm_text(raw.get("atcCode")), pack_size=norm_text(raw.get("packSize")))
    elif dataset_type == "LOCATION":
        row.update(location_name=norm_text(raw.get("locationName")))
    elif dataset_type == "CHANNEL":
        row.update(
            channel_code=norm_code(raw.get("channelCode")),
            channel_name=norm_text(raw.get("channelName")),
        )

    return row
