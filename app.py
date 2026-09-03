"""
INVENTORY INTELLIGENCE & DECISION SUPPORT SYSTEM — Streamlit UI.

Ажиллуулах:
    streamlit run app.py --server.port 8501 --server.address 0.0.0.0

⚠️ ЭНЭ ФАЙЛ ДОТОР БИЗНЕС ТООЦООЛОЛ ХИЙХГҮЙ.
   Бүх тоо `python/` доторх шалгагдсан engine-үүдээс (`export.collect.collect`)
   бэлнээр ирнэ — Next.js application-тай ЯГ ИЖИЛ логик, ижил тохиргоо
   (`src/config/*.json`). Энд зөвхөн ХАРУУЛАХ ажил хийгдэнэ.

⚠️ Fake data ашиглахгүй. Эх өгөгдөлд байхгүй утгыг зохиохгүй —
   «N/A» болон шалтгааныг нь харуулна.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import pandas as pd
import streamlit as st

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT / "python"))

from export.collect import collect  # noqa: E402
from export.excel_export import DECISION_LABEL, STATUS_LABEL, build_workbook  # noqa: E402

# ─────────────────────────────────────────────────────────────────────
# Тохиргоо
# ─────────────────────────────────────────────────────────────────────

st.set_page_config(
    page_title="Inventory Intelligence & DSS",
    page_icon="📦",
    layout="wide",
)

NA = "—"

PRIORITY_COLOR = {
    "CRITICAL": "🔴",
    "HIGH": "🟠",
    "MEDIUM": "🟡",
    "LOW": "🟢",
}

SCOPE_LABEL = {
    "ALL": "Бүгд",
    "WAREHOUSE": "Эм ханган нийлүүлэх төв",
    "PHARMACY": "Эмийн сан",
}


# ─────────────────────────────────────────────────────────────────────
# Форматлагч туслахууд (тооцоолол БИШ — зөвхөн харагдац)
# ─────────────────────────────────────────────────────────────────────

def money(value: float | None) -> str:
    return NA if value is None else f"{value:,.0f} ₮"


def qty(value: float | None, digits: int = 0) -> str:
    return NA if value is None else f"{value:,.{digits}f}"


def pct(value: float | None, digits: int = 1) -> str:
    return NA if value is None else f"{value * 100:,.{digits}f}%"


def raw_pct(value: float | None, digits: int = 1) -> str:
    """Аль хэдийн хувиар ирсэн утга (жишээ: price_gap_pct)."""
    return NA if value is None else f"{value:,.{digits}f}%"


# ─────────────────────────────────────────────────────────────────────
# Өгөгдөл татах — 7 секунд орчим тул кэшлэнэ
# ─────────────────────────────────────────────────────────────────────

@st.cache_data(show_spinner=False)
def run_analysis(file_bytes: bytes, file_name: str, scope: str) -> dict:
    """Excel-ийг engine рүү дамжуулна. Кэш нь (агуулга, нэр, хамрах хүрээ)-гээр."""
    tmp_dir = Path(tempfile.gettempdir()) / "inventory_dss"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp_path = tmp_dir / file_name
    tmp_path.write_bytes(file_bytes)
    return collect(tmp_path, scope)


@st.cache_data(show_spinner=False)
def build_excel(file_bytes: bytes, file_name: str, scope: str) -> bytes:
    """§25 — 17 sheet бүхий тайлан."""
    data = run_analysis(file_bytes, file_name, scope)
    out_dir = Path(tempfile.gettempdir()) / "inventory_dss"
    out_path = out_dir / f"inventory-report-{scope}.xlsx"
    build_workbook(data, out_path)
    return out_path.read_bytes()


# ─────────────────────────────────────────────────────────────────────
# Хэсэг бүрийн харагдац
# ─────────────────────────────────────────────────────────────────────

def render_kpis(meta: dict) -> None:
    st.subheader("Гүйцэтгэлийн үзүүлэлт")

    row1 = st.columns(4)
    row1[0].metric("Нийт SKU", qty(meta["skuCount"]))
    row1[1].metric("Байршил", qty(meta["locationCount"]))
    row1[2].metric("Борлуулалтын өртөг", money(meta["totalSalesValue"]))
    row1[3].metric("Нөөцийн үнэ дүн", money(meta["totalStockValue"]))

    row2 = st.columns(4)
    row2[0].metric("Дутагдал", f"{qty(meta['totalShortage'])} ш",
                   delta=money(meta["totalShortageValue"]), delta_color="inverse")
    row2[1].metric("Илүүдэл", f"{qty(meta['totalExcess'])} ш",
                   delta=money(meta["totalExcessValue"]), delta_color="inverse")
    row2[2].metric("Шилжүүлэх санал", f"{qty(meta['totalTransferQty'])} ш")
    row2[3].metric("Худалдан авах санал", f"{qty(meta['totalPurchaseQty'])} ш",
                   delta=f"{meta['purchaseSkuCount']} SKU", delta_color="off")

    row3 = st.columns(4)
    row3[0].metric("Үнийн боломжит хэмнэлт", money(meta["totalPotentialSaving"]))
    row3[1].metric("Үнэ жишсэн бүтээгдэхүүн", qty(meta["benchmarkedProducts"]),
                   delta=f"{meta['multiSourceProducts']} олон эх сурвалжтай",
                   delta_color="off")
    row3[2].metric("Ашгийн эрсдэлтэй", qty(meta["marginRiskProducts"]))
    row3[3].metric("Худалдан авалт зогсоох", qty(meta["stopPurchaseCount"]))

    st.caption(
        f"⚠️ Нийт ашиг / ашгийн хувь: **N/A** — {meta['marginReason']}"
    )


def render_abc_xyz(data: dict) -> None:
    st.subheader("ABC–XYZ шинжилгээ")
    st.caption(
        "ABC нь **борлуулалтын өртгийн дүнгээр** (тоо хэмжээгээр БИШ), "
        "XYZ нь сарын тоо хэмжээний хэлбэлзлээр (STDEV.P) ангилагдана."
    )

    matrix = data["matrix"]
    abc_rows = data["abcXyz"]

    left, right = st.columns(2)

    with left:
        st.markdown("**ABC хуваарилалт** (өртгийн дүнгээр)")
        abc_df = (
            pd.DataFrame([{"ABC": r.abc, "Борлуулалт": r.sales_value} for r in abc_rows])
            .groupby("ABC", as_index=False)
            .agg(SKU=("Борлуулалт", "size"), Дүн=("Борлуулалт", "sum"))
            .sort_values("ABC")
        )
        st.bar_chart(abc_df.set_index("ABC")["Дүн"], height=220)
        st.dataframe(
            abc_df.assign(Дүн=abc_df["Дүн"].map(money)),
            hide_index=True, use_container_width=True,
        )

    with right:
        st.markdown("**XYZ хуваарилалт** (хэлбэлзлээр)")
        xyz_df = (
            pd.DataFrame([{"XYZ": r.xyz, "Борлуулалт": r.sales_value} for r in abc_rows])
            .groupby("XYZ", as_index=False)
            .agg(SKU=("Борлуулалт", "size"), Дүн=("Борлуулалт", "sum"))
            .sort_values("XYZ")
        )
        st.bar_chart(xyz_df.set_index("XYZ")["SKU"], height=220)
        st.dataframe(
            xyz_df.assign(Дүн=xyz_df["Дүн"].map(money)),
            hide_index=True, use_container_width=True,
        )

    st.markdown("**ABC × XYZ матриц** — 9 хослол")
    st.dataframe(
        pd.DataFrame([{
            "Хос": c["abcXyz"],
            "SKU": c["skuCount"],
            "Борлуулалт": money(c["salesValue"]),
            "Эзлэх хувь": pct(c["salesShare"]),
            "Борлуулсан тоо": qty(c["salesQty"]),
            "Одоогийн нөөц": qty(c["currentStock"]),
            "Зохистой нөөц": qty(c["recommendedStock"]),
            "Эрсдэлтэй байрлал": c["riskCount"],
        } for c in matrix]),
        hide_index=True, use_container_width=True,
    )


def render_balance(data: dict) -> None:
    st.subheader("Нөөцийн тэнцвэр")

    summary = data["balanceSummary"]
    cols = st.columns(len(summary))
    for col, item in zip(cols, summary):
        col.metric(item["labelMn"], qty(item["count"]), delta=pct(item["share"]),
                   delta_color="off")

    st.dataframe(
        pd.DataFrame([{
            "Төлөв": s["labelMn"],
            "Байрлал": s["count"],
            "Эзлэх хувь": pct(s["share"]),
            "Тоо хэмжээ": qty(s["quantity"]),
            "Үнийн дүн": money(s["value"]),
        } for s in summary]),
        hide_index=True, use_container_width=True,
    )

    st.markdown("**Байрлал тус бүрийн шийдвэр**")
    rows = data["inventory"]
    st.dataframe(
        pd.DataFrame([{
            "Код": r.position.product_code,
            "Нэр": r.position.product_name or NA,
            "Байршил": r.position.location_code,
            "Хос": r.position.abc_xyz,
            "Сарын дундаж": qty(r.position.average_monthly_sales, 1),
            "Үлдэгдэл": qty(r.balance.current_stock, 1),
            "Нөөцийн хоног": qty(r.balance.current_stock_days, 1),
            "Зорилтот хоног": qty(r.balance.target_days),
            "Зохистой нөөц": qty(r.balance.recommended_stock, 1),
            "Дутагдал": qty(r.balance.shortage, 1),
            "Илүүдэл": qty(r.balance.excess, 1),
            "Төлөв": STATUS_LABEL.get(r.stock_status, r.stock_status),
            "Шилжиж ирэх": r.transfer_in_qty,
            "Худалдан авах": r.new_purchase_qty,
            "Шийдвэр": DECISION_LABEL.get(r.decision, r.decision),
        } for r in rows]),
        hide_index=True, use_container_width=True, height=420,
    )


def render_risk(data: dict) -> None:
    st.subheader("Эрсдэлтэй SKU")
    rows = data["riskRows"]
    if not rows:
        st.info("Эрсдэлтэй мөр илрээгүй.")
        return

    st.caption(f"Нийт {len(rows):,} мөр — ач холбогдлын дарааллаар.")
    st.dataframe(
        pd.DataFrame([{
            "Ач холбогдол": f"{PRIORITY_COLOR.get(r['priority'], '')} {r['priority']}",
            "Код": r["productCode"],
            "Нэр": r["productName"] or NA,
            "Хос": r["abcXyz"],
            "Байршил": r["locationCode"],
            "Үлдэгдэл": qty(r["currentStock"], 1),
            "Нөөцийн хоног": qty(r["stockDays"], 1),
            "Зорилтот хоног": qty(r["targetDays"]),
            "Дутагдал": qty(r["shortage"], 1),
            "Дутагдлын дүн": money(r["shortageValue"]),
            "Эрсдэл": r["risk"],
            "Арга хэмжээ": r["action"],
        } for r in rows]),
        hide_index=True, use_container_width=True, height=460,
    )


def render_transfers(data: dict) -> None:
    st.subheader("Шилжүүлэх санал")
    transfers = data["transfers"]

    if not transfers:
        st.info("Шилжүүлэх боломж илрээгүй — дутагдлыг нөхөх илүүдэл алга.")
        return

    st.caption(
        "Дутагдлыг **эхний шатнаас эхлэн** нөхнө. Тухайн шатанд илүүдэл "
        "хүрэлцэхгүй бол л дараагийн шат руу шилжинэ."
    )

    tier_df = (
        pd.DataFrame([{"Шат": t.tier_label_mn, "Тоо": t.quantity} for t in transfers])
        .groupby("Шат", as_index=False)
        .agg(Санал=("Тоо", "size"), Ширхэг=("Тоо", "sum"))
        .sort_values("Ширхэг", ascending=False)
    )
    total_qty = int(tier_df["Ширхэг"].sum())

    cols = st.columns(len(tier_df) + 1)
    for col, (_, row) in zip(cols, tier_df.iterrows()):
        col.metric(row["Шат"], f"{int(row['Ширхэг']):,} ш",
                   delta=f"{row['Ширхэг'] / total_qty * 100:.1f}%", delta_color="off")
    cols[-1].metric("НИЙТ", f"{total_qty:,} ш", delta=f"{len(transfers)} мөр",
                    delta_color="off")

    st.dataframe(
        pd.DataFrame([{
            "Код": t.product_code,
            "Нэр": data["nameByCode"].get(t.product_code) or NA,
            "Хаанаас": t.from_location_code,
            "Хаашаа": t.to_location_code,
            "Тоо": t.quantity,
            "Тооцоот дүн": money(t.estimated_value),
            "Шат": t.tier_label_mn,
            "Шалтгаан": t.reason_mn,
        } for t in transfers]),
        hide_index=True, use_container_width=True, height=420,
    )


def render_purchase(data: dict) -> None:
    st.subheader("Худалдан авалтын санал")
    rows = [r for r in data["inventory"] if r.new_purchase_qty > 0]

    if not rows:
        st.info("Худалдан авалтын шаардлага илрээгүй.")
        return

    st.caption(
        "Шилжүүлгээр хаагдаагүй дутагдалд л шинэ худалдан авалт санал болгоно. "
        "Тоо нь **бүхэл тоо руу дээш** дугуйрна."
    )
    st.dataframe(
        pd.DataFrame([{
            "Код": r.position.product_code,
            "Нэр": r.position.product_name or NA,
            "Байршил": r.position.location_code,
            "Хос": r.position.abc_xyz,
            "Зохистой нөөц": qty(r.balance.recommended_stock, 1),
            "Үлдэгдэл": qty(r.balance.current_stock, 1),
            "Шилжиж ирэх": r.transfer_in_qty,
            "Худалдан авах": r.new_purchase_qty,
            "Шийдвэр": DECISION_LABEL.get(r.decision, r.decision),
        } for r in rows]),
        hide_index=True, use_container_width=True, height=420,
    )


def render_price(data: dict) -> None:
    st.subheader("Худалдан авах үнийн хяналт")
    benchmarks = [b for b in data["benchmarks"] if b.min_unit_price is not None]

    if not benchmarks:
        st.info("Үнэ жишихэд хангалттай худалдан авалтын өгөгдөл алга.")
        return

    st.caption(
        "Үнэ нь **нийлүүлэгчээр** жишигдэнэ. Эх өгөгдөлд сувгийн хэмжүүр "
        "байхгүй тул суваг хоорондын үнийн харьцуулалт хийгдэхгүй."
    )

    risk_codes = data["marginRiskCodes"]
    st.dataframe(
        pd.DataFrame([{
            "Эрсдэл": "⚠️" if b.product_code in risk_codes else "",
            "Код": b.product_code,
            "Нэр": b.product_name or NA,
            "Эх сурвалж": b.source_count,
            "Хамгийн бага": money(b.min_unit_price),
            "Хамгийн их": money(b.max_unit_price),
            "Зөрүү": money(b.price_gap),
            "Зөрүү %": raw_pct(b.price_gap_pct),
            "Ноцтой байдал": b.gap_severity or NA,
            "Жигнэсэн дундаж": money(b.weighted_avg_unit_price),
            "Боломжит хэмнэлт": money(b.potential_saving),
            "Хамгийн хямд эх сурвалж": b.min_source_key or NA,
        } for b in benchmarks]),
        hide_index=True, use_container_width=True, height=420,
    )

    if risk_codes:
        st.markdown("**Ашгийн эрсдэлтэй бүтээгдэхүүн**")
        reasons = data["marginRiskReasons"]
        st.dataframe(
            pd.DataFrame([{
                "Код": code,
                "Нэр": data["nameByCode"].get(code) or NA,
                "Шалтгаан": " · ".join(reasons.get(code, [])) or NA,
            } for code in sorted(risk_codes)]),
            hide_index=True, use_container_width=True,
        )


def render_ai(data: dict) -> None:
    st.subheader("AI шийдвэрийн зөвлөмж")
    recs = data["recommendations"]
    st.caption(
        "Дүрэмд суурилсан шийдвэрийн engine (`price-control-rules.json`). "
        "Эх өгөгдөлгүй тохиолдолд тоо зохиохгүй."
    )

    counts = pd.Series([r["priority"] for r in recs]).value_counts()
    cols = st.columns(4)
    for col, key in zip(cols, ("CRITICAL", "HIGH", "MEDIUM", "LOW")):
        col.metric(f"{PRIORITY_COLOR[key]} {key}", qty(int(counts.get(key, 0))))

    picked = st.multiselect(
        "Ач холбогдлоор шүүх",
        options=["CRITICAL", "HIGH", "MEDIUM", "LOW"],
        default=["CRITICAL", "HIGH"],
    )
    shown = [r for r in recs if r["priority"] in picked] if picked else recs

    st.dataframe(
        pd.DataFrame([{
            "Ач холбогдол": f"{PRIORITY_COLOR.get(r['priority'], '')} {r['priority']}",
            "Код": r["product_code"],
            "Нэр": r["product_name"] or NA,
            "Байршил": r["location_code"],
            "Хос": r["abc_xyz"],
            "Эрсдэл": r["risk"],
            "Шалтгаан": r["reason"],
            "Нөлөө": r["impact"],
            "Арга хэмжээ": r["recommended_action"],
            "Тоо": qty(r["recommended_quantity"]) if r["recommended_quantity"] else NA,
            "Дүрэм": r["rule_code"],
        } for r in shown]),
        hide_index=True, use_container_width=True, height=460,
    )


def render_quality(data: dict) -> None:
    st.subheader("Өгөгдлийн чанар")
    q = data["quality"]

    cols = st.columns(4)
    cols[0].metric("Нийт мөр", qty(q["total"]))
    cols[1].metric("✅ Хүчинтэй", qty(q["valid"]))
    cols[2].metric("⚠️ Анхааруулга", qty(q["warning"]))
    cols[3].metric("❌ Алдаа", qty(q["error"]))

    issues = q.get("issues") or []
    if issues:
        st.dataframe(pd.DataFrame(issues), hide_index=True, use_container_width=True)
    else:
        st.success("Тэмдэглэх алдаа илрээгүй.")

    st.markdown("**Хөдөлгөөнгүй нөөц**")
    stagnant = data["stagnantRows"]
    if not stagnant:
        st.info("Хөдөлгөөнгүй нөөц илрээгүй.")
        return
    st.dataframe(
        pd.DataFrame([{
            "Код": r["productCode"],
            "Нэр": r["productName"] or NA,
            "Байршил": r["locationCode"],
            "Үлдэгдэл": qty(r["currentStock"], 1),
            "Үнийн дүн": money(r["stockValue"]),
            "Сүүлийн борлуулалт": r["lastSalesPeriod"] or NA,
            "Хэдэн сар": r["monthsSinceLastSale"] if r["monthsSinceLastSale"] is not None else NA,
            "Сүүлийн худалдан авалт": r["lastPurchasePeriod"] or NA,
            "Зөвлөмж": r["recommendation"],
        } for r in stagnant]),
        hide_index=True, use_container_width=True, height=380,
    )


# ─────────────────────────────────────────────────────────────────────
# Үндсэн урсгал
# ─────────────────────────────────────────────────────────────────────

st.title("📦 Inventory Intelligence & Decision Support System")
st.caption("Эм ханган нийлүүлэлтийн нөөцийн шинжилгээ ба шийдвэрийн систем")

with st.sidebar:
    st.header("Өгөгдөл")
    uploaded = st.file_uploader(
        "Excel файл (Sales · Purchase · Stock)",
        type=["xlsx", "xlsm"],
        help="Sheet-үүд нэрээр биш, БҮТЦЭЭР нь танигдана.",
    )

    scope = st.radio(
        "Хамрах хүрээ",
        options=["ALL", "WAREHOUSE", "PHARMACY"],
        format_func=lambda s: SCOPE_LABEL[s],
        index=0,
    )

    st.divider()
    st.caption(
        "Бүх тооцоолол `python/` доторх engine дээр хийгдэнэ. "
        "Босго утга, зорилтот хоног зэрэг нь `src/config/*.json`-оос уншигдана "
        "— кодод hardcode байхгүй."
    )

if uploaded is None:
    st.info(
        "👈 Зүүн талын хэсгээс Excel файлаа оруулна уу.\n\n"
        "Систем нь дараах шинжилгээг автоматаар гүйцэтгэнэ: "
        "**ABC–XYZ ангилал · нөөцийн оновчлол · нөөцийн тэнцвэр · "
        "шилжүүлэх ба худалдан авах санал · худалдан авах үнийн хяналт · "
        "ашгийн эрсдэл · AI шийдвэрийн зөвлөмж**."
    )
    st.stop()

file_bytes = uploaded.getvalue()

try:
    with st.spinner("Шинжилгээ хийж байна…"):
        data = run_analysis(file_bytes, uploaded.name, scope)
except Exception as exc:  # noqa: BLE001 — хэрэглэгчид шалтгааныг харуулна
    st.error(f"Шинжилгээ амжилтгүй боллоо: {exc}")
    st.stop()

meta = data["meta"]

info = st.columns(4)
info[0].metric("Эх файл", meta["sourceFile"])
info[1].metric("Тооцооны сар", meta["calculationMonth"])
info[2].metric("Ашигласан сар", f"{len(meta['periods'])} сар")
info[3].metric("Хамрах хүрээ", SCOPE_LABEL[scope])
st.caption(
    f"Дундажид ашигласан үе: **{meta['periods'][0]} … {meta['periods'][-1]}** "
    f"(тооцооны сар {meta['calculationMonth']} дундажид ОРОХГҮЙ)"
)

try:
    excel_bytes = build_excel(file_bytes, uploaded.name, scope)
    st.download_button(
        "⬇️ Excel тайлан татах (17 sheet)",
        data=excel_bytes,
        file_name=f"inventory-report-{meta['calculationMonth']}.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
except Exception as exc:  # noqa: BLE001
    st.warning(f"Excel тайлан үүсгэж чадсангүй: {exc}")

st.divider()

tabs = st.tabs([
    "Хяналтын самбар",
    "ABC–XYZ",
    "Нөөцийн тэнцвэр",
    "Эрсдэл",
    "Шилжүүлэг",
    "Худалдан авалт",
    "Үнийн хяналт",
    "AI зөвлөмж",
    "Өгөгдлийн чанар",
])

with tabs[0]:
    render_kpis(meta)
with tabs[1]:
    render_abc_xyz(data)
with tabs[2]:
    render_balance(data)
with tabs[3]:
    render_risk(data)
with tabs[4]:
    render_transfers(data)
with tabs[5]:
    render_purchase(data)
with tabs[6]:
    render_price(data)
with tabs[7]:
    render_ai(data)
with tabs[8]:
    render_quality(data)
