'use client';

import { useCallback, useEffect, useState } from 'react';

import type { PriceRiskRow, SummaryRow, SummarySection } from '@/components/ai/ManagementSummary';

/**
 * §12 менежерийн хураангуй + §13 Accept / Reject.
 *
 * ⚠️ ЭНД ТООЦООЛОЛ БАЙХГҮЙ. Бүх тоо server талд бодогдож DB-д хадгалагдсан.
 */

export interface AiSummaryPayload {
  run: { id: string; calculationMonth: string; periodsUsed: string[] };
  total: number;
  byPriority: Array<{ code: string; count: number }>;
  byRisk: Array<{ code: string; count: number }>;
  sections: SummarySection[];
  priceRisks: PriceRiskRow[];
  grossMargin: { available: boolean; reason: string };
}

export function useAiSummary() {
  const [data, setData] = useState<AiSummaryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analysis/ai-recommendations/summary', { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok) {
        setData(null);
        setError(String(payload.error ?? 'Хураангуй татаж чадсангүй'));
        return;
      }
      setError(null);
      setData(payload as AiSummaryPayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Сүлжээний алдаа');
    } finally {
      setLoading(false);
    }
  }, []);

  /** Үнийн benchmark → AI зөвлөмж гэсэн дарааллаар ажиллуулна */
  const runAll = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const priceRes = await fetch('/api/analysis/price-control/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!priceRes.ok) {
        const payload = await priceRes.json();
        setError(String(payload.error ?? 'Үнийн тооцоолол амжилтгүй'));
        return;
      }

      const aiRes = await fetch('/api/analysis/ai-recommendations/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!aiRes.ok) {
        const payload = await aiRes.json();
        setError(String(payload.error ?? 'AI engine амжилтгүй'));
        return;
      }

      await fetchSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Сүлжээний алдаа');
    } finally {
      setRunning(false);
    }
  }, [fetchSummary]);

  /** §13 — менежерийн шийдвэр */
  const review = useCallback(
    async (row: SummaryRow, action: 'ACCEPTED' | 'REJECTED', reviewedBy: string) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/analysis/ai-recommendations/${row.id}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, reviewedBy }),
        });
        if (!res.ok) {
          const payload = await res.json();
          setError(String(payload.error ?? 'Шийдвэр бүртгэгдсэнгүй'));
          return;
        }
        await fetchSummary();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Сүлжээний алдаа');
      } finally {
        setBusy(false);
      }
    },
    [fetchSummary],
  );

  useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  return { data, error, loading, running, busy, runAll, review, fetchSummary };
}
