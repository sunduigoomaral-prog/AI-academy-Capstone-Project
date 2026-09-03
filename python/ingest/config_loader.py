"""
Хуваалцсан тохиргоо ачаалагч.

`src/config/dataset-signatures.json` ба `src/config/validation-rules.json`
файлуудыг ЭХ СУРВАЛЖ болгон уншина. TypeScript тал ЯГ ИЖИЛ файлыг уншдаг тул
Python ба Node хоёрын үр дүн зөрөхгүй.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CONFIG_DIR = PROJECT_ROOT / "src" / "config"

SIGNATURES_PATH = CONFIG_DIR / "dataset-signatures.json"
RULES_PATH = CONFIG_DIR / "validation-rules.json"


@lru_cache(maxsize=1)
def load_signatures() -> dict[str, Any]:
    with SIGNATURES_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


@lru_cache(maxsize=1)
def load_rules() -> dict[str, Any]:
    with RULES_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


@lru_cache(maxsize=1)
def rule_index() -> dict[str, dict[str, Any]]:
    """code → rule тодорхойлолт"""
    return {r["code"]: r for r in load_rules()["rules"]}


def rule_severity(code: str) -> str:
    rule = rule_index().get(code)
    if rule is None:
        raise KeyError(
            f"Тодорхойлогдоогүй валидацийн дүрэм: {code!r}. "
            "src/config/validation-rules.json-д нэмнэ үү."
        )
    return rule["severity"]


def rule_message(code: str) -> str:
    return rule_index()[code]["messageMn"]


def normalize_header(text: Any) -> str:
    """Багана нэрийг харьцуулахад бэлдэнэ: трим + доторх зай нэгтгэх + жижиг үсэг."""
    if text is None:
        return ""
    return " ".join(str(text).split()).casefold()


@lru_cache(maxsize=1)
def alias_lookup() -> dict[str, list[str]]:
    """role → нормчилсон alias-уудын жагсаалт"""
    aliases = load_signatures()["roleAliases"]
    return {role: [normalize_header(a) for a in names] for role, names in aliases.items()}
