/**
 * POST /api/analysis/inventory/run
 *
 * Нөөцийн оновчлол + шилжүүлэг/худалдан авалтын шийдвэрийг тооцоолно.
 * ABC-XYZ гүйлт байхгүй бол автоматаар эхлээд түүнийг ажиллуулна.
 *
 * Body (заавал биш):
 *   { runId?, calculationMonth?, lookbackMonths?, scope?, allowCrossCompany? }
 */

import { NextResponse } from 'next/server';

import { InventoryError, runInventoryOptimization } from '../../../../../services/analysis/inventory.service';
import { AnalysisError } from '../../../../../services/analysis/abc-xyz.service';
import { isPeriodKey } from '../../../../../lib/period';
import type { SalesScope } from '../../../../../types/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SCOPES: SalesScope[] = ['ALL', 'WAREHOUSE', 'PHARMACY'];

export async function POST(request: Request) {
  let body: {
    runId?: string;
    calculationMonth?: string;
    lookbackMonths?: number;
    scope?: string;
    allowCrossCompany?: boolean;
  } = {};

  try {
    body = (await request.json()) as typeof body;
  } catch {
    // хоосон body зөвшөөрөгдөнө — тохиргооны утгууд хэрэглэгдэнэ
  }

  if (body.calculationMonth !== undefined && !isPeriodKey(body.calculationMonth)) {
    return NextResponse.json(
      { error: `calculationMonth "YYYY-MM" байх ёстой: ${body.calculationMonth}` },
      { status: 400 },
    );
  }

  if (body.scope !== undefined && !SCOPES.includes(body.scope as SalesScope)) {
    return NextResponse.json(
      { error: `scope буруу: ${body.scope}. Зөвшөөрөгдөх: ${SCOPES.join(' | ')}` },
      { status: 400 },
    );
  }

  if (body.allowCrossCompany !== undefined && typeof body.allowCrossCompany !== 'boolean') {
    return NextResponse.json({ error: 'allowCrossCompany нь boolean байх ёстой' }, { status: 400 });
  }

  try {
    const summary = await runInventoryOptimization({
      runId: body.runId,
      calculationMonth: body.calculationMonth,
      lookbackMonths: body.lookbackMonths,
      scope: body.scope as SalesScope | undefined,
      allowCrossCompany: body.allowCrossCompany,
    });
    return NextResponse.json(summary, { status: 201 });
  } catch (error) {
    if (error instanceof InventoryError || error instanceof AnalysisError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Тодорхойгүй алдаа';
    return NextResponse.json({ error: `Тооцоолол амжилтгүй: ${message}` }, { status: 500 });
  }
}
