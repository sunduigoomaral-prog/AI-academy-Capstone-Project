'use client';

import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatInt } from '@/utils/format';

export interface QualityCounts {
  valid: number;
  warning: number;
  error: number;
  total: number;
}

export interface IssueSummaryItem {
  code: string;
  severity: 'WARNING' | 'ERROR';
  count: number;
}

export function QualityDashboard({
  quality,
  issueSummary,
  rowsInserted,
  activeCode,
  onSelectCode,
}: {
  quality: QualityCounts;
  issueSummary: IssueSummaryItem[];
  rowsInserted: number;
  activeCode?: string | null;
  onSelectCode?: (code: string | null) => void;
}) {
  const cards = [
    {
      key: 'valid',
      label: 'VALID',
      value: quality.valid,
      Icon: CheckCircle2,
      cardClass: 'border-success/30 bg-success/5',
      iconClass: 'text-success',
    },
    {
      key: 'warning',
      label: 'WARNING',
      value: quality.warning,
      Icon: AlertTriangle,
      cardClass: 'border-warning/30 bg-warning/5',
      iconClass: 'text-warning',
    },
    {
      key: 'error',
      label: 'ERROR',
      value: quality.error,
      Icon: XCircle,
      cardClass: 'border-destructive/30 bg-destructive/5',
      iconClass: 'text-destructive',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map(({ key, label, value, Icon, cardClass, iconClass }) => (
          <Card key={key} className={cardClass}>
            <CardContent className="flex items-center gap-4 p-5">
              <Icon className={cn('h-8 w-8', iconClass)} aria-hidden />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <p className="text-2xl font-semibold tabular-nums">{formatInt(value)}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Дүрэм тус бүрээр</CardTitle>
          <CardDescription>
            Нийт {formatInt(quality.total)} мөр шалгагдсан · {formatInt(rowsInserted)} мөр
            өгөгдлийн санд хадгалагдсан. ERROR мөр хадгалагдахгүй.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {issueSummary.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ямар ч асуудал илрээгүй.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Хүнд байдал</TableHead>
                  <TableHead>Дүрмийн код</TableHead>
                  <TableHead className="text-right">Тоо</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issueSummary.map((item) => (
                  <TableRow
                    key={item.code}
                    className={cn(
                      onSelectCode ? 'cursor-pointer' : undefined,
                      activeCode === item.code ? 'bg-muted' : undefined,
                    )}
                    onClick={() => onSelectCode?.(activeCode === item.code ? null : item.code)}
                  >
                    <TableCell>
                      <Badge variant={item.severity === 'ERROR' ? 'destructive' : 'warning'}>
                        {item.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{item.code}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatInt(item.count)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
