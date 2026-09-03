"""
НЭВТРЭЛТ БА ЭРХИЙН ДАВХАРГА — ЦЭВЭР ФУНКЦ (streamlit ашиглахгүй).

⚠️ Нууц үг НЭГ Ч ГАЗАР кодод бичигдэхгүй. Хэрэглэгчид зөвхөн орчны
   хувьсагчаас (`DSS_USERS`) ирнэ. Тохируулаагүй бол апп ОГТ нэвтрүүлэхгүй
   — «анхны нууц үг» гэсэн ойлголт байхгүй.

⚠️ Нууц үг задлагдахуйц хэлбэрээр хадгалагдахгүй. PBKDF2-HMAC-SHA256,
   санамсаргүй давс, 600,000 давталт (OWASP-ийн зөвлөмж).
   Шалгахдаа `hmac.compare_digest` — хугацааны халдлагаас хамгаална.

⚠️ Гуравдагч сан ШААРДАХГҮЙ — бүгд Python-ий стандарт сан.
   requirements.txt хэвээр 3 мөр үлдэнэ.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
import unicodedata
from dataclasses import dataclass

# ── Тохиргоо ─────────────────────────────────────────────────────────

#: Хэрэглэгчдийг тодорхойлох орчны хувьсагч (JSON массив)
USERS_ENV = "DSS_USERS"

#: Нэвтрэлтийн хүчинтэй хугацаа (секунд). Орчны хувьсагчаар өөрчилж болно.
SESSION_TTL_ENV = "DSS_SESSION_TTL"
DEFAULT_SESSION_TTL = 8 * 60 * 60  # 8 цаг

#: Дараалсан амжилтгүй оролдлогын дээд хязгаар ба түгжих хугацаа
MAX_ATTEMPTS = 5
LOCKOUT_SECONDS = 300

PBKDF2_ITERATIONS = 600_000
SALT_BYTES = 16
ALGORITHM = "pbkdf2_sha256"


# ── Эрхийн түвшин ────────────────────────────────────────────────────

@dataclass(frozen=True)
class Role:
    code: str
    label_mn: str
    description_mn: str
    #: None = бүх хуудас нээлттэй
    pages: frozenset[str] | None
    can_export: bool


# ⚠️ Файл оруулахыг эрхээр хязгаарлахгүй. Streamlit хувилбарт өгөгдөл нь
#    хэрэглэгчийн ӨӨРИЙН оруулсан файлаас сесс бүрт ирдэг — нийтийн өгөгдлийн
#    сан байхгүй. Оруулахыг хоригловол тухайн хэрэглэгч ЮУ Ч харж чадахгүй.
#    Эрх нь ХУУДСЫН ХАНДАЛТ ба EXCEL ТАТАХ-ыг зохицуулна.

#: Үзэгчид хаалттай хуудсууд — нийлүүлэгчийн үнэ, өгөгдлийн дотоод чанар
_VIEWER_BLOCKED = frozenset({"Үнийн хяналт", "Өгөгдлийн чанар"})

_ALL_PAGES = frozenset({
    "Dashboard", "Нөөцийн ерөнхий байдал", "Нөөцийн эрсдэл", "Илүүдэл",
    "Хөдөлгөөнгүй", "Удаан эргэлт", "ABCXYZ шинжилгээ", "ABCXYZ матриц",
    "Худалдан авалтын санал", "Үнийн хяналт", "Шилжүүлэх санал",
    "AI зөвлөмж", "Өгөгдлийн чанар",
})

ROLES: dict[str, Role] = {
    "admin": Role(
        code="admin",
        label_mn="Админ",
        description_mn="Бүх хуудас · Excel тайлан татах",
        pages=None,
        can_export=True,
    ),
    "analyst": Role(
        code="analyst",
        label_mn="Шинжээч",
        description_mn="Бүх хуудас · Excel тайлан татах",
        pages=None,
        can_export=True,
    ),
    "viewer": Role(
        code="viewer",
        label_mn="Үзэгч",
        description_mn="Үнийн хяналт болон Excel татах хаалттай",
        pages=_ALL_PAGES - _VIEWER_BLOCKED,
        can_export=False,
    ),
}

DEFAULT_ROLE = "viewer"


@dataclass(frozen=True)
class User:
    username: str
    display_name: str
    role: Role

    def may_view(self, page: str) -> bool:
        return self.role.pages is None or page in self.role.pages


class AuthError(Exception):
    """Тохиргооны алдаа — нэвтрэлт бүрэн боломжгүй болсныг илэрхийлнэ."""


# ── Нууц үгийн hash ──────────────────────────────────────────────────

def _normalize(password: str) -> bytes:
    """Юникод хэвийн болгоно — кирилл нууц үг өөр гар дээр ижил ажиллана."""
    return unicodedata.normalize("NFKC", password).encode("utf-8")


def hash_password(password: str, *, iterations: int = PBKDF2_ITERATIONS) -> str:
    """`pbkdf2_sha256$<давталт>$<давс>$<hash>` хэлбэрээр буцаана."""
    if not password:
        raise ValueError("Нууц үг хоосон байж болохгүй")
    salt = secrets.token_bytes(SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha256", _normalize(password), salt, iterations)
    salt_b64 = base64.b64encode(salt).decode("ascii")
    digest_b64 = base64.b64encode(digest).decode("ascii")
    return f"{ALGORITHM}${iterations}${salt_b64}${digest_b64}"


def verify_password(password: str, encoded: str) -> bool:
    """Тогтмол хугацаанд харьцуулна. Формат буруу бол чимээгүй False."""
    try:
        algorithm, iterations, salt_b64, digest_b64 = encoded.split("$")
        if algorithm != ALGORITHM:
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
        actual = hashlib.pbkdf2_hmac(
            "sha256", _normalize(password), salt, int(iterations)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


# ── Хэрэглэгчийн сан ─────────────────────────────────────────────────

def _raw_users(env: dict[str, str] | None = None) -> str:
    source = os.environ if env is None else env
    return (source.get(USERS_ENV) or "").strip()


def is_configured(env: dict[str, str] | None = None) -> bool:
    return bool(_raw_users(env))


def load_users(env: dict[str, str] | None = None) -> dict[str, dict]:
    """`DSS_USERS` JSON-г уншиж `{username: {...}}` болгоно.

    Хүлээгдэх бүтэц:
        [{"username": "...", "password_hash": "pbkdf2_sha256$...",
          "role": "admin|analyst|viewer", "name": "..."}]
    """
    raw = _raw_users(env)
    if not raw:
        return {}

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AuthError(f"{USERS_ENV} нь зөв JSON биш: {exc}") from exc

    if not isinstance(parsed, list):
        raise AuthError(f"{USERS_ENV} нь жагсаалт ([...]) байх ёстой")

    users: dict[str, dict] = {}
    for index, entry in enumerate(parsed, 1):
        if not isinstance(entry, dict):
            raise AuthError(f"{USERS_ENV}[{index}] нь объект байх ёстой")

        username = str(entry.get("username") or "").strip().lower()
        password_hash = str(entry.get("password_hash") or "")
        if not username:
            raise AuthError(f"{USERS_ENV}[{index}] дээр `username` алга")
        if not password_hash.startswith(f"{ALGORITHM}$"):
            raise AuthError(
                f"{USERS_ENV}[{index}] ({username}) дээр `password_hash` буруу — "
                f"`{ALGORITHM}$...` байх ёстой. Задлагдах нууц үг хадгалахыг хориглоно."
            )
        if username in users:
            raise AuthError(f"{USERS_ENV} дотор `{username}` давхардсан")

        role = str(entry.get("role") or DEFAULT_ROLE).strip().lower()
        if role not in ROLES:
            raise AuthError(
                f"{USERS_ENV}[{index}] ({username}) дээр эрх буруу: `{role}`. "
                f"Зөвшөөрөгдөх: {' | '.join(ROLES)}"
            )

        users[username] = {
            "username": username,
            "password_hash": password_hash,
            "role": role,
            "name": str(entry.get("name") or username),
        }

    if not users:
        raise AuthError(f"{USERS_ENV} хоосон жагсаалт — нэг ч хэрэглэгч алга")
    return users


def session_ttl(env: dict[str, str] | None = None) -> int:
    source = os.environ if env is None else env
    try:
        value = int(source.get(SESSION_TTL_ENV, DEFAULT_SESSION_TTL))
    except (TypeError, ValueError):
        return DEFAULT_SESSION_TTL
    return value if value > 0 else DEFAULT_SESSION_TTL


# ── Нэвтрэх ──────────────────────────────────────────────────────────

@dataclass
class Attempts:
    """Амжилтгүй оролдлогын тоолуур — энгийн brute-force хамгаалалт."""

    count: int = 0
    locked_until: float = 0.0

    def locked_for(self, now: float | None = None) -> int:
        now = time.time() if now is None else now
        return max(0, int(self.locked_until - now))

    def register_failure(self, now: float | None = None) -> None:
        now = time.time() if now is None else now
        self.count += 1
        if self.count >= MAX_ATTEMPTS:
            self.locked_until = now + LOCKOUT_SECONDS
            self.count = 0

    def reset(self) -> None:
        self.count = 0
        self.locked_until = 0.0


@dataclass
class LoginResult:
    user: User | None
    error_mn: str | None = None


def authenticate(
    username: str,
    password: str,
    *,
    attempts: Attempts,
    env: dict[str, str] | None = None,
) -> LoginResult:
    """Нэвтрэлт шалгана.

    ⚠️ Хэрэглэгч байхгүй ба нууц үг буруу хоёрт ЯГ ИЖИЛ мессеж буцаана —
       ямар нэр бүртгэлтэй байгааг задруулахгүй.
    """
    remaining = attempts.locked_for()
    if remaining:
        return LoginResult(
            None,
            f"Хэт олон удаа буруу оролдлоо. {remaining} секундын дараа дахин оролдоно уу.",
        )

    users = load_users(env)  # AuthError → дуудагч талд
    record = users.get((username or "").strip().lower())

    # Хэрэглэгч олдоогүй ч hash тооцоолж, хариу өгөх хугацааг тэнцүү байлгана
    encoded = record["password_hash"] if record else hash_password("—")
    ok = verify_password(password or "", encoded)

    if not record or not ok:
        attempts.register_failure()
        left = MAX_ATTEMPTS - attempts.count
        suffix = f" ({left} оролдлого үлдлээ)" if attempts.count else ""
        return LoginResult(None, f"Нэвтрэх нэр эсвэл нууц үг буруу.{suffix}")

    attempts.reset()
    return LoginResult(
        User(
            username=record["username"],
            display_name=record["name"],
            role=ROLES[record["role"]],
        )
    )


def build_users_json(entries: list[tuple[str, str, str, str]]) -> str:
    """(username, password, role, name) → `DSS_USERS`-д тавих JSON мөр.

    Нууц үгийг hash болгоно — задлагдах хэлбэрээр ХЭЗЭЭ Ч хадгалахгүй.
    """
    payload = []
    for username, password, role, name in entries:
        if role not in ROLES:
            raise ValueError(f"Эрх буруу: {role}")
        payload.append({
            "username": username.strip().lower(),
            "password_hash": hash_password(password),
            "role": role,
            "name": name.strip() or username.strip(),
        })
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
