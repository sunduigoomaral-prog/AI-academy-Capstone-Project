/**
 * POST /api/import/upload
 *
 * Excel файл хүлээж авна: эх хувийг диск дээр хадгалж, sheet-үүдийг ТАНИНА.
 * Валидац / DB insert энд ХИЙГДЭХГҮЙ — `/api/import/[id]/process`-д.
 *
 * ⚠️ Route handler НИМГЭН: зөвхөн вход шалгах + service дуудах + JSON буцаах.
 */

import { NextResponse } from 'next/server';

import { isSupportedExtension } from '../../../../lib/excel/read-workbook';
import { ImportError, uploadFile } from '../../../../services/import/import.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 50 MB — эх файл 0.9 MB тул хангалттай зай */
const MAX_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Файл илгээгдээгүй байна ("file" талбар шаардлагатай).' },
        { status: 400 },
      );
    }

    if (!isSupportedExtension(file.name)) {
      return NextResponse.json(
        { error: `Дэмжигдээгүй өргөтгөл: ${file.name}. Зөвхөн .xlsx, .xls хүлээн авна.` },
        { status: 415 },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Файл хэт том: ${(file.size / 1024 / 1024).toFixed(1)} MB (дээд хязгаар 50 MB).` },
        { status: 413 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFile(buffer, file.name);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ImportError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Тодорхойгүй алдаа';
    return NextResponse.json({ error: `Upload амжилтгүй: ${message}` }, { status: 500 });
  }
}
