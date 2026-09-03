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
import { formatDecimal, formatInt, formatPercent } from '@/utils/format';

export interface SkuRow {
  productCode: string;
  productName: string | null;
  abc: string;
  xyz: string;
  abcXyz: string;
  salesValue: number;
  salesShare: number;
  cumulativeShare: number;
  monthlyQty: number[];
  averageMonthlyQty: number;
  stdDev: number;
  cv: number | null;
  inventoryStatus: string;
  monthsWithSales: number;
  rank: number;
}

export function SkuResultTable({
  rows,
  total,
  take,
  skip,
  periods,
  activeCell,
  search,
  loading,
  onSearchChange,
  onClearCell,
  onPageChange,
}: {
  rows: SkuRow[];
  total: number;
  take: number;
  skip: number;
  periods: string[];
  activeCell: string | null;
  search: string;
  loading?: boolean;
  onSearchChange: (value: string) => void;
  onClearCell: () => void;
  onPageChange: (nextSkip: number) => void;
}) {
  const from = total === 0 ? 0 : skip + 1;
  const to = Math.min(skip + take, total);

  return (
    <Card>
      <CardHeader>
        <CardTitle>SKU-гийн дэлгэрэнгүй</CardTitle>
        <CardDescription>
          Сарын тоо хэмжээ нь {periods.join(', ')} дарааллаар. Дундаж нь БҮТЭН саруудын
          тоонд хуваагдсан. StdDev нь population (STDEV.P).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            placeholder="Код эсвэл нэрээр хайх…"
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-9 w-64 rounded-md border border-input bg-background px-3 text-sm"
          />
          {activeCell ? (
            <Button size="sm" variant="ghost" onClick={onClearCell}>
              Шүүлтүүр: {activeCell} ✕
            </Button>
          ) : null}
          <span className="ml-auto text-xs text-muted-foreground">
            {formatInt(from)}–{formatInt(to)} / {formatInt(total)}
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Ачаалж байна…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Тохирох SKU олдсонгүй.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">#</TableHead>
                <TableHead>Код</TableHead>
                <TableHead>Нэр</TableHead>
                <TableHead>abc_xyz</TableHead>
                <TableHead className="text-right">Борлуулалтын дүн</TableHead>
                <TableHead className="text-right">Эзлэх</TableHead>
                <TableHead className="text-right">Хуримт.</TableHead>
                <TableHead className="text-right">Дундаж</TableHead>
                <TableHead className="text-right">StdDev</TableHead>
                <TableHead className="text-right">CV</TableHead>
                <TableHead>Төлөв</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.productCode}>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {row.rank}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.productCode}</TableCell>
                  <TableCell className="max-w-[220px] truncate" title={row.productName ?? ''}>
                    {row.productName ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        row.abc === 'A' ? 'success' : row.abc === 'B' ? 'default' : 'outline'
                      }
                    >
                      {row.abcXyz}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatInt(row.salesValue)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(row.salesShare, 2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(row.cumulativeShare, 2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDecimal(row.averageMonthlyQty, 2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDecimal(row.stdDev, 2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.cv === null ? '—' : formatDecimal(row.cv, 4)}
                  </TableCell>
                  <TableCell>
                    {row.inventoryStatus === 'NO_MOVEMENT' ? (
                      <Badge variant="destructive">Хөдөлгөөнгүй</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {row.monthsWithSales}/{periods.length} сар
                      </span>
                    )}
                  </TableCell>
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
