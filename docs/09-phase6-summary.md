# 09 — Phase 6 Summary + БҮРЭН ШААРДЛАГЫН CHECKLIST

**Final Enterprise Dashboard + Product Filter + Excel Export**
**Огноо:** 2026-09-02

---

## A. ⚠️ ЭХЛЭЭД: CRITICAL BUG ИЛЭРЧ, ЗАСАГДСАН

§30-ын end-to-end шалгалт **бодит алдаа илрүүлэв** (Phase 5-ын §6):

| | |
|---|---|
| **Асуудал** | 17 SKU-д **сөрөг "боломжит хэмнэлт"**, 39 ганц нийлүүлэгчтэй SKU-д **хуурамч хэмнэлт** |
| **Шалтгаан** | `minUnitPrice` нь эх сурвалж бүрийн **СҮҮЛИЙН САРЫН** үнэ (§2), харин `totalCost/totalQuantity` нь **ЦОНХНЫ БҮХ САРЫН** нийлбэр байсан — хоёр өөр хугацааны суурийг харьцуулж байв |
| **Засвар** | §6-г нэг ижил суурьтай болгов: `currentCost − currentQuantity × minUnitPrice`, энд `current*` нь §2-ийн `points` (эх сурвалж бүрийн сүүлийн худалдан авалт) |
| **Баталгаа** | Хэмнэлт ҮРГЭЛЖ ≥ 0; ганц эх сурвалжтай үед ЯГ 0 |
| **Тоон нөлөө** | Нийт хэмнэлт **7,884,032 ₮ (буруу) → 4,539,005 ₮ (зөв)** |

TS, Python, Prisma schema, service бүгдэд засварлаж, `currentQuantity` / `currentCost`
талбарыг ил гаргаж аудит хийх боломжтой болгов.

---

## B. §30 END-TO-END ШАЛГАЛТ — БҮРЭН PASS

`python python/tests/test_end_to_end.py` — бодит `Data AI.xlsx` дээр 12 үе шатны
**53 invariant** шалгав:

```
 1. Upload → Validation → Processing   VALID 13,312 · WARNING 2,458 · ERROR 0
 2. ABC     эзлэх нийлбэр = 1 · хуримтлагдсан монотон · A⇔cum≤0.70 · C⇔cum>0.90
 3. XYZ     дундаж = Σ/6 · CV = std/|дундаж| · дундаж=0 ⇔ CV=None ⇔ Z ⇔ NO_MOVEMENT
 4. ABCXYZ  9 нүд · SKU нийлбэр таарна · дүнгийн нийлбэр таарна
 5. Balance бүх томьёо 1,277 мөр бүрт таарна · target 18 хослолоос
 6. Status  нийлбэр = мөрийн тоо · NO_MOVEMENT ⇔ дундаж 0 · OPTIMAL хязгаарт
 7. Transfer ⚠️ гарсан тоо ИЛҮҮДЛЭЭС ХЭТРЭХГҮЙ · бүхэл · эх≠хүлээн авагч
 8. Purchase CEILING(rec − cur − transferIn) · STOP ⇒ 0 · бүхэл
 9. Price   gap = max−min · gap% зөв · ⚠️ бүх нэгж үнэ эерэг · хэмнэлт ≥ 0
10. Margin  ⚠️ орлого байхгүй ⇒ ашиг/маржин None (0 БИШ) + шалтгаан
11. AI      ⚠️ §10 AI нь engine-ийн ТООГ ӨӨРЧЛӨӨГҮЙ · §9 бүх талбар
12. Давхарга хоорондын: Phase 3 ABCXYZ = Phase 4-д ашигласан ангилал
```

**Бүх фазын тест:** `test_rules` 30 · `test_abc_xyz` 43 · `test_inventory` 48 ·
`test_pricing` 60 · `test_end_to_end` 53 — **бүгд PASS**.

---

## C. §25 EXCEL EXPORT — БОДИТООР ҮҮСГЭЖ ШАЛГАСАН

`python python/run_export.py "Data AI.xlsx"` → **610,991 bytes, 17 sheet**:

| # | Sheet | Мөр | # | Sheet | Мөр |
|---|---|---|---|---|---|
| 1 | Dashboard Summary | 45 | 10 | Transfer Recommendation | 309 |
| 2 | SKU Analysis | 230 | 11 | Purchase Recommendation | 1,032 |
| 3 | ABCXYZ Analysis | 13 | 12 | Purchase Price Control | 179 |
| 4 | Inventory Balance | 10 | 13 | Lowest Price TOP 3 | 210 |
| 5 | Recommended Stock | 1,281 | 14 | Highest Price TOP 3 | 210 |
| 6 | Risk SKU | 710 | 15 | Gross Margin Risk | 20 |
| 7 | Excess Inventory | 852 | 16 | AI Recommendation | 1,281 |
| 8 | Stagnant Inventory | 238 | 17 | Data Quality | 8 |
| 9 | Slow Moving | 1,077 | | | |

Форматлалт шалгагдсан: **толгой тод + дүүргэлттэй** · **autofilter** (`A3:O1280`) ·
**freeze panes** (`A4`) · **тоон формат** (`#,##0.0`) · **нөхцөлт форматлалт** ·
**нийлбэрийн мөр** (`=SUM(L4:L1280)`) · **баганын өргөн авто**.

§28 дагаж: `Gross Profit` = **N/A** + шалтгаан, `Зарах үнэ` = **N/A**.

---

## D. §31 БҮРЭН ШААРДЛАГЫН CHECKLIST

Тэмдэглэгээ: **✅ ажиллуулж шалгасан** (HTTP хариу + бодит тоо баталгаажсан) ·
**🔶 хуудас ачаалагдсан (HTTP 200), браузер дээр нүдээр шалгаагүй** ·
**⚠️ өгөгдлийн хязгаарлалттай**

> Бүх хуудас HTTP 200 буцааж, бүх API бодит тоо гаргаж байгааг баталсан.
> Гэхдээ **браузер дээр нүдээр** (layout, өнгө, интерактив) би шалгаагүй —
> түүнийг та http://localhost:3000/dashboard дээр өөрөө үзнэ үү.

### Phase 6 (§1–§31)

| § | Шаардлага | Төлөв | Тайлбар |
|---|---|---|---|
| 1 | Enterprise design, desktop-first 1920/1440/1280 | 🔶 | Sidebar `lg`-ээс, grid `sm/md/xl` breakpoint. PNG reference-ийг үндэс болгосон, хуулбарлаагүй |
| 2 | Global header (лого, нэр, сар, filter, export) | 🔶 | `GlobalHeader.tsx` — 8 элемент бүгд |
| 3 | Product filter: хайлт, multi-select, debounce, server-side | ✅ | `ProductFilter.tsx` + `/api/products/search`, 300ms debounce, 25 мөрөөр |
| 3 | Filter нь бүх хэсэгт үйлчилнэ | ✅ | `DashboardFilterProvider` → бүх API дуудлагад `queryString` |
| 4 | Location type / Location / Channel filter | ✅ ⚠️ | Байршил ✅; **Суваг — эх өгөгдөлд байхгүй**, select нь "N/A"-гаар идэвхгүй |
| 5 | Executive KPI (14 үзүүлэлт) | ✅ ⚠️ | 14/14 бэлэн. **Gross Profit / Gross Margin = N/A** (орлого байхгүй) |
| 6 | ABCXYZ матриц, нүд бүр 6 үзүүлэлт | ✅ | SKU · дүн · тоо · нөөц · зохистой · эрсдэл. A/B/C, X/Y/Z нь зөвхөн жижиг захын нийлбэр |
| 7 | ABCXYZ heatmap + tooltip | ✅ 🔶 | Өнгө нь §26-аар; tooltip-д 8 үзүүлэлт |
| 8 | Нөөцийн тэнцвэр (6 төлөв, count/%/qty/value) | ✅ | Тооцоолол ✅ шалгасан; UI 🟡 |
| 9 | Stock coverage chart + table | ✅ | Байршлын хүснэгтэд `coverage` = одоогийн/зохистой |
| 10 | Risk dashboard + priority | ✅ | Excel sheet 6 ✅ (710 мөр); UI `/inventory?stockStatus=` |
| 11 | Excess inventory table | ✅ | Excel sheet 7 ✅ (852 мөр) |
| 12 | Stagnant inventory | ✅ ⚠️ | 238 мөр ✅. **Last Sales Date / Days Since — өдрийн огноо байхгүй → N/A** |
| 13 | Slow moving (XYZ = Z) | ✅ | Excel sheet 9 ✅ (1,077 мөр) |
| 14 | Transfer dashboard + KPI | ✅ | 305 санал ✅; source surplus / dest shortage / remaining багана бүгд |
| 15 | Purchase dashboard + KPI | ✅ | Excel sheet 11 ✅ (1,032 мөр) |
| 16 | Purchase price control, TOP 3 panel × 2 | ✅ | Sheet 12/13/14 ✅. ⚠️ «Channel» → **нийлүүлэгч** (docs/08 §A) |
| 17 | Gross margin risk table | ✅ ⚠️ | Sheet 15 ✅ (20 мөр). **Sales Price / GP / GM = N/A** — орлого байхгүй |
| 18 | AI зөвлөмж, source metrics-тэй link | ✅ | 1,277 зөвлөмж ✅, `evidence` JSON-д бодит тоо |
| 19 | Автомат хариулт (7 асуулт) | ✅ | `AutoAnswers.tsx` + `getAutoAnswers()`, тус бүр холбоостой |
| 20 | Sales trend (сарын тоо + дүн) | ✅ | Recharts bar chart, 6 сар |
| 21 | Inventory trend (opening/closing/stock days) | ⚠️ | **Боломжгүй** — эх өгөгдөлд 1 сарын snapshot. Шалтгаан ил харуулна |
| 22 | Location × ABCXYZ heatmap | ✅ | `getLocationBalance()` — байршил + heatmap өгөгдөл |
| 23 | Product detail page (20 метрик) | ✅ | `/products/[code]` — бүх метрик + байршил тус бүрээр |
| 24 | Product chart (sales/stock/purchase) | ✅ ⚠️ | Sales + Purchase ✅; **Stock trend боломжгүй** (1 snapshot) |
| 25 | **Excel export — 17 sheet, бүрэн форматтай** | **✅** | **Бодитоор үүсгэж шалгасан** (§C) |
| 26 | Color system | ✅ 🔶 | `color-system.ts` — 6 төлөв + 9 ABCXYZ өнгө; Excel export-д ч ижил |
| 27 | Sidebar navigation | ✅ | 8 бүлэг, 15 холбоос — **dead link 0**, 11/11 хуудас HTTP 200 |
| 28 | **No fake data** | **✅** | Байхгүй утга бүр N/A + «Missing source field» + шалтгаан |
| 29 | Performance (server-side бүгд) | ✅ | Бүх нэгтгэл `groupBy`/`aggregate`. 15,770 мөр 13 сек-т insert; dashboard API шууд хариулна |
| 30 | **Full workflow acceptance** | **✅** | 12 үе шат, 53 invariant — бүрэн PASS (§B) |
| 31 | Quality (strict TS, modular, states) | ✅ | Доор дэлгэрэнгүй |

### §31 чанарын задаргаа

| Шаардлага | Төлөв | Нотолгоо |
|---|---|---|
| TypeScript strict | ✅ | `strict` + `noUncheckedIndexedAccess`. **`tsc --noEmit` → 0 алдаа** |
| Reusable components | ✅ | 5 UI primitive + 20 домэйн component |
| Modular architecture | ✅ | analytics (цэвэр) → services → API → UI давхарга тусгаарлагдсан |
| Scalable | ✅ | Бүх нэгтгэл DB дээр; 500-аар багцлан бичилт |
| Responsive | 🔶 | `sm/md/lg/xl` breakpoint, хүснэгт `overflow-x-auto` (нүдээр шалгаагүй) |
| Accessible | 🔶 | `aria-label`, `role`, `aria-expanded`, `aria-hidden` (screen reader-ээр шалгаагүй) |
| Error handling | ✅ | Бүх API route try/catch + утга учиртай мессеж |
| Loading states | ✅ | Бүх хуудсанд "Ачаалж байна…" |
| Empty states | ✅ | "Өгөгдөл байхгүй" + дараагийн алхмын заавар |
| Validation | ✅ | 25 дүрэм + API түвшний параметр валидац |
| No fake data | ✅ | §28 |

---

## E. ⚠️ ӨГӨГДЛИЙН ХЯЗГААРЛАЛТААС ҮҮДСЭН 5 «N/A»

Эдгээр нь **алдаа биш** — эх өгөгдөлд байхгүй зүйлийг зохиогоогүйн үр дүн (§28):

| # | Юу | Хаана | Яагаад |
|---|---|---|---|
| 1 | **Gross Profit / Gross Margin** | §5 KPI, §17, §23, Excel 1/15 | Борлуулалтын **орлого** байхгүй — `Өртөг` нь COGS (docs/01 §7) |
| 2 | **Last Sales Date / Days Since** | §12, Excel 8 | **Өдрийн огноо** байхгүй — зөвхөн Он+Сар (docs/01 §8) |
| 3 | **Inventory trend (opening/closing)** | §21, §24 | Үлдэгдлийн **1 л сарын snapshot** (2026-06) |
| 4 | **Channel filter** | §4, §16 | Сувгийн хэмжээст байхгүй — «Суваг» нь байршлын код |
| 5 | **Location priority / зай** | Phase 4 §15 | Байршлын эрэмбэ, координат байхгүй |

Тус бүр UI дээр шалтгаантайгаа хамт харагдана. Өгөгдөл ирмэгц **код өөрчлөхгүйгээр**
автоматаар тооцогдоно.

---

## F. Үүссэн файлууд (Phase 6)

**Config:** `color-system.ts` (§26)

**Services:** `dashboard/dashboard.service.ts` (§5–§8, §19–§22) ·
`dashboard/product-detail.service.ts` (§23, §24) · `export/excel-export.service.ts` (§25)

**API (6 шинэ):** `/api/dashboard` · `/api/products/search` · `/api/products/[code]` ·
`/api/filters` · `/api/settings` · `/api/export/excel`

**UI:** `(dashboard)/layout.tsx` · `dashboard/page.tsx` · `products/page.tsx` ·
`products/[code]/page.tsx` · `settings/page.tsx` · `data-quality/page.tsx`
`layout/GlobalHeader.tsx` · `layout/Sidebar.tsx` · `filters/ProductFilter.tsx`
`dashboard/ExecutiveKpis.tsx` · `AbcXyzHeatmap.tsx` · `InventoryBalanceCard.tsx` ·
`AutoAnswers.tsx` · `SalesTrendChart.tsx`
`hooks/use-dashboard-filter.tsx` · `use-dashboard.ts`

**Python:** `export/collect.py` · `export/excel_export.py` · `run_export.py` ·
`tests/test_end_to_end.py`

**Нийт төсөл:** 108 TS/TSX · 31 Python · 5 config JSON · 22 API route · 11 page ·
23 Prisma model · 9 docs

---

## G. ✅ БҮРЭН АЖИЛЛУУЛЖ ШАЛГАСАН

Node.js v24.20.0 + PostgreSQL 17.6 суулгаж, **бүх систем end-to-end ажиллав**:

| Шалгалт | Үр дүн |
|---|---|
| `tsc --noEmit` | **0 алдаа** |
| `prisma migrate` | 23 хүснэгт үүссэн |
| `prisma db seed` | 14 config + 18 policy |
| Excel upload (HTTP) | 3 sheet танигдсан · 15,770 мөр |
| Validation + insert | VALID 13,312 · WARNING 2,458 · ERROR 0 · **15,770 мөр DB-д** (13 сек) |
| ABC–XYZ (HTTP) | 226 SKU · 344,479,246 ₮ · 9 ангилал |
| Нөөцийн оновчлол | 1,277 байрлал · 305 шилжүүлэг · 17,366 ш худалдан авалт |
| Үнийн хяналт | 175 SKU benchmark · 4,539,005 ₮ хэмнэлт |
| AI зөвлөмж | 1,277 · CRITICAL 58 · HIGH 648 |
| Excel export (HTTP) | **17 sheet, 450 KB**, форматлалт бүрэн |
| §13 аудит | MODIFIED 1913 → 1500, AuditLog-д бичигдсэн |
| Бүх хуудас | 11/11 → HTTP 200 |

### DB-д бодитоор орсон мөрүүд

```
product 236 · location 10 · company 3 · supplier 14
sales_fact 14,300 · purchase_fact 557 · stock_snapshot 913
validation_issue 2,473 · abc_xyz_result 226 · analysis_result 1,277
transfer_recommendation 305 · purchase_recommendation 160
purchase_price_benchmark 180 · purchase_price_point 210
ai_recommendation 1,277 · recommendation_review 1 · audit_log 9
```

### ⚠️ Ажиллуулснаар илэрсэн 3 бодит алдаа (бүгд засагдсан)

1. **`prisma/seed.ts`** — Prisma нь compound unique дотор `null` (`locationId`)
   зөвшөөрдөггүй → `findFirst` + `create/update` болгов.
2. **`ai-recommendation.service.ts`** — `select`-д байхгүй `productName` талбар.
   `as const` хувьсагчид excess-property шалгалт хийгддэггүй тул `tsc` барьсангүй →
   `Prisma.AIRecommendationSelect` type тавьж compile-time хамгаалалт нэмэв.
3. **Хилийн float чимээ** — SKU `0107574 @ 300123`: Postgres `15.0000` (Зохистой)
   vs Python float нийлбэр `15.000000000000016` (Удаан эргэлттэй). Хоёр давхаргад
   `EPSILON = 1e-9` хүлцэл нэмж нийцүүлэв. **PostgreSQL Decimal нь илүү нарийвчлалтай.**

### TypeScript ба Python давхаргын нийцэл

Хоёр бие даасан хэрэгжүүлэлт **ижил тоо гаргалаа**:

| | TypeScript + PostgreSQL | Python |
|---|---|---|
| VALID / WARNING / ERROR | 13,312 / 2,458 / 0 | 13,312 / 2,458 / 0 ✓ |
| Нийт борлуулалт | 344,479,246 | 344,479,246 ✓ |
| ABCXYZ матриц (9 нүд) | AX 3 · AZ 18 · CZ 151 … | ижил ✓ |
| Нөөцийн төлөв | OPTIMAL 16 · SLOW_MOVING 20 | ижил ✓ (epsilon засварын дараа) |
| Шилжүүлэг / худалдан авалт | 305 / 17,366 | 305 / 17,366 ✓ |
| Боломжит хэмнэлт | 4,539,005 ₮ | 4,539,005 ₮ ✓ |

### Одоо ажиллаж байгаа орчин

```
Node.js      C:\Users\fm2.tp\tools\node     (v24.20.0, portable, админ эрхгүй)
PostgreSQL   C:\Users\fm2.tp\tools\pgsql    (17.6, portable, service биш)
Өгөгдөл      C:\Users\fm2.tp\tools\pgdata   (порт 5433)
URL          http://localhost:3000/dashboard
```

### Дахин эхлүүлэх

```bash
# 1) PostgreSQL
C:\Users\fm2.tp\tools\pgsql\bin\pg_ctl.exe -D C:\Users\fm2.tp\tools\pgdata -l C:\Users\fm2.tp\tools\pgdata\server.log start

# 2) Next.js
cd "<төслийн зам>"
set PATH=C:\Users\fm2.tp\tools\node;%PATH%
npm run dev
```

```bash
npm install
npx prisma migrate dev --name phase6_dashboard
npx prisma db seed
npm run typecheck        # ← TypeScript алдаа энд илэрнэ
npm run dev              # http://localhost:3000/dashboard
```

Python талыг **одоо шууд** ажиллуулж болно:

```bash
set PYTHONIOENCODING=utf-8
python python/tests/test_end_to_end.py "C:/Users/fm2.tp/Downloads/Data AI.xlsx"
python python/run_export.py "C:/Users/fm2.tp/Downloads/Data AI.xlsx" -o report.xlsx
```

---

## H. Бизнестэй тохирох шаардлагатай (нэгтгэсэн)

1. **Борлуулалтын орлого** — 5 «N/A»-гийн хамгийн чухал нь. Ирвэл §7, §17, §5 бүрэн ажиллана
2. **Cross-company шилжүүлэг** — 6,254 ширхэг худалдан авалтын зөрүү (docs/07 §D)
3. **PROMOTION-ы нөхцөл** — шаардлагад заагаагүй, одоогийн default нь санал
4. **CZ эмийн санд target = 7 = stockout босго** — «Зохистой» хүрэх боломжгүй
5. **Үнэ харьцуулах хэмжээст** — одоо нийлүүлэгч; суваг гэж юуг ойлгохыг тодруулах

---

## K. ⭐ НЭМЭЛТ: ХХК/суваг филтер · зорилтот хоног · шилжүүлгийн шатлал

### K.1 Filter шатлал (§4 өргөтгөл)

Header-т **ХХК** сонголт нэмэгдсэн бөгөөд байршлын жагсаалтыг шүүнэ:

```
ХХК → Байршлын төрөл → Суваг / Байршил
```

| Сонголт | Утга | Эх багана |
|---|---|---|
| ХХК | 200120 · 200123 · 200127 | Excel `ХХК` |
| Байршлын төрөл | Эм ханган нийлүүлэх төв · Эмийн сан | Excel `Төрөл` |
| Суваг / Байршил | 300120 … 400178 | Excel **`Суваг`** |
| Тусдаа суваг | **N/A** | ⚠️ эх өгөгдөлд байхгүй |

⚠️ **Тодруулга:** Excel-ийн `Суваг` багана нь бодит утгаараа **байршлын код**
(300120 = агуулах, 400137 = эмийн сан). Түүнээс тусдаа сувгийн лавлах
(B2B/B2C/тендер гэх мэт) эх өгөгдөлд байхгүй тул тэр сонголт N/A хэвээр.

Шүүлтүүр нь **query string болж server рүү** явна — client талд бүх мөрийг
татаад шүүхгүй (§29).

**Хамрах хүрээ:** KPI · ABCXYZ матриц · Нөөцийн тэнцвэр · Эрсдэл · Татан
авалт · **Шилжүүлэг** · Үнэ · AI · **/inventory жагсаалт ба нэгтгэл** ·
Excel export. Бодитоор шалгасан:

| Шүүлтүүр | Байрлал | Шилжүүлэг | Дутагдал (ш) |
|---|---|---|---|
| (шүүлтгүй) | 1,277 | 346 | 25,134 |
| ХХК 200123 | 412 | 169 | 12,159 |
| ХХК 200123 + агуулах | 174 | 148 | 11,482 |
| Байршил 400176 | 118 | 56 | 77 |

⚠️ **Шилжүүлгийн шүүлтийн онцлог:** шилжүүлэг нь ХОЁР байршилтай тул
`fromLocation` **ЭСВЭЛ** `toLocation` таарвал хамаарна (`transferWhere`).
Зөвхөн нэг талыг шүүвэл тухайн ХХК руу **ИРЖ** буй бараа алга болно.

### K.2 Зорилтот хоног — «Эм ханган нийлүүлэх төв БОЛОН БУСАД»

| ABC–XYZ | Эм ханган нийлүүлэх төв болон бусад | Эмийн сан |
|---|---|---|
| AX | 45 | 30 |
| AY | 40 | 25 |
| AZ | 30 | 15 |
| BX | 40 | 25 |
| BY | 35 | 20 |
| BZ | 25 | 10 |
| CX | 30 | 15 |
| CY | 25 | 10 |
| CZ | 15 | 7 |

Хүснэгт нь `inventory_policy` хүснэгтэд (18 мөр) байна — **hardcode байхгүй**.

⭐ **«болон бусад» гэдгийн утга:** эхний багана нь зөвхөн WAREHOUSE биш,
**PHARMACY биш аливаа байршлын төрөлд** үйлчилнэ. `resolveTargetDays`
(TS) болон `load_policy().resolve` (Python) дотор ижил fallback:

```
exact(locationType, abc, xyz)
  → олдохгүй бөгөөд locationType ≠ PHARMACY бол → WAREHOUSE(abc, xyz)
  → тэр ч олдохгүй бол → АЛДАА шиднэ (чимээгүй default руу УНАХГҮЙ)
```

Одоогийн өгөгдөлд WAREHOUSE / PHARMACY хоёроос өөр төрөл байхгүй тул
тоон үр дүн өөрчлөгдөөгүй; шинэ төрөл нэмэгдэхэд л fallback ажиллана.

### K.3 Шилжүүлгийн давуу эрхийн шатлал

`inventory-status-rules.json` → `transferPreference`. Дутагдлыг **эхний
шатнаас эхлэн** нөхнө; тухайн шатанд илүүдэл хүрэлцэхгүй бол л дараагийн
шат руу шилжинэ.

| # | Шат | companyScope | Бодит үр дүн |
|---|---|---|---|
| 1 | **Компани доторх сувгууд хооронд** | SAME | **1,778 ш** (197 мөр · 22.1%) |
| 2 | Компани хооронд | DIFFERENT | 6,254 ш (149 мөр · 77.9%) |
| | **НИЙТ** | | **8,032 ш** (346 мөр) |

Өөрөөр хэлбэл нэг ХХК-ийн дотоод нөөцийг **бүрэн ашигласны дараа л** өөр
ХХК-аас авахыг санал болгоно. 1-р шат нь агуулах ↔ эмийн сан, эмийн сан ↔
эмийн сан, агуулах ↔ агуулах — нэг хуулийн этгээдийн ямар ч хосыг хамарна.

**Компани доторх — хамгийн том 5**

| SKU | Чиглэл | Тоо |
|---|---|---|
| 1133944 | 400177 → 300120 | 192 ш |
| 1134378 | 400154 → 300123 | 151 ш |
| 1133944 | 400176 → 300120 | 150 ш |
| 1134377 | 400154 → 300123 | 94 ш |
| 0100248 | 400138 → 300127 | 89 ш |

**Компани хооронд — хамгийн том 5**

| SKU | Чиглэл | Тоо |
|---|---|---|
| 1133945 | 300127 → 300120 | 1,826 ш |
| 1133944 | 300127 → 300120 | 1,273 ш |
| 0100248 | 300123 → 300127 | 801 ш |
| 0111442 | 300127 → 300120 | 479 ш |
| 1134036 | 300127 → 300120 | 465 ш |

⚠️ **Өгөгдлөөс илэрсэн зүйл:** ХХК бүр **ЯГ НЭГ агуулахтай**
(`200120→300120`, `200123→300123`, `200127→300127`). Тиймээс компани
доторх шилжүүлэг зайлшгүй **эмийн сан оролцсон** байна, харин агуулах ↔
агуулах хөдөлгөөн нь зайлшгүй **компани хооронд** болно.

⚠️ **Компани хоорондын шилжүүлэг нь бодит байдалд ХУДАЛДАХ гүйлгээ.**
`allowCrossCompany = false` тохируулбал 2-р шат бүхэлдээ алгасагдана:

| | Зөвшөөрсөн (үндсэн) | Хориглосон |
|---|---|---|
| Шилжүүлэг | 8,032 ш (346 мөр) | 1,778 ш (197 мөр) |
| Худалдан авалт | 17,366 ш | **23,620 ш** |

Өөрөөр хэлбэл компани хоорондын шилжүүлгийг хориглох нь **6,254 ш нэмэлт
худалдан авалт** үүсгэнэ — энэ бол хуулийн этгээдийн бие даасан байдлын
өртөг.

**Хадгалалт:** `transfer_recommendation.tierCode` / `tierLabel` баганад
бичигдэж, /inventory-ийн шилжүүлгийн хүснэгт, Excel-ийн 10-р sheet,
Тохиргооны хуудасны «Шилжүүлгийн давуу эрхийн шатлал» карт дээр харагдана.
Гүйлт хийгээгүй үед карт нь тоо зохиохгүй — **N/A** харуулна.

**Тест:** `python/tests/test_inventory.py`
- §8 — компани доторх нь илүүдэл багатай ч эхэлж сонгогдох; хүрэлцвэл
  компани хооронд огт санал болгохгүй; хүрэлцэхгүй бол л 2-р шат руу
  шилжих; `allow_cross_company=False` үед 2-р шат бүхэлдээ алгасагдах.
- §9 — `WAREHOUSE`→45, `PHARMACY`→30, шинэ `DISTRIBUTION_HUB`→«болон
  бусад» 15; тохиргоо олдохгүй бол алдаа шидэх.

### K.4 Баталгаажуулалт

| Шалгалт | Үр дүн |
|---|---|
| `tsc --noEmit` | **0 алдаа** |
| Python тест (5 багц) | **бүгд PASS** |
| TS engine vs Python engine | `SAME_COMPANY 1,778` / `CROSS_COMPANY 6,254` — **ижил** |
| Хуудас (9) | бүгд **HTTP 200** |
| Excel export | 17 sheet, шүүлтүүрийг дагана |
