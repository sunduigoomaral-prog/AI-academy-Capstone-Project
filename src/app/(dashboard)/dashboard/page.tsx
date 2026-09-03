'use client';

import { useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';

import { AbcXyzHeatmap } from '@/components/dashboard/AbcXyzHeatmap';
import { AutoAnswers } from '@/components/dashboard/AutoAnswers';
import { ExecutiveKpis } from '@/components/dashboard/ExecutiveKpis';
import { InventoryBalanceCard } from '@/components/dashboard/InventoryBalanceCard';
import { SalesTrendChart } from '@/components/dashboard/SalesTrendChart';
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
import { useDashboard } from '@/hooks/use-dashboard';
import { formatDecimal, formatInt, formatPercent } from '@/utils/format';

/**
 * §5–§8, §19–§22 — EXECUTIVE DASHBOARD.
 *
 * ⚠️ Энэ component дотор ТООЦООЛОЛ БАЙХГҮЙ. Бүх тоо `/api/dashboard`-аас
 *    БЭЛЭН ирнэ (DB-ийн groupBy/aggregate).
 * ⚠️ §28 — өгөгдөл байхгүй үзүүлэлт "N/A" + шалтгаантай.
 */
export default function DashboardPage() {
  const { data, error, loading } = useDashboard();
  const [activeCell, setActiveCell] = useState<string | null>(null);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Ачаалж байна…
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" aria-hidden />
            Өгөгдөл байхгүй
          </CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Excel ачаалж, тооцооллуудыг дараах дарааллаар ажиллуулна уу:
          <span className="mt-1 block font-mono text-xs">
            Excel Upload → ABC–XYZ → Нөөцийн оновчлол → Үнийн хяналт → AI зөвлөмж
          </span>
        </CardContent>
      </Card>
    );
  }

  if (!data?.kpis) return null;

  const run = data.kpis.run;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            ABC–XYZ шинжилгээ ба нөөцийн тэнцвэр
          </h1>
          <p className="text-sm text-muted-foreground">
            Нөөцийн эрсдэлийг эрт илрүүлэх шийдвэр дэмжих систем
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">Тооцооны сар: {run.calculationMonth}</Badge>
          <Badge variant="outline">
            {run.periodsUsed[0]} … {run.periodsUsed[run.periodsUsed.length - 1]}
          </Badge>
          <Badge variant="outline">{formatInt(data.kpis.positions)} байрлал</Badge>
        </div>
      </div>

      {/* §5 */}
      <ExecutiveKpis kpis={data.kpis.kpis} />

      <div className="grid gap-4 xl:grid-cols-3">
        {/* §6, §7 */}
        <div className="xl:col-span-2">
          {data.matrix ? (
            <AbcXyzHeatmap
              cells={data.matrix.cells}
              activeCell={activeCell}
              onSelectCell={setActiveCell}
            />
          ) : null}
        </div>

        {/* §8 */}
        <div className="space-y-4">
          {data.balance ? <InventoryBalanceCard rows={data.balance.rows} /> : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* §20 */}
        {data.trend ? (
          <SalesTrendChart
            rows={data.trend.rows}
            stockTrendUnavailableReason={data.trend.stockTrendUnavailableReason}
          />
        ) : null}

        {/* §22 */}
        {data.locations ? (
          <Card>
            <CardHeader>
              <CardTitle>Байршлын баланс</CardTitle>
              <CardDescription>
                Байршил тус бүрийн одоогийн нөөц, зохистой нөөц, дутагдал, илүүдэл
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Байршил</TableHead>
                    <TableHead>Төрөл</TableHead>
                    <TableHead className="text-right">Одоогийн</TableHead>
                    <TableHead className="text-right">Зохистой</TableHead>
                    <TableHead className="text-right">Дутагдал</TableHead>
                    <TableHead className="text-right">Илүүдэл</TableHead>
                    <TableHead className="text-right">Хангамж</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.locations.locations.map((location) => (
                    <TableRow key={location.locationCode}>
                      <TableCell className="font-mono text-xs">
                        {location.locationCode}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {location.locationType === 'WAREHOUSE' ? 'Агуулах' : 'Эмийн сан'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDecimal(location.currentStock, 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDecimal(location.recommendedStock, 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDecimal(location.shortage, 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDecimal(location.excess, 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {location.coverage === null ? 'N/A' : formatPercent(location.coverage)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* §19 */}
      {data.autoAnswers ? <AutoAnswers questions={data.autoAnswers.questions} /> : null}
    </div>
  );
}
