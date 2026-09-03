/**
 * ENTERPRISE DASHBOARD service (§5, §6, §7, §8, §19, §20, §22).
 *
 * ⚠️ §29 ГҮЙЦЭТГЭЛ: бүх нэгтгэл PostgreSQL дээр `groupBy` / `aggregate`-аар.
 *    Түүхий гүйлгээ БОЛОН бүх мөр browser руу татагдахгүй — зөвхөн нэгтгэсэн тоо.
 *
 * ⚠️ §28 FAKE DATA ХОРИГЛОНО: эх өгөгдөлд байхгүй үзүүлэлт (Gross Profit,
 *    Gross Margin) `null` + шалтгаантайгаар буцна. Тоо ЗОХИОХГҮЙ.
 */

import { prisma } from '../../lib/prisma';
import { REVENUE_MISSING_REASON } from '../../analytics/pricing/margin';
import { getLatestRun } from '../analysis/abc-xyz.service';
import type { LocationType } from '../../types/domain';

/** §3, §4 — dashboard даяарх шүүлтүүр */
export interface DashboardFilter {
  runId?: string;
  /** §3 — олон бүтээгдэхүүн сонгох боломжтой. Хоосон = бүгд. */
  productCodes?: string[];
  /** ХХК (Excel `ХХК` багана) — 200120 / 200123 / 200127 */
  companyCodes?: string[];
  locationType?: LocationType;
  /** Суваг / байршил (Excel `Суваг` багана) — 300120, 400137 гэх мэт */
  locationCodes?: string[];
  channelCodes?: string[];
}

function locationWhere(filter: DashboardFilter) {
  const hasLocationFilter =
    filter.locationType ||
    filter.locationCodes?.length ||
    filter.channelCodes?.length ||
    filter.companyCodes?.length;

  if (!hasLocationFilter) return {};

  return {
    location: {
      ...(filter.locationType ? { type: filter.locationType } : {}),
      ...(filter.locationCodes?.length ? { code: { in: filter.locationCodes } } : {}),
      // ХХК → түүнд харьяалагдах бүх байршил
      ...(filter.companyCodes?.length
        ? { company: { code: { in: filter.companyCodes } } }
        : {}),
      ...(filter.channelCodes?.length ? { channel: { code: { in: filter.channelCodes } } } : {}),
    },
  };
}

/** Байршлын шүүлтийн нөхцөл — өөр service-үүд дахин ашиглана. */
export function locationScope(filter: DashboardFilter) {
  return locationWhere(filter).location;
}

/**
 * Шилжүүлгийн шүүлтүүр — эх үүсвэр ЭСВЭЛ хүлээн авагч таарвал хамаарна.
 * (Нэг талыг нь шүүвэл тухайн ХХК руу ИРЖ буй бараа харагдахгүй болно.)
 */
export function transferWhere(runId: string, filter: DashboardFilter) {
  const scope = locationWhere(filter).location;
  return {
    runId,
    ...(filter.productCodes?.length ? { productCode: { in: filter.productCodes } } : {}),
    ...(scope ? { OR: [{ fromLocation: scope }, { toLocation: scope }] } : {}),
  };
}

function resultWhere(runId: string, filter: DashboardFilter) {
  return {
    runId,
    ...(filter.productCodes?.length ? { productCode: { in: filter.productCodes } } : {}),
    ...locationWhere(filter),
  };
}

export interface KpiValue {
  key: string;
  labelMn: string;
  value: number | null;
  /** Хувь эсвэл нэмэлт тайлбар */
  sub?: string | null;
  /** §28 — утга байхгүй бол ЗААВАЛ шалтгаан */
  unavailableReason?: string | null;
  format: 'int' | 'money' | 'percent' | 'decimal';
  tone?: string;
}

/** §5 — Executive KPI мөр */
export async function getExecutiveKpis(filter: DashboardFilter = {}) {
  const run = filter.runId
    ? await prisma.analysisRun.findUnique({ where: { id: filter.runId } })
    : await getLatestRun();
  if (!run) return null;

  const where = resultWhere(run.id, filter);

  const [agg, byStatus, byDecision, skuCount, salesAgg] = await Promise.all([
    prisma.analysisResult.aggregate({
      where,
      _sum: {
        currentStock: true,
        currentStockValue: true,
        shortage: true,
        excess: true,
        newPurchaseQty: true,
        transferInQty: true,
      },
      _count: { _all: true },
    }),
    prisma.analysisResult.groupBy({ by: ['stockStatus'], where, _count: { _all: true } }),
    prisma.analysisResult.groupBy({ by: ['decision'], where, _count: { _all: true } }),
    prisma.analysisResult
      .findMany({ where, distinct: ['productCode'], select: { productCode: true } })
      .then((r) => r.length),
    prisma.abcXyzResult.aggregate({
      where: {
        runId: run.id,
        ...(filter.productCodes?.length ? { productCode: { in: filter.productCodes } } : {}),
      },
      _sum: { salesValue: true },
    }),
  ]);

  const statusCount = (code: string) =>
    byStatus.find((s) => s.stockStatus === code)?._count._all ?? 0;
  const decisionCount = (code: string) =>
    byDecision.find((d) => d.decision === code)?._count._all ?? 0;

  const positions = agg._count._all || 1;

  // §20-д ашиглах: сарын борлуулалтын тоо
  const salesQty = await prisma.abcXyzResult
    .findMany({
      where: {
        runId: run.id,
        ...(filter.productCodes?.length ? { productCode: { in: filter.productCodes } } : {}),
      },
      select: { monthlyQty: true },
    })
    .then((rows) =>
      rows.reduce((acc, r) => acc + r.monthlyQty.reduce((a, q) => a + Number(q), 0), 0),
    );

  const kpis: KpiValue[] = [
    { key: 'skuCount', labelMn: 'Нийт SKU', value: skuCount, format: 'int' },
    {
      key: 'salesValue',
      labelMn: 'Нийт борлуулалт (₮)',
      value: Number(salesAgg._sum.salesValue ?? 0),
      sub: '⚠️ өртгөөр (орлого байхгүй)',
      format: 'money',
    },
    { key: 'salesQty', labelMn: 'Борлуулалтын тоо', value: salesQty, format: 'int' },
    {
      key: 'stockQty',
      labelMn: 'Нийт нөөц',
      value: Number(agg._sum.currentStock ?? 0),
      format: 'int',
    },
    {
      key: 'stockValue',
      labelMn: 'Нөөцийн өртөг (₮)',
      value: Number(agg._sum.currentStockValue ?? 0),
      format: 'money',
    },
    // ⚠️ §28 — эх өгөгдөлд орлого байхгүй тул тоо ЗОХИОХГҮЙ
    {
      key: 'grossProfit',
      labelMn: 'Gross Profit',
      value: null,
      unavailableReason: REVENUE_MISSING_REASON,
      format: 'money',
    },
    {
      key: 'grossMargin',
      labelMn: 'Gross Margin %',
      value: null,
      unavailableReason: REVENUE_MISSING_REASON,
      format: 'percent',
    },
    {
      key: 'critical',
      labelMn: 'Нөөц дуусах эрсдэлтэй',
      value: statusCount('STOCKOUT_RISK'),
      sub: `${((statusCount('STOCKOUT_RISK') / positions) * 100).toFixed(1)}%`,
      format: 'int',
      tone: 'STOCKOUT_RISK',
    },
    {
      key: 'lowStock',
      labelMn: 'Нөөц багассан',
      value: statusCount('LOW_STOCK'),
      sub: `${((statusCount('LOW_STOCK') / positions) * 100).toFixed(1)}%`,
      format: 'int',
      tone: 'LOW_STOCK',
    },
    {
      key: 'excess',
      labelMn: 'Хэт их нөөцтэй',
      value: statusCount('OVERSTOCK'),
      sub: `${((statusCount('OVERSTOCK') / positions) * 100).toFixed(1)}%`,
      format: 'int',
      tone: 'OVERSTOCK',
    },
    {
      key: 'stagnant',
      labelMn: 'Хөдөлгөөнгүй',
      value: statusCount('NO_MOVEMENT'),
      sub: `${((statusCount('NO_MOVEMENT') / positions) * 100).toFixed(1)}%`,
      format: 'int',
      tone: 'NO_MOVEMENT',
    },
    {
      key: 'slowMoving',
      labelMn: 'Удаан эргэлттэй',
      value: statusCount('SLOW_MOVING'),
      sub: `${((statusCount('SLOW_MOVING') / positions) * 100).toFixed(1)}%`,
      format: 'int',
      tone: 'SLOW_MOVING',
    },
    {
      key: 'newPurchase',
      labelMn: 'Шинээр худалдан авах',
      value: agg._sum.newPurchaseQty ?? 0,
      sub: `${decisionCount('NEW_PURCHASE')} байрлал`,
      format: 'int',
    },
    {
      key: 'transfer',
      labelMn: 'Шилжүүлэх',
      value: agg._sum.transferInQty ?? 0,
      sub: `${decisionCount('TRANSFER')} байрлал`,
      format: 'int',
    },
  ];

  return {
    run: {
      id: run.id,
      calculationMonth: run.calculationMonth,
      periodsUsed: run.periodsUsed,
    },
    kpis,
    positions: agg._count._all,
    totals: {
      shortage: Number(agg._sum.shortage ?? 0),
      excess: Number(agg._sum.excess ?? 0),
    },
    byStatus: byStatus.map((s) => ({ code: s.stockStatus, count: s._count._all })),
    byDecision: byDecision.map((d) => ({ code: d.decision, count: d._count._all })),
  };
}

/** §6, §7 — ABCXYZ матриц / heatmap (нүд бүр 6 үзүүлэлттэй) */
export async function getAbcXyzMatrix(filter: DashboardFilter = {}) {
  const run = filter.runId
    ? await prisma.analysisRun.findUnique({ where: { id: filter.runId } })
    : await getLatestRun();
  if (!run) return null;

  const where = resultWhere(run.id, filter);

  const [invGroups, abcGroups, riskGroups] = await Promise.all([
    prisma.analysisResult.groupBy({
      by: ['abcXyz'],
      where,
      _sum: { currentStock: true, recommendedStock: true, shortage: true, excess: true },
      _count: { _all: true },
    }),
    prisma.abcXyzResult.groupBy({
      by: ['abcXyz'],
      where: {
        runId: run.id,
        ...(filter.productCodes?.length ? { productCode: { in: filter.productCodes } } : {}),
      },
      _sum: { salesValue: true },
      _count: { _all: true },
    }),
    prisma.analysisResult.groupBy({
      by: ['abcXyz'],
      where: { ...where, stockStatus: { not: 'OPTIMAL' } },
      _count: { _all: true },
    }),
  ]);

  const totalValue = abcGroups.reduce((acc, g) => acc + Number(g._sum.salesValue ?? 0), 0);
  const classes = ['AX', 'AY', 'AZ', 'BX', 'BY', 'BZ', 'CX', 'CY', 'CZ'];

  return {
    run: { id: run.id, calculationMonth: run.calculationMonth },
    totalSalesValue: totalValue,
    cells: classes.map((abcXyz) => {
      const inv = invGroups.find((g) => g.abcXyz === abcXyz);
      const abc = abcGroups.find((g) => g.abcXyz === abcXyz);
      const risk = riskGroups.find((g) => g.abcXyz === abcXyz);
      const salesValue = Number(abc?._sum.salesValue ?? 0);
      return {
        abcXyz,
        skuCount: abc?._count._all ?? 0,
        positions: inv?._count._all ?? 0,
        salesValue,
        salesShare: totalValue > 0 ? salesValue / totalValue : 0,
        currentStock: Number(inv?._sum.currentStock ?? 0),
        recommendedStock: Number(inv?._sum.recommendedStock ?? 0),
        shortage: Number(inv?._sum.shortage ?? 0),
        excess: Number(inv?._sum.excess ?? 0),
        riskCount: risk?._count._all ?? 0,
      };
    }),
  };
}

/** §8 — Нөөцийн тэнцвэр (count / % / qty / value) */
export async function getInventoryBalance(filter: DashboardFilter = {}) {
  const run = filter.runId
    ? await prisma.analysisRun.findUnique({ where: { id: filter.runId } })
    : await getLatestRun();
  if (!run) return null;

  const where = resultWhere(run.id, filter);
  const groups = await prisma.analysisResult.groupBy({
    by: ['stockStatus'],
    where,
    _sum: { currentStock: true, currentStockValue: true },
    _count: { _all: true },
  });

  const total = groups.reduce((acc, g) => acc + g._count._all, 0) || 1;

  return {
    total,
    rows: groups
      .map((g) => ({
        code: g.stockStatus,
        count: g._count._all,
        share: g._count._all / total,
        quantity: Number(g._sum.currentStock ?? 0),
        value: Number(g._sum.currentStockValue ?? 0),
      }))
      .sort((a, b) => b.count - a.count),
  };
}

/** §20 — Сарын борлуулалтын хандлага (тоо + дүн) */
export async function getSalesTrend(filter: DashboardFilter = {}) {
  const run = filter.runId
    ? await prisma.analysisRun.findUnique({ where: { id: filter.runId } })
    : await getLatestRun();
  if (!run) return null;

  const where = {
    periodKey: { in: run.periodsUsed },
    ...(filter.productCodes?.length
      ? { product: { productCode: { in: filter.productCodes } } }
      : {}),
    ...locationWhere(filter),
  };

  const [sales, purchases] = await Promise.all([
    prisma.salesFact.groupBy({
      by: ['periodKey'],
      where,
      _sum: { quantity: true, cogsAmount: true },
    }),
    prisma.purchaseFact.groupBy({
      by: ['periodKey'],
      where: {
        periodKey: { in: run.periodsUsed },
        ...(filter.productCodes?.length
          ? { product: { productCode: { in: filter.productCodes } } }
          : {}),
      },
      _sum: { quantity: true, amountExVat: true },
    }),
  ]);

  return {
    periods: run.periodsUsed,
    rows: run.periodsUsed.map((period) => {
      const s = sales.find((x) => x.periodKey === period);
      const p = purchases.find((x) => x.periodKey === period);
      return {
        period,
        salesQty: Number(s?._sum.quantity ?? 0),
        salesValue: Number(s?._sum.cogsAmount ?? 0),
        purchaseQty: Number(p?._sum.quantity ?? 0),
        purchaseValue: Number(p?._sum.amountExVat ?? 0),
        // ⚠️ §21 — сарын эхний/эцсийн үлдэгдэл эх өгөгдөлд БАЙХГҮЙ
        openingStock: null as number | null,
        closingStock: null as number | null,
        stockDays: null as number | null,
      };
    }),
    stockTrendUnavailableReason:
      'Сарын эхний/эцсийн үлдэгдэл эх өгөгдөлд байхгүй — Stock sheet-д зөвхөн нэг ' +
      'сарын snapshot (2026-06) байгаа. Олон сарын snapshot ачаалагдвал автоматаар гарна.',
  };
}

/** §22 — Байршил × ABCXYZ heatmap */
export async function getLocationBalance(filter: DashboardFilter = {}) {
  const run = filter.runId
    ? await prisma.analysisRun.findUnique({ where: { id: filter.runId } })
    : await getLatestRun();
  if (!run) return null;

  const where = resultWhere(run.id, filter);

  const [byLocation, byLocationClass] = await Promise.all([
    prisma.analysisResult.groupBy({
      by: ['locationId'],
      where,
      _sum: { currentStock: true, recommendedStock: true, shortage: true, excess: true },
      _count: { _all: true },
    }),
    prisma.analysisResult.groupBy({
      by: ['locationId', 'abcXyz'],
      where,
      _sum: { currentStock: true },
      _count: { _all: true },
    }),
  ]);

  const locations = await prisma.location.findMany({
    where: { id: { in: byLocation.map((l) => l.locationId) } },
    select: { id: true, code: true, type: true },
  });
  const byId = new Map(locations.map((l) => [l.id, l]));

  return {
    locations: byLocation
      .map((l) => {
        const loc = byId.get(l.locationId);
        const currentStock = Number(l._sum.currentStock ?? 0);
        const recommended = Number(l._sum.recommendedStock ?? 0);
        return {
          locationCode: loc?.code ?? '—',
          locationType: loc?.type ?? '—',
          positions: l._count._all,
          currentStock,
          recommendedStock: recommended,
          shortage: Number(l._sum.shortage ?? 0),
          excess: Number(l._sum.excess ?? 0),
          coverage: recommended > 0 ? currentStock / recommended : null,
        };
      })
      .sort((a, b) => a.locationCode.localeCompare(b.locationCode)),
    heatmap: byLocationClass.map((g) => ({
      locationCode: byId.get(g.locationId)?.code ?? '—',
      abcXyz: g.abcXyz,
      positions: g._count._all,
      currentStock: Number(g._sum.currentStock ?? 0),
    })),
  };
}

/** §19 — СИСТЕМ АВТОМАТААР ХАРИУЛНА */
export async function getAutoAnswers(filter: DashboardFilter = {}) {
  const run = filter.runId
    ? await prisma.analysisRun.findUnique({ where: { id: filter.runId } })
    : await getLatestRun();
  if (!run) return null;

  const where = resultWhere(run.id, filter);

  const [stockout, avgDays, purchase, transfer, stagnant, stop] = await Promise.all([
    prisma.analysisResult.count({ where: { ...where, stockStatus: 'STOCKOUT_RISK' } }),
    prisma.analysisResult.aggregate({
      where: { ...where, stockStatus: 'STOCKOUT_RISK' },
      _avg: { currentStockDays: true },
    }),
    prisma.analysisResult.aggregate({
      where: { ...where, newPurchaseQty: { gt: 0 } },
      _sum: { newPurchaseQty: true },
      _count: { _all: true },
    }),
    prisma.analysisResult.aggregate({
      where: { ...where, transferInQty: { gt: 0 } },
      _sum: { transferInQty: true },
      _count: { _all: true },
    }),
    prisma.analysisResult.count({ where: { ...where, stockStatus: 'NO_MOVEMENT' } }),
    prisma.analysisResult.count({ where: { ...where, decision: 'STOP_PURCHASE' } }),
  ]);

  return {
    questions: [
      {
        key: 'stockout',
        questionMn: 'Аль SKU нөөц дуусах эрсдэлтэй вэ?',
        answer: `${stockout}`,
        unitMn: 'байрлал',
        href: '/inventory?stockStatus=STOCKOUT_RISK',
      },
      {
        key: 'days',
        questionMn: 'Хэдэн хоногийн нөөц үлдсэн бэ?',
        answer:
          avgDays._avg.currentStockDays === null
            ? null
            : Number(avgDays._avg.currentStockDays).toFixed(1),
        unitMn: 'хоног (эрсдэлтэй байрлалын дундаж)',
        href: '/inventory?stockStatus=STOCKOUT_RISK',
      },
      {
        key: 'orderQty',
        questionMn: 'Хэдийг захиалах шаардлагатай вэ?',
        answer: `${purchase._sum.newPurchaseQty ?? 0}`,
        unitMn: 'ширхэг',
        href: '/inventory?decision=NEW_PURCHASE',
      },
      {
        key: 'newPurchase',
        questionMn: 'Шинээр татан авах уу?',
        answer: `${purchase._count._all}`,
        unitMn: 'байрлалд тийм',
        href: '/inventory?decision=NEW_PURCHASE',
      },
      {
        key: 'transfer',
        questionMn: 'Эсвэл өөр байршлаас шилжүүлэх үү?',
        answer: `${transfer._count._all}`,
        unitMn: `байрлалд боломжтой (${transfer._sum.transferInQty ?? 0} ш)`,
        href: '/inventory?decision=TRANSFER',
      },
      {
        key: 'stagnant',
        questionMn: 'Аль бараа хөдөлгөөнгүй байна?',
        answer: `${stagnant}`,
        unitMn: 'байрлал',
        href: '/inventory?stockStatus=NO_MOVEMENT',
      },
      {
        key: 'stop',
        questionMn: 'Аль барааны дахин татан авалтыг зогсоох вэ?',
        answer: `${stop}`,
        unitMn: 'байрлал',
        href: '/inventory?decision=STOP_PURCHASE',
      },
    ],
  };
}

/** §3 — server-side бүтээгдэхүүний хайлт (debounce-той хамт ажиллана) */
export async function searchProducts(query: string, take = 20) {
  const trimmed = query.trim();
  const rows = await prisma.product.findMany({
    where: trimmed
      ? {
          OR: [
            { productCode: { contains: trimmed, mode: 'insensitive' } },
            { name: { contains: trimmed, mode: 'insensitive' } },
          ],
        }
      : {},
    select: { productCode: true, name: true, manufacturerName: true },
    orderBy: { productCode: 'asc' },
    take: Math.min(take, 100),
  });

  const total = await prisma.product.count({
    where: trimmed
      ? {
          OR: [
            { productCode: { contains: trimmed, mode: 'insensitive' } },
            { name: { contains: trimmed, mode: 'insensitive' } },
          ],
        }
      : {},
  });

  return { total, rows };
}

/** §4 — шүүлтүүрийн сонголтууд (ХХК → байршлын төрөл → суваг/байршил → суваг) */
export async function getFilterOptions() {
  const [companies, locations, channels] = await Promise.all([
    prisma.company.findMany({
      select: { code: true, name: true },
      orderBy: { code: 'asc' },
    }),
    prisma.location.findMany({
      select: {
        code: true,
        name: true,
        type: true,
        company: { select: { code: true } },
        channel: { select: { code: true } },
      },
      orderBy: { code: 'asc' },
    }),
    prisma.channel.findMany({ select: { code: true, name: true }, orderBy: { code: 'asc' } }),
  ]);

  return {
    // ⚠️ Excel-д зөвхөн КОД байна, нэр байхгүй (docs/02) — UI кодоор харуулна
    companies: companies.map((c) => ({
      code: c.code,
      name: c.name,
      warehouseCount: locations.filter(
        (l) => l.company?.code === c.code && l.type === 'WAREHOUSE',
      ).length,
      pharmacyCount: locations.filter(
        (l) => l.company?.code === c.code && l.type === 'PHARMACY',
      ).length,
    })),
    locationTypes: [
      { code: 'WAREHOUSE', labelMn: 'Эм ханган нийлүүлэх төв' },
      { code: 'PHARMACY', labelMn: 'Эмийн сан' },
    ],
    locations: locations.map((l) => ({
      code: l.code,
      name: l.name,
      type: l.type,
      companyCode: l.company?.code ?? null,
      channelCode: l.channel?.code ?? null,
    })),
    channels,
    // ⚠️ §28 — эх өгөгдөлд сувгийн ТУСДАА хэмжээст байхгүй
    channelUnavailableReason:
      channels.length === 0
        ? 'Эх өгөгдөлд сувгийн тусдаа лавлах байхгүй. Excel-ийн "Суваг" багана нь ' +
          'бодит утгаараа БАЙРШЛЫН код (300120, 400137…) тул "Суваг / Байршил" ' +
          'сонголтод харагдаж байна.'
        : null,
  };
}
