'use client';

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

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatInt } from '@/utils/format';

/** §20 SALES TREND · §21-ийн нөөцийн хандлага эх өгөгдөлд байхгүй */
export interface TrendRow {
  period: string;
  salesQty: number;
  salesValue: number;
  purchaseQty: number;
  purchaseValue: number;
  openingStock: number | null;
  closingStock: number | null;
  stockDays: number | null;
}

export function SalesTrendChart({
  rows,
  stockTrendUnavailableReason,
}: {
  rows: TrendRow[];
  stockTrendUnavailableReason: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Сарын борлуулалт ба татан авалт</CardTitle>
        <CardDescription>
          Тооцооллын хугацааны сарууд. Дүн нь өртгөөр (эх өгөгдөлд орлого байхгүй).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatInt(v as number)} />
              <Tooltip
                formatter={(value: number | string) => formatInt(Number(value))}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="salesQty" name="Борлуулалт (ш)" fill="hsl(var(--primary))" />
              <Bar dataKey="purchaseQty" name="Татан авалт (ш)" fill="hsl(var(--muted-foreground))" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {stockTrendUnavailableReason ? (
          <p className="mt-3 rounded-md bg-warning/10 p-2.5 text-xs text-muted-foreground">
            ⚠️ Нөөцийн хандлага (§21): {stockTrendUnavailableReason}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
