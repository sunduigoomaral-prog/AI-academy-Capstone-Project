"""
INVENTORY INTELLIGENCE & DECISION SUPPORT SYSTEM — Streamlit UI.

Ажиллуулах:
    streamlit run app.py --server.port 8501 --server.address 0.0.0.0

⚠️ ЭНЭ ФАЙЛ ДОТОР БИЗНЕС ТООЦООЛОЛ ХИЙХГҮЙ.
   Бүх тоо `python/` доторх шалгагдсан engine-үүдээс ирнэ:
       export.collect.collect   — гүйцэтгэлийн бүх engine (Phase 2–5)
       dashboard.view.build_view — шүүлт ба нэгтгэл (dashboard.service.ts-ийн хос)
   Next.js application-тай ЯГ ИЖИЛ логик, ижил тохиргоо (`src/config/*.json`).

⚠️ Fake data ашиглахгүй. Эх өгөгдөлд байхгүй утгыг зохиохгүй —
   «N/A» болон шалтгааныг нь харуулна.
"""

from __future__ import annotations

import base64
import html
import os
import sys
import tempfile
import time
from pathlib import Path

import pandas as pd
import streamlit as st

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT / "python"))

from dashboard.view import (  # noqa: E402
    ABC_ORDER,
    DECISION_TONE,
    NOT_AVAILABLE,
    PRIORITY_TONE,
    STATUS_TONE,
    XYZ_LABEL,
    XYZ_ORDER,
    Filter,
    build_view,
    filter_options,
    monthly_sales_series,
)
from auth.store import (  # noqa: E402
    ROLES,
    USERS_ENV,
    Attempts,
    AuthError,
    User,
    authenticate,
    build_users_json,
    is_configured,
    looks_like_email,
    load_users,
    save_users_file,
    session_ttl,
)
from export.collect import collect  # noqa: E402
from export.excel_export import build_workbook  # noqa: E402

st.set_page_config(
    page_title="Inventory Intelligence & DSS",
    page_icon="📦",
    layout="wide",
    initial_sidebar_state="expanded",
)


# ─────────────────────────────────────────────────────────────────────
# §26 Загвар — Next.js dashboard-тай ижил харагдац
# ─────────────────────────────────────────────────────────────────────

CSS = """
<style>
  :root {
    --bg:        #f6f7fb;
    --card:      #ffffff;
    --border:    #e6e8f0;
    --ink:       #0f172a;
    --muted:     #64748b;
    --primary:   #4f46e5;

    /* Монос Группын брэнд өнгө — `assets/logo.png`-ээс пиксел
       түвшинд гаргаж авсан (ногоон навч + тэнхлэг хөх үсэг). */
    --brand:     #078b4e;   /* Монос ногоон */
    --brand-2:   #244455;   /* Монос тэнхлэг хөх */
  }

  .stApp { background: var(--bg); }
  .block-container { padding: 1rem 1.6rem 3rem !important; max-width: 100% !important; }
  #MainMenu, footer, header[data-testid="stHeader"] { display: none !important; }

  /* ── Толгой ── */
  .ii-head {
    display: flex; align-items: center; gap: .75rem;
    background: var(--card); border: 1px solid var(--border);
    border-radius: 12px; padding: .7rem 1rem; margin-bottom: .85rem;
  }
  .ii-logo { font-size: 1.5rem; line-height: 1; }
  .ii-brand   { font-size: .95rem; font-weight: 800; letter-spacing: .04em; color: var(--ink); }
  .ii-brand-sub {
    font-size: .58rem; text-transform: uppercase; letter-spacing: .16em; color: var(--muted);
  }
  .ii-chip {
    display: inline-flex; align-items: center; gap: .4rem;
    border: 1px solid var(--border); border-radius: 8px;
    padding: .35rem .7rem; font-size: .78rem; color: var(--muted);
    background: var(--card); white-space: nowrap;
  }
  .ii-chip b { color: var(--ink); font-variant-numeric: tabular-nums; }

  /* ── Хуудасны гарчиг ── */
  .ii-title   { font-size: 1.5rem; font-weight: 700; color: var(--ink); margin: 0; }
  .ii-sub     { font-size: .85rem; color: var(--muted); margin: .15rem 0 0; }
  .ii-chips   { display: flex; gap: .4rem; flex-wrap: wrap; justify-content: flex-end; }

  /* ── KPI ── */
  .ii-kpis { display: grid; grid-template-columns: repeat(7, 1fr); gap: .6rem; margin-bottom: .6rem; }
  @media (max-width: 1500px) { .ii-kpis { grid-template-columns: repeat(4, 1fr); } }
  @media (max-width: 900px)  { .ii-kpis { grid-template-columns: repeat(2, 1fr); } }
  .ii-kpi {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 12px; padding: .8rem .9rem; min-height: 104px;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  .ii-kpi-label {
    font-size: .62rem; font-weight: 700; letter-spacing: .07em;
    text-transform: uppercase; color: var(--muted); line-height: 1.3;
  }
  .ii-kpi-value {
    font-size: 1.6rem; font-weight: 700; color: var(--ink);
    font-variant-numeric: tabular-nums; line-height: 1.15; margin-top: .35rem;
  }
  .ii-kpi-value.na { color: #94a3b8; }
  .ii-kpi-sub { font-size: .68rem; color: var(--muted); margin-top: .2rem; }

  /* ── Хайрцаг ── */
  .ii-card {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 12px; padding: 1rem 1.1rem; margin-bottom: .8rem;
  }
  .ii-card h3 { font-size: 1.05rem; font-weight: 700; color: var(--ink); margin: 0; }
  .ii-card p.hint { font-size: .78rem; color: var(--muted); margin: .25rem 0 .8rem; }

  /* ── ABC×XYZ матриц ── */
  .ii-matrix { width: 100%; border-collapse: separate; border-spacing: 6px; }
  .ii-matrix th {
    font-size: .72rem; font-weight: 600; color: var(--muted);
    padding: 0 0 .2rem; text-align: center;
  }
  .ii-matrix td.rowhead {
    font-size: .95rem; font-weight: 800; color: var(--muted);
    width: 22px; text-align: center;
  }
  .ii-cell { border-radius: 10px; padding: .55rem .65rem; }
  .ii-cell .top {
    display: flex; justify-content: space-between; align-items: baseline;
    font-weight: 800; font-size: .95rem; margin-bottom: .3rem;
  }
  .ii-cell .top span { font-size: .72rem; font-weight: 700; opacity: .85; }
  .ii-cell .kv {
    display: flex; justify-content: space-between;
    font-size: .68rem; line-height: 1.5; font-variant-numeric: tabular-nums;
  }
  .ii-cell .kv i { font-style: normal; opacity: .8; }
  .ii-total { font-size: .95rem; font-weight: 700; color: var(--muted); text-align: center; }

  /* ── Тэнцвэрийн мөр ── */
  .ii-bal {
    display: flex; align-items: center; gap: .7rem;
    border-radius: 10px; padding: .5rem .75rem; margin-bottom: .35rem;
    font-variant-numeric: tabular-nums; font-size: .8rem;
  }
  .ii-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
  .ii-bal .n     { font-size: 1.05rem; font-weight: 700; min-width: 56px; }
  .ii-bal .p     { min-width: 52px; color: var(--muted); }
  .ii-bal .q     { min-width: 78px; text-align: right; color: var(--muted); }
  .ii-bal .v     { flex: 1; text-align: right; color: var(--ink); font-weight: 600; }

  /* ── Асуултын карт ── */
  .ii-qa { display: grid; grid-template-columns: repeat(4, 1fr); gap: .6rem; }
  @media (max-width: 1200px) { .ii-qa { grid-template-columns: repeat(2, 1fr); } }
  .ii-qa-card {
    border: 1px solid var(--border); border-radius: 10px;
    padding: .7rem .8rem; background: #fbfcfe;
  }
  .ii-qa-q { font-size: .72rem; color: var(--muted); min-height: 2.2em; }
  .ii-qa-a {
    font-size: 1.35rem; font-weight: 700; color: var(--ink);
    font-variant-numeric: tabular-nums; margin-top: .25rem;
  }
  .ii-qa-a.na { font-size: 1rem; color: #94a3b8; }
  .ii-qa-u { font-size: .66rem; color: var(--muted); }

  /* ── Тэмдэг ── */
  .ii-badge {
    display: inline-block; border-radius: 6px;
    padding: .1rem .45rem; font-size: .7rem; font-weight: 600;
  }

  /* ── Мэдэгдэл ── */
  .ii-note {
    border-left: 3px solid var(--primary); background: #eef2ff;
    border-radius: 0 8px 8px 0; padding: .55rem .8rem;
    font-size: .78rem; color: #3730a3; margin-bottom: .7rem;
  }
  .ii-warn {
    border-left: 3px solid #f59e0b; background: #fffbeb;
    border-radius: 0 8px 8px 0; padding: .55rem .8rem;
    font-size: .78rem; color: #92400e; margin-bottom: .7rem;
  }

  /* ── Нэвтрэх дэлгэц ── */
  .ii-login {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 14px; padding: 1.6rem 1.8rem; margin-top: 1rem;
  }
  .ii-login h2 { font-size: 1.25rem; font-weight: 700; color: var(--ink); margin: 0; }
  .ii-login p  { font-size: .82rem; color: var(--muted); margin: .3rem 0 0; }

  /* ── Брэндийн самбар (нэвтрэх дэлгэцийн зүүн тал) ── */
  .ii-brandpane {
    background: linear-gradient(150deg, var(--brand) 0%, var(--brand-2) 100%);
    border-radius: 18px; padding: 2.1rem 2rem 1.6rem;
    color: #fff; min-height: 460px;
    display: flex; flex-direction: column; justify-content: space-between;
    box-shadow: 0 18px 40px -22px rgba(15, 23, 42, .55);
  }
  /* ⚠️ Логоны үсэг тэнхлэг хөх тул бараан дэвсгэрт уншигдахгүй.
     Албан ёсны тэмдгийг ӨӨРЧЛӨХГҮЙГЭЭР цагаан суурин дээр байрлуулна. */
  .ii-brandpane .logo {
    margin-bottom: 1.5rem; background: #fff; border-radius: 12px;
    padding: .6rem .85rem; display: inline-block;
    box-shadow: 0 6px 18px -8px rgba(0, 0, 0, .35);
  }
  .ii-brandpane .logo img { height: 44px; width: auto; display: block; }
  .ii-wordmark {
    font-size: 1.7rem; font-weight: 800; letter-spacing: .22em;
    line-height: 1; color: #fff;
  }
  .ii-wordmark-sub {
    font-size: .58rem; letter-spacing: .2em; text-transform: uppercase;
    color: rgba(255, 255, 255, .68); margin-top: .35rem;
  }
  .ii-brandpane h1 {
    font-size: 1.6rem; font-weight: 700; line-height: 1.25;
    margin: 0 0 .5rem; color: #fff;
  }
  .ii-brandpane .lede {
    font-size: .84rem; line-height: 1.55; color: rgba(255, 255, 255, .8);
    margin: 0 0 1.4rem; max-width: 34ch;
  }
  .ii-feat { display: flex; gap: .6rem; align-items: flex-start; margin-bottom: .6rem; }
  .ii-feat .ico {
    width: 26px; height: 26px; border-radius: 8px; flex: none;
    background: rgba(255, 255, 255, .14); display: flex;
    align-items: center; justify-content: center; font-size: .8rem;
  }
  .ii-feat .txt { font-size: .78rem; line-height: 1.4; color: rgba(255, 255, 255, .9); }
  .ii-feat .txt b { color: #fff; font-weight: 600; }
  .ii-brandfoot {
    font-size: .66rem; color: rgba(255, 255, 255, .55);
    border-top: 1px solid rgba(255, 255, 255, .16);
    padding-top: .8rem; margin-top: 1.2rem;
  }

  /* ── Нэвтрэх маягт (баруун тал) ── */
  .ii-formpane { padding: 1.6rem .4rem 0 1.4rem; }
  .ii-formpane .eyebrow {
    font-size: .6rem; font-weight: 700; letter-spacing: .18em;
    text-transform: uppercase; color: var(--brand); margin-bottom: .4rem;
  }
  .ii-formpane h2 { font-size: 1.55rem; font-weight: 700; color: var(--ink); margin: 0; }
  .ii-formpane p.sub {
    font-size: .82rem; color: var(--muted); margin: .35rem 0 1.2rem; line-height: 1.5;
  }
  .ii-formpane .note {
    font-size: .7rem; color: var(--muted); line-height: 1.5;
    border-top: 1px solid var(--border); padding-top: .8rem; margin-top: 1.2rem;
  }

  /* Нэвтрэх дэлгэц дээр талбарууд том, тод */
  .ii-auth div[data-testid="stTextInput"] input {
    height: 2.7rem; font-size: .9rem; border-radius: 10px;
  }
  .ii-auth div[data-testid="stTextInput"] label {
    display: block !important; font-size: .72rem !important;
    font-weight: 600 !important; color: var(--muted) !important;
  }
  .ii-auth div[data-testid="stForm"] { border: none; padding: 0; }
  .ii-auth button[kind="primaryFormSubmit"], .ii-auth button[kind="primary"] {
    height: 2.7rem; border-radius: 10px; font-weight: 600;
    background: var(--brand); border-color: var(--brand);
  }
  /* Нэвтрээгүй үед хажуугийн самбар хэрэггүй */
  .ii-auth-page section[data-testid="stSidebar"] { display: none !important; }
  .ii-user {
    display: flex; align-items: center; gap: .55rem;
    border: 1px solid var(--border); border-radius: 10px;
    padding: .55rem .7rem; margin-bottom: .5rem; background: #fbfcfe;
  }
  .ii-avatar {
    width: 30px; height: 30px; border-radius: 50%; flex: none;
    background: var(--primary); color: #fff; font-weight: 700;
    font-size: .8rem; display: flex; align-items: center; justify-content: center;
  }
  .ii-user .who  { font-size: .82rem; font-weight: 600; color: var(--ink); line-height: 1.2; }
  .ii-user .role { font-size: .66rem; color: var(--muted); }

  /* ── Streamlit удирдлагууд ── */
  section[data-testid="stSidebar"] { background: var(--card); border-right: 1px solid var(--border); }
  section[data-testid="stSidebar"] .block-container { padding-top: 1rem !important; }
  div[data-testid="stSelectbox"] label, div[data-testid="stMultiSelect"] label { display: none; }
  .stRadio [role="radiogroup"] { gap: .1rem; }
  .ii-navhead {
    font-size: .6rem; font-weight: 700; letter-spacing: .12em;
    text-transform: uppercase; color: var(--muted); margin: .8rem 0 .2rem;
  }
</style>
"""

st.markdown(CSS, unsafe_allow_html=True)


# ─────────────────────────────────────────────────────────────────────
# Форматлагч (тооцоолол БИШ — зөвхөн харагдац)
# ─────────────────────────────────────────────────────────────────────

def esc(value) -> str:
    return html.escape(str(value)) if value is not None else NOT_AVAILABLE


def money(value: float | None) -> str:
    return NOT_AVAILABLE if value is None else f"{value:,.0f} ₮"


def num(value: float | None, digits: int = 0) -> str:
    return NOT_AVAILABLE if value is None else f"{value:,.{digits}f}"


def share(value: float | None, digits: int = 1) -> str:
    return NOT_AVAILABLE if value is None else f"{value * 100:,.{digits}f}%"


def raw_pct(value: float | None, digits: int = 1) -> str:
    """Аль хэдийн хувиар ирсэн утга (жишээ: price_gap_pct)."""
    return NOT_AVAILABLE if value is None else f"{value:,.{digits}f}%"


def kpi_text(item: dict) -> str:
    if item["value"] is None:
        return NOT_AVAILABLE
    if item["format"] == "money":
        return f"{item['value']:,.0f}"
    if item["format"] == "percent":
        return f"{item['value'] * 100:,.1f}%"
    return f"{item['value']:,.0f}"


def badge(text: str, tone: dict) -> str:
    return (f"<span class='ii-badge' style='background:{tone['bg']};color:{tone['fg']}'>"
            f"{esc(text)}</span>")


# ─────────────────────────────────────────────────────────────────────
# Байгууллагын брэнд
# ─────────────────────────────────────────────────────────────────────

#: Байгууллагын нэр — орчны хувьсагчаар солино (hardcode биш)
ORG_NAME = os.environ.get("DSS_ORG_NAME", "Монос ХХК")

ASSETS_DIR = PROJECT_ROOT / "assets"

_LOGO_TYPES = {
    ".svg": "image/svg+xml", ".png": "image/png",
    ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
}


@st.cache_data(show_spinner=False)
def logo_data_uri() -> str | None:
    """`assets/logo.*`-ыг base64 болгож буцаана. Байхгүй бол None.

    ⚠️ Бүх гадаргуу цайвар тул нэг л хувилбар хангалттай.
    """
    for suffix, mime in _LOGO_TYPES.items():
        path = ASSETS_DIR / f"logo{suffix}"
        if path.is_file():
            encoded = base64.b64encode(path.read_bytes()).decode("ascii")
            return f"data:{mime};base64,{encoded}"
    return None


def brand_logo(height_px: int = 42) -> str:
    """Лого файл байвал зураг, байхгүй бол үсгэн тэмдэглэгээ.

    ⚠️ Үсгэн хувилбар нь ТҮР ОРЛУУЛАГЧ — албан ёсны лого биш.
       Бодит логог `assets/logo.png` (эсвэл .svg) болгон тавихад
       энд автоматаар харагдана.
    """
    uri = logo_data_uri()
    if uri:
        return (f"<img src='{uri}' alt='{esc(ORG_NAME)}' "
                f"style='height:{height_px}px;width:auto;display:block'>")

    name = esc(ORG_NAME.replace(" ХХК", "").strip() or ORG_NAME)
    return (f"<div class='ii-wordmark'>{name}</div>"
            f"<div class='ii-wordmark-sub'>{esc(ORG_NAME)}</div>")


# ─────────────────────────────────────────────────────────────────────
# Өгөгдөл (кэшлэнэ — collect ~7 сек)
# ─────────────────────────────────────────────────────────────────────

@st.cache_data(show_spinner=False)
def run_analysis(file_bytes: bytes, file_name: str) -> dict:
    tmp_dir = Path(tempfile.gettempdir()) / "inventory_dss"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp_path = tmp_dir / file_name
    tmp_path.write_bytes(file_bytes)
    return collect(tmp_path)


@st.cache_data(show_spinner=False)
def build_excel(file_bytes: bytes, file_name: str) -> bytes:
    data = run_analysis(file_bytes, file_name)
    out_path = Path(tempfile.gettempdir()) / "inventory_dss" / "inventory-report.xlsx"
    build_workbook(data, out_path)
    return out_path.read_bytes()


# ─────────────────────────────────────────────────────────────────────
# Дахин ашиглагдах блокууд
# ─────────────────────────────────────────────────────────────────────

def page_head(title: str, subtitle: str, view: dict, meta: dict) -> None:
    left, right = st.columns([3, 2])
    with left:
        st.markdown(
            f"<h2 class='ii-title'>{esc(title)}</h2>"
            f"<p class='ii-sub'>{esc(subtitle)}</p>",
            unsafe_allow_html=True,
        )
    with right:
        chips = [
            f"Тооцооны сар: <b>{esc(meta['calculationMonth'])}</b>",
            f"<b>{esc(meta['periods'][0])}</b> … <b>{esc(meta['periods'][-1])}</b>",
            f"<b>{view['scope']['positions']:,}</b> байрлал",
        ]
        st.markdown(
            "<div class='ii-chips'>"
            + "".join(f"<span class='ii-chip'>{c}</span>" for c in chips)
            + "</div>",
            unsafe_allow_html=True,
        )
    if view["filter_active"]:
        st.markdown(
            "<div class='ii-note'>Шүүлтүүр идэвхтэй — KPI · матриц · тэнцвэр · "
            "эрсдэл · татан авалт · шилжүүлэг · үнэ · AI бүгд энэ хамрах "
            "хүрээгээр тооцогдож байна.</div>",
            unsafe_allow_html=True,
        )


def render_kpi_grid(items: list[dict]) -> None:
    cells = []
    for item in items:
        tone = STATUS_TONE.get(item.get("tone") or "")
        bg = f"background:{tone['bg']};" if tone else ""
        value = kpi_text(item)
        na = " na" if item["value"] is None else ""
        sub = item.get("sub") or item.get("unavailable_reason") or ""
        cells.append(
            f"<div class='ii-kpi' style='{bg}'>"
            f"<div class='ii-kpi-label'>{esc(item['label_mn'])}</div>"
            f"<div><div class='ii-kpi-value{na}'>{esc(value)}</div>"
            f"<div class='ii-kpi-sub'>{esc(sub) if sub else '&nbsp;'}</div></div>"
            f"</div>"
        )
    st.markdown(f"<div class='ii-kpis'>{''.join(cells)}</div>", unsafe_allow_html=True)


def render_matrix(matrix: list[dict]) -> None:
    by_key = {c["abcXyz"]: c for c in matrix}

    head = "".join(f"<th>{esc(XYZ_LABEL[x])}</th>" for x in XYZ_ORDER)
    rows_html = [f"<tr><th></th>{head}<th>Нийт</th></tr>"]

    for abc in ABC_ORDER:
        cells = []
        row_total = 0
        for xyz in XYZ_ORDER:
            c = by_key[f"{abc}{xyz}"]
            row_total += c["skuCount"]
            tone = c["tone"]
            cells.append(
                f"<td><div class='ii-cell' style='background:{tone['bg']};color:{tone['fg']}'>"
                f"<div class='top'>{c['abcXyz']}<span>{share(c['salesShare'])}</span></div>"
                f"<div class='kv'><i>SKU</i><b>{c['skuCount']:,}</b></div>"
                f"<div class='kv'><i>Дүн</i><b>{c['salesValue']:,.0f}</b></div>"
                f"<div class='kv'><i>Нөөц</i><b>{c['currentStock']:,.0f}</b></div>"
                f"<div class='kv'><i>Зохистой</i><b>{c['recommendedStock']:,.0f}</b></div>"
                f"<div class='kv'><i>Эрсдэл</i><b>{c['riskCount']:,}</b></div>"
                f"</div></td>"
            )
        rows_html.append(
            f"<tr><td class='rowhead'>{abc}</td>{''.join(cells)}"
            f"<td class='ii-total'>{row_total:,}</td></tr>"
        )

    st.markdown(
        f"<table class='ii-matrix'>{''.join(rows_html)}</table>", unsafe_allow_html=True
    )


def render_balance_panel(balance: list[dict]) -> None:
    rows = []
    for b in balance:
        tone = b["tone"]
        rows.append(
            f"<div class='ii-bal' style='background:{tone['bg']}'>"
            f"<span class='ii-dot' style='background:{tone['dot']}'></span>"
            f"<span class='n' style='color:{tone['fg']}'>{b['count']:,}</span>"
            f"<span class='p'>{share(b['share'])}</span>"
            f"<span class='q'>{b['quantity']:,.0f} ш</span>"
            f"<span class='v'>{b['value']:,.0f} ₮</span>"
            f"</div>"
        )
    st.markdown("".join(rows), unsafe_allow_html=True)


def render_auto_answers(answers: list[dict]) -> None:
    cards = []
    for a in answers:
        if a["answer"] is None:
            body = (f"<div class='ii-qa-a na'>{NOT_AVAILABLE}</div>"
                    f"<div class='ii-qa-u'>{esc(a.get('unavailable_reason') or '')}</div>")
        else:
            body = (f"<div class='ii-qa-a'>{esc(a['answer'])}</div>"
                    f"<div class='ii-qa-u'>{esc(a['unit_mn'])}</div>")
        cards.append(
            f"<div class='ii-qa-card'>"
            f"<div class='ii-qa-q'>{esc(a['question_mn'])}</div>{body}</div>"
        )
    st.markdown(f"<div class='ii-qa'>{''.join(cards)}</div>", unsafe_allow_html=True)


def inventory_table(rows: list) -> pd.DataFrame:
    return pd.DataFrame([{
        "Код": r.position.product_code,
        "Нэр": r.position.product_name or NOT_AVAILABLE,
        "Байршил": r.position.location_code,
        "ХХК": r.position.company_code or NOT_AVAILABLE,
        "Хос": r.position.abc_xyz,
        "Сарын дундаж": round(r.position.average_monthly_sales, 1),
        "Үлдэгдэл": round(r.balance.current_stock, 1),
        "Нөөцийн хоног": round(r.balance.current_stock_days, 1),
        "Зорилтот хоног": r.balance.target_days,
        "Зохистой нөөц": round(r.balance.recommended_stock, 1),
        "Дутагдал": round(r.balance.shortage, 1),
        "Илүүдэл": round(r.balance.excess, 1),
        "Төлөв": STATUS_TONE[r.stock_status]["labelMn"],
        "Шилжиж ирэх": r.transfer_in_qty,
        "Худалдан авах": r.new_purchase_qty,
        "Шийдвэр": DECISION_TONE[r.decision]["labelMn"],
    } for r in rows])


def status_page(view: dict, meta: dict, status: str, title: str, subtitle: str) -> None:
    page_head(title, subtitle, view, meta)
    rows = [r for r in view["rows"] if r.stock_status == status]
    tone = STATUS_TONE[status]

    st.markdown(
        f"<div class='ii-card'><h3>{esc(tone['labelMn'])}</h3>"
        f"<p class='hint'>Нийт <b>{len(rows):,}</b> байрлал — шүүсэн хамрах хүрээнд "
        f"{view['scope']['positions']:,} байрлалын "
        f"{share(len(rows) / view['scope']['positions'] if view['scope']['positions'] else None)}"
        f"</p></div>",
        unsafe_allow_html=True,
    )
    if not rows:
        st.info("Энэ төлөвт тохирох байрлал алга.")
        return
    st.dataframe(inventory_table(rows), hide_index=True,
                 use_container_width=True, height=520)


# ─────────────────────────────────────────────────────────────────────
# Хуудсууд
# ─────────────────────────────────────────────────────────────────────

def page_dashboard(view: dict, data: dict, meta: dict, flt: Filter) -> None:
    page_head("ABC–XYZ шинжилгээ ба нөөцийн тэнцвэр",
              "Нөөцийн эрсдэлийг эрт илрүүлэх шийдвэр дэмжих систем", view, meta)

    render_kpi_grid(view["kpis"])

    left, right = st.columns([3, 2], gap="small")

    with left:
        st.markdown(
            "<div class='ii-card'><h3>ABC–XYZ матриц</h3>"
            "<p class='hint'>⭐ 9 хосолсон ангилал нь нөөцийн бүх тооцооллын үндэс. "
            f"Нийт {view['scope']['skus']:,} SKU.</p></div>",
            unsafe_allow_html=True,
        )
        render_matrix(view["matrix"])

        series = monthly_sales_series(data, flt)
        st.markdown(
            "<div class='ii-card'><h3>Сар бүрийн борлуулалт (ш)</h3></div>",
            unsafe_allow_html=True,
        )
        if series and series[0]["partial"]:
            st.markdown(
                "<div class='ii-warn'>⚠️ Сарын задаргаа нь SKU түвшинд хадгалагддаг "
                "тул байршлын шүүлтүүрийг дагахгүй — энэ график бүх байршлыг "
                "хамарна.</div>",
                unsafe_allow_html=True,
            )
        st.bar_chart(
            pd.DataFrame(series).set_index("period")["quantity"],
            height=210, color="#4f46e5",
        )

    with right:
        st.markdown(
            "<div class='ii-card'><h3>Нөөцийн тэнцвэр</h3>"
            "<p class='hint'>Төлөв тус бүрийн байрлалын тоо, эзлэх хувь, "
            "тоо хэмжээ, өртөг</p></div>",
            unsafe_allow_html=True,
        )
        render_balance_panel(view["balance"])

        st.markdown(
            "<div class='ii-card'><h3>Шилжүүлгийн шатлал</h3>"
            "<p class='hint'>Дутагдлыг эхний шатнаас эхлэн нөхнө</p></div>",
            unsafe_allow_html=True,
        )
        tiers = view["transfer_tiers"]
        if not tiers:
            st.info("Шилжүүлэх боломж илрээгүй.")
        else:
            total = sum(t["quantity"] for t in tiers)
            rows = [
                f"<div class='ii-bal' style='background:#f8fafc'>"
                f"<span class='n'>{t['quantity']:,}</span>"
                f"<span class='p'>{share(t['quantity'] / total if total else None)}</span>"
                f"<span class='v'>{esc(t['label_mn'])}</span></div>"
                for t in tiers
            ]
            st.markdown("".join(rows), unsafe_allow_html=True)

    st.markdown(
        "<div class='ii-card'><h3>Систем автоматаар хариулна</h3>"
        "<p class='hint'>Удирдлагын үндсэн асуултууд — бүгд шүүсэн "
        "хамрах хүрээгээр</p></div>",
        unsafe_allow_html=True,
    )
    render_auto_answers(view["auto_answers"])


def page_inventory_overview(view: dict, meta: dict) -> None:
    page_head("Нөөцийн ерөнхий байдал",
              "Байрлал тус бүрийн баланс, төлөв ба шийдвэр", view, meta)
    render_kpi_grid(view["kpis"][:7])
    st.dataframe(inventory_table(view["rows"]), hide_index=True,
                 use_container_width=True, height=560)


def page_risk(view: dict, meta: dict) -> None:
    page_head("Нөөцийн эрсдэл",
              "CRITICAL болон HIGH ач холбогдолтой байрлал", view, meta)
    rows = view["risk_rows"]
    if not rows:
        st.info("Эрсдэлтэй мөр илрээгүй.")
        return
    st.markdown(
        f"<div class='ii-card'><h3>TOP эрсдэлтэй SKU</h3>"
        f"<p class='hint'>Нийт <b>{len(rows):,}</b> мөр — ач холбогдлын "
        f"дарааллаар</p></div>",
        unsafe_allow_html=True,
    )
    st.dataframe(
        pd.DataFrame([{
            "Ач холбогдол": r["priority"],
            "Код": r["productCode"],
            "Нэр": r["productName"] or NOT_AVAILABLE,
            "Хос": r["abcXyz"],
            "Байршил": r["locationCode"],
            "Үлдэгдэл": round(r["currentStock"], 1),
            "Нөөцийн хоног": round(r["stockDays"], 1),
            "Зорилтот хоног": r["targetDays"],
            "Дутагдал": round(r["shortage"], 1),
            "Дутагдлын дүн": r["shortageValue"],
            "Эрсдэл": r["risk"],
            "Арга хэмжээ": r["action"],
        } for r in rows]),
        hide_index=True, use_container_width=True, height=560,
    )


def page_matrix(view: dict, meta: dict) -> None:
    page_head("ABCXYZ матриц", "9 хосолсон ангиллын дэлгэрэнгүй", view, meta)
    render_matrix(view["matrix"])
    st.dataframe(
        pd.DataFrame([{
            "Хос": c["abcXyz"],
            "SKU": c["skuCount"],
            "Борлуулалт (₮)": round(c["salesValue"]),
            "Эзлэх хувь": share(c["salesShare"]),
            "Борлуулсан тоо": round(c["salesQty"]),
            "Одоогийн нөөц": round(c["currentStock"]),
            "Зохистой нөөц": round(c["recommendedStock"]),
            "Эрсдэлтэй байрлал": c["riskCount"],
        } for c in view["matrix"]]),
        hide_index=True, use_container_width=True,
    )


def page_abc_analysis(view: dict, data: dict, meta: dict) -> None:
    page_head("ABCXYZ шинжилгээ",
              "ABC нь борлуулалтын ӨРТГИЙН дүнгээр, XYZ нь хэлбэлзлээр", view, meta)

    codes = {r.position.product_code for r in view["rows"]}
    rows = [r for r in data["abcXyz"] if r.product_code in codes]

    left, right = st.columns(2)
    with left:
        st.markdown("<div class='ii-card'><h3>ABC хуваарилалт</h3></div>",
                    unsafe_allow_html=True)
        df = (pd.DataFrame([{"ABC": r.abc, "Дүн": r.sales_value} for r in rows])
              .groupby("ABC", as_index=False).agg(SKU=("Дүн", "size"), Дүн=("Дүн", "sum")))
        st.bar_chart(df.set_index("ABC")["Дүн"], height=220, color="#4f46e5")
    with right:
        st.markdown("<div class='ii-card'><h3>XYZ хуваарилалт</h3></div>",
                    unsafe_allow_html=True)
        df = (pd.DataFrame([{"XYZ": r.xyz, "Дүн": r.sales_value} for r in rows])
              .groupby("XYZ", as_index=False).agg(SKU=("Дүн", "size"), Дүн=("Дүн", "sum")))
        st.bar_chart(df.set_index("XYZ")["SKU"], height=220, color="#4f46e5")

    st.dataframe(
        pd.DataFrame([{
            "Зэрэглэл": r.rank,
            "Код": r.product_code,
            "Нэр": r.product_name or NOT_AVAILABLE,
            "ABC": r.abc, "XYZ": r.xyz, "Хос": r.abc_xyz,
            "Борлуулалт (₮)": round(r.sales_value),
            "Эзлэх хувь": share(r.sales_share),
            "Хуримтлагдсан": share(r.cumulative_share),
            "Сарын дундаж": round(r.average_monthly_qty, 1),
            "STDEV.P": round(r.std_dev, 2),
            "CV": NOT_AVAILABLE if r.cv is None else round(r.cv, 3),
            "Борлуулалттай сар": r.months_with_sales,
        } for r in rows]),
        hide_index=True, use_container_width=True, height=520,
    )


def page_purchase(view: dict, meta: dict) -> None:
    page_head("Худалдан авалтын санал",
              "Шилжүүлгээр хаагдаагүй дутагдалд л шинэ худалдан авалт", view, meta)
    rows = [r for r in view["rows"] if r.new_purchase_qty > 0]
    if not rows:
        st.info("Худалдан авалтын шаардлага илрээгүй.")
        return
    st.markdown(
        f"<div class='ii-card'><h3>Санал</h3><p class='hint'>"
        f"<b>{len(rows):,}</b> байрлал · нийт "
        f"<b>{sum(r.new_purchase_qty for r in rows):,}</b> ширхэг. "
        f"Тоо нь бүхэл тоо руу дээш дугуйрна.</p></div>",
        unsafe_allow_html=True,
    )
    st.dataframe(
        pd.DataFrame([{
            "Код": r.position.product_code,
            "Нэр": r.position.product_name or NOT_AVAILABLE,
            "Байршил": r.position.location_code,
            "Хос": r.position.abc_xyz,
            "Зохистой нөөц": round(r.balance.recommended_stock, 1),
            "Үлдэгдэл": round(r.balance.current_stock, 1),
            "Шилжиж ирэх": r.transfer_in_qty,
            "Худалдан авах": r.new_purchase_qty,
            "Шийдвэр": DECISION_TONE[r.decision]["labelMn"],
        } for r in rows]),
        hide_index=True, use_container_width=True, height=520,
    )


def page_transfers(view: dict, meta: dict) -> None:
    page_head("Шилжүүлэх санал",
              "Компани доторх нөөцийг бүрэн ашигласны дараа л компани хооронд",
              view, meta)
    transfers = view["transfers"]
    if not transfers:
        st.info("Шилжүүлэх боломж илрээгүй — дутагдлыг нөхөх илүүдэл алга.")
        return

    tiers = view["transfer_tiers"]
    total = sum(t["quantity"] for t in tiers)
    cards = [
        f"<div class='ii-kpi'><div class='ii-kpi-label'>{esc(t['label_mn'])}</div>"
        f"<div><div class='ii-kpi-value'>{t['quantity']:,}</div>"
        f"<div class='ii-kpi-sub'>{t['count']:,} мөр · "
        f"{share(t['quantity'] / total if total else None)}</div></div></div>"
        for t in tiers
    ]
    cards.append(
        f"<div class='ii-kpi'><div class='ii-kpi-label'>Нийт</div>"
        f"<div><div class='ii-kpi-value'>{total:,}</div>"
        f"<div class='ii-kpi-sub'>{len(transfers):,} мөр</div></div></div>"
    )
    st.markdown(f"<div class='ii-kpis'>{''.join(cards)}</div>", unsafe_allow_html=True)

    st.dataframe(
        pd.DataFrame([{
            "Код": t.product_code,
            "Нэр": view["name_by_code"].get(t.product_code) or NOT_AVAILABLE,
            "Хаанаас": t.from_location_code,
            "Хаашаа": t.to_location_code,
            "Тоо": t.quantity,
            "Тооцоот дүн": t.estimated_value,
            "Шат": t.tier_label_mn,
            "Шалтгаан": t.reason_mn,
        } for t in transfers]),
        hide_index=True, use_container_width=True, height=520,
    )


def page_price(view: dict, meta: dict) -> None:
    page_head("Худалдан авах үнийн хяналт",
              "Үнэ нь НИЙЛҮҮЛЭГЧЭЭР жишигдэнэ", view, meta)
    benchmarks = view["benchmarks"]

    st.markdown(
        "<div class='ii-warn'>⚠️ Эх өгөгдөлд сувгийн бие даасан хэмжээст байхгүй "
        "тул суваг хоорондын үнийн харьцуулалт хийгдэхгүй. Борлуулалтын орлого "
        "байхгүй тул нийт ашиг / ашгийн хувь <b>N/A</b>.</div>",
        unsafe_allow_html=True,
    )
    if not benchmarks:
        st.info("Үнэ жишихэд хангалттай худалдан авалтын өгөгдөл алга.")
        return

    risk_codes = view["margin_risk_codes"]
    saving = sum(b.potential_saving or 0 for b in benchmarks)
    st.markdown(
        f"<div class='ii-kpis'>"
        f"<div class='ii-kpi'><div class='ii-kpi-label'>Үнэ жишсэн</div>"
        f"<div><div class='ii-kpi-value'>{len(benchmarks):,}</div>"
        f"<div class='ii-kpi-sub'>бүтээгдэхүүн</div></div></div>"
        f"<div class='ii-kpi'><div class='ii-kpi-label'>Боломжит хэмнэлт</div>"
        f"<div><div class='ii-kpi-value'>{saving:,.0f}</div>"
        f"<div class='ii-kpi-sub'>₮</div></div></div>"
        f"<div class='ii-kpi'><div class='ii-kpi-label'>Ашгийн эрсдэлтэй</div>"
        f"<div><div class='ii-kpi-value'>{len(risk_codes):,}</div>"
        f"<div class='ii-kpi-sub'>бүтээгдэхүүн</div></div></div>"
        f"</div>",
        unsafe_allow_html=True,
    )

    st.dataframe(
        pd.DataFrame([{
            "Эрсдэл": "⚠️" if b.product_code in risk_codes else "",
            "Код": b.product_code,
            "Нэр": b.product_name or NOT_AVAILABLE,
            "Эх сурвалж": b.source_count,
            "Хамгийн бага": b.min_unit_price,
            "Хамгийн их": b.max_unit_price,
            "Зөрүү": b.price_gap,
            "Зөрүү %": raw_pct(b.price_gap_pct),
            "Ноцтой байдал": b.gap_severity or NOT_AVAILABLE,
            "Жигнэсэн дундаж": b.weighted_avg_unit_price,
            "Боломжит хэмнэлт": b.potential_saving,
            "Хамгийн хямд эх сурвалж": b.min_source_key or NOT_AVAILABLE,
        } for b in benchmarks]),
        hide_index=True, use_container_width=True, height=480,
    )

    if risk_codes:
        st.markdown("<div class='ii-card'><h3>Ашгийн эрсдэлтэй бүтээгдэхүүн</h3></div>",
                    unsafe_allow_html=True)
        reasons = view["margin_risk_reasons"]
        st.dataframe(
            pd.DataFrame([{
                "Код": code,
                "Нэр": view["name_by_code"].get(code) or NOT_AVAILABLE,
                "Шалтгаан": " · ".join(reasons.get(code, [])) or NOT_AVAILABLE,
            } for code in sorted(risk_codes)]),
            hide_index=True, use_container_width=True,
        )


def page_ai(view: dict, meta: dict) -> None:
    page_head("AI шийдвэрийн зөвлөмж",
              "Дүрэмд суурилсан engine — эх өгөгдөлгүй үед тоо зохиохгүй",
              view, meta)
    recs = view["recommendations"]
    if not recs:
        st.info("Зөвлөмж алга.")
        return

    counts = pd.Series([r["priority"] for r in recs]).value_counts()
    cards = [
        f"<div class='ii-kpi' style='background:{PRIORITY_TONE[p]['bg']}'>"
        f"<div class='ii-kpi-label'>{p}</div>"
        f"<div><div class='ii-kpi-value' style='color:{PRIORITY_TONE[p]['fg']}'>"
        f"{int(counts.get(p, 0)):,}</div>"
        f"<div class='ii-kpi-sub'>зөвлөмж</div></div></div>"
        for p in ("CRITICAL", "HIGH", "MEDIUM", "LOW")
    ]
    st.markdown(f"<div class='ii-kpis'>{''.join(cards)}</div>", unsafe_allow_html=True)

    picked = st.multiselect("Ач холбогдлоор шүүх",
                            ["CRITICAL", "HIGH", "MEDIUM", "LOW"],
                            default=["CRITICAL", "HIGH"])
    shown = [r for r in recs if r["priority"] in picked] if picked else recs

    st.dataframe(
        pd.DataFrame([{
            "Ач холбогдол": r["priority"],
            "Код": r["product_code"],
            "Нэр": r["product_name"] or NOT_AVAILABLE,
            "Байршил": r["location_code"],
            "Хос": r["abc_xyz"],
            "Эрсдэл": r["risk"],
            "Шалтгаан": r["reason"],
            "Нөлөө": r["impact"],
            "Арга хэмжээ": r["recommended_action"],
            "Тоо": r["recommended_quantity"] or NOT_AVAILABLE,
            "Дүрэм": r["rule_code"],
        } for r in shown]),
        hide_index=True, use_container_width=True, height=520,
    )


def page_quality(view: dict, meta: dict) -> None:
    page_head("Өгөгдлийн чанар", "Оруулсан мөрийн баталгаажуулалт", view, meta)
    q = view["quality"]

    st.markdown(
        f"<div class='ii-kpis'>"
        f"<div class='ii-kpi'><div class='ii-kpi-label'>Нийт мөр</div>"
        f"<div><div class='ii-kpi-value'>{q['total']:,}</div></div></div>"
        f"<div class='ii-kpi' style='background:#f0fdf4'>"
        f"<div class='ii-kpi-label'>Хүчинтэй</div>"
        f"<div><div class='ii-kpi-value'>{q['valid']:,}</div></div></div>"
        f"<div class='ii-kpi' style='background:#fffbeb'>"
        f"<div class='ii-kpi-label'>Анхааруулга</div>"
        f"<div><div class='ii-kpi-value'>{q['warning']:,}</div></div></div>"
        f"<div class='ii-kpi' style='background:#fef2f2'>"
        f"<div class='ii-kpi-label'>Алдаа</div>"
        f"<div><div class='ii-kpi-value'>{q['error']:,}</div></div></div>"
        f"</div>",
        unsafe_allow_html=True,
    )

    issues = q.get("issues") or []
    if issues:
        st.dataframe(pd.DataFrame(issues), hide_index=True, use_container_width=True)
    else:
        st.success("Тэмдэглэх алдаа илрээгүй.")

    st.markdown("<div class='ii-card'><h3>Хөдөлгөөнгүй нөөц</h3></div>",
                unsafe_allow_html=True)
    stagnant = view["stagnant_rows"]
    if not stagnant:
        st.info("Хөдөлгөөнгүй нөөц илрээгүй.")
        return
    st.dataframe(
        pd.DataFrame([{
            "Код": r["productCode"],
            "Нэр": r["productName"] or NOT_AVAILABLE,
            "Байршил": r["locationCode"],
            "Үлдэгдэл": round(r["currentStock"], 1),
            "Үнийн дүн": r["stockValue"],
            "Сүүлийн борлуулалт": r["lastSalesPeriod"] or NOT_AVAILABLE,
            "Хэдэн сар": (r["monthsSinceLastSale"]
                          if r["monthsSinceLastSale"] is not None else NOT_AVAILABLE),
            "Сүүлийн худалдан авалт": r["lastPurchasePeriod"] or NOT_AVAILABLE,
            "Зөвлөмж": r["recommendation"],
        } for r in stagnant]),
        hide_index=True, use_container_width=True, height=440,
    )


# ─────────────────────────────────────────────────────────────────────
# Нэвтрэлт
# ─────────────────────────────────────────────────────────────────────

BRAND_FEATURES = [
    ("📊", "<b>ABC–XYZ шинжилгээ</b> — 9 хосолсон ангиллаар нөөцөө эрэмбэлнэ"),
    ("⚠️", "<b>Эрсдэлийн эрт сэрэмжлүүлэг</b> — нөөц дуусах, хэт их, хөдөлгөөнгүй"),
    ("🔁", "<b>Шилжүүлэг ба татан авалт</b> — компани доторхоо эхэлж ашиглана"),
    ("🤖", "<b>AI шийдвэрийн зөвлөмж</b> — дүрэмд суурилсан, эх өгөгдлөөс"),
]


def render_brand_pane() -> None:
    """Зүүн талын брэндийн самбар."""
    features = "".join(
        f"<div class='ii-feat'><span class='ico'>{icon}</span>"
        f"<span class='txt'>{text}</span></div>"
        for icon, text in BRAND_FEATURES
    )
    st.markdown(
        f"<div class='ii-brandpane'>"
        f"<div>"
        f"<div class='logo'>{brand_logo(44)}</div>"
        f"<h1>Нөөцийн ухаалаг<br>шийдвэр дэмжих систем</h1>"
        f"<p class='lede'>Борлуулалт, худалдан авалт, үлдэгдлийн өгөгдлийг "
        f"нэгтгэн шинжилж, аль бараанд юу хийхийг тодорхой хэлнэ.</p>"
        f"{features}"
        f"</div>"
        f"<div class='ii-brandfoot'>{esc(ORG_NAME)} · Inventory Intelligence &amp; "
        f"Decision Support System</div>"
        f"</div>",
        unsafe_allow_html=True,
    )


def render_setup_screen() -> None:
    """`DSS_USERS` тохируулаагүй үед. ⚠️ Анхны нууц үг ӨГӨХГҮЙ."""
    st.markdown("<div class='ii-auth ii-auth-page'>", unsafe_allow_html=True)
    left, right = st.columns([1.1, 1], gap="large")

    with left:
        render_brand_pane()

    with right:
        st.markdown(
            "<div class='ii-formpane'>"
            "<div class='eyebrow'>Анхны тохиргоо</div>"
            "<h2>🔒 Нэвтрэлт тохируулаагүй</h2>"
            f"<p class='sub'>Систем <b>{esc(USERS_ENV)}</b> орчны хувьсагчаас "
            "хэрэглэгчээ уншдаг. Тохируулах хүртэл хэн ч нэвтрэхгүй — "
            "<b>анхдагч нууц үг гэж байхгүй</b>.</p></div>",
            unsafe_allow_html=True,
        )

        email = st.text_input("Имэйл", key="setup_email",
                              placeholder="ner@monos.mn")
        password = st.text_input("Нууц үг", type="password", key="setup_pass")
        cols = st.columns(2)
        role = cols[0].selectbox("Эрх", list(ROLES),
                                 format_func=lambda r: ROLES[r].label_mn,
                                 key="setup_role")
        name = cols[1].text_input("Бүтэн нэр", key="setup_name")

        if st.button("Хадгалаад нэвтрэх", type="primary", use_container_width=True):
            if not looks_like_email(email):
                st.error("Имэйл хаягаа зөв бичнэ үү (жишээ: ner@monos.mn).")
            elif not password:
                st.error("Нууц үгээ бөглөнө үү.")
            else:
                raw = build_users_json([(email, password, role, name)])
                st.session_state["setup_json"] = raw
                try:
                    save_users_file(raw)
                    st.success(
                        "Хадгаллаа. Одоо энэ имэйл, нууц үгээрээ нэвтэрнэ үү."
                    )
                    st.rerun()
                except OSError as exc:
                    # Бичих эрхгүй бол — гарын авлагын аргыг доор харуулна
                    st.warning(
                        f"Файлд хадгалж чадсангүй ({exc}). Доорх утгыг "
                        f"{USERS_ENV} орчны хувьсагчид тавина уу."
                    )

        st.markdown(
            "<div class='ii-formpane'><p class='note'>"
            + " · ".join(f"<b>{esc(d.label_mn)}</b> — {esc(d.description_mn)}"
                         for d in ROLES.values())
            + "</p></div>",
            unsafe_allow_html=True,
        )

    st.markdown("</div>", unsafe_allow_html=True)

    generated = st.session_state.get("setup_json")
    if generated:
        st.markdown(
            f"<div class='ii-card'><h3>Байнгын тохиргоо (заавал биш)</h3>"
            "<p class='hint'>Дээрх хадгалалт нь container дахин байрлуулах "
            "хүртэл хүчинтэй. Байнгын болгохын тулд энэ утгыг "
            f"<code>{esc(USERS_ENV)}</code> орчны хувьсагчид тавь: "
            "Dokploy → Environment → Save → Deploy. Нууц үг энд ил "
            "бичигдээгүй — зөвхөн PBKDF2 hash.</p></div>",
            unsafe_allow_html=True,
        )
        st.code(generated, language="json")


def render_login_screen(attempts: Attempts) -> None:
    """⭐ ИМЭЙЛ + НУУЦ ҮГ + «Нэвтрэх» товч."""
    st.markdown("<div class='ii-auth ii-auth-page'>", unsafe_allow_html=True)
    left, right = st.columns([1.1, 1], gap="large")

    with left:
        render_brand_pane()

    with right:
        st.markdown(
            "<div class='ii-formpane'>"
            "<div class='eyebrow'>Хэрэглэгчийн эрх</div>"
            "<h2>Нэвтрэх</h2>"
            "<p class='sub'>Энэ систем нь борлуулалт, нөөц, худалдан авах "
            "үнийн дотоод мэдээлэл агуулдаг. Эрх олгогдсон хэрэглэгч "
            "л нэвтэрнэ.</p></div>",
            unsafe_allow_html=True,
        )

        with st.form("login"):
            email = st.text_input("Имэйл", placeholder="ner@monos.mn")
            password = st.text_input("Нууц үг", type="password",
                                     placeholder="••••••••")
            submitted = st.form_submit_button("Нэвтрэх", type="primary",
                                              use_container_width=True)

        st.markdown(
            "<div class='ii-formpane'><p class='note'>"
            "🔐 Нууц үг задлагдахгүй хэлбэрээр (PBKDF2-HMAC-SHA256) "
            "хадгалагдана.<br>"
            "Нууц үгээ мартсан бол системийн админд хандана уу."
            "</p></div>",
            unsafe_allow_html=True,
        )

        if submitted:
            result = authenticate(email, password, attempts=attempts)
            if result.user is None:
                st.error(result.error_mn)
            else:
                st.session_state["user"] = {
                    "username": result.user.username,
                    "display_name": result.user.display_name,
                    "role": result.user.role.code,
                }
                st.session_state["login_at"] = time.time()
                st.rerun()

    st.markdown("</div>", unsafe_allow_html=True)


def current_user() -> User | None:
    """Сессээс хэрэглэгчийг сэргээнэ. Хугацаа дууссан бол гаргана."""
    stored = st.session_state.get("user")
    if not stored:
        return None

    if time.time() - st.session_state.get("login_at", 0) > session_ttl():
        st.session_state.pop("user", None)
        st.session_state.pop("login_at", None)
        return None

    # ⚠️ Хэрэглэгчийг DSS_USERS-ээс ДАХИН шалгана — эрх нь хассан/өөрчилсөн
    #    бол идэвхтэй сесс шууд хүчингүй болно.
    try:
        record = load_users().get(stored["username"])
    except AuthError:
        record = None
    if not record:
        st.session_state.pop("user", None)
        return None

    return User(
        username=record["username"],
        display_name=record["name"],
        role=ROLES[record["role"]],
    )


def render_user_box(user: User) -> None:
    initial = (user.display_name or user.username)[:1].upper()
    st.markdown(
        f"<div class='ii-user'>"
        f"<span class='ii-avatar'>{esc(initial)}</span>"
        f"<span><span class='who'>{esc(user.display_name)}</span><br>"
        f"<span class='role'>{esc(user.role.label_mn)}</span></span>"
        f"</div>",
        unsafe_allow_html=True,
    )
    if st.button("Гарах", use_container_width=True):
        for key in ("user", "login_at", "page"):
            st.session_state.pop(key, None)
        st.rerun()


# ─────────────────────────────────────────────────────────────────────
# Навигаци
# ─────────────────────────────────────────────────────────────────────

NAV: list[tuple[str | None, list[str]]] = [
    (None, ["Dashboard"]),
    ("Нөөц", ["Нөөцийн ерөнхий байдал", "Нөөцийн эрсдэл", "Илүүдэл",
             "Хөдөлгөөнгүй", "Удаан эргэлт"]),
    ("ABC–XYZ", ["ABCXYZ шинжилгээ", "ABCXYZ матриц"]),
    ("Татан авалт", ["Худалдан авалтын санал", "Үнийн хяналт"]),
    ("Шилжүүлэлт", ["Шилжүүлэх санал"]),
    ("AI", ["AI зөвлөмж"]),
    ("Өгөгдөл", ["Өгөгдлийн чанар"]),
]

PAGES = [item for _, items in NAV for item in items]


# ─────────────────────────────────────────────────────────────────────
# Үндсэн урсгал
# ─────────────────────────────────────────────────────────────────────

_head_logo = logo_data_uri()
st.markdown(
    "<div class='ii-head'>"
    + (f"<img src='{_head_logo}' alt='{esc(ORG_NAME)}' "
       "style='height:30px;width:auto'>"
       if _head_logo else "<span class='ii-logo'>📦</span>")
    + "<span><span class='ii-brand'>INVENTORY</span><br>"
      f"<span class='ii-brand-sub'>{esc(ORG_NAME)} · Decision Support System</span>"
      "</span>"
      "</div>",
    unsafe_allow_html=True,
)

# ── 🔐 НЭВТРЭЛТИЙН ХААЛТ ──
# ⚠️ Үүнээс доош ямар ч өгөгдөл уншигдахгүй, зурагдахгүй.
if not is_configured():
    render_setup_screen()
    st.stop()

try:
    load_users()            # тохиргоо эвдэрсэн бол ЭНД илэрнэ
except AuthError as exc:
    st.error(f"Нэвтрэлтийн тохиргоо буруу: {exc}")
    st.stop()

user = current_user()
if user is None:
    if "attempts" not in st.session_state:
        st.session_state["attempts"] = Attempts()
    render_login_screen(st.session_state["attempts"])
    st.stop()

# ⚠️ Эрх нь өөрчлөгдсөн байж болно — сонгосон хуудас зөвшөөрөгдөж байгаа эсэхийг
#    өгөгдөл уншихаас ӨМНӨ шалгана.
if not user.may_view(st.session_state.get("page", "Dashboard")):
    st.session_state["page"] = "Dashboard"

with st.sidebar:
    render_user_box(user)

    st.markdown("<div class='ii-navhead'>Өгөгдөл</div>", unsafe_allow_html=True)
    uploaded = st.file_uploader("Excel", type=["xlsx", "xlsm"],
                                label_visibility="collapsed")

if uploaded is None:
    st.markdown(
        "<div class='ii-card'><h3>Excel файлаа оруулна уу</h3>"
        "<p class='hint'>Зүүн талын хэсгээс Sales · Purchase · Stock агуулсан "
        "файлаа сонгоно. Sheet-үүд нэрээр биш, <b>бүтцээр</b> танигдана.<br><br>"
        "Систем дараах шинжилгээг автоматаар гүйцэтгэнэ: ABC–XYZ ангилал · "
        "нөөцийн оновчлол · нөөцийн тэнцвэр · шилжүүлэх ба худалдан авах санал · "
        "худалдан авах үнийн хяналт · ашгийн эрсдэл · AI шийдвэрийн зөвлөмж."
        "</p></div>",
        unsafe_allow_html=True,
    )
    st.stop()

file_bytes = uploaded.getvalue()

try:
    with st.spinner("Шинжилгээ хийж байна…"):
        data = run_analysis(file_bytes, uploaded.name)
except Exception as exc:  # noqa: BLE001 — хэрэглэгчид шалтгааныг харуулна
    st.error(f"Шинжилгээ амжилтгүй боллоо: {exc}")
    st.stop()

meta = data["meta"]
options = filter_options(data)

# ── Шүүлтүүрийн мөр ──
bar = st.columns([1.6, 1.2, 1.1, 1.4, 1.1, 1.0])

product_name_by_code = {p["code"]: p["name"] for p in options["products"]}

with bar[0]:
    product_codes = st.multiselect(
        "Бүтээгдэхүүн",
        options=list(product_name_by_code),
        format_func=lambda c: f"{c} · {product_name_by_code[c]}"
        if product_name_by_code.get(c) else c,
        placeholder="Бүх бүтээгдэхүүн",
        label_visibility="collapsed",
    )

with bar[1]:
    company = st.selectbox(
        "ХХК",
        options=[None] + [c["code"] for c in options["companies"]],
        format_func=lambda c: "Бүх ХХК" if c is None else c,
        label_visibility="collapsed",
    )

with bar[2]:
    loc_type = st.selectbox(
        "Байршлын төрөл",
        options=[None] + [t["code"] for t in options["location_types"]],
        format_func=lambda t: "Бүх төрөл" if t is None else next(
            x["label_mn"] for x in options["location_types"] if x["code"] == t),
        label_visibility="collapsed",
    )

# ⭐ Шатлал: ХХК → байршлын төрөл → суваг/байршил
visible_locations = [
    loc for loc in options["locations"]
    if (company is None or loc["company_code"] == company)
    and (loc_type is None or loc["type"] == loc_type)
]

with bar[3]:
    location = st.selectbox(
        "Суваг / Байршил",
        options=[None] + [loc["code"] for loc in visible_locations],
        format_func=lambda c: "Бүх суваг / байршил" if c is None else c,
        label_visibility="collapsed",
    )

with bar[4]:
    st.selectbox(
        "Суваг",
        options=[f"Тусдаа суваг — {NOT_AVAILABLE}"],
        disabled=True,
        help=options["channel_unavailable_reason"],
        label_visibility="collapsed",
    )

with bar[5]:
    if not user.role.can_export:
        # ⚠️ Зөвхөн нуухгүй — өгөгдлийг ОГТ бэлдэхгүй
        st.button("⬇️ Excel татах", disabled=True, use_container_width=True,
                  help=f"«{user.role.label_mn}» эрхээр Excel татах боломжгүй")
    else:
        try:
            st.download_button(
                "⬇️ Excel татах",
                data=build_excel(file_bytes, uploaded.name),
                file_name=f"inventory-report-{meta['calculationMonth']}.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                use_container_width=True,
            )
        except Exception as exc:  # noqa: BLE001
            st.warning(f"Excel үүсгэж чадсангүй: {exc}")

flt = Filter(
    product_codes=list(product_codes),
    company_codes=[company] if company else [],
    location_type=loc_type,
    location_codes=[location] if location else [],
)

view = build_view(data, flt)

# ── Хажуугийн навигаци ──
with st.sidebar:
    st.session_state.setdefault("page", "Dashboard")
    for title, items in NAV:
        # ⚠️ Эрхгүй хуудсыг цэсэнд ОГТ гаргахгүй
        allowed = [item for item in items if user.may_view(item)]
        if not allowed:
            continue
        if title:
            st.markdown(f"<div class='ii-navhead'>{esc(title)}</div>",
                        unsafe_allow_html=True)
        for item in allowed:
            if st.button(item, key=f"nav-{item}", use_container_width=True,
                         type="primary" if st.session_state["page"] == item
                         else "secondary"):
                st.session_state["page"] = item

    st.markdown("<div class='ii-navhead'>Тохиргоо</div>", unsafe_allow_html=True)
    st.caption(
        "Босго утга, зорилтот хоног `src/config/*.json`-оос уншигдана — "
        "кодод hardcode байхгүй."
    )

page = st.session_state.get("page", "Dashboard")

# ⚠️ Цэс нуух нь хангалтгүй — хуудас зурахын ЯГ өмнө эрхийг дахин шалгана
if not user.may_view(page):
    st.session_state["page"] = "Dashboard"
    page = "Dashboard"

if view["scope"]["positions"] == 0:
    page_head(page, "Шүүлтүүрт тохирох байрлал алга", view, meta)
    st.warning("Сонгосон хамрах хүрээнд өгөгдөл олдсонгүй. Шүүлтүүрээ өөрчилнө үү.")
    st.stop()

if page == "Dashboard":
    page_dashboard(view, data, meta, flt)
elif page == "Нөөцийн ерөнхий байдал":
    page_inventory_overview(view, meta)
elif page == "Нөөцийн эрсдэл":
    page_risk(view, meta)
elif page == "Илүүдэл":
    status_page(view, meta, "OVERSTOCK", "Илүүдэл",
                "Зохистой хэмжээнээс давсан нөөц")
elif page == "Хөдөлгөөнгүй":
    status_page(view, meta, "NO_MOVEMENT", "Хөдөлгөөнгүй нөөц",
                "Хайсан хугацаанд борлуулалт бүртгэгдээгүй")
elif page == "Удаан эргэлт":
    status_page(view, meta, "SLOW_MOVING", "Удаан эргэлттэй",
                "Эргэлт удаан — борлуулалт идэвхжүүлэх шаардлагатай")
elif page == "ABCXYZ шинжилгээ":
    page_abc_analysis(view, data, meta)
elif page == "ABCXYZ матриц":
    page_matrix(view, meta)
elif page == "Худалдан авалтын санал":
    page_purchase(view, meta)
elif page == "Үнийн хяналт":
    page_price(view, meta)
elif page == "Шилжүүлэх санал":
    page_transfers(view, meta)
elif page == "AI зөвлөмж":
    page_ai(view, meta)
elif page == "Өгөгдлийн чанар":
    page_quality(view, meta)
