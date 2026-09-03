/**
 * GET /api/analysis/inventory
 *   ?runId=&locationCode=&abcXyz=&stockStatus=&decision=&search=&take=&skip=
 *
 * БЭЛЭН тооцоологдсон нөөцийн шийдвэрийг буцаана. Frontend дахин тооцоолохгүй.
 */

import { NextResponse } from 'next/server';

import { getInventoryResults } from '../../../../services/analysis/inventory.service';
import { AnalysisError } from '../../../../services/analysis/abc-xyz.service';
import type { DecisionType, StockStatus } from '../../../../types/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES: StockStatus[] = [
  'NO_MOVEMENT', 'STOCKOUT_RISK', 'OVERSTOCK', 'SLOW_MOVING', 'LOW_STOCK', 'OPTIMAL',
];
const DECISIONS: DecisionType[] = [
  'TRANSFER', 'NEW_PURCHASE', 'STOP_PURCHASE', 'MONITOR', 'PROMOTION',
];


/** `a,b,c` → ['a','b','c'] (хоосон бол undefined) */
function parseList(url: URL, key: string): string[] | undefined {
  const raw = url.searchParams.get(key);
  const items = raw ? raw.split(',').filter(Boolean) : [];
  return items.length ? items : undefined;
}

/** Толгойн глобал шүүлтүүрийг query string-ээс уншина. */
function parseFilter(url: URL) {
  const type = url.searchParams.get('locationType');
  return {
    productCodes: parseList(url, 'productCodes'),
    companyCodes: parseList(url, 'companyCodes'),
    locationCodes: parseList(url, 'locationCodes'),
    channelCodes: parseList(url, 'channelCodes'),
    locationType: (type === 'WAREHOUSE' || type === 'PHARMACY' ? type : undefined) as
      | 'WAREHOUSE'
      | 'PHARMACY'
      | undefined,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get('stockStatus');
  const decision = url.searchParams.get('decision');

  if (status && !STATUSES.includes(status as StockStatus)) {
    return NextResponse.json(
      { error: `stockStatus буруу: ${status}. Зөвшөөрөгдөх: ${STATUSES.join(' | ')}` },
      { status: 400 },
    );
  }
  if (decision && !DECISIONS.includes(decision as DecisionType)) {
    return NextResponse.json(
      { error: `decision буруу: ${decision}. Зөвшөөрөгдөх: ${DECISIONS.join(' | ')}` },
      { status: 400 },
    );
  }

  try {
    const result = await getInventoryResults({
      runId: url.searchParams.get('runId') ?? undefined,
      locationCode: url.searchParams.get('locationCode') ?? undefined,
      abcXyz: url.searchParams.get('abcXyz') ?? undefined,
      stockStatus: (status as StockStatus | null) ?? undefined,
      decision: (decision as DecisionType | null) ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
      take: Number(url.searchParams.get('take') ?? 50),
      skip: Number(url.searchParams.get('skip') ?? 0),
      filter: parseFilter(url),
    });

    if (!result) {
      return NextResponse.json(
        { error: 'Нөөцийн тооцоолол олдсонгүй. Эхлээд гүйлт хийнэ үү.' },
        { status: 404 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AnalysisError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Тодорхойгүй алдаа';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
