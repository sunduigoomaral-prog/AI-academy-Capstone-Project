/**
 * GET /api/analysis/ai-recommendations/summary?runId=
 *
 * §12 — менежерийн хураангуй. Хэсэг бүр TOP 5, мөр бүр WHY / IMPACT / ACTION.
 */

import { NextResponse } from 'next/server';

import { getManagementSummary } from '../../../../../services/analysis/ai-recommendation.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const summary = await getManagementSummary(url.searchParams.get('runId') ?? undefined);

  if (!summary) {
    return NextResponse.json(
      { error: 'AI зөвлөмж олдсонгүй. Эхлээд гүйлт хийнэ үү.' },
      { status: 404 },
    );
  }

  return NextResponse.json(summary);
}
