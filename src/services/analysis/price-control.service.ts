/**
 * Purchase price control orchestration.
 *
 * ⚠️ Математик ЭНД БАЙХГҮЙ — бүгд `src/analytics/pricing/`-д.
 *
 * ⚠️ ГҮЙЦЭТГЭЛ: худалдан авалтын нэгтгэл PostgreSQL дээр `groupBy`-аар.
 *    Түүхий гүйлгээ Node/браузер руу татагдахгүй.
 *
 * ⚠️ ХЭМЖЭЭСТ: default нь SUPPLIER. Шаардлагад «channel» гэж заасан ч эх
 *    өгөгдөлд суваг байхгүй бөгөөд бодит үнийн зөрүү нийлүүлэгчээр үүсдэг
 *    (нийлүүлэгчээр median 19.25%, байршлаар 0.00%). docs/08 §A үзнэ үү.
 */

import { prisma } from '../../lib/prisma';
import {
  buildBenchmark,
  defaultPriceDimension,
  type PriceBenchmark,
  type PriceDimension,
  type PurchaseLine,
} from '../../analytics/pricing/purchase-price-control';
import { assessMarginRisk, REVENUE_MISSING_REASON } from '../../analytics/pricing/margin';
import { getLatestRun } from './abc-xyz.service';

const INSERT_CHUNK = 500;

export class PriceControlError extends Error {}

export interface PriceControlOptions {
  runId?: string;
  dimension?: PriceDimension;
  triggeredBy?: string;
}

export interface PriceControlSummary {
  runId: string;
  calculationMonth: string;
  periodsUsed: string[];
  dimension: PriceDimension;
  productsWithPurchases: number;
  benchmarkedProducts: number;
  multiSourceProducts: number;
  excludedProducts: number;
  totalPotentialSaving: number;
  marginRiskProducts: number;
  gapSeverityCounts: Record<string, number>;
  priceIncreaseCounts: Record<string, number>;
  /** ⚠️ §7 — орлого байхгүй тул үргэлж null */
  grossMarginAvailable: boolean;
  grossMarginUnavailableReason: string | null;
}

/** Хэмжээстийн түлхүүрийг сонгох талбар */
function dimensionColumn(dimension: PriceDimension): 'supplier' | 'location' {
  // CHANNEL нь эх өгөгдөлд байхгүй — Location.channel-ээр дамжина
  return dimension === 'SUPPLIER' ? 'supplier' : 'location';
}

export async function runPriceControl(
  options: PriceControlOptions = {},
): Promise<PriceControlSummary> {
  const dimension = options.dimension ?? defaultPriceDimension();

  const run = options.runId
    ? await prisma.analysisRun.findUnique({ where: { id: options.runId } })
    : await getLatestRun();

  if (!run) {
    throw new PriceControlError(
      'Амжилттай дууссан тооцоолол олдсонгүй. Эхлээд ABC-XYZ гүйлт хийнэ үү.',
    );
  }

  // ── Нэгтгэл: (бүтээгдэхүүн × хэмжээст × сар) ──
  const groupBy =
    dimensionColumn(dimension) === 'supplier'
      ? (['productId', 'supplierId', 'periodKey'] as const)
      : (['productId', 'locationId', 'periodKey'] as const);

  const rows = await prisma.purchaseFact.groupBy({
    by: groupBy as unknown as ['productId', 'periodKey'],
    where: { periodKey: { in: run.periodsUsed } },
    _sum: { quantity: true, amountExVat: true },
  });

  if (rows.length === 0) {
    throw new PriceControlError(
      `${run.periodsUsed[0]} … ${run.periodsUsed[run.periodsUsed.length - 1]} ` +
        'хугацаанд худалдан авалтын өгөгдөл олдсонгүй.',
    );
  }

  // Хэмжээстийн код болон бүтээгдэхүүний нэрийг татах
  const productIds = Array.from(new Set(rows.map((r) => r.productId)));
  const [products, suppliers, locations] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, productCode: true, name: true },
    }),
    prisma.supplier.findMany({ select: { id: true, code: true } }),
    prisma.location.findMany({ select: { id: true, code: true } }),
  ]);

  const productById = new Map(products.map((p) => [p.id, p]));
  const supplierCodeById = new Map(suppliers.map((s) => [s.id, s.code]));
  const locationCodeById = new Map(locations.map((l) => [l.id, l.code]));

  const linesByProduct = new Map<string, PurchaseLine[]>();
  let skippedMissingDimension = 0;

  for (const row of rows) {
    const product = productById.get(row.productId);
    if (!product) continue;

    const raw = row as unknown as {
      supplierId?: string | null;
      locationId?: string | null;
      periodKey: string;
      _sum: { quantity: unknown; amountExVat: unknown };
    };

    const dimensionKey =
      dimensionColumn(dimension) === 'supplier'
        ? raw.supplierId
          ? (supplierCodeById.get(raw.supplierId) ?? null)
          : null
        : raw.locationId
          ? (locationCodeById.get(raw.locationId) ?? null)
          : null;

    // ⚠️ Хэмжээстийн утга байхгүй мөрийг ЧИМЭЭГҮЙ оруулахгүй
    if (!dimensionKey) {
      skippedMissingDimension += 1;
      continue;
    }

    const list = linesByProduct.get(product.productCode) ?? [];
    list.push({
      productCode: product.productCode,
      productName: product.name,
      dimensionKey,
      periodKey: raw.periodKey,
      quantity: Number(raw._sum.quantity ?? 0),
      amount: Number(raw._sum.amountExVat ?? 0),
    });
    linesByProduct.set(product.productCode, list);
  }

  const productIdByCode = new Map(products.map((p) => [p.productCode, p.id]));
  const nameByCode = new Map(products.map((p) => [p.productCode, p.name]));

  // ── Engine ──
  const benchmarks: PriceBenchmark[] = [];
  for (const [productCode, lines] of linesByProduct) {
    benchmarks.push(
      buildBenchmark(productCode, nameByCode.get(productCode) ?? null, lines, dimension),
    );
  }

  // ── Хадгалалт (idempotent) ──
  await prisma.purchasePriceBenchmark.deleteMany({ where: { runId: run.id } });

  const gapSeverityCounts: Record<string, number> = {};
  const priceIncreaseCounts: Record<string, number> = {};
  let totalPotentialSaving = 0;
  let marginRiskProducts = 0;
  let benchmarked = 0;
  let multiSource = 0;
  let excluded = 0;

  for (let i = 0; i < benchmarks.length; i += INSERT_CHUNK) {
    const chunk = benchmarks.slice(i, i + INSERT_CHUNK);

    for (const bench of chunk) {
      const productId = productIdByCode.get(bench.productCode);
      if (!productId) continue;

      const risk = assessMarginRisk({
        priceGapPct: bench.priceGapPct,
        priceChangePct: bench.priceChangePct,
        cogsValue: bench.totalCost,
        potentialSaving: bench.potentialSaving,
      });

      if (bench.excludedReason !== null) excluded += 1;
      else {
        benchmarked += 1;
        if (bench.sourceCount > 1) multiSource += 1;
        totalPotentialSaving += bench.potentialSaving ?? 0;
        if (bench.gapSeverity) {
          gapSeverityCounts[bench.gapSeverity] = (gapSeverityCounts[bench.gapSeverity] ?? 0) + 1;
        }
        if (bench.priceIncreaseSeverity) {
          priceIncreaseCounts[bench.priceIncreaseSeverity] =
            (priceIncreaseCounts[bench.priceIncreaseSeverity] ?? 0) + 1;
        }
      }
      if (risk.isAtRisk) marginRiskProducts += 1;

      await prisma.purchasePriceBenchmark.create({
        data: {
          runId: run.id,
          productId,
          productCode: bench.productCode,
          productName: bench.productName,
          dimension,
          sourceCount: bench.sourceCount,
          minUnitPrice: bench.minUnitPrice,
          maxUnitPrice: bench.maxUnitPrice,
          minSourceKey: bench.minSourceKey,
          maxSourceKey: bench.maxSourceKey,
          priceGap: bench.priceGap,
          priceGapPct: bench.priceGapPct,
          gapSeverity: bench.gapSeverity,
          totalQuantity: bench.totalQuantity,
          totalCost: bench.totalCost,
          weightedAvgUnitPrice: bench.weightedAvgUnitPrice,
          currentQuantity: bench.currentQuantity,
          currentCost: bench.currentCost,
          potentialSaving: bench.potentialSaving,
          firstPeriod: bench.firstPeriod,
          lastPeriod: bench.lastPeriod,
          firstUnitPrice: bench.firstUnitPrice,
          lastUnitPrice: bench.lastUnitPrice,
          priceChangePct: bench.priceChangePct,
          priceIncreaseSeverity: bench.priceIncreaseSeverity,
          marginAtRisk: risk.isAtRisk,
          marginRiskReasons: risk.reasons,
          excludedReason: bench.excludedReason,
          points: {
            create: bench.points.map((point) => ({
              dimensionKey: point.dimensionKey,
              lastPurchasePeriod: point.lastPurchasePeriod,
              quantity: point.quantity,
              amount: point.amount,
              unitPrice: point.unitPrice,
              lowestRank: point.lowestRank,
              highestRank: point.highestRank,
            })),
          },
        },
      });
    }
  }

  await prisma.auditLog.create({
    data: {
      action: 'PRICE_CONTROL_RUN',
      entityType: 'AnalysisRun',
      entityId: run.id,
      actor: options.triggeredBy ?? null,
      metadata: {
        dimension,
        benchmarked,
        multiSource,
        excluded,
        totalPotentialSaving,
        skippedMissingDimension,
      },
    },
  });

  return {
    runId: run.id,
    calculationMonth: run.calculationMonth,
    periodsUsed: run.periodsUsed,
    dimension,
    productsWithPurchases: linesByProduct.size,
    benchmarkedProducts: benchmarked,
    multiSourceProducts: multiSource,
    excludedProducts: excluded,
    totalPotentialSaving,
    marginRiskProducts,
    gapSeverityCounts,
    priceIncreaseCounts,
    // ⚠️ §7 — эх өгөгдөлд орлого байхгүй
    grossMarginAvailable: false,
    grossMarginUnavailableReason: REVENUE_MISSING_REASON,
  };
}

// ─────────────────────────────────────────────────────────────
// Уншилт (UI-д — БЭЛЭН нэгтгэл)
// ─────────────────────────────────────────────────────────────

export interface PriceQuery {
  runId?: string;
  gapSeverity?: string;
  marginAtRisk?: boolean;
  multiSourceOnly?: boolean;
  search?: string;
  take?: number;
  skip?: number;
}

export async function getPriceBenchmarks(query: PriceQuery = {}) {
  const run = query.runId
    ? await prisma.analysisRun.findUnique({ where: { id: query.runId } })
    : await getLatestRun();
  if (!run) return null;

  const count = await prisma.purchasePriceBenchmark.count({ where: { runId: run.id } });
  if (count === 0) return null;

  const take = Math.min(query.take ?? 50, 500);
  const skip = query.skip ?? 0;

  const where = {
    runId: run.id,
    ...(query.gapSeverity ? { gapSeverity: query.gapSeverity } : {}),
    ...(query.marginAtRisk !== undefined ? { marginAtRisk: query.marginAtRisk } : {}),
    ...(query.multiSourceOnly ? { sourceCount: { gt: 1 } } : {}),
    ...(query.search
      ? {
          OR: [
            { productCode: { contains: query.search, mode: 'insensitive' as const } },
            { productName: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [total, rows, totals] = await Promise.all([
    prisma.purchasePriceBenchmark.count({ where }),
    prisma.purchasePriceBenchmark.findMany({
      where,
      orderBy: [{ potentialSaving: 'desc' }, { productCode: 'asc' }],
      take,
      skip,
      include: { points: { orderBy: { lowestRank: 'asc' } } },
    }),
    prisma.purchasePriceBenchmark.aggregate({
      where: { runId: run.id },
      _sum: { potentialSaving: true },
      _count: { _all: true },
    }),
  ]);

  return {
    run: {
      id: run.id,
      calculationMonth: run.calculationMonth,
      periodsUsed: run.periodsUsed,
    },
    totals: {
      potentialSaving: Number(totals._sum.potentialSaving ?? 0),
      products: totals._count._all,
    },
    // ⚠️ §7 — орлого байхгүй тул маржин тооцогдохгүй
    grossMargin: {
      available: false,
      reason: REVENUE_MISSING_REASON,
    },
    total,
    take,
    skip,
    rows: rows.map((r) => ({
      productCode: r.productCode,
      productName: r.productName,
      dimension: r.dimension,
      sourceCount: r.sourceCount,
      minUnitPrice: r.minUnitPrice === null ? null : Number(r.minUnitPrice),
      maxUnitPrice: r.maxUnitPrice === null ? null : Number(r.maxUnitPrice),
      minSourceKey: r.minSourceKey,
      maxSourceKey: r.maxSourceKey,
      priceGap: r.priceGap === null ? null : Number(r.priceGap),
      priceGapPct: r.priceGapPct === null ? null : Number(r.priceGapPct),
      gapSeverity: r.gapSeverity,
      totalQuantity: Number(r.totalQuantity),
      totalCost: Number(r.totalCost),
      currentQuantity: Number(r.currentQuantity),
      currentCost: Number(r.currentCost),
      weightedAvgUnitPrice:
        r.weightedAvgUnitPrice === null ? null : Number(r.weightedAvgUnitPrice),
      potentialSaving: r.potentialSaving === null ? null : Number(r.potentialSaving),
      firstPeriod: r.firstPeriod,
      lastPeriod: r.lastPeriod,
      priceChangePct: r.priceChangePct === null ? null : Number(r.priceChangePct),
      priceIncreaseSeverity: r.priceIncreaseSeverity,
      marginAtRisk: r.marginAtRisk,
      marginRiskReasons: r.marginRiskReasons,
      excludedReason: r.excludedReason,
      points: r.points.map((p) => ({
        dimensionKey: p.dimensionKey,
        lastPurchasePeriod: p.lastPurchasePeriod,
        quantity: Number(p.quantity),
        amount: Number(p.amount),
        unitPrice: Number(p.unitPrice),
        lowestRank: p.lowestRank,
        highestRank: p.highestRank,
      })),
    })),
  };
}
