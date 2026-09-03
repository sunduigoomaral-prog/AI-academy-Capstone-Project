/**
 * GET /api/analysis/ai-recommendations?runId=&priority=&risk=&status=&search=&take=&skip=
 */

import { NextResponse } from 'next/server';

import { getRecommendations } from '../../../../services/analysis/ai-recommendation.service';
import type { AiPriority } from '../../../../analytics/recommendation/ai-rule-engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIORITIES: AiPriority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const priority = url.searchParams.get('priority');

  if (priority && !PRIORITIES.includes(priority as AiPriority)) {
    return NextResponse.json(
      { error: `priority буруу: ${priority}. Зөвшөөрөгдөх: ${PRIORITIES.join(' | ')}` },
      { status: 400 },
    );
  }

  const result = await getRecommendations({
    runId: url.searchParams.get('runId') ?? undefined,
    priority: (priority as AiPriority | null) ?? undefined,
    risk: url.searchParams.get('risk') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    take: Number(url.searchParams.get('take') ?? 50),
    skip: Number(url.searchParams.get('skip') ?? 0),
  });

  if (!result) {
    return NextResponse.json(
      { error: 'AI зөвлөмж олдсонгүй. Эхлээд гүйлт хийнэ үү.' },
      { status: 404 },
    );
  }

  return NextResponse.json(result);
}
