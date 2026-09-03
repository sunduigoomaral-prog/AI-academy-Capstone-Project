"""
Ingest дүрмүүдийн тест.

Бодит эх файл (`Data AI.xlsx`) 0 ERROR өгдөг тул ERROR замууд бодит өгөгдлөөр
ШАЛГАГДАХГҮЙ. Энэ тест нь ЦЭВЭР ФУНКЦҮҮДИЙГ санах ойд шалгана —
бизнесийн хуурамч өгөгдөл үүсгэхгүй, дискэнд юу ч бичихгүй.

Ажиллуулах:
    set PYTHONIOENCODING=utf-8
    python python/tests/test_rules.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ingest.detect import detect_sheet  # noqa: E402
from ingest.normalize import normalize_row, norm_product_code, period_key, to_number  # noqa: E402
from ingest.validate import (  # noqa: E402
    MasterIndex,
    mark_duplicates,
    row_status,
    validate_row,
)

COLUMNS = {
    "productCode": "Дотоод код",
    "productName": "Бүтээгдэхүүний нэрс",
    "quantity": "Тоо",
    "cogsAmount": "Өртөг",
    "quantityOnHand": "Үлдэглэл",
    "year": "Он",
    "month": "Сар",
    "locationCode": "Суваг",
    "companyCode": "ХХК",
    "locationType": "Төрөл",
    "exclusivity": "Ангилал",
}

BASE_SALES = dict(
    productCode="0100139",
    productName="Тест бараа",
    quantity=5,
    cogsAmount=1000,
    year=2026,
    month=5,
    locationCode="300127",
    companyCode="200127",
    locationType="ЭХНТ",
    exclusivity="Ex",
)


def make_master() -> MasterIndex:
    master = MasterIndex()
    master.products["0100139"] = {}
    master.locations["300127"] = {"company_code": "200127", "type": "WAREHOUSE"}
    return master


def run() -> int:
    master = make_master()
    failures: list[str] = []

    def expect(name: str, raw: dict, dataset: str, codes: list[str], status: str) -> None:
        row = normalize_row(dataset, raw)
        issues = validate_row(dataset, row, "T", 2, COLUMNS, master)
        found = {i.code for i in issues}
        actual_status = row_status(issues)
        ok = set(codes) <= found and actual_status == status
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
        if not ok:
            failures.append(f"{name}: expected {codes}/{status}, got {sorted(found)}/{actual_status}")

    print("ERROR замууд")
    expect("product code хоосон", {**BASE_SALES, "productCode": None}, "SALES",
           ["MISSING_PRODUCT_CODE"], "ERROR")
    expect("Он хоосон", {**BASE_SALES, "year": None}, "SALES", ["MISSING_DATE"], "ERROR")
    expect("Сар = 13", {**BASE_SALES, "month": 13}, "SALES", ["INVALID_DATE"], "ERROR")
    expect("Тоо = текст", {**BASE_SALES, "quantity": "олон"}, "SALES",
           ["NON_NUMERIC_VALUE"], "ERROR")
    expect("Өртөг хоосон", {**BASE_SALES, "cogsAmount": None}, "SALES",
           ["MISSING_SALES_AMOUNT"], "ERROR")
    expect("Суваг хоосон", {**BASE_SALES, "locationCode": None}, "SALES",
           ["MISSING_LOCATION_CODE"], "ERROR")
    expect("танихгүй бараа", {**BASE_SALES, "productCode": "9999999"}, "SALES",
           ["UNMATCHED_PRODUCT"], "ERROR")
    expect("танихгүй байршил", {**BASE_SALES, "locationCode": "399999"}, "SALES",
           ["UNMATCHED_LOCATION"], "ERROR")
    expect("Төрөл vs кодын зөрчил", {**BASE_SALES, "locationType": "ЭС"}, "SALES",
           ["LOCATION_TYPE_CONFLICT"], "ERROR")
    expect("компани–байршил зөрчил", {**BASE_SALES, "companyCode": "200120"}, "SALES",
           ["COMPANY_LOCATION_CONFLICT"], "ERROR")
    expect("танихгүй Төрөл", {**BASE_SALES, "locationType": "XYZ"}, "SALES",
           ["UNKNOWN_LOCATION_TYPE"], "ERROR")
    expect(
        "сөрөг үлдэгдэл",
        dict(productCode="0100139", productName="Тест", quantityOnHand=-3, stockValue=10,
             year=2026, month=6, locationCode="300127", companyCode="200127",
             locationType="ЭХНТ"),
        "STOCK",
        ["NEGATIVE_STOCK"],
        "ERROR",
    )

    print("\nWARNING замууд (мөр ХАДГАЛАГДАНА)")
    expect("сөрөг тоо = буцаалт", {**BASE_SALES, "quantity": -2}, "SALES",
           ["NEGATIVE_QUANTITY"], "WARNING")
    expect("тоо = 0", {**BASE_SALES, "quantity": 0, "cogsAmount": 0}, "SALES",
           ["ZERO_QUANTITY"], "WARNING")
    expect("тоо=0, дүн≠0", {**BASE_SALES, "quantity": 0}, "SALES",
           ["ZERO_QUANTITY", "ZERO_QTY_NONZERO_AMOUNT"], "WARNING")
    expect("нэр хоосон", {**BASE_SALES, "productName": None}, "SALES",
           ["MISSING_PRODUCT_NAME"], "WARNING")
    expect("танихгүй Ангилал", {**BASE_SALES, "exclusivity": "Zzz"}, "SALES",
           ["UNKNOWN_EXCLUSIVITY"], "WARNING")

    print("\nЦэвэр мөр")
    expect("асуудалгүй мөр", dict(BASE_SALES), "SALES", [], "VALID")

    print("\nНормчлол")
    norm_cases = [
        ("тэргүүлэх 0 хадгалагдана", norm_product_code(" 0100139 ") == "0100139"),
        ("том үсэг", norm_product_code("ab12c") == "AB12C"),
        ("доторх зай арилна", norm_product_code("01 001 39") == "0100139"),
        ("100139.0 → 100139", norm_product_code("100139.0") == "100139"),
        ("ISO сар", period_key(2026, 5) == "2026-05"),
        ("сар 13 → None", period_key(2026, 13) is None),
        ("1 234,56 → 1234.56", to_number("1 234,56") == 1234.56),
        ("текст → None (0 болгохгүй)", to_number("олон") is None),
    ]
    for name, ok in norm_cases:
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
        if not ok:
            failures.append(f"нормчлол: {name}")

    print("\nSheet detection (нэрнээс хамаарахгүй)")
    headers = [
        "Дотоод код", "Бүтээгдэхүүний нэрс", "Үйлдвэрлэгч ", "Ангилал",
        "Тоо", "Өртөг", "Он", "Сар", "Төрөл", "Суваг", "ХХК",
    ]
    detect_cases = [
        ("монгол нэртэй sheet", detect_sheet("Борлуулалт 2026", 0, headers).dataset_type, "SALES"),
        ("утгагүй нэртэй sheet", detect_sheet("Sheet1", 0, headers).dataset_type, "SALES"),
        ("танихгүй sheet", detect_sheet("Санамсаргүй", 0, ["А", "Б", "В"]).dataset_type, "UNKNOWN"),
    ]
    for name, actual, want in detect_cases:
        ok = actual == want
        print(f"  {'PASS' if ok else 'FAIL'}  {name} → {actual}")
        if not ok:
            failures.append(f"detection: {name} → {actual}, хүлээсэн {want}")

    print("\nDedupe")
    rows = [normalize_row("SALES", dict(BASE_SALES)) for _ in range(3)]
    occurrences, dup_issues = mark_duplicates("SALES", rows, "T")
    ok = occurrences == [0, 1, 2] and len(dup_issues) == 2
    print(f"  {'PASS' if ok else 'FAIL'}  occurrence={occurrences}, issue={len(dup_issues)}")
    if not ok:
        failures.append("dedupe: occurrence index буруу")

    print()
    if failures:
        print(f"АМЖИЛТГҮЙ: {len(failures)}")
        for f in failures:
            print(f"  • {f}")
        return 1

    print("Бүх тест PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
