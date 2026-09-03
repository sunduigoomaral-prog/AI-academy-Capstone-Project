/**
 * GET /api/export/excel?productCodes=&locationType=&locationCodes=
 *
 * §25 — 17 sheet бүхий Excel workbook татаж өгнө.
 * Шүүлтүүр нь dashboard-той ИЖИЛ — экспорт нь дэлгэц дээрх зүйлтэй таарна.
 */

import { NextResponse } from 'next/server';

import { buildWorkbook } from '../../../../services/export/excel-export.service';
import type { DashboardFilter } from '../../../../services/dashboard/dashboard.service';
import type { LocationType } from '../../../../types/domain';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function parseList(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const items = value.split(',').map((v) => v.trim()).filter(Boolean);
  return items.length ? items : undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locationType = url.searchParams.get('locationType');

  const filter: DashboardFilter = {
    runId: url.searchParams.get('runId') ?? undefined,
    productCodes: parseList(url.searchParams.get('productCodes')),
    companyCodes: parseList(url.searchParams.get('companyCodes')),
    locationType: (locationType as LocationType | null) ?? undefined,
    locationCodes: parseList(url.searchParams.get('locationCodes')),
  };

  try {
    const { buffer, fileName } = await buildWorkbook(filter);
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Тодорхойгүй алдаа';
    return NextResponse.json({ error: `Экспорт амжилтгүй: ${message}` }, { status: 500 });
  }
}
