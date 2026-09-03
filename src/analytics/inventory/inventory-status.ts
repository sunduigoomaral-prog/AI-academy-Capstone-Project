/**
 * INVENTORY STATUS + DECISION — ЦЭВЭР ФУНКЦҮҮД.
 *
 * Дүрмүүд `src/config/inventory-status-rules.json`-оос ирнэ:
 *   • дараалал (priority) ба параметрүүд (7 хоног, 1.5 коэффициент) ТОХИРУУЛАГДАНА
 *   • нөхцөлийн ХЭЛБЭР (condition.type) нь кодод нэрлэгдсэн предикат —
 *     дурын илэрхийлэл биш (аюулгүй байдал, тестлэгдэх чадвар)
 *
 * Python тал (`python/inventory/status.py`) ЯГ ИЖИЛ файлыг уншина.
 */

import rules from '../../config/inventory-status-rules.json';
import type { DecisionType, StockStatus, XyzClass } from '../../types/domain';

export interface StatusParams {
  daysPerMonth: number;
  stockoutDaysThreshold: number;
  overstockFactor: number;
}

export function defaultStatusParams(): StatusParams {
  return {
    daysPerMonth: rules.params.daysPerMonth,
    stockoutDaysThreshold: rules.params.stockoutDaysThreshold,
    overstockFactor: rules.params.overstockFactor,
  };
}

export interface StatusInput {
  averageMonthlySales: number;
  currentStockDays: number;
  currentStock: number;
  targetDays: number;
  xyz: XyzClass;
}

interface RuleDef {
  code: string;
  labelMn: string;
  priority: number;
  condition: { type: string; param?: string };
  rationaleMn: string;
}

const STATUS_RULES = [...(rules.statuses as RuleDef[])].sort((a, b) => a.priority - b.priority);
const DECISION_RULES = [...(rules.decisions as RuleDef[])].sort((a, b) => a.priority - b.priority);

/**
 * ⚠️ ХИЛИЙН ХҮЛЦЭЛ.
 *
 * Нөөцийн хоног нь нийлбэр / хуваалтаас гардаг тул хөвөгч таслалын чимээ
 * (1e-14 хэмжээний) агуулж болно. Ийм чимээ ангиллыг ӨӨРЧЛӨХ ёсгүй.
 *
 * Бодит тохиолдол: SKU 0107574 @ 300123 — нөөц яг 1 ширхэг, зорилт 15 хоног.
 *   PostgreSQL (Decimal) → stockDays = 15.0000          → Зохистой
 *   Float нийлбэр        → stockDays = 15.000000000000016 → Удаан эргэлттэй
 * Хоёр давхарга ижил хариу өгөхийн тулд харьцуулалтад EPSILON хэрэглэнэ.
 */
const EPSILON = 1e-9;

/** a > b гэж үзэх эсэх (чимээг тооцохгүй) */
function gt(a: number, b: number): boolean {
  return a > b + EPSILON;
}

/** a < b гэж үзэх эсэх */
function lt(a: number, b: number): boolean {
  return a < b - EPSILON;
}

/** a <= b гэж үзэх эсэх */
function lte(a: number, b: number): boolean {
  return a <= b + EPSILON;
}

/** a >= b гэж үзэх эсэх */
function gte(a: number, b: number): boolean {
  return a >= b - EPSILON;
}

function paramValue(name: string | undefined, params: StatusParams): number {
  if (name === 'stockoutDaysThreshold') return params.stockoutDaysThreshold;
  if (name === 'overstockFactor') return params.overstockFactor;
  if (name === 'daysPerMonth') return params.daysPerMonth;
  throw new Error(`Тодорхойлогдоогүй дүрмийн параметр: ${name}`);
}

/** Төлөвийн нэрлэгдсэн предикатууд */
function evaluateStatusCondition(
  type: string,
  param: string | undefined,
  input: StatusInput,
  params: StatusParams,
): boolean {
  const { averageMonthlySales, currentStockDays, targetDays, xyz } = input;

  switch (type) {
    case 'avgSalesIsZero':
      return averageMonthlySales === 0;

    case 'stockDaysLteThreshold':
      return lte(currentStockDays, paramValue(param, params));

    case 'stockDaysGtTargetTimesFactor':
      return gt(currentStockDays, targetDays * paramValue(param, params));

    case 'xyzIsZAndStockDaysGtTarget':
      return xyz === 'Z' && gt(currentStockDays, targetDays);

    case 'stockDaysLtTargetAndGtThreshold':
      return lt(currentStockDays, targetDays) && gt(currentStockDays, paramValue(param, params));

    case 'stockDaysBetweenTargetAndFactor':
      return (
        gte(currentStockDays, targetDays) &&
        lte(currentStockDays, targetDays * paramValue(param, params))
      );

    default:
      throw new Error(`Тодорхойлогдоогүй төлөвийн нөхцөл: ${type}`);
  }
}

export interface StatusResult {
  status: StockStatus;
  labelMn: string;
  rationaleMn: string;
}

/**
 * Эхний таарсан дүрэм ялна (priority өсөх дарааллаар).
 * Ямар ч дүрэм таарахгүй бол LOW_STOCK — учир нь үлдсэн ганц боломж нь
 * stockDays < targetDays бөгөөд threshold-оос доогуур биш тохиолдол.
 */
export function classifyStockStatus(
  input: StatusInput,
  params: StatusParams = defaultStatusParams(),
): StatusResult {
  for (const rule of STATUS_RULES) {
    if (evaluateStatusCondition(rule.condition.type, rule.condition.param, input, params)) {
      return {
        status: rule.code as StockStatus,
        labelMn: rule.labelMn,
        rationaleMn: rule.rationaleMn,
      };
    }
  }

  const fallback = STATUS_RULES.find((r) => r.code === 'LOW_STOCK');
  return {
    status: 'LOW_STOCK',
    labelMn: fallback?.labelMn ?? 'Нөөц багассан',
    rationaleMn: 'Бусад дүрэмд таараагүй — зорилтоос доогуур нөөц.',
  };
}

export interface DecisionInput extends StatusInput {
  stockStatus: StockStatus;
  transferInQty: number;
  newPurchaseQty: number;
}

/** Шийдвэрийн нэрлэгдсэн предикатууд */
function evaluateDecisionCondition(type: string, input: DecisionInput): boolean {
  switch (type) {
    case 'noMovementWithStock':
      // ⚠️ Бизнестэй тохирох шаардлагатай default — JSON дахь тайлбарыг үзнэ үү
      return input.averageMonthlySales === 0 && input.currentStock > 0;

    case 'overstockOrSlowMoving':
      // §14 — худалдан авалт зогсоох / бууруулах нөхцөл
      return input.stockStatus === 'OVERSTOCK' || input.stockStatus === 'SLOW_MOVING';

    case 'hasTransferQty':
      return input.transferInQty > 0;

    case 'hasPurchaseQty':
      return input.newPurchaseQty > 0;

    case 'always':
      return true;

    default:
      throw new Error(`Тодорхойлогдоогүй шийдвэрийн нөхцөл: ${type}`);
  }
}

export interface DecisionResult {
  decision: DecisionType;
  labelMn: string;
  reasonMn: string;
}

export function decide(input: DecisionInput): DecisionResult {
  for (const rule of DECISION_RULES) {
    if (evaluateDecisionCondition(rule.condition.type, input)) {
      return {
        decision: rule.code as DecisionType,
        labelMn: rule.labelMn,
        reasonMn: rule.rationaleMn,
      };
    }
  }
  return { decision: 'MONITOR', labelMn: 'Хяналтад байлгах', reasonMn: 'Дүрэм таараагүй.' };
}

/** §14 — худалдан авалт зогсоох ёстой эсэх (шийдвэрээс тусад нь шалгах хэрэгтэй үед) */
export function shouldStopPurchase(status: StockStatus): boolean {
  return status === 'OVERSTOCK' || status === 'SLOW_MOVING';
}

export const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  STATUS_RULES.map((r) => [r.code, r.labelMn]),
);

export const DECISION_LABELS: Record<string, string> = Object.fromEntries(
  DECISION_RULES.map((r) => [r.code, r.labelMn]),
);
