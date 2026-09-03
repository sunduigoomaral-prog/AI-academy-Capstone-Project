/**
 * §23, §24 — Бүтээгдэхүүний дэлгэрэнгүй.
 *
 * ⚠️ Тооцоолол ЭНД ХИЙГДЭХГҮЙ — бүх метрик БЭЛЭН хүснэгтүүдээс уншигдана
 *    (`abc_xyz_result`, `analysis_result`, `purchase_price_benchmark`,
 *     `ai_recommendation`).
 *
 * ⚠️ §28 — эх өгөгдөлд байхгүй утга (Gross Margin) null + шалтгаантай.
 */

import { prisma } from '../../lib/prisma';
import { REVENUE_MISSING_REASON } from '../../analytics/pricing/margin';
import { getLatestRun } from '../analysis/abc-xyz.service';

export async function getProductDetail(productCode: string, runId?: string) {
  const run = runId
    ? await prisma.analysisRun.findUnique({ where: { id: runId } })
    : await getLatestRun();
  if (!run) return null;

  const product = await prisma.product.findUnique({
    where: { productCode },
    select: {
      productCode: true,
      name: true,
      manufacturerName: true,
      exclusivity: true,
      atcCode: true,
      packSize: true,
    },
  });
  if (!product) return null;

  const [abc, positions, benchmark, recommendations, sales, purchases, stock] = await Promise.all([
    prisma.abcXyzResult.findFirst({ where: { runId: run.id, productCode } }),
    prisma.analysisResult.findMany({
      where: { runId: run.id, productCode },
      include: { location: { select: { code: true, type: true } } },
      orderBy: { locationId: 'asc' },
    }),
    prisma.purchasePriceBenchmark.findFirst({
      where: { runId: run.id, productCode },
      include: { points: { orderBy: { lowestRank: 'asc' } } },
    }),
    prisma.aIRecommendation.findMany({
      where: { runId: run.id, productCode },
      orderBy: [{ priority: 'asc' }],
      take: 10,
    }),
    // §24 — сарын борлуулалт
    prisma.salesFact.groupBy({
      by: ['periodKey'],
      where: { periodKey: { in: run.periodsUsed }, product: { productCode } },
      _sum: { quantity: true, cogsAmount: true },
    }),
    // §24 — сарын худалдан авалт
    prisma.purchaseFact.groupBy({
      by: ['periodKey'],
      where: { periodKey: { in: run.periodsUsed }, product: { productCode } },
      _sum: { quantity: true, amountExVat: true },
    }),
    prisma.stockSnapshot.groupBy({
      by: ['periodKey'],
      where: { product: { productCode } },
      _sum: { quantityOnHand: true, stockValue: true },
    }),
  ]);

  if (!abc) return null;

  const totals = positions.reduce(
    (acc, p) => ({
      currentStock: acc.currentStock + Number(p.currentStock),
      recommendedStock: acc.recommendedStock + Number(p.recommendedStock),
      shortage: acc.shortage + Number(p.shortage),
      excess: acc.excess + Number(p.excess),
      transferInQty: acc.transferInQty + p.transferInQty,
      newPurchaseQty: acc.newPurchaseQty + p.newPurchaseQty,
      averageMonthlySales: acc.averageMonthlySales + Number(p.averageMonthlySales),
    }),
    {
      currentStock: 0,
      recommendedStock: 0,
      shortage: 0,
      excess: 0,
      transferInQty: 0,
      newPurchaseQty: 0,
      averageMonthlySales: 0,
    },
  );

  return {
    run: { id: run.id, calculationMonth: run.calculationMonth, periodsUsed: run.periodsUsed },

    // §23 header
    header: {
      productCode: product.productCode,
      productName: product.name,
      manufacturer: product.manufacturerName,
      category: product.exclusivity,
      atcCode: product.atcCode,
      packSize: product.packSize,
    },

    // §23 ангилал
    classification: {
      abc: abc.abcClass,
      xyz: abc.xyzClass,
      abcXyz: abc.abcXyz,
      salesValue: Number(abc.salesValue),
      salesShare: Number(abc.salesShare),
      cumulativeShare: Number(abc.cumulativeShare),
      rank: abc.rank,
      averageMonthlyQty: Number(abc.averageMonthlyQty),
      stdDev: Number(abc.stdDev),
      cv: abc.cv === null ? null : Number(abc.cv),
      monthsWithSales: abc.monthsWithSales,
      inventoryStatus: abc.inventoryStatus,
    },

    // §23 нөөцийн нэгтгэл + байршил тус бүрээр
    inventory: {
      totals,
      byLocation: positions.map((p) => ({
        locationCode: p.location.code,
        locationType: p.location.type,
        averageMonthlySales: Number(p.averageMonthlySales),
        targetDays: p.targetDays,
        targetMonths: Number(p.targetMonths),
        recommendedStock: Number(p.recommendedStock),
        currentStock: Number(p.currentStock),
        currentStockDays: Number(p.currentStockDays),
        shortage: Number(p.shortage),
        excess: Number(p.excess),
        stockStatus: p.stockStatus,
        transferInQty: p.transferInQty,
        transferOutQty: p.transferOutQty,
        newPurchaseQty: p.newPurchaseQty,
        decision: p.decision,
      })),
    },

    // §23 үнэ
    price: benchmark
      ? {
          dimension: benchmark.dimension,
          sourceCount: benchmark.sourceCount,
          minUnitPrice:
            benchmark.minUnitPrice === null ? null : Number(benchmark.minUnitPrice),
          maxUnitPrice:
            benchmark.maxUnitPrice === null ? null : Number(benchmark.maxUnitPrice),
          minSourceKey: benchmark.minSourceKey,
          maxSourceKey: benchmark.maxSourceKey,
          priceGap: benchmark.priceGap === null ? null : Number(benchmark.priceGap),
          priceGapPct: benchmark.priceGapPct === null ? null : Number(benchmark.priceGapPct),
          gapSeverity: benchmark.gapSeverity,
          potentialSaving:
            benchmark.potentialSaving === null ? null : Number(benchmark.potentialSaving),
          priceChangePct:
            benchmark.priceChangePct === null ? null : Number(benchmark.priceChangePct),
          marginAtRisk: benchmark.marginAtRisk,
          marginRiskReasons: benchmark.marginRiskReasons,
          points: benchmark.points.map((p) => ({
            dimensionKey: p.dimensionKey,
            lastPurchasePeriod: p.lastPurchasePeriod,
            quantity: Number(p.quantity),
            amount: Number(p.amount),
            unitPrice: Number(p.unitPrice),
            lowestRank: p.lowestRank,
            highestRank: p.highestRank,
          })),
        }
      : null,

    // ⚠️ §28 — эх өгөгдөлд орлого байхгүй
    margin: {
      salesPrice: null,
      grossProfit: null,
      grossMarginPct: null,
      unavailableReason: REVENUE_MISSING_REASON,
    },

    // §23 AI
    aiRecommendations: recommendations.map((r) => ({
      id: r.id,
      locationCode: r.locationCode,
      risk: r.risk,
      priority: r.priority,
      why: r.reason,
      impact: r.impact,
      action: r.recommendedAction,
      recommendedQuantity: r.recommendedQuantity,
      status: r.status,
    })),

    // §24 графикууд
    charts: {
      periods: run.periodsUsed,
      monthlySales: run.periodsUsed.map((period) => {
        const row = sales.find((s) => s.periodKey === period);
        return {
          period,
          quantity: Number(row?._sum.quantity ?? 0),
          value: Number(row?._sum.cogsAmount ?? 0),
        };
      }),
      monthlyPurchase: run.periodsUsed.map((period) => {
        const row = purchases.find((s) => s.periodKey === period);
        return {
          period,
          quantity: Number(row?._sum.quantity ?? 0),
          value: Number(row?._sum.amountExVat ?? 0),
        };
      }),
      // ⚠️ Эх өгөгдөлд зөвхөн НЭГ сарын үлдэгдлийн snapshot байгаа
      stockSnapshots: stock.map((s) => ({
        period: s.periodKey,
        quantity: Number(s._sum.quantityOnHand ?? 0),
        value: Number(s._sum.stockValue ?? 0),
      })),
      stockTrendUnavailableReason:
        stock.length <= 1
          ? 'Нөөцийн хандлага харуулах боломжгүй — эх өгөгдөлд зөвхөн нэг сарын ' +
            'үлдэгдлийн snapshot байна. Олон сарын snapshot ачаалагдвал автоматаар гарна.'
          : null,
    },
  };
}
