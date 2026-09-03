'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatInt } from '@/utils/format';

export interface IssueRow {
  id: string;
  code: string;
  severity: 'WARNING' | 'ERROR';
  sheetName: string;
  rowNo: number;
  columnName: string | null;
  value: string | null;
  message: string;
}

export type SeverityFilter = 'ALL' | 'ERROR' | 'WARNING';

export function IssueTable({
  rows,
  total,
  take,
  skip,
  severity,
  activeCode,
  loading,
  onSeverityChange,
  onClearCode,
  onPageChange,
}: {
  rows: IssueRow[];
  total: number;
  take: number;
  skip: number;
  severity: SeverityFilter;
  activeCode: string | null;
  loading?: boolean;
  onSeverityChange: (value: SeverityFilter) => void;
  onClearCode: () => void;
  onPageChange: (nextSkip: number) => void;
}) {
  const filters: SeverityFilter[] = ['ALL', 'ERROR', 'WARNING'];
  const from = total === 0 ? 0 : skip + 1;
  const to = Math.min(skip + take, total);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Асуудлын дэлгэрэнгүй</CardTitle>
        <CardDescription>
          Мөр бүр эх Excel-ийн БОДИТ мөрийн дугаартай — эх файл руу буцаж шалгах боломжтой.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((value) => (
            <Button
              key={value}
              size="sm"
              variant={severity === value ? 'default' : 'outline'}
              onClick={() => onSeverityChange(value)}
            >
              {value}
            </Button>
          ))}
          {activeCode ? (
            <Button size="sm" variant="ghost" onClick={onClearCode}>
              Шүүлтүүр: {activeCode} ✕
            </Button>
          ) : null}
          <span className="ml-auto text-xs text-muted-foreground">
            {formatInt(from)}–{formatInt(to)} / {formatInt(total)}
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Ачаалж байна…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Тохирох асуудал олдсонгүй.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Хүнд байдал</TableHead>
                <TableHead>Sheet</TableHead>
                <TableHead className="text-right">Мөр</TableHead>
                <TableHead>Багана</TableHead>
                <TableHead>Утга</TableHead>
                <TableHead>Дүрэм</TableHead>
                <TableHead>Тайлбар</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Badge variant={row.severity === 'ERROR' ? 'destructive' : 'warning'}>
                      {row.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>{row.sheetName}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.rowNo}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.columnName ?? '—'}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs" title={row.value ?? ''}>
                    {row.value ?? '—'}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.code}</TableCell>
                  <TableCell className="text-xs">{row.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={skip === 0}
            onClick={() => onPageChange(Math.max(0, skip - take))}
          >
            Өмнөх
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={skip + take >= total}
            onClick={() => onPageChange(skip + take)}
          >
            Дараах
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
