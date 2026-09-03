/**
 * Import orchestration — DB + цэвэр функцүүдийг холбоно.
 *
 * ⚠️ Математик / дүрмийн логик ЭНД БАЙХГҮЙ. Тэдгээр нь:
 *      sheet-detector.ts · normalizers.ts · validators.ts
 *    гэсэн ЦЭВЭР модулиудад байна. Энэ файл зөвхөн дараалал, төлөв, DB бичилт.
 *
 * Урсгал:
 *   UPLOADING → (файл диск дээр, sheet detection)
 *   VALIDATING → (лавлах угсрах, мөр бүрийг шалгах)
 *   CLEANING   → (нормчлол + dedupe key)
 *   PROCESSING → (лавлах upsert + fact insert)
 *   COMPLETED / FAILED
 */

import { readFile } from 'node:fs/promises';

import { prisma } from '../../lib/prisma';
import { extensionOf, isSupportedExtension, readWorkbook } from '../../lib/excel/read-workbook';
import { storeOriginal } from '../../lib/upload-storage';
import { buildMasterIndex, persistMasters } from './master-resolver';
import { buildDedupeKey, businessTuple, normalizeRow } from './normalizers';
import { detectSheet, isFactDataset, rowToRoles } from './sheet-detector';
import { markDuplicates, rowStatusOf, validateRow } from './validators';
import type {
  Detection,
  MasterIdMaps,
  NormalizedRow,
  RawSheet,
  ValidationIssue,
} from './types';

const INSERT_CHUNK = 1000;
const MAX_STORED_ISSUES = 5000;

export class ImportError extends Error {}

// ─────────────────────────────────────────────────────────────
// 1. UPLOAD
// ─────────────────────────────────────────────────────────────

export interface UploadResult {
  sourceFileId: string;
  fileName: string;
  sizeBytes: number;
  sheetCount: number;
  totalRows: number;
  sheets: Array<{
    name: string;
    index: number;
    datasetType: string;
    confidence: number;
    rowCount: number;
    columnCount: number;
    columnMap: Record<string, string>;
    unmappedColumns: string[];
    reason: string;
  }>;
}

/**
 * Файлыг хүлээж авах: эх хувийг диск дээр хадгалж, sheet-үүдийг ТАНИНА.
 * Валидац / insert энд ХИЙГДЭХГҮЙ — тэр нь `processFile`-д.
 */
export async function uploadFile(
  buffer: Buffer,
  originalName: string,
  uploadedBy?: string,
): Promise<UploadResult> {
  if (!isSupportedExtension(originalName)) {
    throw new ImportError(
      `Дэмжигдээгүй файлын өргөтгөл: ${originalName}. Зөвхөн .xlsx, .xls хүлээн авна.`,
    );
  }

  const stored = await storeOriginal(buffer, originalName);
  const workbook = readWorkbook(buffer);
  const detections = workbook.sheets.map((s) => detectSheet(s.name, s.index, s.headers));

  const sourceFile = await prisma.sourceFile.create({
    data: {
      originalName,
      storagePath: stored.storagePath,
      sizeBytes: stored.sizeBytes,
      extension: extensionOf(originalName),
      fileHash: stored.fileHash,
      sheetCount: workbook.sheets.length,
      totalRows: workbook.totalRows,
      stage: 'UPLOADING',
      progressPct: 10,
      stageMessage: `${workbook.sheets.length} sheet танигдлаа`,
      uploadedBy: uploadedBy ?? null,
    },
    select: { id: true },
  });

  await prisma.importBatch.createMany({
    data: workbook.sheets.map((sheet, i) => {
      const det = detections[i]!;
      return {
        sourceFileId: sourceFile.id,
        fileName: originalName,
        fileHash: stored.fileHash,
        sheetName: sheet.name,
        sheetIndex: sheet.index,
        datasetType: det.datasetType,
        confidence: det.confidence,
        columnMap: det.columnMap,
        unmappedColumns: det.unmappedColumns,
        status: 'PENDING' as const,
        rowsRead: sheet.rows.length,
      };
    }),
  });

  await prisma.auditLog.create({
    data: {
      action: 'IMPORT_UPLOAD',
      entityType: 'SourceFile',
      entityId: sourceFile.id,
      actor: uploadedBy ?? null,
      metadata: {
        originalName,
        sizeBytes: stored.sizeBytes,
        sheetCount: workbook.sheets.length,
        totalRows: workbook.totalRows,
      },
    },
  });

  return {
    sourceFileId: sourceFile.id,
    fileName: originalName,
    sizeBytes: stored.sizeBytes,
    sheetCount: workbook.sheets.length,
    totalRows: workbook.totalRows,
    sheets: workbook.sheets.map((sheet, i) => {
      const det = detections[i]!;
      return {
        name: sheet.name,
        index: sheet.index,
        datasetType: det.datasetType,
        confidence: det.confidence,
        rowCount: sheet.rows.length,
        columnCount: sheet.headers.length,
        columnMap: det.columnMap,
        unmappedColumns: det.unmappedColumns,
        reason: det.reason,
      };
    }),
  };
}

// ─────────────────────────────────────────────────────────────
// 2. PROCESS
// ─────────────────────────────────────────────────────────────

async function setStage(
  sourceFileId: string,
  stage: 'VALIDATING' | 'CLEANING' | 'PROCESSING' | 'COMPLETED' | 'FAILED',
  progressPct: number,
  stageMessage: string,
): Promise<void> {
  await prisma.sourceFile.update({
    where: { id: sourceFileId },
    data: { stage, progressPct, stageMessage },
  });
}

interface PreparedSheet {
  sheet: RawSheet;
  detection: Detection;
  batchId: string;
  rows: NormalizedRow[];
  issues: ValidationIssue[];
  counts: { valid: number; warning: number; error: number };
}

export async function processFile(sourceFileId: string): Promise<void> {
  const sourceFile = await prisma.sourceFile.findUnique({
    where: { id: sourceFileId },
    include: { batches: true },
  });
  if (!sourceFile) throw new ImportError(`SourceFile олдсонгүй: ${sourceFileId}`);

  await prisma.sourceFile.update({
    where: { id: sourceFileId },
    data: { startedAt: new Date(), errorMessage: null },
  });

  try {
    // ── VALIDATING: эх файлыг дахин уншиж, лавлах угсарна ──
    await setStage(sourceFileId, 'VALIDATING', 20, 'Эх файлыг уншиж байна');

    const buffer = await readFile(sourceFile.storagePath);
    const workbook = readWorkbook(buffer);
    const detections = workbook.sheets.map((s) => detectSheet(s.name, s.index, s.headers));

    const batchBySheetIndex = new Map(sourceFile.batches.map((b) => [b.sheetIndex, b.id]));

    await setStage(sourceFileId, 'VALIDATING', 30, 'Лавлах өгөгдөл угсарч байна');
    const { master, issues: masterIssues } = buildMasterIndex(workbook.sheets, detections);

    // ── CLEANING: нормчлол + валидац + dedupe ──
    await setStage(sourceFileId, 'CLEANING', 40, 'Мөрүүдийг нормчилж, шалгаж байна');

    const prepared: PreparedSheet[] = [];
    let totalValid = 0;
    let totalWarning = 0;
    let totalError = 0;

    for (let i = 0; i < workbook.sheets.length; i += 1) {
      const sheet = workbook.sheets[i]!;
      const detection = detections[i]!;
      const batchId = batchBySheetIndex.get(sheet.index);
      if (!batchId) continue;

      if (!isFactDataset(detection.datasetType)) {
        await prisma.importBatch.update({
          where: { id: batchId },
          data: {
            status: detection.datasetType === 'UNKNOWN' ? 'SUCCESS' : 'SUCCESS',
            rowsRead: sheet.rows.length,
            rowsSkipped: detection.datasetType === 'UNKNOWN' ? sheet.rows.length : 0,
            finishedAt: new Date(),
          },
        });
        continue;
      }

      const columnMap = detection.columnMap;
      const rows = sheet.rows.map((raw) =>
        normalizeRow(detection.datasetType, rowToRoles(sheet.headers, columnMap, raw)),
      );

      const { occurrences, issues: dupIssues } = markDuplicates(
        detection.datasetType,
        rows,
        sheet.name,
      );
      const dupByRow = new Map<number, ValidationIssue[]>();
      for (const dup of dupIssues) {
        const list = dupByRow.get(dup.rowNo) ?? [];
        list.push(dup);
        dupByRow.set(dup.rowNo, list);
      }

      const sheetIssues: ValidationIssue[] = [];
      const counts = { valid: 0, warning: 0, error: 0 };

      rows.forEach((row, index) => {
        const rowNo = index + 2; // header = мөр 1
        const rowIssues = validateRow(
          detection.datasetType,
          row,
          sheet.name,
          rowNo,
          columnMap,
          master,
        );
        const dups = dupByRow.get(rowNo);
        if (dups) rowIssues.push(...dups);

        const status = rowStatusOf(rowIssues);
        row.rowStatus = status;
        row.sourceRowNo = rowNo;
        row.occurrenceIndex = occurrences[index] ?? 0;
        row.dedupeKey = buildDedupeKey(
          detection.datasetType,
          businessTuple(detection.datasetType, row),
          row.occurrenceIndex,
        );

        sheetIssues.push(...rowIssues);
        if (status === 'ERROR') counts.error += 1;
        else if (status === 'WARNING') counts.warning += 1;
        else counts.valid += 1;
      });

      totalValid += counts.valid;
      totalWarning += counts.warning;
      totalError += counts.error;

      prepared.push({ sheet, detection, batchId, rows, issues: sheetIssues, counts });
    }

    // Лавлахын түвшний асуудлуудыг эхний fact batch-д хавсаргана
    if (masterIssues.length > 0 && prepared.length > 0) {
      prepared[0]!.issues.push(...masterIssues);
    }

    await prisma.sourceFile.update({
      where: { id: sourceFileId },
      data: {
        rowsValid: totalValid,
        rowsWarning: totalWarning,
        rowsError: totalError,
        progressPct: 55,
        stageMessage: `Шалгалт дууслаа: ${totalValid} valid / ${totalWarning} warning / ${totalError} error`,
      },
    });

    // ── Валидацийн асуудлуудыг хадгална (Data Quality Dashboard-д) ──
    for (const item of prepared) {
      const toStore = item.issues.slice(0, MAX_STORED_ISSUES);
      for (let i = 0; i < toStore.length; i += INSERT_CHUNK) {
        await prisma.validationIssue.createMany({
          data: toStore.slice(i, i + INSERT_CHUNK).map((issue) => ({
            importBatchId: item.batchId,
            code: issue.code,
            severity: issue.severity,
            sheetName: issue.sheetName,
            rowNo: issue.rowNo,
            columnName: issue.columnName,
            value: issue.value,
            message: issue.message,
          })),
        });
      }
    }

    // ── PROCESSING: лавлах upsert + fact insert ──
    await setStage(sourceFileId, 'PROCESSING', 60, 'Лавлах өгөгдлийг хадгалж байна');

    const idMaps = await prisma.$transaction(async (tx) => persistMasters(tx, master), {
      maxWait: 20_000,
      timeout: 120_000,
    });

    let inserted = 0;
    for (const item of prepared) {
      const insertable = item.rows.filter((r) => r.rowStatus !== 'ERROR');
      const written = await insertFacts(item.detection.datasetType, insertable, item.batchId, idMaps);
      inserted += written;

      await prisma.importBatch.update({
        where: { id: item.batchId },
        data: {
          status: 'SUCCESS',
          rowsRead: item.sheet.rows.length,
          rowsValid: item.counts.valid,
          rowsWarning: item.counts.warning,
          rowsError: item.counts.error,
          rowsLoaded: written,
          rowsSkipped: item.counts.error,
          finishedAt: new Date(),
        },
      });

      await prisma.sourceFile.update({
        where: { id: sourceFileId },
        data: {
          progressPct: Math.min(95, 60 + Math.round((inserted / Math.max(1, totalValid + totalWarning)) * 35)),
          stageMessage: `${item.sheet.name}: ${written} мөр хадгалагдлаа`,
        },
      });
    }

    await prisma.sourceFile.update({
      where: { id: sourceFileId },
      data: {
        stage: 'COMPLETED',
        progressPct: 100,
        stageMessage: `Дууслаа: ${inserted} мөр хадгалагдав`,
        rowsInserted: inserted,
        finishedAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        action: 'IMPORT_PROCESS',
        entityType: 'SourceFile',
        entityId: sourceFileId,
        metadata: {
          rowsValid: totalValid,
          rowsWarning: totalWarning,
          rowsError: totalError,
          rowsInserted: inserted,
          products: master.products.size,
          locations: master.locations.size,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.sourceFile.update({
      where: { id: sourceFileId },
      data: {
        stage: 'FAILED',
        errorMessage: message,
        stageMessage: 'Боловсруулалт амжилтгүй',
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────
// 3. FACT INSERT (dedupe-тэй)
// ─────────────────────────────────────────────────────────────

async function insertFacts(
  datasetType: string,
  rows: NormalizedRow[],
  batchId: string,
  ids: MasterIdMaps,
): Promise<number> {
  let written = 0;

  const resolve = (row: NormalizedRow) => {
    const productId = row.productCode ? ids.productIdByCode.get(row.productCode) : undefined;
    const locationId = row.locationCode ? ids.locationIdByCode.get(row.locationCode) : undefined;
    const companyId = row.companyCode ? ids.companyIdByCode.get(row.companyCode) : undefined;
    return { productId, locationId, companyId };
  };

  if (datasetType === 'SALES') {
    const payload = rows.flatMap((row) => {
      const { productId, locationId, companyId } = resolve(row);
      if (!productId || !locationId || !companyId || !row.periodKey) return [];
      return [
        {
          productId,
          locationId,
          companyId,
          year: row.year!,
          month: row.month!,
          periodKey: row.periodKey,
          quantity: row.quantity ?? 0,
          cogsAmount: row.cogsAmount ?? 0,
          netSalesAmount: null,
          isReturn: row.isReturn ?? false,
          rowStatus: row.rowStatus ?? 'VALID',
          dedupeKey: row.dedupeKey!,
          occurrenceIndex: row.occurrenceIndex ?? 0,
          sourceRowNo: row.sourceRowNo ?? null,
          importBatchId: batchId,
        },
      ];
    });

    for (let i = 0; i < payload.length; i += INSERT_CHUNK) {
      const res = await prisma.salesFact.createMany({
        data: payload.slice(i, i + INSERT_CHUNK),
        skipDuplicates: true, // dedupeKey давхардвал алгасна
      });
      written += res.count;
    }
    return written;
  }

  if (datasetType === 'PURCHASE') {
    const payload = rows.flatMap((row) => {
      const { productId, locationId, companyId } = resolve(row);
      if (!productId || !locationId || !companyId || !row.periodKey) return [];
      const supplierId = row.supplierCode
        ? (ids.supplierIdByCode.get(row.supplierCode) ?? null)
        : null;
      return [
        {
          productId,
          locationId,
          companyId,
          supplierId,
          year: row.year!,
          month: row.month!,
          periodKey: row.periodKey,
          quantity: row.quantity ?? 0,
          amountExVat: row.amountExVat ?? 0,
          unitPrice: row.unitPrice ?? null,
          isReturn: row.isReturn ?? false,
          rowStatus: row.rowStatus ?? 'VALID',
          dedupeKey: row.dedupeKey!,
          occurrenceIndex: row.occurrenceIndex ?? 0,
          sourceRowNo: row.sourceRowNo ?? null,
          importBatchId: batchId,
        },
      ];
    });

    for (let i = 0; i < payload.length; i += INSERT_CHUNK) {
      const res = await prisma.purchaseFact.createMany({
        data: payload.slice(i, i + INSERT_CHUNK),
        skipDuplicates: true,
      });
      written += res.count;
    }
    return written;
  }

  if (datasetType === 'STOCK') {
    // Snapshot — дахин upload хийхэд ЗАСВАРЛАГДСАН утга шинэчлэгдэх ёстой тул upsert.
    for (const row of rows) {
      const { productId, locationId, companyId } = resolve(row);
      if (!productId || !locationId || !companyId || !row.periodKey) continue;

      await prisma.stockSnapshot.upsert({
        where: {
          productId_locationId_year_month: {
            productId,
            locationId,
            year: row.year!,
            month: row.month!,
          },
        },
        update: {
          quantityOnHand: row.quantityOnHand ?? 0,
          stockValue: row.stockValue ?? 0,
          unitCost: row.unitCost ?? null,
          rowStatus: row.rowStatus ?? 'VALID',
          dedupeKey: row.dedupeKey!,
          sourceRowNo: row.sourceRowNo ?? null,
          importBatchId: batchId,
        },
        create: {
          productId,
          locationId,
          companyId,
          year: row.year!,
          month: row.month!,
          periodKey: row.periodKey,
          quantityOnHand: row.quantityOnHand ?? 0,
          stockValue: row.stockValue ?? 0,
          unitCost: row.unitCost ?? null,
          rowStatus: row.rowStatus ?? 'VALID',
          dedupeKey: row.dedupeKey!,
          sourceRowNo: row.sourceRowNo ?? null,
          importBatchId: batchId,
        },
      });
      written += 1;
    }
    return written;
  }

  return 0;
}

// ─────────────────────────────────────────────────────────────
// 4. STATUS / ISSUES
// ─────────────────────────────────────────────────────────────

export async function getImportStatus(sourceFileId: string) {
  const file = await prisma.sourceFile.findUnique({
    where: { id: sourceFileId },
    include: { batches: { orderBy: { sheetIndex: 'asc' } } },
  });
  if (!file) return null;

  const summary = await prisma.validationIssue.groupBy({
    by: ['code', 'severity'],
    where: { importBatch: { sourceFileId } },
    _count: { _all: true },
  });

  return {
    id: file.id,
    fileName: file.originalName,
    sizeBytes: file.sizeBytes,
    sheetCount: file.sheetCount,
    totalRows: file.totalRows,
    stage: file.stage,
    progressPct: file.progressPct,
    stageMessage: file.stageMessage,
    errorMessage: file.errorMessage,
    quality: {
      valid: file.rowsValid,
      warning: file.rowsWarning,
      error: file.rowsError,
      total: file.rowsValid + file.rowsWarning + file.rowsError,
    },
    rowsInserted: file.rowsInserted,
    uploadedAt: file.uploadedAt,
    finishedAt: file.finishedAt,
    sheets: file.batches.map((b) => ({
      id: b.id,
      name: b.sheetName,
      index: b.sheetIndex,
      datasetType: b.datasetType,
      confidence: Number(b.confidence),
      rowsRead: b.rowsRead,
      rowsValid: b.rowsValid,
      rowsWarning: b.rowsWarning,
      rowsError: b.rowsError,
      rowsLoaded: b.rowsLoaded,
      columnMap: b.columnMap,
      unmappedColumns: b.unmappedColumns,
      status: b.status,
    })),
    issueSummary: summary
      .map((s) => ({ code: s.code, severity: s.severity, count: s._count._all }))
      .sort((a, b) =>
        a.severity === b.severity ? b.count - a.count : a.severity === 'ERROR' ? -1 : 1,
      ),
  };
}

export async function getImportIssues(
  sourceFileId: string,
  options: { severity?: 'WARNING' | 'ERROR'; code?: string; take?: number; skip?: number } = {},
) {
  const take = Math.min(options.take ?? 100, 500);
  const skip = options.skip ?? 0;

  const where = {
    importBatch: { sourceFileId },
    ...(options.severity ? { severity: options.severity } : {}),
    ...(options.code ? { code: options.code } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.validationIssue.count({ where }),
    prisma.validationIssue.findMany({
      where,
      orderBy: [{ severity: 'asc' }, { rowNo: 'asc' }],
      take,
      skip,
      select: {
        id: true,
        code: true,
        severity: true,
        sheetName: true,
        rowNo: true,
        columnName: true,
        value: true,
        message: true,
      },
    }),
  ]);

  return { total, take, skip, rows };
}
