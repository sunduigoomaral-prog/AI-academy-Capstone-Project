/**
 * POST /api/analysis/abc-xyz/run
 *
 * ABC-XYZ гүйлт эхлүүлнэ. Бүх тооцоолол server талд хийгдэнэ.
 * Body (заавал биш): { calculationMonth?, lookbackMonths?, scope? }
 */

import { NextResponse } from 'next/server';

import { AnalysisError, runAbcXyzAnalysis } from '../../../../../services/analysis/abc-xyz.service';
import { isPeriodKey } from '../../../../../lib/period';
import type { SalesScope } from '../../../../../types/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SCOPES: SalesScope[] = ['ALL', 'WAREHOUSE', 'PHARMACY'];

export async function POST(request: Request) {
  let body: { calculationMonth?: string; lookbackMonths?: number; scope?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // body хоосон байж болно — тохиргооны утгууд ашиглагдана
  }

  if (body.calculationMonth !== undefined && !isPeriodKey(body.calculationMonth)) {
    return NextResponse.json(
      { error: `calculationMonth "YYYY-MM" байх ёстой: ${body.calculationMonth}` },
      { status: 400 },
    );
  }

  if (
    body.lookbackMonths !== undefined &&
    (!Number.isInteger(body.lookbackMonths) || body.lookbackMonths < 1 || body.lookbackMonths > 36)
  ) {
    return NextResponse.json(
      { error: `lookbackMonths 1-36 хооронд бүхэл тоо байх ёстой: ${body.lookbackMonths}` },
      { status: 400 },
    );
  }

  if (body.scope !== undefined && !SCOPES.includes(body.scope as SalesScope)) {
    return NextResponse.json(
      { error: `scope буруу: ${body.scope}. Зөвшөөрөгдөх: ${SCOPES.join(' | ')}` },
      { status: 400 },
    );
  }

  try {
    const summary = await runAbcXyzAnalysis({
      calculationMonth: body.calculationMonth,
      lookbackMonths: body.lookbackMonths,
      scope: body.scope as SalesScope | undefined,
    });
    return NextResponse.json(summary, { status: 201 });
  } catch (error) {
    if (error instanceof AnalysisError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Тодорхойгүй алдаа';
    return NextResponse.json({ error: `Тооцоолол амжилтгүй: ${message}` }, { status: 500 });
  }
}
