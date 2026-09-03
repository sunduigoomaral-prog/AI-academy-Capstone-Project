/**
 * GET /api/products/search?q=&take=
 *
 * §3 — server-side бүтээгдэхүүний хайлт. Client талд debounce хийнэ.
 * Код эсвэл нэрээр хайна. Том өгөгдөлд бүх бүтээгдэхүүнийг татахгүй.
 */

import { NextResponse } from 'next/server';

import { searchProducts } from '../../../../services/dashboard/dashboard.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await searchProducts(
    url.searchParams.get('q') ?? '',
    Number(url.searchParams.get('take') ?? 20),
  );
  return NextResponse.json(result);
}
