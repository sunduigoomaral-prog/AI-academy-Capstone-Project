'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Play, RefreshCw } from 'lucide-react';

import { InventorySummary } from '@/components/inventory/InventorySummary';
import { InventoryTable } from '@/components/inventory/InventoryTable';
import { TransferPlanTable } from '@/components/inventory/TransferPlanTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useInventory } from '@/hooks/use-inventory';

/**
 * Нөөцийн оновчлол ба шийдвэрийн dashboard.
 *
 * ⚠️ ЭНЭ COMPONENT ДОТОР ТООЦООЛОЛ БАЙХГҮЙ.
 *    Recommended stock, stock days, shortage, excess, transfer, purchase —
 *    бүгд `/api/analysis/inventory`-аас БЭЛЭН ирнэ.
 */
export default function InventoryPage() {
  const inventory = useInventory();
  const searchParams = useSearchParams();
  const data = inventory.data;

  // §27 — sidebar-аас ирсэн query (?stockStatus= / ?decision=) шүүлтүүрийг тохируулна
  const statusParam = searchParams.get('stockStatus');
  const decisionParam = searchParams.get('decision');

  useEffect(() => {
    inventory.setStockStatus(statusParam);
    inventory.setDecision(decisionParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusParam, decisionParam]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Нөөцийн оновчлол</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Зорилтот нөөц · дутагдал/илүүдэл · шилжүүлэг · худалдан авалтын шийдвэр
          </p>
        </div>
        <Button onClick={() => void inventory.runOptimization()} disabled={inventory.running}>
          {inventory.running ? (
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Play className="h-4 w-4" aria-hidden />
          )}
          {inventory.running ? 'Тооцоолж байна…' : 'Тооцоолол ажиллуулах'}
        </Button>
      </div>

      {inventory.error ? (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {inventory.error}
        </p>
      ) : null}

      {data ? (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">Calculation month: {data.run.calculationMonth}</Badge>
            <Badge variant="outline">
              Lookback: {data.run.periodsUsed[0]} … {data.run.periodsUsed[data.run.periodsUsed.length - 1]}
            </Badge>
            <Badge variant="outline">Scope: {data.run.salesScope}</Badge>
          </div>

          <InventorySummary
            totals={data.totals}
            byStatus={data.byStatus}
            byDecision={data.byDecision}
            activeStatus={inventory.stockStatus}
            activeDecision={inventory.decision}
            onSelectStatus={inventory.setStockStatus}
            onSelectDecision={inventory.setDecision}
          />

          <InventoryTable
            rows={data.rows}
            total={data.total}
            take={inventory.pageSize}
            skip={inventory.skip}
            search={inventory.search}
            loading={inventory.loading}
            onSearchChange={inventory.setSearch}
            onPageChange={inventory.setSkip}
          />

          {inventory.transfers ? (
            <TransferPlanTable
              rows={inventory.transfers.rows}
              total={inventory.transfers.total}
            />
          ) : null}
        </>
      ) : inventory.loading ? (
        <p className="text-sm text-muted-foreground">Ачаалж байна…</p>
      ) : null}
    </div>
  );
}
