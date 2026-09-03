/**
 * POST /api/import/[id]/process
 *
 * Валидац → цэвэрлэгээ → лавлах upsert → fact insert.
 * Явцын мэдээллийг DB-д бичдэг тул client `/api/import/[id]`-ийг polling хийж
 * progress-ийг харна.
 */

import { NextResponse } from 'next/server';

import {
  getImportStatus,
  ImportError,
  processFile,
} from '../../../../../services/import/import.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** 14,300 мөр боловсруулахад хангалттай хугацаа */
export const maxDuration = 300;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    await processFile(id);
    const status = await getImportStatus(id);
    return NextResponse.json(status);
  } catch (error) {
    if (error instanceof ImportError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Тодорхойгүй алдаа';
    return NextResponse.json({ error: `Боловсруулалт амжилтгүй: ${message}` }, { status: 500 });
  }
}
