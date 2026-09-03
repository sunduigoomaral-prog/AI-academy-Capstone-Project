/**
 * SKU түвшний нэгтгэл — DB давхарга.
 *
 * ⚠️ ГҮЙЦЭТГЭЛ: нэгтгэл нь PostgreSQL дээр `groupBy`-аар хийгдэнэ.
 *    Түүхий гүйлгээний мөрүүд (эх өгөгдөлд 14,300) хэзээ ч Node эсвэл
 *    браузер руу татагдахгүй — зөвхөн SKU × сар түвшний нийлбэр ирнэ.
 *
 * SKU-гийн хамрах хүрээ (universe):
 *    lookback хугацаанд борлуулалттай SKU  ∪  calculation month-д ҮЛДЭГДЭЛТЭЙ SKU
 *
 *    Хоёр дахь хэсэг нь чухал: борлуулалтгүй атлаа үлдэгдэлтэй SKU нь
 *    "Хөдөлгөөнгүй" (NO_MOVEMENT) гэж тэмдэглэгдэх ёстой. Тэднийг хасвал
 *    dead stock огт харагдахгүй болно.
 */

import { prisma } from '../../lib/prisma';
import type { PeriodKey, SalesScope } from '../../types/domain';
import type { SkuAggregate } from '../../analytics/abc-xyz/abc-xyz-engine';

function locationFilter(scope: SalesScope) {
  if (scope === 'ALL') return {};
  return { location: { type: scope } };
}

export interface AggregationInput {
  periods: PeriodKey[];
  /** Үлдэгдлийн snapshot-ийн сар — ихэвчлэн calculation month */
  stockPeriod: PeriodKey;
  scope: SalesScope;
}

export interface AggregationResult {
  aggregates: SkuAggregate[];
  /** productCode → product.id (үр дүнг буцааж хадгалахад) */
  productIdByCode: Map<string, string>;
  /** Зөвхөн борлуулалттай SKU-гийн тоо */
  skusWithSales: number;
  /** Борлуулалтгүй атлаа үлдэгдэлтэй SKU-гийн тоо */
  skusStockOnly: number;
}

export async function aggregateSkus(input: AggregationInput): Promise<AggregationResult> {
  const { periods, stockPeriod, scope } = input;

  if (periods.length === 0) {
    throw new Error('Нэгтгэх сар байхгүй байна — lookback хоосон.');
  }

  const where = {
    periodKey: { in: periods },
    ...locationFilter(scope),
  };

  // 1) SKU × сар түвшний тоо хэмжээ (DB дээр нэгтгэгдэнэ)
  const monthlyRows = await prisma.salesFact.groupBy({
    by: ['productId', 'periodKey'],
    where,
    _sum: { quantity: true },
  });

  // 2) SKU түвшний мөнгөн дүн
  const valueRows = await prisma.salesFact.groupBy({
    by: ['productId'],
    where,
    _sum: { cogsAmount: true },
  });

  // 3) Үлдэгдэлтэй SKU-ууд (борлуулалтгүй ч гэсэн хамрагдана)
  const stockRows = await prisma.stockSnapshot.groupBy({
    by: ['productId'],
    where: { periodKey: stockPeriod },
    _sum: { quantityOnHand: true },
  });

  const salesProductIds = new Set(valueRows.map((r) => r.productId));
  const stockProductIds = new Set(stockRows.map((r) => r.productId));
  const universe = new Set([...salesProductIds, ...stockProductIds]);

  if (universe.size === 0) {
    return {
      aggregates: [],
      productIdByCode: new Map(),
      skusWithSales: 0,
      skusStockOnly: 0,
    };
  }

  const products = await prisma.product.findMany({
    where: { id: { in: Array.from(universe) } },
    select: { id: true, productCode: true, name: true },
  });

  const valueByProduct = new Map(
    valueRows.map((r) => [r.productId, Number(r._sum.cogsAmount ?? 0)]),
  );

  // productId → (periodKey → qty)
  const qtyByProduct = new Map<string, Map<string, number>>();
  for (const row of monthlyRows) {
    let byPeriod = qtyByProduct.get(row.productId);
    if (!byPeriod) {
      byPeriod = new Map();
      qtyByProduct.set(row.productId, byPeriod);
    }
    byPeriod.set(row.periodKey, Number(row._sum.quantity ?? 0));
  }

  const productIdByCode = new Map<string, string>();
  const aggregates: SkuAggregate[] = products.map((product) => {
    productIdByCode.set(product.productCode, product.id);
    const byPeriod = qtyByProduct.get(product.id);

    return {
      productCode: product.productCode,
      productName: product.name,
      salesValue: valueByProduct.get(product.id) ?? 0,
      // ⚠️ Сар бүрийг ЗААВАЛ дүүргэнэ — борлуулалтгүй сар = 0.
      //    Ингэснээр дундаж нь бүтэн саруудын тоонд хуваагдана.
      monthlyQty: periods.map((period) => byPeriod?.get(period) ?? 0),
    };
  });

  return {
    aggregates,
    productIdByCode,
    skusWithSales: salesProductIds.size,
    skusStockOnly: Array.from(stockProductIds).filter((id) => !salesProductIds.has(id)).length,
  };
}
