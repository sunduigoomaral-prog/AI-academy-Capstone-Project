'use client';

import { AlertTriangle, ArrowLeftRight, Ban, ShoppingCart, TrendingUp } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatDecimal, formatInt } from '@/utils/format';

export interface SummaryRow {
  id: string;
  productCode: string | null;
  productName: string | null;
  locationCode: string | null;
  risk: string;
  priority: string;
  why: string;
  impact: string;
  action: string;
  recommendedQuantity: number;
  status: string;
}

export interface PriceRiskRow {
  productCode: string;
  productName: string | null;
  minUnitPrice: number | null;
  maxUnitPrice: number | null;
  minSourceKey: string | null;
  priceGapPct: number | null;
  priceChangePct: number | null;
  potentialSaving: number | null;
  reasons: unknown;
}

export interface SummarySection {
  code: string;
  labelMn: string;
  rows: SummaryRow[];
}

const SECTION_ICONS: Record<string, typeof AlertTriangle> = {
  TOP_RISKS: AlertTriangle,
  TOP_PURCHASE: ShoppingCart,
  TOP_TRANSFER: ArrowLeftRight,
  TOP_STOP_PURCHASE: Ban,
};

export function priorityVariant(priority: string): 'destructive' | 'warning' | 'default' | 'outline' {
  if (priority === 'CRITICAL') return 'destructive';
  if (priority === 'HIGH') return 'warning';
  if (priority === 'MEDIUM') return 'default';
  return 'outline';
}

function RecommendationCard({
  row,
  onReview,
  busy,
}: {
  row: SummaryRow;
  onReview?: (row: SummaryRow, action: 'ACCEPTED' | 'REJECTED') => void;
  busy?: boolean;
}) {
  return (
    <li className="rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={priorityVariant(row.priority)}>{row.priority}</Badge>
        <Badge variant="outline">{row.risk}</Badge>
        <span className="font-mono text-xs">{row.productCode}</span>
        {row.locationCode ? (
          <span className="text-xs text-muted-foreground">@ {row.locationCode}</span>
        ) : null}
        <span className="max-w-[240px] truncate text-xs text-muted-foreground">
          {row.productName ?? ''}
        </span>
        {row.recommendedQuantity > 0 ? (
          <Badge variant="default" className="ml-auto">
            {formatInt(row.recommendedQuantity)} ш
          </Badge>
        ) : null}
        {row.status !== 'OPEN' ? (
          <Badge variant="outline">{row.status}</Badge>
        ) : null}
      </div>

      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-xs font-medium uppercase text-muted-foreground">
            Why
          </dt>
          <dd>{row.why}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-xs font-medium uppercase text-muted-foreground">
            Impact
          </dt>
          <dd>{row.impact}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-16 shrink-0 text-xs font-medium uppercase text-muted-foreground">
            Action
          </dt>
          <dd className="font-medium">{row.action}</dd>
        </div>
      </dl>

      {onReview && row.status === 'OPEN' ? (
        <div className="mt-3 flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => onReview(row, 'ACCEPTED')}>
            Зөвшөөрөх
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onReview(row, 'REJECTED')}
          >
            Татгалзах
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export function ManagementSummary({
  sections,
  priceRisks,
  grossMarginReason,
  onReview,
  busy,
}: {
  sections: SummarySection[];
  priceRisks: PriceRiskRow[];
  grossMarginReason: string | null;
  onReview?: (row: SummaryRow, action: 'ACCEPTED' | 'REJECTED') => void;
  busy?: boolean;
}) {
  return (
    <div className="space-y-4">
      {sections.map((section) => {
        const Icon = SECTION_ICONS[section.code] ?? AlertTriangle;
        return (
          <Card key={section.code}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon className="h-4 w-4" aria-hidden />
                TOP 5 — {section.labelMn}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {section.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Энэ ангилалд зөвлөмж байхгүй.</p>
              ) : (
                <ul className="space-y-3">
                  {section.rows.map((row) => (
                    <RecommendationCard key={row.id} row={row} onReview={onReview} busy={busy} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" aria-hidden />
            TOP 5 — Үнийн эрсдэл
          </CardTitle>
          <CardDescription>
            SKU түвшний эрсдэл (байршил бүрээр давхардуулаагүй).
            {grossMarginReason ? (
              <span className={cn('mt-1 block text-warning')}>⚠️ {grossMarginReason}</span>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {priceRisks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Үнийн эрсдэл илрээгүй.</p>
          ) : (
            <ul className="space-y-3">
              {priceRisks.map((risk) => (
                <li key={risk.productCode} className="rounded-md border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{risk.productCode}</span>
                    <span className="max-w-[280px] truncate text-xs text-muted-foreground">
                      {risk.productName ?? ''}
                    </span>
                    {risk.potentialSaving !== null ? (
                      <Badge variant="warning" className="ml-auto">
                        {formatInt(risk.potentialSaving)} ₮ хэмнэлт
                      </Badge>
                    ) : null}
                  </div>
                  <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-muted-foreground">Нэгж үнэ</dt>
                      <dd className="tabular-nums">
                        {formatInt(risk.minUnitPrice)} … {formatInt(risk.maxUnitPrice)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Зөрүү</dt>
                      <dd className="tabular-nums">
                        {risk.priceGapPct === null ? '—' : `${formatDecimal(risk.priceGapPct, 1)}%`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Хамгийн хямд эх сурвалж</dt>
                      <dd className="font-mono text-xs">{risk.minSourceKey ?? '—'}</dd>
                    </div>
                  </dl>
                  {Array.isArray(risk.reasons) && risk.reasons.length > 0 ? (
                    <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
                      {(risk.reasons as string[]).map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
