'use client';

import { ArrowRight } from 'lucide-react';

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

export interface TransferRow {
  productCode: string;
  productName: string | null;
  fromLocationCode: string;
  fromLocationType: string;
  toLocationCode: string;
  toLocationType: string;
  quantity: number;
  estimatedValue: number | null;
  priorityRank: number;
  reason: string | null;
}

function locationLabel(type: string): string {
  return type === 'WAREHOUSE' ? 'агуулах' : 'эмийн сан';
}

export function TransferPlanTable({ rows, total }: { rows: TransferRow[]; total: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Шилжүүлгийн санал</CardTitle>
        <CardDescription>
          Илүүдэлтэй байршлаас дутагдалтай руу. Тоо нь бүхэл бөгөөд эх үүсвэрийн илүүдлээс
          хэтрэхгүй. Нийт {formatInt(total)} санал.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Шилжүүлгийн санал байхгүй.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Код</TableHead>
                <TableHead>Нэр</TableHead>
                <TableHead>Хаанаас</TableHead>
                <TableHead />
                <TableHead>Хаашаа</TableHead>
                <TableHead className="text-right">Тоо</TableHead>
                <TableHead className="text-right">Дүн</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.productCode}-${row.fromLocationCode}-${row.toLocationCode}`}>
                  <TableCell className="font-mono text-xs">{row.productCode}</TableCell>
                  <TableCell className="max-w-[220px] truncate" title={row.productName ?? ''}>
                    {row.productName ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.fromLocationCode}
                    <span className="ml-1 text-muted-foreground">
                      {locationLabel(row.fromLocationType)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.toLocationCode}
                    <span className="ml-1 text-muted-foreground">
                      {locationLabel(row.toLocationType)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatInt(row.quantity)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {row.estimatedValue === null ? '—' : formatInt(row.estimatedValue)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
