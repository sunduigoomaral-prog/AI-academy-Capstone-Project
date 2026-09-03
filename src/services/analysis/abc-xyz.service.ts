/**
 * ABC-XYZ orchestration.
 *
 * ⚠️ Математик ЭНД БАЙХГҮЙ — бүгд `src/analytics/`-д. Энэ файл зөвхөн:
 *      тохиргоо унших → lookback шийдэх → DB-ээс нэгтгэх → engine дуудах → хадгалах
 *
 * ⚠️ ГҮЙЦЭТГЭЛ: frontend түүхий гүйлгээг хэзээ ч дахин тооцохгүй.
 *    UI нь `abc_xyz_result` хүснэгтээс БЭЛЭН үр дүн уншина.
 */

import { prisma } from '../../lib/prisma';
import { getAnalysisSettings } from '../../config/config-service';
import {
  ABC_XYZ_CLASSES,
  buildAbcXyzMatrix,
  runAbcXyz,
  type AbcXyzMatrixCell,
} from '../../analytics/abc-xyz/abc-xyz-engine';
import type { AbcXyzClass, AbcXyzRow, PeriodKey, SalesScope } from '../../types/domain';
import { aggregateSkus } from './sales-aggregation';
import { resolveLookback } from './lookback.service';

const INSERT_CHUNK = 500;

export class AnalysisError extends Error {}

export interface RunOptions {
  calculationMonth?: PeriodKey;
  lookbackMonths?: number;
  scope?: SalesScope;
  triggeredBy?: string;
}

export interface RunSummary {
  runId: string;
  calculationMonth: PeriodKey;
  lastCompletedMonth: PeriodKey;
  periodsUsed: PeriodKey[];
  missingPeriods: PeriodKey[];
  warnings: string[];
  scope: SalesScope;
  abcBasis: string;
  thresholds: { abcA: number; abcB: number; xyzX: number; xyzY: number };
  skuCount: number;
  skusWithSales: number;
  skusStockOnly: number;
  totalSalesValue: number;
  matrix: AbcXyzMatrixCell[];
}

/**
 * Бүрэн ABC-XYZ гүйлт.
 *
 * Reproducibility: ашигласан threshold болон саруудыг `AnalysisRun`-д
 * хадгалдаг тул тохиргоо дараа өөрчлөгдсөн ч энэ гүйлтийн үр дүн тайлбарлагдана.
 */
export async function runAbcXyzAnalysis(options: RunOptions = {}): Promise<RunSummary> {
  const settings = await getAnalysisSettings();
  const scope = options.scope ?? settings.salesScope;

  const lookback = await resolveLookback({
    calculationMonth: options.calculationMonth,
    lookbackMonths: options.lookbackMonths,
  });

  if (lookback.usedPeriods.length === 0) {
    throw new AnalysisError(
      `${lookback.calculationMonth}-аас өмнө ашиглах боломжтой бүтэн сар олдсонгүй. ` +
        'Борлуулалтын өгөгдөл ачаалагдсан эсэхийг шалгана уу.',
    );
  }

  const run = await prisma.analysisRun.create({
    data: {
      calculationMonth: lookback.calculationMonth,
      lookbackMonths: lookback.requestedMonths,
      periodsUsed: lookback.usedPeriods,
      configSnapshot: {
        ...settings,
        scope,
        requestedPeriods: lookback.requestedPeriods,
        missingPeriods: lookback.missingPeriods,
        warnings: lookback.warnings,
      },
      abcBasis: settings.abcBasis,
      salesScope: scope,
      abcAThreshold: settings.abcAThreshold,
      abcBThreshold: settings.abcBThreshold,
      xyzXThreshold: settings.xyzXThreshold,
      xyzYThreshold: settings.xyzYThreshold,
      status: 'RUNNING',
      triggeredBy: options.triggeredBy ?? null,
    },
    select: { id: true },
  });

  try {
    const { aggregates, productIdByCode, skusWithSales, skusStockOnly } = await aggregateSkus({
      periods: lookback.usedPeriods,
      stockPeriod: lookback.calculationMonth,
      scope,
    });

    if (aggregates.length === 0) {
      throw new AnalysisError('Тооцоолох SKU олдсонгүй (борлуулалт ч, үлдэгдэл ч байхгүй).');
    }

    const rows = runAbcXyz(aggregates, {
      abc: { a: settings.abcAThreshold, b: settings.abcBThreshold },
      xyz: { x: settings.xyzXThreshold, y: settings.xyzYThreshold },
      expectedMonths: lookback.usedPeriods.length,
    });

    await persistResults(run.id, rows, productIdByCode);

    const totalSalesValue = rows.reduce((acc, row) => acc + row.salesValue, 0);

    await prisma.analysisRun.update({
      where: { id: run.id },
      data: { status: 'SUCCESS', skuCount: rows.length, finishedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        action: 'ANALYSIS_RUN',
        entityType: 'AnalysisRun',
        entityId: run.id,
        actor: options.triggeredBy ?? null,
        metadata: {
          calculationMonth: lookback.calculationMonth,
          periodsUsed: lookback.usedPeriods,
          scope,
          skuCount: rows.length,
          totalSalesValue,
        },
      },
    });

    return {
      runId: run.id,
      calculationMonth: lookback.calculationMonth,
      lastCompletedMonth: lookback.lastCompletedMonth,
      periodsUsed: lookback.usedPeriods,
      missingPeriods: lookback.missingPeriods,
      warnings: lookback.warnings,
      scope,
      abcBasis: settings.abcBasis,
      thresholds: {
        abcA: settings.abcAThreshold,
        abcB: settings.abcBThreshold,
        xyzX: settings.xyzXThreshold,
        xyzY: settings.xyzYThreshold,
      },
      skuCount: rows.length,
      skusWithSales,
      skusStockOnly,
      totalSalesValue,
      matrix: buildAbcXyzMatrix(rows),
    };
  } catch (error) {
    await prisma.analysisRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}

async function persistResults(
  runId: string,
  rows: AbcXyzRow[],
  productIdByCode: Map<string, string>,
): Promise<void> {
  const payload = rows.flatMap((row) => {
    const productId = productIdByCode.get(row.productCode);
    if (!productId) return [];
    return [
      {
        runId,
        productId,
        productCode: row.productCode,
        productName: row.productName,
        salesValue: row.salesValue,
        salesShare: row.salesShare,
        cumulativeShare: row.cumulativeShare,
        rank: row.rank,
        abcClass: row.abc,
        monthlyQty: row.monthlyQty,
        averageMonthlyQty: row.averageMonthlyQty,
        stdDev: row.stdDev,
        cv: row.cv,
        xyzClass: row.xyz,
        monthsWithSales: row.monthsWithSales,
        abcXyz: row.abcXyz,
        inventoryStatus: row.inventoryStatus,
      },
    ];
  });

  for (let i = 0; i < payload.length; i += INSERT_CHUNK) {
    await prisma.abcXyzResult.createMany({ data: payload.slice(i, i + INSERT_CHUNK) });
  }
}

// ─────────────────────────────────────────────────────────────
// Уншилт (UI-д зориулсан — БЭЛЭН нэгтгэл)
// ─────────────────────────────────────────────────────────────

export async function getLatestRun() {
  return prisma.analysisRun.findFirst({
    where: { status: 'SUCCESS' },
    orderBy: { startedAt: 'desc' },
  });
}

/** Хүчинтэй 9 ангиллын нэг мөн эсэх — буруу утгыг чимээгүй үл тоохгүй */
export function parseAbcXyz(value: string | undefined): AbcXyzClass | undefined {
  if (value === undefined) return undefined;
  const upper = value.toUpperCase();
  if (!ABC_XYZ_CLASSES.includes(upper as AbcXyzClass)) {
    throw new AnalysisError(
      `abcXyz буруу: "${value}". Зөвшөөрөгдөх: ${ABC_XYZ_CLASSES.join(', ')}`,
    );
  }
  return upper as AbcXyzClass;
}

export interface ResultQuery {
  runId?: string;
  abcXyz?: string;
  inventoryStatus?: 'ACTIVE' | 'NO_MOVEMENT';
  search?: string;
  take?: number;
  skip?: number;
}

export async function getAbcXyzResults(query: ResultQuery = {}) {
  const run = query.runId
    ? await prisma.analysisRun.findUnique({ where: { id: query.runId } })
    : await getLatestRun();

  if (!run) return null;

  const take = Math.min(query.take ?? 50, 500);
  const skip = query.skip ?? 0;

  const abcXyz = parseAbcXyz(query.abcXyz);

  const where = {
    runId: run.id,
    ...(abcXyz ? { abcXyz } : {}),
    ...(query.inventoryStatus ? { inventoryStatus: query.inventoryStatus } : {}),
    ...(query.search
      ? {
          OR: [
            { productCode: { contains: query.search, mode: 'insensitive' as const } },
            { productName: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [total, rows, matrixGroups] = await Promise.all([
    prisma.abcXyzResult.count({ where }),
    prisma.abcXyzResult.findMany({ where, orderBy: { rank: 'asc' }, take, skip }),
    prisma.abcXyzResult.groupBy({
      by: ['abcXyz'],
      where: { runId: run.id },
      _count: { _all: true },
      _sum: { salesValue: true },
    }),
  ]);

  const grandTotal = matrixGroups.reduce((acc, g) => acc + Number(g._sum.salesValue ?? 0), 0);

  return {
    run: {
      id: run.id,
      calculationMonth: run.calculationMonth,
      lookbackMonths: run.lookbackMonths,
      periodsUsed: run.periodsUsed,
      abcBasis: run.abcBasis,
      salesScope: run.salesScope,
      skuCount: run.skuCount,
      thresholds: {
        abcA: Number(run.abcAThreshold),
        abcB: Number(run.abcBThreshold),
        xyzX: Number(run.xyzXThreshold),
        xyzY: Number(run.xyzYThreshold),
      },
      startedAt: run.startedAt,
    },
    matrix: matrixGroups
      .map((g) => ({
        abcXyz: g.abcXyz,
        skuCount: g._count._all,
        salesValue: Number(g._sum.salesValue ?? 0),
        salesShare: grandTotal > 0 ? Number(g._sum.salesValue ?? 0) / grandTotal : 0,
      }))
      .sort((a, b) => a.abcXyz.localeCompare(b.abcXyz)),
    total,
    take,
    skip,
    rows: rows.map((r) => ({
      productCode: r.productCode,
      productName: r.productName,
      abc: r.abcClass,
      xyz: r.xyzClass,
      abcXyz: r.abcXyz,
      salesValue: Number(r.salesValue),
      salesShare: Number(r.salesShare),
      cumulativeShare: Number(r.cumulativeShare),
      monthlyQty: r.monthlyQty.map((q) => Number(q)),
      averageMonthlyQty: Number(r.averageMonthlyQty),
      stdDev: Number(r.stdDev),
      cv: r.cv === null ? null : Number(r.cv),
      inventoryStatus: r.inventoryStatus,
      monthsWithSales: r.monthsWithSales,
      rank: r.rank,
    })),
  };
}
