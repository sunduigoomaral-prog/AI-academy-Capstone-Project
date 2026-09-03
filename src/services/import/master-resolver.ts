/**
 * Master data resolver.
 *
 * 1) `buildMasterIndex` — ЦЭВЭР функц. Master sheet (Product / Location / Channel)
 *    байвал ТЭР давуу эрхтэй; байхгүй бол fact sheet-үүдээс гарган авна
 *    (одоогийн эх файлын тохиолдол — docs/01 §6-д батлагдсан).
 *
 * 2) `persistMasters` — лавлахуудыг DB-д upsert хийж, код → id зураглал буцаана.
 *    Бүх бичилт `product_code` / `code` гэсэн business key дээр тулгуурлана.
 */

import type { PrismaClient } from '@prisma/client';

import { mapHeadersToRoles, rowToRoles } from './sheet-detector';
import { normalizeRow } from './normalizers';
import { emptyMasterIndex } from './validators';
import type {
  Detection,
  MasterIdMaps,
  MasterIndex,
  RawSheet,
  ValidationIssue,
} from './types';

type PrismaTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

function mostCommon<T>(counter: Map<T, number>): T | undefined {
  let best: T | undefined;
  let bestCount = -1;
  for (const [value, count] of counter) {
    if (count > bestCount) {
      bestCount = count;
      best = value;
    }
  }
  return best;
}

function bump<T>(map: Map<T, number>, key: T): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export function buildMasterIndex(
  sheets: RawSheet[],
  detections: Detection[],
): { master: MasterIndex; issues: ValidationIssue[] } {
  const master = emptyMasterIndex();
  const issues: ValidationIssue[] = [];

  const productAttrs = new Map<string, Map<string, number>>();
  const productFirstRow = new Map<string, { sheet: string; row: number }>();
  const locationCompany = new Map<string, Map<string, number>>();
  const locationType = new Map<string, Map<string, number>>();

  sheets.forEach((sheet, i) => {
    const det = detections[i];
    if (!det || det.datasetType === 'UNKNOWN') return;

    if (det.datasetType === 'PRODUCT') master.productSourceSheet = true;
    if (det.datasetType === 'LOCATION') master.locationSourceSheet = true;
    if (det.datasetType === 'CHANNEL') master.channelSourceSheet = true;

    const columnMap = mapHeadersToRoles(sheet.headers);

    sheet.rows.forEach((rawRow, rowIdx) => {
      const raw = rowToRoles(sheet.headers, columnMap, rawRow);
      const row = normalizeRow(det.datasetType, raw);

      if (det.datasetType === 'CHANNEL') {
        if (row.channelCode) master.channels.set(row.channelCode, { name: row.channelName ?? null });
        return;
      }

      if (row.productCode) {
        const attrKey = JSON.stringify([
          row.productName,
          row.manufacturerName,
          row.exclusivity,
        ]);
        let counter = productAttrs.get(row.productCode);
        if (!counter) {
          counter = new Map();
          productAttrs.set(row.productCode, counter);
        }
        bump(counter, attrKey);
        if (!productFirstRow.has(row.productCode)) {
          productFirstRow.set(row.productCode, { sheet: sheet.name, row: rowIdx + 2 });
        }
      }

      if (row.locationCode) {
        if (row.companyCode) {
          let counter = locationCompany.get(row.locationCode);
          if (!counter) {
            counter = new Map();
            locationCompany.set(row.locationCode, counter);
          }
          bump(counter, row.companyCode);
          master.companies.add(row.companyCode);
        }
        if (row.locationType) {
          let counter = locationType.get(row.locationCode);
          if (!counter) {
            counter = new Map();
            locationType.set(row.locationCode, counter);
          }
          bump(counter, row.locationType);
        }
      }

      if (row.supplierCode) master.suppliers.add(row.supplierCode);
    });
  });

  // Бүтээгдэхүүний лавлах — хамгийн олон давтагдсан атрибутын хослолыг авна
  for (const [code, counter] of productAttrs) {
    const winner = mostCommon(counter);
    if (winner === undefined) continue;
    const [name, manufacturerName, exclusivity] = JSON.parse(winner) as [
      string | null,
      string | null,
      'EX' | 'NON_EX' | null,
    ];
    master.products.set(code, { name, manufacturerName, exclusivity });

    if (counter.size > 1) {
      const at = productFirstRow.get(code);
      issues.push({
        code: 'PRODUCT_ATTRIBUTE_CONFLICT',
        severity: 'WARNING',
        sheetName: at?.sheet ?? '',
        rowNo: at?.row ?? 0,
        columnName: null,
        value: code,
        message: `${code}: ${counter.size} өөр атрибутын хослол илэрсэн`,
      });
    }
  }

  // Байршлын лавлах
  const locationCodes = new Set([...locationCompany.keys(), ...locationType.keys()]);
  for (const code of locationCodes) {
    master.locations.set(code, {
      companyCode: mostCommon(locationCompany.get(code) ?? new Map()) ?? null,
      type: (mostCommon(locationType.get(code) ?? new Map()) ?? null) as
        | 'WAREHOUSE'
        | 'PHARMACY'
        | null,
    });
  }

  return { master, issues };
}

/**
 * Лавлахуудыг DB-д бичнэ. Бүгд upsert — дахин upload хийхэд давхардахгүй.
 * ⚠️ Excel-д байхгүй утга (компанийн нэр гэх мэт) ЗОХИОХГҮЙ — null хэвээр үлдэнэ.
 */
export async function persistMasters(
  tx: PrismaTx,
  master: MasterIndex,
): Promise<MasterIdMaps> {
  const companyIdByCode = new Map<string, string>();
  const locationIdByCode = new Map<string, string>();
  const productIdByCode = new Map<string, string>();
  const supplierIdByCode = new Map<string, string>();

  for (const code of master.companies) {
    const row = await tx.company.upsert({
      where: { code },
      update: {},
      create: { code },
      select: { id: true },
    });
    companyIdByCode.set(code, row.id);
  }

  for (const [code, info] of master.channels) {
    await tx.channel.upsert({
      where: { code },
      update: { name: info.name },
      create: { code, name: info.name },
    });
  }

  for (const [code, info] of master.locations) {
    const companyId = info.companyCode ? companyIdByCode.get(info.companyCode) : undefined;
    if (!companyId) {
      throw new Error(
        `Байршил ${code}-д харгалзах компани олдсонгүй (ХХК = ${info.companyCode ?? 'хоосон'}).`,
      );
    }
    if (!info.type) {
      throw new Error(`Байршил ${code}-ийн төрөл тодорхойлогдсонгүй (ЭХНТ / ЭС).`);
    }
    const row = await tx.location.upsert({
      where: { code },
      update: { type: info.type, companyId },
      create: { code, type: info.type, companyId },
      select: { id: true },
    });
    locationIdByCode.set(code, row.id);
  }

  for (const code of master.suppliers) {
    const row = await tx.supplier.upsert({
      where: { code },
      update: {},
      create: { code },
      select: { id: true },
    });
    supplierIdByCode.set(code, row.id);
  }

  for (const [code, info] of master.products) {
    // ⚠️ Байхгүй утгыг ЗОХИОХГҮЙ — null хэвээр бичнэ
    const row = await tx.product.upsert({
      where: { productCode: code },
      update: {
        name: info.name,
        manufacturerName: info.manufacturerName,
        exclusivity: info.exclusivity,
      },
      create: {
        productCode: code,
        name: info.name,
        manufacturerName: info.manufacturerName,
        exclusivity: info.exclusivity,
      },
      select: { id: true },
    });
    productIdByCode.set(code, row.id);
  }

  return { productIdByCode, locationIdByCode, companyIdByCode, supplierIdByCode };
}
