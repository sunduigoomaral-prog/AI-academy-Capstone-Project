/**
 * §25 EXCEL EXPORT — 17 sheet бүхий workbook (ExcelJS).
 *
 * ⚠️ Python хувилбартай (`python/export/excel_export.py`) ИЖИЛ бүтэц, ижил
 *    багана, ижил тоо. Тэр CLI хувилбар нь бодит өгөгдөл дээр шалгагдсан.
 *
 * ⚠️ §28: эх өгөгдөлд байхгүй утга "N/A" + шалтгаантай. Тоо ЗОХИОХГҮЙ.
 * ⚠️ §29: бүх өгөгдөл DB-ээс шүүгдэж, шаардлагатай хэсэг нь л уншигдана.
 */

import ExcelJS from 'exceljs';

import { prisma } from '../../lib/prisma';
import { REVENUE_MISSING_REASON } from '../../analytics/pricing/margin';
import { getLatestRun } from '../analysis/abc-xyz.service';
import { transferWhere } from '../dashboard/dashboard.service';
import type { DashboardFilter } from '../dashboard/dashboard.service';
import type { LocationType } from '../../types/domain';

// §26 өнгө (ARGB)
const C = {
  header: 'FF1E293B',
  headerText: 'FFFFFFFF',
  critical: 'FFFEE2E2',
  lowStock: 'FFFFEDD5',
  excess: 'FFF3E8FF',
  stagnant: 'FFE5E7EB',
  slowMoving: 'FFDBEAFE',
  healthy: 'FFDCFCE7',
  total: 'FFF1F5F9',
};

const ABC_XYZ_FILL: Record<string, string> = {
  AX: 'FFDCFCE7', AY: 'FFDCFCE7', AZ: 'FFFFEDD5',
  BX: 'FFDCFCE7', BY: 'FFFEF9C3', BZ: 'FFFFEDD5',
  CX: 'FFECFCCB', CY: 'FFFFEDD5', CZ: 'FFFEE2E2',
};

const STATUS_FILL: Record<string, string> = {
  STOCKOUT_RISK: C.critical,
  LOW_STOCK: C.lowStock,
  OVERSTOCK: C.excess,
  NO_MOVEMENT: C.stagnant,
  SLOW_MOVING: C.slowMoving,
  OPTIMAL: C.healthy,
};

const STATUS_LABEL: Record<string, string> = {
  STOCKOUT_RISK: 'Нөөц дуусах эрсдэлтэй',
  LOW_STOCK: 'Нөөц багассан',
  OVERSTOCK: 'Хэт их нөөцтэй',
  NO_MOVEMENT: 'Хөдөлгөөнгүй',
  SLOW_MOVING: 'Удаан эргэлттэй',
  OPTIMAL: 'Зохистой',
};

const DECISION_LABEL: Record<string, string> = {
  TRANSFER: 'Шилжүүлэх',
  NEW_PURCHASE: 'Шинээр худалдан авах',
  STOP_PURCHASE: 'Худалдан авалт зогсоох',
  MONITOR: 'Хяналтад байлгах',
  PROMOTION: 'Борлуулалт идэвхжүүлэх',
};

const NA = 'N/A';
const FMT_INT = '#,##0';
const FMT_DEC1 = '#,##0.0';
const FMT_DEC2 = '#,##0.00';
const FMT_PCT = '0.0%';

interface Col<T> {
  header: string;
  key: string;
  width?: number;
  fmt?: string;
  value: (row: T) => string | number | null;
  total?: boolean;
}

function addSheet<T>(
  wb: ExcelJS.Workbook,
  title: string,
  columns: Col<T>[],
  rows: T[],
  options: { subtitle?: string; fillBy?: (row: T) => string | undefined } = {},
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(title.slice(0, 31));
  let headerRow = 1;

  if (options.subtitle) {
    ws.mergeCells(1, 1, 1, Math.max(1, columns.length));
    const cell = ws.getCell(1, 1);
    cell.value = options.subtitle;
    cell.font = { italic: true, size: 9, color: { argb: 'FF475569' } };
    headerRow = 3;
  }

  const header = ws.getRow(headerRow);
  columns.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true, size: 10, color: { argb: C.headerText } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.header } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getColumn(i + 1).width = col.width ?? 14;
  });
  header.height = 30;

  rows.forEach((row, r) => {
    const fill = options.fillBy?.(row);
    const excelRow = ws.getRow(headerRow + 1 + r);
    columns.forEach((col, i) => {
      const cell = excelRow.getCell(i + 1);
      cell.value = col.value(row);
      if (col.fmt) cell.numFmt = col.fmt;
      if (fill) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });
  });

  // Нийлбэрийн мөр
  const totalCols = columns.filter((c) => c.total);
  if (rows.length > 0 && totalCols.length > 0) {
    const tr = ws.getRow(headerRow + rows.length + 1);
    tr.getCell(1).value = 'НИЙТ';
    columns.forEach((col, i) => {
      const cell = tr.getCell(i + 1);
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.total } };
      if (col.total) {
        const letter = ws.getColumn(i + 1).letter;
        cell.value = {
          formula: `SUM(${letter}${headerRow + 1}:${letter}${headerRow + rows.length})`,
        };
        cell.numFmt = col.fmt ?? FMT_INT;
      }
    });
  }

  if (rows.length > 0) {
    ws.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: headerRow + rows.length, column: columns.length },
    };
  } else {
    ws.getCell(headerRow + 1, 1).value = 'Өгөгдөл байхгүй';
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: headerRow }];
  return ws;
}

function kvSheet(
  wb: ExcelJS.Workbook,
  title: string,
  sections: Array<[string, Array<[string, string | number | null, string | null]>]>,
) {
  const ws = wb.addWorksheet(title.slice(0, 31));
  ws.getColumn(1).width = 44;
  ws.getColumn(2).width = 22;
  ws.getColumn(3).width = 60;

  let r = 1;
  for (const [sectionTitle, items] of sections) {
    ws.mergeCells(r, 1, r, 3);
    const cell = ws.getCell(r, 1);
    cell.value = sectionTitle;
    cell.font = { bold: true, size: 11, color: { argb: C.headerText } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.header } };
    r += 1;

    for (const [label, value, note] of items) {
      ws.getCell(r, 1).value = label;
      const valueCell = ws.getCell(r, 2);
      valueCell.value = value;
      valueCell.font = { bold: true, size: 10 };
      if (typeof value === 'number') valueCell.numFmt = FMT_INT;
      if (note) {
        ws.getCell(r, 3).value = note;
        ws.getCell(r, 3).font = { size: 9, color: { argb: 'FF64748B' } };
      }
      r += 1;
    }
    r += 1;
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

function resultWhere(runId: string, filter: DashboardFilter) {
  return {
    runId,
    ...(filter.productCodes?.length ? { productCode: { in: filter.productCodes } } : {}),
    ...(filter.locationType || filter.locationCodes?.length || filter.companyCodes?.length
      ? {
          location: {
            ...(filter.locationType ? { type: filter.locationType as LocationType } : {}),
            ...(filter.locationCodes?.length ? { code: { in: filter.locationCodes } } : {}),
            ...(filter.companyCodes?.length
              ? { company: { code: { in: filter.companyCodes } } }
              : {}),
          },
        }
      : {}),
  };
}

export async function buildWorkbook(
  filter: DashboardFilter = {},
): Promise<{ buffer: Buffer; fileName: string }> {
  const run = filter.runId
    ? await prisma.analysisRun.findUnique({ where: { id: filter.runId } })
    : await getLatestRun();
  if (!run) throw new Error('Тооцооллын үр дүн олдсонгүй. Эхлээд тооцоолол ажиллуулна уу.');

  const where = resultWhere(run.id, filter);
  const abcWhere = {
    runId: run.id,
    ...(filter.productCodes?.length ? { productCode: { in: filter.productCodes } } : {}),
  };

  const [results, abcRows, benchmarks, recommendations, transfers, batches, issues] =
    await Promise.all([
      prisma.analysisResult.findMany({
        where,
        include: { location: { select: { code: true, type: true } } },
        orderBy: [{ productCode: 'asc' }, { locationId: 'asc' }],
      }),
      prisma.abcXyzResult.findMany({ where: abcWhere, orderBy: { rank: 'asc' } }),
      prisma.purchasePriceBenchmark.findMany({
        where: abcWhere,
        include: { points: { orderBy: { lowestRank: 'asc' } } },
        orderBy: { potentialSaving: 'desc' },
      }),
      prisma.aIRecommendation.findMany({
        where: { runId: run.id, ...(filter.productCodes?.length
          ? { productCode: { in: filter.productCodes } } : {}) },
        orderBy: [{ priority: 'asc' }, { recommendedQuantity: 'desc' }],
      }),
      prisma.transferRecommendation.findMany({
        // ⚠️ Шүүлтүүрийг дагана — эх үүсвэр ЭСВЭЛ хүлээн авагч таарвал орно
        where: transferWhere(run.id, filter),
        include: {
          product: { select: { productCode: true, name: true } },
          fromLocation: { select: { code: true } },
          toLocation: { select: { code: true } },
        },
        orderBy: { suggestedQty: 'desc' },
      }),
      prisma.importBatch.findMany({ orderBy: { startedAt: 'desc' }, take: 10 }),
      prisma.validationIssue.groupBy({
        by: ['code', 'severity', 'sheetName'],
        _count: { _all: true },
      }),
    ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Inventory Intelligence & DSS';
  wb.created = new Date();

  const num = (v: unknown) => Number(v ?? 0);
  const sum = <T>(rows: T[], fn: (r: T) => number) => rows.reduce((a, r) => a + fn(r), 0);

  const totalSalesValue = sum(abcRows, (r) => num(r.salesValue));
  const byStatus = new Map<string, number>();
  for (const r of results) byStatus.set(r.stockStatus, (byStatus.get(r.stockStatus) ?? 0) + 1);

  // ── 1. Dashboard Summary ──
  kvSheet(wb, '1.Dashboard Summary', [
    ['ТООЦООЛЛЫН ПАРАМЕТР', [
      ['Тооцооны сар', run.calculationMonth, 'Энэ сар дундажид ОРОХГҮЙ'],
      ['Ашигласан сарууд', run.periodsUsed.join(', '), `${run.periodsUsed.length} бүтэн сар`],
      ['Тайлан үүсгэсэн', new Date().toISOString().slice(0, 16).replace('T', ' '), null],
      ['Шүүлтүүр — бүтээгдэхүүн', filter.productCodes?.length
        ? `${filter.productCodes.length} сонгосон` : 'Бүгд', null],
      ['Шүүлтүүр — ХХК', filter.companyCodes?.join(', ') ?? 'Бүгд', null],
      ['Шүүлтүүр — суваг/байршил', filter.locationCodes?.join(', ') ?? 'Бүгд', null],
    ]],
    ['ХАМРАХ ХҮРЭЭ', [
      ['Нийт SKU', abcRows.length, null],
      ['Байрлал (SKU × байршил)', results.length, null],
    ]],
    ['БОРЛУУЛАЛТ', [
      ['Нийт борлуулалт (₮)', totalSalesValue, '⚠️ Эх өгөгдөлд ОРЛОГО байхгүй — энэ нь COGS'],
      ['Борлуулалтын тоо', sum(abcRows, (r) =>
        r.monthlyQty.reduce((a, q) => a + num(q), 0)), null],
    ]],
    ['НӨӨЦ', [
      ['Нийт нөөц', sum(results, (r) => num(r.currentStock)), null],
      ['Нөөцийн өртөг (₮)', sum(results, (r) => num(r.currentStockValue)), null],
      ['Нийт дутагдал', sum(results, (r) => num(r.shortage)), null],
      ['Дутагдлын өртөг (₮)', sum(results, (r) => num(r.shortageValue)), null],
      ['Нийт илүүдэл', sum(results, (r) => num(r.excess)), null],
      ['Илүүдлийн өртөг (₮)', sum(results, (r) => num(r.excessValue)), null],
    ]],
    ['АШИГ (§7)', [
      ['Gross Profit', NA, REVENUE_MISSING_REASON],
      ['Gross Margin %', NA, REVENUE_MISSING_REASON],
    ]],
    ['ШИЙДВЭР', [
      ['Шилжүүлэх санал', transfers.length,
        `${sum(transfers, (t) => t.suggestedQty).toLocaleString()} ширхэг`],
      ['Шинээр худалдан авах', results.filter((r) => r.newPurchaseQty > 0).length,
        `${sum(results, (r) => r.newPurchaseQty).toLocaleString()} ширхэг`],
      ['Худалдан авалт зогсоох', results.filter((r) => r.decision === 'STOP_PURCHASE').length,
        null],
    ]],
    ['ҮНИЙН ХЯНАЛТ', [
      ['Benchmark хийсэн SKU', benchmarks.filter((b) => b.minUnitPrice !== null).length, null],
      ['Олон эх сурвалжтай SKU', benchmarks.filter((b) => b.sourceCount > 1).length, null],
      ['Боломжит хэмнэлт (₮)', sum(benchmarks, (b) => num(b.potentialSaving)), null],
      ['MARGIN RISK SKU', benchmarks.filter((b) => b.marginAtRisk).length, null],
    ]],
    ['НӨӨЦИЙН ТӨЛӨВ', Array.from(byStatus.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => [STATUS_LABEL[code] ?? code, count, null] as
        [string, number, null])],
  ]);

  // ── 2. SKU Analysis ──
  addSheet(wb, '2.SKU Analysis', [
    { header: 'SKU код', key: 'c', width: 12, value: (r) => r.productCode },
    { header: 'Бүтээгдэхүүн', key: 'n', width: 38, value: (r) => r.productName },
    { header: 'ABC', key: 'abc', width: 6, value: (r) => r.abcClass },
    { header: 'XYZ', key: 'xyz', width: 6, value: (r) => r.xyzClass },
    { header: 'ABCXYZ', key: 'ax', width: 9, value: (r) => r.abcXyz },
    { header: 'Борлуулалтын дүн', key: 'sv', width: 18, fmt: FMT_INT, total: true,
      value: (r) => num(r.salesValue) },
    { header: 'Эзлэх %', key: 'ss', width: 10, fmt: FMT_PCT, value: (r) => num(r.salesShare) },
    { header: 'Хуримтлагдсан %', key: 'cs', width: 14, fmt: FMT_PCT,
      value: (r) => num(r.cumulativeShare) },
    { header: 'Дундаж сарын тоо', key: 'avg', width: 16, fmt: FMT_DEC2,
      value: (r) => num(r.averageMonthlyQty) },
    { header: 'StdDev', key: 'sd', width: 12, fmt: FMT_DEC2, value: (r) => num(r.stdDev) },
    { header: 'CV', key: 'cv', width: 10, fmt: FMT_DEC2,
      value: (r) => (r.cv === null ? NA : num(r.cv)) },
    { header: 'Борлуулалттай сар', key: 'ms', width: 16, fmt: FMT_INT,
      value: (r) => r.monthsWithSales },
    { header: 'Төлөв', key: 'st', width: 14,
      value: (r) => (r.inventoryStatus === 'NO_MOVEMENT' ? 'Хөдөлгөөнгүй' : 'Идэвхтэй') },
  ], abcRows, {
    subtitle: 'ABC = борлуулалтын МӨНГӨН дүнгээр · XYZ = тоо хэмжээний хэлбэлзлээр (STDEV.P)',
    fillBy: (r) => ABC_XYZ_FILL[r.abcXyz],
  });

  // ── 3. ABCXYZ Analysis ──
  const classes = ['AX', 'AY', 'AZ', 'BX', 'BY', 'BZ', 'CX', 'CY', 'CZ'];
  const matrixRows = classes.map((abcXyz) => {
    const abcCell = abcRows.filter((r) => r.abcXyz === abcXyz);
    const invCell = results.filter((r) => r.abcXyz === abcXyz);
    const salesValue = sum(abcCell, (r) => num(r.salesValue));
    return {
      abcXyz,
      skuCount: abcCell.length,
      salesValue,
      salesShare: totalSalesValue > 0 ? salesValue / totalSalesValue : 0,
      salesQty: sum(abcCell, (r) => r.monthlyQty.reduce((a, q) => a + num(q), 0)),
      currentStock: sum(invCell, (r) => num(r.currentStock)),
      recommendedStock: sum(invCell, (r) => num(r.recommendedStock)),
      riskCount: invCell.filter((r) => r.stockStatus !== 'OPTIMAL').length,
    };
  });

  addSheet(wb, '3.ABCXYZ Analysis', [
    { header: 'ABCXYZ', key: 'a', width: 10, value: (r) => r.abcXyz },
    { header: 'SKU тоо', key: 'sc', width: 10, fmt: FMT_INT, total: true,
      value: (r) => r.skuCount },
    { header: 'Борлуулалтын дүн', key: 'sv', width: 18, fmt: FMT_INT, total: true,
      value: (r) => r.salesValue },
    { header: 'Эзлэх %', key: 'sh', width: 10, fmt: FMT_PCT, value: (r) => r.salesShare },
    { header: 'Борлуулалтын тоо', key: 'sq', width: 16, fmt: FMT_DEC1, total: true,
      value: (r) => r.salesQty },
    { header: 'Одоогийн нөөц', key: 'cs', width: 15, fmt: FMT_DEC1, total: true,
      value: (r) => r.currentStock },
    { header: 'Зохистой нөөц', key: 'rs', width: 15, fmt: FMT_DEC1, total: true,
      value: (r) => r.recommendedStock },
    { header: 'Эрсдэлтэй байрлал', key: 'rc', width: 16, fmt: FMT_INT, total: true,
      value: (r) => r.riskCount },
  ], matrixRows, {
    subtitle: '⭐ 9 хосолсон ангилал — дараагийн бүх нөөцийн тооцооллын үндэс',
    fillBy: (r) => ABC_XYZ_FILL[r.abcXyz],
  });

  // ── 4. Inventory Balance ──
  const balanceRows = Array.from(byStatus.entries()).map(([code, count]) => {
    const rows = results.filter((r) => r.stockStatus === code);
    return {
      code,
      labelMn: STATUS_LABEL[code] ?? code,
      count,
      share: results.length > 0 ? count / results.length : 0,
      quantity: sum(rows, (r) => num(r.currentStock)),
      value: sum(rows, (r) => num(r.currentStockValue)),
    };
  }).sort((a, b) => b.count - a.count);

  addSheet(wb, '4.Inventory Balance', [
    { header: 'Төлөв', key: 'l', width: 26, value: (r) => r.labelMn },
    { header: 'Байрлалын тоо', key: 'c', width: 14, fmt: FMT_INT, total: true,
      value: (r) => r.count },
    { header: 'Эзлэх %', key: 's', width: 10, fmt: FMT_PCT, value: (r) => r.share },
    { header: 'Тоо хэмжээ', key: 'q', width: 16, fmt: FMT_DEC1, total: true,
      value: (r) => r.quantity },
    { header: 'Өртөг', key: 'v', width: 18, fmt: FMT_INT, total: true, value: (r) => r.value },
  ], balanceRows, {
    subtitle: 'НӨӨЦИЙН ТЭНЦВЭР — төлөв тус бүрийн тоо, эзлэх хувь, тоо хэмжээ, өртөг',
    fillBy: (r) => STATUS_FILL[r.code],
  });

  // ── 5. Recommended Stock ──
  type Res = (typeof results)[number];
  const invCols: Col<Res>[] = [
    { header: 'SKU код', key: 'c', width: 12, value: (r) => r.productCode },
    { header: 'Бүтээгдэхүүн', key: 'n', width: 34, value: (r) => r.productName },
    { header: 'Байршил', key: 'l', width: 11, value: (r) => r.location.code },
    { header: 'Төрөл', key: 't', width: 12,
      value: (r) => (r.location.type === 'WAREHOUSE' ? 'Агуулах' : 'Эмийн сан') },
    { header: 'ABCXYZ', key: 'a', width: 9, value: (r) => r.abcXyz },
    { header: 'Дундаж/сар', key: 'avg', width: 13, fmt: FMT_DEC2,
      value: (r) => num(r.averageMonthlySales) },
    { header: 'Зорилтот хоног', key: 'td', width: 14, fmt: FMT_INT, value: (r) => r.targetDays },
    { header: 'Зорилтот сар', key: 'tm', width: 13, fmt: FMT_DEC2,
      value: (r) => num(r.targetMonths) },
    { header: 'Зохистой нөөц', key: 'rs', width: 15, fmt: FMT_DEC1, total: true,
      value: (r) => num(r.recommendedStock) },
    { header: 'Одоогийн нөөц', key: 'cs', width: 15, fmt: FMT_DEC1, total: true,
      value: (r) => num(r.currentStock) },
    { header: 'Нөөцийн хоног', key: 'cd', width: 14, fmt: FMT_DEC1,
      value: (r) => num(r.currentStockDays) },
    { header: 'Дутагдал', key: 'sh', width: 13, fmt: FMT_DEC1, total: true,
      value: (r) => num(r.shortage) },
    { header: 'Илүүдэл', key: 'ex', width: 13, fmt: FMT_DEC1, total: true,
      value: (r) => num(r.excess) },
    { header: 'Төлөв', key: 'st', width: 22,
      value: (r) => STATUS_LABEL[r.stockStatus] ?? r.stockStatus },
    { header: 'Шийдвэр', key: 'd', width: 22,
      value: (r) => DECISION_LABEL[r.decision] ?? r.decision },
  ];
  addSheet(wb, '5.Recommended Stock', invCols, results, {
    subtitle: 'Зохистой нөөц = дундаж сарын борлуулалт × (зорилтот хоног ÷ 30)',
    fillBy: (r) => STATUS_FILL[r.stockStatus],
  });

  // ── 6. Risk SKU ──
  const recByKey = new Map(
    recommendations.map((r) => [`${r.productCode}|${r.locationCode}`, r]),
  );
  const riskRows = results
    .map((r) => ({ r, rec: recByKey.get(`${r.productCode}|${r.location.code}`) }))
    .filter((x) => x.rec && (x.rec.priority === 'CRITICAL' || x.rec.priority === 'HIGH'))
    .sort((a, b) => num(b.r.shortageValue) - num(a.r.shortageValue));

  addSheet(wb, '6.Risk SKU', [
    { header: 'Priority', key: 'p', width: 10, value: (x) => x.rec!.priority },
    { header: 'SKU код', key: 'c', width: 12, value: (x) => x.r.productCode },
    { header: 'Бүтээгдэхүүн', key: 'n', width: 34, value: (x) => x.r.productName },
    { header: 'ABCXYZ', key: 'a', width: 9, value: (x) => x.r.abcXyz },
    { header: 'Байршил', key: 'l', width: 11, value: (x) => x.r.location.code },
    { header: 'Одоогийн нөөц', key: 'cs', width: 15, fmt: FMT_DEC1,
      value: (x) => num(x.r.currentStock) },
    { header: 'Нөөцийн хоног', key: 'cd', width: 14, fmt: FMT_DEC1,
      value: (x) => num(x.r.currentStockDays) },
    { header: 'Зорилтот хоног', key: 'td', width: 14, fmt: FMT_INT,
      value: (x) => x.r.targetDays },
    { header: 'Дутагдал', key: 'sh', width: 13, fmt: FMT_DEC1, total: true,
      value: (x) => num(x.r.shortage) },
    { header: 'Дутагдлын өртөг', key: 'sv', width: 16, fmt: FMT_INT, total: true,
      value: (x) => num(x.r.shortageValue) },
    { header: 'Эрсдэл', key: 'rk', width: 22, value: (x) => x.rec!.risk },
    { header: 'AI зөвлөмж', key: 'ac', width: 60, value: (x) => x.rec!.recommendedAction },
  ], riskRows, {
    subtitle: 'Эрсдэлийн зэрэг ба дутагдлын дүнгээр эрэмбэлэгдсэн',
    fillBy: (x) => (x.rec!.priority === 'CRITICAL' ? C.critical : C.lowStock),
  });

  // ── 7. Excess Inventory ──
  addSheet(wb, '7.Excess Inventory', [
    { header: 'SKU код', key: 'c', width: 12, value: (r) => r.productCode },
    { header: 'Бүтээгдэхүүн', key: 'n', width: 34, value: (r) => r.productName },
    { header: 'ABCXYZ', key: 'a', width: 9, value: (r) => r.abcXyz },
    { header: 'Байршил', key: 'l', width: 11, value: (r) => r.location.code },
    { header: 'Одоогийн нөөц', key: 'cs', width: 15, fmt: FMT_DEC1,
      value: (r) => num(r.currentStock) },
    { header: 'Зохистой нөөц', key: 'rs', width: 15, fmt: FMT_DEC1,
      value: (r) => num(r.recommendedStock) },
    { header: 'Илүүдэл', key: 'ex', width: 13, fmt: FMT_DEC1, total: true,
      value: (r) => num(r.excess) },
    { header: 'Илүүдлийн хоног', key: 'ed', width: 15, fmt: FMT_DEC1,
      value: (r) => Math.max(0, num(r.currentStockDays) - r.targetDays) },
    { header: 'Илүүдлийн өртөг', key: 'ev', width: 16, fmt: FMT_INT, total: true,
      value: (r) => (r.excessValue === null ? NA : num(r.excessValue)) },
    { header: 'Санал', key: 'd', width: 24,
      value: (r) => DECISION_LABEL[r.decision] ?? r.decision },
  ], results.filter((r) => num(r.excess) > 0).sort((a, b) =>
    num(b.excessValue) - num(a.excessValue)), {
    subtitle: 'Илүүдлийн хоног = одоогийн нөөцийн хоног − зорилтот хоног',
    fillBy: () => C.excess,
  });

  // ── 8. Stagnant Inventory ──
  addSheet(wb, '8.Stagnant Inventory', [
    { header: 'SKU код', key: 'c', width: 12, value: (r) => r.productCode },
    { header: 'Бүтээгдэхүүн', key: 'n', width: 34, value: (r) => r.productName },
    { header: 'Байршил', key: 'l', width: 11, value: (r) => r.location.code },
    { header: 'Одоогийн нөөц', key: 'cs', width: 15, fmt: FMT_DEC1, total: true,
      value: (r) => num(r.currentStock) },
    { header: 'Нөөцийн өртөг', key: 'sv', width: 16, fmt: FMT_INT, total: true,
      value: (r) => num(r.currentStockValue) },
    // ⚠️ §28 — эх өгөгдөлд ӨДРИЙН огноо байхгүй
    { header: 'Сүүлийн борлуулалтын огноо', key: 'ls', width: 24, value: () => NA },
    { header: 'Хэдэн хоног зарагдаагүй', key: 'ds', width: 22, value: () => NA },
    { header: 'Сүүлийн худалдан авалтын огноо', key: 'lp', width: 26, value: () => NA },
    { header: 'Санал', key: 'd', width: 30,
      value: () => 'Худалдан авалт зогсоох + борлуулалт идэвхжүүлэх / шилжүүлэх' },
  ], results.filter((r) => r.stockStatus === 'NO_MOVEMENT' && num(r.currentStock) > 0)
    .sort((a, b) => num(b.currentStockValue) - num(a.currentStockValue)), {
    subtitle:
      '⚠️ Missing source field: эх өгөгдөлд ӨДРИЙН огноо байхгүй (зөвхөн Он+Сар) тул ' +
      '"сүүлийн борлуулалтын огноо" ба "хэдэн хоног" тооцогдохгүй — N/A.',
    fillBy: () => C.stagnant,
  });

  // ── 9. Slow Moving ──
  addSheet(wb, '9.Slow Moving', [
    { header: 'SKU код', key: 'c', width: 12, value: (r) => r.productCode },
    { header: 'Бүтээгдэхүүн', key: 'n', width: 34, value: (r) => r.productName },
    { header: 'ABCXYZ', key: 'a', width: 9, value: (r) => r.abcXyz },
    { header: 'Байршил', key: 'l', width: 11, value: (r) => r.location.code },
    { header: 'Дундаж/сар', key: 'avg', width: 13, fmt: FMT_DEC2,
      value: (r) => num(r.averageMonthlySales) },
    { header: 'Одоогийн нөөц', key: 'cs', width: 15, fmt: FMT_DEC1, total: true,
      value: (r) => num(r.currentStock) },
    { header: 'Нөөцийн хоног', key: 'cd', width: 14, fmt: FMT_DEC1,
      value: (r) => num(r.currentStockDays) },
    { header: 'Зорилтот хоног', key: 'td', width: 14, fmt: FMT_INT, value: (r) => r.targetDays },
    { header: 'Илүүдэл', key: 'ex', width: 13, fmt: FMT_DEC1, total: true,
      value: (r) => num(r.excess) },
    { header: 'Төлөв', key: 'st', width: 22,
      value: (r) => STATUS_LABEL[r.stockStatus] ?? r.stockStatus },
  ], results.filter((r) => r.xyzClass === 'Z').sort((a, b) => num(b.excess) - num(a.excess)), {
    subtitle: 'XYZ = Z (эрэлт нь маш хэлбэлзэлтэй) бүх байрлал',
    fillBy: () => C.slowMoving,
  });

  // ── 10. Transfer Recommendation ──
  const shortageByKey = new Map(
    results.map((r) => [`${r.productCode}|${r.location.code}`, num(r.shortage)]),
  );
  const excessByKey = new Map(
    results.map((r) => [`${r.productCode}|${r.location.code}`, num(r.excess)]),
  );
  const transferInByKey = new Map(
    results.map((r) => [`${r.productCode}|${r.location.code}`, r.transferInQty]),
  );

  addSheet(wb, '10.Transfer Recommendation', [
    { header: 'Эрэмбэ', key: 'r', width: 8, fmt: FMT_INT, value: (t) => t.priorityRank },
    { header: 'SKU код', key: 'c', width: 12, value: (t) => t.product.productCode },
    { header: 'Бүтээгдэхүүн', key: 'n', width: 34, value: (t) => t.product.name },
    { header: 'Хаанаас', key: 'f', width: 11, value: (t) => t.fromLocation.code },
    { header: 'Хаашаа', key: 'to', width: 11, value: (t) => t.toLocation.code },
    { header: 'Эх үүсвэрийн илүүдэл', key: 'ss', width: 18, fmt: FMT_DEC1,
      value: (t) => excessByKey.get(`${t.product.productCode}|${t.fromLocation.code}`) ?? 0 },
    { header: 'Хүлээн авагчийн дутагдал', key: 'ds', width: 20, fmt: FMT_DEC1,
      value: (t) => shortageByKey.get(`${t.product.productCode}|${t.toLocation.code}`) ?? 0 },
    { header: 'Шилжүүлэх тоо', key: 'q', width: 14, fmt: FMT_INT, total: true,
      value: (t) => t.suggestedQty },
    { header: 'Үлдэх дутагдал', key: 'rem', width: 15, fmt: FMT_DEC1,
      value: (t) => Math.max(0,
        (shortageByKey.get(`${t.product.productCode}|${t.toLocation.code}`) ?? 0)
        - (transferInByKey.get(`${t.product.productCode}|${t.toLocation.code}`) ?? 0)) },
    { header: 'Дүн', key: 'v', width: 15, fmt: FMT_INT,
      value: (t) => (t.estimatedValue === null ? NA : num(t.estimatedValue)) },
    { header: 'Шалтгаан', key: 'why', width: 52, value: (t) => t.reason },
  ], transfers, {
    subtitle:
      'БАЙРШИЛ ХООРОНД ШИЛЖҮҮЛЭХ САНАЛ — тоо нь БҮХЭЛ, эх үүсвэрийн илүүдлээс хэтрэхгүй',
  });

  // ── 11. Purchase Recommendation ──
  addSheet(wb, '11.Purchase Recommendation', [
    { header: 'SKU код', key: 'c', width: 12, value: (r) => r.productCode },
    { header: 'Бүтээгдэхүүн', key: 'n', width: 34, value: (r) => r.productName },
    { header: 'ABCXYZ', key: 'a', width: 9, value: (r) => r.abcXyz },
    { header: 'Байршил', key: 'l', width: 11, value: (r) => r.location.code },
    { header: 'Одоогийн нөөц', key: 'cs', width: 15, fmt: FMT_DEC1,
      value: (r) => num(r.currentStock) },
    { header: 'Зохистой нөөц', key: 'rs', width: 15, fmt: FMT_DEC1,
      value: (r) => num(r.recommendedStock) },
    { header: 'Дутагдал', key: 'sh', width: 13, fmt: FMT_DEC1, total: true,
      value: (r) => num(r.shortage) },
    { header: 'Шилжүүлэг боломжтой', key: 'av', width: 18,
      value: (r) => (r.transferInQty > 0 ? 'Тийм' : 'Үгүй') },
    { header: 'Шилжүүлэх тоо', key: 'tq', width: 14, fmt: FMT_INT, total: true,
      value: (r) => r.transferInQty },
    { header: 'Худалдан авах тоо', key: 'pq', width: 16, fmt: FMT_INT, total: true,
      value: (r) => r.newPurchaseQty },
    { header: 'Шийдвэр', key: 'd', width: 24,
      value: (r) => DECISION_LABEL[r.decision] ?? r.decision },
  ], results.filter((r) => r.newPurchaseQty > 0 || r.transferInQty > 0
    || r.decision === 'STOP_PURCHASE')
    .sort((a, b) => num(b.shortageValue) - num(a.shortageValue)), {
    subtitle: 'ТАТАН АВАЛТЫН ШИЙДВЭР — эхлээд шилжүүлэг, дараа нь шинэ худалдан авалт',
    fillBy: (r) => STATUS_FILL[r.stockStatus],
  });

  // ── 12. Purchase Price Control ──
  const usableBench = benchmarks.filter((b) => b.minUnitPrice !== null);
  addSheet(wb, '12.Purchase Price Control', [
    { header: 'SKU код', key: 'c', width: 12, value: (b) => b.productCode },
    { header: 'Бүтээгдэхүүн', key: 'n', width: 34, value: (b) => b.productName },
    { header: 'Эх сурвалж', key: 'sc', width: 11, fmt: FMT_INT, value: (b) => b.sourceCount },
    { header: 'Хамгийн бага үнэ', key: 'mn', width: 16, fmt: FMT_DEC2,
      value: (b) => num(b.minUnitPrice) },
    { header: 'Хамгийн бага эх с.', key: 'mns', width: 16, value: (b) => b.minSourceKey },
    { header: 'Хамгийн өндөр үнэ', key: 'mx', width: 16, fmt: FMT_DEC2,
      value: (b) => num(b.maxUnitPrice) },
    { header: 'Хамгийн өндөр эх с.', key: 'mxs', width: 17, value: (b) => b.maxSourceKey },
    { header: 'Үнийн зөрүү', key: 'g', width: 14, fmt: FMT_DEC2, value: (b) => num(b.priceGap) },
    { header: 'Зөрүү %', key: 'gp', width: 11, fmt: FMT_DEC1, value: (b) => num(b.priceGapPct) },
    { header: 'Зэрэглэл', key: 'sev', width: 12, value: (b) => b.gapSeverity ?? '—' },
    { header: 'Одоогийн тоо', key: 'cq', width: 14, fmt: FMT_DEC1,
      value: (b) => num(b.currentQuantity) },
    { header: 'Одоогийн өртөг', key: 'cc', width: 16, fmt: FMT_INT, total: true,
      value: (b) => num(b.currentCost) },
    { header: 'Боломжит хэмнэлт', key: 'ps', width: 17, fmt: FMT_INT, total: true,
      value: (b) => num(b.potentialSaving) },
    { header: 'Өртгийн өөрчлөлт %', key: 'pc', width: 18, fmt: FMT_DEC1,
      value: (b) => (b.priceChangePct === null ? NA : num(b.priceChangePct)) },
    { header: 'MARGIN RISK', key: 'mr', width: 13, value: (b) => (b.marginAtRisk ? 'ТИЙМ' : '—') },
  ], usableBench, {
    subtitle:
      '⚠️ Эх сурвалж = НИЙЛҮҮЛЭГЧ (эх өгөгдөлд суваг байхгүй). ' +
      'Хэмнэлт = одоогийн худалдан авалтыг хамгийн бага үнээр авсан бол.',
    fillBy: (b) => (b.gapSeverity === 'CRITICAL' ? C.critical
      : b.gapSeverity === 'HIGH' ? C.lowStock : undefined),
  });

  // ── 13 / 14. Lowest & Highest TOP 3 ──
  type PointRow = {
    productCode: string; productName: string | null; rank: number; source: string;
    period: string; qty: number; amount: number; unitPrice: number;
  };
  const pointRows = (kind: 'low' | 'high'): PointRow[] =>
    usableBench.flatMap((b) =>
      b.points
        .filter((p) => (kind === 'low' ? p.lowestRank : p.highestRank) <= 3)
        .map((p) => ({
          productCode: b.productCode,
          productName: b.productName,
          rank: kind === 'low' ? p.lowestRank : p.highestRank,
          source: p.dimensionKey,
          period: p.lastPurchasePeriod,
          qty: num(p.quantity),
          amount: num(p.amount),
          unitPrice: num(p.unitPrice),
        })),
    ).sort((a, b) => a.productCode.localeCompare(b.productCode) || a.rank - b.rank);

  const priceCols: Col<PointRow>[] = [
    { header: 'SKU код', key: 'c', width: 12, value: (r) => r.productCode },
    { header: 'Бүтээгдэхүүн', key: 'n', width: 34, value: (r) => r.productName },
    { header: 'Эрэмбэ', key: 'r', width: 8, fmt: FMT_INT, value: (r) => r.rank },
    { header: 'Эх сурвалж (нийлүүлэгч)', key: 's', width: 20, value: (r) => r.source },
    { header: 'Сүүлийн худалдан авалт', key: 'p', width: 20, value: (r) => r.period },
    { header: 'Тоо', key: 'q', width: 12, fmt: FMT_DEC1, value: (r) => r.qty },
    { header: 'Дүн', key: 'a', width: 16, fmt: FMT_INT, value: (r) => r.amount },
    { header: 'Нэгж үнэ', key: 'u', width: 14, fmt: FMT_DEC2, value: (r) => r.unitPrice },
  ];
  addSheet(wb, '13.Lowest Price TOP 3', priceCols, pointRows('low'), {
    subtitle: '§3 — SKU бүрийн хамгийн БАГА нэгж үнэтэй TOP 3 эх сурвалж',
    fillBy: (r) => (r.rank === 1 ? C.healthy : undefined),
  });
  addSheet(wb, '14.Highest Price TOP 3', priceCols, pointRows('high'), {
    subtitle: '§4 — SKU бүрийн хамгийн ӨНДӨР нэгж үнэтэй TOP 3 эх сурвалж',
    fillBy: (r) => (r.rank === 1 ? C.critical : undefined),
  });

  // ── 15. Gross Margin Risk ──
  addSheet(wb, '15.Gross Margin Risk', [
    { header: 'SKU код', key: 'c', width: 12, value: (b) => b.productCode },
    { header: 'Бүтээгдэхүүн', key: 'n', width: 34, value: (b) => b.productName },
    { header: 'Зарах үнэ', key: 'sp', width: 14, value: () => NA },
    { header: 'Худалдан авалтын өртөг', key: 'pc', width: 20, fmt: FMT_DEC2,
      value: (b) => num(b.weightedAvgUnitPrice) },
    { header: 'Gross Profit', key: 'gp', width: 14, value: () => NA },
    { header: 'Gross Margin %', key: 'gm', width: 14, value: () => NA },
    { header: 'Хамгийн бага үнэ', key: 'mn', width: 16, fmt: FMT_DEC2,
      value: (b) => num(b.minUnitPrice) },
    { header: 'Одоогийн үнэ', key: 'cu', width: 14, fmt: FMT_DEC2,
      value: (b) => (b.points[0] ? num(b.points[0].unitPrice) : NA) },
    { header: 'Үнийн зөрүү', key: 'g', width: 14, fmt: FMT_DEC2, value: (b) => num(b.priceGap) },
    { header: 'Зөрүү %', key: 'gpc', width: 11, fmt: FMT_DEC1, value: (b) => num(b.priceGapPct) },
    { header: 'Боломжит алдагдал', key: 'ps', width: 18, fmt: FMT_INT, total: true,
      value: (b) => num(b.potentialSaving) },
    { header: 'Эрсдэлийн шалтгаан', key: 'rr', width: 60,
      value: (b) => (Array.isArray(b.marginRiskReasons)
        ? (b.marginRiskReasons as string[]).join(' · ') : '') },
  ], usableBench.filter((b) => b.marginAtRisk), {
    subtitle:
      '⚠️ Missing source field: Зарах үнэ / Gross Profit / Gross Margin эх өгөгдөлд БАЙХГҮЙ (N/A). ' +
      'Эрсдэлийг үнийн зөрүү ба өртгийн өсөлтөөр илрүүлсэн.',
    fillBy: () => C.critical,
  });

  // ── 16. AI Recommendation ──
  addSheet(wb, '16.AI Recommendation', [
    { header: 'Priority', key: 'p', width: 10, value: (r) => r.priority },
    { header: 'Эрсдэл', key: 'rk', width: 22, value: (r) => r.risk },
    { header: 'SKU код', key: 'c', width: 12, value: (r) => r.productCode },
    { header: 'Байршил', key: 'l', width: 11, value: (r) => r.locationCode },
    { header: 'WHY', key: 'w', width: 70, value: (r) => r.reason },
    { header: 'IMPACT', key: 'i', width: 70, value: (r) => r.impact },
    { header: 'ACTION', key: 'a', width: 70, value: (r) => r.recommendedAction },
    { header: 'Шилжүүлэх боломж', key: 'tp', width: 16,
      value: (r) => (r.transferPossible ? 'Тийм' : 'Үгүй') },
    { header: 'Худалдан авалт', key: 'pr', width: 15,
      value: (r) => (r.purchaseRequired ? 'Тийм' : 'Үгүй') },
    { header: 'Зогсоох', key: 'sp', width: 10,
      value: (r) => (r.stopPurchase ? 'Тийм' : 'Үгүй') },
    { header: 'Санал болгох тоо', key: 'q', width: 16, fmt: FMT_INT, total: true,
      value: (r) => r.recommendedQuantity },
    { header: 'Төлөв', key: 'st', width: 12, value: (r) => r.status },
  ], recommendations, {
    subtitle:
      '⚠️ AI нь тооцооллын үр дүнг ӨӨРЧЛӨӨГҮЙ — "Санал болгох тоо" нь engine-ийн ' +
      'бодсон шилжүүлэг / худалдан авалтын тоо.',
    fillBy: (r) => (r.priority === 'CRITICAL' ? C.critical
      : r.priority === 'HIGH' ? C.lowStock : undefined),
  });

  // ── 17. Data Quality ──
  const totalRows = batches.reduce((a, b) => a + b.rowsRead, 0);
  const validRows = batches.reduce((a, b) => a + b.rowsValid, 0);
  const warningRows = batches.reduce((a, b) => a + b.rowsWarning, 0);
  const errorRows = batches.reduce((a, b) => a + b.rowsError, 0);

  addSheet(wb, '17.Data Quality', [
    { header: 'Sheet', key: 's', width: 14, value: (i) => i.sheetName },
    { header: 'Дүрмийн код', key: 'c', width: 28, value: (i) => i.code },
    { header: 'Хүнд байдал', key: 'sv', width: 13, value: (i) => i.severity },
    { header: 'Тоо', key: 'n', width: 10, fmt: FMT_INT, total: true,
      value: (i) => i._count._all },
  ], issues.sort((a, b) => b._count._all - a._count._all), {
    subtitle:
      `Нийт ${totalRows.toLocaleString()} мөр · VALID ${validRows.toLocaleString()} · ` +
      `WARNING ${warningRows.toLocaleString()} · ERROR ${errorRows.toLocaleString()}`,
    fillBy: (i) => (i.severity === 'ERROR' ? C.critical : C.lowStock),
  });

  const buffer = (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  const fileName = `inventory-report-${run.calculationMonth}.xlsx`;
  return { buffer, fileName };
}
