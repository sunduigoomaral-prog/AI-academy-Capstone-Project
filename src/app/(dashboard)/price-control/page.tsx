'use client';

import { useCallback, useEffect, useState } from 'react';
import { Play, RefreshCw } from 'lucide-react';

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

interface PricePoint {
  dimensionKey: string;
  lastPurchasePeriod: string;
  unitPrice: number;
  lowestRank: number;
  highestRank: number;
}

interface PriceRow {
  productCode: string;
  productName: string | null;
  sourceCount: number;
  minUnitPrice: number | null;
  maxUnitPrice: number | null;
  minSourceKey: string | null;
  maxSourceKey: string | null;
  priceGapPct: number | null;
  gapSeverity: string | null;
  totalQuantity: number;
  totalCost: number;
  potentialSaving: number | null;
  priceChangePct: number | null;
  priceIncreaseSeverity: string | null;
  marginAtRisk: boolean;
  excludedReason: string | null;
  points: PricePoint[];
}

interface Payload {
  run: { calculationMonth: string; periodsUsed: string[] };
  totals: { potentialSaving: number; products: number };
  grossMargin: { available: boolean; reason: string };
  total: number;
  rows: PriceRow[];
}

function severityVariant(code: string | null): 'destructive' | 'warning' | 'default' | 'outline' {
  if (code === 'CRITICAL') return 'destructive';
  if (code === 'HIGH') return 'warning';
  if (code === 'MEDIUM') return 'default';
  return 'outline';
}

/**
 * Худалдан авалтын үнийн хяналт.
 *
 * ⚠️ ЭНЭ COMPONENT ДОТОР ТООЦООЛОЛ БАЙХГҮЙ — бүх тоо API-аас бэлэн ирнэ.
 */
export default function PriceControlPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [multiOnly, setMultiOnly] = useState(true);

  const load = useCallback(async (multiSourceOnly: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ take: '50' });
      if (multiSourceOnly) params.set('multiSourceOnly', 'true');
      const res = await fetch(`/api/analysis/price-control?${params.toString()}`, {
        cache: 'no-store',
      });
      const payload = await res.json();
      if (!res.ok) {
        setData(null);
        setError(String(payload.error ?? 'Татаж чадсангүй'));
        return;
      }
      setError(null);
      setData(payload as Payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Сүлжээний алдаа');
    } finally {
      setLoading(false);
    }
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/analysis/price-control/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const payload = await res.json();
        setError(String(payload.error ?? 'Тооцоолол амжилтгүй'));
        return;
      }
      await load(multiOnly);
    } finally {
      setRunning(false);
    }
  }, [load, multiOnly]);

  useEffect(() => {
    void load(multiOnly);
  }, [load, multiOnly]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Худалдан авалтын үнийн хяналт</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Эх сурвалж бүрийн сүүлийн үнэ · зөрүү · боломжит хэмнэлт · өртгийн өсөлт
          </p>
        </div>
        <Button onClick={() => void run()} disabled={running}>
          {running ? (
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Play className="h-4 w-4" aria-hidden />
          )}
          {running ? 'Тооцоолж байна…' : 'Тооцоолол ажиллуулах'}
        </Button>
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {data ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Нэгтгэл</CardTitle>
              <CardDescription>
                Calculation month {data.run.calculationMonth} · цонх{' '}
                {data.run.periodsUsed[0]} … {data.run.periodsUsed[data.run.periodsUsed.length - 1]}
                <span className="mt-1 block text-warning">
                  ⚠️ {data.grossMargin.reason}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-4">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Боломжит хэмнэлт</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatInt(data.totals.potentialSaving)} ₮
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Benchmark хийсэн SKU</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {formatInt(data.totals.products)}
                </p>
              </div>
              <Button
                className="ml-auto"
                size="sm"
                variant={multiOnly ? 'default' : 'outline'}
                onClick={() => setMultiOnly((value) => !value)}
              >
                {multiOnly ? 'Зөвхөн олон эх сурвалжтай' : 'Бүгд'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SKU-гийн үнийн харьцуулалт</CardTitle>
              <CardDescription>
                Боломжит хэмнэлтээр эрэмбэлэгдсэн. Эх сурвалж = нийлүүлэгчийн код.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Ачаалж байна…</p>
              ) : data.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Мөр олдсонгүй.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Код</TableHead>
                      <TableHead>Нэр</TableHead>
                      <TableHead className="text-right">Эх с.</TableHead>
                      <TableHead className="text-right">Хамгийн бага</TableHead>
                      <TableHead className="text-right">Хамгийн их</TableHead>
                      <TableHead className="text-right">Зөрүү</TableHead>
                      <TableHead>Зэрэг</TableHead>
                      <TableHead className="text-right">Өртөг өөрчлөлт</TableHead>
                      <TableHead className="text-right">Хэмнэлт</TableHead>
                      <TableHead>Эрсдэл</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((row) => (
                      <TableRow key={row.productCode}>
                        <TableCell className="font-mono text-xs">{row.productCode}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={row.productName ?? ''}>
                          {row.productName ?? '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.sourceCount}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatInt(row.minUnitPrice)}
                          {row.minSourceKey ? (
                            <span className="ml-1 text-xs text-muted-foreground">
                              {row.minSourceKey}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatInt(row.maxUnitPrice)}
                          {row.maxSourceKey ? (
                            <span className="ml-1 text-xs text-muted-foreground">
                              {row.maxSourceKey}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.priceGapPct === null
                            ? '—'
                            : `${formatDecimal(row.priceGapPct, 1)}%`}
                        </TableCell>
                        <TableCell>
                          {row.gapSeverity ? (
                            <Badge variant={severityVariant(row.gapSeverity)}>
                              {row.gapSeverity}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.priceChangePct === null
                            ? '—'
                            : `${formatDecimal(row.priceChangePct, 1)}%`}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatInt(row.potentialSaving)}
                        </TableCell>
                        <TableCell>
                          {row.marginAtRisk ? (
                            <Badge variant="destructive">MARGIN RISK</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Ачаалж байна…</p>
      ) : null}
    </div>
  );
}
