/**
 * GET /api/settings — §27 Settings: Inventory Policy + ABC/XYZ Threshold
 *
 * ⚠️ Бүх утга DB-ээс (`inventory_policy`, `analysis_config`). Hardcode байхгүй.
 */

import { NextResponse } from 'next/server';

import { prisma } from '../../../lib/prisma';
import { getAnalysisSettings } from '../../../config/config-service';
import rules from '../../../config/inventory-status-rules.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [settings, policies, configs, tierTotals] = await Promise.all([
      getAnalysisSettings(),
      prisma.inventoryPolicy.findMany({
        where: { isActive: true, locationId: null },
        orderBy: [{ locationType: 'asc' }, { abcClass: 'asc' }, { xyzClass: 'asc' }],
      }),
      prisma.analysisConfig.findMany({
        where: { isActive: true },
        orderBy: { key: 'asc' },
      }),
      // ⚠️ Сүүлийн гүйлтийн БОДИТ тоо. Гүйлт хийгээгүй бол null → UI дээр N/A.
      prisma.transferRecommendation.groupBy({
        by: ['tierCode'],
        _sum: { suggestedQty: true },
      }),
    ]);

    const qtyByTier = new Map(
      tierTotals.map((row) => [row.tierCode, row._sum.suggestedQty ?? 0]),
    );
    const hasRun = tierTotals.length > 0;

    return NextResponse.json({
      settings,
      policies: policies.map((p) => ({
        locationType: p.locationType,
        abcClass: p.abcClass,
        xyzClass: p.xyzClass,
        targetDays: p.targetDays,
      })),
      transferTiers: rules.transferPreference.tiers
        .filter((tier) => tier.enabled !== false)
        .map((tier) => ({
          code: tier.code,
          labelMn: tier.labelMn,
          noteMn: tier.noteMn ?? null,
          // Гүйлт хийгээгүй бол тоо ЗОХИОХГҮЙ — null буцаана
          quantity: hasRun ? (qtyByTier.get(tier.code) ?? 0) : null,
        })),
      configs: configs.map((c) => ({
        key: c.key,
        value: c.value,
        valueType: c.valueType,
        description: c.description,
        version: c.version,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Тодорхойгүй алдаа';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
