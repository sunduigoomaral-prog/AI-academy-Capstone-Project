/**
 * Data normalization — ЦЭВЭР ФУНКЦҮҮД (DB, React ашиглахгүй).
 *
 * ⚠️ Эх Excel файлыг ӨӨРЧЛӨХГҮЙ. Зөвхөн санах ойн хуулбарыг нормчилно.
 *
 * Дүрэм:
 *   product code   → trim + доторх зай арилгах + ТОМ ҮСЭГ.
 *                    Тэргүүлэх 0 ХЭВЭЭР ("0100139"), тоо болгохгүй.
 *   product name   → trim + доторх зай нэгтгэх
 *   date           → ISO 8601 сарын хэлбэр "YYYY-MM".
 *                    Эх өгөгдөлд ӨДӨР байхгүй тул өдөр ЗОХИОХГҮЙ.
 *   quantity/amount → тоон утга; хөрвөхгүй бол null (таамгаар 0 болгохгүй)
 */

import { createHash } from 'node:crypto';

import signatures from '../../config/dataset-signatures.json';
import type { DatasetType, NormalizedRow } from './types';

const LOCATION_TYPE_MAP = signatures.valueMaps.locationType as Record<
  string,
  'WAREHOUSE' | 'PHARMACY'
>;
const EXCLUSIVITY_MAP = signatures.valueMaps.exclusivity as Record<string, 'EX' | 'NON_EX'>;
const PREFIX_RULE = signatures.locationCodePrefixRule.prefixes as Record<
  string,
  'WAREHOUSE' | 'PHARMACY'
>;

export function normText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isNaN(value)) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length ? text : null;
}

/**
 * ⚠️ Тоо болгож хөрвүүлэхгүй — '0100139' нь '100139' болох ёсгүй.
 * Excel-ээс '100139.0' хэлбэрээр ирсэн тохиолдолд бутархай тэгийг цэвэрлэнэ.
 */
export function normProductCode(value: unknown): string | null {
  const text = normText(value);
  if (text === null) return null;
  let cleaned = text.replace(/\s/g, '');
  if (/^\d+\.0+$/.test(cleaned)) cleaned = cleaned.split('.')[0] ?? cleaned;
  return cleaned.toUpperCase();
}

/** Байршил / компани / нийлүүлэгчийн код — product code-той ижил дүрэм */
export function normCode(value: unknown): string | null {
  return normProductCode(value);
}

export function toNumber(value: unknown): number | null {
  if (value == null || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  const text = normText(value);
  if (text === null) return null;

  let cleaned = text.replace(/[\s ]/g, '');
  if (cleaned.includes(',') && cleaned.includes('.')) {
    cleaned = cleaned.replace(/,/g, '');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/,/g, '.');
  }

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function toInt(value: unknown): number | null {
  const num = toNumber(value);
  if (num === null || !Number.isInteger(num)) return null;
  return num;
}

/** ISO 8601 сарын хэлбэр. Өдөр ЗОХИОХГҮЙ. */
export function buildPeriodKey(year: number | null, month: number | null): string | null {
  if (year === null || month === null) return null;
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

export function mapLocationType(raw: unknown): 'WAREHOUSE' | 'PHARMACY' | null {
  const text = normText(raw);
  if (text === null) return null;
  return LOCATION_TYPE_MAP[text.toUpperCase()] ?? null;
}

/** 3xxxxx = агуулах, 4xxxxx = эмийн сан (бодит өгөгдөл дээр батлагдсан дүрэм) */
export function locationTypeFromCode(code: string | null): 'WAREHOUSE' | 'PHARMACY' | null {
  if (!code) return null;
  return PREFIX_RULE[code.charAt(0)] ?? null;
}

export function mapExclusivity(raw: unknown): 'EX' | 'NON_EX' | null {
  const text = normText(raw);
  if (text === null) return null;
  return EXCLUSIVITY_MAP[text.toUpperCase()] ?? null;
}

/**
 * Мөнгөн дүн / тоо хэмжээг hash-д ашиглах тогтвортой дүрслэл.
 * DB-д Decimal(20,6) хадгалагддаг тул ЯГ ТЭР нарийвчлалаар харьцуулна —
 * хадгалагдах нарийвчлалаас цааших float чимээ хиймэл "өөр мөр" үүсгэхгүй.
 */
function numRepr(value: number | null | undefined): string {
  if (value == null) return '';
  return value.toFixed(6);
}

function part(value: unknown): string {
  if (value == null) return '';
  return typeof value === 'number' ? numRepr(value) : String(value);
}

/** dedupe-д оролцох бизнес талбарууд (dataset тус бүрээр) */
export function businessTuple(datasetType: DatasetType, row: NormalizedRow): unknown[] {
  switch (datasetType) {
    case 'SALES':
      return [
        row.productCode,
        row.locationCode,
        row.companyCode,
        row.periodKey,
        numRepr(row.quantity),
        numRepr(row.cogsAmount),
      ];
    case 'PURCHASE':
      return [
        row.productCode,
        row.locationCode,
        row.companyCode,
        row.supplierCode,
        row.periodKey,
        numRepr(row.quantity),
        numRepr(row.amountExVat),
      ];
    case 'STOCK':
      return [row.productCode, row.locationCode, row.periodKey];
    default:
      throw new Error(`dedupe дэмжигдээгүй dataset: ${datasetType}`);
  }
}

/**
 * Давхар insert-ээс хамгаалах түлхүүр.
 *
 * `occurrence` нь ФАЙЛ ДОТОРХ ижил бизнес-мөрийн дугаарлалт (0,1,2…). Тиймээс:
 *   • нэг файлыг ДАХИН upload хийвэл ижил түлхүүр гарч upsert давхардуулахгүй
 *   • ижил хэмжээтэй ҮНЭХЭЭР тусдаа гүйлгээнүүд өөр occurrence авч хадгалагдана
 */
export function buildDedupeKey(
  datasetType: DatasetType,
  tuple: unknown[],
  occurrence: number,
): string {
  const canonical = [datasetType, ...tuple.map(part), String(occurrence)].join('|');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** Эх нүд хоосон биш эсэх (хоосон vs буруу утгыг ялгахад хэрэгтэй) */
function isPresent(raw: unknown): boolean {
  return normText(raw) !== null;
}

export function normalizeRow(datasetType: DatasetType, raw: Record<string, unknown>): NormalizedRow {
  const nonNumericFields: string[] = [];

  /** Тоон талбарыг хөрвүүлнэ. Утга БАЙГАА атлаа тоо болохгүй бол тэмдэглэнэ. */
  const coerce = (value: unknown, role: string): number | null => {
    const num = toNumber(value);
    if (num === null && isPresent(value)) nonNumericFields.push(role);
    return num;
  };

  const year = toInt(raw.year);
  const month = toInt(raw.month);
  if (year === null && isPresent(raw.year)) nonNumericFields.push('year');
  if (month === null && isPresent(raw.month)) nonNumericFields.push('month');

  const rawPresent: Record<string, boolean> = {
    year: isPresent(raw.year),
    month: isPresent(raw.month),
    quantity: isPresent(raw.quantity),
    cogsAmount: isPresent(raw.cogsAmount),
    amountExVat: isPresent(raw.amountExVat),
    quantityOnHand: isPresent(raw.quantityOnHand),
    stockValue: isPresent(raw.stockValue),
  };

  const row: NormalizedRow = {
    rawPresent,
    nonNumericFields,
    productCode: normProductCode(raw.productCode),
    productName: normText(raw.productName),
    manufacturerName: normText(raw.manufacturer),
    exclusivity: mapExclusivity(raw.exclusivity),
    exclusivityRaw: normText(raw.exclusivity),
    year,
    month,
    periodKey: buildPeriodKey(year, month),
    locationCode: normCode(raw.locationCode),
    locationType: mapLocationType(raw.locationType),
    locationTypeRaw: normText(raw.locationType),
    companyCode: normCode(raw.companyCode),
  };

  if (datasetType === 'SALES') {
    const qty = coerce(raw.quantity, 'quantity');
    const amount = coerce(raw.cogsAmount, 'cogsAmount');
    row.quantity = qty;
    row.cogsAmount = amount;
    // ⚠️ Эх өгөгдөлд борлуулалтын ОРЛОГО байхгүй (docs/01 §7) — үргэлж null
    row.netSalesAmount = null;
    row.isReturn = qty !== null && qty < 0;
    row.unitCogs = qty !== null && qty !== 0 && amount !== null ? amount / qty : null;
  } else if (datasetType === 'PURCHASE') {
    const qty = coerce(raw.quantity, 'quantity');
    const amount = coerce(raw.amountExVat, 'amountExVat');
    row.supplierCode = normCode(raw.supplierCode);
    row.quantity = qty;
    row.amountExVat = amount;
    row.isReturn = qty !== null && qty < 0;
    row.unitPrice = qty !== null && qty !== 0 && amount !== null ? amount / qty : null;
  } else if (datasetType === 'STOCK') {
    const qty = coerce(raw.quantityOnHand, 'quantityOnHand');
    const value = coerce(raw.stockValue, 'stockValue');
    row.quantityOnHand = qty;
    row.stockValue = value;
    row.unitCost = qty !== null && qty !== 0 && value !== null ? value / qty : null;
  } else if (datasetType === 'CHANNEL') {
    row.channelCode = normCode(raw.channelCode);
    row.channelName = normText(raw.channelName);
  } else if (datasetType === 'LOCATION') {
    row.locationName = normText(raw.locationName);
  }

  return row;
}
