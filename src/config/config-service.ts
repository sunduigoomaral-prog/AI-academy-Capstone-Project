/**
 * Тохиргооны ганц эх сурвалж (single source of truth).
 *
 * Тооцооллын код threshold, target days, lookback зэргийг ЭНД-ээс л авна.
 * `analysis-defaults.ts` нь зөвхөн seed / fallback — шууд import хийж
 * бизнес логикт ашиглахыг хориглоно.
 */

import { prisma } from '../lib/prisma';
import { isPeriodKey } from '../lib/period';
import type {
  AbcBasis,
  AbcClass,
  AnalysisSettings,
  LocationType,
  PolicyKey,
  SalesScope,
  XyzClass,
} from '../types/domain';
import { ANALYSIS_CONFIG_SEED, CONFIG_KEYS } from './analysis-defaults';

/** DB-д уншигдаагүй түлхүүрийн fallback (seed-ээс) */
function seedValue(key: string): string {
  const row = ANALYSIS_CONFIG_SEED.find((c) => c.key === key);
  if (!row) throw new Error(`Тодорхойлогдоогүй config key: ${key}`);
  return row.value;
}

async function loadActiveConfig(): Promise<Map<string, string>> {
  const rows = await prisma.analysisConfig.findMany({
    where: { isActive: true },
    orderBy: { version: 'desc' },
  });
  const map = new Map<string, string>();
  for (const r of rows) {
    if (!map.has(r.key)) map.set(r.key, r.value);
  }
  return map;
}

function num(map: Map<string, string>, key: string): number {
  const raw = map.get(key) ?? seedValue(key);
  const v = Number(raw);
  if (!Number.isFinite(v)) {
    throw new Error(`Config "${key}" тоон утга байх ёстой, ирсэн: "${raw}"`);
  }
  return v;
}

function str(map: Map<string, string>, key: string): string {
  return map.get(key) ?? seedValue(key);
}

/**
 * Идэвхтэй тооцооллын тохиргоог бүрэн уншиж, валидацилна.
 * Буруу тохиргоог чимээгүй засахгүй — алдаа шиднэ.
 */
export async function getAnalysisSettings(): Promise<AnalysisSettings> {
  const map = await loadActiveConfig();

  const settings: AnalysisSettings = {
    calculationMonth: str(map, CONFIG_KEYS.CALCULATION_MONTH),
    lookbackMonths: num(map, CONFIG_KEYS.LOOKBACK_MONTHS),
    daysPerMonth: num(map, CONFIG_KEYS.DAYS_PER_MONTH),
    abcBasis: str(map, CONFIG_KEYS.ABC_BASIS) as AbcBasis,
    salesScope: str(map, CONFIG_KEYS.SALES_SCOPE) as SalesScope,
    abcAThreshold: num(map, CONFIG_KEYS.ABC_A_THRESHOLD),
    abcBThreshold: num(map, CONFIG_KEYS.ABC_B_THRESHOLD),
    xyzXThreshold: num(map, CONFIG_KEYS.XYZ_X_THRESHOLD),
    xyzYThreshold: num(map, CONFIG_KEYS.XYZ_Y_THRESHOLD),
  };

  assertValidSettings(settings);
  return settings;
}

export function assertValidSettings(s: AnalysisSettings): void {
  if (!isPeriodKey(s.calculationMonth)) {
    throw new Error(`calculation_month буруу: "${s.calculationMonth}" ("YYYY-MM" байх ёстой)`);
  }
  if (!(s.abcAThreshold > 0 && s.abcAThreshold < s.abcBThreshold && s.abcBThreshold < 1)) {
    throw new Error(
      `ABC threshold буруу: 0 < A(${s.abcAThreshold}) < B(${s.abcBThreshold}) < 1 байх ёстой`,
    );
  }
  if (!(s.xyzXThreshold > 0 && s.xyzXThreshold < s.xyzYThreshold)) {
    throw new Error(
      `XYZ threshold буруу: 0 < X(${s.xyzXThreshold}) < Y(${s.xyzYThreshold}) байх ёстой`,
    );
  }
  if (!Number.isInteger(s.lookbackMonths) || s.lookbackMonths < 1) {
    throw new Error(`lookback_months буруу: ${s.lookbackMonths}`);
  }
  if (!(s.daysPerMonth > 0)) {
    throw new Error(`days_per_month буруу: ${s.daysPerMonth}`);
  }
  // ⚠️ ABC нь МӨНГӨН дүнгээр хийгддэг. QUANTITY нь зөвшөөрөгдөх утга биш.
  if (s.abcBasis !== 'COGS_VALUE' && s.abcBasis !== 'REVENUE') {
    throw new Error(
      `abc.basis буруу: "${s.abcBasis}". Зөвшөөрөгдөх утга: COGS_VALUE | REVENUE. ` +
        'ABC-г тоо хэмжээгээр хийхийг зөвшөөрөхгүй.',
    );
  }

  if (s.abcBasis === 'REVENUE') {
    throw new Error(
      'abc.basis = REVENUE сонгогдсон боловч эх өгөгдөлд борлуулалтын орлогын багана байхгүй ' +
        '(sales_fact.net_sales_amount бүгд NULL — docs/01 §7). Орлогын өгөгдөл ачаалагдсаны ' +
        'дараа энэ утгыг сонгоно уу. Одоогоор COGS_VALUE ашиглана.',
    );
  }

  const scopes: SalesScope[] = ['ALL', 'WAREHOUSE', 'PHARMACY'];
  if (!scopes.includes(s.salesScope)) {
    throw new Error(
      `analysis.sales_scope буруу: "${s.salesScope}". Зөвшөөрөгдөх: ${scopes.join(' | ')}`,
    );
  }
}

/** targetDays матрицыг санах ойд хайлт хийхэд бэлэн болгож уншина */
export async function getInventoryPolicyMap(): Promise<Map<string, number>> {
  const rows = await prisma.inventoryPolicy.findMany({
    where: { isActive: true, locationId: null },
    orderBy: { version: 'desc' },
  });
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = policyKey({
      locationType: r.locationType as LocationType,
      abcClass: r.abcClass as AbcClass,
      xyzClass: r.xyzClass as XyzClass,
    });
    if (!map.has(k)) map.set(k, r.targetDays);
  }
  return map;
}

export function policyKey(k: PolicyKey): string {
  return `${k.locationType}|${k.abcClass}|${k.xyzClass}`;
}

/**
 * Target days-г авна.
 *
 * ⭐ Зорилтот хоногийн хүснэгт нь ХОЁР баганатай:
 *      «Эм ханган нийлүүлэх төв БОЛОН БУСАД»  →  WAREHOUSE мөрүүд
 *      «Эмийн сан»                             →  PHARMACY мөрүүд
 *    Тиймээс PHARMACY БИШ аливаа байршлын төрөл (одоо байхгүй ч ирээдүйд
 *    нэмэгдэж болзошгүй) WAREHOUSE-ийн утгыг өвлөнө — «болон бусад».
 *
 * Түүнээс цааш олдохгүй бол default-руу унахгүй — алдаа шиднэ, учир нь
 * чимээгүй буруу зорилтот хоног нь буруу шийдвэр гаргуулна.
 */
export const FALLBACK_LOCATION_TYPE = 'WAREHOUSE';

export function resolveTargetDays(map: Map<string, number>, k: PolicyKey): number {
  const exact = map.get(policyKey(k));
  if (exact !== undefined) return exact;

  // «болон бусад» — эмийн сангаас бусад төрөл нь ханган нийлүүлэх төвийн утгатай
  if (k.locationType !== 'PHARMACY') {
    const fallback = map.get(policyKey({ ...k, locationType: FALLBACK_LOCATION_TYPE }));
    if (fallback !== undefined) return fallback;
  }

  throw new Error(
    `InventoryPolicy олдсонгүй: ${k.locationType}/${k.abcClass}${k.xyzClass}. ` +
      'prisma/seed.ts ажиллуулсан эсэхээ шалгана уу.',
  );
}
