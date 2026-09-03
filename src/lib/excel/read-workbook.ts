/**
 * Excel унших давхарга (infra).
 *
 * SheetJS (`xlsx`) ашигласан шалтгаан: `.xls` (хуучин BIFF) форматыг унших
 * шаардлагатай — ExcelJS зөвхөн `.xlsx` дэмждэг. ExcelJS нь дараагийн phase-ийн
 * Excel EXPORT-д ашиглагдана.
 *
 * ⚠️ Эх файлыг ЗӨВХӨН уншина, хэзээ ч бичихгүй.
 * ⚠️ `raw: true` — нүдний хадгалагдсан төрөл хэвээр ирнэ, ингэснээр текстээр
 *    хадгалагдсан бүтээгдэхүүний код ("0100139") тэргүүлэх 0-гоо алдахгүй.
 */

import * as XLSX from 'xlsx';

import type { RawSheet, WorkbookRead } from '../../services/import/types';

export const SUPPORTED_EXTENSIONS = ['.xlsx', '.xls'] as const;

export function isSupportedExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx === -1 ? '' : fileName.slice(idx).toLowerCase();
}

/**
 * Buffer-ээс workbook уншина.
 * Мөр бүхэлдээ хоосон бол алгасана (Excel-ийн "сүүлийн хоосон мөр"-үүд).
 */
export function readWorkbook(buffer: Buffer): WorkbookRead {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: true });

  const sheets: RawSheet[] = [];
  let totalRows = 0;

  wb.SheetNames.forEach((name, index) => {
    const ws = wb.Sheets[name];
    if (!ws) {
      sheets.push({ name, index, headers: [], rows: [] });
      return;
    }

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    });

    if (matrix.length === 0) {
      sheets.push({ name, index, headers: [], rows: [] });
      return;
    }

    const headerRow = matrix[0] ?? [];
    const headers = headerRow.map((h) => (h == null ? null : String(h)));
    const rows = matrix
      .slice(1)
      .filter((row) => row.some((cell) => cell !== null && cell !== undefined && cell !== ''));

    totalRows += rows.length;
    sheets.push({ name, index, headers, rows });
  });

  return { sheets, totalRows };
}
