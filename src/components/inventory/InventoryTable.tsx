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
import { formatDecimal, formatInt } from '@/utils/format';

export interface InventoryRow {
  productCode: string;
  productName: string | null;
  locationCode: string;
  locationType: string;
  channelCode: string | null;
  abcXyz: string;
  averageMonthlySales: number;
  targetDays: number;
  targetMonths: number;
  recommendedStock: number;
  currentStock: number;
  currentStockDays: number;
  shortage: number;
  excess: number;
  shortageValue: number | null;
  excessValue: number | null;
  stockStatus: string;
  transferInQty: number;
  transferOutQty: number;
  newPurchaseQty: number;
  decision: string;
  decisionReason: string | null;
}

export const STATUS_LABELS: Record<string, string> = {
  NO_MOVEMENT: 'Хөдөлгөөнгүй',
  STOCKOUT_RISK: 'Нөөц дуусах эрсдэлтэй',
  OVERSTOCK: 'Хэт их нөөцтэй',
  SLOW_MOVING: 'Удаан эргэлттэй',
  LOW_STOCK: 'Нөөц багассан',
  OPTIMAL: 'Зохистой',
};

export const DECISION_LABELS: Record<string, string> = {
  TRANSFER: 'Шилжүүлэх',
  NEW_PURCHASE: 'Шинээр худалдан авах',
  STOP_PURCHASE: 'Худалдан авалт зогсоох',
  MONITOR: 'Хяналтад байлгах',
  PROMOTION: 'Борлуулалт идэвхжүүлэх',
};

function statusVariant(status: string): 'success' | 'warning' | 'destructive' | 'outline' {
  if (status === 'OPTIMAL') return 'success';
  if (status === 'STOCKOUT_RISK' || status === 'NO_MOVEMENT') return 'destructive';
  if (status === 'OVERSTOCK' || status === 'SLOW_MOVING' || status === 'LOW_STOCK')
    return 'warning';
  return 'outline';
}

export function InventoryTable({
  rows,
  total,
  take,
  skip,
  search,
  loading,
  onSearchChange,
  onPageChange,
}: {
  rows: InventoryRow[];
  total: number;
  take: number;
  skip: number;
  search: string;
  loading?: boolean;
  onSearchChange: (value: string) => void;
  onPageChange: (nextSkip: number) => void;
}) {
  const from = total === 0 ? 0 : skip + 1;
  const to = Math.min(skip + take, total);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Бүтээгдэхүүн × байршлын шийдвэр</CardTitle>
        <CardDescription>
          Дутагдлын мөнгөн дүнгээр эрэмбэлэгдсэн. Бүх тоо server талд бодогдсон —
          хүснэгт дотор ямар ч тооцоолол хийгдэхгүй.
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
          <span className="ml-auto text-xs text-muted-foreground">
            {formatInt(from)}–{formatInt(to)} / {formatInt(total)}
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Ачаалж байна…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Тохирох мөр олдсонгүй.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Код</TableHead>
                <TableHead>Нэр</TableHead>
                <TableHead>Байршил</TableHead>
                <TableHead>ABCXYZ</TableHead>
                <TableHead className="text-right">Дундаж/сар</TableHead>
                <TableHead className="text-right">Зорилт</TableHead>
                <TableHead className="text-right">Санал нөөц</TableHead>
                <TableHead className="text-right">Үлдэгдэл</TableHead>
                <TableHead className="text-right">Хоног</TableHead>
                <TableHead className="text-right">Дутагдал</TableHead>
                <TableHead className="text-right">Илүүдэл</TableHead>
                <TableHead>Төлөв</TableHead>
                <TableHead className="text-right">Шилж.</TableHead>
                <TableHead className="text-right">Худ. авалт</TableHead>
                <TableHead>Шийдвэр</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.productCode}-${row.locationCode}`}>
                  <TableCell className="font-mono text-xs">{row.productCode}</TableCell>
                  <TableCell className="max-w-[180px] truncate" title={row.productName ?? ''}>
                    {row.productName ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.locationCode}
                    <span className="ml-1 text-muted-foreground">
                      {row.locationType === 'WAREHOUSE' ? 'агуулах' : 'эмийн сан'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.abcXyz}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDecimal(row.averageMonthlySales, 1)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {row.targetDays}х
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDecimal(row.recommendedStock, 1)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDecimal(row.currentStock, 1)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDecimal(row.currentStockDays, 1)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.shortage > 0 ? formatDecimal(row.shortage, 1) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.excess > 0 ? formatDecimal(row.excess, 1) : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(row.stockStatus)}>
                      {STATUS_LABELS[row.stockStatus] ?? row.stockStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.transferInQty > 0 ? formatInt(row.transferInQty) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.newPurchaseQty > 0 ? formatInt(row.newPurchaseQty) : '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {DECISION_LABELS[row.decision] ?? row.decision}
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
