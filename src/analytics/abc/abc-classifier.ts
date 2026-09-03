/**
 * ABC ANALYSIS — ЦЭВЭР ФУНКЦ (DB, React, тохиргоо шууд уншихгүй).
 *
 * Суурь: **SALES VALUE (мөнгөн дүн)**. ⚠️ Тоо хэмжээгээр ABC хийхгүй.
 *
 * Алгоритм:
 *   1. SKU бүрийн calculation period дахь нийт борлуулалтын дүнг авна
 *   2. Ихээс бага руу эрэмбэлнэ
 *   3. share       = salesValue / нийт salesValue
 *   4. cumulative  = running cumulative (тухайн SKU-г ОРУУЛААД)
 *   5. A: cumulative <= aThreshold
 *      B: aThreshold < cumulative <= bThreshold
 *      C: cumulative > bThreshold
 *
 * Threshold-ууд ПАРАМЕТРЭЭР ирнэ — энд hardcode байхгүй.
 */

import type { AbcClass, AbcInputItem, AbcOutputItem } from '../../types/domain';

export interface AbcThresholds {
  /** A ангиллын дээд хязгаар, жишээ 0.70 */
  a: number;
  /** B ангиллын дээд хязгаар, жишээ 0.90 */
  b: number;
}

export function assertValidAbcThresholds(t: AbcThresholds): void {
  if (!(t.a > 0 && t.a < t.b && t.b < 1)) {
    throw new Error(`ABC threshold буруу: 0 < A(${t.a}) < B(${t.b}) < 1 байх ёстой`);
  }
}

function classOf(cumulativeShare: number, t: AbcThresholds): AbcClass {
  if (cumulativeShare <= t.a) return 'A';
  if (cumulativeShare <= t.b) return 'B';
  return 'C';
}

/**
 * SKU-уудыг ABC ангилалд хуваана.
 *
 * Эрэмбийн тогтвортой байдал: дүн тэнцвэл `productCode`-оор өсөхөөр эрэмбэлнэ,
 * ингэснээр ижил өгөгдөл дээр үр дүн ҮРГЭЛЖ давтагдана.
 *
 * Хязгаарын тохиолдлууд:
 *   • Нийт дүн <= 0 (борлуулалт огт байхгүй, эсвэл буцаалт давсан)
 *     → бүх SKU **C**, share = 0. (Тэглэвэл cumulative 0 болж бүгд A болох
 *       утгагүй үр дүн гарна — тиймээс зориуд C.)
 *   • Сөрөг дүнтэй SKU (цэвэр буцаалт) эрэмбийн ХАМГИЙН СҮҮЛД орж C болно.
 */
export function classifyAbc(
  items: readonly AbcInputItem[],
  thresholds: AbcThresholds,
): AbcOutputItem[] {
  assertValidAbcThresholds(thresholds);

  const sorted = [...items].sort((left, right) => {
    if (right.salesValue !== left.salesValue) return right.salesValue - left.salesValue;
    return left.productCode.localeCompare(right.productCode);
  });

  const total = sorted.reduce((acc, item) => acc + item.salesValue, 0);

  if (!(total > 0)) {
    return sorted.map((item, index) => ({
      productCode: item.productCode,
      salesValue: item.salesValue,
      salesShare: 0,
      cumulativeShare: 0,
      abcClass: 'C' as const,
      rank: index + 1,
    }));
  }

  let running = 0;
  return sorted.map((item, index) => {
    const salesShare = item.salesValue / total;
    running += salesShare;
    // Сүүлийн SKU дээр хөвөгч таслалын алдаанаас 1.0000000002 гарахаас сэргийлнэ
    const cumulativeShare = index === sorted.length - 1 ? Math.min(running, 1) : running;

    return {
      productCode: item.productCode,
      salesValue: item.salesValue,
      salesShare,
      cumulativeShare,
      abcClass: classOf(cumulativeShare, thresholds),
      rank: index + 1,
    };
  });
}
