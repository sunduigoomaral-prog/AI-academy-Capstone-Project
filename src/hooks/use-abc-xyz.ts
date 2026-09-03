'use client';

import { useCallback, useEffect, useState } from 'react';

import type { MatrixCell } from '@/components/analysis/AbcXyzMatrix';
import type { RunInfo } from '@/components/analysis/RunSummaryCard';
import type { SkuRow } from '@/components/analysis/SkuResultTable';

/**
 * ABC-XYZ үр дүн татах hook.
 *
 * ⚠️ ЭНД БОЛОН COMPONENT ДОТОР ТООЦООЛОЛ ХИЙХГҮЙ.
 *    Матриц, эзлэх хувь, CV бүгд server талд бодогдож, DB-д хадгалагдсан
 *    БЭЛЭН утгаар ирнэ. Түүхий гүйлгээ browser руу хэзээ ч татагдахгүй.
 */

export interface AbcXyzPayload {
  run: RunInfo;
  matrix: MatrixCell[];
  total: number;
  take: number;
  skip: number;
  rows: SkuRow[];
}

const PAGE_SIZE = 50;

export function useAbcXyz() {
  const [data, setData] = useState<AbcXyzPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [skip, setSkip] = useState(0);

  const fetchResults = useCallback(
    async (options: { abcXyz: string | null; search: string; skip: number }) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          take: String(PAGE_SIZE),
          skip: String(options.skip),
        });
        if (options.abcXyz) params.set('abcXyz', options.abcXyz);
        if (options.search.trim()) params.set('search', options.search.trim());

        const res = await fetch(`/api/analysis/abc-xyz?${params.toString()}`, {
          cache: 'no-store',
        });
        const payload = await res.json();

        if (!res.ok) {
          setData(null);
          setError(String(payload.error ?? 'Үр дүн татаж чадсангүй'));
          return;
        }

        setError(null);
        setData(payload as AbcXyzPayload);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Сүлжээний алдаа');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /** Шинэ гүйлт эхлүүлнэ — бүх тооцоолол server талд */
  const runAnalysis = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/analysis/abc-xyz/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(String(payload.error ?? 'Тооцоолол амжилтгүй'));
        return;
      }
      setActiveCell(null);
      setSearch('');
      setSkip(0);
      await fetchResults({ abcXyz: null, search: '', skip: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Сүлжээний алдаа');
    } finally {
      setRunning(false);
    }
  }, [fetchResults]);

  useEffect(() => {
    void fetchResults({ abcXyz: activeCell, search, skip });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCell, skip]);

  // Хайлтыг debounce хийнэ
  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchResults({ abcXyz: activeCell, search, skip: 0 });
      setSkip(0);
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return {
    data,
    error,
    loading,
    running,
    activeCell,
    search,
    skip,
    pageSize: PAGE_SIZE,
    runAnalysis,
    setActiveCell: (cell: string | null) => {
      setSkip(0);
      setActiveCell(cell);
    },
    setSearch,
    setSkip,
  };
}
