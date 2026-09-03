/**
 * GET /api/analysis/abc-xyz?runId=&abcXyz=&inventoryStatus=&search=&take=&skip=
 *
 * БЭЛЭН тооцоологдсон үр дүнг буцаана. Frontend түүхий гүйлгээ татахгүй,
 * дахин тооцоолохгүй.
 */

import { NextResponse } from 'next/server';

import { getAbcXyzResults } from '../../../../services/analysis/abc-xyz.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);

  const status = url.searchParams.get('inventoryStatus');
  const result = await getAbcXyzResults({
    runId: url.searchParams.get('runId') ?? undefined,
    abcXyz: url.searchParams.get('abcXyz') ?? undefined,
    inventoryStatus:
      status === 'ACTIVE' || status === 'NO_MOVEMENT' ? status : undefined,
    search: url.searchParams.get('search') ?? undefined,
    take: Number(url.searchParams.get('take') ?? 50),
    skip: Number(url.searchParams.get('skip') ?? 0),
  });

  if (!result) {
    return NextResponse.json(
      { error: 'Амжилттай дууссан тооцоолол олдсонгүй. Эхлээд гүйлт хийнэ үү.' },
      { status: 404 },
    );
  }

  return NextResponse.json(result);
}
