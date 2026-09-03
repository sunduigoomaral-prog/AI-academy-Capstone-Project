/**
 * Config layer-ийн seed.
 *
 * ЗӨВХӨН тохиргоо (AnalysisConfig + InventoryPolicy) үүсгэнэ.
 * Product / Sales / Purchase / Stock өгөгдөл ЭНД ОРОХГҮЙ — тэдгээр нь
 * зөвхөн Excel ingest-ээр орно. Fake data үүсгэхгүй.
 *
 * Ажиллуулах:  npx prisma db seed
 */

import { PrismaClient } from '@prisma/client';
import {
  ANALYSIS_CONFIG_SEED,
  INVENTORY_POLICY_SEED,
} from '../src/config/analysis-defaults';

const prisma = new PrismaClient();

async function main() {
  console.log('→ AnalysisConfig seed…');
  for (const c of ANALYSIS_CONFIG_SEED) {
    await prisma.analysisConfig.upsert({
      where: { key_version: { key: c.key, version: 1 } },
      update: {
        value: c.value,
        valueType: c.valueType,
        description: c.description,
        isActive: true,
      },
      create: {
        key: c.key,
        value: c.value,
        valueType: c.valueType,
        description: c.description,
        version: 1,
        isActive: true,
      },
    });
  }
  console.log(`  ${ANALYSIS_CONFIG_SEED.length} config мөр бэлэн`);

  console.log('→ InventoryPolicy seed…');
  for (const p of INVENTORY_POLICY_SEED) {
    // ⚠️ `upsert` ашиглах боломжгүй: compound unique дотор `locationId` нь
    //    nullable бөгөөд Prisma нь unique `where`-д null хүлээж авдаггүй.
    //    Тиймээс глобал бодлогыг (locationId = null) findFirst-ээр хайна.
    const existing = await prisma.inventoryPolicy.findFirst({
      where: {
        locationType: p.locationType,
        abcClass: p.abcClass,
        xyzClass: p.xyzClass,
        locationId: null,
        version: 1,
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.inventoryPolicy.update({
        where: { id: existing.id },
        data: { targetDays: p.targetDays, isActive: true },
      });
    } else {
      await prisma.inventoryPolicy.create({
        data: {
          locationType: p.locationType,
          abcClass: p.abcClass,
          xyzClass: p.xyzClass,
          targetDays: p.targetDays,
          version: 1,
          isActive: true,
        },
      });
    }
  }
  console.log(`  ${INVENTORY_POLICY_SEED.length} policy мөр бэлэн (2 төрөл × 3 ABC × 3 XYZ)`);

  await prisma.auditLog.create({
    data: {
      action: 'CONFIG_SEED',
      entityType: 'AnalysisConfig',
      metadata: {
        configRows: ANALYSIS_CONFIG_SEED.length,
        policyRows: INVENTORY_POLICY_SEED.length,
      },
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
