/**
 * STOCK BALANCE — ЦЭВЭР ФУНКЦҮҮД (DB, React, тохиргоо шууд уншихгүй).
 *
 * Томьёонууд (Phase 4 §3–§9):
 *
 *   Target Months      = Target Days / daysPerMonth
 *   Recommended Stock  = Average Monthly Sales × Target Months
 *   Current Stock Days = (Current Stock / Average Monthly Sales) × daysPerMonth
 *   Shortage           = MAX(Recommended − Current, 0)
 *   Excess             = MAX(Current − Recommended, 0)
 *
 * ⚠️ Average Monthly Sales = 0 үед Current Stock Days = **0** (§7).
 *    Математикийн хувьд энэ нь хязгааргүй байх ёстой ч шаардлага зориудаар
 *    0 гэж заасан бөгөөд төлөв нь "Хөдөлгөөнгүй" болно. Хязгааргүй утга нь
 *    "хэт их нөөцтэй" дүрмийг буруу асаах байсан.
 */

import type { StockBalance } from '../../types/domain';

export interface BalanceInput {
  averageMonthlySales: number;
  currentStock: number;
  targetDays: number;
  daysPerMonth: number;
}

export function targetMonths(targetDays: number, daysPerMonth: number): number {
  if (!(daysPerMonth > 0)) {
    throw new Error(`daysPerMonth 0-ээс их байх ёстой: ${daysPerMonth}`);
  }
  return targetDays / daysPerMonth;
}

export function recommendedStock(
  averageMonthlySales: number,
  targetDaysValue: number,
  daysPerMonth: number,
): number {
  return averageMonthlySales * targetMonths(targetDaysValue, daysPerMonth);
}

export function currentStockDays(
  currentStock: number,
  averageMonthlySales: number,
  daysPerMonth: number,
): number {
  // §7 — дундаж борлуулалт 0 бол тодорхойлолтоор 0
  if (averageMonthlySales === 0) return 0;
  return (currentStock / averageMonthlySales) * daysPerMonth;
}

export function computeBalance(input: BalanceInput): StockBalance {
  const { averageMonthlySales, currentStock, targetDays, daysPerMonth } = input;

  if (targetDays < 0) {
    throw new Error(`targetDays сөрөг байж болохгүй: ${targetDays}`);
  }

  const months = targetMonths(targetDays, daysPerMonth);
  const recommended = averageMonthlySales * months;

  return {
    targetDays,
    targetMonths: months,
    recommendedStock: recommended,
    currentStock,
    currentStockDays: currentStockDays(currentStock, averageMonthlySales, daysPerMonth),
    shortage: Math.max(recommended - currentStock, 0),
    excess: Math.max(currentStock - recommended, 0),
  };
}

/**
 * §10 — Худалдан авалт / шилжүүлгийн тоо БУТАРХАЙ БАЙЖ БОЛОХГҮЙ.
 * CEILING ашиглана: 125.4 → 126.
 *
 * Хөвөгч таслалын үлдэгдэл чимээг (жишээ нь 126.00000000000001) эхлээд
 * 9 орны нарийвчлалаар цэвэрлэнэ — эс тэгвэл 126 нь 127 болно.
 */
export function ceilQty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const cleaned = Math.round(value * 1e9) / 1e9;
  return Math.max(0, Math.ceil(cleaned));
}

/** Эх үүсвэрийн боломжоос ХЭТРҮҮЛЭХГҮЙ бүхэл тоо (шилжүүлгийн хязгаар) */
export function floorQty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const cleaned = Math.round(value * 1e9) / 1e9;
  return Math.max(0, Math.floor(cleaned));
}

/**
 * §13 — Шинээр худалдан авах тоо.
 *   CEILING(Recommended − Current − TransferIn), үр дүн <= 0 бол 0.
 */
export function newPurchaseQty(
  recommended: number,
  currentStock: number,
  transferInQty: number,
): number {
  return ceilQty(recommended - currentStock - transferInQty);
}
