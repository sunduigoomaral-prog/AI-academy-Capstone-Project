'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { stockStatusTone } from '@/config/color-system';
import { cn } from '@/lib/utils';
import { formatInt, formatPercent } from '@/utils/format';

/** §8 НӨӨЦИЙН ТЭНЦВЭР — count · % · quantity · value */
export interface BalanceRow {
  code: string;
  count: number;
  share: number;
  quantity: number;
  value: number;
}

export function InventoryBalanceCard({
  rows,
  activeStatus,
  onSelectStatus,
}: {
  rows: BalanceRow[];
  activeStatus?: string | null;
  onSelectStatus?: (code: string | null) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Нөөцийн тэнцвэр</CardTitle>
        <CardDescription>Төлөв тус бүрийн байрлалын тоо, эзлэх хувь, тоо хэмжээ, өртөг</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Өгөгдөл байхгүй.</p>
        ) : (
          rows.map((row) => {
            const tone = stockStatusTone(row.code);
            const active = activeStatus === row.code;
            return (
              <button
                key={row.code}
                type="button"
                onClick={() => onSelectStatus?.(active ? null : row.code)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md border p-2.5 text-left transition-colors',
                  tone.cell,
                  active ? 'border-foreground' : 'border-transparent',
                  onSelectStatus ? 'hover:border-primary' : 'cursor-default',
                )}
              >
                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', tone.dot)} />
                <span className="flex-1 truncate text-sm font-medium">{tone.labelMn}</span>
                <span className="w-16 text-right text-sm font-semibold tabular-nums">
                  {formatInt(row.count)}
                </span>
                <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
                  {formatPercent(row.share)}
                </span>
                <span className="hidden w-24 text-right text-xs tabular-nums text-muted-foreground sm:inline">
                  {formatInt(row.quantity)} ш
                </span>
                <span className="hidden w-28 text-right text-xs tabular-nums text-muted-foreground md:inline">
                  {formatInt(row.value)} ₮
                </span>
              </button>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
