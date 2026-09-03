# 04 — Phase 1 Summary

**Огноо:** 2026-09-02
**Эх файл:** `C:\Users\fm2.tp\Downloads\Data AI.xlsx`

---

## A. Үүссэн файлууд

### Баримт бичиг
| Файл | Агуулга |
|---|---|
| `docs/01-excel-inspection.md` | Excel-ийн бүрэн шинжилгээ — sheet, багана, төрөл, чанар |
| `docs/02-data-mapping.md` | `source_column → normalized_column` бүрэн mapping |
| `docs/03-architecture.md` | Давхарга, folder, DB, AI architecture, хэрэгжүүлэх дараалал |
| `docs/04-phase1-summary.md` | Энэ баримт |

### Database
| Файл | Агуулга |
|---|---|
| `prisma/schema.prisma` | 16 model, 10 enum — PostgreSQL |
| `prisma/seed.ts` | ЗӨВХӨН тохиргооны seed (fake business data байхгүй) |

### Config layer
| Файл | Агуулга |
|---|---|
| `src/config/analysis-defaults.ts` | 13 config key + 18 InventoryPolicy мөрийн seed утга |
| `src/config/config-service.ts` | DB-ээс тохиргоо унших **цорын ганц гарц** + валидац |
| `src/config/source-mapping.ts` | Excel багануудын бодит нэр (TS тал) |

### Core lib / types
| Файл | Агуулга |
|---|---|
| `src/lib/period.ts` | Calculation month логик (`lookbackPeriods`, `shiftPeriod`, …) |
| `src/lib/prisma.ts` | Prisma client singleton |
| `src/types/domain.ts` | Домэйн type-ууд (Prisma-аас хамааралгүй) |

### Python
| Файл | Агуулга |
|---|---|
| `python/inspect_excel.py` | Давтан ажиллуулж болох Excel inspector |
| `python/mapping/column_map.py` | Excel багана → нормчилсон нэр (Python тал) |

### Төслийн тохиргоо
`package.json`, `tsconfig.json`, `.env.example`, `.gitignore`, `README.md`

### Folder бүтэц (README-тэй placeholder)
`src/app/`, `src/app/api/`, `src/analytics/`, `src/services/`, `src/components/`,
`src/hooks/`, `src/utils/`, `python/ingest/`, `data/source/`

---

## B. Үүссэн Database schema

### Dimensions (5)
| Model | Excel эх | Хүлээгдэж буй мөр |
|---|---|---|
| `Product` | 3 sheet-ийн union | **236** |
| `Company` | `ХХК` | 3 |
| `Location` | `Суваг` + `Төрөл` | 10 |
| `Supplier` | `ТА харилцагч` | 14 |
| `Channel` | — | **0** ⚠️ |

### Facts (3)
| Model | Excel эх | Мөр | Grain |
|---|---|---|---|
| `SalesFact` | `Sales` | 14,300 | Гүйлгээний мөр |
| `PurchaseFact` | `Purchase` | 557 | Гүйлгээний мөр |
| `StockSnapshot` | `Stock` | 913 | `(product, location, year, month)` unique |

### Config (2)
`AnalysisConfig` (13 мөр), `InventoryPolicy` (18 мөр = 2 × 3 × 3)

### Output (5)
`AnalysisRun`, `AnalysisResult`, `TransferRecommendation`,
`PurchaseRecommendation`, `PurchasePriceAlert`, `AIRecommendation`

### Operations (2)
`ImportBatch`, `AuditLog`

**Business key:** `Product.productCode` — `String @unique`.
⚠️ Заавал `String` — Excel-д тэргүүлэх 0-той текстээр хадгалагдсан (`0100139`).

---

## C. Excel-ийн ямар columns АШИГЛАЖ байгаа

| Excel column | Sheet | → Хаана |
|---|---|---|
| `Дотоод код` | 3 | `Product.productCode` (**business key**) + бүх fact-ийн FK |
| `Бүтээгдэхүүний нэрс` | 3 | `Product.name` |
| `Үйлдвэрлэгч ` | 3 | `Product.manufacturerName` (`.strip()`) |
| `Ангилал` | 3 | `Product.exclusivity` (`Ex`→`EX`, `Non-ex`→`NON_EX`) |
| `Он` | 3 | `*.year` + `periodKey` |
| `Сар` | 3 | `*.month` + `periodKey` |
| `Төрөл` | 3 | `Location.type` (`ЭХНТ`→`WAREHOUSE`, `ЭС`→`PHARMACY`) → InventoryPolicy-ийн түлхүүр |
| `Суваг` | 3 | `Location.code` |
| `ХХК` | 3 | `Company.code` |
| `Тоо` | Sales | `SalesFact.quantity` → XYZ, дундаж эрэлт, daysOfSupply |
| `Өртөг` | Sales | `SalesFact.cogsAmount` → **ABC (COGS-value суурьтай)** |
| `Тоо` | Purchase | `PurchaseFact.quantity` → нэгж үнийн хуваарь |
| `ТА НӨАТгүй дүн` | Purchase | `PurchaseFact.amountExVat` → **purchase unit price** |
| `ТА харилцагч` | Purchase | `Supplier.code` → нийлүүлэгчийн үнийн харьцуулалт |
| `Үлдэглэл` | Stock | `StockSnapshot.quantityOnHand` → **current stock quantity** |
| `Өртөг` | Stock | `StockSnapshot.stockValue` → илүүдэл/дутагдлын мөнгөн дүн |

**16/16 багана бүгд ашиглагдана. Ашиглагдахгүй багана байхгүй.**

### Тодорхойлолт — асуултын хариу

| Асуулт | Хариу |
|---|---|
| Product code column | `Дотоод код` (3 sheet бүгдэд) |
| Date column | **Байхгүй.** Зөвхөн `Он` + `Сар` |
| Quantity column | Sales/Purchase: `Тоо`; Stock: `Үлдэглэл` |
| Sales amount column | ⚠️ **Байхгүй.** `Өртөг` нь COGS |
| Purchase amount / cost | `ТА НӨАТгүй дүн` (НӨАТ-гүй) |
| Current stock quantity | `Үлдэглэл` |
| Purchase unit price | `ТА НӨАТгүй дүн ÷ Тоо` (жигнэсэн дундаж) |
| Sales sheet | `Sales` |
| Purchase sheet | `Purchase` |
| Stock sheet | `Stock` |
| Product master | Тусдаа sheet **байхгүй**, 3 sheet-ээс derive (зөрчил 0) |
| Location data | **Байгаа** — `Суваг` + `Төрөл` |
| Channel data | ⚠️ **Байхгүй** — `Суваг` нь бодит утгаараа байршил |

---

## D. ⚠️ MISSING columns — өгөгдөлд БАЙХГҮЙ зүйлс

| # | Дутуу зүйл | Нөлөө | Одоогийн байдал |
|---|---|---|---|
| 1 | **Борлуулалтын орлого / зарах үнэ** | ❌ **Gross margin risk хэрэгжихгүй** | `SalesFact.netSalesAmount` = `NULL`. `abc.basis = REVENUE` сонговол config-service алдаа шиднэ |
| 2 | **Гүйлгээний огноо** | Өдрийн түвшний шинжилгээ, улирлын нарийн загвар боломжгүй | Сарын түвшин (`Он`+`Сар`). `days_per_month = 30` тохиргоогоор өдөрт хөрвүүлнэ |
| 3 | **Channel хэмжээст** | Channel-аар сегментчлэх боломжгүй | `Channel` хүснэгт хоосон. `Location.type` сегментчилэл гүйцэтгэнэ |
| 4 | **Company / Location / Supplier нэр** | UI дээр зөвхөн код харагдана | `name` талбарууд nullable, лавлах өгөгдөл хүлээгдэж байна |
| 5 | **Байршил хоорондын шилжүүлгийн бүртгэл** | Агуулах → эмийн сангийн бодит хөдөлгөөн харагдахгүй | Purchase зөвхөн `ЭХНТ`-д. Эмийн сангийн нөхөн дүүргэлт `ЭХНТ` борлуулалт дотор нуугдсан байж болзошгүй |
| 6 | **Түүхэн stock (1 сараас олон)** | Нөөцийн эргэц, хандлага тооцох боломжгүй | Зөвхөн `2026-06` snapshot |
| 7 | **Lead time, MOQ, савлагааны олонлог** | Худалдан авалтын тоо хэмжээ бүдүүн ойролцоо | Одоо тооцоонд ороогүй |
| 8 | **Хугацаа дуусах огноо (expiry), lot** | Хугацааны эрсдэл тооцох боломжгүй | Эмийн салбарт чухал — эх өгөгдөлд байхгүй |
| 9 | **Purchase түүх 6 сар** (2026-01…06) | Үнийн baseline богино | Sales 18 сар, Purchase 6 сар — тэгш бус |
| 10 | **Захиалагчийн (customer) мэдээлэл** | Сувгийн шинжилгээ, ABC-г үйлчлүүлэгчээр хийх боломжгүй | Байхгүй |

---

## E. Тооцооллын боломжийн байдал

| Шинжилгээ | Төлөв | Тайлбар |
|---|---|---|
| ABC analysis | ✅ | **COGS-value** суурьтай (орлого биш). `abc.basis`-аар `QUANTITY` болгож болно |
| XYZ analysis | ✅ | 6+ сарын тоо хэмжээний CV. 18 сар бүрэн бэлэн |
| Inventory optimization | ✅ | InventoryPolicy 18 мөр бэлэн |
| Stock balance | ✅ | `Үлдэглэл` vs `targetQty` |
| Inventory risk detection | ✅ | Dead stock (15 SKU кандидат), stockout (27 SKU), илүүдэл |
| Transfer recommendation | ✅ | 10 байршлын хооронд |
| Purchase recommendation | ⚠️ | Боломжтой, гэвч lead time / MOQ байхгүй тул ойролцоо |
| Purchase price control | ✅ | `ТА НӨАТгүй дүн ÷ Тоо`, 6 сарын түүх |
| **Gross margin risk** | ❌ | **Зарах үнэ байхгүй** |
| AI management recommendation | ✅ | Rule-based, бодит `evidence`-тэй |

---

## F. Дараагийн phase-д хийх зүйлс (эхлүүлээгүй)

1. `.env` үүсгэж `DATABASE_URL` тохируулах
2. `npm install` → `npx prisma migrate dev` → `npx prisma db seed`
3. `python/ingest/` — extract → validate → load pipeline бичих
4. Бодит 15,770 мөрийг DB рүү ачаалах, `ImportBatch`-аар бүртгэх
5. Ачаалалтын дараа тоо баталгаажуулах (236 бүтээгдэхүүн, 10 байршил, 14 нийлүүлэгч)

> ⚠️ Дээрх ажлууд **эхлээгүй** — Phase 2-ын зөвшөөрөл хүлээж байна.
