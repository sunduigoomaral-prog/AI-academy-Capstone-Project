/**
 * Домэйн түвшний type-ууд. Prisma-аас хамааралгүй байлгасан нь
 * analytics давхарга (цэвэр функцүүд) DB-гүйгээр тестлэгдэх боломжтой байхын тулд.
 */

export type LocationType = 'WAREHOUSE' | 'PHARMACY';
export type Exclusivity = 'EX' | 'NON_EX';
export type AbcClass = 'A' | 'B' | 'C';
export type XyzClass = 'X' | 'Y' | 'Z';
export type AbcXyzClass = `${AbcClass}${XyzClass}`;
/**
 * ABC-г ямар МӨНГӨН үзүүлэлтээр ангилах.
 * ⚠️ QUANTITY сонголт ЗОРИУДААР БАЙХГҮЙ — ABC нь тоо хэмжээгээр хийгддэггүй.
 * REVENUE нь эх өгөгдөлд байхгүй (docs/01 §7) тул одоогоор COGS_VALUE ажиллана.
 */
export type AbcBasis = 'COGS_VALUE' | 'REVENUE';

/** ABC-XYZ тооцоонд ямар байршлын борлуулалтыг оруулах вэ */
export type SalesScope = 'ALL' | 'WAREHOUSE' | 'PHARMACY';

/**
 * SKU түвшний хөдөлгөөний тэмдэг (AbcXyzResult дээр).
 * NO_MOVEMENT = "Хөдөлгөөнгүй"
 */
export type InventoryStatus = 'ACTIVE' | 'NO_MOVEMENT';

/**
 * Бүтээгдэхүүн × байршил түвшний нөөцийн төлөв (AnalysisResult дээр).
 * ⚠️ `InventoryStatus`-аас ӨӨР — тэр нь SKU түвшний, энэ нь байршил түвшний.
 */
export type StockStatus =
  | 'NO_MOVEMENT'
  | 'STOCKOUT_RISK'
  | 'OVERSTOCK'
  | 'SLOW_MOVING'
  | 'LOW_STOCK'
  | 'OPTIMAL';

/** Шийдвэрийн төрөл */
export type DecisionType =
  | 'TRANSFER'
  | 'NEW_PURCHASE'
  | 'STOP_PURCHASE'
  | 'MONITOR'
  | 'PROMOTION';
export type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** "YYYY-MM" хэлбэрийн сарын түлхүүр */
export type PeriodKey = string;

export interface Period {
  year: number;
  month: number;
  key: PeriodKey;
}

export interface ProductRef {
  productCode: string;
  name: string;
  manufacturerName: string;
  exclusivity: Exclusivity;
}

export interface LocationRef {
  code: string;
  type: LocationType;
  companyCode: string;
}

/** Сар × бүтээгдэхүүн × байршил хүртэл нэгтгэсэн борлуулалт */
export interface MonthlySales {
  productCode: string;
  locationCode: string;
  period: PeriodKey;
  quantity: number;
  /** ⚠️ ӨРТӨГ (COGS), орлого биш */
  cogsAmount: number;
  /** Эх өгөгдөлд байхгүй — үргэлж null (docs/01 §7) */
  netSalesAmount: number | null;
}

export interface MonthlyPurchase {
  productCode: string;
  locationCode: string;
  supplierCode: string | null;
  period: PeriodKey;
  quantity: number;
  amountExVat: number;
  /** amountExVat / quantity, quantity = 0 үед null */
  unitPrice: number | null;
}

export interface StockPosition {
  productCode: string;
  locationCode: string;
  period: PeriodKey;
  quantityOnHand: number;
  stockValue: number;
  unitCost: number | null;
}

// ── Тооцооллын үр дүн ──────────────────────────────────────────

export interface AbcInputItem {
  productCode: string;
  /** Мөнгөн дүн (COGS-value). Тоо хэмжээ БИШ. */
  salesValue: number;
}

export interface AbcOutputItem {
  productCode: string;
  salesValue: number;
  /** salesValue / нийт salesValue */
  salesShare: number;
  /** Эрэмбийн дагуух хуримтлагдсан хувь (энэ SKU-г ОРУУЛААД) */
  cumulativeShare: number;
  abcClass: AbcClass;
  /** 1-ээс эхлэх эрэмбэ (мөнгөн дүнгээр буурахаар) */
  rank: number;
}

export interface XyzInputItem {
  productCode: string;
  /** Lookback сар бүрийн тоо хэмжээ. Борлуулалтгүй сар = 0. Урт нь сарын тоотой тэнцүү. */
  monthlyQty: number[];
}

export interface XyzOutputItem {
  productCode: string;
  monthlyQty: number[];
  averageMonthlyQty: number;
  /** Population standard deviation (STDEV.P) */
  stdDev: number;
  /** stdDev / |averageMonthlyQty|. Дундаж = 0 үед null. */
  cv: number | null;
  xyzClass: XyzClass;
  inventoryStatus: InventoryStatus;
  /** Борлуулалт бүхий сарын тоо (0-оос сарын тоо хүртэл) */
  monthsWithSales: number;
}

/** Нэг SKU-гийн бүрэн ABC-XYZ үр дүн */
export interface AbcXyzRow {
  productCode: string;
  productName: string | null;
  abc: AbcClass;
  xyz: XyzClass;
  abcXyz: AbcXyzClass;
  salesValue: number;
  salesShare: number;
  cumulativeShare: number;
  monthlyQty: number[];
  averageMonthlyQty: number;
  stdDev: number;
  cv: number | null;
  inventoryStatus: InventoryStatus;
  monthsWithSales: number;
  rank: number;
}

/** Нэг (бүтээгдэхүүн × байршил) байрлалын оролт */
export interface InventoryPosition {
  productCode: string;
  productName: string | null;
  locationCode: string;
  locationType: LocationType;
  /** Эх өгөгдөлд сувгийн хэмжээст байхгүй — ихэвчлэн null (docs/01 §5) */
  channelCode: string | null;
  companyCode: string | null;
  abc: AbcClass;
  xyz: XyzClass;
  abcXyz: AbcXyzClass;
  /** Тухайн БАЙРШЛЫН lookback дундаж сарын борлуулалт */
  averageMonthlySales: number;
  /** Calculation month дахь үлдэгдэл */
  currentStock: number;
  /** Үлдэгдлийн өртөг (мөнгөн дүнгийн нөлөө тооцоход) */
  currentStockValue: number;
  /** Нэгжийн өртөг — дутагдал/илүүдлийн мөнгөн дүнд */
  unitCost: number | null;
}

/** Нөөцийн балансын тооцооны үр дүн */
export interface StockBalance {
  targetDays: number;
  /** targetDays / daysPerMonth */
  targetMonths: number;
  /** averageMonthlySales × targetMonths */
  recommendedStock: number;
  currentStock: number;
  /**
   * (currentStock / averageMonthlySales) × daysPerMonth.
   * ⚠️ averageMonthlySales = 0 үед тодорхойлолтоор **0** (хязгааргүй биш) —
   *    шаардлагын §7-ын дагуу, төлөв нь "Хөдөлгөөнгүй" болно.
   */
  currentStockDays: number;
  /** MAX(recommended − current, 0) */
  shortage: number;
  /** MAX(current − recommended, 0) */
  excess: number;
}

/** Нэг байрлалын бүрэн шийдвэрийн мөр (§17 гаралт) */
export interface InventoryDecisionRow extends InventoryPosition, StockBalance {
  stockStatus: StockStatus;
  stockStatusLabelMn: string;
  /** Бусад байршлаас хүлээн авах нийт тоо (бүхэл) */
  transferInQty: number;
  /** Бусад байршил руу өгөх нийт тоо (бүхэл) */
  transferOutQty: number;
  /** CEILING(recommended − current − transferIn), сөрөг бол 0 */
  newPurchaseQty: number;
  decision: DecisionType;
  decisionLabelMn: string;
  decisionReasonMn: string;
  /** Дутагдлын мөнгөн дүн (unitCost мэдэгдэж байвал) */
  shortageValue: number | null;
  /** Илүүдлийн мөнгөн дүн */
  excessValue: number | null;
}

/** Нэг шилжүүлгийн санал */
export interface TransferPlanItem {
  productCode: string;
  fromLocationCode: string;
  toLocationCode: string;
  /** Бүхэл тоо */
  quantity: number;
  /** Эрэмбийн дугаар (1-ээс) */
  priorityRank: number;
  /** Аль давуу эрхийн шатанд үүссэн (SAME_COMPANY | CROSS_COMPANY) */
  tierCode: string;
  tierLabelMn: string;
  reasonMn: string;
  estimatedValue: number | null;
}

export interface RiskFlag {
  code: string;
  severity: Severity;
  message: string;
  /** Зөвхөн бодит тооцоолсон тоо — зохиомол утга оруулахгүй */
  evidence: Record<string, number | string | null>;
}

// ── Тохиргоо ──────────────────────────────────────────────────

export interface AnalysisSettings {
  calculationMonth: PeriodKey;
  lookbackMonths: number;
  daysPerMonth: number;
  abcBasis: AbcBasis;
  salesScope: SalesScope;
  abcAThreshold: number;
  abcBThreshold: number;
  xyzXThreshold: number;
  xyzYThreshold: number;
}

export interface PolicyKey {
  locationType: LocationType;
  abcClass: AbcClass;
  xyzClass: XyzClass;
}
