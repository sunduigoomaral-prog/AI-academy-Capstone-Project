/**
 * GET /api/import/[id]/issues?severity=ERROR&code=...&take=100&skip=0
 *
 * Data Quality Dashboard-ийн алдааны хүснэгтийг тэжээнэ.
 */

import { NextResponse } from 'next/server';

import { getImportIssues } from '../../../../../services/import/import.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const url = new URL(request.url);

  const severityParam = url.searchParams.get('severity');
  const severity =
    severityParam === 'ERROR' || severityParam === 'WARNING' ? severityParam : undefined;

  const result = await getImportIssues(id, {
    severity,
    code: url.searchParams.get('code') ?? undefined,
    take: Number(url.searchParams.get('take') ?? 100),
    skip: Number(url.searchParams.get('skip') ?? 0),
  });

  return NextResponse.json(result);
}
