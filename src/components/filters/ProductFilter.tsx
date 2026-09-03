'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useDashboardFilter, useProductSearch } from '@/hooks/use-dashboard-filter';
import { formatInt } from '@/utils/format';

/**
 * §3 PRODUCT FILTER — хайлттай, олон сонголттой dropdown.
 *
 * • Код (`0100139`) эсвэл нэрээр (`Парацетамол`) хайна
 * • Multi-select
 * • Default: "Бүх бүтээгдэхүүн"
 * • ⚠️ Server-side хайлт + 300ms debounce (§3, §29) — том өгөгдөлд бүх
 *   бүтээгдэхүүнийг browser руу татахгүй
 */
export function ProductFilter() {
  const filter = useDashboardFilter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const { options, total, loading } = useProductSearch(query);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const selectedCount = filter.selectedProducts.length;
  const label =
    selectedCount === 0
      ? 'Бүх бүтээгдэхүүн'
      : selectedCount === 1
        ? (filter.selectedProducts[0]?.productCode ?? '1 сонгосон')
        : `${selectedCount} бүтээгдэхүүн`;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex h-9 w-64 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm',
          'hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring',
        )}
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">{label}</span>
        {selectedCount > 0 ? (
          <Badge variant="default" className="ml-auto shrink-0">
            {selectedCount}
          </Badge>
        ) : (
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </button>

      {open ? (
        <div className="absolute z-50 mt-1 w-96 rounded-md border bg-card shadow-lg">
          <div className="border-b p-2">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Код эсвэл нэрээр хайх… (ж: 0100139, Парацетамол)"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>

          {selectedCount > 0 ? (
            <div className="flex flex-wrap gap-1 border-b p-2">
              {filter.selectedProducts.map((product) => (
                <Badge key={product.productCode} variant="default" className="gap-1">
                  {product.productCode}
                  <button
                    type="button"
                    aria-label={`${product.productCode} хасах`}
                    onClick={() => filter.toggleProduct(product)}
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </Badge>
              ))}
              <Button size="sm" variant="ghost" onClick={filter.clearProducts}>
                Бүгдийг цэвэрлэх
              </Button>
            </div>
          ) : null}

          <ul role="listbox" className="max-h-72 overflow-y-auto p-1">
            {loading ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">Хайж байна…</li>
            ) : options.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                Тохирох бүтээгдэхүүн олдсонгүй.
              </li>
            ) : (
              options.map((product) => {
                const selected = filter.productCodes.includes(product.productCode);
                return (
                  <li key={product.productCode}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => filter.toggleProduct(product)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                        'hover:bg-accent',
                        selected && 'bg-accent',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                          selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                        )}
                      >
                        {selected ? <Check className="h-3 w-3" aria-hidden /> : null}
                      </span>
                      <span className="font-mono text-xs">{product.productCode}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {product.name ?? '—'}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
            {formatInt(options.length)} / {formatInt(total)} үзүүлэв
            {total > options.length ? ' · нарийвчилж хайна уу' : ''}
          </div>
        </div>
      ) : null}
    </div>
  );
}
