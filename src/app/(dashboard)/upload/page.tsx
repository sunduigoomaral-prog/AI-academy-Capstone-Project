'use client';

import { useEffect, useState } from 'react';
import { Database } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { CalculationMonthPanel } from '@/components/import/CalculationMonthPanel';
import { FileDropzone } from '@/components/import/FileDropzone';
import { FileSummaryCard } from '@/components/import/FileSummaryCard';
import { IssueTable } from '@/components/import/IssueTable';
import { ProcessingStatus } from '@/components/import/ProcessingStatus';
import { QualityDashboard } from '@/components/import/QualityDashboard';
import { SheetDetectionTable } from '@/components/import/SheetDetectionTable';
import { useImportJob } from '@/hooks/use-import-job';

/**
 * Excel Upload хуудас.
 *
 * ⚠️ ЭНД БИЗНЕСИЙН ТООЦООЛОЛ БАЙХГҮЙ.
 *    Detection, нормчлол, валидац, dedupe, insert бүгд server талын
 *    `src/services/import/` давхаргад хийгддэг. Энэ component зөвхөн
 *    бэлэн тоог харуулж, үйлдлийг эхлүүлнэ.
 */
export default function UploadPage() {
  const job = useImportJob();
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    void job.fetchLookback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = job.status;
  const detectedSheets = status?.sheets?.length ? status.sheets : job.uploadSheets;
  const canProcess =
    pendingId !== null && !job.busy && (!status || status.stage === 'UPLOADING');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Excel Upload</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Файл байршуулах → sheet таних → валидац → өгөгдлийн санд хадгалах
        </p>
      </div>

      <FileDropzone
        disabled={job.busy}
        onFileSelected={async (file) => {
          const id = await job.upload(file);
          setPendingId(id);
        }}
      />

      {job.error ? (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {job.error}
        </p>
      ) : null}

      {status ? (
        <FileSummaryCard
          summary={{
            fileName: status.fileName,
            sizeBytes: status.sizeBytes,
            sheetCount: status.sheetCount,
            totalRows: status.totalRows,
          }}
        />
      ) : null}

      {detectedSheets && detectedSheets.length > 0 ? (
        <SheetDetectionTable sheets={detectedSheets} />
      ) : null}

      {canProcess ? (
        <Button
          onClick={() => {
            if (pendingId) void job.process(pendingId);
          }}
        >
          <Database className="h-4 w-4" aria-hidden />
          Валидац хийж, өгөгдлийн санд хадгалах
        </Button>
      ) : null}

      {status && status.stage !== 'UPLOADING' ? (
        <ProcessingStatus
          stage={status.stage}
          progressPct={status.progressPct}
          stageMessage={status.stageMessage}
          errorMessage={status.errorMessage}
        />
      ) : null}

      {status && (status.stage === 'COMPLETED' || status.stage === 'FAILED') ? (
        <>
          <QualityDashboard
            quality={status.quality}
            issueSummary={status.issueSummary}
            rowsInserted={status.rowsInserted}
            activeCode={job.activeCode}
            onSelectCode={job.setActiveCode}
          />

          <IssueTable
            rows={job.issues.rows}
            total={job.issues.total}
            take={job.pageSize}
            skip={job.skip}
            severity={job.severity}
            activeCode={job.activeCode}
            loading={job.issuesLoading}
            onSeverityChange={job.setSeverity}
            onClearCode={() => job.setActiveCode(null)}
            onPageChange={job.setSkip}
          />
        </>
      ) : null}

      <CalculationMonthPanel resolution={job.lookback} />
    </div>
  );
}
