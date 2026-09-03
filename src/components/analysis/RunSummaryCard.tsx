'use client';

import { CalendarRange, Sigma } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatInt } from '@/utils/format';

export interface RunInfo {
  id: string;
  calculationMonth: string;
  lookbackMonths: number;
  periodsUsed: string[];
  abcBasis: string;
  salesScope: string;
  skuCount: number;
  thresholds: { abcA: number; abcB: number; xyzX: number; xyzY: number };
}

export function RunSummaryCard({ run }: { run: RunInfo }) {
  const items = [
    { label: 'Calculation month', value: run.calculationMonth },
    { label: 'Сүүлийн бүтэн сар', value: run.periodsUsed[run.periodsUsed.length - 1] ?? '—' },
    { label: 'Lookback', value: `${run.periodsUsed.length} / ${run.lookbackMonths} сар` },
    { label: 'SKU тоо', value: formatInt(run.skuCount) },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sigma className="h-4 w-4" aria-hidden />
          Тооцооллын параметр
        </CardTitle>
        <CardDescription>
          Бүх тооцоолол server талд хийгдсэн. Энэ хуудас БЭЛЭН үр дүнг харуулж байна.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {items.map((item) => (
            <div key={item.label}>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {item.label}
              </dt>
              <dd className="mt-1 text-sm font-medium tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
            <CalendarRange className="h-3.5 w-3.5" aria-hidden />
            Ашигласан сарууд (calculation month ОРООГҮЙ)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {run.periodsUsed.map((period) => (
              <Badge key={period} variant="success">
                {period}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">ABC: {run.abcBasis} (мөнгөн дүн)</Badge>
          <Badge variant="outline">Scope: {run.salesScope}</Badge>
          <Badge variant="outline">
            A ≤ {run.thresholds.abcA} · B ≤ {run.thresholds.abcB}
          </Badge>
          <Badge variant="outline">
            X ≤ {run.thresholds.xyzX} · Y ≤ {run.thresholds.xyzY}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
