"""
Ingest pipeline: read → detect → master → normalize → validate → report.

Энэ модуль DB рүү БИЧИХГҮЙ. Гаралт нь TypeScript service-ийн буцаадагтай
ЯГ ИЖИЛ бүтэцтэй тайлан — ингэснээр хоёр давхаргын дүнг тулгаж болно.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import openpyxl

from .config_loader import normalize_header
from .detect import Detection, detect_sheet, map_headers_to_roles
from .normalize import dedupe_key, business_tuple, normalize_row
from .validate import Issue, MasterIndex, mark_duplicates, row_status, validate_row

FACT_TYPES = ("SALES", "PURCHASE", "STOCK")


@dataclass
class SheetData:
    name: str
    index: int
    headers: list[Any]
    rows: list[list[Any]]

    @property
    def row_count(self) -> int:
        return len(self.rows)


@dataclass
class SheetResult:
    detection: Detection
    normalized: list[dict[str, Any]] = field(default_factory=list)
    issues: list[Issue] = field(default_factory=list)
    statuses: list[str] = field(default_factory=list)
    dedupe_keys: list[str] = field(default_factory=list)


def read_workbook(path: Path) -> list[SheetData]:
    """Excel-ийг унших. Эх файлыг ӨӨРЧЛӨХГҮЙ (read_only)."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheets: list[SheetData] = []
    try:
        for idx, ws in enumerate(wb.worksheets):
            rows_iter = ws.iter_rows(values_only=True)
            try:
                headers = list(next(rows_iter))
            except StopIteration:
                sheets.append(SheetData(ws.title, idx, [], []))
                continue
            body = [list(r) for r in rows_iter if any(c is not None for c in r)]
            sheets.append(SheetData(ws.title, idx, headers, body))
    finally:
        wb.close()
    return sheets


def _row_to_roles(headers: list[Any], roles: dict[str, str], row: list[Any]) -> dict[str, Any]:
    """Excel мөрийг role → түүхий утга dict болгоно."""
    header_pos = {normalize_header(h): i for i, h in enumerate(headers)}
    out: dict[str, Any] = {}
    for role, source_col in roles.items():
        pos = header_pos.get(normalize_header(source_col))
        out[role] = row[pos] if pos is not None and pos < len(row) else None
    return out


def build_masters(
    sheets: list[SheetData], detections: list[Detection]
) -> tuple[MasterIndex, list[Issue]]:
    """
    Лавлах үүсгэх. Master sheet байвал ТЭР давуу эрхтэй; байхгүй бол
    fact sheet-үүдээс гарган авна (одоогийн эх файлын тохиолдол).
    """
    master = MasterIndex()
    issues: list[Issue] = []

    product_attrs: dict[str, Counter] = defaultdict(Counter)
    product_first_row: dict[str, tuple[str, int]] = {}
    location_company: dict[str, Counter] = defaultdict(Counter)
    location_type: dict[str, Counter] = defaultdict(Counter)

    for sheet, det in zip(sheets, detections):
        if not det.is_recognized:
            continue
        roles = map_headers_to_roles(sheet.headers)

        if det.dataset_type == "PRODUCT":
            master.product_source_present = True
        if det.dataset_type == "LOCATION":
            master.location_source_present = True
        if det.dataset_type == "CHANNEL":
            master.channel_source_present = True

        for i, raw_row in enumerate(sheet.rows):
            raw = _row_to_roles(sheet.headers, roles, raw_row)
            row = normalize_row(det.dataset_type, raw)

            if det.dataset_type == "CHANNEL":
                code = row.get("channel_code")
                if code:
                    master.channels[code] = {"name": row.get("channel_name")}
                continue

            code = row.get("product_code")
            if code:
                product_attrs[code][
                    (row.get("product_name"), row.get("manufacturer_name"), row.get("exclusivity"))
                ] += 1
                product_first_row.setdefault(code, (sheet.name, i + 2))

            loc = row.get("location_code")
            if loc:
                if row.get("company_code"):
                    location_company[loc][row["company_code"]] += 1
                ltype = row.get("location_type")
                if ltype:
                    location_type[loc][ltype] += 1

    # Бүтээгдэхүүний лавлах — хамгийн олон давтагдсан атрибутыг авна
    for code, counter in product_attrs.items():
        (name, manufacturer, exclusivity), _ = counter.most_common(1)[0]
        master.products[code] = {
            "name": name,
            "manufacturer_name": manufacturer,
            "exclusivity": exclusivity,
        }
        if len(counter) > 1:
            sheet_name, row_no = product_first_row[code]
            issues.append(
                Issue(
                    code="PRODUCT_ATTRIBUTE_CONFLICT",
                    severity="WARNING",
                    sheet_name=sheet_name,
                    row_no=row_no,
                    column=None,
                    value=code,
                    message=f"{code}: {len(counter)} өөр атрибутын хослол илэрсэн",
                )
            )

    # Байршлын лавлах
    for loc, counter in location_company.items():
        master.locations.setdefault(loc, {})["company_code"] = counter.most_common(1)[0][0]
    for loc, counter in location_type.items():
        master.locations.setdefault(loc, {})["type"] = counter.most_common(1)[0][0]

    return master, issues


def process_sheet(sheet: SheetData, det: Detection, master: MasterIndex) -> SheetResult:
    result = SheetResult(detection=det)
    if det.dataset_type not in FACT_TYPES:
        return result

    roles = map_headers_to_roles(sheet.headers)

    for raw_row in sheet.rows:
        raw = _row_to_roles(sheet.headers, roles, raw_row)
        result.normalized.append(normalize_row(det.dataset_type, raw))

    occurrences, dup_issues = mark_duplicates(det.dataset_type, result.normalized, sheet.name)
    dup_by_row: dict[int, list[Issue]] = defaultdict(list)
    for issue in dup_issues:
        dup_by_row[issue.row_no].append(issue)

    for i, row in enumerate(result.normalized):
        row_no = i + 2
        issues = validate_row(det.dataset_type, row, sheet.name, row_no, roles, master)
        issues.extend(dup_by_row.get(row_no, []))
        result.issues.extend(issues)
        result.statuses.append(row_status(issues))

        row["occurrence_index"] = occurrences[i]
        key = dedupe_key(
            det.dataset_type, list(business_tuple(det.dataset_type, row)), occurrences[i]
        )
        row["dedupe_key"] = key
        row["source_row_no"] = row_no
        result.dedupe_keys.append(key)

    return result


def run(path: Path, max_issue_rows: int = 200) -> dict[str, Any]:
    """Бүрэн pipeline ажиллуулж, тайлан буцаана."""
    sheets = read_workbook(path)
    detections = [detect_sheet(s.name, s.index, s.headers) for s in sheets]
    master, master_issues = build_masters(sheets, detections)

    results = [process_sheet(s, d, master) for s, d in zip(sheets, detections)]

    all_issues: list[Issue] = list(master_issues)
    counts = Counter()
    for res in results:
        all_issues.extend(res.issues)
        counts.update(res.statuses)

    issue_counter = Counter((i.code, i.severity) for i in all_issues)

    sheet_report = []
    for s, d, r in zip(sheets, detections, results):
        roles = map_headers_to_roles(s.headers)
        mapped_headers = {normalize_header(v) for v in roles.values()}
        unmapped = [
            str(h) for h in s.headers if h is not None and normalize_header(h) not in mapped_headers
        ]
        sheet_report.append(
            {
                "name": s.name,
                "index": s.index,
                "datasetType": d.dataset_type,
                "confidence": d.confidence,
                "rowCount": s.row_count,
                "columnCount": len(s.headers),
                "matchedRoles": d.matched_roles,
                "unmappedColumns": unmapped,
                "missingRequired": d.missing_required,
                "reason": d.reason,
                "insertableRows": sum(1 for st in r.statuses if st != "ERROR"),
            }
        )

    return {
        "file": {
            "name": path.name,
            "sizeBytes": path.stat().st_size,
            "sheetCount": len(sheets),
            "totalRows": sum(s.row_count for s in sheets),
        },
        "sheets": sheet_report,
        "masters": {
            "products": len(master.products),
            "locations": len(master.locations),
            "channels": len(master.channels),
            "productSourceSheet": master.product_source_present,
            "locationSourceSheet": master.location_source_present,
            "channelCheckSkipped": not master.has_channels(),
        },
        "quality": {
            "valid": counts.get("VALID", 0),
            "warning": counts.get("WARNING", 0),
            "error": counts.get("ERROR", 0),
            "total": sum(counts.values()),
        },
        "issueSummary": sorted(
            (
                {"code": code, "severity": sev, "count": n}
                for (code, sev), n in issue_counter.items()
            ),
            key=lambda x: (x["severity"] != "ERROR", -x["count"]),
        ),
        "issues": [i.as_dict() for i in all_issues[:max_issue_rows]],
        "issuesTruncated": max(0, len(all_issues) - max_issue_rows),
        "periodsAvailable": sorted(
            {
                row["period_key"]
                for res in results
                for row in res.normalized
                if row.get("period_key")
            }
        ),
    }
