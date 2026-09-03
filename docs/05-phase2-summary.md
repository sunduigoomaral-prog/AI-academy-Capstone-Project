# 05 — Phase 2 Summary

**Excel Upload + Data Processing + Data Quality**
**Огноо:** 2026-09-02

---

## A. Урсгал

```
Excel файл (.xlsx / .xls)
   │
   ├─ POST /api/import/upload
   │     ├─ эх файлыг ДИСК дээр хадгална (SHA-256 хавтас, дарж бичихгүй)
   │     ├─ SourceFile бичлэг үүсгэнэ            → stage = UPLOADING
   │     └─ SHEET DETECTION (баганын бүтцээр)    → ImportBatch / sheet
   │
   └─ POST /api/import/[id]/process
         ├─ VALIDATING  лавлах угсрах (Product / Location / Company / Supplier)
         ├─ CLEANING    нормчлол + валидац + dedupe key
         ├─ PROCESSING  лавлах upsert → fact insert (davhardal-аас хамгаалалттай)
         └─ COMPLETED   (эсвэл FAILED)

  GET /api/import/[id]          → төлөв, progress, чанарын дүн  (UI polling)
  GET /api/import/[id]/issues   → алдааны хүснэгт (шүүлтүүр, хуудаслалт)
  GET/PUT /api/config/calculation-month → calculation month + lookback
```

---

## B. Шаардлага бүрийн биелэлт

| # | Шаардлага | Хэрэгжилт |
|---|---|---|
| 1 | Excel Upload page | [src/app/(dashboard)/upload/page.tsx](../src/app/(dashboard)/upload/page.tsx) — drag&drop, `.xlsx`/`.xls`, файлын нэр/хэмжээ/sheet тоо/мөрийн тоо |
| 2 | Sheet detection | [sheet-detector.ts](../src/services/import/sheet-detector.ts) — **sheet нэр шийдэхгүй**, баганын role-оор танина. Тохиргоо: [dataset-signatures.json](../src/config/dataset-signatures.json) |
| 3 | Data validation | [validators.ts](../src/services/import/validators.ts) — **25 дүрэм**, каталог: [validation-rules.json](../src/config/validation-rules.json) |
| 4 | Data quality dashboard | [QualityDashboard.tsx](../src/components/import/QualityDashboard.tsx) + [IssueTable.tsx](../src/components/import/IssueTable.tsx) — VALID/WARNING/ERROR + дүрэм бүрийн задаргаа + мөр бүрийн хүснэгт |
| 5 | Data normalization | [normalizers.ts](../src/services/import/normalizers.ts) — код: trim/uppercase/зай, нэр: trim, огноо: ISO `YYYY-MM`, тоо: numeric |
| 6 | Product key | `product_code` — `Product.productCode @unique`. Sales/Purchase/Stock бүгд `productId` FK-аар холбогдоно |
| 7 | Location / Channel | [master-resolver.ts](../src/services/import/master-resolver.ts) — `ЭХНТ`→`WAREHOUSE`, `ЭС`→`PHARMACY` |
| 8 | Calculation month | [period.ts](../src/lib/period.ts) + [lookback.service.ts](../src/services/analysis/lookback.service.ts) |
| 9 | Lookback + warning | Дутуу сар байвал байгааг ашиглаж **warning** буцаана, чимээгүй 0-оор дүүргэхгүй |
| 10 | Database insert | Prisma. `dedupeKey @unique` + `createMany(skipDuplicates)`; Stock нь `upsert` |
| 11 | Processing status | `ProcessingStage` enum + progress % → [ProcessingStatus.tsx](../src/components/import/ProcessingStatus.tsx) |
| 12 | Эх файл ≠ нормчилсон | Эх файл → диск (`data/uploads/`), нормчилсон → PostgreSQL. Тооцоолол React дотор **байхгүй** |

---

## C. Sheet detection — яаж нэрнээс ангид болгосон

Sheet бүрийн баганууд **role** руу буудаг (`roleAliases`), dataset бүр өөрийн
`requiredRoles` / `disqualifyingRoles`-тэй:

| Dataset | requiredRoles | disqualifyingRoles |
|---|---|---|
| SALES | productCode, quantity, cogsAmount, year, month | amountExVat, quantityOnHand |
| PURCHASE | productCode, quantity, amountExVat, year, month | quantityOnHand |
| STOCK | productCode, quantityOnHand, year, month | amountExVat, quantity |
| PRODUCT | productCode, productName | year, month, quantity, quantityOnHand, amountExVat |
| LOCATION | locationCode, locationType | productCode, year, month |
| CHANNEL | channelCode, channelName | productCode, year, month, quantity |

Батлагдсан үр дүн (тестээр):

- `"Борлуулалт 2026"` → **SALES** ✅
- `"Sheet1"` → **SALES** ✅ (нэр огт хамаарахгүй)
- танихгүй баганатай sheet → **UNKNOWN** (боловсруулагдахгүй, алгасагдана) ✅

⚠️ `PRODUCT` / `LOCATION` / `CHANNEL` signature нь **одоогийн эх файлд байхгүй** —
ирээдүйн master sheet-д зориулж бэлдсэн, энэ файл дээр огт асдаггүй.

---

## D. Валидацийн дүрмүүд (25)

**ERROR** — мөр DB-д ОРОХГҮЙ:
`MISSING_PRODUCT_CODE` · `MISSING_DATE` · `INVALID_DATE` · `MISSING_QUANTITY` ·
`MISSING_SALES_AMOUNT` · `MISSING_PURCHASE_AMOUNT` · `MISSING_STOCK_QUANTITY` ·
`NEGATIVE_STOCK` · `NON_NUMERIC_VALUE` · `DUPLICATE_STOCK_ROW` ·
`UNMATCHED_PRODUCT` · `UNMATCHED_LOCATION` · `MISSING_LOCATION_CODE` ·
`UNKNOWN_LOCATION_TYPE` · `LOCATION_TYPE_CONFLICT` · `COMPANY_LOCATION_CONFLICT`

**WARNING** — мөр ОРНО, тэмдэглэгдэнэ:
`MISSING_PRODUCT_NAME` · `NEGATIVE_QUANTITY` · `ZERO_QUANTITY` ·
`ZERO_QTY_NONZERO_AMOUNT` · `DUPLICATE_TRANSACTION` · `MISSING_COMPANY_CODE` ·
`UNKNOWN_EXCLUSIVITY` · `PRODUCT_ATTRIBUTE_CONFLICT` · `UNMATCHED_CHANNEL`

### Шийдвэрийн үндэслэлүүд

- **Сөрөг тоо ≠ алдаа.** Эх өгөгдөлд 31 буцаалтын мөр байна → `is_return = true`-аар хадгална.
- **Давхардал ≠ автомат устгал.** Sales дээр бүх талбараараа ижил 2,402 мөр байгаа нь
  ижил хэмжээтэй тусдаа нэхэмжлэх байж болно. Тиймээс WARNING, мөр хадгалагдана,
  `occurrenceIndex`-ээр ялгагдана.
- **`UNMATCHED_CHANNEL` алгасагдана.** Эх өгөгдөлд сувгийн лавлах байхгүй тул
  шалгалт ажиллуулахгүй (хуурамч дүн гаргахгүй).
- **"Хоосон" ≠ "буруу".** Утга байгаа атлаа тоо болохгүй бол `MISSING_*` биш
  `NON_NUMERIC_VALUE` гарна.

---

## E. Давхар insert-ээс хамгаалалт

```
dedupeKey = sha256(dataset | бараа | байршил | компани | [нийлүүлэгч] | сар
                   | тоо | дүн | occurrenceIndex)
```

- **Нэг файлыг дахин upload** → ижил түлхүүр → `skipDuplicates` → давхардахгүй ✅
- **Ижил хэмжээтэй тусдаа гүйлгээ** → өөр `occurrenceIndex` → хоёулаа хадгалагдана ✅
- **Stock** → `(productId, locationId, year, month)` unique дээр `upsert` →
  засварласан snapshot дахин upload хийвэл **шинэчлэгдэнэ** ✅

Мөнгөн дүнг hash хийхдээ **`Decimal(20,6)` буюу DB-д хадгалагдах яг тэр
нарийвчлалаар** харьцуулна — хадгалагдахаас цааших float чимээ хиймэл
"өөр мөр" үүсгэхгүй.

---

## F. Бодит өгөгдөл дээрх үр дүн

`python python/run_ingest.py "Data AI.xlsx"` — бодитоор ажиллуулсан:

```
FILE      Data AI.xlsx · 940,711 bytes (0.90 MB) · 3 sheet · 15,770 мөр

DETECTION [0] Purchase → PURCHASE  conf=1.00  557 мөр
          [1] Sales    → SALES     conf=1.00  14,300 мөр
          [2] Stock    → STOCK     conf=1.00  913 мөр

MASTER    Бүтээгдэхүүн 236 · Байршил 10 · Суваг 0 (шалгалт алгасав)

QUALITY   VALID   13,312
          WARNING  2,458
          ERROR        0
          TOTAL   15,770

          DUPLICATE_TRANSACTION    2,402   WARNING
          NEGATIVE_QUANTITY           31   WARNING
          ZERO_QUANTITY               27   WARNING
          ZERO_QTY_NONZERO_AMOUNT     13   WARNING

INSERT    Purchase 557/557 · Sales 14,300/14,300 · Stock 913/913
PERIODS   18 сар: 2025-01 … 2026-06
```

Master тоонууд Phase 1-ийн шинжилгээтэй **яг таарч байна** (236 бүтээгдэхүүн, 10 байршил).

---

## G. Тест

`python python/tests/test_rules.py` → **30/30 PASS**

Бодит файл 0 ERROR өгдөг тул ERROR замууд бодит өгөгдлөөр шалгагдахгүй.
Тест нь цэвэр функцүүдийг санах ойд шалгана (дискэнд юу ч бичихгүй,
бизнесийн хуурамч өгөгдөл үүсгэхгүй):

- 12 ERROR зам · 5 WARNING зам · 1 цэвэр мөр
- 8 нормчлолын дүрэм (тэргүүлэх 0, ISO сар, тоон хөрвүүлэлт)
- 3 sheet detection тохиолдол
- dedupe occurrence index

---

## H. Calculation Month / Lookback

```
calculationMonth = 2026-06
  → lastCompletedMonth = 2026-05
  → lookback 6 = 2025-12, 2026-01, 2026-02, 2026-03, 2026-04, 2026-05
  → 2026-06 дундажид ОРОХГҮЙ
```

Дутуу сар байвал: байгаа бүтэн саруудыг ашиглаж **warning** буцаана.
Мөн өгөгдөлд calculation month-оос хойшхи сар байвал тусад нь мэдэгдэнэ.

---

## I. Үүссэн файлууд (Phase 2)

### Config (хуваалцсан — TS ба Python хоёулаа уншина)
`src/config/dataset-signatures.json` · `src/config/validation-rules.json`

### Services (бизнес логик — React-д БАЙХГҮЙ)
`src/services/import/types.ts` · `sheet-detector.ts` · `normalizers.ts` ·
`validators.ts` · `master-resolver.ts` · `import.service.ts`
`src/services/analysis/lookback.service.ts`

### Lib
`src/lib/excel/read-workbook.ts` (SheetJS — `.xls` дэмжинэ) ·
`src/lib/upload-storage.ts` · `src/lib/utils.ts`

### API
`src/app/api/import/upload/route.ts` · `src/app/api/import/[id]/route.ts` ·
`.../[id]/process/route.ts` · `.../[id]/issues/route.ts` ·
`src/app/api/config/calculation-month/route.ts`

### UI
`src/app/layout.tsx` · `src/app/page.tsx` · `src/app/(dashboard)/upload/page.tsx`
`src/components/import/` — FileDropzone · FileSummaryCard · SheetDetectionTable ·
ProcessingStatus · QualityDashboard · IssueTable · CalculationMonthPanel
`src/components/ui/` — card · button · badge · progress · table
`src/hooks/use-import-job.ts` · `src/utils/format.ts`

### Python
`python/ingest/` — config_loader · detect · normalize · validate · pipeline
`python/run_ingest.py` (CLI) · `python/tests/test_rules.py`

### Schema (нэмэгдсэн)
`SourceFile` · `ValidationIssue` · enum `ProcessingStage` / `DatasetType` /
`RowStatus` / `ValidationSeverity`
`ImportBatch` өргөтгөсөн · fact хүснэгтүүдэд `dedupeKey` / `occurrenceIndex` / `rowStatus`

---

## J. ⚠️ Дуусаагүй зүйл: web application-ийг бодитоор ажиллуулах

**Энэ машин дээр Node.js, npm, PostgreSQL, Docker суулгагдаагүй байна** (Python 3.13 л бий).

Тиймээс дараах алхмууд **ажиллуулагдаагүй**:

- `npm install`
- `npx prisma migrate dev` / `npx prisma db seed`
- `npm run dev` → браузераар upload хийж end-to-end шалгах

**Баталгаажсан зүйл:** detection, нормчлол, валидац, dedupe, чанарын тооцоолол —
бүгд бодит `Data AI.xlsx` дээр Python давхаргаар ажиллаж, тоон үр дүн гарсан
(§F, §G). TypeScript тал нь **ЯГ ИЖИЛ config JSON-ыг** уншиж, ижил дүрмийг
хэрэгжүүлдэг.

**Баталгаажаагүй зүйл:** TypeScript compile, Prisma migration, HTTP route-ууд,
React UI, бодит PostgreSQL insert.

### Ажиллуулах алхам (Node + PostgreSQL суусны дараа)

```bash
cp .env.example .env          # DATABASE_URL тохируулна
npm install
npx prisma generate
npx prisma migrate dev --name phase2_import
npx prisma db seed
npm run typecheck             # TS алдаа шалгах
npm run dev                   # http://localhost:3000/upload
```
