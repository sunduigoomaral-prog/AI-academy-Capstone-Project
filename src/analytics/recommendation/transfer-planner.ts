/**
 * TRANSFER PLANNER — ЦЭВЭР ФУНКЦ.
 *
 * §12: Дутагдалтай SKU дээр ЭХЛЭЭД өөр байршилд илүүдэл байгаа эсэхийг шалгана.
 *      Transfer Qty = MIN(Destination Shortage, Source Surplus) → CEILING
 *      ⚠️ Эх үүсвэрийн илүүдлээс ХЭТРҮҮЛЭХГҮЙ.
 *
 * ⭐ ДАВУУ ЭРХИЙН ШАТЛАЛ (`inventory-status-rules.json` → `transferPreference`):
 *      1. SAME_COMPANY    компани доторх сувгууд хооронд  ← ЭХНИЙ СОНГОЛТ
 *      2. CROSS_COMPANY   компани хооронд                 ← зөвшөөрсөн үед л
 *
 *    Дутагдлыг эхний шатнаас эхлэн нөхнө; тухайн шатанд илүүдэл хүрэлцэхгүй
 *    бол л дараагийн шат руу шилжинэ. Өөрөөр хэлбэл нэг ХХК-ийн дотоод
 *    нөөцийг БҮРЭН ашигласны дараа л өөр ХХК-аас авахыг санал болгоно.
 *
 *    ⚠️ Компани хооронд шилжүүлэх нь бодит байдалд ХУДАЛДАХ гүйлгээ болно.
 *       `allowCrossCompany = false` гэвэл 2-р шат бүхэлдээ алгасагдана.
 *
 * §15 Эрэмбэ (шат бүрийн дотор): 1) ижил SKU  2) эх үүсвэрийн илүүдэл их
 *      3) хүлээн авагчийн дутагдал их  4) байршлын priority  5) хамгийн ойр
 *
 *      ⚠️ 4 ба 5 нь эх өгөгдөлд БАЙХГҮЙ (Location-д priority, координат алга).
 *         Хиймэл утга зохиохгүй — эцсийн tie-break нь `locationCode`.
 */

import rules from '../../config/inventory-status-rules.json';
import { ceilQty, floorQty } from '../inventory/stock-balance';
import type { LocationType, TransferPlanItem } from '../../types/domain';

export interface TransferCandidate {
  productCode: string;
  locationCode: string;
  companyCode: string | null;
  locationType: LocationType;
  /** MAX(recommended − current, 0) */
  shortage: number;
  /** MAX(current − recommended, 0) */
  surplus: number;
  unitCost: number | null;
  /** Эх өгөгдөлд БАЙХГҮЙ — утга орвол эрэмбэд оролцоно (бага нь эхэнд) */
  locationPriority?: number | null;
}

export type CompanyScope = 'SAME' | 'DIFFERENT' | 'ANY';

export interface TransferTier {
  code: string;
  labelMn: string;
  /** SAME = нэг ХХК дотор · DIFFERENT = өөр ХХК хооронд · ANY = хамаарахгүй */
  companyScope: CompanyScope;
  /** Зөвхөн агуулах ↔ агуулах */
  bothWarehouse: boolean;
  enabled: boolean;
  noteMn?: string;
}

export interface TransferOptions {
  /**
   * Өөр ХХК-ийн байршил хооронд шилжүүлэхийг зөвшөөрөх эсэх.
   * `false` бол `CROSS_COMPANY` шат бүхэлдээ алгасагдана.
   */
  allowCrossCompany: boolean;
  /** Тохиргоог дарж бичих (тест / тусгай гүйлт) */
  tiers?: TransferTier[];
}

export function defaultTransferTiers(): TransferTier[] {
  return (rules.transferPreference.tiers as TransferTier[]).filter((t) => t.enabled);
}

export interface TransferPlan {
  items: TransferPlanItem[];
  /** locationCode → хүлээн авах нийт тоо */
  inByLocation: Map<string, number>;
  /** locationCode → өгөх нийт тоо */
  outByLocation: Map<string, number>;
  /** Шат тус бүрээр хэдэн ширхэг шилжсэн */
  byTier: Map<string, number>;
}

function emptyPlan(): TransferPlan {
  return {
    items: [],
    inByLocation: new Map(),
    outByLocation: new Map(),
    byTier: new Map(),
  };
}

function bump(map: Map<string, number>, key: string, value: number): void {
  map.set(key, (map.get(key) ?? 0) + value);
}

/** Тухайн хос нь энэ шатанд тохирох эсэх */
function matchesTier(
  tier: TransferTier,
  source: TransferCandidate,
  destination: TransferCandidate,
  allowCrossCompany: boolean,
): boolean {
  const sameCompany =
    source.companyCode !== null &&
    destination.companyCode !== null &&
    source.companyCode === destination.companyCode;

  // ⚠️ Глобал хамгаалалт — хориглосон бол ямар ч шатанд өөр ХХК хооронд явахгүй
  if (!allowCrossCompany && !sameCompany) return false;

  if (tier.companyScope === 'SAME' && !sameCompany) return false;
  if (tier.companyScope === 'DIFFERENT' && sameCompany) return false;

  if (tier.bothWarehouse) {
    return source.locationType === 'WAREHOUSE' && destination.locationType === 'WAREHOUSE';
  }
  return true;
}

function byMetric(
  a: TransferCandidate,
  b: TransferCandidate,
  metric: 'surplus' | 'shortage',
): number {
  if (b[metric] !== a[metric]) return b[metric] - a[metric];
  const pa = a.locationPriority ?? null;
  const pb = b.locationPriority ?? null;
  if (pa !== null && pb !== null && pa !== pb) return pa - pb;
  return a.locationCode.localeCompare(b.locationCode);
}

/**
 * НЭГ SKU-гийн шилжүүлгийн төлөвлөгөө.
 *
 * Шуналт (greedy) арга, шатлалтайгаар: шат бүрд дутагдал ихтэй байршлыг
 * эхэлж, илүүдэл ихтэй эх үүсвэрээс дүүргэнэ.
 */
export function planTransfersForSku(
  candidates: readonly TransferCandidate[],
  options: TransferOptions,
): TransferPlan {
  const plan = emptyPlan();
  // Cross-company хориглосон үед DIFFERENT шат бүхэлдээ утгагүй болно
  const tiers = (options.tiers ?? defaultTransferTiers()).filter(
    (tier) => options.allowCrossCompany || tier.companyScope !== 'DIFFERENT',
  );

  const destinations = candidates
    .filter((c) => c.shortage > 0)
    .sort((a, b) => byMetric(a, b, 'shortage'));
  const sources = candidates.filter((c) => c.surplus > 0).sort((a, b) => byMetric(a, b, 'surplus'));

  if (destinations.length === 0 || sources.length === 0 || tiers.length === 0) return plan;

  const remainingShortage = new Map(destinations.map((d) => [d.locationCode, d.shortage]));
  const remainingSurplus = new Map(sources.map((s) => [s.locationCode, s.surplus]));

  let rank = 0;

  // ⭐ Шат бүрийг БҮРЭН дуусгаад дараагийнх руу шилжинэ
  for (const tier of tiers) {
    for (const destination of destinations) {
      for (const source of sources) {
        if (source.locationCode === destination.locationCode) continue;
        if (!matchesTier(tier, source, destination, options.allowCrossCompany)) continue;

        const need = remainingShortage.get(destination.locationCode) ?? 0;
        const available = remainingSurplus.get(source.locationCode) ?? 0;
        if (need <= 0) break;
        if (available <= 0) continue;

        // §12 — MIN(дутагдал, илүүдэл), дараа нь CEILING
        let quantity = ceilQty(Math.min(need, available));

        // ⚠️ CEILING нь эх үүсвэрийн илүүдлээс давбал FLOOR руу буулгана.
        //    Байхгүй барааг шилжүүлэх боломжгүй — физик хязгаар давамгайлна.
        if (quantity > available) quantity = floorQty(available);
        if (quantity <= 0) continue;

        rank += 1;
        plan.items.push({
          productCode: destination.productCode,
          fromLocationCode: source.locationCode,
          toLocationCode: destination.locationCode,
          quantity,
          priorityRank: rank,
          tierCode: tier.code,
          tierLabelMn: tier.labelMn,
          reasonMn:
            `${tier.labelMn}: ${source.locationCode} дээр ${available.toFixed(2)} илүүдэл, ` +
            `${destination.locationCode} дээр ${need.toFixed(2)} дутагдал`,
          estimatedValue:
            destination.unitCost !== null
              ? quantity * destination.unitCost
              : source.unitCost !== null
                ? quantity * source.unitCost
                : null,
        });

        bump(plan.inByLocation, destination.locationCode, quantity);
        bump(plan.outByLocation, source.locationCode, quantity);
        bump(plan.byTier, tier.code, quantity);

        remainingShortage.set(destination.locationCode, Math.max(0, need - quantity));
        remainingSurplus.set(source.locationCode, Math.max(0, available - quantity));
      }
    }
  }

  return plan;
}

/** Бүх SKU-гийн шилжүүлгийг төлөвлөнө */
export function planTransfers(
  candidatesBySku: Map<string, TransferCandidate[]>,
  options: TransferOptions,
): TransferPlan {
  const combined = emptyPlan();

  for (const candidates of candidatesBySku.values()) {
    const plan = planTransfersForSku(candidates, options);
    combined.items.push(...plan.items);
    for (const [location, qty] of plan.inByLocation) bump(combined.inByLocation, location, qty);
    for (const [location, qty] of plan.outByLocation) bump(combined.outByLocation, location, qty);
    for (const [tier, qty] of plan.byTier) bump(combined.byTier, tier, qty);
  }

  return combined;
}
