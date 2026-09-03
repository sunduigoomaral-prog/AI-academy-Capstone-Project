/**
 * Excel эх файлын БОДИТ багануудын нэр → нормчилсон нэр.
 *
 * ⚠️ Энд буй мөр бүр `Data AI.xlsx`-аас шууд уншсан бодит нэр.
 *    Багана нэмэх/өөрчлөх бол ЭХЛЭЭД Excel-ийг дахин inspect хийнэ
 *    (`python/inspect_excel.py`), таамгаар өөрчлөхгүй.
 *
 * TypeScript ба Python ingest хоёр ЭНЭ НЭГ ЭХ СУРВАЛЖИЙГ дагана
 * (Python тал нь `python/mapping/column_map.py`-д толин тусгал).
 */

export const SHEET_NAMES = {
  PURCHASE: 'Purchase',
  SALES: 'Sales',
  STOCK: 'Stock',
} as const;

/** Гурван sheet-д нийтлэг байгаа баганууд */
export const COMMON_COLUMNS = {
  PRODUCT_CODE: 'Дотоод код',
  PRODUCT_NAME: 'Бүтээгдэхүүний нэрс',
  /** ⚠️ Төгсгөлд нь space байгаа — эх файлд яг ийм байна */
  MANUFACTURER: 'Үйлдвэрлэгч ',
  EXCLUSIVITY: 'Ангилал',
  YEAR: 'Он',
  MONTH: 'Сар',
  LOCATION_TYPE: 'Төрөл',
  LOCATION_CODE: 'Суваг',
  COMPANY_CODE: 'ХХК',
} as const;

export const SALES_COLUMNS = {
  ...COMMON_COLUMNS,
  QUANTITY: 'Тоо',
  /** ⚠️ Энэ нь ӨРТӨГ (COGS). Борлуулалтын орлого БИШ. docs/01 §7 үзнэ үү. */
  COGS_AMOUNT: 'Өртөг',
} as const;

export const PURCHASE_COLUMNS = {
  ...COMMON_COLUMNS,
  SUPPLIER_CODE: 'ТА харилцагч',
  QUANTITY: 'Тоо',
  AMOUNT_EX_VAT: 'ТА НӨАТгүй дүн',
} as const;

export const STOCK_COLUMNS = {
  ...COMMON_COLUMNS,
  /** Current stock quantity */
  QUANTITY_ON_HAND: 'Үлдэглэл',
  /** Үлдэгдлийн нийт өртөг */
  STOCK_VALUE: 'Өртөг',
} as const;

/** Excel `Төрөл` → LocationType */
export const LOCATION_TYPE_MAP: Record<string, 'WAREHOUSE' | 'PHARMACY'> = {
  ЭХНТ: 'WAREHOUSE',
  ЭС: 'PHARMACY',
};

/** Excel `Ангилал` → Exclusivity */
export const EXCLUSIVITY_MAP: Record<string, 'EX' | 'NON_EX'> = {
  Ex: 'EX',
  'Non-ex': 'NON_EX',
};

/**
 * Байршлын кодоос төрөл тодорхойлох нөөц дүрэм.
 * Өгөгдөл дээр 100% батлагдсан: 3xxxxx = агуулах, 4xxxxx = эмийн сан.
 * `Төрөл` баганатай зөрчилдвөл ingest алдаа өгнө (чимээгүй засахгүй).
 */
export function locationTypeFromCode(code: string): 'WAREHOUSE' | 'PHARMACY' | null {
  if (code.startsWith('3')) return 'WAREHOUSE';
  if (code.startsWith('4')) return 'PHARMACY';
  return null;
}

/**
 * ⚠️ Product code-ыг ХЭЗЭЭ Ч тоо болгож болохгүй.
 * Эх файлд текстээр, тэргүүлэх 0-той хадгалагдсан ("0100139").
 * Excel/CSV уншихдаа заавал string гэж заана.
 */
export function normalizeProductCode(raw: string | number): string {
  return String(raw).trim();
}

/** Эх багана нэрийн trailing space болон давхар зайг цэвэрлэнэ */
export function normalizeText(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const v = String(raw).replace(/\s+/g, ' ').trim();
  return v.length ? v : null;
}
