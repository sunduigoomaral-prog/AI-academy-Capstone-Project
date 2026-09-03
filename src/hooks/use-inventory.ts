'use client';

import { useCallback, useEffect, useState } from 'react';

import { useDashboardFilter } from '@/hooks/use-dashboard-filter';

import type { CountItem, InventoryTotals } from '@/components/inventory/InventorySummary';
import type { InventoryRow } from '@/components/inventory/InventoryTable';
import type { TransferRow } from '@/components/inventory/TransferPlanTable';

/**
 * Нөөцийн шийдвэрийн үр дүн татах hook.
 *
 * ⚠️ ЭНД БОЛОН COMPONENT ДОТОР ТООЦООЛОЛ ХИЙХГҮЙ.
 *    Бүх тоо server талд бодогдож DB-д хадгалагдсан бэлэн утгаар ирнэ.
 */

export interface InventoryPayload {
  run: { id: string; calculationMonth: string; periodsUsed: string[]; salesScope: string };
  totals: InventoryTotals;
  byStatus: CountItem[];
  byDecision: CountItem[];
  total: number;
  take: number;
  skip: number;
  rows: InventoryRow[];
}

const PAGE_SIZE = 50;

interface FetchOptions {
  stockStatus: string | null;
  decision: string | null;
  search: string;
  skip: number;
}

export function useInventory() {
  // ⭐ Толгойн глобал шүүлтүүр — жагсаалт, нэгтгэл, шилжүүлэг бүгд үүнийг дагана
  const { queryString } = useDashboardFilter();
  const [data, setData] = useState<InventoryPayload | null>(null);
  const [transfers, setTransfers] = useState<{ rows: TransferRow[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const [stockStatus, setStockStatus] = useState<string | null>(null);
  const [decision, setDecision] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [skip, setSkip] = useState(0);

  const fetchResults = useCallback(async (options: FetchOptions) => {
    setLoading(true);
    try {
      const params = new URLSearchParams(queryString);
      params.set('take', String(PAGE_SIZE));
      params.set('skip', String(options.skip));
      if (options.stockStatus) params.set('stockStatus', options.stockStatus);
      if (options.decision) params.set('decision', options.decision);
      if (options.search.trim()) params.set('search', options.search.trim());

      const res = await fetch(`/api/analysis/inventory?${params.toString()}`, {
        cache: 'no-store',
      });
      const payload = await res.json();

      if (!res.ok) {
        setData(null);
        setError(String(payload.error ?? 'Үр дүн татаж чадсангүй'));
        return;
      }

      setError(null);
      setData(payload as InventoryPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Сүлжээний алдаа');
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  const fetchTransfers = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/analysis/inventory/transfers?take=200&${queryString}`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        setTransfers(null);
        return;
      }
      const payload = await res.json();
      setTransfers({ rows: payload.rows as TransferRow[], total: payload.total as number });
    } catch {
      setTransfers(null);
    }
  }, [queryString]);

  const runOptimization = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/analysis/inventory/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(String(payload.error ?? 'Тооцоолол амжилтгүй'));
        return;
      }
      setStockStatus(null);
      setDecision(null);
      setSearch('');
      setSkip(0);
      await fetchResults({ stockStatus: null, decision: null, search: '', skip: 0 });
      await fetchTransfers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Сүлжээний алдаа');
    } finally {
      setRunning(false);
    }
  }, [fetchResults, fetchTransfers]);

  useEffect(() => {
    void fetchResults({ stockStatus, decision, search, skip });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockStatus, decision, skip, queryString]);

  useEffect(() => {
    void fetchTransfers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryString]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchResults({ stockStatus, decision, search, skip: 0 });
      setSkip(0);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return {
    data,
    transfers,
    error,
    loading,
    running,
    stockStatus,
    decision,
    search,
    skip,
    pageSize: PAGE_SIZE,
    runOptimization,
    setStockStatus: (code: string | null) => {
      setSkip(0);
      setStockStatus(code);
    },
    setDecision: (code: string | null) => {
      setSkip(0);
      setDecision(code);
    },
    setSearch,
    setSkip,
  };
}
