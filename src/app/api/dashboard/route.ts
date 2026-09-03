/**
 * GET /api/dashboard?section=&productCodes=&locationType=&locationCodes=&channelCodes=
 *
 * §5, §6, §7, §8, §19, §20, §22 — нэгтгэсэн dashboard өгөгдөл.
 *
 * ⚠️ §29: бүх нэгтгэл DB дээр хийгдэнэ. Түүхий мөр browser руу татагдахгүй.
 * `section` өгвөл зөвхөн тэр хэсгийг буцаана (хуудас хурдан ачаалахад).
 */

import { NextResponse } from 'next/server';

import {
  getAbcXyzMatrix,
  getAutoAnswers,
  getExecutiveKpis,
  getInventoryBalance,
  getLocationBalance,
  getSalesTrend,
  type DashboardFilter,
} from '../../../services/dashboard/dashboard.service';
import type { LocationType } from '../../../types/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SECTIONS = ['kpis', 'matrix', 'balance', 'autoAnswers', 'trend', 'locations'] as const;
type Section = (typeof SECTIONS)[number];

function parseList(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const items = value.split(',').map((v) => v.trim()).filter(Boolean);
  return items.length ? items : undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locationType = url.searchParams.get('locationType');

  if (locationType && locationType !== 'WAREHOUSE' && locationType !== 'PHARMACY') {
    return NextResponse.json(
      { error: `locationType буруу: ${locationType}. Зөвшөөрөгдөх: WAREHOUSE | PHARMACY` },
      { status: 400 },
    );
  }

  const filter: DashboardFilter = {
    runId: url.searchParams.get('runId') ?? undefined,
    productCodes: parseList(url.searchParams.get('productCodes')),
    companyCodes: parseList(url.searchParams.get('companyCodes')),
    locationType: (locationType as LocationType | null) ?? undefined,
    locationCodes: parseList(url.searchParams.get('locationCodes')),
    channelCodes: parseList(url.searchParams.get('channelCodes')),
  };

  const requested = parseList(url.searchParams.get('section')) as Section[] | undefined;
  const want = (s: Section) => !requested || requested.includes(s);

  try {
    const [kpis, matrix, balance, autoAnswers, trend, locations] = await Promise.all([
      want('kpis') ? getExecutiveKpis(filter) : null,
      want('matrix') ? getAbcXyzMatrix(filter) : null,
      want('balance') ? getInventoryBalance(filter) : null,
      want('autoAnswers') ? getAutoAnswers(filter) : null,
      want('trend') ? getSalesTrend(filter) : null,
      want('locations') ? getLocationBalance(filter) : null,
    ]);

    if (want('kpis') && kpis === null) {
      return NextResponse.json(
        { error: 'Тооцооллын үр дүн олдсонгүй. Эхлээд Excel ачаалж, тооцоолол ажиллуулна уу.' },
        { status: 404 },
      );
    }

    return NextResponse.json({ filter, kpis, matrix, balance, autoAnswers, trend, locations });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Тодорхойгүй алдаа';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
