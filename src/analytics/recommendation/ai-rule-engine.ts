/**
 * AI DECISION ENGINE — ЦЭВЭР ФУНКЦ (rule-based, LLM-ready).
 *
 * ⚠️ §10 ХАТУУ ДҮРЭМ:
 *    1. AI нь calculation engine-ийн үр дүнг ӨӨРЧЛӨХГҮЙ.
 *       `recommended_quantity` нь Phase 4-ийн бодсон transferQty / purchaseQty
 *       -аас ШУУД авагдана — энд дахин тооцоолохгүй.
 *    2. Эх өгөгдөл байхгүй үед ТОО ЗОХИОХГҮЙ. Маржин байхгүй бол null,
 *       шалтгаантайгаа хамт.
 *    3. AI зөвхөн ТАЙЛБАР (WHY / IMPACT / ACTION) нэмнэ.
 *
 * Дүрмүүд `src/config/price-control-rules.json` → `aiRules`-аас ирнэ.
 * Дараалал (priority) тохируулагдана; эхний таарсан дүрэм ялна.
 *
 * LLM-ready: `source` талбар нь RULE_ENGINE. Ирээдүйд LLM нэмэгдэхэд ижил
 * бүтэц рүү бичих ба `evidence` нь ЗӨВХӨН бодит тоо агуулна.
 */

import config from '../../config/price-control-rules.json';
import type { SalesTrend } from '../trend/sales-trend';

export type AiPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

/** §9 — AI engine-ийн оролт. Бүх утга ӨМНӨХ тооцооллоос ирнэ. */
export interface AiInput {
  productCode: string;
  productName: string | null;
  abc: string;
  xyz: string;
  abcXyz: string;
  locationCode: string;
  locationType: string;

  // Phase 4-ийн нөөцийн метрикүүд
  averageMonthlySales: number;
  currentStock: number;
  currentStockDays: number;
  targetDays: number;
  recommendedStock: number;
  shortage: number;
  excess: number;
  stockStatus: string;
  decision: string;
  transferInQty: number;
  newPurchaseQty: number;
  /** Өөр байршилд илүүдэл байгаа эсэх */
  transferAvailable: boolean;
  shortageValue: number | null;
  excessValue: number | null;

  // Хандлага
  salesTrend: SalesTrend;
  salesTrendPct: number | null;

  // Phase 5-ийн үнийн метрикүүд (benchmark байхгүй бол null)
  weightedAvgUnitPrice: number | null;
  minUnitPrice: number | null;
  maxUnitPrice: number | null;
  minSourceKey: string | null;
  priceGap: number | null;
  priceGapPct: number | null;
  priceChangePct: number | null;
  potentialSaving: number | null;

  // Маржин — эх өгөгдөлд орлого байхгүй бол null
  grossProfit: number | null;
  grossMarginPct: number | null;
  marginUnavailableReason: string | null;
  marginAtRisk: boolean;
  marginRiskReasons: string[];
}

/** §9 — гаралтын JSON бүтэц */
export interface AiRecommendation {
  risk: string;
  priority: AiPriority;
  reason: string;
  impact: string;
  recommended_action: string;
  transfer_possible: boolean;
  purchase_required: boolean;
  stop_purchase: boolean;
  recommended_quantity: number;
}

/** Дотоод хэрэглээнд — DB-д хадгалах нэмэлт мэдээлэлтэй */
export interface AiRecommendationRecord extends AiRecommendation {
  ruleCode: string;
  productCode: string;
  locationCode: string;
  /** ⚠️ ЗӨВХӨН бодит тооцоологдсон тоо. Зохиосон утга байхгүй. */
  evidence: Record<string, number | string | boolean | null>;
}

interface AiRuleDef {
  code: string;
  priority: number;
  risk: string;
  aiPriority: AiPriority;
  condition: { type: string };
  whyMn: string;
  impactMn: string;
  actionMn: string;
}

const AI_RULES = [...(config.aiRules as AiRuleDef[])].sort((a, b) => a.priority - b.priority);
const MARGIN_RISK = config.marginRisk;
const RULE_VERSION = `price-control-rules.json@v${config.version}`;

export function ruleEngineVersion(): string {
  return RULE_VERSION;
}

function evaluate(type: string, input: AiInput): boolean {
  switch (type) {
    case 'stockoutOnHighValue':
      return input.stockStatus === 'STOCKOUT_RISK' && input.abc === 'A';

    case 'stockoutRisk':
      return input.stockStatus === 'STOCKOUT_RISK' || input.stockStatus === 'LOW_STOCK';

    case 'deadStockWithValue':
      return input.stockStatus === 'NO_MOVEMENT' && input.currentStock > 0;

    case 'highPriceGap':
      return input.priceGapPct !== null && input.priceGapPct >= MARGIN_RISK.requiresGapPct;

    case 'priceIncrease':
      return (
        input.priceChangePct !== null &&
        input.priceChangePct >= MARGIN_RISK.requiresPriceIncreasePct
      );

    case 'overstock':
      return input.stockStatus === 'OVERSTOCK';

    case 'slowMoving':
      return input.stockStatus === 'SLOW_MOVING';

    case 'salesDeclining':
      return input.salesTrend === 'DECLINING';

    case 'always':
      return true;

    default:
      throw new Error(`Тодорхойлогдоогүй AI дүрмийн нөхцөл: ${type}`);
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('mn-MN', { maximumFractionDigits: 1 }).format(value);
}

/**
 * §11 — бизнесийн шийдвэрийн логик.
 * ⚠️ Тоог ДАХИН ТООЦОХГҮЙ — Phase 4-ийн үр дүнг шууд ашиглана.
 */
function resolveActions(input: AiInput): {
  transferPossible: boolean;
  purchaseRequired: boolean;
  stopPurchase: boolean;
  quantity: number;
} {
  const stopPurchase = input.decision === 'STOP_PURCHASE';
  const transferPossible = input.transferInQty > 0 || (input.shortage > 0 && input.transferAvailable);
  const purchaseRequired = input.newPurchaseQty > 0;

  // Санал болгох тоо: шилжүүлэг тэргүүн ээлжинд (§11), эс бөгөөс худалдан авалт
  let quantity = 0;
  if (input.transferInQty > 0) quantity = input.transferInQty;
  else if (input.newPurchaseQty > 0) quantity = input.newPurchaseQty;

  return { transferPossible, purchaseRequired, stopPurchase, quantity };
}

/** Дүрмийн ерөнхий тайлбарыг тухайн мөрийн БОДИТ тоогоор баяжуулна */
function buildReason(rule: AiRuleDef, input: AiInput): string {
  const parts = [rule.whyMn];

  switch (rule.code) {
    case 'STOCKOUT_CRITICAL':
    case 'STOCKOUT_RISK':
      parts.push(
        `${input.locationCode}: одоогийн нөөц ${formatNumber(input.currentStock)} ш = ` +
          `${formatNumber(input.currentStockDays)} хоног (зорилт ${input.targetDays} хоног), ` +
          `дутагдал ${formatNumber(input.shortage)} ш.`,
      );
      break;

    case 'DEAD_STOCK':
      parts.push(
        `${input.locationCode}: ${formatNumber(input.currentStock)} ш үлдэгдэлтэй атлаа ` +
          'сүүлийн хугацаанд дундаж борлуулалт 0.',
      );
      break;

    case 'PRICE_GAP_HIGH':
      if (input.priceGapPct !== null && input.minUnitPrice !== null && input.maxUnitPrice !== null) {
        parts.push(
          `Нэгж үнэ ${formatNumber(input.minUnitPrice)} … ${formatNumber(input.maxUnitPrice)} ` +
            `(зөрүү ${input.priceGapPct.toFixed(1)}%). Хамгийн хямд эх сурвалж: ` +
            `${input.minSourceKey ?? '—'}.`,
        );
      }
      break;

    case 'PRICE_INCREASE':
      if (input.priceChangePct !== null) {
        parts.push(`Нэгж өртөг ${input.priceChangePct.toFixed(1)}% өссөн.`);
      }
      break;

    case 'OVERSTOCK':
    case 'SLOW_MOVING':
      parts.push(
        `${input.locationCode}: ${formatNumber(input.currentStockDays)} хоногийн нөөц ` +
          `(зорилт ${input.targetDays} хоног), илүүдэл ${formatNumber(input.excess)} ш.`,
      );
      break;

    case 'SALES_DECLINING':
      if (input.salesTrendPct !== null) {
        parts.push(`Сүүлийн үеийн борлуулалт ${input.salesTrendPct.toFixed(1)}% өөрчлөгдсөн.`);
      }
      break;

    default:
      break;
  }

  return parts.join(' ');
}

/** Мөнгөн нөлөөллийг БОДИТ тоогоор илэрхийлнэ. Байхгүй бол чанарын тайлбар. */
function buildImpact(rule: AiRuleDef, input: AiInput): string {
  const parts = [rule.impactMn];

  if (rule.code === 'PRICE_GAP_HIGH' || rule.code === 'PRICE_INCREASE') {
    if (input.potentialSaving !== null && input.potentialSaving > 0) {
      parts.push(
        `Хамгийн бага үнээр авсан бол ${formatNumber(input.potentialSaving)} ₮ хэмнэгдэх байсан.`,
      );
    }
    // ⚠️ Маржины бодит хувийг ХЭЛЭХГҮЙ — орлогын өгөгдөл байхгүй
    if (input.marginUnavailableReason !== null) {
      parts.push(`(Ашгийн маржин тооцогдохгүй: ${input.marginUnavailableReason})`);
    }
  }

  if (rule.code === 'STOCKOUT_CRITICAL' || rule.code === 'STOCKOUT_RISK') {
    if (input.shortageValue !== null && input.shortageValue > 0) {
      parts.push(`Дутагдлын өртгийн дүн ${formatNumber(input.shortageValue)} ₮.`);
    }
  }

  if (rule.code === 'OVERSTOCK' || rule.code === 'SLOW_MOVING' || rule.code === 'DEAD_STOCK') {
    if (input.excessValue !== null && input.excessValue > 0) {
      parts.push(`Боогдсон хөрөнгө ${formatNumber(input.excessValue)} ₮.`);
    }
  }

  return parts.join(' ');
}

/** §11-ийн шийдвэрийн мөчлөгийг тусгасан үйлдлийн тайлбар */
function buildAction(
  rule: AiRuleDef,
  input: AiInput,
  actions: ReturnType<typeof resolveActions>,
): string {
  const parts = [rule.actionMn];

  if (actions.transferPossible && input.transferInQty > 0) {
    parts.push(`Шилжүүлэх тоо: ${formatNumber(input.transferInQty)} ш.`);
  } else if (actions.purchaseRequired) {
    parts.push(`Худалдан авах тоо: ${formatNumber(input.newPurchaseQty)} ш.`);
  }

  if (
    (rule.code === 'PRICE_GAP_HIGH' || rule.code === 'PRICE_INCREASE') &&
    input.minSourceKey !== null &&
    input.minUnitPrice !== null
  ) {
    parts.push(
      `Benchmark: ${input.minSourceKey} эх сурвалжийн ${formatNumber(input.minUnitPrice)} ₮ нэгж үнэ.`,
    );
  }

  return parts.join(' ');
}

/** Нэг байрлалын AI зөвлөмж */
export function recommend(input: AiInput): AiRecommendationRecord {
  const rule = AI_RULES.find((r) => evaluate(r.condition.type, input));
  if (!rule) {
    throw new Error('AI дүрэм таарсангүй — `always` нөхцөлтэй дүрэм байх ёстой.');
  }

  const actions = resolveActions(input);

  return {
    ruleCode: rule.code,
    productCode: input.productCode,
    locationCode: input.locationCode,
    risk: rule.risk,
    priority: rule.aiPriority,
    reason: buildReason(rule, input),
    impact: buildImpact(rule, input),
    recommended_action: buildAction(rule, input, actions),
    transfer_possible: actions.transferPossible,
    purchase_required: actions.purchaseRequired,
    stop_purchase: actions.stopPurchase,
    // ⚠️ Phase 4-ийн бодсон тоо — энд дахин тооцоолоогүй
    recommended_quantity: actions.quantity,
    evidence: {
      abcXyz: input.abcXyz,
      stockStatus: input.stockStatus,
      decision: input.decision,
      averageMonthlySales: input.averageMonthlySales,
      currentStock: input.currentStock,
      currentStockDays: input.currentStockDays,
      targetDays: input.targetDays,
      recommendedStock: input.recommendedStock,
      shortage: input.shortage,
      excess: input.excess,
      shortageValue: input.shortageValue,
      excessValue: input.excessValue,
      salesTrend: input.salesTrend,
      salesTrendPct: input.salesTrendPct,
      minUnitPrice: input.minUnitPrice,
      maxUnitPrice: input.maxUnitPrice,
      priceGapPct: input.priceGapPct,
      priceChangePct: input.priceChangePct,
      potentialSaving: input.potentialSaving,
      grossMarginPct: input.grossMarginPct,
      marginUnavailableReason: input.marginUnavailableReason,
      transferInQty: input.transferInQty,
      newPurchaseQty: input.newPurchaseQty,
    },
  };
}

export function recommendAll(inputs: readonly AiInput[]): AiRecommendationRecord[] {
  return inputs.map(recommend);
}

const PRIORITY_ORDER: Record<AiPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export function comparePriority(a: AiPriority, b: AiPriority): number {
  return PRIORITY_ORDER[a] - PRIORITY_ORDER[b];
}
