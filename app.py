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
import hashlib
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
    top_rows,
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
@import url('https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800&display=swap');

/* ══════════════════════════════════════════════════════════════
   ДИЗАЙНЫ СИСТЕМ — ногоон + цагаан, enterprise analytics
   Нэг л токен багц: өнгө, зай, радиус, сүүдэр, үсэг.
   ══════════════════════════════════════════════════════════════ */
:root {
  /* Гадаргуу */
  --canvas:    #f5f8f6;
  --surface:   #ffffff;
  --surface-2: #fafcfb;
  --line:      #e3eae6;
  --line-2:    #eef3f0;

  /* Бэх */
  --ink:       #14241d;
  --ink-2:     #3d5449;
  --muted:     #7b9188;

  /* Брэнд — Монос ногоон */
  --brand:     #078b4e;
  --brand-600: #067044;
  --brand-700: #055836;
  --brand-50:  #e9f6ef;
  --brand-100: #cfebdd;

  /* Навигаци — гүн ногоон */
  --nav:       #0a3527;
  --nav-2:     #124331;
  --nav-3:     #1a5540;
  --nav-ink:   #cfe3d8;
  --nav-dim:   #7ea795;

  /* Утга илэрхийлэх өнгө — брэндээс ТУСДАА */
  --danger:    #cf3049;  --danger-bg:  #fdeef1;
  --warn:      #b8730a;  --warn-bg:    #fdf4e6;
  --info:      #2166a8;  --info-bg:    #eaf2fa;
  --violet:    #6d4bc4;  --violet-bg:  #f1edfb;
  --ok:        #078b4e;  --ok-bg:      #e9f6ef;
  --slate:     #5b7268;  --slate-bg:   #eef2f0;

  /* Зай — 4px шатлал */
  --s1: .25rem; --s2: .5rem;  --s3: .75rem;
  --s4: 1rem;   --s5: 1.5rem; --s6: 2rem;

  --r-sm: 6px; --r: 10px; --r-lg: 14px;
  --shadow: 0 1px 2px rgba(16,40,30,.04), 0 1px 3px rgba(16,40,30,.03);

  --font: 'Onest', system-ui, -apple-system, 'Segoe UI', sans-serif;
}

* { box-sizing: border-box; }

html, body, [class*="css"], .stApp, button, input, select, textarea {
  font-family: var(--font) !important;
}

.stApp { background: var(--canvas); color: var(--ink); }
.block-container {
  padding: .55rem 1.3rem 2rem !important;
  max-width: 100% !important;
}
#MainMenu, footer, header[data-testid="stHeader"] { display: none !important; }

::-webkit-scrollbar { width: 9px; height: 9px; }
::-webkit-scrollbar-thumb { background: #cfdbd5; border-radius: 8px; }
::-webkit-scrollbar-track { background: transparent; }

/* ══ ХАЖУУГИЙН НАВИГАЦИ ══════════════════════════════════════ */
section[data-testid="stSidebar"] {
  background: var(--nav) !important;
  border-right: none !important;
  width: 15.5rem !important;
}
section[data-testid="stSidebar"] * { color: var(--nav-ink); }
section[data-testid="stSidebar"] .block-container {
  padding: var(--s4) var(--s3) var(--s5) !important;
}
.ii-brandbox {
  display: flex; align-items: center; gap: var(--s2);
  padding-bottom: var(--s4); margin-bottom: var(--s3);
  border-bottom: 1px solid var(--nav-2);
}
.ii-brandbox img {
  height: 30px; width: auto; background: #fff;
  border-radius: var(--r-sm); padding: 3px 6px;
}
.ii-brandbox .bn {
  font-size: .95rem; font-weight: 800; letter-spacing: .03em; color: #fff;
}
.ii-brandbox .bs {
  font-size: .55rem; letter-spacing: .12em; text-transform: uppercase;
  color: var(--nav-dim);
}
.ii-navhead {
  font-size: .58rem; font-weight: 700; letter-spacing: .14em;
  text-transform: uppercase; color: var(--nav-dim) !important;
  margin: var(--s4) 0 var(--s1) var(--s2);
}
section[data-testid="stSidebar"] .stButton button {
  background: transparent; border: none; color: var(--nav-ink);
  text-align: left; justify-content: flex-start;
  font-size: .84rem; font-weight: 500; padding: .48rem .6rem;
  border-radius: var(--r-sm); width: 100%; line-height: 1.35;
  transition: background .12s ease, color .12s ease;
}
section[data-testid="stSidebar"] .stButton button:hover {
  background: var(--nav-2); color: #fff;
}
section[data-testid="stSidebar"] .stButton button:focus-visible {
  outline: 2px solid var(--brand); outline-offset: 1px;
}
section[data-testid="stSidebar"] .stButton button[kind="primary"] {
  background: var(--brand); color: #fff; font-weight: 600;
}
.ii-user {
  display: flex; align-items: center; gap: var(--s2);
  background: var(--nav-2); border-radius: var(--r);
  padding: .55rem .65rem; margin-bottom: var(--s2);
}
.ii-avatar {
  width: 30px; height: 30px; border-radius: 50%; flex: none;
  background: var(--brand); color: #fff; font-weight: 700; font-size: .8rem;
  display: flex; align-items: center; justify-content: center;
}
.ii-user .who { font-size: .8rem; font-weight: 600; color: #fff; line-height: 1.25; }
.ii-user .role { font-size: .62rem; color: var(--nav-dim); }
.ii-navfoot {
  margin-top: var(--s4); padding-top: var(--s3);
  border-top: 1px solid var(--nav-2);
  font-size: .64rem; color: var(--nav-dim); line-height: 1.7;
}
.ii-navfoot b { color: var(--nav-ink); font-weight: 600; }

/* ══ ХУУДАСНЫ ТОЛГОЙ ═════════════════════════════════════════ */
.ii-topbar {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--s4); flex-wrap: wrap; margin: 0 0 .55rem;
}
.ii-topbar > div:first-child { flex: 1 1 18rem; min-width: 0; }
.ii-topbar h1 {
  font-size: 1.22rem; font-weight: 700; color: var(--ink);
  margin: 0; letter-spacing: -.015em; line-height: 1.25;
}
.ii-topbar .sub {
  font-size: .74rem; color: var(--muted); margin: .1rem 0 0; line-height: 1.4;
}
.ii-pills, .ii-chips { display: flex; gap: var(--s1); flex-wrap: wrap; }
.ii-pill, .ii-chip {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-sm); padding: .32rem .6rem;
  font-size: .72rem; color: var(--muted); white-space: nowrap;
}
.ii-pill b, .ii-chip b { color: var(--ink); font-variant-numeric: tabular-nums; }
.ii-title { font-size: 1.4rem; font-weight: 700; color: var(--ink); margin: 0; }
.ii-sub { font-size: .8rem; color: var(--muted); margin: .15rem 0 0; }

/* ══ КАРТ / ПАНЕЛ ════════════════════════════════════════════ */
.ii-card, .sm-panel {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-lg); padding: .8rem .9rem;
  box-shadow: var(--shadow); margin-bottom: .55rem;
}
.sm-panel { height: 100%; margin-bottom: 0; }
.ii-card h3, .sm-panel h3 {
  font-size: .95rem; font-weight: 700; color: var(--ink);
  margin: 0 0 .1rem; letter-spacing: -.005em;
}
.ii-card p.hint, .sm-panel .hint {
  font-size: .72rem; color: var(--muted); margin: .15rem 0 var(--s3);
}
.ii-card p.hint:last-child, .sm-panel .hint:last-child { margin-bottom: 0; }

/* Нимгэн хэсгийн толгой — зузаан картын оронд */
.ii-sechead {
  display: flex; align-items: baseline; gap: var(--s3); flex-wrap: wrap;
  margin: .2rem 0 .45rem;
}
.ii-sechead h3 {
  font-size: .95rem; font-weight: 700; color: var(--ink); margin: 0;
}
.ii-sechead .meta { font-size: .72rem; color: var(--muted); }

/* ══ KPI ═════════════════════════════════════════════════════ */
.sm-kpis {
  display: grid; grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--s2); margin-bottom: var(--s3);
}
.ii-kpis {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
  gap: var(--s2); margin-bottom: var(--s3);
}
@media (max-width: 1400px) { .sm-kpis { grid-template-columns: repeat(3, minmax(0,1fr)); } }
@media (max-width: 820px)  { .sm-kpis { grid-template-columns: repeat(2, minmax(0,1fr)); } }

.sm-kpi, .ii-kpi {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-lg); padding: .85rem .95rem;
  box-shadow: var(--shadow);
  display: flex; flex-direction: column; justify-content: space-between;
  min-height: 6.2rem;
}
.sm-kpi .top {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--s2);
}
.sm-kpi .lab, .ii-kpi-label {
  font-size: .62rem; font-weight: 700; letter-spacing: .08em;
  text-transform: uppercase; color: var(--muted); line-height: 1.35;
}
.sm-kpi .ico {
  width: 2.1rem; height: 2.1rem; border-radius: var(--r); flex: none;
  display: flex; align-items: center; justify-content: center; font-size: .95rem;
}
.sm-kpi .val, .ii-kpi-value {
  font-size: 1.35rem; font-weight: 700; color: var(--ink);
  font-variant-numeric: tabular-nums; line-height: 1.2;
  margin-top: .4rem; letter-spacing: -.02em;
}
.ii-kpi-value.na { color: var(--muted); font-size: 1.05rem; }
.sm-kpi .unit, .ii-kpi-sub { font-size: .66rem; color: var(--muted); margin-top: .1rem; }
.sm-kpi .foot {
  margin-top: .5rem; padding-top: .45rem; border-top: 1px solid var(--line-2);
  font-size: .68rem; color: var(--muted);
}
.sm-kpi .foot b { color: var(--ink-2); font-variant-numeric: tabular-nums; }

/* ══ ТЭМДЭГ ══════════════════════════════════════════════════ */
.ii-badge, .sm-chip {
  display: inline-block; border-radius: 999px;
  padding: .14em .55em; font-size: .66rem; font-weight: 600;
  line-height: 1.5; white-space: nowrap;
}

/* ══ ДОНУТ ═══════════════════════════════════════════════════ */
.sm-donut-wrap { display: flex; align-items: center; gap: var(--s4); flex-wrap: wrap; }
.sm-donut {
  width: 132px; height: 132px; border-radius: 50%; flex: none;
  display: flex; align-items: center; justify-content: center;
}
.sm-donut .hole {
  width: 86px; height: 86px; border-radius: 50%; background: var(--surface);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.sm-donut .hn {
  font-size: 1.1rem; font-weight: 700; color: var(--ink);
  font-variant-numeric: tabular-nums; line-height: 1.1;
}
.sm-donut .hl {
  font-size: .55rem; color: var(--muted); letter-spacing: .1em; margin-top: .1rem;
}
.sm-legend { display: grid; gap: .45rem; flex: 1; min-width: 9rem; }
.sm-leg { display: flex; align-items: center; gap: var(--s2); font-size: .75rem; }
.sm-leg .sw { width: 8px; height: 8px; border-radius: 2px; flex: none; }
.sm-leg .nm { color: var(--ink-2); font-weight: 500; }
.sm-leg .ct {
  margin-left: auto; color: var(--muted); font-variant-numeric: tabular-nums;
}

/* ══ БАГАНАН ДИАГРАМ ═════════════════════════════════════════ */
.sm-bars { display: flex; align-items: flex-end; gap: var(--s2); height: 140px; }
.sm-bar { flex: 1; display: flex; flex-direction: column; align-items: center; gap: .25rem; }
.sm-bar .n {
  font-size: .66rem; font-weight: 600; color: var(--ink-2);
  font-variant-numeric: tabular-nums;
}
.sm-bar .col {
  width: 100%; background: linear-gradient(180deg, var(--brand) 0%, var(--brand-600) 100%);
  border-radius: var(--r-sm) var(--r-sm) 0 0; min-height: 3px;
}
.sm-xlabels { display: flex; gap: var(--s2); margin-top: .35rem; }
.sm-xlabels span {
  flex: 1; text-align: center; font-size: .6rem; color: var(--muted); line-height: 1.3;
}

/* ══ ЖАГСААЛТЫН МӨР ══════════════════════════════════════════ */
.sm-list { display: grid; gap: .4rem; }
.sm-item {
  display: flex; align-items: center; gap: var(--s2);
  border: 1px solid var(--line); border-radius: var(--r); padding: .5rem .65rem;
  transition: border-color .12s ease;
}
.sm-item:hover { border-color: var(--brand-100); }
.sm-item .ico {
  width: 1.75rem; height: 1.75rem; border-radius: var(--r-sm); flex: none;
  display: flex; align-items: center; justify-content: center; font-size: .78rem;
}
.sm-item .nm { font-size: .77rem; font-weight: 600; color: var(--ink); }
.sm-item .rt {
  margin-left: auto; text-align: right; font-size: .68rem; color: var(--muted);
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.sm-item .rt b { display: block; color: var(--ink); font-size: .8rem; }

/* ══ HTML ХҮСНЭГТ ════════════════════════════════════════════ */
.scrollx { overflow-x: auto; }
.sm-tbl { width: 100%; border-collapse: collapse; font-size: .73rem; }
.sm-tbl th {
  font-size: .58rem; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
  color: var(--muted); text-align: left; padding: 0 .5rem .4rem 0;
  border-bottom: 1px solid var(--line); white-space: nowrap;
}
.sm-tbl td {
  padding: .42rem .5rem; padding-left: 0;
  border-bottom: 1px solid var(--line-2); color: var(--ink-2); vertical-align: middle;
}
.sm-tbl tbody tr:hover td { background: var(--surface-2); }
.sm-tbl tr:last-child td { border-bottom: none; }
.sm-tbl .num {
  text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap;
  color: var(--ink);
}
.sm-tbl .nm {
  max-width: 11rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: var(--ink); font-weight: 500;
}

/* ══ STREAMLIT DATAFRAME ═════════════════════════════════════ */
div[data-testid="stDataFrame"] {
  border: 1px solid var(--line); border-radius: var(--r-lg);
  overflow: hidden; box-shadow: var(--shadow); background: var(--surface);
}
div[data-testid="stDataFrame"] * { font-family: var(--font) !important; }

/* ══ ABC × XYZ МАТРИЦ ════════════════════════════════════════ */
.ii-matrix { width: 100%; border-collapse: separate; border-spacing: 5px; }
.ii-matrix th {
  font-size: .68rem; font-weight: 600; color: var(--muted);
  padding: 0 0 .15rem; text-align: center;
}
.ii-matrix td.rowhead {
  font-size: .9rem; font-weight: 800; color: var(--muted);
  width: 20px; text-align: center;
}
.ii-cell { border-radius: var(--r); padding: .5rem .6rem; }
.ii-cell .top {
  display: flex; justify-content: space-between; align-items: baseline;
  font-weight: 800; font-size: .9rem; margin-bottom: .25rem;
}
.ii-cell .top span { font-size: .68rem; font-weight: 700; opacity: .82; }
.ii-cell .kv {
  display: flex; justify-content: space-between;
  font-size: .65rem; line-height: 1.55; font-variant-numeric: tabular-nums;
}
.ii-cell .kv i { font-style: normal; opacity: .78; }
.ii-total {
  font-size: .9rem; font-weight: 700; color: var(--muted); text-align: center;
}

/* ══ ТЭНЦВЭРИЙН МӨР ══════════════════════════════════════════ */
.ii-bal {
  display: flex; align-items: center; gap: var(--s2);
  border-radius: var(--r); padding: .45rem .7rem; margin-bottom: .3rem;
  font-variant-numeric: tabular-nums; font-size: .76rem;
}
.ii-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.ii-bal .n { font-size: 1rem; font-weight: 700; min-width: 52px; }
.ii-bal .p { min-width: 48px; color: var(--muted); }
.ii-bal .q { min-width: 74px; text-align: right; color: var(--muted); }
.ii-bal .v { flex: 1; text-align: right; color: var(--ink); font-weight: 600; }

/* ══ АСУУЛТЫН КАРТ ═══════════════════════════════════════════ */
.ii-qa { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem,1fr)); gap: var(--s2); }
.ii-qa-card {
  border: 1px solid var(--line); border-radius: var(--r);
  padding: .65rem .75rem; background: var(--surface);
}
.ii-qa-q { font-size: .7rem; color: var(--muted); min-height: 2.4em; line-height: 1.4; }
.ii-qa-a {
  font-size: 1.25rem; font-weight: 700; color: var(--ink);
  font-variant-numeric: tabular-nums; margin-top: .2rem; letter-spacing: -.02em;
}
.ii-qa-a.na { font-size: .95rem; color: var(--muted); }
.ii-qa-u { font-size: .63rem; color: var(--muted); line-height: 1.4; }

/* ══ ДООД ХУРААНГУЙ ══════════════════════════════════════════ */
.sm-tiles {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
  gap: var(--s2); margin-top: var(--s3);
}
.sm-tile {
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg);
  padding: .8rem .95rem; display: flex; align-items: center; gap: var(--s3);
  box-shadow: var(--shadow);
}
.sm-tile .ico {
  width: 2.3rem; height: 2.3rem; border-radius: var(--r); flex: none;
  display: flex; align-items: center; justify-content: center; font-size: 1rem;
}
.sm-tile .lab { font-size: .64rem; color: var(--muted); line-height: 1.4; }
.sm-tile .val {
  font-size: 1.05rem; font-weight: 700; color: var(--ink);
  font-variant-numeric: tabular-nums; letter-spacing: -.02em;
}

/* ══ МЭДЭГДЭЛ ════════════════════════════════════════════════ */
.ii-note, .ii-warn {
  border-radius: var(--r); padding: .55rem .8rem;
  font-size: .75rem; margin-bottom: var(--s3); line-height: 1.55;
}
.ii-note {
  background: var(--brand-50); border: 1px solid var(--brand-100); color: var(--brand-700);
}
.ii-warn { background: var(--warn-bg); border: 1px solid #f2ddb8; color: var(--warn); }
.ii-note b, .ii-warn b { font-weight: 700; }

.ii-empty {
  border: 1px dashed var(--line); border-radius: var(--r-lg);
  padding: var(--s5); text-align: center; color: var(--muted);
  font-size: .82rem; background: var(--surface-2);
}

/* ══ НЭВТРЭХ ДЭЛГЭЦ ══════════════════════════════════════════ */
.ii-brandpane {
  background: linear-gradient(155deg, var(--brand) 0%, var(--nav) 100%);
  border-radius: 18px; padding: 2.1rem 2rem 1.5rem;
  color: #fff; min-height: 27rem;
  display: flex; flex-direction: column; justify-content: space-between;
  box-shadow: 0 20px 44px -26px rgba(10, 53, 39, .6);
}
.ii-brandpane .logo {
  margin-bottom: var(--s5); background: #fff; border-radius: var(--r);
  padding: .55rem .8rem; display: inline-block;
}
.ii-brandpane .logo img { height: 42px; width: auto; display: block; }
.ii-wordmark { font-size: 1.5rem; font-weight: 800; letter-spacing: .2em; color: #fff; }
.ii-wordmark-sub {
  font-size: .55rem; letter-spacing: .2em; text-transform: uppercase;
  color: rgba(255,255,255,.65); margin-top: .3rem;
}
.ii-brandpane h1 {
  font-size: 1.55rem; font-weight: 700; line-height: 1.25;
  margin: 0 0 .5rem; color: #fff; letter-spacing: -.02em;
}
.ii-brandpane .lede {
  font-size: .82rem; line-height: 1.6; color: rgba(255,255,255,.78);
  margin: 0 0 var(--s5); max-width: 34ch;
}
.ii-feat { display: flex; gap: var(--s2); align-items: flex-start; margin-bottom: .55rem; }
.ii-feat .ico {
  width: 26px; height: 26px; border-radius: var(--r-sm); flex: none;
  background: rgba(255,255,255,.15); display: flex;
  align-items: center; justify-content: center; font-size: .78rem;
}
.ii-feat .txt { font-size: .76rem; line-height: 1.45; color: rgba(255,255,255,.88); }
.ii-feat .txt b { color: #fff; font-weight: 600; }
.ii-brandfoot {
  font-size: .64rem; color: rgba(255,255,255,.55);
  border-top: 1px solid rgba(255,255,255,.16);
  padding-top: var(--s3); margin-top: var(--s4);
}
.ii-formpane { padding: var(--s5) var(--s1) 0 var(--s4); }
.ii-formpane .eyebrow {
  font-size: .58rem; font-weight: 700; letter-spacing: .16em;
  text-transform: uppercase; color: var(--brand); margin-bottom: .35rem;
}
.ii-formpane h2 {
  font-size: 1.5rem; font-weight: 700; color: var(--ink);
  margin: 0; letter-spacing: -.02em;
}
.ii-formpane p.sub {
  font-size: .8rem; color: var(--muted); margin: .35rem 0 var(--s4); line-height: 1.55;
}
.ii-formpane .note {
  font-size: .68rem; color: var(--muted); line-height: 1.6;
  border-top: 1px solid var(--line); padding-top: var(--s3); margin-top: var(--s4);
}

/* ══ ХУУДАСЛАЛТ ══════════════════════════════════════════════ */
.pg-info {
  font-size: .74rem; color: var(--muted); line-height: 2.3rem;
  font-variant-numeric: tabular-nums;
}
.pg-info b { color: var(--ink); }

/* ══ ФАЙЛ ОРУУЛАХ ════════════════════════════════════════════ */
.up-hero { max-width: 54rem; margin: var(--s5) auto var(--s4); text-align: center; }
.up-hero h1 {
  font-size: 1.85rem; font-weight: 700; color: var(--ink);
  margin: 0 0 .5rem; letter-spacing: -.025em; line-height: 1.25;
}
.up-hero p.lede {
  font-size: .88rem; color: var(--muted); margin: 0 auto var(--s5);
  max-width: 44ch; line-height: 1.6;
}
.up-steps {
  display: flex; align-items: center; justify-content: center;
  gap: var(--s5); flex-wrap: wrap; margin-bottom: var(--s5);
}
.up-step { display: flex; align-items: center; gap: var(--s2); }
.up-step .n {
  width: 1.55rem; height: 1.55rem; border-radius: 50%;
  border: 1.5px solid var(--line); color: var(--muted);
  font-size: .72rem; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.up-step.on .n { background: var(--brand); border-color: var(--brand); color: #fff; }
.up-step .t {
  font-size: .66rem; font-weight: 700; letter-spacing: .12em;
  text-transform: uppercase; color: var(--muted);
}
.up-step.on .t { color: var(--brand); }

/* Streamlit-ийн уншуулагчийг том буулгах бүс болгох */
.up-zone div[data-testid="stFileUploader"] > section,
.up-zone div[data-testid="stFileUploaderDropzone"] {
  border: 2px dashed var(--brand-100) !important;
  border-radius: var(--r-lg) !important;
  background: var(--surface) !important;
  padding: var(--s6) var(--s4) !important;
  min-height: 12rem;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  transition: border-color .15s ease, background .15s ease;
}
.up-zone div[data-testid="stFileUploader"] > section:hover,
.up-zone div[data-testid="stFileUploaderDropzone"]:hover {
  border-color: var(--brand) !important; background: var(--brand-50) !important;
}
.up-zone div[data-testid="stFileUploader"] label { display: none !important; }
.up-zone div[data-testid="stFileUploader"] small { color: var(--muted) !important; }
.up-zone div[data-testid="stFileUploader"] button {
  background: var(--surface) !important; border: 1px solid var(--line) !important;
  color: var(--ink-2) !important; border-radius: var(--r) !important;
  font-weight: 600 !important;
}
.up-zone div[data-testid="stFileUploader"] button:hover {
  border-color: var(--brand) !important; color: var(--brand) !important;
}
.up-note {
  max-width: 54rem; margin: 0 auto; text-align: center;
  font-size: .72rem; color: var(--muted); margin-top: var(--s3); line-height: 1.65;
}
.up-cols {
  max-width: 54rem; margin: var(--s4) auto 0;
  display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: var(--s2);
}
.up-col {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r); padding: .7rem .85rem; text-align: left;
}
.up-col .h {
  font-size: .68rem; font-weight: 700; letter-spacing: .08em;
  text-transform: uppercase; color: var(--brand); margin-bottom: .25rem;
}
.up-col .d { font-size: .72rem; color: var(--muted); line-height: 1.55; }

/* ══ ШҮҮЛТҮҮРИЙН ЗУРВАС ═══════════════════════════════════════ */
.ii-filterbar {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-lg); padding: .6rem .8rem .2rem;
  box-shadow: var(--shadow); margin-bottom: var(--s3);
}
.ii-filterlab {
  display: block;
  font-size: .58rem; font-weight: 700; letter-spacing: .12em;
  text-transform: uppercase; color: var(--muted);
  /* ⚠️ Тодорхой line-height + зай — эс бөгөөс дээрх элемент дарж таллана */
  line-height: 1.5; padding: .15rem 0 .1rem; margin: 0;
}
/* Файлын мөр — нимгэн */
div[data-testid="stExpander"] { border: none !important; margin-bottom: .3rem; }
div[data-testid="stExpander"] details {
  border: 1px solid var(--line) !important; border-radius: var(--r) !important;
  background: var(--surface) !important;
}
div[data-testid="stExpander"] summary { padding: .3rem .7rem !important; font-size: .76rem; }
/* Мэдэгдэл — нимгэн */
.ii-note, .ii-warn { padding: .4rem .7rem; margin-bottom: .5rem; font-size: .72rem; }

/* ══ STREAMLIT УДИРДЛАГА ═════════════════════════════════════ */
div[data-testid="stSelectbox"] label,
div[data-testid="stMultiSelect"] label { display: none; }
div[data-baseweb="select"] > div, div[data-baseweb="input"] > div {
  border-radius: var(--r) !important; border-color: var(--line) !important;
  background: var(--surface) !important; min-height: 2.35rem;
}
div[data-baseweb="select"] > div:hover { border-color: var(--brand-100) !important; }
.stButton button {
  border-radius: var(--r); font-weight: 600; font-size: .8rem;
  border: 1px solid var(--line); background: var(--surface); color: var(--ink-2);
  transition: all .12s ease;
}
.stButton button:hover { border-color: var(--brand); color: var(--brand); }
.stButton button[kind="primary"],
.stButton button[kind="primaryFormSubmit"] {
  background: var(--brand); border-color: var(--brand); color: #fff; height: 2.5rem;
}
.stButton button[kind="primary"]:hover,
.stButton button[kind="primaryFormSubmit"]:hover {
  background: var(--brand-600); border-color: var(--brand-600); color: #fff;
}
div[data-testid="stDownloadButton"] button {
  background: var(--brand); border-color: var(--brand); color: #fff;
  border-radius: var(--r); font-weight: 600;
}
div[data-testid="stDownloadButton"] button:hover {
  background: var(--brand-600); color: #fff;
}
.ii-auth div[data-testid="stTextInput"] label {
  display: block !important; font-size: .7rem !important;
  font-weight: 600 !important; color: var(--muted) !important;
}
.ii-auth div[data-testid="stTextInput"] input { height: 2.5rem; font-size: .88rem; }
.ii-auth div[data-testid="stForm"] { border: none; padding: 0; }
div[data-testid="stForm"] { border: none; padding: 0; }

/* Мөрийн хоорондын зайг жигдрүүлэх */
div[data-testid="stVerticalBlock"] > div:empty { display: none; }
div[data-testid="stVerticalBlock"] { gap: .45rem !important; }
div[data-testid="stHorizontalBlock"] { gap: .5rem !important; }
/* ⚠️ stElementContainer-ийн margin-г тэглэхгүй — зэргэлдээ элементүүд
   давхцаж, текст дарагдан таллаа тасарч байсан. Зайг vertical block-ийн
   gap хариуцна. */
hr { border-color: var(--line); }

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
</style>
"""

#: Нэвтэрсэн үед — цэс ҮРГЭЛЖ нээлттэй, хумих товчгүй
SIDEBAR_PINNED = """
<style>
  [data-testid="stSidebarCollapseButton"],
  [data-testid="collapsedControl"],
  button[data-testid="baseButton-headerNoPadding"],
  section[data-testid="stSidebar"] button[kind="header"] {
    display: none !important;
  }
  section[data-testid="stSidebar"],
  section[data-testid="stSidebar"][aria-expanded="false"] {
    transform: none !important;
    visibility: visible !important;
    margin-left: 0 !important;
    min-width: 15.5rem !important;
    max-width: 15.5rem !important;
  }
  @media (max-width: 820px) {
    /* Нарийн дэлгэцэд жирийн зан төлөв — цэс дэлгэцийг эзлэхгүй */
    [data-testid="stSidebarCollapseButton"],
    [data-testid="collapsedControl"] { display: block !important; }
    section[data-testid="stSidebar"],
    section[data-testid="stSidebar"][aria-expanded="false"] {
      min-width: 0 !important; max-width: 100% !important;
    }
  }
</style>
"""

#: Нэвтрээгүй үед — цэс огт харагдахгүй (агуулгагүй тул)
SIDEBAR_HIDDEN = """
<style>
  section[data-testid="stSidebar"],
  [data-testid="stSidebarCollapseButton"],
  [data-testid="collapsedControl"] { display: none !important; }
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

#: Түр файлын байршил
TMP_DIR = Path(tempfile.gettempdir()) / "inventory_dss"


def _digest(file_bytes: bytes) -> str:
    """Агуулгын богино хураангуй — файлын нэрийг өвөрмөц болгоно."""
    return hashlib.sha256(file_bytes).hexdigest()[:16]


def _write_atomic(path: Path, write) -> Path:
    """⚠️ Процесс тус бүрийн түр нэр рүү бичээд АТОМААР солино.

    Хэрэв шууд эцсийн нэр рүү бичвэл өөр процесс хагас бичигдсэн
    файлыг уншиж эвдэрсэн Excel гаргана.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    staging = path.with_name(f"{path.stem}.{os.getpid()}.part{path.suffix}")
    try:
        write(staging)
        os.replace(staging, path)
    finally:
        if staging.exists():
            staging.unlink(missing_ok=True)
    return path


@st.cache_data(show_spinner=False)
def run_analysis(file_bytes: bytes, file_name: str) -> dict:
    # ⚠️ Нэрийг агуулгаар нь өвөрмөц болгоно — ижил нэртэй өөр файл
    #    оруулсан хоёр хэрэглэгч бие биенийхээ өгөгдлийг дарахгүй.
    safe = f"{_digest(file_bytes)}_{Path(file_name).name}"
    src = _write_atomic(TMP_DIR / safe, lambda dst: dst.write_bytes(file_bytes))
    return collect(src)


@st.cache_data(show_spinner=False)
def build_excel(file_bytes: bytes, file_name: str) -> bytes:
    data = run_analysis(file_bytes, file_name)
    out = _write_atomic(
        TMP_DIR / f"report_{_digest(file_bytes)}.xlsx",
        lambda dst: build_workbook(data, dst),
    )
    return out.read_bytes()


# ─────────────────────────────────────────────────────────────────────
# Дахин ашиглагдах блокууд
# ─────────────────────────────────────────────────────────────────────

def page_head(title: str, subtitle: str, view: dict, meta: dict) -> None:
    """Бүх хуудсанд НЭГ ижил толгой — гарчиг зүүн, хамрах хүрээ баруун."""
    scope = view["scope"]
    st.markdown(
        f"<div class='ii-topbar'><div>"
        f"<h1>{esc(title)}</h1>"
        f"<p class='sub'>{esc(subtitle)}</p>"
        f"</div><div class='ii-pills'>"
        f"<span class='ii-pill'>Тооцооны сар <b>{esc(meta['calculationMonth'])}</b></span>"
        f"<span class='ii-pill'><b>{esc(meta['periods'][0])}</b> … "
        f"<b>{esc(meta['periods'][-1])}</b></span>"
        f"<span class='ii-pill'><b>{scope['skus']:,}</b> SKU</span>"
        f"<span class='ii-pill'><b>{scope['positions']:,}</b> байрлал</span>"
        f"</div></div>",
        unsafe_allow_html=True,
    )
    if view["filter_active"]:
        st.markdown(
            "<div class='ii-note'>Шүүлтүүр идэвхтэй — бүх үзүүлэлт энэ "
            "хамрах хүрээгээр тооцогдож байна.</div>",
            unsafe_allow_html=True,
        )


def empty_state(text: str) -> None:
    """Хоосон төлөв — бүх хуудсанд нэг ижил."""
    st.markdown(f"<div class='ii-empty'>{esc(text)}</div>", unsafe_allow_html=True)


def panel_open(title: str, hint: str = "") -> None:
    """Хэсгийн нимгэн толгой — гарчиг ба тайлбар НЭГ мөрөнд."""
    st.markdown(
        f"<div class='ii-sechead'><h3>{esc(title)}</h3>"
        + (f"<span class='meta'>{esc(hint)}</span>" if hint else "")
        + "</div>",
        unsafe_allow_html=True,
    )


def status_badge(status: str) -> str:
    tone = STATUS_TONE[status]
    return (f"<span class='ii-badge' style='background:{tone['bg']};"
            f"color:{tone['fg']}'>{esc(tone['labelMn'])}</span>")


def priority_badge(priority: str) -> str:
    tone = PRIORITY_TONE.get(priority, {"bg": "#eef2f0", "fg": "#5b7268"})
    return (f"<span class='ii-badge' style='background:{tone['bg']};"
            f"color:{tone['fg']}'>{esc(priority)}</span>")


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


#: Нэг хуудсанд харуулах мөрийн сонголт
PAGE_SIZES = [15, 25, 50, 100, 250]


def paged_table(df: pd.DataFrame, key: str, *, default_size: int = 15) -> None:
    """Хүснэгтийг хуудаслаж харуулна — урт гүйлгээний оронд 1 / 2 / 3 …

    ⚠️ Зөвхөн ХАРУУЛАХ зүсэлт. Нийт мөрийн тоо бүтнээрээ харагдана.
    """
    total = len(df)
    if total == 0:
        empty_state("Мөр алга.")
        return

    c_size, c_page, c_info = st.columns([1.1, 1.3, 4.6])

    size = c_size.selectbox(
        "Мөр", PAGE_SIZES,
        index=PAGE_SIZES.index(default_size),
        key=f"pg_{key}_size", label_visibility="collapsed",
        format_func=lambda n: f"{n} мөр",
    )

    pages = max(1, -(-total // size))       # дээш дугуйрсан хуваалт
    page = c_page.selectbox(
        "Хуудас", list(range(1, pages + 1)),
        key=f"pg_{key}_page", label_visibility="collapsed",
        format_func=lambda i: f"{i} / {pages}",
    )

    start = (page - 1) * size
    end = min(start + size, total)
    c_info.markdown(
        f"<div class='pg-info'>{start + 1:,}–{end:,} / <b>{total:,}</b> мөр</div>",
        unsafe_allow_html=True,
    )

    st.dataframe(
        df.iloc[start:end], hide_index=True, use_container_width=True,
        height=min(640, 45 + size * 35),
    )


def status_page(view: dict, meta: dict, status: str, title: str, subtitle: str) -> None:
    page_head(title, subtitle, view, meta)
    rows = [r for r in view["rows"] if r.stock_status == status]
    tone = STATUS_TONE[status]

    total = view["scope"]["positions"]
    st.markdown(
        f"<div class='ii-sechead'><h3>{status_badge(status)}</h3>"
        f"<span class='meta'><b>{len(rows):,}</b> байрлал · нийт {total:,}-ийн "
        f"{share(len(rows) / total if total else None)}</span></div>",
        unsafe_allow_html=True,
    )
    if not rows:
        empty_state("Энэ төлөвт тохирох байрлал алга.")
        return
    paged_table(
        inventory_table(rows),
        f"status_{status}",
    )


# ─────────────────────────────────────────────────────────────────────
# Хуудсууд
# ─────────────────────────────────────────────────────────────────────

def kpi_card(label: str, hue: str, icon: str, value: str,
             unit: str = "", foot: str = "") -> str:
    """STOCKMIND загварын KPI карт."""
    return (
        f"<div class='sm-kpi'>"
        f"<div class='top'>"
        f"<span class='lab' style='color:{hue}'>{esc(label)}</span>"
        f"<span class='ico' style='background:{hue}1a;color:{hue}'>{icon}</span>"
        f"</div>"
        f"<div class='val'>{esc(value)}</div>"
        f"<div class='unit'>{esc(unit) if unit else '&nbsp;'}</div>"
        f"<div class='foot'>{foot or '&nbsp;'}</div>"
        f"</div>"
    )


def render_donut(groups: list[dict], total: int) -> str:
    """Эрсдэлийн бүлгийн донут — conic-gradient, сан ашиглахгүй."""
    stops, cursor = [], 0.0
    for g in groups:
        # ⚠️ Локал нэр нь модулийн share() форматлагчийг далдлахгүй байх ёстой
        seg = (g["share"] or 0) * 100
        stops.append(f"{g['hue']} {cursor:.2f}% {cursor + seg:.2f}%")
        cursor += seg
    if cursor < 100:
        stops.append(f"var(--border) {cursor:.2f}% 100%")

    legend = "".join(
        f"<div class='sm-leg'>"
        f"<span class='sw' style='background:{g['hue']}'></span>"
        f"<span class='nm'>{esc(g['label_mn'])}</span>"
        f"<span class='ct'>{g['count']:,} · {share(g['share'])}</span>"
        f"</div>"
        for g in groups
    )

    return (
        f"<div class='sm-donut-wrap'>"
        f"<div class='sm-donut' style='background:conic-gradient({', '.join(stops)})'>"
        f"<div class='hole'><span class='hn'>{total:,}</span>"
        f"<span class='hl'>БАЙРЛАЛ</span></div></div>"
        f"<div class='sm-legend'>{legend}</div>"
        f"</div>"
    )


def render_bars(buckets: list[dict]) -> str:
    """Нөөцийн хоногийн тархалт — CSS баганан диаграм."""
    bars = "".join(
        f"<div class='sm-bar'><span class='n'>{b['count']:,}</span>"
        f"<span class='col' style='height:{max(3, b['ratio'] * 118):.0f}px'></span></div>"
        for b in buckets
    )
    labels = "".join(f"<span>{esc(b['label'])}</span>" for b in buckets)
    return f"<div class='sm-bars'>{bars}</div><div class='sm-xlabels'>{labels}</div>"


def render_table(headers: list[tuple[str, str]], rows: list[list[str]]) -> str:
    """headers: (нэр, класс) · rows: аль хэдийн форматлагдсан HTML нүднүүд."""
    head = "".join(
        f"<th class='{cls}'>{esc(name)}</th>" for name, cls in headers
    )
    body = "".join(
        "<tr>" + "".join(
            f"<td class='{cls}'>{cell}</td>"
            for (_, cls), cell in zip(headers, row)
        ) + "</tr>"
        for row in rows
    )
    if not rows:
        body = (f"<tr><td colspan='{len(headers)}' style='color:var(--muted);"
                f"padding:.9rem 0'>Мөр алга.</td></tr>")
    return f"<div class='scrollx'><table class='sm-tbl'>{head}{body}</table></div>"


def page_dashboard(view: dict, data: dict, meta: dict, flt: Filter) -> None:
    scope = view["scope"]
    groups = view["risk_groups"]
    rows = view["rows"]
    total_value = sum(r.position.current_stock_value for r in rows)

    # ── Дээд мөр ──
    st.markdown(
        f"<div class='ii-topbar'><div>"
        f"<h1>Ерөнхий тойм</h1>"
        f"<p class='sub'>Нөөцийн эрсдэлийг эрт илрүүлэх шийдвэр дэмжих систем</p>"
        f"</div><div class='ii-pills'>"
        f"<span class='ii-pill'>Тооцооны сар <b>{esc(meta['calculationMonth'])}</b></span>"
        f"<span class='ii-pill'><b>{esc(meta['periods'][0])}</b> … "
        f"<b>{esc(meta['periods'][-1])}</b></span>"
        f"<span class='ii-pill'><b>{scope['skus']:,}</b> SKU</span>"
        f"<span class='ii-pill'><b>{scope['positions']:,}</b> байрлал</span>"
        f"</div></div>",
        unsafe_allow_html=True,
    )

    if view["filter_active"]:
        st.markdown(
            "<div class='ii-note'>Шүүлтүүр идэвхтэй — бүх үзүүлэлт энэ "
            "хамрах хүрээгээр тооцогдож байна.</div>",
            unsafe_allow_html=True,
        )

    # ── KPI мөр ──
    cards = [kpi_card("Нийт", "#2563eb", "📦", f"{total_value:,.0f} ₮",
                      f"{sum(r.balance.current_stock for r in rows):,.0f} ширхэг",
                      f"<b>{scope['positions']:,}</b> байрлал")]
    for g in groups:
        cards.append(kpi_card(
            g["label_mn"], g["hue"],
            {"RISK": "⚠️", "WATCH": "🕐", "HEALTHY": "✅", "EXCESS": "📚"}[g["code"]],
            f"{g['value']:,.0f} ₮",
            f"{g['quantity']:,.0f} ширхэг",
            f"<b>{g['count']:,}</b> байрлал · {share(g['share'])}",
        ))
    st.markdown(f"<div class='sm-kpis'>{''.join(cards)}</div>", unsafe_allow_html=True)

    # ── Донут · баганан · AI тойм ──
    c1, c2, c3 = st.columns([1.05, 1.05, 1], gap="small")

    with c1:
        st.markdown(
            "<div class='sm-panel'><h3>Нөөцийн эрсдэлийн статус</h3>"
            "<p class='hint'>Байрлалын тоогоор</p>"
            + render_donut(groups, scope["positions"]) + "</div>",
            unsafe_allow_html=True,
        )

    with c2:
        st.markdown(
            "<div class='sm-panel'><h3>Нөөц хэдэн хоног хүрэлцэх</h3>"
            "<p class='hint'>Байрлалын тоогоор</p>"
            + render_bars(view["stock_days"]) + "</div>",
            unsafe_allow_html=True,
        )

    with c3:
        recs = view["recommendations"]
        transfer_qty = sum(t.quantity for t in view["transfers"])
        purchase_qty = sum(r.new_purchase_qty for r in rows)
        saving = sum(b.potential_saving or 0 for b in view["benchmarks"])
        stagnant = [r for r in rows if r.stock_status == "NO_MOVEMENT"]

        items = [
            ("🔁", "Шилжүүлэх санал", "#2563eb",
             f"{len({t.product_code for t in view['transfers']}):,} SKU",
             f"{transfer_qty:,} ш"),
            ("🛒", "Захиалах санал", "#17a34a",
             f"{len({r.position.product_code for r in rows if r.new_purchase_qty > 0}):,} SKU",
             f"{purchase_qty:,} ш"),
            ("🏷️", "Үнэ анхааруулга", "#f5a524",
             f"{len(view['margin_risk_codes']):,} SKU",
             f"{saving:,.0f} ₮"),
            ("🕐", "Хөдөлгөөнгүй SKU", "#8b5cf6",
             f"{len({r.position.product_code for r in stagnant}):,} SKU",
             f"{sum(r.position.current_stock_value for r in stagnant):,.0f} ₮"),
        ]
        body = "".join(
            f"<div class='sm-item'>"
            f"<span class='ico' style='background:{hue}1a;color:{hue}'>{icon}</span>"
            f"<span class='nm'>{esc(name)}</span>"
            f"<span class='rt'>{esc(sub)}<b>{esc(val)}</b></span></div>"
            for icon, name, hue, sub, val in items
        )
        crit = sum(1 for r in recs if r["priority"] == "CRITICAL")
        st.markdown(
            "<div class='sm-panel'><h3>AI зөвлөмжийн тойм</h3>"
            f"<p class='hint'>Дүрэмд суурилсан engine · {crit:,} нэн яаралтай</p>"
            f"<div class='sm-list'>{body}</div></div>",
            unsafe_allow_html=True,
        )

    # ── ТОП 10 хүснэгтүүд ──
    t1, t2, t3 = st.columns(3, gap="small")

    with t1:
        picked = top_rows(rows, status=("STOCKOUT_RISK", "LOW_STOCK"),
                          key=lambda r: r.shortage_value or 0)
        body = [[
            f"<span class='nm' title='{esc(r.position.product_name or '')}'>"
            f"{esc(r.position.product_code)}</span>",
            esc(r.position.location_code),
            f"{r.balance.shortage:,.0f}",
            f"{r.shortage_value or 0:,.0f}",
            f"<span class='sm-chip' style='background:"
            f"{STATUS_TONE[r.stock_status]['bg']};"
            f"color:{STATUS_TONE[r.stock_status]['fg']}'>"
            f"{r.balance.current_stock_days:,.0f} хон</span>",
        ] for r in picked]
        st.markdown(
            "<div class='sm-panel'><h3>Эрсдэлтэй ТОП 10</h3>"
            "<p class='hint'>Дутагдлын мөнгөн дүнгээр</p>"
            + render_table([("SKU", "nm"), ("Байршил", ""), ("Дутагдал", "num"),
                            ("Дүн ₮", "num"), ("Нөөц", "num")], body)
            + "</div>",
            unsafe_allow_html=True,
        )

    with t2:
        picked = sorted(view["transfers"], key=lambda t: -t.quantity)[:10]
        body = [[
            f"<span class='nm' title='{esc(view['name_by_code'].get(t.product_code) or '')}'>"
            f"{esc(t.product_code)}</span>",
            esc(t.from_location_code),
            esc(t.to_location_code),
            f"{t.quantity:,}",
            f"{t.estimated_value:,.0f}" if t.estimated_value is not None else NOT_AVAILABLE,
        ] for t in picked]
        st.markdown(
            "<div class='sm-panel'><h3>Шилжүүлэх ТОП 10</h3>"
            "<p class='hint'>Компани доторхыг эхэлж ашиглана</p>"
            + render_table([("SKU", "nm"), ("Хаанаас", ""), ("Хаашаа", ""),
                            ("Тоо", "num"), ("Дүн ₮", "num")], body)
            + "</div>",
            unsafe_allow_html=True,
        )

    with t3:
        picked = top_rows(rows, key=lambda r: r.new_purchase_qty)
        picked = [r for r in picked if r.new_purchase_qty > 0]
        bench = {b.product_code: b for b in view["benchmarks"]}
        body = []
        for r in picked:
            b = bench.get(r.position.product_code)
            body.append([
                f"<span class='nm' title='{esc(r.position.product_name or '')}'>"
                f"{esc(r.position.product_code)}</span>",
                f"<span class='nm'>{esc(b.min_source_key)}</span>" if b and b.min_source_key
                else f"<span style='color:var(--muted)'>{NOT_AVAILABLE}</span>",
                f"{b.min_unit_price:,.0f}" if b and b.min_unit_price is not None
                else NOT_AVAILABLE,
                f"{r.new_purchase_qty:,}",
            ])
        st.markdown(
            "<div class='sm-panel'><h3>Захиалах ТОП 10</h3>"
            "<p class='hint'>Хамгийн хямд нийлүүлэгчтэй нь</p>"
            + render_table([("SKU", "nm"), ("Нийлүүлэгч", "nm"),
                            ("Хамгийн бага ₮", "num"), ("Захиалах", "num")], body)
            + "</div>",
            unsafe_allow_html=True,
        )

    # ── Доод хураангуй ──
    shortage_value = sum(r.shortage_value or 0 for r in rows)
    excess_value = sum(r.excess_value or 0 for r in rows)
    tiles = [
        ("❄️", "#2563eb", "Нийт нөөцийн тоо хэмжээ",
         f"{sum(r.balance.current_stock for r in rows):,.0f} ш"),
        ("⚖️", "#17a34a", "Нийт нөөцийн өртөг", f"{total_value:,.0f} ₮"),
        ("🔁", "#8b5cf6", "Шилжүүлгээр хаагдах дутагдал",
         f"{sum(r.transfer_in_qty for r in rows):,} ш"),
        ("📥", "#f5a524", "Захиалах шаардлагатай", f"{purchase_qty:,} ш"),
    ]
    st.markdown(
        "<div class='sm-tiles'>"
        + "".join(
            f"<div class='sm-tile'>"
            f"<span class='ico' style='background:{hue}1a;color:{hue}'>{icon}</span>"
            f"<span><span class='lab'>{esc(lab)}</span><br>"
            f"<span class='val'>{esc(val)}</span></span></div>"
            for icon, hue, lab, val in tiles
        )
        + "</div>",
        unsafe_allow_html=True,
    )

    st.markdown(
        f"<div class='ii-note' style='margin-top:.9rem'>"
        f"Дутагдлын нийт дүн <b>{shortage_value:,.0f} ₮</b> · "
        f"илүүдлийн нийт дүн <b>{excess_value:,.0f} ₮</b>. "
        f"⚠️ Ашгийн үзүүлэлт — эх өгөгдөлд борлуулалтын орлого байхгүй тул "
        f"<b>{NOT_AVAILABLE}</b>."
        f"</div>",
        unsafe_allow_html=True,
    )


def page_inventory_overview(view: dict, meta: dict) -> None:
    page_head("Нөөцийн ерөнхий байдал",
              "Байрлал тус бүрийн баланс, төлөв ба шийдвэр", view, meta)
    render_kpi_grid(view["kpis"][:7])
    paged_table(
        inventory_table(view["rows"]),
        "inventory_overview",
    )


def page_risk(view: dict, meta: dict) -> None:
    page_head("Нөөцийн эрсдэл",
              "CRITICAL болон HIGH ач холбогдолтой байрлал", view, meta)
    rows = view["risk_rows"]
    if not rows:
        empty_state("Эрсдэлтэй мөр илрээгүй.")
        return
    panel_open("Эрсдэлтэй байрлалууд",
               f"Нийт {len(rows):,} мөр — ач холбогдлын дарааллаар")
    paged_table(
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
        "risk",
    )


def page_matrix(view: dict, meta: dict) -> None:
    page_head("ABCXYZ матриц", "9 хосолсон ангиллын дэлгэрэнгүй", view, meta)
    render_matrix(view["matrix"])
    paged_table(
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
        "matrix",
    )


def page_abc_analysis(view: dict, data: dict, meta: dict) -> None:
    page_head("ABCXYZ шинжилгээ",
              "ABC нь борлуулалтын ӨРТГИЙН дүнгээр, XYZ нь хэлбэлзлээр", view, meta)

    codes = {r.position.product_code for r in view["rows"]}
    rows = [r for r in data["abcXyz"] if r.product_code in codes]

    left, right = st.columns(2)
    with left:
        panel_open("ABC хуваарилалт", "Борлуулалтын өртгийн дүнгээр")
        df = (pd.DataFrame([{"ABC": r.abc, "Дүн": r.sales_value} for r in rows])
              .groupby("ABC", as_index=False).agg(SKU=("Дүн", "size"), Дүн=("Дүн", "sum")))
        st.bar_chart(df.set_index("ABC")["Дүн"], height=220, color="#4f46e5")
    with right:
        panel_open("XYZ хуваарилалт", "Сарын хэлбэлзлийн коэффициентээр")
        df = (pd.DataFrame([{"XYZ": r.xyz, "Дүн": r.sales_value} for r in rows])
              .groupby("XYZ", as_index=False).agg(SKU=("Дүн", "size"), Дүн=("Дүн", "sum")))
        st.bar_chart(df.set_index("XYZ")["SKU"], height=220, color="#4f46e5")

    paged_table(
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
        "abc_analysis",
    )


def page_purchase(view: dict, meta: dict) -> None:
    page_head("Худалдан авалтын санал",
              "Шилжүүлгээр хаагдаагүй дутагдалд л шинэ худалдан авалт", view, meta)
    rows = [r for r in view["rows"] if r.new_purchase_qty > 0]
    if not rows:
        empty_state("Худалдан авалтын шаардлага илрээгүй.")
        return
    panel_open(
        "Дахин татан авах санал",
        f"{len(rows):,} байрлал · нийт "
        f"{sum(r.new_purchase_qty for r in rows):,} ширхэг · "
        f"тоо нь бүхэл тоо руу дээш дугуйрна",
    )
    paged_table(
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
        "purchase",
    )


def page_transfers(view: dict, meta: dict) -> None:
    page_head("Шилжүүлэх санал",
              "Компани доторх нөөцийг бүрэн ашигласны дараа л компани хооронд",
              view, meta)
    transfers = view["transfers"]
    if not transfers:
        empty_state("Шилжүүлэх боломж илрээгүй — дутагдлыг нөхөх илүүдэл алга.")
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

    paged_table(
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
        "transfers",
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
        empty_state("Үнэ жишихэд хангалттай худалдан авалтын өгөгдөл алга.")
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

    paged_table(
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
        "price",
    )

    if risk_codes:
        panel_open("Ашгийн эрсдэлтэй бүтээгдэхүүн")
        reasons = view["margin_risk_reasons"]
        paged_table(
            pd.DataFrame([{
                "Код": code,
                "Нэр": view["name_by_code"].get(code) or NOT_AVAILABLE,
                "Шалтгаан": " · ".join(reasons.get(code, [])) or NOT_AVAILABLE,
            } for code in sorted(risk_codes)]),
            "price2",
        )


def page_ai(view: dict, meta: dict) -> None:
    page_head("AI шийдвэрийн зөвлөмж",
              "Дүрэмд суурилсан engine — эх өгөгдөлгүй үед тоо зохиохгүй",
              view, meta)
    recs = view["recommendations"]
    if not recs:
        empty_state("Зөвлөмж алга.")
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

    paged_table(
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
        "ai",
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
        paged_table(
            pd.DataFrame(issues),
            "quality",
        )
    else:
        empty_state("✓ Тэмдэглэх алдаа илрээгүй.")

    panel_open("Хөдөлгөөнгүй нөөц")
    stagnant = view["stagnant_rows"]
    if not stagnant:
        empty_state("Хөдөлгөөнгүй нөөц илрээгүй.")
        return
    paged_table(
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
        "quality2",
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
    (None, ["Ерөнхий тойм"]),
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

# ⚠️ Толгойн лого нь хажуугийн навигацид шилжсэн тул энд давхардуулахгүй.

# ── 🔐 НЭВТРЭЛТИЙН ХААЛТ ──
# ⚠️ Үүнээс доош ямар ч өгөгдөл уншигдахгүй, зурагдахгүй.
if not is_configured():
    st.markdown(SIDEBAR_HIDDEN, unsafe_allow_html=True)
    render_setup_screen()
    st.stop()

try:
    load_users()            # тохиргоо эвдэрсэн бол ЭНД илэрнэ
except AuthError as exc:
    st.markdown(SIDEBAR_HIDDEN, unsafe_allow_html=True)
    st.error(f"Нэвтрэлтийн тохиргоо буруу: {exc}")
    st.stop()

user = current_user()
if user is None:
    st.markdown(SIDEBAR_HIDDEN, unsafe_allow_html=True)
    if "attempts" not in st.session_state:
        st.session_state["attempts"] = Attempts()
    render_login_screen(st.session_state["attempts"])
    st.stop()

# ⭐ Энэ цэгээс цааш хэрэглэгч нэвтэрсэн — цэс тогтмол нээлттэй
st.markdown(SIDEBAR_PINNED, unsafe_allow_html=True)

# ⚠️ Эрх нь өөрчлөгдсөн байж болно — сонгосон хуудас зөвшөөрөгдөж байгаа эсэхийг
#    өгөгдөл уншихаас ӨМНӨ шалгана.
if not user.may_view(st.session_state.get("page", "Ерөнхий тойм")):
    st.session_state["page"] = "Ерөнхий тойм"

with st.sidebar:
    _nav_logo = logo_data_uri()
    st.markdown(
        "<div class='ii-brandbox'>"
        + (f"<img src='{_nav_logo}' alt='{esc(ORG_NAME)}'>" if _nav_logo else "")
        + "<span><span class='bn'>STOCKMIND</span><br>"
          "<span class='bs'>Inventory Decision Support</span></span></div>",
        unsafe_allow_html=True,
    )

    render_user_box(user)

# ⚠️ Уншуулагч ҮНДСЭН талбарт — хажуугийн цэс хаагдсан ч харагдана.
#    Ганц widget, ганц түлхүүр; байрлал нь л өөрчлөгдөнө.
_has_file = st.session_state.get("excel_file") is not None


def _upload_widget():
    return st.file_uploader(
        "Excel файл", type=["xlsx", "xlsm"],
        key="excel_file", label_visibility="collapsed",
        help="Sales · Purchase · Stock хуудас агуулсан файл",
    )


if not _has_file:
    st.markdown(
        "<div class='up-hero'>"
        "<h1>Excel файлаа оруулна уу</h1>"
        "<p class='lede'>Багана автоматаар танигдаж, өгөгдөл шалгагдан, "
        "удирдлагын түвшний шинжилгээ хэдхэн секундэд бэлэн болно.</p>"
        "<div class='up-steps'>"
        "<span class='up-step on'><span class='n'>1</span>"
        "<span class='t'>Оруулах</span></span>"
        "<span class='up-step'><span class='n'>2</span>"
        "<span class='t'>Шалгах</span></span>"
        "<span class='up-step'><span class='n'>3</span>"
        "<span class='t'>Шинжлэх</span></span>"
        "</div></div>",
        unsafe_allow_html=True,
    )

    zone = st.columns([1, 6, 1])[1]
    with zone:
        st.markdown("<div class='up-zone'>", unsafe_allow_html=True)
        uploaded = _upload_widget()
        st.markdown("</div>", unsafe_allow_html=True)

    st.markdown(
        "<div class='up-note'>Дэмжигдэх формат: <b>.xlsx · .xlsm</b> — "
        "sheet-үүд нэрээр биш, <b>бүтцээр нь</b> танигдана.</div>"
        "<div class='up-cols'>"
        "<div class='up-col'><div class='h'>Sales</div>"
        "<div class='d'>Бүтээгдэхүүн · байршил · сар · тоо хэмжээ · өртөг</div></div>"
        "<div class='up-col'><div class='h'>Purchase</div>"
        "<div class='d'>Нийлүүлэгч · сар · тоо хэмжээ · дүн</div></div>"
        "<div class='up-col'><div class='h'>Stock</div>"
        "<div class='d'>Бүтээгдэхүүн · байршил · үлдэгдэл · үнэ дүн</div></div>"
        "</div>",
        unsafe_allow_html=True,
    )
    st.stop()

# Энэ цэгт файл заавал байна — өмнөх ачаалалд уншуулсан.
uploaded = st.session_state["excel_file"]

file_bytes = uploaded.getvalue()

try:
    with st.spinner("Шинжилгээ хийж байна…"):
        data = run_analysis(file_bytes, uploaded.name)
except Exception as exc:  # noqa: BLE001 — хэрэглэгчид шалтгааныг харуулна
    st.error(f"Шинжилгээ амжилтгүй боллоо: {exc}")
    st.stop()

meta = data["meta"]
options = filter_options(data)

with st.expander(f"📄 {uploaded.name} — өөр файл оруулах"):
    _upload_widget()

# ── Шүүлтүүрийн зурвас ──
st.markdown(
    "<div class='ii-filterlab'>Шүүлтүүр</div>", unsafe_allow_html=True
)
bar = st.columns([1.5, 1.2, 1.0, 1.0, 1.3, 1.0])

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
    manufacturer = st.selectbox(
        "Үйлдвэрлэгч",
        options=[None] + options["manufacturers"],
        format_func=lambda m: "Бүх үйлдвэрлэгч" if m is None else m,
        label_visibility="collapsed",
    )

with bar[5]:
    if not user.role.can_export:
        # ⚠️ Зөвхөн нуухгүй — өгөгдлийг ОГТ бэлдэхгүй
        st.button("Excel тайлан", disabled=True, use_container_width=True,
                  help=f"«{user.role.label_mn}» эрхээр Excel татах боломжгүй")
    else:
        try:
            st.download_button(
                "Excel тайлан",
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
    manufacturers=[manufacturer] if manufacturer else [],
)

view = build_view(data, flt)

# ── Хажуугийн навигаци ──
with st.sidebar:
    st.session_state.setdefault("page", "Ерөнхий тойм")
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

    st.markdown(
        f"<div class='ii-navfoot'>Тооцооны сар <b>{esc(meta['calculationMonth'])}</b><br>"
        f"Эх файл <b>{esc(meta['sourceFile'])}</b><br>"
        f"Босго утга <b>src/config/*.json</b></div>",
        unsafe_allow_html=True,
    )

page = st.session_state.get("page", "Ерөнхий тойм")

# ⚠️ Цэс нуух нь хангалтгүй — хуудас зурахын ЯГ өмнө эрхийг дахин шалгана
if not user.may_view(page):
    st.session_state["page"] = "Ерөнхий тойм"
    page = "Ерөнхий тойм"

if view["scope"]["positions"] == 0:
    page_head(page, "Шүүлтүүрт тохирох байрлал алга", view, meta)
    st.warning("Сонгосон хамрах хүрээнд өгөгдөл олдсонгүй. Шүүлтүүрээ өөрчилнө үү.")
    st.stop()

if page == "Ерөнхий тойм":
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
