/**
 * POST /api/analysis/ai-recommendations/run
 *
 * AI зөвлөмжийг үүсгэнэ (§9).
 * ⚠️ §10: тооцооллын үр дүнг ӨӨРЧЛӨХГҮЙ — зөвхөн тайлбар нэмнэ.
 */

import { NextResponse } from 'next/server';

import {
  AiEngineError,
  runAiRecommendations,
} from '../../../../../services/analysis/ai-recommendation.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request) {
  let body: { runId?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // хоосон body зөвшөөрөгдөнө
  }

  try {
    const summary = await runAiRecommendations({ runId: body.runId });
    return NextResponse.json(summary, { status: 201 });
  } catch (error) {
    if (error instanceof AiEngineError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Тодорхойгүй алдаа';
    return NextResponse.json({ error: `AI engine амжилтгүй: ${message}` }, { status: 500 });
  }
}
