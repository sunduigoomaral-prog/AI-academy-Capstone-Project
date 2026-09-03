'use client';

import { AlertTriangle, CalendarRange } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export interface LookbackResolution {
  calculationMonth: string;
  lastCompletedMonth: string;
  requestedMonths: number;
  requestedPeriods: string[];
  availablePeriods: string[];
  usedPeriods: string[];
  missingPeriods: string[];
  warnings: string[];
}

export function CalculationMonthPanel({ resolution }: { resolution: LookbackResolution | null }) {
  if (!resolution) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4" aria-hidden />
            Calculation Month
          </CardTitle>
          <CardDescription>
            Тохиргоо ачаалагдаагүй байна (өгөгдлийн сангийн холболтыг шалгана уу).
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4" aria-hidden />
          Calculation Month
        </CardTitle>
        <CardDescription>
          Тооцооллын сар өөрөө дундаж борлуулалтад ОРОХГҮЙ. Утга нь{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">analysis_config</code> хүснэгтээс
          ирнэ — кодод hardcode байхгүй.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Calculation month
            </dt>
            <dd className="mt-1 text-sm font-medium tabular-nums">
              {resolution.calculationMonth}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Сүүлийн бүтэн сар
            </dt>
            <dd className="mt-1 text-sm font-medium tabular-nums">
              {resolution.lastCompletedMonth}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Lookback (хүссэн)
            </dt>
            <dd className="mt-1 text-sm font-medium tabular-nums">
              {resolution.requestedMonths} сар
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              Бодитоор ашиглах
            </dt>
            <dd className="mt-1 text-sm font-medium tabular-nums">
              {resolution.usedPeriods.length} сар
            </dd>
          </div>
        </dl>

        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            Ашиглагдах сарууд
          </p>
          <div className="flex flex-wrap gap-1.5">
            {resolution.requestedPeriods.map((period) => {
              const missing = resolution.missingPeriods.includes(period);
              return (
                <Badge key={period} variant={missing ? 'destructive' : 'success'}>
                  {period}
                  {missing ? ' (байхгүй)' : null}
                </Badge>
              );
            })}
          </div>
        </div>

        {resolution.warnings.length > 0 ? (
          <ul className="space-y-2">
            {resolution.warnings.map((warning) => (
              <li
                key={warning}
                className="flex gap-2 rounded-md bg-warning/10 p-3 text-sm text-foreground"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
