"""
Sheet detection — баганын бүтцээр (role-оор) таних.

Sheet-ийн НЭР шийдэхгүй. Нэр нь зөвхөн оноо тэнцсэн үед л нэмэлт жин өгнө.
Ингэснээр 'Sales' биш 'Борлуулалт 2026' гэсэн нэртэй sheet ч зөв танигдана.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .config_loader import alias_lookup, load_signatures, normalize_header


@dataclass
class Detection:
    sheet_name: str
    sheet_index: int
    dataset_type: str
    confidence: float
    matched_roles: dict[str, str] = field(default_factory=dict)
    """role → эх баганын БОДИТ нэр (Excel дээрхээр, өөрчлөгдөөгүй)"""
    missing_required: list[str] = field(default_factory=list)
    reason: str = ""

    @property
    def is_recognized(self) -> bool:
        return self.dataset_type != "UNKNOWN"


def map_headers_to_roles(headers: list[Any]) -> dict[str, str]:
    """
    Эх баганын нэрсийг role руу буулгана.
    Буцаах: role → эх баганын бодит нэр.
    Нэг role-д хэд таарвал ЭХНИЙХ нь (alias-ийн эрэмбээр хамгийн эхэнд байгаа) ялна.
    """
    aliases = alias_lookup()
    norm_headers = {normalize_header(h): h for h in headers if h is not None}

    resolved: dict[str, str] = {}
    for role, alias_list in aliases.items():
        for alias in alias_list:
            if alias in norm_headers:
                resolved[role] = norm_headers[alias]
                break
    return resolved


def detect_sheet(sheet_name: str, sheet_index: int, headers: list[Any]) -> Detection:
    signatures = load_signatures()
    roles = map_headers_to_roles(headers)
    present = set(roles)
    name_norm = normalize_header(sheet_name)

    best: Detection | None = None

    for ds in signatures["datasets"]:
        required = set(ds["requiredRoles"])
        optional = set(ds.get("optionalRoles", []))
        disqualifying = set(ds.get("disqualifyingRoles", []))

        blocked = disqualifying & present
        missing = sorted(required - present)

        if blocked or missing:
            continue

        # Оноо: заавал шаардлагатай нь 100%, нэмэлт нь 30% жинтэй, нэрийн таарц 5% бонус
        opt_hit = len(optional & present) / len(optional) if optional else 1.0
        name_hit = any(h in name_norm for h in map(normalize_header, ds.get("nameHints", [])))
        score = 1.0 + 0.3 * opt_hit + (0.05 if name_hit else 0.0)

        candidate = Detection(
            sheet_name=sheet_name,
            sheet_index=sheet_index,
            dataset_type=ds["type"],
            confidence=round(score / 1.35, 4),
            matched_roles={r: roles[r] for r in sorted(required | (optional & present))},
            reason=f"{len(required)} заавал role бүрэн таарсан"
            + (", sheet нэр давхар таарсан" if name_hit else ""),
        )
        if best is None or candidate.confidence > best.confidence:
            best = candidate

    if best is not None:
        return best

    # Танигдаагүй — хамгийн ойрхон нэр дэвшигчийн дутуу role-уудыг тайлбарлана
    closest_missing: list[str] = []
    closest_type = ""
    best_overlap = -1
    for ds in signatures["datasets"]:
        required = set(ds["requiredRoles"])
        overlap = len(required & present)
        if overlap > best_overlap:
            best_overlap = overlap
            closest_type = ds["type"]
            closest_missing = sorted(required - present)

    return Detection(
        sheet_name=sheet_name,
        sheet_index=sheet_index,
        dataset_type="UNKNOWN",
        confidence=0.0,
        matched_roles=roles,
        missing_required=closest_missing,
        reason=(
            f"Аль ч dataset-д таарсангүй. Хамгийн ойр нь {closest_type}, "
            f"дутуу role: {', '.join(closest_missing) or 'байхгүй'}"
        ),
    )
