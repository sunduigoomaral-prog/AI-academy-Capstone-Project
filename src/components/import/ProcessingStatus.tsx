'use client';

import { AlertCircle, Check, Loader2 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export type Stage =
  | 'UPLOADING'
  | 'VALIDATING'
  | 'CLEANING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

const STAGES: Array<{ key: Stage; label: string }> = [
  { key: 'UPLOADING', label: 'Uploading' },
  { key: 'VALIDATING', label: 'Validating' },
  { key: 'CLEANING', label: 'Cleaning' },
  { key: 'PROCESSING', label: 'Processing' },
  { key: 'COMPLETED', label: 'Completed' },
];

export function ProcessingStatus({
  stage,
  progressPct,
  stageMessage,
  errorMessage,
}: {
  stage: Stage;
  progressPct: number;
  stageMessage?: string | null;
  errorMessage?: string | null;
}) {
  const failed = stage === 'FAILED';
  const currentIndex = STAGES.findIndex((s) => s.key === stage);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {failed ? (
            <AlertCircle className="h-4 w-4 text-destructive" aria-hidden />
          ) : stage === 'COMPLETED' ? (
            <Check className="h-4 w-4 text-success" aria-hidden />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          )}
          Боловсруулалтын явц
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress
          value={failed ? 100 : progressPct}
          indicatorClassName={
            failed ? 'bg-destructive' : stage === 'COMPLETED' ? 'bg-success' : undefined
          }
        />

        <ol className="flex flex-wrap gap-2">
          {STAGES.map((item, i) => {
            const done = !failed && currentIndex > i;
            const active = !failed && currentIndex === i;
            return (
              <li
                key={item.key}
                className={cn(
                  'rounded-md border px-2.5 py-1 text-xs',
                  done && 'border-success/40 bg-success/10 text-success',
                  active && 'border-primary bg-primary text-primary-foreground',
                  !done && !active && 'text-muted-foreground',
                )}
              >
                {item.label}
              </li>
            );
          })}
          {failed ? (
            <li className="rounded-md border border-destructive bg-destructive px-2.5 py-1 text-xs text-destructive-foreground">
              Failed
            </li>
          ) : null}
        </ol>

        {stageMessage ? <p className="text-sm text-muted-foreground">{stageMessage}</p> : null}
        {errorMessage ? (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
