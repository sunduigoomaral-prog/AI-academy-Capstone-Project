/**
 * §26 ӨНГӨНИЙ СИСТЕМ — ганц эх сурвалж.
 *
 * ⚠️ Component дотор өнгө hardcode хийхийг хориглоно. Бүх статус/ангиллын
 *    өнгө эндээс ирнэ — Excel export (`python/export/excel_export.py`) ч
 *    ижил логик ашиглана.
 */

import type { DecisionType, StockStatus } from '../types/domain';

export interface Tone {
  /** Tailwind классууд — цайвар дэвсгэр + тод текст */
  badge: string;
  cell: string;
  dot: string;
  labelMn: string;
}

/** §26 — нөөцийн төлөвийн өнгө */
export const STOCK_STATUS_TONE: Record<StockStatus, Tone> = {
  STOCKOUT_RISK: {
    badge: 'bg-red-100 text-red-800 border-red-200',
    cell: 'bg-red-50',
    dot: 'bg-red-500',
    labelMn: 'Нөөц дуусах эрсдэлтэй',
  },
  LOW_STOCK: {
    badge: 'bg-orange-100 text-orange-800 border-orange-200',
    cell: 'bg-orange-50',
    dot: 'bg-orange-500',
    labelMn: 'Нөөц багассан',
  },
  OVERSTOCK: {
    badge: 'bg-purple-100 text-purple-800 border-purple-200',
    cell: 'bg-purple-50',
    dot: 'bg-purple-500',
    labelMn: 'Хэт их нөөцтэй',
  },
  NO_MOVEMENT: {
    badge: 'bg-slate-200 text-slate-800 border-slate-300',
    cell: 'bg-slate-100',
    dot: 'bg-slate-600',
    labelMn: 'Хөдөлгөөнгүй',
  },
  SLOW_MOVING: {
    badge: 'bg-blue-100 text-blue-800 border-blue-200',
    cell: 'bg-blue-50',
    dot: 'bg-blue-500',
    labelMn: 'Удаан эргэлттэй',
  },
  OPTIMAL: {
    badge: 'bg-green-100 text-green-800 border-green-200',
    cell: 'bg-green-50',
    dot: 'bg-green-500',
    labelMn: 'Зохистой',
  },
};

/**
 * §26 — ABCXYZ 9 ангиллын өнгө.
 * AX/AY/BX = ногоон · AZ/BZ/CY = улбар шар · BY = шар · CX = цайвар ногоон · CZ = улаан
 */
export const ABC_XYZ_TONE: Record<string, { cell: string; text: string }> = {
  AX: { cell: 'bg-green-200', text: 'text-green-950' },
  AY: { cell: 'bg-green-200', text: 'text-green-950' },
  AZ: { cell: 'bg-orange-200', text: 'text-orange-950' },
  BX: { cell: 'bg-green-200', text: 'text-green-950' },
  BY: { cell: 'bg-yellow-200', text: 'text-yellow-950' },
  BZ: { cell: 'bg-orange-300', text: 'text-orange-950' },
  CX: { cell: 'bg-lime-200', text: 'text-lime-950' },
  CY: { cell: 'bg-orange-300', text: 'text-orange-950' },
  CZ: { cell: 'bg-red-300', text: 'text-red-950' },
};

export const DECISION_TONE: Record<DecisionType, Tone> = {
  TRANSFER: {
    badge: 'bg-blue-100 text-blue-800 border-blue-200',
    cell: 'bg-blue-50',
    dot: 'bg-blue-500',
    labelMn: 'Шилжүүлэх',
  },
  NEW_PURCHASE: {
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    cell: 'bg-emerald-50',
    dot: 'bg-emerald-500',
    labelMn: 'Шинээр худалдан авах',
  },
  STOP_PURCHASE: {
    badge: 'bg-red-100 text-red-800 border-red-200',
    cell: 'bg-red-50',
    dot: 'bg-red-500',
    labelMn: 'Худалдан авалт зогсоох',
  },
  MONITOR: {
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    cell: '',
    dot: 'bg-slate-400',
    labelMn: 'Хяналтад байлгах',
  },
  PROMOTION: {
    badge: 'bg-violet-100 text-violet-800 border-violet-200',
    cell: 'bg-violet-50',
    dot: 'bg-violet-500',
    labelMn: 'Борлуулалт идэвхжүүлэх',
  },
};

export const PRIORITY_TONE: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800 border-red-200',
  HIGH: 'bg-orange-100 text-orange-800 border-orange-200',
  MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  LOW: 'bg-slate-100 text-slate-700 border-slate-200',
};

/** §28 — өгөгдөл байхгүй үед харуулах текст. Тоо ЗОХИОХГҮЙ. */
export const NOT_AVAILABLE = 'N/A';
export const DATA_UNAVAILABLE = 'Data unavailable';
export const MISSING_SOURCE_FIELD = 'Missing source field';

export function stockStatusTone(status: string): Tone {
  return (
    STOCK_STATUS_TONE[status as StockStatus] ?? {
      badge: 'bg-slate-100 text-slate-700 border-slate-200',
      cell: '',
      dot: 'bg-slate-400',
      labelMn: status,
    }
  );
}

export function decisionTone(decision: string): Tone {
  return (
    DECISION_TONE[decision as DecisionType] ?? {
      badge: 'bg-slate-100 text-slate-700 border-slate-200',
      cell: '',
      dot: 'bg-slate-400',
      labelMn: decision,
    }
  );
}

export function abcXyzTone(abcXyz: string): { cell: string; text: string } {
  return ABC_XYZ_TONE[abcXyz] ?? { cell: 'bg-slate-100', text: 'text-slate-700' };
}
