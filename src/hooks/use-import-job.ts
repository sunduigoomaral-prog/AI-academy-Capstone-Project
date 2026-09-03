'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { DetectedSheet } from '@/components/import/SheetDetectionTable';
import type { IssueRow, SeverityFilter } from '@/components/import/IssueTable';
import type { IssueSummaryItem, QualityCounts } from '@/components/import/QualityDashboard';
import type { LookbackResolution } from '@/components/import/CalculationMonthPanel';
import type { Stage } from '@/components/import/ProcessingStatus';

/**
 * Upload → process → poll status → issues.
 *
 * ⚠️ ЭНД БИЗНЕСИЙН ТООЦООЛОЛ БАЙХГҮЙ. Зөвхөн API дуудлага, төлөв удирдлага.
 * Бүх тоо server талын `/services` давхаргаас бэлэн ирнэ.
 */

export interface ImportStatus {
  id: string;
  fileName: string;
  sizeBytes: number;
  sheetCount: number;
  totalRows: number;
  stage: Stage;
  progressPct: number;
  stageMessage: string | null;
  errorMessage: string | null;
  quality: QualityCounts;
  rowsInserted: number;
  sheets: DetectedSheet[];
  issueSummary: IssueSummaryItem[];
}

const POLL_INTERVAL_MS = 900;
const PAGE_SIZE = 100;

export function useImportJob() {
  const [status, setStatus] = useState<ImportStatus | null>(null);
  const [uploadSheets, setUploadSheets] = useState<DetectedSheet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [issues, setIssues] = useState<{ rows: IssueRow[]; total: number }>({ rows: [], total: 0 });
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [severity, setSeverity] = useState<SeverityFilter>('ALL');
  const [activeCode, setActiveCode] = useState<string | null>(null);
  const [skip, setSkip] = useState(0);

  const [lookback, setLookback] = useState<LookbackResolution | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sourceFileIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchStatus = useCallback(async (id: string) => {
    const res = await fetch(`/api/import/${id}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as ImportStatus;
    setStatus(data);
    return data;
  }, []);

  const fetchLookback = useCallback(async () => {
    try {
      const res = await fetch('/api/config/calculation-month', { cache: 'no-store' });
      if (!res.ok) return;
      setLookback((await res.json()) as LookbackResolution);
    } catch {
      // Тохиргоо унших боломжгүй бол UI нь тайлбар харуулна
    }
  }, []);

  const fetchIssues = useCallback(
    async (id: string, opts: { severity: SeverityFilter; code: string | null; skip: number }) => {
      setIssuesLoading(true);
      try {
        const params = new URLSearchParams({
          take: String(PAGE_SIZE),
          skip: String(opts.skip),
        });
        if (opts.severity !== 'ALL') params.set('severity', opts.severity);
        if (opts.code) params.set('code', opts.code);

        const res = await fetch(`/api/import/${id}/issues?${params.toString()}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as { rows: IssueRow[]; total: number };
        setIssues({ rows: data.rows, total: data.total });
      } finally {
        setIssuesLoading(false);
      }
    },
    [],
  );

  /** 1) Файл байршуулах — эх хувь диск дээр, sheet detection */
  const upload = useCallback(
    async (file: File) => {
      stopPolling();
      setError(null);
      setStatus(null);
      setUploadSheets(null);
      setIssues({ rows: [], total: 0 });
      setSkip(0);
      setActiveCode(null);
      setBusy(true);

      try {
        const form = new FormData();
        form.append('file', file);

        const res = await fetch('/api/import/upload', { method: 'POST', body: form });
        const data = await res.json();

        if (!res.ok) {
          setError(String(data.error ?? 'Upload амжилтгүй'));
          return null;
        }

        sourceFileIdRef.current = data.sourceFileId as string;
        setUploadSheets(data.sheets as DetectedSheet[]);
        await fetchStatus(data.sourceFileId as string);
        return data.sourceFileId as string;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Сүлжээний алдаа');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [fetchStatus, stopPolling],
  );

  /** 2) Боловсруулах — валидац, цэвэрлэгээ, DB insert. Явцыг polling-оор харна. */
  const process = useCallback(
    async (id: string) => {
      setError(null);
      setBusy(true);

      pollRef.current = setInterval(() => {
        void fetchStatus(id);
      }, POLL_INTERVAL_MS);

      try {
        const res = await fetch(`/api/import/${id}/process`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) setError(String(data.error ?? 'Боловсруулалт амжилтгүй'));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Сүлжээний алдаа');
      } finally {
        stopPolling();
        setBusy(false);
        await fetchStatus(id);
        await fetchIssues(id, { severity: 'ALL', code: null, skip: 0 });
        await fetchLookback();
      }
    },
    [fetchIssues, fetchLookback, fetchStatus, stopPolling],
  );

  // Шүүлтүүр өөрчлөгдөхөд асуудлын жагсаалтыг дахин татна
  useEffect(() => {
    const id = sourceFileIdRef.current;
    if (!id || !status || status.stage === 'UPLOADING') return;
    void fetchIssues(id, { severity, code: activeCode, skip });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [severity, activeCode, skip]);

  useEffect(() => stopPolling, [stopPolling]);

  return {
    status,
    uploadSheets,
    error,
    busy,
    issues,
    issuesLoading,
    severity,
    activeCode,
    skip,
    pageSize: PAGE_SIZE,
    lookback,
    upload,
    process,
    setSeverity: (value: SeverityFilter) => {
      setSkip(0);
      setSeverity(value);
    },
    setActiveCode: (code: string | null) => {
      setSkip(0);
      setActiveCode(code);
    },
    setSkip,
    fetchLookback,
  };
}
