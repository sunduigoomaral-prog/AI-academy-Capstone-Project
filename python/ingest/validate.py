"""
Data validation — дүрмүүд `src/config/validation-rules.json`-оос ирнэ.

ERROR   → мөр DB-д ОРОХГҮЙ
WARNING → мөр ОРНО, гэхдээ тэмдэглэгдэнэ
VALID   → ямар ч асуудалгүй
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from .config_loader import rule_message, rule_severity
from .normalize import business_tuple, location_type_from_code


@dataclass
class Issue:
    code: str
    severity: str
    sheet_name: str
    row_no: int
    """Excel дэх БОДИТ мөрийн дугаар (header = 1)"""
    column: str | None
    value: str | None
    message: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "severity": self.severity,
            "sheet": self.sheet_name,
            "row": self.row_no,
            "column": self.column,
            "value": self.value,
            "message": self.message,
        }


def _issue(code: str, sheet: str, row_no: int, column: str | None, value: Any) -> Issue:
    return Issue(
        code=code,
        severity=rule_severity(code),
        sheet_name=sheet,
        row_no=row_no,
        column=column,
        value=None if value is None else str(value)[:120],
        message=rule_message(code),
    )


class MasterIndex:
    """
    Лавлахууд. Master sheet байвал түүнээс, эс бөгөөс файлын бүх fact sheet-ээс
    гаргаж авна (Phase 1-д батлагдсан: эх файлд master sheet БАЙХГҮЙ).
    """

    def __init__(self) -> None:
        self.products: dict[str, dict[str, Any]] = {}
        self.locations: dict[str, dict[str, Any]] = {}
        self.channels: dict[str, dict[str, Any]] = {}
        self.channel_source_present = False
        self.product_source_present = False
        self.location_source_present = False

    def has_channels(self) -> bool:
        return self.channel_source_present


def validate_row(
    dataset_type: str,
    row: dict[str, Any],
    sheet: str,
    row_no: int,
    source_columns: dict[str, str],
    master: MasterIndex,
) -> list[Issue]:
    """Нэг мөрийн бүх шалгалт. Дараалал нь тайланд гарах дараалал."""
    issues: list[Issue] = []
    col = source_columns  # role → эх баганын бодит нэр

    # ── Заавал байх талбарууд ──
    if not row.get("product_code"):
        issues.append(_issue("MISSING_PRODUCT_CODE", sheet, row_no, col.get("productCode"), None))
    if not row.get("product_name"):
        issues.append(_issue("MISSING_PRODUCT_NAME", sheet, row_no, col.get("productName"), None))

    # Утга БАЙГАА атлаа тоо болж хөрвөөгүй талбарууд — "хоосон"-оос ялгаатай оношилгоо
    for field in row.get("non_numeric_fields", []):
        issues.append(_issue("NON_NUMERIC_VALUE", sheet, row_no, col.get(field), field))

    present = row.get("raw_present", {})

    if dataset_type in ("SALES", "PURCHASE", "STOCK"):
        year, month = row.get("year"), row.get("month")
        if not present.get("year") or not present.get("month"):
            issues.append(_issue("MISSING_DATE", sheet, row_no, col.get("month"), None))
        elif row.get("period_key") is None:
            issues.append(
                _issue("INVALID_DATE", sheet, row_no, col.get("month"), f"{year}-{month}")
            )

        if not row.get("location_code"):
            issues.append(
                _issue("MISSING_LOCATION_CODE", sheet, row_no, col.get("locationCode"), None)
            )
        if not row.get("company_code"):
            issues.append(
                _issue("MISSING_COMPANY_CODE", sheet, row_no, col.get("companyCode"), None)
            )

        # ── Байршлын төрөл ──
        raw_type = row.get("location_type_raw")
        mapped = row.get("location_type")
        if raw_type is not None and mapped is None:
            issues.append(
                _issue("UNKNOWN_LOCATION_TYPE", sheet, row_no, col.get("locationType"), raw_type)
            )
        by_prefix = location_type_from_code(row.get("location_code"))
        if mapped and by_prefix and mapped != by_prefix:
            issues.append(
                _issue(
                    "LOCATION_TYPE_CONFLICT",
                    sheet,
                    row_no,
                    col.get("locationType"),
                    f"{raw_type} ({mapped}) vs код {row.get('location_code')} → {by_prefix}",
                )
            )

        if row.get("exclusivity_raw") is not None and row.get("exclusivity") is None:
            issues.append(
                _issue(
                    "UNKNOWN_EXCLUSIVITY",
                    sheet,
                    row_no,
                    col.get("exclusivity"),
                    row.get("exclusivity_raw"),
                )
            )

    # ── Тоон талбарууд ──
    if dataset_type in ("SALES", "PURCHASE"):
        qty = row.get("quantity")
        if qty is None and not present.get("quantity"):
            issues.append(_issue("MISSING_QUANTITY", sheet, row_no, col.get("quantity"), None))
        elif qty is not None:
            if qty < 0:
                issues.append(_issue("NEGATIVE_QUANTITY", sheet, row_no, col.get("quantity"), qty))
            elif qty == 0:
                issues.append(_issue("ZERO_QUANTITY", sheet, row_no, col.get("quantity"), qty))

    if dataset_type == "SALES":
        amount = row.get("cogs_amount")
        if amount is None and not present.get("cogsAmount"):
            issues.append(
                _issue("MISSING_SALES_AMOUNT", sheet, row_no, col.get("cogsAmount"), None)
            )
        elif amount is not None and row.get("quantity") == 0 and amount != 0:
            issues.append(
                _issue("ZERO_QTY_NONZERO_AMOUNT", sheet, row_no, col.get("cogsAmount"), amount)
            )

    if dataset_type == "PURCHASE":
        amount = row.get("amount_ex_vat")
        if amount is None and not present.get("amountExVat"):
            issues.append(
                _issue("MISSING_PURCHASE_AMOUNT", sheet, row_no, col.get("amountExVat"), None)
            )
        elif amount is not None and row.get("quantity") == 0 and amount != 0:
            issues.append(
                _issue("ZERO_QTY_NONZERO_AMOUNT", sheet, row_no, col.get("amountExVat"), amount)
            )

    if dataset_type == "STOCK":
        qty = row.get("quantity_on_hand")
        if qty is None and not present.get("quantityOnHand"):
            issues.append(
                _issue("MISSING_STOCK_QUANTITY", sheet, row_no, col.get("quantityOnHand"), None)
            )
        elif qty is not None and qty < 0:
            issues.append(
                _issue("NEGATIVE_STOCK", sheet, row_no, col.get("quantityOnHand"), qty)
            )

    # ── Лавлахтай тулгалт ──
    if dataset_type in ("SALES", "PURCHASE", "STOCK"):
        code = row.get("product_code")
        if code and code not in master.products:
            issues.append(_issue("UNMATCHED_PRODUCT", sheet, row_no, col.get("productCode"), code))

        loc = row.get("location_code")
        if loc and loc not in master.locations:
            issues.append(_issue("UNMATCHED_LOCATION", sheet, row_no, col.get("locationCode"), loc))
        elif loc:
            known_company = master.locations[loc].get("company_code")
            if (
                known_company
                and row.get("company_code")
                and known_company != row.get("company_code")
            ):
                issues.append(
                    _issue(
                        "COMPANY_LOCATION_CONFLICT",
                        sheet,
                        row_no,
                        col.get("companyCode"),
                        f"{loc} → {row.get('company_code')} vs {known_company}",
                    )
                )

        # Сувгийн лавлах эх өгөгдөлд байхгүй бол ЭНЭ ШАЛГАЛТ АЛГАСАГДАНА
        if master.has_channels():
            ch = row.get("channel_code")
            if ch and ch not in master.channels:
                issues.append(_issue("UNMATCHED_CHANNEL", sheet, row_no, None, ch))

    return issues


def row_status(issues: Iterable[Issue]) -> str:
    severities = {i.severity for i in issues}
    if "ERROR" in severities:
        return "ERROR"
    if "WARNING" in severities:
        return "WARNING"
    return "VALID"


def mark_duplicates(
    dataset_type: str,
    rows: list[dict[str, Any]],
    sheet: str,
) -> tuple[list[int], list[Issue]]:
    """
    Файл доторх давхардлыг илрүүлж, occurrence index оноож өгнө.

    SALES / PURCHASE  → давхардал нь WARNING (ижил хэмжээтэй тусдаа нэхэмжлэх байж болно),
                        мөр УСТГАГДАХГҮЙ.
    STOCK             → (бараа, байршил, сар) давхардвал ERROR — snapshot давхардах ёсгүй.
    """
    seen: dict[tuple, int] = {}
    occurrences: list[int] = []
    issues: list[Issue] = []

    for idx, row in enumerate(rows):
        key = business_tuple(dataset_type, row)
        occ = seen.get(key, 0)
        seen[key] = occ + 1
        occurrences.append(occ)

        if occ > 0:
            code = "DUPLICATE_STOCK_ROW" if dataset_type == "STOCK" else "DUPLICATE_TRANSACTION"
            issues.append(
                _issue(
                    code,
                    sheet,
                    idx + 2,  # header = мөр 1
                    None,
                    f"{occ + 1} дэх давталт: {row.get('product_code')} / "
                    f"{row.get('location_code')} / {row.get('period_key')}",
                )
            )

    return occurrences, issues
