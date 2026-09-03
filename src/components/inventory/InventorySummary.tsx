'use client';

import { ArrowLeftRight, PackageMinus, PackagePlus, ShoppingCart } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatInt } from '@/utils/format';
import { DECISION_LABELS, STATUS_LABELS } from './InventoryTable';

export interface InventoryTotals {
  shortage: number;
  excess: number;
  shortageValue: number;
  excessValue: number;
  purchaseQty: number;
  transferQty: number;
}

export interface CountItem {
  code: string;
  count: number;
}

export function InventorySummary({
  totals,
  byStatus,
  byDecision,
  activeStatus,
  activeDecision,
  onSelectStatus,
  onSelectDecision,
}: {
  totals: InventoryTotals;
  byStatus: CountItem[];
  byDecision: CountItem[];
  activeStatus: string | null;
  activeDecision: string | null;
  onSelectStatus: (code: string | null) => void;
  onSelectDecision: (code: string | null) => void;
}) {
  const cards = [
    {
      key: 'shortage',
      label: 'Нийт дутагдал',
      value: formatInt(totals.shortage),
      sub: `${formatInt(totals.shortageValue)} ₮`,
      Icon: PackageMinus,
      iconClass: 'text-destructive',
    },
    {
      key: 'excess',
      label: 'Нийт илүүдэл',
      value: formatInt(totals.excess),
      sub: `${formatInt(totals.excessValue)} ₮`,
      Icon: PackagePlus,
      iconClass: 'text-warning',
    },
    {
      key: 'transfer',
      label: 'Шилжүүлэх',
      value: formatInt(totals.transferQty),
      sub: 'ширхэг',
      Icon: ArrowLeftRight,
      iconClass: 'text-foreground',
    },
    {
      key: 'purchase',
      label: 'Худалдан авах',
      value: formatInt(totals.purchaseQty),
      sub: 'ширхэг',
      Icon: ShoppingCart,
      iconClass: 'text-foreground',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ key, label, value, sub, Icon, iconClass }) => (
          <Card key={key}>
            <CardContent className="flex items-center gap-4 p-5">
              <Icon className={cn('h-7 w-7', iconClass)} aria-hidden />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                <p className="text-xl font-semibold tabular-nums">{value}</p>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Нөөцийн төлөв</CardTitle>
            <CardDescription>Дүрмүүд inventory-status-rules.json-д тохируулагдана</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {byStatus.map((item) => (
              <Button
                key={item.code}
                size="sm"
                variant={activeStatus === item.code ? 'default' : 'outline'}
                onClick={() => onSelectStatus(activeStatus === item.code ? null : item.code)}
              >
                {STATUS_LABELS[item.code] ?? item.code}
                <Badge variant="outline" className="ml-1">
                  {formatInt(item.count)}
                </Badge>
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Шийдвэр</CardTitle>
            <CardDescription>Байрлал бүрийн санал болгож буй арга хэмжээ</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {byDecision.map((item) => (
              <Button
                key={item.code}
                size="sm"
                variant={activeDecision === item.code ? 'default' : 'outline'}
                onClick={() => onSelectDecision(activeDecision === item.code ? null : item.code)}
              >
                {DECISION_LABELS[item.code] ?? item.code}
                <Badge variant="outline" className="ml-1">
                  {formatInt(item.count)}
                </Badge>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
