'use client';

import { Info } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { stockStatusTone } from '@/config/color-system';
import { formatDecimal, formatInt } from '@/utils/format';

/**
 * §5 EXECUTIVE DASHBOARD — top KPI мөр.
 *
 * ⚠️ §28: утга `null` бол тоо ЗОХИОХГҮЙ — "N/A" + шалтгаан харуулна.
 */

export interface Kpi {
  key: string;
  labelMn: string;
  value: number | null;
  sub?: string | null;
  unavailableReason?: string | null;
  format: 'int' | 'money' | 'percent' | 'decimal';
  tone?: string;
}

function render(kpi: Kpi): string {
  if (kpi.value === null) return 'N/A';
  switch (kpi.format) {
    case 'money':
      return formatInt(kpi.value);
    case 'percent':
      return `${formatDecimal(kpi.value, 1)}%`;
    case 'decimal':
      return formatDecimal(kpi.value, 1);
    default:
      return formatInt(kpi.value);
  }
}

export function ExecutiveKpis({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      {kpis.map((kpi) => {
        const tone = kpi.tone ? stockStatusTone(kpi.tone) : null;
        const unavailable = kpi.value === null;
        return (
          <Card
            key={kpi.key}
            className={cn(unavailable && 'border-dashed', tone?.cell)}
            title={kpi.unavailableReason ?? undefined}
          >
            <CardContent className="p-3">
              <div className="flex items-start gap-1">
                <p className="text-[11px] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
                  {kpi.labelMn}
                </p>
                {unavailable ? (
                  <Info className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                ) : null}
              </div>
              <p
                className={cn(
                  'mt-1 text-xl font-semibold tabular-nums',
                  unavailable && 'text-muted-foreground',
                )}
              >
                {render(kpi)}
              </p>
              {kpi.sub ? (
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{kpi.sub}</p>
              ) : null}
              {unavailable && kpi.unavailableReason ? (
                <p className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-muted-foreground">
                  Missing source field
                </p>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
