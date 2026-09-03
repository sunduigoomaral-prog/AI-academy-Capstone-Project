/**
 * POST /api/analysis/ai-recommendations/[id]/review
 *
 * §13 — менежерийн Accept / Reject / Modify.
 * AuditLog-д user · date · sku · recommendation · action · old → new бичигдэнэ.
 *
 * Body: { action: "ACCEPTED" | "REJECTED" | "MODIFIED", reviewedBy, newQuantity?, note? }
 */

import { NextResponse } from 'next/server';

import {
  AiEngineError,
  reviewRecommendation,
  type ReviewAction,
} from '../../../../../../services/analysis/ai-recommendation.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIONS: ReviewAction[] = ['ACCEPTED', 'REJECTED', 'MODIFIED'];

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  let body: { action?: string; reviewedBy?: string; newQuantity?: number; note?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'JSON body шаардлагатай' }, { status: 400 });
  }

  if (!body.action || !ACTIONS.includes(body.action as ReviewAction)) {
    return NextResponse.json(
      { error: `action буруу. Зөвшөөрөгдөх: ${ACTIONS.join(' | ')}` },
      { status: 400 },
    );
  }

  if (!body.reviewedBy || typeof body.reviewedBy !== 'string' || !body.reviewedBy.trim()) {
    return NextResponse.json(
      { error: 'reviewedBy заавал шаардлагатай (аудитын бүртгэлд хэрэгтэй)' },
      { status: 400 },
    );
  }

  try {
    const result = await reviewRecommendation({
      recommendationId: id,
      action: body.action as ReviewAction,
      reviewedBy: body.reviewedBy.trim(),
      newQuantity: body.newQuantity,
      note: body.note,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AiEngineError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Тодорхойгүй алдаа';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
