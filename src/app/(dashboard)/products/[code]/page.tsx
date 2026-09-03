'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Info } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

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
import { abcXyzTone, PRIORITY_TONE, stockStatusTone } from '@/config/color-system';
import { cn } from '@/lib/utils';
import { formatDecimal, formatInt, formatPercent } from '@/utils/format';

interface LocationRow {
  locationCode: string;
  locationType: string;
  averageMonthlySales: number;
  targetDays: number;
  targetMonths: number;
  recommendedStock: number;
  currentStock: number;
  currentStockDays: number;
  shortage: number;
  excess: number;
  stockStatus: string;
  transferInQty: number;
  transferOutQty: number;
  newPurchaseQty: number;
  decision: string;
}

interface PricePointRow {
  dimensionKey: string;
  lastPurchasePeriod: string;
  quantity: number;
  amount: number;
  unitPrice: number;
  lowestRank: number;
  highestRank: number;
}

interface AiRow {
  id: string;
  locationCode: string | null;
  risk: string;
  priority: string;
  why: string;
  impact: string;
  action: string;
  recommendedQuantity: number;
  status: string;
}

interface ProductDetail {
  run: { id: string; calculationMonth: string; periodsUsed: string[] };
  header: {
    productCode: string;
    productName: string | null;
    manufacturer: string | null;
    category: string | null;
  };
  classification: {
    abc: string;
    xyz: string;
    abcXyz: string;
    salesValue: number;
    salesShare: number;
    rank: number;
    averageMonthlyQty: number;
    stdDev: number;
    cv: number | null;
  };
  inventory: {
    totals: {
      currentStock: number;
      recommendedStock: number;
      shortage: number;
      excess: number;
      transferInQty: number;
      newPurchaseQty: number;
    };
    byLocation: LocationRow[];
  };
  price: {
    minUnitPrice: number | null;
    maxUnitPrice: number | null;
    priceGapPct: number | null;
    points: PricePointRow[];
  } | null;
  margin: { unavailableReason: string };
  aiRecommendations: AiRow[];
  charts: {
    periods: string[];
    monthlySales: Array<{ period: string; quantity: number; value: number }>;
    monthlyPurchase: Array<{ period: string; quantity: number; value: number }>;
    stockTrendUnavailableReason: string | null;
  };
}

/**
 * §23 PRODUCT DETAIL + §24 PRODUCT CHART.
 *
 * ⚠️ Тооцоолол ЭНД БАЙХГҮЙ — бүх метрик `/api/products/[code]`-аас БЭЛЭН ирнэ.
 * ⚠️ §28 — Gross Margin зэрэг эх өгөгдөлд байхгүй үзүүлэлт "N/A" + шалтгаантай.
 */
export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/products/${encodeURIComponent(code)}`, {
        cache: 'no-store',
      });
      const payload = await res.json();
      if (!res.ok) {
        setError(String(payload.error ?? 'Татаж чадсангүй'));
        return;
      }
      setDetail(payload as ProductDetail);
    })();
  }, [code]);

  if (error) {
    return (
      <div className="space-y-4">
        <Link href="/products" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Буцах
        </Link>
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      </div>
    );
  }

  if (!detail) return <p className="text-sm text-muted-foreground">Ачаалж байна…</p>;

  const cls = detail.classification;
  const tone = abcXyzTone(cls.abcXyz);
  const totals = detail.inventory.totals;

  const chartRows = detail.charts.periods.map((period: string, i: number) => ({
    period,
    salesQty: detail.charts.monthlySales[i]?.quantity ?? 0,
    purchaseQty: detail.charts.monthlyPurchase[i]?.quantity ?? 0,
  }));

  const metric = (label: string, value: string, hint?: string) => (
    <div key={label}>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums" title={hint}>
        {value}
      </dd>
    </div>
  );

  return (
    <div className="space-y-5">
      <Link
        href="/products"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Бүтээгдэхүүний жагсаалт
      </Link>

      {/* §23 header */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start gap-3">
            <div>
              <CardTitle className="text-lg">{detail.header.productName ?? code}</CardTitle>
              <CardDescription className="mt-1 flex flex-wrap gap-3 text-xs">
                <span className="font-mono">{detail.header.productCode}</span>
                <span>Үйлдвэрлэгч: {detail.header.manufacturer ?? 'N/A'}</span>
                <span>Ангилал: {detail.header.category ?? 'N/A'}</span>
              </CardDescription>
            </div>
            <span
              className={cn(
                'ml-auto rounded-md px-3 py-1.5 text-lg font-bold',
                tone.cell,
                tone.text,
              )}
            >
              {cls.abcXyz}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-6">
            {metric('ABC', cls.abc)}
            {metric('XYZ', cls.xyz)}
            {metric('Эрэмбэ', `#${cls.rank}`)}
            {metric('Борлуулалт', `${formatInt(cls.salesValue)} ₮`)}
            {metric('Эзлэх хувь', formatPercent(cls.salesShare, 2))}
            {metric('CV', cls.cv === null ? 'N/A' : formatDecimal(cls.cv, 4))}
            {metric('Дундаж/сар', formatDecimal(cls.averageMonthlyQty, 2))}
            {metric('StdDev', formatDecimal(cls.stdDev, 2))}
            {metric('Одоогийн нөөц', formatDecimal(totals.currentStock, 1))}
            {metric('Зохистой нөөц', formatDecimal(totals.recommendedStock, 1))}
            {metric('Дутагдал', formatDecimal(totals.shortage, 1))}
            {metric('Илүүдэл', formatDecimal(totals.excess, 1))}
            {metric('Шилжүүлэх', formatInt(totals.transferInQty))}
            {metric('Худалдан авах', formatInt(totals.newPurchaseQty))}
            {metric(
              'Хамгийн бага үнэ',
              detail.price?.minUnitPrice != null ? formatInt(detail.price.minUnitPrice) : 'N/A',
            )}
            {metric(
              'Хамгийн өндөр үнэ',
              detail.price?.maxUnitPrice != null ? formatInt(detail.price.maxUnitPrice) : 'N/A',
            )}
            {metric(
              'Үнийн зөрүү',
              detail.price?.priceGapPct != null
                ? `${formatDecimal(detail.price.priceGapPct, 1)}%`
                : 'N/A',
            )}
            {metric('Gross Margin', 'N/A', detail.margin.unavailableReason)}
          </dl>

          <p className="mt-3 flex items-start gap-1.5 rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            {detail.margin.unavailableReason}
          </p>
        </CardContent>
      </Card>

      {/* §23 байршил тус бүрээр */}
      <Card>
        <CardHeader>
          <CardTitle>Байршил тус бүрийн байдал</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Байршил</TableHead>
                <TableHead className="text-right">Дундаж/сар</TableHead>
                <TableHead className="text-right">Зорилт (х)</TableHead>
                <TableHead className="text-right">Зорилт (сар)</TableHead>
                <TableHead className="text-right">Зохистой</TableHead>
                <TableHead className="text-right">Одоогийн</TableHead>
                <TableHead className="text-right">Хоног</TableHead>
                <TableHead className="text-right">Дутагдал</TableHead>
                <TableHead className="text-right">Илүүдэл</TableHead>
                <TableHead>Төлөв</TableHead>
                <TableHead className="text-right">Шилж.</TableHead>
                <TableHead className="text-right">Худ.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.inventory.byLocation.map((row) => {
                const statusTone = stockStatusTone(row.stockStatus);
                return (
                  <TableRow key={row.locationCode}>
                    <TableCell className="font-mono text-xs">{row.locationCode}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDecimal(row.averageMonthlySales, 2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.targetDays}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatDecimal(row.targetMonths, 2)}
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
                      <Badge className={statusTone.badge}>{statusTone.labelMn}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.transferInQty > 0 ? formatInt(row.transferInQty) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.newPurchaseQty > 0 ? formatInt(row.newPurchaseQty) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* §24 chart */}
        <Card>
          <CardHeader>
            <CardTitle>Сарын борлуулалт ба татан авалт</CardTitle>
            <CardDescription>{detail.run.periodsUsed.join(' · ')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="salesQty" name="Борлуулалт (ш)" fill="hsl(var(--primary))" />
                  <Bar
                    dataKey="purchaseQty"
                    name="Татан авалт (ш)"
                    fill="hsl(var(--muted-foreground))"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {detail.charts.stockTrendUnavailableReason ? (
              <p className="mt-2 rounded-md bg-warning/10 p-2 text-[11px] text-muted-foreground">
                ⚠️ {detail.charts.stockTrendUnavailableReason}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* §23 үнэ + AI */}
        <Card>
          <CardHeader>
            <CardTitle>Худалдан авалтын үнэ ба AI зөвлөмж</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {detail.price ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Эх сурвалж</TableHead>
                    <TableHead>Сүүлийн сар</TableHead>
                    <TableHead className="text-right">Нэгж үнэ</TableHead>
                    <TableHead className="text-right">Эрэмбэ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.price.points.map((point) => (
                    <TableRow key={point.dimensionKey}>
                      <TableCell className="font-mono text-xs">{point.dimensionKey}</TableCell>
                      <TableCell className="text-xs">{point.lastPurchasePeriod}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatInt(point.unitPrice)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        #{point.lowestRank}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">
                Энэ хугацаанд худалдан авалт бүртгэгдээгүй — үнийн benchmark N/A.
              </p>
            )}

            <ul className="space-y-2">
              {detail.aiRecommendations.slice(0, 3).map((rec) => (
                <li key={rec.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={PRIORITY_TONE[rec.priority] ?? ''}>{rec.priority}</Badge>
                    <Badge variant="outline">{rec.risk}</Badge>
                    <span className="text-xs text-muted-foreground">@ {rec.locationCode}</span>
                  </div>
                  <p className="mt-1.5 text-xs">
                    <span className="font-medium">WHY: </span>
                    {rec.why}
                  </p>
                  <p className="text-xs">
                    <span className="font-medium">ACTION: </span>
                    {rec.action}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
