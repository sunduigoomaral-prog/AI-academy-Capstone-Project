"""
Тооцооллын тохиргоо ачаалагч.

`src/config/analysis-defaults.json`-ыг уншина — TypeScript тал ЯГ ИЖИЛ
файлыг уншдаг тул threshold зөрөхгүй.

⚠️ Энэ нь SEED утга. Web application ажиллах үед тохиргоо DB-ийн
   `analysis_config` хүснэгтээс ирнэ. CLI горимд DB байхгүй тул seed ашиглана.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULTS_PATH = PROJECT_ROOT / "src" / "config" / "analysis-defaults.json"


@lru_cache(maxsize=1)
def load_defaults() -> dict[str, Any]:
    with DEFAULTS_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


@lru_cache(maxsize=1)
def config_map() -> dict[str, str]:
    return {c["key"]: c["value"] for c in load_defaults()["analysisConfig"]}


def get_str(key: str) -> str:
    values = config_map()
    if key not in values:
        raise KeyError(f"Тодорхойлогдоогүй config key: {key}")
    return values[key]


def get_float(key: str) -> float:
    return float(get_str(key))


def get_int(key: str) -> int:
    return int(float(get_str(key)))


class Settings:
    """Идэвхтэй тооцооллын параметрүүд."""

    def __init__(self, calculation_month: str | None = None, lookback_months: int | None = None,
                 scope: str | None = None) -> None:
        self.calculation_month = calculation_month or get_str("analysis.calculation_month")
        self.lookback_months = lookback_months or get_int("analysis.lookback_months")
        self.scope = scope or get_str("analysis.sales_scope")
        self.abc_basis = get_str("abc.basis")
        self.abc_a = get_float("abc.a_threshold")
        self.abc_b = get_float("abc.b_threshold")
        self.xyz_x = get_float("xyz.x_threshold")
        self.xyz_y = get_float("xyz.y_threshold")
        self.validate()

    def validate(self) -> None:
        if self.abc_basis == "REVENUE":
            raise ValueError(
                "abc.basis = REVENUE сонгогдсон боловч эх өгөгдөлд борлуулалтын орлого "
                "БАЙХГҮЙ (docs/01 §7). COGS_VALUE ашиглана уу."
            )
        if self.abc_basis != "COGS_VALUE":
            raise ValueError(
                f"abc.basis буруу: {self.abc_basis}. ABC-г тоо хэмжээгээр хийхийг зөвшөөрөхгүй."
            )
        if self.scope not in ("ALL", "WAREHOUSE", "PHARMACY"):
            raise ValueError(f"analysis.sales_scope буруу: {self.scope}")


def shift_period(period: str, offset_months: int) -> str:
    """'YYYY-MM' түлхүүрийг offset сараар шилжүүлнэ."""
    year, month = period.split("-")
    total = int(year) * 12 + (int(month) - 1) + offset_months
    return f"{total // 12:04d}-{total % 12 + 1:02d}"


def lookback_periods(calculation_month: str, months: int) -> list[str]:
    """
    Дундаж борлуулалт тооцоход ашиглах БҮТЭН сарууд.
    ⚠️ calculation_month ӨӨРӨӨ ОРОХГҮЙ.
    """
    if months < 1:
        raise ValueError(f"lookback_months 1-ээс их байх ёстой: {months}")
    return [shift_period(calculation_month, -i) for i in range(months, 0, -1)]
