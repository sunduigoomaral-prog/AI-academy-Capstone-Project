/**
 * Calculation Month + Lookback шийдэгч.
 *
 * ДҮРЭМ:
 *   calculationMonth = 2026-06
 *     → lastCompletedMonth = 2026-05
 *     → calculationMonth ӨӨРӨӨ дундаж борлуулалтын тооцоонд ОРОХГҮЙ
 *     → default lookback = 6 бүтэн сар = 2025-12 … 2026-05
 *
 *   Хүссэн сарууд бүрэн байхгүй бол:
 *     → БАЙГАА бүтэн саруудыг ашиглаж, WARNING буцаана (чимээгүй 0-оор дүүргэхгүй)
 */

import { prisma } from '../../lib/prisma';
import {
  comparePeriods,
  lastCompletedPeriod,
  lookbackPeriods,
  missingPeriods,
} from '../../lib/period';
import { getAnalysisSettings } from '../../config/config-service';
import type { PeriodKey } from '../../types/domain';

export interface LookbackResolution {
  calculationMonth: PeriodKey;
  lastCompletedMonth: PeriodKey;
  requestedMonths: number;
  /** Хүссэн бүтэн саруудын жагсаалт (calculation month ОРОЛЦОХГҮЙ) */
  requestedPeriods: PeriodKey[];
  /** Өгөгдөлд байгаа бүтэн сарууд (calculation month-аас өмнөх) */
  availablePeriods: PeriodKey[];
  /** Бодитоор ашиглагдах сарууд */
  usedPeriods: PeriodKey[];
  /** Хүссэн боловч өгөгдөлд байхгүй сарууд */
  missingPeriods: PeriodKey[];
  warnings: string[];
}

/** Sales өгөгдөлд байгаа бүх сарын түлхүүрүүд */
export async function availableSalesPeriods(): Promise<PeriodKey[]> {
  const rows = await prisma.salesFact.findMany({
    distinct: ['periodKey'],
    select: { periodKey: true },
    orderBy: { periodKey: 'asc' },
  });
  return rows.map((r) => r.periodKey);
}

export async function resolveLookback(
  overrides: { calculationMonth?: PeriodKey; lookbackMonths?: number } = {},
): Promise<LookbackResolution> {
  const settings = await getAnalysisSettings();
  const calculationMonth = overrides.calculationMonth ?? settings.calculationMonth;
  const requestedMonths = overrides.lookbackMonths ?? settings.lookbackMonths;

  const lastCompleted = lastCompletedPeriod(calculationMonth);
  const requested = lookbackPeriods(calculationMonth, requestedMonths);

  const all = await availableSalesPeriods();
  // Calculation month болон түүнээс хойшхи саруудыг ХАСНА
  const completedAvailable = all.filter((p) => comparePeriods(p, calculationMonth) < 0);

  const missing = missingPeriods(requested, completedAvailable);
  const used = requested.filter((p) => completedAvailable.includes(p));

  const warnings: string[] = [];

  if (completedAvailable.length === 0) {
    warnings.push(
      `${calculationMonth}-аас өмнө бүтэн сарын борлуулалтын өгөгдөл олдсонгүй. ` +
        'Дундаж эрэлт тооцох боломжгүй.',
    );
  } else if (missing.length > 0) {
    warnings.push(
      `Хүссэн ${requestedMonths} сарын ${missing.length} нь өгөгдөлд байхгүй ` +
        `(${missing.join(', ')}). Байгаа ${used.length} сарыг ашиглана.`,
    );
  }

  if (all.some((p) => comparePeriods(p, calculationMonth) >= 0)) {
    warnings.push(
      `${calculationMonth} ба түүнээс хойшхи саруудын борлуулалт өгөгдөлд байгаа боловч ` +
        'дундаж тооцоонд ОРУУЛААГҮЙ (calculation month дүрэм).',
    );
  }

  return {
    calculationMonth,
    lastCompletedMonth: lastCompleted,
    requestedMonths,
    requestedPeriods: requested,
    availablePeriods: completedAvailable,
    usedPeriods: used,
    missingPeriods: missing,
    warnings,
  };
}
