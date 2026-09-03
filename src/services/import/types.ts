/**
 * Import pipeline-ийн нийтлэг type-ууд.
 * Эдгээр нь `python/ingest/`-ийн буцаадаг бүтэцтэй ЯГ ИЖИЛ — хоёр давхаргын
 * үр дүнг тулгаж болно.
 */

export type DatasetType =
  | 'SALES'
  | 'PURCHASE'
  | 'STOCK'
  | 'PRODUCT'
  | 'LOCATION'
  | 'CHANNEL'
  | 'UNKNOWN';

export type RowStatus = 'VALID' | 'WARNING' | 'ERROR';
export type ValidationSeverity = 'WARNING' | 'ERROR';

export type ProcessingStage =
  | 'UPLOADING'
  | 'VALIDATING'
  | 'CLEANING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

/** Excel-ийн нэг sheet, түүхий хэлбэрээр */
export interface RawSheet {
  name: string;
  index: number;
  headers: (string | null)[];
  rows: unknown[][];
}

export interface WorkbookRead {
  sheets: RawSheet[];
  totalRows: number;
}

/** role → эх баганын БОДИТ нэр (Excel дээрхээр, өөрчлөгдөөгүй) */
export type ColumnMap = Record<string, string>;

export interface Detection {
  sheetName: string;
  sheetIndex: number;
  datasetType: DatasetType;
  confidence: number;
  columnMap: ColumnMap;
  unmappedColumns: string[];
  missingRequired: string[];
  reason: string;
}

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  sheetName: string;
  /** Excel дэх БОДИТ мөрийн дугаар (header = 1) */
  rowNo: number;
  columnName: string | null;
  value: string | null;
  message: string;
}

/** Нормчилсон мөр — dataset төрлөөс хамааран талбарууд нэмэгдэнэ */
export interface NormalizedRow {
  /** role → эх нүд хоосон биш эсэх. "хоосон" ба "буруу утга"-г ялгахад хэрэгтэй. */
  rawPresent: Record<string, boolean>;
  /** Утга БАЙГАА атлаа тоо болж хөрвөөгүй талбарууд */
  nonNumericFields: string[];

  productCode: string | null;
  productName: string | null;
  manufacturerName: string | null;
  exclusivity: 'EX' | 'NON_EX' | null;
  exclusivityRaw: string | null;
  year: number | null;
  month: number | null;
  periodKey: string | null;
  locationCode: string | null;
  locationType: 'WAREHOUSE' | 'PHARMACY' | null;
  locationTypeRaw: string | null;
  companyCode: string | null;

  // SALES
  quantity?: number | null;
  cogsAmount?: number | null;
  netSalesAmount?: number | null;
  unitCogs?: number | null;

  // PURCHASE
  supplierCode?: string | null;
  amountExVat?: number | null;
  unitPrice?: number | null;

  // STOCK
  quantityOnHand?: number | null;
  stockValue?: number | null;
  unitCost?: number | null;

  // CHANNEL / LOCATION master
  channelCode?: string | null;
  channelName?: string | null;
  locationName?: string | null;

  isReturn?: boolean;
  occurrenceIndex?: number;
  dedupeKey?: string;
  sourceRowNo?: number;
  rowStatus?: RowStatus;
}

export interface MasterIndex {
  products: Map<
    string,
    { name: string | null; manufacturerName: string | null; exclusivity: 'EX' | 'NON_EX' | null }
  >;
  locations: Map<string, { type: 'WAREHOUSE' | 'PHARMACY' | null; companyCode: string | null }>;
  channels: Map<string, { name: string | null }>;
  companies: Set<string>;
  suppliers: Set<string>;
  productSourceSheet: boolean;
  locationSourceSheet: boolean;
  channelSourceSheet: boolean;
}

/** Лавлахыг DB-д бичсэний дараах код → id хөрвүүлэгч */
export interface MasterIdMaps {
  productIdByCode: Map<string, string>;
  locationIdByCode: Map<string, string>;
  companyIdByCode: Map<string, string>;
  supplierIdByCode: Map<string, string>;
}

export interface SheetProcessResult {
  detection: Detection;
  rows: NormalizedRow[];
  issues: ValidationIssue[];
  counts: { valid: number; warning: number; error: number };
}

export interface QualityReport {
  file: { name: string; sizeBytes: number; sheetCount: number; totalRows: number };
  sheets: Array<
    Detection & {
      rowCount: number;
      columnCount: number;
      insertableRows: number;
    }
  >;
  masters: {
    products: number;
    locations: number;
    channels: number;
    productSourceSheet: boolean;
    locationSourceSheet: boolean;
    channelCheckSkipped: boolean;
  };
  quality: { valid: number; warning: number; error: number; total: number };
  issueSummary: Array<{ code: string; severity: ValidationSeverity; count: number }>;
  periodsAvailable: string[];
}
