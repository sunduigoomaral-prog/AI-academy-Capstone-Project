/**
 * Inventory optimization orchestration.
 *
 * ⚠️ Математик ЭНД БАЙХГҮЙ — бүгд `src/analytics/inventory/` болон
 *    `src/analytics/recommendation/`-д. Энэ файл зөвхөн:
 *      тохиргоо → нэгтгэл → engine → хадгалалт
 *
 * ⚠️ ГҮЙЦЭТГЭЛ: UI нь `analysis_result` хүснэгтээс БЭЛЭН үр дүн уншина.
 */

import { prisma } from '../../lib/prisma';
import { getAnalysisSettings, getInventoryPolicyMap, resolveTargetDays } from '../../config/config-service';
import { optimizeInventory } from '../../analytics/inventory/optimizer';
import { defaultStatusParams } from '../../analytics/inventory/inventory-status';
import type { DecisionType, PolicyKey, SalesScope, StockStatus } from '../../types/domain';
import { buildPositions } from './inventory-aggregation';
import { locationScope, transferWhere } from '../dashboard/dashboard.service';
import type { DashboardFilter } from '../dashboard/dashboard.service';
import { getLatestRun, parseAbcXyz, runAbcXyzAnalysis } from './abc-xyz.service';

const INSERT_CHUNK = 500;

export class InventoryError extends Error {}

export interface InventoryRunOptions {
  /** Байгаа ABC-XYZ гүйлтийг ашиглах. Өгөөгүй бол шинээр ABC-XYZ гүйлт хийнэ. */
  runId?: string;
  calculationMonth?: string;
  lookbackMonths?: number;
  scope?: SalesScope;
  /** ⚠️ Хуулийн этгээд хооронд шилжүүлэх нь бодит байдалд ХУДАЛДАХ гүйлгээ болно */
  allowCrossCompany?: boolean;
  triggeredBy?: string;
}

export interface InventoryRunSummary {
  runId: string;
  calculationMonth: string;
  periodsUsed: string[];
  scope: SalesScope;
  allowCrossCompany: boolean;
  params: { daysPerMonth: number; stockoutDaysThreshold: number; overstockFactor: number };
  positions: number;
  skus: number;
  locations: number;
  skippedUnclassified: number;
  totalShortage: number;
  totalExcess: number;
  totalShortageValue: number;
  totalExcessValue: number;
  transferCount: number;
  totalTransferQty: number;
  totalPurchaseQty: number;
  byStatus: Record<string, number>;
  byDecision: Record<string, number>;
  /** ⭐ Шилжүүлгийн давуу эрхийн шат тус бүрийн тоо хэмжээ */
  transferByTier: Record<string, number>;
}

export async function runInventoryOptimization(
  options: InventoryRunOptions = {},
): Promise<InventoryRunSummary> {
  const settings = await getAnalysisSettings();
  const scope = options.scope ?? settings.salesScope;
  const allowCrossCompany = options.allowCrossCompany ?? true;

  // ── 1) ABC-XYZ гүйлтийг шийдэх ──
  let runId = options.runId;
  if (!runId) {
    const latest = await getLatestRun();
    if (latest && latest.calculationMonth === settings.calculationMonth) {
      runId = latest.id;
    } else {
      const abcXyz = await runAbcXyzAnalysis({
        calculationMonth: options.calculationMonth,
        lookbackMonths: options.lookbackMonths,
        scope,
        triggeredBy: options.triggeredBy,
      });
      runId = abcXyz.runId;
    }
  }

  const run = await prisma.analysisRun.findUnique({ where: { id: runId } });
  if (!run) throw new InventoryError(`AnalysisRun олдсонгүй: ${runId}`);
  if (run.status !== 'SUCCESS') {
    throw new InventoryError(`AnalysisRun ${runId} амжилттай дуусаагүй (${run.status}).`);
  }

  // ── 2) Нэгтгэл ──
  const { positions, productIdByCode, locationIdByCode, skippedUnclassified } =
    await buildPositions({
      runId,
      periods: run.periodsUsed,
      stockPeriod: run.calculationMonth,
      scope,
    });

  if (positions.length === 0) {
    throw new InventoryError('Тооцоолох байрлал олдсонгүй (борлуулалт ч, үлдэгдэл ч байхгүй).');
  }

  // ── 3) Engine ──
  const policyMap = await getInventoryPolicyMap();
  const statusParams = defaultStatusParams();

  const result = optimizeInventory(positions, {
    resolveTargetDays: (key: PolicyKey) => resolveTargetDays(policyMap, key),
    statusParams,
    transfer: { allowCrossCompany },
  });

  // ── 4) Хадгалалт — өмнөх үр дүнг цэвэрлээд дахин бичнэ (idempotent) ──
  await prisma.$transaction([
    prisma.analysisResult.deleteMany({ where: { runId } }),
    prisma.transferRecommendation.deleteMany({ where: { runId } }),
    prisma.purchaseRecommendation.deleteMany({ where: { runId } }),
  ]);

  const resultPayload = result.rows.flatMap((row) => {
    const productId = productIdByCode.get(row.productCode);
    const locationId = locationIdByCode.get(row.locationCode);
    if (!productId || !locationId) return [];
    return [
      {
        runId,
        productId,
        locationId,
        productCode: row.productCode,
        productName: row.productName,
        channelCode: row.channelCode,
        abcClass: row.abc,
        xyzClass: row.xyz,
        abcXyz: row.abcXyz,
        averageMonthlySales: row.averageMonthlySales,
        targetDays: row.targetDays,
        targetMonths: row.targetMonths,
        recommendedStock: row.recommendedStock,
        currentStock: row.currentStock,
        currentStockValue: row.currentStockValue,
        currentStockDays: row.currentStockDays,
        shortage: row.shortage,
        excess: row.excess,
        shortageValue: row.shortageValue,
        excessValue: row.excessValue,
        stockStatus: row.stockStatus as StockStatus,
        transferInQty: row.transferInQty,
        transferOutQty: row.transferOutQty,
        newPurchaseQty: row.newPurchaseQty,
        decision: row.decision as DecisionType,
        decisionReason: row.decisionReasonMn,
      },
    ];
  });

  for (let i = 0; i < resultPayload.length; i += INSERT_CHUNK) {
    await prisma.analysisResult.createMany({ data: resultPayload.slice(i, i + INSERT_CHUNK) });
  }

  const transferPayload = result.transfers.items.flatMap((item) => {
    const productId = productIdByCode.get(item.productCode);
    const fromLocationId = locationIdByCode.get(item.fromLocationCode);
    const toLocationId = locationIdByCode.get(item.toLocationCode);
    if (!productId || !fromLocationId || !toLocationId) return [];
    return [
      {
        runId,
        productId,
        fromLocationId,
        toLocationId,
        suggestedQty: item.quantity,
        estimatedValue: item.estimatedValue,
        reasonCode: 'SURPLUS_TO_SHORTAGE',
        reason: item.reasonMn,
        tierCode: item.tierCode,
        tierLabel: item.tierLabelMn,
        priorityRank: item.priorityRank,
      },
    ];
  });

  for (let i = 0; i < transferPayload.length; i += INSERT_CHUNK) {
    await prisma.transferRecommendation.createMany({
      data: transferPayload.slice(i, i + INSERT_CHUNK),
    });
  }

  const purchasePayload = result.rows
    .filter((row) => row.newPurchaseQty > 0)
    .flatMap((row) => {
      const productId = productIdByCode.get(row.productCode);
      const locationId = locationIdByCode.get(row.locationCode);
      if (!productId || !locationId) return [];
      return [
        {
          runId,
          productId,
          locationId,
          suggestedQty: row.newPurchaseQty,
          referenceUnitPrice: row.unitCost,
          estimatedCost: row.unitCost !== null ? row.newPurchaseQty * row.unitCost : null,
          reasonCode: 'SHORTAGE_AFTER_TRANSFER',
          reason: `${row.locationCode}: дутагдал ${row.shortage.toFixed(2)}, шилжүүлгээр ${row.transferInQty} нөхөгдсөн`,
        },
      ];
    });

  for (let i = 0; i < purchasePayload.length; i += INSERT_CHUNK) {
    await prisma.purchaseRecommendation.createMany({
      data: purchasePayload.slice(i, i + INSERT_CHUNK),
    });
  }

  const totalShortageValue = result.rows.reduce((acc, r) => acc + (r.shortageValue ?? 0), 0);
  const totalExcessValue = result.rows.reduce((acc, r) => acc + (r.excessValue ?? 0), 0);

  await prisma.auditLog.create({
    data: {
      action: 'INVENTORY_OPTIMIZATION',
      entityType: 'AnalysisRun',
      entityId: runId,
      actor: options.triggeredBy ?? null,
      metadata: {
        positions: result.summary.positions,
        transfers: result.transfers.items.length,
        transferByTier: result.summary.transferByTier,
        totalPurchaseQty: result.summary.totalPurchaseQty,
        allowCrossCompany,
        scope,
      },
    },
  });

  return {
    runId,
    calculationMonth: run.calculationMonth,
    periodsUsed: run.periodsUsed,
    scope,
    allowCrossCompany,
    params: statusParams,
    positions: result.summary.positions,
    skus: result.summary.skus,
    locations: result.summary.locations,
    skippedUnclassified,
    totalShortage: result.summary.totalShortage,
    totalExcess: result.summary.totalExcess,
    totalShortageValue,
    totalExcessValue,
    transferCount: result.transfers.items.length,
    totalTransferQty: result.summary.totalTransferQty,
    totalPurchaseQty: result.summary.totalPurchaseQty,
    byStatus: result.summary.byStatus,
    byDecision: result.summary.byDecision,
    transferByTier: result.summary.transferByTier,
  };
}

// ─────────────────────────────────────────────────────────────
// Уншилт (UI-д — БЭЛЭН нэгтгэл)
// ─────────────────────────────────────────────────────────────

export interface InventoryQuery {
  runId?: string;
  locationCode?: string;
  abcXyz?: string;
  stockStatus?: StockStatus;
  decision?: DecisionType;
  search?: string;
  take?: number;
  skip?: number;
  /** ⭐ Толгойн глобал шүүлтүүр — ХХК · байршлын төрөл · суваг · бүтээгдэхүүн */
  filter?: DashboardFilter;
}

export async function getInventoryResults(query: InventoryQuery = {}) {
  const run = query.runId
    ? await prisma.analysisRun.findUnique({ where: { id: query.runId } })
    : await getLatestRun();

  if (!run) return null;

  const hasResults = await prisma.analysisResult.count({ where: { runId: run.id } });
  if (hasResults === 0) return null;

  const take = Math.min(query.take ?? 50, 500);
  const skip = query.skip ?? 0;
  const abcXyz = parseAbcXyz(query.abcXyz);

  const filter = query.filter ?? {};
  const scope = locationScope(filter);

  /** Глобал шүүлтүүрийн хамрах хүрээ — жагсаалт БОЛОН нэгтгэлд адилхан. */
  const scopedWhere = {
    runId: run.id,
    ...(scope ? { location: scope } : {}),
    ...(filter.productCodes?.length ? { productCode: { in: filter.productCodes } } : {}),
  };

  const where = {
    ...scopedWhere,
    // Хуудсан доторх нарийн шүүлт (байршлын код) нь глобалыг давуулна
    ...(query.locationCode ? { location: { code: query.locationCode } } : {}),
    ...(abcXyz ? { abcXyz } : {}),
    ...(query.stockStatus ? { stockStatus: query.stockStatus } : {}),
    ...(query.decision ? { decision: query.decision } : {}),
    ...(query.search
      ? {
          OR: [
            { productCode: { contains: query.search, mode: 'insensitive' as const } },
            { productName: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [total, rows, byStatus, byDecision, totals] = await Promise.all([
    prisma.analysisResult.count({ where }),
    prisma.analysisResult.findMany({
      where,
      orderBy: [{ shortageValue: 'desc' }, { productCode: 'asc' }],
      take,
      skip,
      include: { location: { select: { code: true, type: true } } },
    }),
    prisma.analysisResult.groupBy({
      by: ['stockStatus'],
      where: scopedWhere,
      _count: { _all: true },
    }),
    prisma.analysisResult.groupBy({
      by: ['decision'],
      where: scopedWhere,
      _count: { _all: true },
    }),
    prisma.analysisResult.aggregate({
      where: scopedWhere,
      _sum: {
        shortage: true,
        excess: true,
        shortageValue: true,
        excessValue: true,
        newPurchaseQty: true,
        transferInQty: true,
      },
    }),
  ]);

  return {
    run: {
      id: run.id,
      calculationMonth: run.calculationMonth,
      periodsUsed: run.periodsUsed,
      salesScope: run.salesScope,
    },
    totals: {
      shortage: Number(totals._sum.shortage ?? 0),
      excess: Number(totals._sum.excess ?? 0),
      shortageValue: Number(totals._sum.shortageValue ?? 0),
      excessValue: Number(totals._sum.excessValue ?? 0),
      purchaseQty: totals._sum.newPurchaseQty ?? 0,
      transferQty: totals._sum.transferInQty ?? 0,
    },
    byStatus: byStatus.map((s) => ({ code: s.stockStatus, count: s._count._all })),
    byDecision: byDecision.map((d) => ({ code: d.decision, count: d._count._all })),
    total,
    take,
    skip,
    rows: rows.map((r) => ({
      productCode: r.productCode,
      productName: r.productName,
      locationCode: r.location.code,
      locationType: r.location.type,
      channelCode: r.channelCode,
      abcXyz: r.abcXyz,
      averageMonthlySales: Number(r.averageMonthlySales),
      targetDays: r.targetDays,
      targetMonths: Number(r.targetMonths),
      recommendedStock: Number(r.recommendedStock),
      currentStock: Number(r.currentStock),
      currentStockDays: Number(r.currentStockDays),
      shortage: Number(r.shortage),
      excess: Number(r.excess),
      shortageValue: r.shortageValue === null ? null : Number(r.shortageValue),
      excessValue: r.excessValue === null ? null : Number(r.excessValue),
      stockStatus: r.stockStatus,
      transferInQty: r.transferInQty,
      transferOutQty: r.transferOutQty,
      newPurchaseQty: r.newPurchaseQty,
      decision: r.decision,
      decisionReason: r.decisionReason,
    })),
  };
}

export async function getTransferPlan(
  runId?: string,
  take = 200,
  filter: DashboardFilter = {},
) {
  const run = runId ? await prisma.analysisRun.findUnique({ where: { id: runId } }) : await getLatestRun();
  if (!run) return null;

  // ⚠️ Шилжүүлэг 2 байршилтай тул эх үүсвэр ЭСВЭЛ хүлээн авагч таарвал хамаарна
  const where = transferWhere(run.id, filter);

  const rows = await prisma.transferRecommendation.findMany({
    where,
    orderBy: [{ suggestedQty: 'desc' }, { priorityRank: 'asc' }],
    take: Math.min(take, 1000),
    include: {
      product: { select: { productCode: true, name: true } },
      fromLocation: { select: { code: true, type: true } },
      toLocation: { select: { code: true, type: true } },
    },
  });

  return {
    runId: run.id,
    total: await prisma.transferRecommendation.count({ where }),
    rows: rows.map((r) => ({
      productCode: r.product.productCode,
      productName: r.product.name,
      fromLocationCode: r.fromLocation.code,
      fromLocationType: r.fromLocation.type,
      toLocationCode: r.toLocation.code,
      toLocationType: r.toLocation.type,
      quantity: r.suggestedQty,
      estimatedValue: r.estimatedValue === null ? null : Number(r.estimatedValue),
      tierCode: r.tierCode,
      tierLabel: r.tierLabel,
      priorityRank: r.priorityRank,
      reason: r.reason,
    })),
  };
}
