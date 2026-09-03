/**
 * GET /api/import/[id]
 *
 * Upload-ийн одоогийн төлөв, чанарын дүн, sheet бүрийн статистик.
 * UI progress indicator энэ endpoint-ийг polling хийнэ.
 */

import { NextResponse } from 'next/server';

import { getImportStatus } from '../../../../services/import/import.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const status = await getImportStatus(id);

  if (!status) {
    return NextResponse.json({ error: `Upload олдсонгүй: ${id}` }, { status: 404 });
  }

  return NextResponse.json(status);
}
