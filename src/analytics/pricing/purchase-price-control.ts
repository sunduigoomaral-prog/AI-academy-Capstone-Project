/**
 * PURCHASE PRICE CONTROL — ЦЭВЭР ФУНКЦҮҮД (DB, React ашиглахгүй).
 *
 * §1  Unit Purchase Price = Purchase Amount / Purchase Quantity
 * §2  Эх сурвалж тус бүрийн ХАМГИЙН СҮҮЛИЙН худалдан авалт
 * §3  Хамгийн бага үнэтэй TOP 3
 * §4  Хамгийн өндөр үнэтэй TOP 3
 * §5  Price Gap = max − min;  Gap % = (max − min) / min × 100
 * §6  Potential Saving = одоогийн өртөг − (одоогийн тоо × хамгийн бага нэгж үнэ)
 *     ⚠️ "Одоогийн" гэдэг нь эх сурвалж бүрийн СҮҮЛИЙН худалдан авалт (§2).
 *        minUnitPrice-тай ижил хугацааны суурьтай байх ёстой — цонхны бүх
 *        сартай харьцуулбал сөрөг/хуурамч хэмнэлт гарна.
 *
 * ⚠️ ОГНОО: эх өгөгдөлд өдрийн огноо БАЙХГҮЙ (docs/01 §8), зөвхөн Он+Сар.
 *    Тиймээс "хамгийн сүүлийн худалдан авалт" = хамгийн сүүлийн САР
 *    (calculation month-аас өмнөх). Нэг сар дотор олон гүйлгээ байвал
 *    дараалал тодорхойгүй тул тухайн сарын ЖИГНЭСЭН ДУНДЖИЙГ авна
 *    (Σ дүн / Σ тоо) — санамсаргүй нэг мөрийг сонгохгүй.
 *
 * ⚠️ ТЭГ ҮНЭ: эх өгөгдөлд тэг дүнтэй мөр байдаг. Тэдгээрийг benchmark-д
 *    оруулбал gap% нь тэгд хуваагдаж утгагүй болно (бодит өгөгдөл дээр
 *    23,272,726,566% гарч байсан). `minValidUnitPrice`-аас доош үнийг ХАСНА.
 */

import config from '../../config/price-control-rules.json';

export type PriceDimension = 'SUPPLIER' | 'LOCATION' | 'CHANNEL';

export interface PurchaseLine {
  productCode: string;
  productName: string | null;
  /** Хэмжээстийн түлхүүр — нийлүүлэгчийн код (default), эсвэл байршил/суваг */
  dimensionKey: string;
  periodKey: string;
  quantity: number;
  amount: number;
}

export interface PricePoint {
  dimensionKey: string;
  /** ⚠️ Өдөр биш, САР (эх өгөгдөлд өдөр байхгүй) */
  lastPurchasePeriod: string;
  /** Тухайн сарын нийт тоо */
  quantity: number;
  /** Тухайн сарын нийт дүн */
  amount: number;
  /** amount / quantity */
  unitPrice: number;
  /** Хамгийн бага үнээр эрэмбэлсэн дугаар (1 = хамгийн хямд) */
  lowestRank: number;
  /** Хамгийн өндөр үнээр эрэмбэлсэн дугаар (1 = хамгийн үнэтэй) */
  highestRank: number;
}

export interface PriceBenchmark {
  productCode: string;
  productName: string | null;
  dimension: PriceDimension;
  /** Benchmark-д орсон эх сурвалжийн тоо */
  sourceCount: number;
  points: PricePoint[];
  /** §3 — хамгийн хямд TOP N */
  lowestTop: PricePoint[];
  /** §4 — хамгийн үнэтэй TOP N */
  highestTop: PricePoint[];
  minUnitPrice: number | null;
  maxUnitPrice: number | null;
  minSourceKey: string | null;
  maxSourceKey: string | null;
  /** §5 */
  priceGap: number | null;
  priceGapPct: number | null;
  gapSeverity: string | null;
  /** Шинжилгээний цонхны НИЙТ худалдан авалт (мэдээллийн зорилгоор) */
  totalQuantity: number;
  totalCost: number;
  weightedAvgUnitPrice: number | null;
  /**
   * §6 — ОДООГИЙН худалдан авалт = эх сурвалж тус бүрийн СҮҮЛИЙН
   * худалдан авалтын нийлбэр (яг §2-ийн points).
   * ⚠️ Цонхны нийт биш — `minUnitPrice` нь сүүлийн үнэ тул хугацааны
   *    суурь нь ижил байх ёстой.
   */
  currentQuantity: number;
  currentCost: number;
  /** §6 currentCost − currentQuantity × minUnitPrice. Үргэлж >= 0. */
  potentialSaving: number | null;
  /** §8-д хэрэглэгдэх нэгж үнийн өөрчлөлт */
  firstPeriod: string | null;
  lastPeriod: string | null;
  firstUnitPrice: number | null;
  lastUnitPrice: number | null;
  priceChangePct: number | null;
  priceIncreaseSeverity: string | null;
  /** Benchmark хийх боломжгүй бол шалтгаан */
  excludedReason: string | null;
}

const PARAMS = config.params;
const GAP_SEVERITY = config.gapSeverity as Array<{
  code: string;
  minGapPct: number;
  labelMn: string;
}>;
const INCREASE_SEVERITY = config.priceIncreaseSeverity as Array<{
  code: string;
  minIncreasePct: number;
  labelMn: string;
}>;

export function defaultPriceDimension(): PriceDimension {
  return config.priceDimension as PriceDimension;
}

export function gapSeverityOf(gapPct: number | null): string | null {
  if (gapPct === null) return null;
  for (const level of GAP_SEVERITY) {
    if (gapPct >= level.minGapPct) return level.code;
  }
  return null;
}

export function priceIncreaseSeverityOf(changePct: number | null): string | null {
  if (changePct === null) return null;
  for (const level of INCREASE_SEVERITY) {
    if (changePct >= level.minIncreasePct) return level.code;
  }
  return null;
}

/** Benchmark-д оруулах эсэх: тоо эерэг, нэгж үнэ утга учиртай */
function isUsableLine(line: PurchaseLine): boolean {
  if (PARAMS.excludeReturns && line.quantity <= 0) return false;
  if (line.quantity === 0) return false;
  const unit = line.amount / line.quantity;
  return Number.isFinite(unit) && unit >= PARAMS.minValidUnitPrice;
}

interface Bucket {
  quantity: number;
  amount: number;
  periods: Map<string, { quantity: number; amount: number }>;
}

/**
 * Нэг бүтээгдэхүүний benchmark.
 *
 * `lines` нь ЗӨВХӨН тухайн бүтээгдэхүүний, ЗӨВХӨН зөвшөөрөгдсөн саруудын
 * (calculation month-аас өмнөх) мөрүүд байх ёстой.
 */
export function buildBenchmark(
  productCode: string,
  productName: string | null,
  lines: readonly PurchaseLine[],
  dimension: PriceDimension = defaultPriceDimension(),
): PriceBenchmark {
  const usable = lines.filter(isUsableLine);

  // Шинжилгээний цонхны НИЙТ худалдан авалт (хасагдсан мөрүүдийг ч оруулна —
  // энэ нь бодитоор гарсан зардал)
  const totalQuantity = lines.reduce((acc, l) => acc + l.quantity, 0);
  const totalCost = lines.reduce((acc, l) => acc + l.amount, 0);

  const empty: PriceBenchmark = {
    productCode,
    productName,
    dimension,
    sourceCount: 0,
    points: [],
    lowestTop: [],
    highestTop: [],
    minUnitPrice: null,
    maxUnitPrice: null,
    minSourceKey: null,
    maxSourceKey: null,
    priceGap: null,
    priceGapPct: null,
    gapSeverity: null,
    totalQuantity,
    totalCost,
    weightedAvgUnitPrice: totalQuantity > 0 ? totalCost / totalQuantity : null,
    currentQuantity: 0,
    currentCost: 0,
    potentialSaving: null,
    firstPeriod: null,
    lastPeriod: null,
    firstUnitPrice: null,
    lastUnitPrice: null,
    priceChangePct: null,
    priceIncreaseSeverity: null,
    excludedReason: null,
  };

  if (usable.length === 0) {
    return {
      ...empty,
      excludedReason:
        'Утга учиртай нэгж үнэтэй худалдан авалтын мөр олдсонгүй (тэг тоо/дүн эсвэл буцаалт).',
    };
  }

  // ── Эх сурвалж тус бүрээр сар бүрийн нэгтгэл ──
  const buckets = new Map<string, Bucket>();
  for (const line of usable) {
    let bucket = buckets.get(line.dimensionKey);
    if (!bucket) {
      bucket = { quantity: 0, amount: 0, periods: new Map() };
      buckets.set(line.dimensionKey, bucket);
    }
    bucket.quantity += line.quantity;
    bucket.amount += line.amount;

    const period = bucket.periods.get(line.periodKey) ?? { quantity: 0, amount: 0 };
    period.quantity += line.quantity;
    period.amount += line.amount;
    bucket.periods.set(line.periodKey, period);
  }

  // ── §2: эх сурвалж тус бүрийн ХАМГИЙН СҮҮЛИЙН сарын жигнэсэн үнэ ──
  const points: PricePoint[] = [];
  for (const [dimensionKey, bucket] of buckets) {
    const lastPeriod = Array.from(bucket.periods.keys()).sort().pop();
    if (!lastPeriod) continue;
    const period = bucket.periods.get(lastPeriod);
    if (!period || period.quantity <= 0) continue;

    const unitPrice = period.amount / period.quantity;
    if (!Number.isFinite(unitPrice) || unitPrice < PARAMS.minValidUnitPrice) continue;

    points.push({
      dimensionKey,
      lastPurchasePeriod: lastPeriod,
      quantity: period.quantity,
      amount: period.amount,
      unitPrice,
      lowestRank: 0,
      highestRank: 0,
    });
  }

  if (points.length === 0) {
    return { ...empty, excludedReason: 'Сүүлийн сарын нэгж үнэ тодорхойлогдсонгүй.' };
  }

  // ── §3, §4: эрэмбэ (тэнцвэл түлхүүрээр — үр дүн давтагдана) ──
  const byLowest = [...points].sort(
    (a, b) => a.unitPrice - b.unitPrice || a.dimensionKey.localeCompare(b.dimensionKey),
  );
  byLowest.forEach((point, index) => {
    point.lowestRank = index + 1;
  });

  const byHighest = [...points].sort(
    (a, b) => b.unitPrice - a.unitPrice || a.dimensionKey.localeCompare(b.dimensionKey),
  );
  byHighest.forEach((point, index) => {
    point.highestRank = index + 1;
  });

  const minPoint = byLowest[0]!;
  const maxPoint = byHighest[0]!;
  const minUnitPrice = minPoint.unitPrice;
  const maxUnitPrice = maxPoint.unitPrice;

  // ── §5 ──
  const priceGap = maxUnitPrice - minUnitPrice;
  const priceGapPct = minUnitPrice > 0 ? (priceGap / minUnitPrice) * 100 : null;

  // ── §6: одоогийн худалдан авалт vs хамгийн бага одоогийн үнэ ──
  //
  // ⚠️ ХУГАЦААНЫ СУУРЬ ИЖИЛ БАЙХ ЁСТОЙ.
  //    `minUnitPrice` нь эх сурвалж бүрийн СҮҮЛИЙН худалдан авалтын үнэ (§2).
  //    Тиймээс харьцуулах "одоогийн худалдан авалт" нь мөн ЯГ ТЭР сүүлийн
  //    худалдан авалтуудын нийлбэр байна.
  //
  //    Цонхны БҮХ САРЫН нийлбэртэй харьцуулбал:
  //      • үнэ өссөн үед сүүлийн min > түүхэн дундаж → хэмнэлт СӨРӨГ гарна
  //      • ганц эх сурвалжтай ч гэсэн тэг биш хуурамч хэмнэлт гарна
  //    (бодит өгөгдөл дээр 17 сөрөг, 39 хуурамч тохиолдол илэрсэн).
  //
  //    Ийм суурьтай үед хэмнэлт нь ҮРГЭЛЖ >= 0, ганц эх сурвалжтай үед ЯГ 0.
  const currentQuantity = points.reduce((acc, p) => acc + p.quantity, 0);
  const currentCost = points.reduce((acc, p) => acc + p.amount, 0);
  const potentialSaving = Math.max(0, currentCost - currentQuantity * minUnitPrice);

  // ── §8-д хэрэглэгдэх: цонхны эхний ба сүүлийн сарын нэгж үнэ ──
  const periodTotals = new Map<string, { quantity: number; amount: number }>();
  for (const line of usable) {
    const entry = periodTotals.get(line.periodKey) ?? { quantity: 0, amount: 0 };
    entry.quantity += line.quantity;
    entry.amount += line.amount;
    periodTotals.set(line.periodKey, entry);
  }
  const sortedPeriods = Array.from(periodTotals.keys()).sort();
  const firstPeriod = sortedPeriods[0] ?? null;
  const lastPeriod = sortedPeriods[sortedPeriods.length - 1] ?? null;

  let firstUnitPrice: number | null = null;
  let lastUnitPrice: number | null = null;
  let priceChangePct: number | null = null;

  if (firstPeriod && lastPeriod && firstPeriod !== lastPeriod) {
    const first = periodTotals.get(firstPeriod)!;
    const last = periodTotals.get(lastPeriod)!;
    if (first.quantity > 0 && last.quantity > 0) {
      firstUnitPrice = first.amount / first.quantity;
      lastUnitPrice = last.amount / last.quantity;
      if (firstUnitPrice >= PARAMS.minValidUnitPrice) {
        priceChangePct = ((lastUnitPrice - firstUnitPrice) / firstUnitPrice) * 100;
      }
    }
  }

  return {
    productCode,
    productName,
    dimension,
    sourceCount: points.length,
    points: byLowest,
    lowestTop: byLowest.slice(0, PARAMS.topN),
    highestTop: byHighest.slice(0, PARAMS.topN),
    minUnitPrice,
    maxUnitPrice,
    minSourceKey: minPoint.dimensionKey,
    maxSourceKey: maxPoint.dimensionKey,
    priceGap,
    priceGapPct,
    gapSeverity: gapSeverityOf(priceGapPct),
    totalQuantity,
    totalCost,
    weightedAvgUnitPrice: totalQuantity > 0 ? totalCost / totalQuantity : null,
    currentQuantity,
    currentCost,
    potentialSaving,
    firstPeriod,
    lastPeriod,
    firstUnitPrice,
    lastUnitPrice,
    priceChangePct,
    priceIncreaseSeverity: priceIncreaseSeverityOf(priceChangePct),
    excludedReason: null,
  };
}

/** Бүх бүтээгдэхүүний benchmark */
export function buildBenchmarks(
  linesByProduct: Map<string, PurchaseLine[]>,
  nameByProduct: Map<string, string | null>,
  dimension: PriceDimension = defaultPriceDimension(),
): PriceBenchmark[] {
  const out: PriceBenchmark[] = [];
  for (const [productCode, lines] of linesByProduct) {
    out.push(buildBenchmark(productCode, nameByProduct.get(productCode) ?? null, lines, dimension));
  }
  return out.sort((a, b) => (b.potentialSaving ?? 0) - (a.potentialSaving ?? 0));
}
