/**
 * Sheet detection — баганын бүтцээр (role-оор) таних.
 *
 * ⚠️ Sheet-ийн НЭР шийдэхгүй. Тохиргоо нь `src/config/dataset-signatures.json`-д
 *    байх бөгөөд Python тал (`python/ingest/detect.py`) ЯГ ИЖИЛ файлыг уншина.
 *    Нэр нь зөвхөн оноо тэнцсэн үед л 5% нэмэлт жин өгнө.
 */

import signatures from '../../config/dataset-signatures.json';
import type { ColumnMap, DatasetType, Detection } from './types';

interface DatasetSignature {
  type: string;
  labelMn: string;
  nameHints?: string[];
  requiredRoles: string[];
  optionalRoles?: string[];
  disqualifyingRoles?: string[];
}

const DATASETS = signatures.datasets as unknown as DatasetSignature[];
const ROLE_ALIASES = signatures.roleAliases as unknown as Record<string, string[]>;

/** Багана нэрийг харьцуулахад бэлдэнэ: трим + доторх зай нэгтгэх + жижиг үсэг */
export function normalizeHeader(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim().toLocaleLowerCase('mn-MN');
}

/**
 * Эх баганын нэрсийг role руу буулгана.
 * Нэг role-д хэд таарвал alias жагсаалтын эхнийх нь ялна.
 */
export function mapHeadersToRoles(headers: (string | null)[]): ColumnMap {
  const byNormalized = new Map<string, string>();
  for (const h of headers) {
    if (h == null) continue;
    const key = normalizeHeader(h);
    if (key && !byNormalized.has(key)) byNormalized.set(key, h);
  }

  const resolved: ColumnMap = {};
  for (const [role, aliases] of Object.entries(ROLE_ALIASES)) {
    for (const alias of aliases) {
      const found = byNormalized.get(normalizeHeader(alias));
      if (found !== undefined) {
        resolved[role] = found;
        break;
      }
    }
  }
  return resolved;
}

function unmappedColumns(headers: (string | null)[], columnMap: ColumnMap): string[] {
  const mapped = new Set(Object.values(columnMap).map(normalizeHeader));
  return headers
    .filter((h): h is string => h != null)
    .filter((h) => !mapped.has(normalizeHeader(h)));
}

export function detectSheet(
  sheetName: string,
  sheetIndex: number,
  headers: (string | null)[],
): Detection {
  const columnMap = mapHeadersToRoles(headers);
  const present = new Set(Object.keys(columnMap));
  const nameNorm = normalizeHeader(sheetName);

  let best: Detection | null = null;

  for (const ds of DATASETS) {
    const required = ds.requiredRoles;
    const optional = ds.optionalRoles ?? [];
    const disqualifying = ds.disqualifyingRoles ?? [];

    if (disqualifying.some((r) => present.has(r))) continue;
    const missing = required.filter((r) => !present.has(r));
    if (missing.length > 0) continue;

    const optHit = optional.length
      ? optional.filter((r) => present.has(r)).length / optional.length
      : 1;
    const nameHit = (ds.nameHints ?? []).some((hint) => nameNorm.includes(normalizeHeader(hint)));
    const score = 1 + 0.3 * optHit + (nameHit ? 0.05 : 0);

    const keep = new Set([...required, ...optional.filter((r) => present.has(r))]);
    const scoped: ColumnMap = {};
    for (const role of Array.from(keep).sort()) {
      const col = columnMap[role];
      if (col !== undefined) scoped[role] = col;
    }

    const candidate: Detection = {
      sheetName,
      sheetIndex,
      datasetType: ds.type as DatasetType,
      confidence: Number((score / 1.35).toFixed(4)),
      columnMap: scoped,
      unmappedColumns: unmappedColumns(headers, scoped),
      missingRequired: [],
      reason:
        `${required.length} заавал role бүрэн таарсан` +
        (nameHit ? ', sheet нэр давхар таарсан' : ''),
    };

    if (best === null || candidate.confidence > best.confidence) best = candidate;
  }

  if (best !== null) return best;

  // Танигдаагүй — хамгийн ойрхон нэр дэвшигчийн дутуу role-уудыг тайлбарлана
  let closestType = '';
  let closestMissing: string[] = [];
  let bestOverlap = -1;
  for (const ds of DATASETS) {
    const overlap = ds.requiredRoles.filter((r) => present.has(r)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      closestType = ds.type;
      closestMissing = ds.requiredRoles.filter((r) => !present.has(r));
    }
  }

  return {
    sheetName,
    sheetIndex,
    datasetType: 'UNKNOWN',
    confidence: 0,
    columnMap,
    unmappedColumns: unmappedColumns(headers, columnMap),
    missingRequired: closestMissing,
    reason:
      `Аль ч dataset-д таарсангүй. Хамгийн ойр нь ${closestType}, ` +
      `дутуу role: ${closestMissing.join(', ') || 'байхгүй'}`,
  };
}

/** Excel мөрийг role → түүхий утга объект болгоно */
export function rowToRoles(
  headers: (string | null)[],
  columnMap: ColumnMap,
  row: unknown[],
): Record<string, unknown> {
  const positions = new Map<string, number>();
  headers.forEach((h, i) => {
    const key = normalizeHeader(h);
    if (key && !positions.has(key)) positions.set(key, i);
  });

  const out: Record<string, unknown> = {};
  for (const [role, sourceColumn] of Object.entries(columnMap)) {
    const pos = positions.get(normalizeHeader(sourceColumn));
    out[role] = pos !== undefined && pos < row.length ? row[pos] : null;
  }
  return out;
}

export const FACT_DATASET_TYPES: DatasetType[] = ['SALES', 'PURCHASE', 'STOCK'];

export function isFactDataset(type: DatasetType): boolean {
  return FACT_DATASET_TYPES.includes(type);
}
