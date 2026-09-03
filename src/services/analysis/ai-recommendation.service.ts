/**
 * AI recommendation orchestration (§9–§13).
 *
 * ⚠️ §10 ХАТУУ ДҮРЭМ: AI нь calculation engine-ийн үр дүнг ӨӨРЧЛӨХГҮЙ.
 *    Бүх тоо `analysis_result` (Phase 4) болон `purchase_price_benchmark`
 *    (Phase 5)-аас ШУУД уншигдана. Энэ файлд дахин тооцоолол БАЙХГҮЙ.
 */

import { Prisma } from '@prisma/client';

import { prisma } from '../../lib/prisma';
import {
  comparePriority,
  recommend,
  ruleEngineVersion,
  type AiInput,
  type AiPriority,
} from '../../analytics/recommendation/ai-rule-engine';
import { computeSalesTrend } from '../../analytics/trend/sales-trend';
import { REVENUE_MISSING_REASON } from '../../analytics/pricing/margin';
import { getLatestRun } from './abc-xyz.service';

const INSERT_CHUNK = 500;

export class AiEngineError extends Error {}

export interface AiRunOptions {
  runId?: string;
  triggeredBy?: string;
}

export interface AiRunSummary {
  runId: string;
  calculationMonth: string;
  recommendations: number;
  byPriority: Record<string, number>;
  byRisk: Record<string, number>;
  ruleVersion: string;
}

/** Тухайн шийдвэрээс RecommendationType-руу буулгах */
function typeFromDecision(decision: string): 'TRANSFER' | 'PURCHASE' | 'STOCK_REDUCTION' | 'DEAD_STOCK' | 'GENERAL' {
  switch (decision) {
    case 'TRANSFER':
      return 'TRANSFER';
    case 'NEW_PURCHASE':
      return 'PURCHASE';
    case 'STOP_PURCHASE':
      return 'STOCK_REDUCTION';
    case 'PROMOTION':
      return 'DEAD_STOCK';
    default:
      return 'GENERAL';
  }
}

export async function runAiRecommendations(options: AiRunOptions = {}): Promise<AiRunSummary> {
  const run = options.runId
    ? await prisma.analysisRun.findUnique({ where: { id: options.runId } })
    : await getLatestRun();

  if (!run) throw new AiEngineError('Тооцооллын гүйлт олдсонгүй.');

  // ── Phase 4-ийн үр дүн (БЭЛЭН тоо) ──
  const results = await prisma.analysisResult.findMany({
    where: { runId: run.id },
    include: { location: { select: { code: true, type: true } } },
  });

  if (results.length === 0) {
    throw new AiEngineError(
      'Нөөцийн тооцооллын үр дүн олдсонгүй. Эхлээд inventory optimization ажиллуулна уу.',
    );
  }

  // ── Phase 3-ийн сарын тоо хэмжээ (хандлагад) ──
  const abcRows = await prisma.abcXyzResult.findMany({
    where: { runId: run.id },
    select: { productCode: true, monthlyQty: true },
  });
  const monthlyByProduct = new Map(
    abcRows.map((r) => [r.productCode, r.monthlyQty.map((q) => Number(q))]),
  );

  // ── Phase 5-ийн үнийн benchmark ──
  const benchmarks = await prisma.purchasePriceBenchmark.findMany({
    where: { runId: run.id },
  });
  const benchByProduct = new Map(benchmarks.map((b) => [b.productCode, b]));

  // ── Тухайн SKU-д өөр байршилд илүүдэл байгаа эсэх ──
  const surplusByProduct = new Map<string, number>();
  for (const row of results) {
    const excess = Number(row.excess);
    if (excess > 0) {
      surplusByProduct.set(
        row.productCode,
        (surplusByProduct.get(row.productCode) ?? 0) + excess,
      );
    }
  }

  const productIdByCode = new Map(results.map((r) => [r.productCode, r.productId]));

  // ── Engine ──
  const byPriority: Record<string, number> = {};
  const byRisk: Record<string, number> = {};

  const payload = results.map((row) => {
    const bench = benchByProduct.get(row.productCode);
    const trend = computeSalesTrend(monthlyByProduct.get(row.productCode) ?? []);

    const input: AiInput = {
      productCode: row.productCode,
      productName: row.productName,
      abc: row.abcClass,
      xyz: row.xyzClass,
      abcXyz: row.abcXyz,
      locationCode: row.location.code,
      locationType: row.location.type,

      averageMonthlySales: Number(row.averageMonthlySales),
      currentStock: Number(row.currentStock),
      currentStockDays: Number(row.currentStockDays),
      targetDays: row.targetDays,
      recommendedStock: Number(row.recommendedStock),
      shortage: Number(row.shortage),
      excess: Number(row.excess),
      stockStatus: row.stockStatus,
      decision: row.decision,
      transferInQty: row.transferInQty,
      newPurchaseQty: row.newPurchaseQty,
      transferAvailable: (surplusByProduct.get(row.productCode) ?? 0) > 0,
      shortageValue: row.shortageValue === null ? null : Number(row.shortageValue),
      excessValue: row.excessValue === null ? null : Number(row.excessValue),

      salesTrend: trend.trend,
      salesTrendPct: trend.trendPct,

      weightedAvgUnitPrice:
        bench?.weightedAvgUnitPrice == null ? null : Number(bench.weightedAvgUnitPrice),
      minUnitPrice: bench?.minUnitPrice == null ? null : Number(bench.minUnitPrice),
      maxUnitPrice: bench?.maxUnitPrice == null ? null : Number(bench.maxUnitPrice),
      minSourceKey: bench?.minSourceKey ?? null,
      priceGap: bench?.priceGap == null ? null : Number(bench.priceGap),
      priceGapPct: bench?.priceGapPct == null ? null : Number(bench.priceGapPct),
      priceChangePct: bench?.priceChangePct == null ? null : Number(bench.priceChangePct),
      potentialSaving: bench?.potentialSaving == null ? null : Number(bench.potentialSaving),

      // ⚠️ §7 — эх өгөгдөлд орлого байхгүй тул ашиг/маржин тооцогдохгүй
      grossProfit: null,
      grossMarginPct: null,
      marginUnavailableReason: REVENUE_MISSING_REASON,
      marginAtRisk: bench?.marginAtRisk ?? false,
      marginRiskReasons: (bench?.marginRiskReasons as string[] | null) ?? [],
    };

    const rec = recommend(input);
    byPriority[rec.priority] = (byPriority[rec.priority] ?? 0) + 1;
    byRisk[rec.risk] = (byRisk[rec.risk] ?? 0) + 1;

    return {
      runId: run.id,
      type: typeFromDecision(row.decision),
      source: 'RULE_ENGINE' as const,
      status: 'OPEN' as const,
      productId: productIdByCode.get(row.productCode) ?? null,
      locationId: row.locationId,
      productCode: row.productCode,
      locationCode: row.location.code,
      risk: rec.risk,
      priority: rec.priority as AiPriority,
      reason: rec.reason,
      impact: rec.impact,
      recommendedAction: rec.recommended_action,
      transferPossible: rec.transfer_possible,
      purchaseRequired: rec.purchase_required,
      stopPurchase: rec.stop_purchase,
      recommendedQuantity: rec.recommended_quantity,
      ruleCode: rec.ruleCode,
      ruleVersion: ruleEngineVersion(),
      evidence: rec.evidence,
    };
  });

  // ── Хадгалалт (idempotent) ──
  await prisma.aIRecommendation.deleteMany({ where: { runId: run.id } });
  for (let i = 0; i < payload.length; i += INSERT_CHUNK) {
    await prisma.aIRecommendation.createMany({ data: payload.slice(i, i + INSERT_CHUNK) });
  }

  await prisma.auditLog.create({
    data: {
      action: 'AI_RECOMMENDATION_RUN',
      entityType: 'AnalysisRun',
      entityId: run.id,
      actor: options.triggeredBy ?? null,
      metadata: { recommendations: payload.length, byPriority, ruleVersion: ruleEngineVersion() },
    },
  });

  return {
    runId: run.id,
    calculationMonth: run.calculationMonth,
    recommendations: payload.length,
    byPriority,
    byRisk,
    ruleVersion: ruleEngineVersion(),
  };
}

// ─────────────────────────────────────────────────────────────
// §12 — МЕНЕЖЕРИЙН ХУРААНГУЙ
// ─────────────────────────────────────────────────────────────

const SUMMARY_TOP_N = 5;

function mapRow(r: {
  id: string;
  productCode: string | null;
  /** ⚠️ AIRecommendation model-д нэр хадгалагддаггүй — зөвхөн код. */
  productName?: string | null;
  locationCode: string | null;
  risk: string;
  priority: string;
  reason: string;
  impact: string;
  recommendedAction: string;
  transferPossible: boolean;
  purchaseRequired: boolean;
  stopPurchase: boolean;
  recommendedQuantity: number;
  status: string;
  ruleCode: string | null;
  evidence: unknown;
}) {
  return {
    id: r.id,
    productCode: r.productCode,
    productName: r.productName ?? null,
    locationCode: r.locationCode,
    risk: r.risk,
    priority: r.priority,
    // §12 — WHY / IMPACT / ACTION гурван хэсэг
    why: r.reason,
    impact: r.impact,
    action: r.recommendedAction,
    transferPossible: r.transferPossible,
    purchaseRequired: r.purchaseRequired,
    stopPurchase: r.stopPurchase,
    recommendedQuantity: r.recommendedQuantity,
    status: r.status,
    ruleCode: r.ruleCode,
    evidence: r.evidence,
  };
}

export async function getManagementSummary(runId?: string) {
  const run = runId
    ? await prisma.analysisRun.findUnique({ where: { id: runId } })
    : await getLatestRun();
  if (!run) return null;

  const total = await prisma.aIRecommendation.count({ where: { runId: run.id } });
  if (total === 0) return null;

  // ⚠️ `Prisma.AIRecommendationSelect` гэж тэмдэглэснээр TypeScript нь
  //    байхгүй талбарыг compile үед барина. `as const` хувьсагчид
  //    excess-property шалгалт хийгддэггүй тул өмнө нь алдаа мөлхөж байсан.
  const select: Prisma.AIRecommendationSelect = {
    id: true,
    productCode: true,
    locationCode: true,
    risk: true,
    priority: true,
    reason: true,
    impact: true,
    recommendedAction: true,
    transferPossible: true,
    purchaseRequired: true,
    stopPurchase: true,
    recommendedQuantity: true,
    status: true,
    ruleCode: true,
    evidence: true,
  };

  const base = { runId: run.id };

  const [topRisks, topPurchase, topTransfer, topStop, priceRisksRaw, byPriority, byRisk] =
    await Promise.all([
      prisma.aIRecommendation.findMany({
        where: base,
        orderBy: [{ priority: 'asc' }, { recommendedQuantity: 'desc' }],
        take: SUMMARY_TOP_N,
        select,
      }),
      prisma.aIRecommendation.findMany({
        where: { ...base, purchaseRequired: true },
        orderBy: { recommendedQuantity: 'desc' },
        take: SUMMARY_TOP_N,
        select,
      }),
      prisma.aIRecommendation.findMany({
        where: { ...base, transferPossible: true, recommendedQuantity: { gt: 0 } },
        orderBy: { recommendedQuantity: 'desc' },
        take: SUMMARY_TOP_N,
        select,
      }),
      prisma.aIRecommendation.findMany({
        where: { ...base, stopPurchase: true },
        orderBy: { recommendedQuantity: 'desc' },
        take: SUMMARY_TOP_N,
        select,
      }),
      // ⚠️ Үнийн эрсдэл нь SKU түвшний — байршил бүрээр давхардуулахгүй
      prisma.purchasePriceBenchmark.findMany({
        where: { runId: run.id, marginAtRisk: true },
        orderBy: { potentialSaving: 'desc' },
        take: SUMMARY_TOP_N,
      }),
      prisma.aIRecommendation.groupBy({
        by: ['priority'],
        where: base,
        _count: { _all: true },
      }),
      prisma.aIRecommendation.groupBy({
        by: ['risk'],
        where: base,
        _count: { _all: true },
      }),
    ]);

  return {
    run: {
      id: run.id,
      calculationMonth: run.calculationMonth,
      periodsUsed: run.periodsUsed,
    },
    total,
    byPriority: byPriority
      .map((p) => ({ code: p.priority, count: p._count._all }))
      .sort((a, b) => comparePriority(a.code as AiPriority, b.code as AiPriority)),
    byRisk: byRisk
      .map((r) => ({ code: r.risk, count: r._count._all }))
      .sort((a, b) => b.count - a.count),
    sections: [
      { code: 'TOP_RISKS', labelMn: 'Хамгийн өндөр эрсдэл', rows: topRisks.map(mapRow) },
      { code: 'TOP_PURCHASE', labelMn: 'Худалдан авах', rows: topPurchase.map(mapRow) },
      { code: 'TOP_TRANSFER', labelMn: 'Шилжүүлэх', rows: topTransfer.map(mapRow) },
      { code: 'TOP_STOP_PURCHASE', labelMn: 'Худалдан авалт зогсоох', rows: topStop.map(mapRow) },
    ],
    priceRisks: priceRisksRaw.map((b) => ({
      productCode: b.productCode,
      productName: b.productName,
      minUnitPrice: b.minUnitPrice === null ? null : Number(b.minUnitPrice),
      maxUnitPrice: b.maxUnitPrice === null ? null : Number(b.maxUnitPrice),
      minSourceKey: b.minSourceKey,
      priceGapPct: b.priceGapPct === null ? null : Number(b.priceGapPct),
      priceChangePct: b.priceChangePct === null ? null : Number(b.priceChangePct),
      potentialSaving: b.potentialSaving === null ? null : Number(b.potentialSaving),
      reasons: b.marginRiskReasons,
    })),
    grossMargin: { available: false, reason: REVENUE_MISSING_REASON },
  };
}

export interface RecommendationQuery {
  runId?: string;
  priority?: AiPriority;
  risk?: string;
  status?: string;
  search?: string;
  take?: number;
  skip?: number;
}

export async function getRecommendations(query: RecommendationQuery = {}) {
  const run = query.runId
    ? await prisma.analysisRun.findUnique({ where: { id: query.runId } })
    : await getLatestRun();
  if (!run) return null;

  const take = Math.min(query.take ?? 50, 500);
  const skip = query.skip ?? 0;

  const where = {
    runId: run.id,
    ...(query.priority ? { priority: query.priority } : {}),
    ...(query.risk ? { risk: query.risk } : {}),
    ...(query.status ? { status: query.status as never } : {}),
    ...(query.search
      ? {
          OR: [
            { productCode: { contains: query.search, mode: 'insensitive' as const } },
            { productName: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.aIRecommendation.count({ where }),
    prisma.aIRecommendation.findMany({
      where,
      orderBy: [{ priority: 'asc' }, { recommendedQuantity: 'desc' }],
      take,
      skip,
    }),
  ]);

  return { total, take, skip, rows: rows.map(mapRow) };
}

// ─────────────────────────────────────────────────────────────
// §13 — AUDIT: Accept / Reject / Modify
// ─────────────────────────────────────────────────────────────

export type ReviewAction = 'ACCEPTED' | 'REJECTED' | 'MODIFIED';

export interface ReviewInput {
  recommendationId: string;
  action: ReviewAction;
  reviewedBy: string;
  /** MODIFIED үед заавал */
  newQuantity?: number;
  note?: string;
}

const STATUS_BY_ACTION: Record<ReviewAction, 'ACCEPTED' | 'REJECTED' | 'APPLIED'> = {
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  MODIFIED: 'ACCEPTED',
};

/**
 * Менежерийн шийдвэрийг бүртгэнэ.
 *
 * §13 — AuditLog-д: user · date · sku · recommendation · action · old → new
 */
export async function reviewRecommendation(input: ReviewInput) {
  const rec = await prisma.aIRecommendation.findUnique({
    where: { id: input.recommendationId },
  });
  if (!rec) throw new AiEngineError(`Зөвлөмж олдсонгүй: ${input.recommendationId}`);

  if (input.action === 'MODIFIED') {
    if (input.newQuantity === undefined || !Number.isInteger(input.newQuantity) || input.newQuantity < 0) {
      throw new AiEngineError('MODIFIED үед newQuantity нь 0-ээс их бүхэл тоо байх ёстой.');
    }
  }

  const oldQuantity = rec.recommendedQuantity;
  const newQuantity = input.action === 'MODIFIED' ? input.newQuantity! : oldQuantity;

  const [review] = await prisma.$transaction([
    prisma.recommendationReview.create({
      data: {
        recommendationId: rec.id,
        action: input.action,
        reviewedBy: input.reviewedBy,
        oldQuantity,
        newQuantity,
        note: input.note ?? null,
      },
    }),
    prisma.aIRecommendation.update({
      where: { id: rec.id },
      data: {
        status: STATUS_BY_ACTION[input.action],
        recommendedQuantity: newQuantity,
        reviewedAt: new Date(),
        reviewedBy: input.reviewedBy,
      },
    }),
    prisma.auditLog.create({
      data: {
        action: `RECOMMENDATION_${input.action}`,
        entityType: 'AIRecommendation',
        entityId: rec.id,
        actor: input.reviewedBy,
        before: { recommendedQuantity: oldQuantity, status: rec.status },
        after: { recommendedQuantity: newQuantity, status: STATUS_BY_ACTION[input.action] },
        metadata: {
          sku: rec.productCode,
          locationCode: rec.locationCode,
          risk: rec.risk,
          ruleCode: rec.ruleCode,
          note: input.note ?? null,
        },
      },
    }),
  ]);

  return {
    reviewId: review.id,
    recommendationId: rec.id,
    action: input.action,
    oldQuantity,
    newQuantity,
    status: STATUS_BY_ACTION[input.action],
  };
}
