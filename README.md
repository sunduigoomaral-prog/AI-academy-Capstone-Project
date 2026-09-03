# Inventory Intelligence & Decision Support System

Эм ханган нийлүүлэлтийн байгууллагад зориулсан нөөцийн шинжилгээ, шийдвэр дэмжих систем.

**Одоогийн төлөв: Phase 1–6 дууссан.**

| Phase | Агуулга |
|---|---|
| 1 | Excel inspection · data mapping · architecture · Prisma schema |
| 2 | Excel upload · validation · data quality (15,770 мөр) |
| 3 | ABC–XYZ engine (236 SKU, 9 ангилал) |
| 4 | Нөөцийн оновчлол · шилжүүлэг · худалдан авалтын шийдвэр (1,277 байрлал) |
| 5 | Үнийн хяналт · маржины эрсдэл · AI шийдвэрийн engine |
| 6 | Enterprise dashboard · product filter · Excel export (17 sheet) |

✅ **Систем бүрэн ажиллаж байна.** Node.js v24.20.0 + PostgreSQL 17.6 (portable)
суулгаж, Excel upload → validation → DB insert → ABC-XYZ → нөөцийн оновчлол →
үнийн хяналт → AI зөвлөмж → dashboard → Excel export гинжин хэлхээг end-to-end
ажиллуулж баталгаажуулсан. `tsc --noEmit` 0 алдаа.

**URL:**
- Next.js dashboard — http://localhost:3000/dashboard
- Streamlit (deployment) — http://localhost:8501

---

## Streamlit deployment — 3 файл

Байршуулалтын шаардлагын дагуу үндсэн 3 файл root-д байна:

| # | Файл | Агуулга |
|---|---|---|
| 1 | [requirements.txt](requirements.txt) | `streamlit` · `pandas` · `openpyxl` |
| 2 | [Procfile](Procfile) | `web: streamlit run app.py --server.port 8501 --server.address 0.0.0.0` |
| 3 | [app.py](app.py) | Streamlit UI — 9 таб |

**Container Port: `8501`**

⚠️ `--server.address 0.0.0.0` байхгүй бол container гаднаас нээгдэхгүй.

### app.py-ийн зарчим

`app.py` дотор **бизнес тооцоолол хийгдэхгүй**. Бүх тоо `python/` доторх
шалгагдсан engine-үүдээс (`export.collect.collect`) бэлнээр ирнэ — Next.js
application-тай ЯГ ИЖИЛ логик, ижил тохиргоо (`src/config/*.json`).

```
app.py  →  export.collect.collect(excel, scope)
              ├── ingest.pipeline      (өгөгдлийн чанар)
              ├── analysis.engine      (ABC–XYZ)
              ├── inventory.engine     (тэнцвэр · шилжүүлэг · худалдан авалт)
              ├── pricing.engine       (үнийн жишилт · маржины эрсдэл)
              └── inventory.engine     (AI дүрмийн зөвлөмж)
```

Excel файл нь **sheet-ийн нэрээр биш, бүтцээр нь** танигдана
(`dataset-signatures.json`), тул sheet-ийн нэр өөр байсан ч ажиллана.

### Таб

| Таб | Агуулга |
|---|---|
| Хяналтын самбар | 12 KPI (ашгийн үзүүлэлт нь **N/A** — эх өгөгдөлд орлого байхгүй) |
| ABC–XYZ | ABC · XYZ хуваарилалт + 9 хослолын матриц |
| Нөөцийн тэнцвэр | 6 төлөв + байрлал тус бүрийн шийдвэр |
| Эрсдэл | CRITICAL / HIGH ач холбогдолтой SKU |
| Шилжүүлэг | Давуу эрхийн шатлалаар (компани доторх → компани хооронд) |
| Худалдан авалт | Шилжүүлгээр хаагдаагүй дутагдал |
| Үнийн хяналт | Нийлүүлэгч хоорондын үнийн зөрүү · боломжит хэмнэлт |
| AI зөвлөмж | Дүрэмд суурилсан шийдвэр (ач холбогдлоор шүүнэ) |
| Өгөгдлийн чанар | VALID / WARNING / ERROR + хөдөлгөөнгүй нөөц |

Дээд талд **Excel тайлан татах (17 sheet)** товч байна.

### Локал ажиллуулах

```bash
pip install -r requirements.txt
streamlit run app.py --server.port 8501 --server.address 0.0.0.0
```

⚠️ Streamlit хувилбар нь **PostgreSQL шаардахгүй** — Excel-ээс шууд тооцоолно.
Next.js хувилбар нь DB ашиглаж, upload түүх болон тооцооллын гүйлтийг хадгална.

---

## Баримт бичиг

| Файл | Агуулга |
|---|---|
| [docs/01-excel-inspection.md](docs/01-excel-inspection.md) | Эх Excel-ийн бүрэн шинжилгээ |
| [docs/02-data-mapping.md](docs/02-data-mapping.md) | `source_column → normalized_column` |
| [docs/03-architecture.md](docs/03-architecture.md) | Давхарга, folder, DB, AI architecture |
| [docs/04-phase1-summary.md](docs/04-phase1-summary.md) | Phase 1 дүгнэлт + дутуу өгөгдлийн жагсаалт |
| [docs/05-phase2-summary.md](docs/05-phase2-summary.md) | Excel upload · validation · чанарын хяналт |
| [docs/06-phase3-summary.md](docs/06-phase3-summary.md) | ABC–XYZ engine + verification |
| [docs/07-phase4-summary.md](docs/07-phase4-summary.md) | Нөөцийн оновчлол · шилжүүлэг · худалдан авалт |
| [docs/08-phase5-summary.md](docs/08-phase5-summary.md) | Үнийн хяналт · маржины эрсдэл · AI engine |
| [docs/09-phase6-summary.md](docs/09-phase6-summary.md) | **Dashboard · Excel export · БҮРЭН CHECKLIST** |

---

## Хамгийн чухал 3 баримт

1. **`Дотоод код` бол `String`** — Excel-д тэргүүлэх 0-той текстээр хадгалагдсан
   (`0100139`). Тоо болговол business key эвдэрнэ.
2. **`Өртөг` бол ӨРТӨГ (COGS), борлуулалтын орлого БИШ.** Нэгж утга нь худалдан
   авалтын нэгж үнэтэй median харьцаа 1.00. Тиймээс **gross margin энэ өгөгдлөөр
   тооцох боломжгүй**, ABC нь COGS-value суурьтай.
3. **Огнооны багана байхгүй** — зөвхөн `Он` + `Сар`. Бүх тооцоолол сарын түвшинд.

---

## Tech stack

Next.js 15 · React 19 · TypeScript · Tailwind · shadcn/ui · Recharts · Lucide
PostgreSQL · Prisma · Python (pandas/numpy) · ExcelJS

---

## Архитектурын гол дүрэм

```
Excel → Ingest (Python) → PostgreSQL → analytics (цэвэр TS) → services → API → UI
```

- **Бизнесийн тооцоолол React component дотор ХИЙХГҮЙ.**
- **Threshold, target days кодод hardcode ХИЙХГҮЙ** — `analysis_config` /
  `inventory_policy` хүснэгтээс `src/config/config-service.ts`-ээр уншина.
- **Fake data үүсгэхгүй.** `prisma/seed.ts` зөвхөн тохиргоо seed хийнэ.

---

## Эхлүүлэх

### Web application (Node.js + PostgreSQL шаардлагатай)

```bash
cp .env.example .env          # DATABASE_URL-аа тохируулна
npm install
npx prisma migrate dev
npx prisma db seed            # config + inventory policy
npm run typecheck
npm run dev                   # http://localhost:3000/dashboard
```

### Python давхарга (одоо шууд ажиллана)

```bash
set PYTHONIOENCODING=utf-8

# Бүх тест
python python/tests/test_rules.py
python python/tests/test_abc_xyz.py
python python/tests/test_inventory.py
python python/tests/test_pricing.py
python python/tests/test_end_to_end.py "C:/Users/fm2.tp/Downloads/Data AI.xlsx"

# Тооцоолол
python python/run_ingest.py        "<Excel>"    # чанарын тайлан
python python/run_abc_xyz.py       "<Excel>"    # ABC–XYZ
python python/run_inventory.py     "<Excel>"    # нөөцийн оновчлол
python python/run_price_control.py "<Excel>"    # үнэ + AI
python python/run_export.py        "<Excel>" -o report.xlsx   # 17-sheet Excel
```

---

## Calculation Month

Системийн global тохиргоо (`analysis.calculation_month`, одоо `2026-06`).

```
Calculation Month = 2026-06
  → хамгийн сүүлд ашиглах борлуулалтын сар = 2026-05
  → lookback 6 бүтэн сар = 2025-12 … 2026-05
  → Calculation month ӨӨРӨӨ дундажид ОРОХГҮЙ
```

Хэрэгжилт: [src/lib/period.ts](src/lib/period.ts)
