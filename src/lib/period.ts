/**
 * Calculation Month логик.
 *
 * ДҮРЭМ (бизнесийн шаардлага):
 *   Calculation Month = 2026-06 бол
 *   → хамгийн сүүлд ашиглах борлуулалтын сар = 2026-05
 *   → Calculation Month ӨӨРӨӨ дундаж борлуулалтын тооцоонд ОРОХГҮЙ
 *   → default lookback = 6 бүтэн сар → 2025-12 … 2026-05
 *
 * Эх өгөгдөлд огнооны багана байхгүй (зөвхөн `Он` + `Сар`) тул
 * бүх хугацааны логик "YYYY-MM" түлхүүр дээр ажиллана — Date объект ашиглахгүй.
 */

import type { Period, PeriodKey } from '../types/domain';

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isPeriodKey(value: string): boolean {
  return PERIOD_RE.test(value);
}

export function parsePeriodKey(key: PeriodKey): Period {
  const m = PERIOD_RE.exec(key);
  if (!m) {
    throw new Error(`Буруу period key: "${key}". "YYYY-MM" хэлбэртэй байх ёстой.`);
  }
  return { year: Number(m[1]), month: Number(m[2]), key };
}

export function toPeriodKey(year: number, month: number): PeriodKey {
  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
    throw new Error(`Буруу он: ${year}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Буруу сар: ${month}`);
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Сарын түлхүүрийг offset сараар шилжүүлнэ (сөрөг = буцаж) */
export function shiftPeriod(key: PeriodKey, offsetMonths: number): PeriodKey {
  const { year, month } = parsePeriodKey(key);
  const total = year * 12 + (month - 1) + offsetMonths;
  return toPeriodKey(Math.floor(total / 12), (total % 12) + 1);
}

/** Тооцооллын сарын өмнөх сар — дундажид ашиглах СҮҮЛИЙН сар */
export function lastCompletedPeriod(calculationMonth: PeriodKey): PeriodKey {
  return shiftPeriod(calculationMonth, -1);
}

/**
 * Дундаж борлуулалт тооцоход ашиглах бүтэн саруудын жагсаалт.
 * Хамгийн эртнээс хамгийн сүүлийн сар руу эрэмбэлэгдсэн.
 * Calculation month ӨӨРӨӨ буцаах жагсаалтад ОРОХГҮЙ.
 *
 * @example lookbackPeriods('2026-06', 6)
 *   → ['2025-12','2026-01','2026-02','2026-03','2026-04','2026-05']
 */
export function lookbackPeriods(
  calculationMonth: PeriodKey,
  lookbackMonths: number,
): PeriodKey[] {
  if (!Number.isInteger(lookbackMonths) || lookbackMonths < 1) {
    throw new Error(`lookbackMonths нь 1-ээс их бүхэл тоо байх ёстой: ${lookbackMonths}`);
  }
  const periods: PeriodKey[] = [];
  for (let i = lookbackMonths; i >= 1; i--) {
    periods.push(shiftPeriod(calculationMonth, -i));
  }
  return periods;
}

/** a < b бол сөрөг, тэнцүү бол 0, a > b бол эерэг */
export function comparePeriods(a: PeriodKey, b: PeriodKey): number {
  const pa = parsePeriodKey(a);
  const pb = parsePeriodKey(b);
  return pa.year * 12 + pa.month - (pb.year * 12 + pb.month);
}

/** `from`-оос `to` хүртэлх бүх сар (хоёул багтана) */
export function periodRange(from: PeriodKey, to: PeriodKey): PeriodKey[] {
  if (comparePeriods(from, to) > 0) {
    throw new Error(`from (${from}) нь to (${to})-оос хойш байж болохгүй`);
  }
  const out: PeriodKey[] = [];
  let cur = from;
  while (comparePeriods(cur, to) <= 0) {
    out.push(cur);
    cur = shiftPeriod(cur, 1);
  }
  return out;
}

/**
 * Хүсэж буй lookback саруудын аль нь өгөгдөлд байхгүйг тодорхойлно.
 * Дутуу сарыг ЧИМЭЭГҮЙ 0 болгож ОРЛУУЛАХГҮЙ — дуудагч тал шийднэ.
 */
export function missingPeriods(
  required: PeriodKey[],
  available: Iterable<PeriodKey>,
): PeriodKey[] {
  const set = new Set(available);
  return required.filter((p) => !set.has(p));
}
