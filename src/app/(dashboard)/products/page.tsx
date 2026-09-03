'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Package } from 'lucide-react';

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
import { abcXyzTone } from '@/config/color-system';
import { cn } from '@/lib/utils';
import { useDashboardFilter } from '@/hooks/use-dashboard-filter';
import { formatDecimal, formatInt, formatPercent } from '@/utils/format';

interface Row {
  productCode: string;
  productName: string | null;
  abcXyz: string;
  salesValue: number;
  salesShare: number;
  cumulativeShare: number;
  averageMonthlyQty: number;
  cv: number | null;
  inventoryStatus: string;
  rank: number;
}

/** ABC–XYZ → Бүтээгдэхүүний шинжилгээ. SKU дээр дарж §23 дэлгэрэнгүй рүү орно. */
export default function ProductsPage() {
  const filter = useDashboardFilter();
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const take = 50;

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ take: String(take), skip: String(skip) });
        if (filter.productCodes.length) {
          params.set('search', filter.productCodes[0] ?? '');
        }
        const res = await fetch(`/api/analysis/abc-xyz?${params.toString()}`, {
          cache: 'no-store',
        });
        const payload = await res.json();
        if (!res.ok) {
          setError(String(payload.error ?? 'Татаж чадсангүй'));
          setRows([]);
          return;
        }
        setError(null);
        setRows(payload.rows as Row[]);
        setTotal(payload.total as number);
      } finally {
        setLoading(false);
      }
    })();
  }, [skip, filter.productCodes]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Package className="h-5 w-5" aria-hidden />
          Бүтээгдэхүүний шинжилгээ
        </h1>
        <p className="text-sm text-muted-foreground">
          SKU дээр дарж дэлгэрэнгүй үзүүлэлт, график, AI зөвлөмжийг харна
        </p>
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>SKU жагсаалт</CardTitle>
          <CardDescription>
            Борлуулалтын мөнгөн дүнгээр эрэмбэлэгдсэн · нийт {formatInt(total)} SKU
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Ачаалж байна…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Өгөгдөл олдсонгүй. Эхлээд ABC–XYZ тооцоолол ажиллуулна уу.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">#</TableHead>
                  <TableHead>Код</TableHead>
                  <TableHead>Нэр</TableHead>
                  <TableHead>ABCXYZ</TableHead>
                  <TableHead className="text-right">Борлуулалт</TableHead>
                  <TableHead className="text-right">Эзлэх</TableHead>
                  <TableHead className="text-right">Дундаж/сар</TableHead>
                  <TableHead className="text-right">CV</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const tone = abcXyzTone(row.abcXyz);
                  return (
                    <TableRow key={row.productCode}>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {row.rank}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.productCode}</TableCell>
                      <TableCell className="max-w-[280px] truncate">
                        {row.productName ?? '—'}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-xs font-semibold',
                            tone.cell,
                            tone.text,
                          )}
                        >
                          {row.abcXyz}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(row.salesValue)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(row.salesShare, 2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDecimal(row.averageMonthlyQty, 1)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.cv === null ? 'N/A' : formatDecimal(row.cv, 3)}
                      </TableCell>
                      <TableCell>
                        <Link href={`/products/${encodeURIComponent(row.productCode)}`}>
                          <Button size="sm" variant="ghost">
                            <ArrowRight className="h-4 w-4" aria-hidden />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={skip === 0}
              onClick={() => setSkip(Math.max(0, skip - take))}
            >
              Өмнөх
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={skip + take >= total}
              onClick={() => setSkip(skip + take)}
            >
              Дараах
            </Button>
            <Badge variant="outline" className="ml-auto">
              {formatInt(Math.min(skip + take, total))} / {formatInt(total)}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
