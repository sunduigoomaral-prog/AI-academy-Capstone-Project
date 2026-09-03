'use client';

import { Play, RefreshCw } from 'lucide-react';

import { AbcXyzMatrix } from '@/components/analysis/AbcXyzMatrix';
import { RunSummaryCard } from '@/components/analysis/RunSummaryCard';
import { SkuResultTable } from '@/components/analysis/SkuResultTable';
import { Button } from '@/components/ui/button';
import { useAbcXyz } from '@/hooks/use-abc-xyz';

/**
 * ABC–XYZ dashboard.
 *
 * ⚠️ ЭНЭ COMPONENT ДОТОР ТООЦООЛОЛ БАЙХГҮЙ.
 *    Бүх тоо `/api/analysis/abc-xyz`-аас БЭЛЭН ирнэ (DB-д хадгалагдсан).
 *
 * ⚠️ ҮНДСЭН ҮЗҮҮЛЭЛТ нь 9 хосолсон ангилал (AX…CZ). A/B/C болон X/Y/Z-г
 *    тусад нь гол metric болгож харуулахгүй.
 */
export default function AnalysisPage() {
  const abcXyz = useAbcXyz();
  const data = abcXyz.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">ABC–XYZ шинжилгээ</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ABC нь борлуулалтын мөнгөн дүнгээр · XYZ нь тоо хэмжээний хэлбэлзлээр
          </p>
        </div>
        <Button onClick={() => void abcXyz.runAnalysis()} disabled={abcXyz.running}>
          {abcXyz.running ? (
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Play className="h-4 w-4" aria-hidden />
          )}
          {abcXyz.running ? 'Тооцоолж байна…' : 'Тооцоолол ажиллуулах'}
        </Button>
      </div>

      {abcXyz.error ? (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {abcXyz.error}
        </p>
      ) : null}

      {data ? (
        <>
          <RunSummaryCard run={data.run} />

          <AbcXyzMatrix
            matrix={data.matrix}
            activeCell={abcXyz.activeCell}
            onSelectCell={abcXyz.setActiveCell}
          />

          <SkuResultTable
            rows={data.rows}
            total={data.total}
            take={abcXyz.pageSize}
            skip={abcXyz.skip}
            periods={data.run.periodsUsed}
            activeCell={abcXyz.activeCell}
            search={abcXyz.search}
            loading={abcXyz.loading}
            onSearchChange={abcXyz.setSearch}
            onClearCell={() => abcXyz.setActiveCell(null)}
            onPageChange={abcXyz.setSkip}
          />
        </>
      ) : abcXyz.loading ? (
        <p className="text-sm text-muted-foreground">Ачаалж байна…</p>
      ) : null}
    </div>
  );
}
