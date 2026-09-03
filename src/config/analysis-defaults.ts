/**
 * SEED утгууд — ЭДГЭЭР НЬ HARDCODED KPI БИШ.
 *
 * Бодит утгууд `src/config/analysis-defaults.json`-д байна. Тэр файлыг
 * Python тал (`python/analysis/config.py`) ч уншдаг тул хоёр давхаргын
 * threshold зөрөхгүй.
 *
 * Ажиллах үед тооцоолол ҮРГЭЛЖ `config-service.ts`-ээр дамжуулан DB-ийн
 * `analysis_config` / `inventory_policy` хүснэгтээс уншина. Энэ модулийг
 * бизнес логикт ШУУД import хийхийг хориглоно — зөвхөн seed / fallback.
 */

import defaults from './analysis-defaults.json';
import type { AbcClass, LocationType, XyzClass } from '../types/domain';

export const CONFIG_KEYS = {
  ABC_A_THRESHOLD: 'abc.a_threshold',
  ABC_B_THRESHOLD: 'abc.b_threshold',
  ABC_BASIS: 'abc.basis',
  XYZ_X_THRESHOLD: 'xyz.x_threshold',
  XYZ_Y_THRESHOLD: 'xyz.y_threshold',
  LOOKBACK_MONTHS: 'analysis.lookback_months',
  CALCULATION_MONTH: 'analysis.calculation_month',
  SALES_SCOPE: 'analysis.sales_scope',
  DAYS_PER_MONTH: 'analysis.days_per_month',
  PRICE_ALERT_DELTA_PCT: 'price_control.alert_delta_pct',
  PRICE_BASELINE_MONTHS: 'price_control.baseline_months',
  DEAD_STOCK_MONTHS: 'risk.dead_stock_months_without_sales',
  EXCESS_DAYS_FACTOR: 'risk.excess_days_factor',
  SHORTAGE_DAYS_FACTOR: 'risk.shortage_days_factor',
} as const;

export type ConfigKey = (typeof CONFIG_KEYS)[keyof typeof CONFIG_KEYS];

export interface ConfigSeed {
  key: string;
  value: string;
  valueType: 'NUMBER' | 'STRING' | 'BOOLEAN' | 'JSON';
  description: string;
}

export interface InventoryPolicySeed {
  locationType: LocationType;
  abcClass: AbcClass;
  xyzClass: XyzClass;
  targetDays: number;
}

export const ANALYSIS_CONFIG_SEED: ConfigSeed[] = defaults.analysisConfig as ConfigSeed[];

export const INVENTORY_POLICY_SEED: InventoryPolicySeed[] =
  defaults.inventoryPolicy as InventoryPolicySeed[];

/** Тодорхойлогдсон бүх key-г нэг дор шалгахад */
export const ALL_CONFIG_KEYS: string[] = ANALYSIS_CONFIG_SEED.map((c) => c.key);
