/**
 * GET /api/filters — §4 шүүлтүүрийн сонголтууд (байршлын төрөл / байршил / суваг)
 */

import { NextResponse } from 'next/server';

import { getFilterOptions } from '../../../services/dashboard/dashboard.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getFilterOptions());
}
