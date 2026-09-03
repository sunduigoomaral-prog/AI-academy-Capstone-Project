'use client';

import { useCallback, useEffect, useState } from 'react';

import type { MatrixCell } from '@/components/dashboard/AbcXyzHeatmap';
import type { AutoAnswer } from '@/components/dashboard/AutoAnswers';
import type { BalanceRow } from '@/components/dashboard/InventoryBalanceCard';
import type { Kpi } from '@/components/dashboard/ExecutiveKpis';
import type { TrendRow } from '@/components/dashboard/SalesTrendChart';
import { useDashboardFilter } from '@/hooks/use-dashboard-filter';

/**
 * §5–§8, §19–§22 — dashboard өгөгдөл татах.
 *
 * ⚠️ §29: шүүлтүүр SERVER рүү дамжина; browser нь нэгтгэсэн тоо л авна.
 */
export interface DashboardPayload {
  kpis: {
    run: { id: string; calculationMonth: string; periodsUsed: string[] };
    kpis: Kpi[];
    positions: number;
    byStatus: Array<{ code: string; count: number }>;
  } | null;
  matrix: { cells: MatrixCell[]; totalSalesValue: number } | null;
  balance: { total: number; rows: BalanceRow[] } | null;
  autoAnswers: { questions: AutoAnswer[] } | null;
  trend: {
    periods: string[];
    rows: TrendRow[];
    stockTrendUnavailableReason: string | null;
  } | null;
  locations: {
    locations: Array<{
      locationCode: string;
      locationType: string;
      positions: number;
      currentStock: number;
      recommendedStock: number;
      shortage: number;
      excess: number;
      coverage: number | null;
    }>;
  } | null;
}

export function useDashboard() {
  const filter = useDashboardFilter();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (queryString: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard?${queryString}`, { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok) {
        setData(null);
        setError(String(payload.error ?? 'Dashboard татаж чадсангүй'));
        return;
      }
      setError(null);
      setData(payload as DashboardPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Сүлжээний алдаа');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter.queryString);
  }, [filter.queryString, load]);

  return { data, error, loading, reload: () => load(filter.queryString) };
}
