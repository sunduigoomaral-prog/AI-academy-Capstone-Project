# 02 — DATA MAPPING DOCUMENT

`Data AI.xlsx` → нормчилсон (normalized) загвар.
`source_column` баганууд нь **Excel дэх бодит нэрс** (trailing space хүртэл нь яг хэвээр).

Хөрвүүлэлтийн дүрмүүд (бүх sheet-д нийтлэг):
- `Дотоод код` — **үргэлж `str`**, `int` болгож болохгүй (тэргүүлэх 0).
- `Үйлдвэрлэгч ` — `.strip()` хийнэ (эх нэр нь space-ээр төгсдөг).
- `Он` + `Сар` → `period_key` (`YYYY-MM`), огноо зохиохгүй.
- Мөнгөн дүн бүр **сарын нийлбэр дүн**, нэгж үнэ биш.

---

## Sales

`Sales` sheet → `sales_fact`

| source_column | normalized_column | type | Тэмдэглэл |
|---|---|---|---|
| `Дотоод код` | `product_code` | `String` | Business key → `Product.product_code` |
| `Бүтээгдэхүүний нэрс` | → `Product.name` | `String` | Fact-д давтагдана, master руу шилжинэ |
| `Үйлдвэрлэгч ` | → `Product.manufacturer_name` | `String` | `.strip()` |
| `Ангилал` | → `Product.exclusivity` | `enum EX / NON_EX` | `Ex` → `EX`, `Non-ex` → `NON_EX` |
| `Тоо` | `quantity` | `Decimal(18,4)` | Сөрөг = буцаалт → `is_return = true` |
| `Өртөг` | **`cogs_amount`** | `Decimal(20,6)` | ⚠️ **Орлого биш, өртөг.** `sales_amount` НЭР ӨГӨХГҮЙ |
| — | `net_sales_amount` | `Decimal(20,6)?` | **MISSING** — Excel-д зарах үнэ байхгүй → `NULL` |
| `Он` | `year` | `Int` | |
| `Сар` | `month` | `Int` | |
| `Он`+`Сар` | `period_key` | `String` | `2026-05` |
| `Төрөл` | → `Location.type` | `enum WAREHOUSE / PHARMACY` | `ЭХНТ` → `WAREHOUSE`, `ЭС` → `PHARMACY` |
| `Суваг` | `location_code` | `String` | → `Location.code` |
| `ХХК` | `company_code` | `String` | → `Company.code` |
| — | `id` | `String @id` | Surrogate (Excel-д transaction id байхгүй) |
| — | `source_row_no` | `Int` | Excel мөрийн дугаар, traceability |

**Derived:** `unit_cogs = cogs_amount / quantity` (`quantity = 0` үед `NULL`).

---

## Purchase

`Purchase` sheet → `purchase_fact`

| source_column | normalized_column | type | Тэмдэглэл |
|---|---|---|---|
| `Дотоод код` | `product_code` | `String` | |
| `Бүтээгдэхүүний нэрс` | → `Product.name` | `String` | |
| `Үйлдвэрлэгч ` | → `Product.manufacturer_name` | `String` | `.strip()` |
| `Ангилал` | → `Product.exclusivity` | `enum` | |
| `ТА харилцагч` | `supplier_code` | `String` | → `Supplier.code` (14 нийлүүлэгч) |
| `Тоо` | `quantity` | `Decimal(18,4)` | Сөрөг = буцаалт |
| `ТА НӨАТгүй дүн` | **`amount_ex_vat`** | `Decimal(20,6)` | НӨАТ-гүй худалдан авалтын дүн |
| `Он` | `year` | `Int` | |
| `Сар` | `month` | `Int` | |
| `Он`+`Сар` | `period_key` | `String` | |
| `Төрөл` | → `Location.type` | `enum` | Зөвхөн `ЭХНТ` |
| `Суваг` | `location_code` | `String` | Зөвхөн `3xxxxx` |
| `ХХК` | `company_code` | `String` | |
| — | `id`, `source_row_no` | | Surrogate + traceability |

**Purchase unit price томьёо (16-р асуултын хариу):**

```
purchase_unit_price = ТА НӨАТгүй дүн / Тоо      -- мөрийн түвшинд
```

Нэгтгэсэн (weighted average, зөвлөж буй хувилбар):

```
purchase_unit_price(product, period) = Σ(ТА НӨАТгүй дүн) / Σ(Тоо)
```

Дүрмүүд:
- `Тоо = 0` → `NULL` (Excel-д 2 мөр ийм байна).
- Буцаалтын мөрүүд (`Тоо < 0`) weighted average-д **орно** (цэвэр өртгийг зөв тусгана).
- Excel-д **нэгж үнийн багана байхгүй** — үргэлж тооцоолж гаргана.

---

## Stock

`Stock` sheet → `stock_snapshot`

| source_column | normalized_column | type | Тэмдэглэл |
|---|---|---|---|
| `Дотоод код` | `product_code` | `String` | |
| `Бүтээгдэхүүний нэрс` | → `Product.name` | `String` | |
| `Үйлдвэрлэгч ` | → `Product.manufacturer_name` | `String` | `.strip()` |
| `Ангилал` | → `Product.exclusivity` | `enum` | |
| `Үлдэглэл` | **`quantity_on_hand`** | `Decimal(18,4)` | **Current stock quantity** |
| `Өртөг` | **`stock_value`** | `Decimal(20,6)` | Нийт өртөг, нэгж бус |
| `Он` | `year` | `Int` | 2026 |
| `Сар` | `month` | `Int` | 6 |
| `Он`+`Сар` | `period_key` | `String` | `2026-06` |
| `Төрөл` | → `Location.type` | `enum` | |
| `Суваг` | `location_code` | `String` | |
| `ХХК` | `company_code` | `String` | |

**Derived:** `unit_stock_cost = stock_value / quantity_on_hand`.
**Natural key:** `(product_code, location_code, year, month)` — өгөгдөлд 0 давхардалтай, тиймээс `@@unique`.

---

## Product (derive хийсэн master)

3 sheet-ийн union-оос гарна (зөрчилгүй нь §6-д батлагдсан). Нийт **236 бүтээгдэхүүн**.

| source_column | normalized_column | type |
|---|---|---|
| `Дотоод код` | `product_code` **(business key, `@unique`)** | `String` |
| `Бүтээгдэхүүний нэрс` | `name` | `String` |
| `Үйлдвэрлэгч ` | `manufacturer_name` | `String` |
| `Ангилал` | `exclusivity` | `enum EX / NON_EX` |

---

## Company (`ХХК`)

| source_column | normalized_column | Утгууд |
|---|---|---|
| `ХХК` | `code` **(`@unique`)** | `200120`, `200123`, `200127` |
| — | `name` | **MISSING** — Excel-д зөвхөн код |

---

## Location (`Суваг` + `Төрөл`)

| source_column | normalized_column | Тэмдэглэл |
|---|---|---|
| `Суваг` | `code` **(`@unique`)** | 10 байршил |
| `Төрөл` | `type` | `ЭХНТ` → `WAREHOUSE`, `ЭС` → `PHARMACY` |
| `ХХК` | `company_code` → `company_id` | Хатуу 1:N |
| — | `name` | **MISSING** — Excel-д зөвхөн код |

Батлагдсан mapping:

| location_code | type | company_code |
|---|---|---|
| `300120` | WAREHOUSE | `200120` |
| `300123` | WAREHOUSE | `200123` |
| `300127` | WAREHOUSE | `200127` |
| `400176`, `400177`, `400178` | PHARMACY | `200120` |
| `400153`, `400154` | PHARMACY | `200123` |
| `400137`, `400138` | PHARMACY | `200127` |

---

## Supplier (`ТА харилцагч`)

| source_column | normalized_column | Тэмдэглэл |
|---|---|---|
| `ТА харилцагч` | `code` **(`@unique`)** | 14 нийлүүлэгч, зөвхөн Purchase-д |
| — | `name` | **MISSING** — зөвхөн код |

---

## Channel

⚠️ **Excel-д бие даасан channel хэмжээст БАЙХГҮЙ.**

`Суваг` нь "channel" гэж орчуулагддаг ч өгөгдөл дээр **байршлын код** (агуулах / эмийн сан) байна. Тиймээс:

- `Channel` хүснэгт schema-д **байна** (ирээдүйн өргөтгөлд), гэхдээ **энэ файлаас populate хийхгүй**.
- Сегментчилэлийн үүргийг Phase 1-д `Location.type` (`WAREHOUSE` / `PHARMACY`) гүйцэтгэнэ — энэ нь inventory policy-ийн Warehouse / Pharmacy target days-тэй яг тохирч байна.
- Бодит channel өгөгдөл (жишээ нь: B2B / B2C / тендер / онлайн) ирвэл `Location.channel_id` бөглөгдөнө.

---

## Нэгтгэсэн normalized нэрсийн толь

| Ойлголт | Normalized нэр | Эх багана |
|---|---|---|
| Product code | `product_code` | `Дотоод код` |
| Period | `year`, `month`, `period_key` | `Он`, `Сар` |
| Sales quantity | `quantity` (`sales_fact`) | `Тоо` |
| Sales cost | `cogs_amount` | `Өртөг` (Sales) |
| **Sales revenue** | `net_sales_amount` | **MISSING** |
| Purchase quantity | `quantity` (`purchase_fact`) | `Тоо` |
| Purchase amount | `amount_ex_vat` | `ТА НӨАТгүй дүн` |
| Purchase unit price | `unit_price` (derived) | `ТА НӨАТгүй дүн / Тоо` |
| Current stock qty | `quantity_on_hand` | `Үлдэглэл` |
| Stock value | `stock_value` | `Өртөг` (Stock) |
| Location | `location_code` | `Суваг` |
| Location type | `location_type` | `Төрөл` |
| Company | `company_code` | `ХХК` |
| Supplier | `supplier_code` | `ТА харилцагч` |
| Exclusivity | `exclusivity` | `Ангилал` |
