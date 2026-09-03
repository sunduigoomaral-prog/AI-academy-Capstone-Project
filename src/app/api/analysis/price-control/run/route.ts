/**
 * POST /api/analysis/price-control/run
 *
 * Худалдан авалтын үнийн benchmark тооцоолно (§1–§6, §8).
 * Body (заавал биш): { runId?, dimension? }
 */

import { NextResponse } from 'next/server';

import {
  PriceControlError,
  runPriceControl,
} from '../../../../../services/analysis/price-control.service';
import type { PriceDimension } from '../../../../../analytics/pricing/purchase-price-control';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DIMENSIONS: PriceDimension[] = ['SUPPLIER', 'LOCATION', 'CHANNEL'];

export async function POST(request: Request) {
  let body: { runId?: string; dimension?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    // хоосон body зөвшөөрөгдөнө
  }

  if (body.dimension !== undefined && !DIMENSIONS.includes(body.dimension as PriceDimension)) {
    return NextResponse.json(
      { error: `dimension буруу: ${body.dimension}. Зөвшөөрөгдөх: ${DIMENSIONS.join(' | ')}` },
      { status: 400 },
    );
  }

  try {
    const summary = await runPriceControl({
      runId: body.runId,
      dimension: body.dimension as PriceDimension | undefined,
    });
    return NextResponse.json(summary, { status: 201 });
  } catch (error) {
    if (error instanceof PriceControlError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Тодорхойгүй алдаа';
    return NextResponse.json({ error: `Тооцоолол амжилтгүй: ${message}` }, { status: 500 });
  }
}
