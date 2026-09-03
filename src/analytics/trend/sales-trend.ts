/**
 * SALES TREND — ЦЭВЭР ФУНКЦ.
 *
 * AI engine-ийн оролтын нэг хэсэг (§9 «Sales Trend»).
 *
 * Арга: lookback цонхыг ХОЁР ТЭНЦҮҮ ХЭСЭГТ хуваана.
 *   6 сар → сүүлийн 3 (2026-03…05) vs өмнөх 3 (2025-12…2026-02)
 *   trendPct = (сүүлийн дундаж − өмнөх дундаж) / өмнөх дундаж × 100
 *
 * ⚠️ Өмнөх хугацаа 0 бол хувь тодорхойлогдохгүй → `NEW` (шинээр зарагдаж эхэлсэн)
 *    эсвэл хоёул 0 бол `NO_SALES`.
 */

import config from '../../config/price-control-rules.json';

export type SalesTrend = 'GROWING' | 'STABLE' | 'DECLINING' | 'NEW' | 'NO_SALES';

export interface TrendResult {
  trend: SalesTrend;
  trendPct: number | null;
  recentAvg: number;
  previousAvg: number;
  recentMonths: number;
  previousMonths: number;
  labelMn: string;
}

const PARAMS = config.params;

const LABELS: Record<SalesTrend, string> = {
  GROWING: 'Өсөж байна',
  STABLE: 'Тогтвортой',
  DECLINING: 'Буурч байна',
  NEW: 'Шинээр эхэлсэн',
  NO_SALES: 'Борлуулалтгүй',
};

/**
 * @param monthlyQty Lookback сар бүрийн тоо хэмжээ, ЭРТНЭЭС ХОЙШ дараалалтай
 *                   (AnalysisRun.periodsUsed-тэй ижил дараалал)
 */
export function computeSalesTrend(
  monthlyQty: readonly number[],
  splitMonths: number = PARAMS.salesTrendSplitMonths,
): TrendResult {
  const n = monthlyQty.length;

  // Цонх хэт богино бол хуваахгүй — хандлага тодорхойлохгүй
  if (n < 2) {
    const total = monthlyQty.reduce((acc, q) => acc + q, 0);
    const trend: SalesTrend = total === 0 ? 'NO_SALES' : 'STABLE';
    return {
      trend,
      trendPct: null,
      recentAvg: total,
      previousAvg: 0,
      recentMonths: n,
      previousMonths: 0,
      labelMn: LABELS[trend],
    };
  }

  const split = Math.min(splitMonths, Math.floor(n / 2));
  const recent = monthlyQty.slice(n - split);
  const previous = monthlyQty.slice(Math.max(0, n - 2 * split), n - split);

  const recentAvg = recent.reduce((acc, q) => acc + q, 0) / recent.length;
  const previousAvg =
    previous.length > 0 ? previous.reduce((acc, q) => acc + q, 0) / previous.length : 0;

  if (recentAvg === 0 && previousAvg === 0) {
    return {
      trend: 'NO_SALES',
      trendPct: null,
      recentAvg,
      previousAvg,
      recentMonths: recent.length,
      previousMonths: previous.length,
      labelMn: LABELS.NO_SALES,
    };
  }

  if (previousAvg === 0) {
    return {
      trend: 'NEW',
      trendPct: null,
      recentAvg,
      previousAvg,
      recentMonths: recent.length,
      previousMonths: previous.length,
      labelMn: LABELS.NEW,
    };
  }

  const trendPct = ((recentAvg - previousAvg) / Math.abs(previousAvg)) * 100;

  let trend: SalesTrend = 'STABLE';
  if (trendPct >= PARAMS.salesTrendGrowingPct) trend = 'GROWING';
  else if (trendPct <= PARAMS.salesTrendDecliningPct) trend = 'DECLINING';

  return {
    trend,
    trendPct,
    recentAvg,
    previousAvg,
    recentMonths: recent.length,
    previousMonths: previous.length,
    labelMn: LABELS[trend],
  };
}
