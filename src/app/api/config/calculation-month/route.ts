/**
 * GET  /api/config/calculation-month  — одоогийн тохиргоо + lookback шийдэл
 * PUT  /api/config/calculation-month  — calculation month / lookback шинэчлэх
 *
 * ⚠️ Утга нь DB-д (`analysis_config`) хадгалагдана. Кодод hardcode БАЙХГҮЙ.
 */

import { NextResponse } from 'next/server';

import { prisma } from '../../../../lib/prisma';
import { isPeriodKey } from '../../../../lib/period';
import { CONFIG_KEYS } from '../../../../config/analysis-defaults';
import { resolveLookback } from '../../../../services/analysis/lookback.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const resolution = await resolveLookback();
    return NextResponse.json(resolution);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Тодорхойгүй алдаа';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const body = (await request.json()) as {
    calculationMonth?: string;
    lookbackMonths?: number;
  };

  if (body.calculationMonth !== undefined && !isPeriodKey(body.calculationMonth)) {
    return NextResponse.json(
      { error: `calculationMonth "YYYY-MM" хэлбэртэй байх ёстой: ${body.calculationMonth}` },
      { status: 400 },
    );
  }

  if (
    body.lookbackMonths !== undefined &&
    (!Number.isInteger(body.lookbackMonths) || body.lookbackMonths < 1 || body.lookbackMonths > 36)
  ) {
    return NextResponse.json(
      { error: `lookbackMonths нь 1-36 хооронд бүхэл тоо байх ёстой: ${body.lookbackMonths}` },
      { status: 400 },
    );
  }

  const updates: Array<{ key: string; value: string }> = [];
  if (body.calculationMonth !== undefined) {
    updates.push({ key: CONFIG_KEYS.CALCULATION_MONTH, value: body.calculationMonth });
  }
  if (body.lookbackMonths !== undefined) {
    updates.push({ key: CONFIG_KEYS.LOOKBACK_MONTHS, value: String(body.lookbackMonths) });
  }

  for (const update of updates) {
    const current = await prisma.analysisConfig.findFirst({
      where: { key: update.key, isActive: true },
      orderBy: { version: 'desc' },
    });

    await prisma.analysisConfig.update({
      where: { id: current!.id },
      data: { value: update.value },
    });

    await prisma.auditLog.create({
      data: {
        action: 'CONFIG_UPDATE',
        entityType: 'AnalysisConfig',
        entityId: current!.id,
        before: { key: update.key, value: current!.value },
        after: { key: update.key, value: update.value },
      },
    });
  }

  const resolution = await resolveLookback();
  return NextResponse.json(resolution);
}
