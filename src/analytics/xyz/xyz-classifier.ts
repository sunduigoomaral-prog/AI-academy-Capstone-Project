/**
 * XYZ ANALYSIS — ЦЭВЭР ФУНКЦ.
 *
 * Суурь: **SALES QUANTITY (тоо хэмжээ)**, calculation month-оос өмнөх
 * бүтэн саруудаар.
 *
 * Алгоритм:
 *   1. SKU бүрийн сар тус бүрийн тоо хэмжээ (борлуулалтгүй сар = 0)
 *   2. average = Σ monthlyQty / САРЫН ТОО
 *      ⚠️ Хуваарь нь "борлуулалттай сарын тоо" БИШ, бүтэн саруудын БҮХ тоо.
 *   3. stdDev  = population standard deviation (STDEV.P)
 *   4. CV      = stdDev / |average|
 *   5. X: CV <= xThreshold
 *      Y: xThreshold < CV <= yThreshold
 *      Z: CV > yThreshold
 *
 * Тусгай дүрэм:
 *   average = 0  →  CV = null, XYZ = **Z**, inventoryStatus = **NO_MOVEMENT**
 *                   ("Хөдөлгөөнгүй")
 */

import { coefficientOfVariation, mean, populationStdDev } from '../statistics';
import type { XyzClass, XyzInputItem, XyzOutputItem } from '../../types/domain';

export interface XyzThresholds {
  /** X ангиллын дээд хязгаар, жишээ 0.25 */
  x: number;
  /** Y ангиллын дээд хязгаар, жишээ 0.50 */
  y: number;
}

export function assertValidXyzThresholds(t: XyzThresholds): void {
  if (!(t.x > 0 && t.x < t.y)) {
    throw new Error(`XYZ threshold буруу: 0 < X(${t.x}) < Y(${t.y}) байх ёстой`);
  }
}

function classOf(cv: number, t: XyzThresholds): XyzClass {
  if (cv <= t.x) return 'X';
  if (cv <= t.y) return 'Y';
  return 'Z';
}

/** Нэг SKU-гийн XYZ тооцоо */
export function classifyOneXyz(item: XyzInputItem, thresholds: XyzThresholds): XyzOutputItem {
  assertValidXyzThresholds(thresholds);

  const monthlyQty = [...item.monthlyQty];
  const averageMonthlyQty = mean(monthlyQty);
  const stdDev = populationStdDev(monthlyQty);
  const monthsWithSales = monthlyQty.filter((q) => q !== 0).length;

  // ⚠️ Дундаж = 0 → хөдөлгөөнгүй. CV тодорхойлогдохгүй, ангилал Z.
  if (averageMonthlyQty === 0) {
    return {
      productCode: item.productCode,
      monthlyQty,
      averageMonthlyQty: 0,
      stdDev,
      cv: null,
      xyzClass: 'Z',
      inventoryStatus: 'NO_MOVEMENT',
      monthsWithSales,
    };
  }

  const cv = coefficientOfVariation(monthlyQty);
  // averageMonthlyQty !== 0 тул cv нь заавал тоо байна
  const cvValue = cv ?? 0;

  return {
    productCode: item.productCode,
    monthlyQty,
    averageMonthlyQty,
    stdDev,
    cv: cvValue,
    xyzClass: classOf(cvValue, thresholds),
    inventoryStatus: 'ACTIVE',
    monthsWithSales,
  };
}

export function classifyXyz(
  items: readonly XyzInputItem[],
  thresholds: XyzThresholds,
): XyzOutputItem[] {
  assertValidXyzThresholds(thresholds);
  return items.map((item) => classifyOneXyz(item, thresholds));
}
