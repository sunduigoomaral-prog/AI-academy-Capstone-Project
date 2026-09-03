/**
 * GET /api/analysis/inventory/transfers?runId=&take=
 *
 * Шилжүүлгийн саналын жагсаалт (тоо хэмжээгээр буурахаар).
 */

import { NextResponse } from 'next/server';

import { getTransferPlan } from '../../../../../services/analysis/inventory.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


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
  const plan = await getTransferPlan(
    url.searchParams.get('runId') ?? undefined,
    Number(url.searchParams.get('take') ?? 200),
    parseFilter(url),
  );

  if (!plan) {
    return NextResponse.json(
      { error: 'Тооцоолол олдсонгүй. Эхлээд гүйлт хийнэ үү.' },
      { status: 404 },
    );
  }

  return NextResponse.json(plan);
}
