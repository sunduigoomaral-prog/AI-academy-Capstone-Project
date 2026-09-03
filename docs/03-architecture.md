# 03 — Architecture

## 1. Давхаргын зарчим

```
Excel  →  Ingest (Python)  →  PostgreSQL  →  Analytics (pure TS)  →  Services  →  API  →  UI
```

**Гол дүрэм:** бизнесийн тооцоолол React component дотор ХИЙГДЭХГҮЙ.

| Давхарга | Хавтас | Хариуцлага | Хориотой |
|---|---|---|---|
| Ingest | `python/` | Excel унших, нормчлох, валидац, DB рүү ачаалах | Шийдвэр гаргах |
| Analytics | `src/analytics/` | **Цэвэр функц.** ABC, XYZ, stock balance, эрсдэл, зөвлөмжийн дүрэм | DB, fetch, React |
| Services | `src/services/` | DB query + config унших + analytics дуудах + үр дүн бичих | JSX |
| API | `src/app/api/` | HTTP contract, валидац, auth. **Нимгэн controller** | Тооцоолол |
| UI | `src/app/`, `src/components/` | Харуулах, шүүх, экспортлох | Тооцоолол |
| Config | `src/config/` | DB-ээс тохиргоо унших, валидацлах | Hardcode |
| Lib | `src/lib/` | Prisma client, period логик, Excel export, logger | Домэйн дүрэм |

`src/analytics/` нь DB-гүйгээр unit-тест хийгддэг байх ёстой — энэ нь тооцоолол зөв гэдгийг батлах хамгийн хямд арга.

---

## 2. Folder architecture

```
Capstone.v/
├─ docs/                          # Inspection, mapping, architecture, summary
│  ├─ 01-excel-inspection.md
│  ├─ 02-data-mapping.md
│  ├─ 03-architecture.md
│  └─ 04-phase1-summary.md
│
├─ prisma/
│  ├─ schema.prisma               # ✅ Phase 1
│  ├─ seed.ts                     # ✅ ЗӨВХӨН config seed (fake data байхгүй)
│  └─ migrations/                 # Phase 2
│
├─ python/
│  ├─ inspect_excel.py            # ✅ Давтан ажиллуулж болох inspector
│  ├─ mapping/
│  │  └─ column_map.py            # ✅ Excel багана → normalized нэр
│  └─ ingest/                     # Phase 2: extract → validate → load
│
├─ src/
│  ├─ app/                        # Next.js App Router
│  │  ├─ (dashboard)/             # Phase 3 UI
│  │  └─ api/                     # Route handlers (нимгэн)
│  │     ├─ analysis/
│  │     ├─ config/
│  │     ├─ import/
│  │     └─ recommendations/
│  │
│  ├─ analytics/                  # ⭐ ЦЭВЭР ТООЦООЛОЛ (DB-гүй)
│  │  ├─ abc/                     #   abc-classifier.ts
│  │  ├─ xyz/                     #   xyz-classifier.ts
│  │  ├─ inventory/               #   stock-balance.ts, days-of-supply.ts
│  │  ├─ risk/                    #   dead-stock.ts, stockout.ts, excess.ts
│  │  ├─ pricing/                 #   purchase-price-control.ts
│  │  └─ recommendation/          #   transfer.ts, purchase.ts, rule-engine.ts
│  │
│  ├─ services/                   # Orchestration (DB + analytics)
│  │  ├─ analysis-run.service.ts
│  │  ├─ import.service.ts
│  │  ├─ product.service.ts
│  │  └─ recommendation.service.ts
│  │
│  ├─ config/
│  │  ├─ analysis-defaults.ts     # ✅ Seed/fallback утга (логикт ашиглахгүй)
│  │  ├─ config-service.ts        # ✅ DB-ээс тохиргоо унших цорын ганц гарц
│  │  └─ source-mapping.ts        # ✅ Excel багануудын бодит нэр
│  │
│  ├─ lib/
│  │  ├─ prisma.ts                # ✅
│  │  ├─ period.ts                # ✅ Calculation month логик
│  │  ├─ excel/                   # Phase 3: ExcelJS export
│  │  └─ ai/                      # Phase 4: LLM adapter
│  │
│  ├─ components/                 # shadcn/ui + Recharts (тооцоолол ҮГҮЙ)
│  ├─ hooks/                      # React data hooks
│  ├─ types/
│  │  └─ domain.ts                # ✅
│  └─ utils/                      # format, number, guard
│
└─ data/source/                   # Эх Excel-ийн байршил (git-д орохгүй)
```

---

## 3. Database architecture

### Хэмжээст (dimensions)

| Entity | Excel эх | Мөр | Тэмдэглэл |
|---|---|---|---|
| `Product` | 3 sheet-ийн union | 236 | **Business key = `product_code`** (String, тэргүүлэх 0-той) |
| `Company` | `ХХК` | 3 | Нэр байхгүй, зөвхөн код |
| `Location` | `Суваг` + `Төрөл` | 10 | 3 warehouse + 7 pharmacy |
| `Supplier` | `ТА харилцагч` | 14 | Зөвхөн Purchase-д |
| `Channel` | — | **0** | ⚠️ Эх файлд channel хэмжээст байхгүй |

### Fact хүснэгтүүд

| Entity | Excel эх | Мөр | Grain |
|---|---|---|---|
| `SalesFact` | `Sales` | 14,300 | Гүйлгээний мөр (surrogate id) |
| `PurchaseFact` | `Purchase` | 557 | Гүйлгээний мөр |
| `StockSnapshot` | `Stock` | 913 | `(product, location, year, month)` — `@@unique` |

Огнооны багана эх өгөгдөлд байхгүй тул бүх fact `year` + `month` + `periodKey` ("YYYY-MM") гэсэн сарын түлхүүртэй. `periodKey` дээр index байгаа нь lookback query-г хурдан болгоно.

### Тохиргооны давхарга

| Entity | Утга |
|---|---|
| `AnalysisConfig` | ABC/XYZ threshold, lookback, calculation month, эрсдэлийн параметр — key/value + `version` |
| `InventoryPolicy` | `locationType × abcClass × xyzClass → targetDays` (2 × 3 × 3 = **18 мөр**) |

Аль аль нь `version` + `isActive`-тэй → тохиргоо өөрчлөгдсөн ч хуучин `AnalysisRun`-ы үр дүн давтагдана.

### Гаралт

| Entity | Утга |
|---|---|
| `AnalysisRun` | Нэг гүйлт: calculation month, lookback, ашигласан саруудын жагсаалт, **config-ийн бүрэн snapshot** |
| `AnalysisResult` | Бүтээгдэхүүн × байршил: ABC, XYZ, daysOfSupply, targetQty, balanceQty, эрсдэл |
| `TransferRecommendation` | Илүүдэлтэй → дутагдалтай байршил |
| `PurchaseRecommendation` | Шилжүүлгээр нөхөгдөхгүй дутагдал |
| `PurchasePriceAlert` | Нэгж үнийн хазайлт |
| `AIRecommendation` | Rule engine эсвэл LLM-ийн зөвлөмж + `evidence` JSON |

### Ажиллагаа

| Entity | Утга |
|---|---|
| `ImportBatch` | Ачаалалт бүрийн бүртгэл, fact мөр бүр `importBatchId`-аар холбогдоно |
| `AuditLog` | Тохиргооны өөрчлөлт, гүйлт, зөвлөмжийн шийдвэр |

### Холбоосын диаграм

```
Company ──< Location ──< SalesFact >── Product
   │           │      ──< PurchaseFact >── Product ──< Supplier
   │           │      ──< StockSnapshot >── Product
   │           └──> Channel (Phase 1-д хоосон)

AnalysisConfig ─┐
InventoryPolicy ┴─> AnalysisRun ──< AnalysisResult
                                ──< TransferRecommendation
                                ──< PurchaseRecommendation
                                ──< PurchasePriceAlert
                                ──< AIRecommendation
```

---

## 4. Calculation Month контракт

`src/lib/period.ts` дотор хэрэгжсэн, бүх тооцоолол үүнийг дагана:

```
lookbackPeriods('2026-06', 6)
  → ['2025-12','2026-01','2026-02','2026-03','2026-04','2026-05']
```

- Calculation month **дунджид ОРОХГҮЙ**.
- Дутуу сарыг чимээгүй 0-оор дүүргэхгүй — `missingPeriods()` буцаана, service тал шийднэ.
- Stock snapshot нь calculation month-ийн snapshot (эх өгөгдөлд `2026-06`).

---

## 5. AI давхарга — LLM-ready

```
AnalysisResult (бодит тоо)
        ↓
  Rule Engine  (Phase 1–2, deterministic, ruleVersion-тай)
        ↓
  AIRecommendation { source: RULE_ENGINE, evidence: {...} }
        ↓
  (Phase 4) LLM adapter — ижил бичлэг, source: LLM | HYBRID
```

- Rule engine болон LLM **ижил хүснэгт рүү** бичнэ → UI өөрчлөгдөхгүй.
- `evidence` талбарт **зөвхөн бодит тооцоолсон тоо** орно. LLM зохиосон тоо оруулах боломжгүй болгохын тулд зөвлөмжийг `AnalysisResult`-ын id-гаар баталгаажуулна.
- `llmModel`, `llmTokensIn/Out` талбарууд зардал хянахад бэлэн.

---

## 6. Хэрэгжүүлэх дараалал (санал)

| Phase | Агуулга | Төлөв |
|---|---|---|
| **1** | Excel inspection, data mapping, Prisma schema, folder + config structure | ✅ **Энэ phase** |
| 2 | Python ingest pipeline (extract → validate → load), migration, бодит өгөгдөл ачаалах | Дараагийн |
| 3 | `src/analytics/` — ABC, XYZ, stock balance + unit test | |
| 4 | Services + API routes + AnalysisRun гүйлт | |
| 5 | UI: dashboard, ABC-XYZ матриц, эрсдэлийн жагсаалт, Excel export | |
| 6 | Rule engine → AIRecommendation | |
| 7 | LLM integration | |

---

## 7. Шийдэх шаардлагатай нээлттэй асуултууд

1. **Борлуулалтын орлого** — өөр эх сурвалжаас авах боломжтой юу? Байхгүй бол gross margin risk хэрэгжихгүй.
2. **`ЭХНТ` борлуулалт дотор эмийн сан руу шилжүүлсэн дотоод хөдөлгөөн орсон уу?** Харилцагчийн багана байхгүй тул салгах боломжгүй — хэрэв орсон бол агуулахын эрэлт давхар тоологдоно.
3. **Company / Location / Supplier-ийн НЭР** — код биш нэрээр харуулах бол лавлах хүснэгт хэрэгтэй.
4. **Түүхэн stock** — одоо зөвхөн 1 сарын snapshot. Нөөцийн эргэц, түүхэн чиг хандлагад олон сарын snapshot хэрэгтэй.
5. **Lead time, MOQ, савлагааны олонлог** — худалдан авалтын санал үнэн зөв гарахад шаардлагатай, одоо байхгүй.
