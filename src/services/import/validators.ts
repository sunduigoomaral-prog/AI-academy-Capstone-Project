/**
 * Data validation — ЦЭВЭР ФУНКЦҮҮД.
 *
 * Дүрмүүд `src/config/validation-rules.json`-оос ирнэ (Python тал ижил файл уншина).
 *   ERROR   → мөр DB-д ОРОХГҮЙ
 *   WARNING → мөр ОРНО, гэхдээ тэмдэглэгдэнэ
 */

import rulesConfig from '../../config/validation-rules.json';
import { businessTuple, locationTypeFromCode } from './normalizers';
import type {
  ColumnMap,
  DatasetType,
  MasterIndex,
  NormalizedRow,
  RowStatus,
  ValidationIssue,
  ValidationSeverity,
} from './types';

interface RuleDef {
  code: string;
  severity: ValidationSeverity;
  appliesTo: string[];
  field: string;
  messageMn: string;
  rationaleMn: string;
}

const RULES = new Map<string, RuleDef>(
  (rulesConfig.rules as unknown as RuleDef[]).map((r) => [r.code, r]),
);

export function ruleDef(code: string): RuleDef {
  const rule = RULES.get(code);
  if (!rule) {
    throw new Error(
      `Тодорхойлогдоогүй валидацийн дүрэм: ${code}. src/config/validation-rules.json-д нэмнэ үү.`,
    );
  }
  return rule;
}

export function allRules(): RuleDef[] {
  return Array.from(RULES.values());
}

function issue(
  code: string,
  sheetName: string,
  rowNo: number,
  columnName: string | null | undefined,
  value: unknown,
): ValidationIssue {
  const rule = ruleDef(code);
  return {
    code,
    severity: rule.severity,
    sheetName,
    rowNo,
    columnName: columnName ?? null,
    value: value == null ? null : String(value).slice(0, 120),
    message: rule.messageMn,
  };
}

export function emptyMasterIndex(): MasterIndex {
  return {
    products: new Map(),
    locations: new Map(),
    channels: new Map(),
    companies: new Set(),
    suppliers: new Set(),
    productSourceSheet: false,
    locationSourceSheet: false,
    channelSourceSheet: false,
  };
}

/** Нэг мөрийн бүх шалгалт */
export function validateRow(
  datasetType: DatasetType,
  row: NormalizedRow,
  sheetName: string,
  rowNo: number,
  columnMap: ColumnMap,
  master: MasterIndex,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const col = columnMap;

  if (!row.productCode) {
    issues.push(issue('MISSING_PRODUCT_CODE', sheetName, rowNo, col.productCode, null));
  }
  if (!row.productName) {
    issues.push(issue('MISSING_PRODUCT_NAME', sheetName, rowNo, col.productName, null));
  }

  const isFact = datasetType === 'SALES' || datasetType === 'PURCHASE' || datasetType === 'STOCK';

  // Утга БАЙГАА атлаа тоо болж хөрвөөгүй талбарууд — "хоосон"-оос ялгаатай оношилгоо
  for (const field of row.nonNumericFields) {
    issues.push(issue('NON_NUMERIC_VALUE', sheetName, rowNo, col[field], `${field}`));
  }

  if (isFact) {
    const yearPresent = row.rawPresent.year === true;
    const monthPresent = row.rawPresent.month === true;

    if (!yearPresent || !monthPresent) {
      issues.push(issue('MISSING_DATE', sheetName, rowNo, col.month, null));
    } else if (row.periodKey === null) {
      issues.push(issue('INVALID_DATE', sheetName, rowNo, col.month, `${row.year}-${row.month}`));
    }

    if (!row.locationCode) {
      issues.push(issue('MISSING_LOCATION_CODE', sheetName, rowNo, col.locationCode, null));
    }
    if (!row.companyCode) {
      issues.push(issue('MISSING_COMPANY_CODE', sheetName, rowNo, col.companyCode, null));
    }

    if (row.locationTypeRaw !== null && row.locationType === null) {
      issues.push(
        issue('UNKNOWN_LOCATION_TYPE', sheetName, rowNo, col.locationType, row.locationTypeRaw),
      );
    }
    const byPrefix = locationTypeFromCode(row.locationCode);
    if (row.locationType && byPrefix && row.locationType !== byPrefix) {
      issues.push(
        issue(
          'LOCATION_TYPE_CONFLICT',
          sheetName,
          rowNo,
          col.locationType,
          `${row.locationTypeRaw} (${row.locationType}) vs код ${row.locationCode} → ${byPrefix}`,
        ),
      );
    }

    if (row.exclusivityRaw !== null && row.exclusivity === null) {
      issues.push(
        issue('UNKNOWN_EXCLUSIVITY', sheetName, rowNo, col.exclusivity, row.exclusivityRaw),
      );
    }
  }

  if (datasetType === 'SALES' || datasetType === 'PURCHASE') {
    const qty = row.quantity;
    if (qty == null && row.rawPresent.quantity !== true) {
      issues.push(issue('MISSING_QUANTITY', sheetName, rowNo, col.quantity, null));
    } else if (qty != null && qty < 0) {
      issues.push(issue('NEGATIVE_QUANTITY', sheetName, rowNo, col.quantity, qty));
    } else if (qty === 0) {
      issues.push(issue('ZERO_QUANTITY', sheetName, rowNo, col.quantity, qty));
    }
  }

  if (datasetType === 'SALES') {
    const amount = row.cogsAmount;
    if (amount == null && row.rawPresent.cogsAmount !== true) {
      issues.push(issue('MISSING_SALES_AMOUNT', sheetName, rowNo, col.cogsAmount, null));
    } else if (amount != null && row.quantity === 0 && amount !== 0) {
      issues.push(issue('ZERO_QTY_NONZERO_AMOUNT', sheetName, rowNo, col.cogsAmount, amount));
    }
  }

  if (datasetType === 'PURCHASE') {
    const amount = row.amountExVat;
    if (amount == null && row.rawPresent.amountExVat !== true) {
      issues.push(issue('MISSING_PURCHASE_AMOUNT', sheetName, rowNo, col.amountExVat, null));
    } else if (amount != null && row.quantity === 0 && amount !== 0) {
      issues.push(issue('ZERO_QTY_NONZERO_AMOUNT', sheetName, rowNo, col.amountExVat, amount));
    }
  }

  if (datasetType === 'STOCK') {
    const qty = row.quantityOnHand;
    if (qty == null && row.rawPresent.quantityOnHand !== true) {
      issues.push(issue('MISSING_STOCK_QUANTITY', sheetName, rowNo, col.quantityOnHand, null));
    } else if (qty != null && qty < 0) {
      issues.push(issue('NEGATIVE_STOCK', sheetName, rowNo, col.quantityOnHand, qty));
    }
  }

  // ── Лавлахтай тулгалт ──
  if (isFact) {
    if (row.productCode && !master.products.has(row.productCode)) {
      issues.push(issue('UNMATCHED_PRODUCT', sheetName, rowNo, col.productCode, row.productCode));
    }

    if (row.locationCode) {
      const known = master.locations.get(row.locationCode);
      if (!known) {
        issues.push(
          issue('UNMATCHED_LOCATION', sheetName, rowNo, col.locationCode, row.locationCode),
        );
      } else if (known.companyCode && row.companyCode && known.companyCode !== row.companyCode) {
        issues.push(
          issue(
            'COMPANY_LOCATION_CONFLICT',
            sheetName,
            rowNo,
            col.companyCode,
            `${row.locationCode} → ${row.companyCode} vs ${known.companyCode}`,
          ),
        );
      }
    }

    // Сувгийн лавлах эх өгөгдөлд байхгүй бол ЭНЭ ШАЛГАЛТ АЛГАСАГДАНА
    if (master.channelSourceSheet && row.channelCode && !master.channels.has(row.channelCode)) {
      issues.push(issue('UNMATCHED_CHANNEL', sheetName, rowNo, null, row.channelCode));
    }
  }

  return issues;
}

export function rowStatusOf(issues: ValidationIssue[]): RowStatus {
  if (issues.some((i) => i.severity === 'ERROR')) return 'ERROR';
  if (issues.length > 0) return 'WARNING';
  return 'VALID';
}

/**
 * Файл доторх давхардлыг илрүүлж, occurrence index оноож өгнө.
 *
 * SALES / PURCHASE → WARNING. Ижил хэмжээтэй тусдаа нэхэмжлэх байж БОЛНО тул
 *                    мөр УСТГАГДАХГҮЙ, зөвхөн тэмдэглэгдэнэ.
 * STOCK            → ERROR. Snapshot давхардвал аль нь зөв нь тодорхойгүй.
 */
export function markDuplicates(
  datasetType: DatasetType,
  rows: NormalizedRow[],
  sheetName: string,
): { occurrences: number[]; issues: ValidationIssue[] } {
  const seen = new Map<string, number>();
  const occurrences: number[] = [];
  const issues: ValidationIssue[] = [];

  rows.forEach((row, index) => {
    const key = businessTuple(datasetType, row)
      .map((v) => (v == null ? '' : String(v)))
      .join('|');
    const occ = seen.get(key) ?? 0;
    seen.set(key, occ + 1);
    occurrences.push(occ);

    if (occ > 0) {
      const code = datasetType === 'STOCK' ? 'DUPLICATE_STOCK_ROW' : 'DUPLICATE_TRANSACTION';
      issues.push(
        issue(
          code,
          sheetName,
          index + 2, // header = мөр 1
          null,
          `${occ + 1} дэх давталт: ${row.productCode} / ${row.locationCode} / ${row.periodKey}`,
        ),
      );
    }
  });

  return { occurrences, issues };
}
