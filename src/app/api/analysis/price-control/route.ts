/**
 * GET /api/analysis/price-control
 *   ?runId=&gapSeverity=&marginAtRisk=&multiSourceOnly=&search=&take=&skip=
 *
 * БЭЛЭН тооцоологдсон үнийн benchmark. Frontend дахин тооцоолохгүй.
 */

import { NextResponse } from 'next/server';

import { getPriceBenchmarks } from '../../../../services/analysis/price-control.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const severity = url.searchParams.get('gapSeverity');

  if (severity && !SEVERITIES.includes(severity)) {
    return NextResponse.json(
      { error: `gapSeverity буруу: ${severity}. Зөвшөөрөгдөх: ${SEVERITIES.join(' | ')}` },
      { status: 400 },
    );
  }

  const marginParam = url.searchParams.get('marginAtRisk');

  const result = await getPriceBenchmarks({
    runId: url.searchParams.get('runId') ?? undefined,
    gapSeverity: severity ?? undefined,
    marginAtRisk: marginParam === null ? undefined : marginParam === 'true',
    multiSourceOnly: url.searchParams.get('multiSourceOnly') === 'true',
    search: url.searchParams.get('search') ?? undefined,
    take: Number(url.searchParams.get('take') ?? 50),
    skip: Number(url.searchParams.get('skip') ?? 0),
  });

  if (!result) {
    return NextResponse.json(
      { error: 'Үнийн хяналтын үр дүн олдсонгүй. Эхлээд гүйлт хийнэ үү.' },
      { status: 404 },
    );
  }

  return NextResponse.json(result);
}
