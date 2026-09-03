/**
 * GET /api/products/[code] — §23, §24 бүтээгдэхүүний дэлгэрэнгүй
 *
 * Бүх метрик БЭЛЭН тооцоологдсон хүснэгтүүдээс ирнэ.
 */

import { NextResponse } from 'next/server';

import { getProductDetail } from '../../../../services/dashboard/product-detail.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const detail = await getProductDetail(decodeURIComponent(code));

  if (!detail) {
    return NextResponse.json(
      { error: `Бүтээгдэхүүн олдсонгүй эсвэл тооцоолол хийгдээгүй: ${code}` },
      { status: 404 },
    );
  }

  return NextResponse.json(detail);
}
