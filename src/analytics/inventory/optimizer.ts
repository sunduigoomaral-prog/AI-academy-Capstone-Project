/**
 * INVENTORY OPTIMIZER — ЦЭВЭР ФУНКЦ (DB, React ашиглахгүй).
 *
 * Дараалал:
 *   1. Байрлал бүрийн баланс (recommended / stockDays / shortage / excess)
 *   2. SKU бүрээр шилжүүлгийн төлөвлөгөө (дутагдлыг ЭХЛЭЭД илүүдлээр хаана)
 *   3. Шилжүүлгээр хаагдаагүй дутагдалд шинэ худалдан авалт
 *   4. Нөөцийн төлөв (шилжүүлгийн ӨМНӨХ байдлаар — энэ нь ОНОШ)
 *   5. Шийдвэр
 *
 * ⚠️ Төлөвийг шилжүүлгийн ӨМНӨХ үлдэгдлээр тодорхойлно. Шилжүүлэг бол
 *    санал болгож буй арга хэмжээ; онош нь одоогийн бодит байдлыг тусгах ёстой.
 */

import {
  classifyStockStatus,
  decide,
  defaultStatusParams,
  type StatusParams,
} from './inventory-status';
import { computeBalance, newPurchaseQty } from './stock-balance';
import {
  planTransfers,
  type TransferCandidate,
  type TransferOptions,
  type TransferPlan,
} from '../recommendation/transfer-planner';
import type {
  InventoryDecisionRow,
  InventoryPosition,
  PolicyKey,
} from '../../types/domain';

export interface OptimizerOptions {
  /** (locationType, abc, xyz) → targetDays. DB-ээс ирнэ, hardcode БАЙХГҮЙ. */
  resolveTargetDays: (key: PolicyKey) => number;
  statusParams?: StatusParams;
  transfer?: TransferOptions;
}

export interface OptimizerResult {
  rows: InventoryDecisionRow[];
  transfers: TransferPlan;
  summary: {
    positions: number;
    skus: number;
    locations: number;
    totalShortage: number;
    totalExcess: number;
    totalTransferQty: number;
    totalPurchaseQty: number;
    byStatus: Record<string, number>;
    byDecision: Record<string, number>;
    /** Шилжүүлгийн давуу эрхийн шат тус бүрийн тоо хэмжээ */
    transferByTier: Record<string, number>;
  };
}

export function optimizeInventory(
  positions: readonly InventoryPosition[],
  options: OptimizerOptions,
): OptimizerResult {
  const statusParams = options.statusParams ?? defaultStatusParams();
  const transferOptions = options.transfer ?? { allowCrossCompany: true };

  // ── 1. Баланс ──
  const balances = positions.map((position) => {
    const targetDays = options.resolveTargetDays({
      locationType: position.locationType,
      abcClass: position.abc,
      xyzClass: position.xyz,
    });

    return {
      position,
      balance: computeBalance({
        averageMonthlySales: position.averageMonthlySales,
        currentStock: position.currentStock,
        targetDays,
        daysPerMonth: statusParams.daysPerMonth,
      }),
    };
  });

  // ── 2. Шилжүүлэг (SKU бүрээр) ──
  const candidatesBySku = new Map<string, TransferCandidate[]>();
  for (const { position, balance } of balances) {
    const list = candidatesBySku.get(position.productCode) ?? [];
    list.push({
      productCode: position.productCode,
      locationCode: position.locationCode,
      companyCode: position.companyCode,
      locationType: position.locationType,
      shortage: balance.shortage,
      surplus: balance.excess,
      unitCost: position.unitCost,
    });
    candidatesBySku.set(position.productCode, list);
  }

  const transfers = planTransfers(candidatesBySku, transferOptions);

  // ── 3–5. Худалдан авалт, төлөв, шийдвэр ──
  const byStatus: Record<string, number> = {};
  const byDecision: Record<string, number> = {};
  let totalShortage = 0;
  let totalExcess = 0;
  let totalPurchaseQty = 0;

  // ⚠️ transfers.inByLocation нь БАЙРШЛЫН нийлбэр. Мөр бүр (SKU × байршил)
  //    түвшний тоог шаарддаг тул урьдчилж индексжүүлнэ (O(n) хайлт).
  const inBySkuLocation = new Map<string, number>();
  const outBySkuLocation = new Map<string, number>();
  const key = (productCode: string, locationCode: string) => `${productCode}|${locationCode}`;

  for (const item of transfers.items) {
    const inKey = key(item.productCode, item.toLocationCode);
    const outKey = key(item.productCode, item.fromLocationCode);
    inBySkuLocation.set(inKey, (inBySkuLocation.get(inKey) ?? 0) + item.quantity);
    outBySkuLocation.set(outKey, (outBySkuLocation.get(outKey) ?? 0) + item.quantity);
  }

  const rows: InventoryDecisionRow[] = balances.map(({ position, balance }) => {
    const positionKey = key(position.productCode, position.locationCode);
    const skuTransferIn = inBySkuLocation.get(positionKey) ?? 0;
    const skuTransferOut = outBySkuLocation.get(positionKey) ?? 0;

    const purchaseQty = newPurchaseQty(
      balance.recommendedStock,
      balance.currentStock,
      skuTransferIn,
    );

    const statusInput = {
      averageMonthlySales: position.averageMonthlySales,
      currentStockDays: balance.currentStockDays,
      currentStock: balance.currentStock,
      targetDays: balance.targetDays,
      xyz: position.xyz,
    };

    const status = classifyStockStatus(statusInput, statusParams);

    const decision = decide({
      ...statusInput,
      stockStatus: status.status,
      transferInQty: skuTransferIn,
      // Худалдан авалт зогсоох ёстой байрлалд purchase санал болгохгүй
      newPurchaseQty:
        status.status === 'OVERSTOCK' || status.status === 'SLOW_MOVING' ? 0 : purchaseQty,
    });

    const effectivePurchaseQty =
      decision.decision === 'STOP_PURCHASE' || decision.decision === 'PROMOTION'
        ? 0
        : purchaseQty;

    byStatus[status.status] = (byStatus[status.status] ?? 0) + 1;
    byDecision[decision.decision] = (byDecision[decision.decision] ?? 0) + 1;
    totalShortage += balance.shortage;
    totalExcess += balance.excess;
    totalPurchaseQty += effectivePurchaseQty;

    return {
      ...position,
      ...balance,
      stockStatus: status.status,
      stockStatusLabelMn: status.labelMn,
      transferInQty: skuTransferIn,
      transferOutQty: skuTransferOut,
      newPurchaseQty: effectivePurchaseQty,
      decision: decision.decision,
      decisionLabelMn: decision.labelMn,
      decisionReasonMn: decision.reasonMn,
      shortageValue: position.unitCost !== null ? balance.shortage * position.unitCost : null,
      excessValue: position.unitCost !== null ? balance.excess * position.unitCost : null,
    };
  });

  return {
    rows,
    transfers,
    summary: {
      positions: rows.length,
      skus: candidatesBySku.size,
      locations: new Set(positions.map((p) => p.locationCode)).size,
      totalShortage,
      totalExcess,
      totalTransferQty: transfers.items.reduce((acc, item) => acc + item.quantity, 0),
      totalPurchaseQty,
      byStatus,
      byDecision,
      transferByTier: Object.fromEntries(transfers.byTier),
    },
  };
}
