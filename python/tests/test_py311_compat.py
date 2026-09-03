"""
PYTHON 3.11 НИЙЦЛИЙН ШАЛГАЛТ.

    set PYTHONIOENCODING=utf-8
    python python/tests/test_py311_compat.py

ЯАГААД ХЭРЭГТЭЙ ВЭ:
    Хөгжүүлэлт Python 3.13 дээр, байршуулалт 3.11 дээр явдаг
    (`nixpacks.toml` → NIXPACKS_PYTHON_VERSION). Python 3.12-оос эхлэн
    (PEP 701) f-string дотор ГАДНА талын хашилттай ИЖИЛ хашилт
    ашиглахыг зөвшөөрсөн:

        f"...{" x" if c else ""}..."      # 3.12+ дээр л ажиллана

    Энэ нь 3.11 дээр `SyntaxError: f-string: expecting '}'` өгнө.
    Локал дээр 3.13 ажиллаж байгаа тул `ast.parse` үүнийг ИЛРҮҮЛЭХГҮЙ —
    `ast.parse(feature_version=(3, 11))` ч барьдаггүй (энэ нь
    tokenizer-ийн түвшний ялгаа).

    Тиймээс эх кодыг өөрөө уншиж шалгана.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#: Шалгах файлууд
TARGETS = [ROOT / "app.py"] + sorted(
    f for f in (ROOT / "python").rglob("*.py") if "__pycache__" not in f.parts
)

PREFIX_CHARS = set("fFrRbBuU")

failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"   {detail}" if detail and not ok else ""))
    if not ok:
        failures.append(f"{name} {detail}")


def nested_quote_fstrings(source: str) -> list[tuple[int, str]]:
    """f-string дотор гадна талынхтай ИЖИЛ хашилт ашигласан газруудыг олно.

    Энгийн төлөвт машин: мөр мөрөөр биш, тэмдэгт тэмдэгтээр явж
    мөрийн дугаарыг тоолно.
    """
    found: list[tuple[int, str]] = []
    i, line_no, n = 0, 1, len(source)

    while i < n:
        ch = source[i]

        if ch == "\n":
            line_no += 1
            i += 1
            continue

        # Тайлбар — мөрийн төгсгөл хүртэл алгасна
        if ch == "#":
            while i < n and source[i] != "\n":
                i += 1
            continue

        # Мөрийн эхлэл байж болзошгүй: угтвар (f, r, b …) + хашилт
        if ch in PREFIX_CHARS or ch in "\"'":
            start = i
            prefix = ""
            while i < n and source[i] in PREFIX_CHARS:
                prefix += source[i]
                i += 1

            if i >= n or source[i] not in "\"'":
                # Угтвар биш — жирийн танигч байсан. Түүнийг бүхэлд нь алгасна.
                i = start
                while i < n and (source[i].isalnum() or source[i] == "_"):
                    i += 1
                if i == start:
                    i += 1
                continue

            quote = source[i]
            triple = source[i:i + 3] in ('"""', "'''")
            delim = quote * 3 if triple else quote
            i += len(delim)

            is_f = "f" in prefix.lower()
            is_raw = "r" in prefix.lower()
            depth = 0
            body_start_line = line_no

            while i < n:
                c = source[i]

                if c == "\n":
                    line_no += 1
                    if not triple:
                        break          # нэг мөрийн хашилт хаагдаагүй — цааш алгасна
                    i += 1
                    continue

                if c == "\\" and not is_raw:
                    i += 2
                    continue

                if is_f and c == "{":
                    if source[i:i + 2] == "{{":
                        i += 2
                        continue
                    depth += 1
                    i += 1
                    continue

                if is_f and c == "}":
                    if source[i:i + 2] == "}}":
                        i += 2
                        continue
                    depth = max(0, depth - 1)
                    i += 1
                    continue

                # ⭐ Гол шалгалт: хашилтын дотор, {} доторх ижил хашилт
                if is_f and depth > 0 and c == quote:
                    found.append((body_start_line, delim))
                    # Энэ мөрийг цааш нь тоолохгүй — нэг удаа тэмдэглээд гарна
                    while i < n and source[i] != "\n":
                        i += 1
                    break

                if source[i:i + len(delim)] == delim and depth == 0:
                    i += len(delim)
                    break

                i += 1
            continue

        i += 1

    return found


print("1) f-STRING ДОТОР ИЖИЛ ХАШИЛТ (PEP 701 — зөвхөн 3.12+)")

total_issues = 0
for path in TARGETS:
    source = path.read_text(encoding="utf-8")
    issues = nested_quote_fstrings(source)
    if issues:
        total_issues += len(issues)
        rel = path.relative_to(ROOT).as_posix()
        for line_no, delim in issues:
            print(f"    ✗ {rel}:{line_no}  ({delim} дотор {delim})")

check(f"{len(TARGETS)} файлын аль нь ч 3.12+ синтакс ашиглаагүй",
      total_issues == 0, f"{total_issues} газар олдлоо")


print("\n2) ШАЛГАГЧ ӨӨРӨӨ ЗӨВ АЖИЛЛАЖ БАЙНА УУ")

# ⚠️ Шалгагч худал сөрөг өгвөл ямар ч ач холбогдолгүй тул өөрийг нь шалгана
BAD = 'x = f"a{" b" if c else ""}d"'
GOOD_1 = "x = f\"a{' b' if c else ''}d\""
GOOD_2 = 'x = f"a{b}c"'
GOOD_3 = 'x = "энэ бол f-string биш: {\\"a\\"}"'
GOOD_4 = "x = f'''олон мөрт {a} утга'''"
GOOD_5 = 'from_ = f"{a}"   # `f` үсгээр эхэлсэн танигч'

check("муу тохиолдлыг БАРЬЖ байна", len(nested_quote_fstrings(BAD)) == 1,
      f"got {nested_quote_fstrings(BAD)}")
check("өөр хашилт хэрэглэсэн — зөвшөөрнө", nested_quote_fstrings(GOOD_1) == [])
check("энгийн орлуулга — зөвшөөрнө", nested_quote_fstrings(GOOD_2) == [])
check("f-string биш мөр — зөвшөөрнө", nested_quote_fstrings(GOOD_3) == [])
check("гурвалсан хашилт — зөвшөөрнө", nested_quote_fstrings(GOOD_4) == [])
check("`f`-ээр эхэлсэн танигч — зөвшөөрнө", nested_quote_fstrings(GOOD_5) == [])


print("\n3) БҮХ ФАЙЛ ЗӨВ ЗАДАРЧ БАЙНА УУ")

import ast  # noqa: E402

broken = []
for path in TARGETS:
    try:
        ast.parse(path.read_text(encoding="utf-8"))
    except SyntaxError as exc:
        broken.append(f"{path.relative_to(ROOT).as_posix()}:{exc.lineno} {exc.msg}")

check(f"{len(TARGETS)} файл бүгд задарлаа", not broken, "; ".join(broken))


print()
if failures:
    print(f"АМЖИЛТГҮЙ: {len(failures)}")
    for f in failures:
        print(f"  • {f}")
    raise SystemExit(1)
print("Бүх тест PASS")
