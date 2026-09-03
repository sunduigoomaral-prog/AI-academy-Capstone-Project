/**
 * GROSS MARGIN + MARGIN RISK — ЦЭВЭР ФУНКЦҮҮД.
 *
 * §7  Gross Profit    = Sales Amount − Sales Cost
 *     Gross Margin %  = Gross Profit / Sales Amount × 100
 *
 * ⚠️ ЭХ ӨГӨГДӨЛД БОРЛУУЛАЛТЫН ОРЛОГО БАЙХГҮЙ (docs/01 §7).
 *    `Sales.Өртөг` нь COGS — нэгж утга нь худалдан авалтын нэгж үнэтэй
 *    median харьцаа 1.00. `sales_fact.net_sales_amount` бүгд NULL.
 *
 *    Шаардлагын §7 өөрөө «Хэрэв Sales Amount болон Sales Cost байгаа бол»
 *    гэж нөхцөлтэй заасан тул энэ модуль:
 *      • орлого БАЙВАЛ бодит ашиг/маржинг тооцно
 *      • БАЙХГҮЙ бол `null` буцааж, шалтгааныг тодорхой хэлнэ
 *    Хэзээ ч тоо ЗОХИОХГҮЙ.
 *
 * §8  MARGIN RISK — маржины МӨНГӨН дүнгүйгээр ч илрүүлж болох хоёр дохио:
 *       (1) эх сурвалж хоорондын үнийн зөрүү өндөр
 *       (2) нэгж өртөг тогтвортой өссөн
 *     Энэ нь ашгийн хэмжээ биш, ашиг БУУРАХ ЭРСДЭЛИЙН дохио.
 */

import config from '../../config/price-control-rules.json';

export interface MarginInput {
  /** Борлуулалтын ОРЛОГО. Эх өгөгдөлд байхгүй бол null. */
  salesAmount: number | null;
  /** Борлуулсан барааны өртөг (COGS). Энэ нь БАЙГАА. */
  salesCost: number | null;
}

export interface MarginResult {
  grossProfit: number | null;
  grossMarginPct: number | null;
  /** Тооцоолох боломжгүй бол шалтгаан — UI-д харуулна */
  unavailableReason: string | null;
}

export const REVENUE_MISSING_REASON =
  'Борлуулалтын орлогын багана эх өгөгдөлд байхгүй (Sales.Өртөг нь COGS). ' +
  'Орлогын өгөгдөл ачаалагдсаны дараа ашиг ба маржин автоматаар тооцогдоно.';

/**
 * §7 — орлого байвал тооцно, эс бөгөөс null.
 * ⚠️ Орлогын оронд өртгийг тавьж «маржин 0%» гэж ХЭЗЭЭ Ч харуулахгүй —
 *    энэ нь бодит биш дүгнэлт болно.
 */
export function computeMargin(input: MarginInput): MarginResult {
  if (input.salesAmount === null) {
    return { grossProfit: null, grossMarginPct: null, unavailableReason: REVENUE_MISSING_REASON };
  }
  if (input.salesCost === null) {
    return {
      grossProfit: null,
      grossMarginPct: null,
      unavailableReason: 'Борлуулсан барааны өртөг тодорхойлогдоогүй.',
    };
  }

  const grossProfit = input.salesAmount - input.salesCost;
  const grossMarginPct =
    input.salesAmount !== 0 ? (grossProfit / input.salesAmount) * 100 : null;

  return {
    grossProfit,
    grossMarginPct,
    unavailableReason:
      grossMarginPct === null ? 'Борлуулалтын орлого тэг тул маржин тодорхойлогдохгүй.' : null,
  };
}

export interface MarginRiskInput {
  priceGapPct: number | null;
  priceChangePct: number | null;
  /** Тухайн барааны борлуулалтын өртгийн дүн — нөлөөллийн хэмжээг эрэмбэлэхэд */
  cogsValue: number;
  potentialSaving: number | null;
}

export interface MarginRiskResult {
  isAtRisk: boolean;
  /** Аль дохио асаасныг тайлбарлана */
  reasons: string[];
  /** Мөнгөн нөлөөллийн ойролцоо хэмжээ (хэмнэж болох дүн) */
  estimatedImpact: number | null;
}

const RISK = config.marginRisk;

/**
 * §8 — MARGIN RISK flag.
 *
 * ⚠️ Ашгийн бодит хэмжээ тооцогдохгүй тул энэ нь ЭРСДЭЛИЙН ДОХИО.
 *    UI дээр «маржин X% болж буурна» гэж ХЭЛЭХГҮЙ — тийм тоо байхгүй.
 */
export function assessMarginRisk(input: MarginRiskInput): MarginRiskResult {
  const reasons: string[] = [];

  if (input.priceGapPct !== null && input.priceGapPct >= RISK.requiresGapPct) {
    reasons.push(
      `Эх сурвалж хоорондын үнийн зөрүү ${input.priceGapPct.toFixed(1)}% ` +
        `(босго ${RISK.requiresGapPct}%)`,
    );
  }

  if (input.priceChangePct !== null && input.priceChangePct >= RISK.requiresPriceIncreasePct) {
    reasons.push(
      `Нэгж өртөг ${input.priceChangePct.toFixed(1)}% өссөн ` +
        `(босго ${RISK.requiresPriceIncreasePct}%)`,
    );
  }

  return {
    isAtRisk: reasons.length > 0,
    reasons,
    estimatedImpact: input.potentialSaving,
  };
}
