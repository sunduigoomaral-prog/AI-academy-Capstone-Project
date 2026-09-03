"""
НЭВТРЭЛТИЙН ТЕСТ — `python/auth/store.py`.

    set PYTHONIOENCODING=utf-8
    python python/tests/test_auth.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from auth.store import (  # noqa: E402
    ALGORITHM,
    LOCKOUT_SECONDS,
    MAX_ATTEMPTS,
    ROLES,
    Attempts,
    AuthError,
    authenticate,
    build_users_json,
    hash_password,
    is_configured,
    load_users,
    looks_like_email,
    session_ttl,
    verify_password,
)

failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"   {detail}" if detail and not ok else ""))
    if not ok:
        failures.append(f"{name} {detail}")


def raises(fn, exc=AuthError) -> tuple[bool, str]:
    try:
        fn()
    except exc as error:
        return True, str(error)
    except Exception as error:  # noqa: BLE001
        return False, f"өөр алдаа: {type(error).__name__}: {error}"
    return False, "алдаа шидээгүй"


# Тест бүрт 600k давталт удаан тул цөөн давталттай hash ашиглана
def quick(password: str) -> str:
    return hash_password(password, iterations=1000)


def env_with(users: list[dict], **extra) -> dict[str, str]:
    return {"DSS_USERS": json.dumps(users, ensure_ascii=False), **extra}


# ─────────────────────────────────────────────────────────────
print("1) НУУЦ ҮГИЙН HASH")

h = quick("Нууц үг 123!")
check("формат нь pbkdf2_sha256$давталт$давс$hash", len(h.split("$")) == 4 and
      h.startswith(f"{ALGORITHM}$"), f"got {h[:40]}")
check("зөв нууц үг батлагдана", verify_password("Нууц үг 123!", h))
check("буруу нууц үг татгалзана", not verify_password("Нууц үг 123", h))
check("хоосон нууц үг татгалзана", not verify_password("", h))

check("ижил нууц үг ӨӨР hash өгнө (давс санамсаргүй)", quick("abc") != quick("abc"))
check("хоосон нууц үг hash хийхийг зөвшөөрөхгүй",
      raises(lambda: hash_password(""), ValueError)[0])

print("\n   Кирилл нууц үг — юникод хэвийн болголт")
check("NFKC хэвийн болгосон хувилбар тохирно",
      verify_password("Нууцүг"[:4] + "үг", quick("Нуацүг")) is False)
cyr = quick("Хөгжил2026")
check("кирилл нууц үг ажиллана", verify_password("Хөгжил2026", cyr))

print("\n   Эвдэрсэн hash чимээгүй татгалзана (алдаа шиднэгүй)")
for broken in ("", "тэнэг", "pbkdf2_sha256$нэг$хоёр$гурав", "md5$1$a$b", "a$b$c"):
    check(f"«{broken[:24]}» → False", verify_password("x", broken) is False)


# ─────────────────────────────────────────────────────────────
print("\n2) ХЭРЭГЛЭГЧИЙН САН — DSS_USERS")

check("хувьсагч тохируулаагүй бол is_configured False", not is_configured({}))
check("тохируулаагүй бол хэрэглэгч хоосон", load_users({}) == {})

good = env_with([
    {"username": "Admin", "password_hash": quick("a1"), "role": "admin", "name": "Админ"},
    {"username": "bat", "password_hash": quick("b2"), "role": "viewer", "name": "Бат"},
])
users = load_users(good)
check("2 хэрэглэгч уншигдана", len(users) == 2, f"got {len(users)}")
check("нэвтрэх нэр жижиг үсэг болно", "admin" in users, f"got {list(users)}")
check("эрх хадгалагдана", users["bat"]["role"] == "viewer")

print("\n   Буруу тохиргоо → ТОДОРХОЙ алдаа (чимээгүй өнгөрөхгүй)")
cases = [
    ("JSON биш", {"DSS_USERS": "{тэнэг"}),
    ("жагсаалт биш", {"DSS_USERS": '{"username":"a"}'}),
    ("username алга", env_with([{"password_hash": quick("x"), "role": "admin"}])),
    ("hash биш, задлагдах нууц үг",
     env_with([{"username": "a", "password_hash": "нууц123", "role": "admin"}])),
    ("эрх буруу",
     env_with([{"username": "a", "password_hash": quick("x"), "role": "хаан"}])),
    ("нэр давхардсан", env_with([
        {"username": "a", "password_hash": quick("x"), "role": "admin"},
        {"username": "A", "password_hash": quick("y"), "role": "viewer"},
    ])),
    ("хоосон жагсаалт", {"DSS_USERS": "[]"}),
]
for label, env in cases:
    ok, message = raises(lambda e=env: load_users(e))
    check(f"{label} → AuthError", ok, message)


# ─────────────────────────────────────────────────────────────
print("\n3) НЭВТРЭЛТ")

env = env_with([
    {"username": "admin", "password_hash": quick("Зөв2026"), "role": "admin", "name": "Админ"},
    {"username": "viewer1", "password_hash": quick("Үзэгч1"), "role": "viewer", "name": "Үзэгч"},
])

att = Attempts()
result = authenticate("admin", "Зөв2026", attempts=att, env=env)
check("зөв мэдээллээр нэвтэрнэ", result.user is not None, result.error_mn or "")
check("нэр буцаана", result.user and result.user.display_name == "Админ")
check("эрх буцаана", result.user and result.user.role.code == "admin")

check("ТОМ үсгээр бичсэн нэр ажиллана",
      authenticate("ADMIN", "Зөв2026", attempts=Attempts(), env=env).user is not None)

bad = authenticate("admin", "буруу", attempts=Attempts(), env=env)
check("буруу нууц үг татгалзана", bad.user is None)

missing = authenticate("байхгүй", "юу ч", attempts=Attempts(), env=env)
check("байхгүй хэрэглэгч татгалзана", missing.user is None)

print("\n   ⚠️ Аль нэр бүртгэлтэйг ЗАДРУУЛАХГҮЙ")
check("буруу нууц үг ба байхгүй нэр ИЖИЛ мессежээр эхэлнэ",
      bad.error_mn.startswith("Имэйл эсвэл нууц үг буруу")
      and missing.error_mn.startswith("Имэйл эсвэл нууц үг буруу"),
      f"{bad.error_mn!r} vs {missing.error_mn!r}")


# ─────────────────────────────────────────────────────────────
print("\n4) BRUTE-FORCE ХАМГААЛАЛТ")

att = Attempts()
for i in range(MAX_ATTEMPTS):
    authenticate("admin", "буруу", attempts=att, env=env)

check(f"{MAX_ATTEMPTS} удаа буруу оролдвол түгжинэ", att.locked_for() > 0,
      f"locked_for={att.locked_for()}")
check(f"түгжээ ≈ {LOCKOUT_SECONDS} сек",
      LOCKOUT_SECONDS - 2 <= att.locked_for() <= LOCKOUT_SECONDS)

locked = authenticate("admin", "Зөв2026", attempts=att, env=env)
check("түгжээтэй үед ЗӨВ нууц үг ч нэвтрүүлэхгүй", locked.user is None)
check("түгжээний мессеж хугацаа заана", "секунд" in (locked.error_mn or ""),
      locked.error_mn or "")

att.reset()
check("reset хийсний дараа дахин нэвтэрнэ",
      authenticate("admin", "Зөв2026", attempts=att, env=env).user is not None)

att2 = Attempts()
authenticate("admin", "буруу", attempts=att2, env=env)
authenticate("admin", "Зөв2026", attempts=att2, env=env)
check("амжилттай нэвтрэхэд тоолуур цэвэрлэгдэнэ", att2.count == 0, f"got {att2.count}")


# ─────────────────────────────────────────────────────────────
print("\n5) ЭРХИЙН ХЯЗГААРЛАЛТ")

admin = authenticate("admin", "Зөв2026", attempts=Attempts(), env=env).user
viewer = authenticate("viewer1", "Үзэгч1", attempts=Attempts(), env=env).user

check("админ бүх хуудас үзнэ",
      all(admin.may_view(p) for p in
          ("Ерөнхий тойм", "Үнийн хяналт", "Өгөгдлийн чанар", "AI зөвлөмж")))
check("админ Excel татна", admin.role.can_export)
check("бүх эрх файл оруулж чадна (нийтийн өгөгдлийн сан байхгүй)",
      not hasattr(admin.role, "can_upload"))

check("үзэгч Ерөнхий тойм үзнэ", viewer.may_view("Ерөнхий тойм"))
check("хуучин нэр «Dashboard» аль хэдийн байхгүй", not viewer.may_view("Dashboard"))
check("үзэгч ҮНИЙН ХЯНАЛТ үзэхгүй", not viewer.may_view("Үнийн хяналт"))
check("үзэгч ӨГӨГДЛИЙН ЧАНАР үзэхгүй", not viewer.may_view("Өгөгдлийн чанар"))
check("үзэгч Excel ТАТАХГҮЙ", not viewer.role.can_export)

check("3 эрхийн түвшин тодорхойлогдсон", set(ROLES) == {"admin", "analyst", "viewer"},
      f"got {set(ROLES)}")


# ─────────────────────────────────────────────────────────────
print("\n6) ТУСЛАХ ХЭРЭГСЭЛ")

raw = build_users_json([("Sara@Monos.MN", "нууцҮГ1", "analyst", "Сараа")])
parsed = json.loads(raw)
check("build_users_json жагсаалт өгнө", isinstance(parsed, list) and len(parsed) == 1)
check("нууц үг ЗАДЛАГДАХГҮЙ хэлбэрээр хадгална",
      parsed[0]["password_hash"].startswith(f"{ALGORITHM}$")
      and "нууцҮГ1" not in raw, "нууц үг ил харагдаж байна!")
check("үүсгэсэн бүртгэлээр нэвтэрч болно",
      authenticate("sara@monos.mn", "нууцҮГ1", attempts=Attempts(),
                   env={"DSS_USERS": raw}).user is not None)
check("имэйл жижиг үсэг болно", parsed[0]["email"] == "sara@monos.mn",
      f"got {parsed[0].get('email')}")
check("эрх буруу бол шиднэ",
      raises(lambda: build_users_json([("a@b.mn", "x", "хаан", "c")]), ValueError)[0])
check("имэйл буруу бол шиднэ",
      raises(lambda: build_users_json([("тэнэг", "x", "admin", "c")]), ValueError)[0])

check("session TTL анхдагч 8 цаг", session_ttl({}) == 8 * 60 * 60)
check("session TTL хувьсагчаар өөрчлөгдөнө",
      session_ttl({"DSS_SESSION_TTL": "60"}) == 60)
check("session TTL буруу утга → анхдагч",
      session_ttl({"DSS_SESSION_TTL": "тэнэг"}) == 8 * 60 * 60)



# ─────────────────────────────────────────────────────────────
print("\n7) ИМЭЙЛ ХЭЛБЭР")

for good in ("a@b.mn", "ner.ovog@monos.mn", "A@B.CO.UK", "x+tag@mail.com"):
    check(f"«{good}» зөв", looks_like_email(good))
for wrong in ("", "тэнэг", "a@b", "@monos.mn", "a@@b.mn", "a b@c.mn",
              "a@.mn", "a@b."):
    check(f"«{wrong}» буруу", not looks_like_email(wrong))

print("\n   ⚠️ Нэвтрэх үед хэлбэрийг ШАЛГАХГҮЙ (хаяг задруулахгүй)")
weird = authenticate("огт-имэйл-биш", "x", attempts=Attempts(), env=env)
check("буруу хэлбэртэй ч ИЖИЛ мессеж",
      weird.error_mn.startswith("Имэйл эсвэл нууц үг буруу"),
      weird.error_mn or "")


# ─────────────────────────────────────────────────────────────
print("\n8) `email` БОЛОН `username` ХОЁУЛАА АЖИЛЛАНА")

new_style = {"DSS_USERS": json.dumps(
    [{"email": "a@monos.mn", "password_hash": quick("p1"), "role": "admin"}],
    ensure_ascii=False)}
old_style = {"DSS_USERS": json.dumps(
    [{"username": "huuchin", "password_hash": quick("p2"), "role": "viewer"}],
    ensure_ascii=False)}

check("шинэ `email` түлхүүр ажиллана",
      authenticate("a@monos.mn", "p1", attempts=Attempts(),
                   env=new_style).user is not None)
check("хуучин `username` түлхүүр хэвээр ажиллана",
      authenticate("huuchin", "p2", attempts=Attempts(),
                   env=old_style).user is not None)
check("хоёулаа алга бол алдаа шиднэ",
      raises(lambda: load_users(
          {"DSS_USERS": chr(91) + chr(123) + chr(34) + "password_hash"
           + chr(34) + ":" + chr(34) + "x" + chr(34) + chr(125) + chr(93)}))[0])
check("user.email нь нэвтрэх таних тэмдэг",
      authenticate("a@monos.mn", "p1", attempts=Attempts(),
                   env=new_style).user.email == "a@monos.mn")


# ─────────────────────────────────────────────────────────────
print()
if failures:
    print(f"АМЖИЛТГҮЙ: {len(failures)}")
    for f in failures:
        print(f"  • {f}")
    raise SystemExit(1)
print("Бүх тест PASS")
