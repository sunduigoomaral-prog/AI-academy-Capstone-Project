# 06 — Phase 3 Summary

**ABC–XYZ Analysis Engine**
**Огноо:** 2026-09-02

---

## A. ⚠️ Эхлээд: "Sales Value" гэдгийг юугаар төлөөлүүлсэн

Шаардлага: *"ABC analysis нь SALES VALUE дээр үндэслэнэ. Quantity дээр ABC хийхгүй."*

Эх өгөгдөлд **борлуулалтын орлого БАЙХГҮЙ** (docs/01 §7-д тоогоор батлагдсан:
`Sales.Өртөг`-ийн нэгж утга нь худалдан авалтын нэгж үнэтэй median харьцаа **1.00**).
Тиймээс:

| | |
|---|---|
| ABC-ийн суурь | `Sales.Өртөг` = **COGS-value** — цорын ганц боломжит мөнгөн үзүүлэлт |
| Шаардлага хангасан эсэх | ✅ **Мөнгөн дүнгээр**, тоо хэмжээгээр БИШ |
| Тохиргоо | `abc.basis = COGS_VALUE` |
| Орлого ирвэл | `abc.basis = REVENUE` болгоход **engine огт өөрчлөгдөхгүй** |

`AbcBasis` enum-аас `QUANTITY` сонголтыг **зориудаар хассан** — ABC-г тоо хэмжээгээр
хийхийг код түвшинд боломжгүй болгосон. `REVENUE` сонговол config-service тодорхой
алдаа шиднэ (орлогын багана бүхэлдээ NULL гэдгийг тайлбарлана).

---

## B. Алгоритм

### ABC — мөнгөн дүнгээр

```
1. SKU бүрийн lookback хугацааны нийт salesValue
2. Ихээс бага руу эрэмбэлэх (тэнцвэл product_code-оор — үр дүн давтагдана)
3. salesShare      = salesValue / Σ salesValue
4. cumulativeShare = running cumulative (тухайн SKU-г ОРУУЛААД)
5. A: cumulative <= 0.70
   B: 0.70 < cumulative <= 0.90
   C: cumulative > 0.90
```

### XYZ — тоо хэмжээгээр

```
1. Сар бүрийн тоо хэмжээ (борлуулалтгүй сар = 0)
2. average = Σ monthlyQty / САРЫН ТОО     ⚠️ борлуулалттай сарын тоо БИШ
3. stdDev  = POPULATION standard deviation (STDEV.P)
4. CV      = stdDev / |average|
5. X: CV <= 0.25 · Y: 0.25 < CV <= 0.50 · Z: CV > 0.50

Тусгай: average = 0 → CV = NULL, XYZ = Z, inventoryStatus = NO_MOVEMENT (Хөдөлгөөнгүй)
```

`STDEV.P` (n-д хуваана) ашигласан — `STDEV.S` (n−1) БИШ. Ялгаа нь бодит өгөгдөл
дээр мэдэгдэхүйц: SKU `0100248` дээр STDEV.P = **663.93**, STDEV.S = **727.30**.

### Хязгаарын шийдвэрүүд

| Тохиолдол | Шийдэл | Учир |
|---|---|---|
| Нийт дүн = 0 | Бүх SKU → **C** | Тэглэвэл cumulative 0 болж бүгд A болох утгагүй үр дүн гарна |
| SKU-гийн дүн сөрөг (буцаалт давсан) | Эрэмбийн сүүлд → C | Байгалийн жамаар C болно |
| average < 0 | CV = stdDev / **\|average\|** | CV эерэг хэвээр байлгана |
| Дүн тэнцүү | `product_code`-оор эрэмбэлнэ | Үр дүн ҮРГЭЛЖ давтагдана |
| `monthlyQty` урт зөрөх | **Алдаа шиднэ** | Чимээгүй буруу дундаж гаргахгүй |

---

## C. SKU-гийн хамрах хүрээ

```
universe = lookback-д борлуулалттай SKU  ∪  calculation month-д ҮЛДЭГДЭЛТЭЙ SKU
```

Хоёр дахь хэсэг чухал: борлуулалтгүй атлаа үлдэгдэлтэй SKU-г хасвал
**"Хөдөлгөөнгүй" ангилал огт харагдахгүй** болно. Эх өгөгдөл дээр ийм **22 SKU** байна.

---

## D. Гаралт

`abc_xyz_result` хүснэгт, grain = (analysisRun, product):

| Талбар | Тайлбар |
|---|---|
| `productCode`, `productName` | SKU таних |
| `abcClass`, `xyzClass`, **`abcXyz`** | ⭐ `abcXyz` нь ҮНДСЭН ангилал |
| `salesValue`, `salesShare`, `cumulativeShare`, `rank` | ABC хэсэг |
| `monthlyQty[]`, `averageMonthlyQty`, `stdDev`, `cv`, `monthsWithSales` | XYZ хэсэг |
| `inventoryStatus` | `ACTIVE` / `NO_MOVEMENT` |

`monthlyQty` нь `AnalysisRun.periodsUsed`-тэй ижил урттай, ижил дараалалтай.
`AnalysisRun`-д ашигласан threshold бүр хадгалагдана → тохиргоо дараа өөрчлөгдсөн ч
хуучин гүйлт тайлбарлагдана.

---

## E. Тест — `python/tests/test_abc_xyz.py` → **43/43 PASS**

| Бүлэг | Шалгасан зүйл |
|---|---|
| Статистик | `STDEV.P([2,4,4,4,5,5,7,9]) = 2` (сурах бичгийн жишээ); тогтмол цуваа → 0 |
| ABC хил | cum = **70.00%** → A · **70.5%** → B · **90.00%** → B · **90.5%** → C |
| ABC тусгай | эрэмбэ, тэнцүү дүнгийн тогтвортой байдал, нийт = 0 → бүгд C, буруу threshold → алдаа |
| XYZ хил | CV = **0.25** → X · **0.30** → Y · **0.50** → Y · > 0.5 → Z |
| Zero sales | XYZ = **Z**, CV = **NULL**, status = **NO_MOVEMENT** ✅ |
| Дундажийн хуваарь | `[60,0,0,0,0,0]` → дундаж = **10** (60/6), 60/1 БИШ |
| Хосолсон | AX · BY · CZ · CZ+NO_MOVEMENT |
| Матриц | 9 нүд, SKU нийлбэр таарна, эзлэх хувийн нийлбэр = 1 |

Тест хилийн утгуудыг **хоёр талаас нь** шалгадаг — 70.00% (A хэвээр) ба 70.5% (B болно).

---

## F. Бодит өгөгдлийн VERIFICATION

`python python/run_abc_xyz.py "Data AI.xlsx"` — бодитоор ажиллуулсан:

```
Calculation month : 2026-06  (дундажид ОРОХГҮЙ)
Сүүлийн бүтэн сар : 2026-05
Lookback          : 2025-12, 2026-01, 2026-02, 2026-03, 2026-04, 2026-05
ABC basis         : COGS_VALUE   ABC: A≤0.70 B≤0.90   XYZ: X≤0.25 Y≤0.50

SKU universe      : 226   (борлуулалттай 204 + зөвхөн үлдэгдэлтэй 22)
Ашигласан мөр     : 5,891
Нийт борлуулалт   : 344,479,246
```

### ABC–XYZ матриц (⭐ үндсэн ангилал)

| | X | Y | Z |
|---|---|---|---|
| **A** | 3 SKU · 10.69% | 7 SKU · 18.43% | **18 SKU · 40.51%** |
| **B** | **0 SKU · 0.00%** | 4 SKU · 2.40% | 33 SKU · 17.90% |
| **C** | 1 SKU · 0.10% | 9 SKU · 1.23% | 151 SKU · 8.76% |

Хөдөлгөөнгүй: **22 SKU**

**Анхаарах хоёр ажиглалт:**
- **AZ нүд хамгийн том** (18 SKU, борлуулалтын 40.5%) — өндөр үнэ цэнэтэй атлаа
  эрэлт нь маш хэлбэлзэлтэй бүлэг. Нөөцийн эрсдэл хамгийн өндөр.
- **BX хоосон** — B ангиллын нэг ч бараа тогтвортой эрэлттэй биш.

### Sample SKU-уудын дэлгэрэнгүй тооцоо

| SKU | Сарын тоо хэмжээ | Дундаж | StdDev | CV | ABC | XYZ | **abc_xyz** |
|---|---|---|---|---|---|---|---|
| `0100248` Карболен | 2690, 3411, 3483, 2334, 4264, 2557 | 3123.17 | 663.93 | 0.2126 | A | X | **AX** |
| `1133826` | — | 8195.00 | 2538.64 | 0.3098 | A | Y | **AY** |
| `0106447` Моксиклав | 33.59, 499.39, 185.7, 88.69, 83.69, 110.76 | 166.97 | 155.39 | 0.9306 | A | Z | **AZ** |
| `0539305` Чихний хөвөн | 93, 65, 67, 67, 61, 73 | 71.00 | 10.46 | 0.1473 | C | X | **CX** |
| `0100687` Каптоприл | 0, 0, 0, 0, 0, 0 | 0.00 | 0.00 | — | C | Z | **CZ** + Хөдөлгөөнгүй |

Гараар шалгах жишээ (`0539305`):
`(93+65+67+67+61+73)/6 = 426/6 = 71.00` · `STDEV.P = 10.4563` ·
`CV = 10.4563/71 = 0.1473 ≤ 0.25 → X` · хуримтлагдсан 97.17% > 90% → **C** → **CX** ✓

---

## G. Бие даасан тулгалт (engine-ээс ХАМААРАЛГҮЙ)

Excel-ээс шууд pandas/numpy-аар дахин тооцож харьцуулав — **бүх тоо цифр цифрээрээ таарсан**:

| Үзүүлэлт | Engine | Бие даасан pandas |
|---|---|---|
| Lookback цонхны мөр | 5,891 | **5,891** ✓ |
| Нийт борлуулалтын дүн | 344,479,246 | **344,479,246** ✓ |
| `0100248` дундаж | 3,123.1667 | **3,123.1667** ✓ |
| `0100248` STDEV.P | 663.9266 | **663.9266** ✓ |
| `0100248` CV | 0.212581 | **0.212581** ✓ |
| `0106447` CV | 0.930622 | **0.930622** ✓ |
| A / B / C (борлуулалттай 204 дотор) | 28 / 37 / 139 | **28 / 37 / 139** ✓ |
| Хөдөлгөөнгүй SKU | 22 | **22** ✓ |
| SKU universe | 226 | **226** ✓ |
| 2026-06 хасагдсан эсэх | тийм | **тийм** ✓ |

Матрицын C мөр 161 = 139 (борлуулалттай C) + 22 (хөдөлгөөнгүй) — зөрүү тайлбарлагдана.

---

## H. Гүйцэтгэл (§11)

- Нэгтгэл **PostgreSQL дээр** `groupBy`-аар: `salesFact.groupBy(productId, periodKey)`.
  14,300 түүхий мөр Node эсвэл браузер руу **хэзээ ч татагдахгүй**.
- UI нь `abc_xyz_result`-аас **БЭЛЭН** утга уншина. `useAbcXyz` hook болон бүх
  component дотор ямар ч арифметик байхгүй.
- Матрицын нэгтгэл ч DB-ийн `groupBy`-аар ирнэ.
- Үр дүн 500-аар багцлан бичигдэнэ.

---

## I. Үүссэн файлууд

### Analytics — ЦЭВЭР ФУНКЦ (DB/React-гүй, тестлэгдэнэ)
`src/analytics/statistics.ts` · `abc/abc-classifier.ts` · `xyz/xyz-classifier.ts` ·
`abc-xyz/abc-xyz-engine.ts`

### Services
`src/services/analysis/sales-aggregation.ts` · `abc-xyz.service.ts`

### API
`src/app/api/analysis/abc-xyz/run/route.ts` (POST) · `src/app/api/analysis/abc-xyz/route.ts` (GET)

### UI (тооцоолол БАЙХГҮЙ)
`src/app/(dashboard)/analysis/page.tsx` · `src/components/analysis/AbcXyzMatrix.tsx` ·
`RunSummaryCard.tsx` · `SkuResultTable.tsx` · `src/hooks/use-abc-xyz.ts`

### Python (толин тусгал + verification)
`python/analysis/config.py` · `engine.py` · `aggregate.py` ·
`python/run_abc_xyz.py` (CLI) · `python/tests/test_abc_xyz.py`

### Config
`src/config/analysis-defaults.json` — **шинэ**: threshold-ууд TS ба Python-ы нэгдсэн эх сурвалж
`src/config/analysis-defaults.ts` — JSON-оос уншдаг болгож өөрчилсөн

### Schema
`AbcXyzResult` model · `AbcXyzClass` / `InventoryStatus` / `SalesScope` enum ·
`AnalysisRun`-д threshold snapshot + `skuCount` ·
`AnalysisResult`-аас давхардсан ABC/XYZ тооцооллын талбарууд хасагдсан

---

## J. ⚠️ Баталгаажаагүй хэсэг

Node.js/PostgreSQL суулгаагүй тул (таны шийдвэрээр) дараах зүйлс ажиллуулагдаагүй:

- `tsc --noEmit` — TypeScript compile
- `prisma migrate` — `AbcXyzResult` хүснэгт үүсгэх
- `/api/analysis/abc-xyz/run` — HTTP давхарга
- React dashboard браузер дээр

**Баталгаажсан:** ABC, XYZ, CV, STDEV.P, хосолсон ангилал, хилийн утгууд, тэг
борлуулалтын дүрэм — бүгд бодит өгөгдөл дээр (43 unit test + бие даасан pandas тулгалт).
TypeScript болон Python хувилбарууд **ижил алгоритм, ижил тохиргооны файл** ашиглана.

**Баталгаажаагүй:** TS compile, Prisma migration, HTTP route, React UI, бодит DB insert.

### Ажиллуулах (Node + PostgreSQL суусны дараа)

```bash
npm install
npx prisma migrate dev --name phase3_abc_xyz
npx prisma db seed
npm run typecheck
npm run dev          # http://localhost:3000/analysis
```

Python талыг одоо шууд ажиллуулж болно:

```bash
set PYTHONIOENCODING=utf-8
python python/tests/test_abc_xyz.py
python python/run_abc_xyz.py "C:/Users/fm2.tp/Downloads/Data AI.xlsx" --sku 0100248
```
