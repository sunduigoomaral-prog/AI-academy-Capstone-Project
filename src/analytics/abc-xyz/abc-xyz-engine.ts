/**
 * ABC-XYZ ENGINE — ЦЭВЭР ФУНКЦ.
 *
 * Оролт: SKU бүрийн нэгтгэсэн үзүүлэлт (DB-ээс service давхарга бэлдэнэ)
 * Гаралт: SKU бүрийн бүрэн ангилал + үзүүлэлтүүд
 *
 * ⚠️ Энэ модуль DB, fetch, React ашиглахгүй. Тиймээс өгөгдлийн сангүйгээр
 *    бүрэн тестлэгдэнэ.
 *
 * ⚠️ ҮНДСЭН ГАРАЛТ нь 9 хосолсон ангилал (AX…CZ). A/B/C болон X/Y/Z-г
 *    тусад нь гол үзүүлэлт болгож ашиглахгүй — дараагийн нөөцийн тооцоолол
 *    `abcXyz` дээр суурилна.
 */

import { classifyAbc, type AbcThresholds } from '../abc/abc-classifier';
import { classifyXyz, type XyzThresholds } from '../xyz/xyz-classifier';
import type {
  AbcClass,
  AbcXyzClass,
  AbcXyzRow,
  XyzClass,
} from '../../types/domain';

/** Нэг SKU-гийн нэгтгэсэн оролт */
export interface SkuAggregate {
  productCode: string;
  productName: string | null;
  /** Lookback хугацааны нийт борлуулалтын МӨНГӨН дүн (COGS-value) */
  salesValue: number;
  /**
   * Lookback сар бүрийн тоо хэмжээ, сарын дарааллаар.
   * Урт нь lookback саруудын тоотой ЯГ тэнцүү байх ёстой (борлуулалтгүй сар = 0).
   */
  monthlyQty: number[];
}

export interface AbcXyzOptions {
  abc: AbcThresholds;
  xyz: XyzThresholds;
  /** Хүлээгдэж буй сарын тоо — оролтын бүрэн бүтэн байдлыг шалгахад */
  expectedMonths: number;
}

export const ABC_XYZ_CLASSES: AbcXyzClass[] = [
  'AX', 'AY', 'AZ',
  'BX', 'BY', 'BZ',
  'CX', 'CY', 'CZ',
];

export function combineClasses(abc: AbcClass, xyz: XyzClass): AbcXyzClass {
  return `${abc}${xyz}` as AbcXyzClass;
}

/**
 * Бүрэн ABC-XYZ тооцоолол.
 *
 * Гаралт нь мөнгөн дүнгээр буурах эрэмбээр (ABC эрэмбэтэй ижил) ирнэ.
 */
export function runAbcXyz(
  aggregates: readonly SkuAggregate[],
  options: AbcXyzOptions,
): AbcXyzRow[] {
  for (const item of aggregates) {
    if (item.monthlyQty.length !== options.expectedMonths) {
      throw new Error(
        `SKU ${item.productCode}: monthlyQty урт ${item.monthlyQty.length}, ` +
          `хүлээсэн ${options.expectedMonths}. Борлуулалтгүй сарыг 0-ээр дүүргэсэн эсэхийг шалгана уу.`,
      );
    }
  }

  const abcResults = classifyAbc(
    aggregates.map((a) => ({ productCode: a.productCode, salesValue: a.salesValue })),
    options.abc,
  );

  const xyzResults = classifyXyz(
    aggregates.map((a) => ({ productCode: a.productCode, monthlyQty: a.monthlyQty })),
    options.xyz,
  );

  const xyzByCode = new Map(xyzResults.map((r) => [r.productCode, r]));
  const nameByCode = new Map(aggregates.map((a) => [a.productCode, a.productName]));

  return abcResults.map((abc) => {
    const xyz = xyzByCode.get(abc.productCode);
    if (!xyz) {
      throw new Error(`XYZ үр дүн олдсонгүй: ${abc.productCode}`);
    }

    return {
      productCode: abc.productCode,
      productName: nameByCode.get(abc.productCode) ?? null,
      abc: abc.abcClass,
      xyz: xyz.xyzClass,
      abcXyz: combineClasses(abc.abcClass, xyz.xyzClass),
      salesValue: abc.salesValue,
      salesShare: abc.salesShare,
      cumulativeShare: abc.cumulativeShare,
      monthlyQty: xyz.monthlyQty,
      averageMonthlyQty: xyz.averageMonthlyQty,
      stdDev: xyz.stdDev,
      cv: xyz.cv,
      inventoryStatus: xyz.inventoryStatus,
      monthsWithSales: xyz.monthsWithSales,
      rank: abc.rank,
    };
  });
}

export interface AbcXyzMatrixCell {
  abcXyz: AbcXyzClass;
  skuCount: number;
  salesValue: number;
  salesShare: number;
}

/** 9 нүдтэй матрицын нэгтгэл — dashboard-ийн үндсэн үзүүлэлт */
export function buildAbcXyzMatrix(rows: readonly AbcXyzRow[]): AbcXyzMatrixCell[] {
  const totalValue = rows.reduce((acc, row) => acc + row.salesValue, 0);

  return ABC_XYZ_CLASSES.map((abcXyz) => {
    const cellRows = rows.filter((row) => row.abcXyz === abcXyz);
    const salesValue = cellRows.reduce((acc, row) => acc + row.salesValue, 0);
    return {
      abcXyz,
      skuCount: cellRows.length,
      salesValue,
      salesShare: totalValue > 0 ? salesValue / totalValue : 0,
    };
  });
}
