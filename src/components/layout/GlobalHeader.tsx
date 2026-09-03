'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Boxes, CalendarRange, Download, Loader2, MapPin } from 'lucide-react';

import { ProductFilter } from '@/components/filters/ProductFilter';
import { Button } from '@/components/ui/button';
import { useDashboardFilter } from '@/hooks/use-dashboard-filter';

/**
 * §2 GLOBAL HEADER — лого · нэр · тооцооны сар · бүтээгдэхүүн · байршлын
 * төрөл · байршил · суваг · Excel татах.
 */

interface FilterOptions {
  companies: Array<{
    code: string;
    name: string | null;
    warehouseCount: number;
    pharmacyCount: number;
  }>;
  locationTypes: Array<{ code: string; labelMn: string }>;
  locations: Array<{
    code: string;
    name: string | null;
    type: string;
    companyCode: string | null;
    channelCode: string | null;
  }>;
  channels: Array<{ code: string; name: string | null }>;
  channelUnavailableReason: string | null;
}

export function GlobalHeader() {
  const filter = useDashboardFilter();
  const [options, setOptions] = useState<FilterOptions | null>(null);
  const [calculationMonth, setCalculationMonth] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    void (async () => {
      const [filtersRes, configRes] = await Promise.all([
        fetch('/api/filters', { cache: 'no-store' }),
        fetch('/api/config/calculation-month', { cache: 'no-store' }),
      ]);
      if (filtersRes.ok) setOptions((await filtersRes.json()) as FilterOptions);
      if (configRes.ok) {
        const payload = await configRes.json();
        setCalculationMonth(payload.calculationMonth as string);
      }
    })();
  }, []);

  // ⭐ Шатлал: ХХК → байршлын төрөл → суваг/байршил
  const visibleLocations = (options?.locations ?? []).filter(
    (l) =>
      (!filter.locationType || l.type === filter.locationType) &&
      (filter.companyCodes.length === 0 ||
        (l.companyCode !== null && filter.companyCodes.includes(l.companyCode))),
  );

  /** §25 — шүүлтүүртэй ижил хамрах хүрээгээр Excel татах */
  const downloadExcel = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/export/excel?${filter.queryString}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inventory-report-${calculationMonth ?? 'export'}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-card">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Boxes className="h-6 w-6 text-primary" aria-hidden />
          <span className="leading-tight">
            <span className="block text-sm font-bold">INVENTORY</span>
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
              Decision Support System
            </span>
          </span>
        </Link>

        <div className="ml-2 hidden items-center gap-1.5 rounded-md border px-3 py-1.5 xl:flex">
          <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <span className="text-xs text-muted-foreground">Тооцооны сар</span>
          <span className="text-sm font-semibold tabular-nums">{calculationMonth ?? '—'}</span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ProductFilter />

          <select
            aria-label="ХХК"
            value={filter.companyCodes[0] ?? ''}
            onChange={(event) =>
              filter.setCompanyCodes(event.target.value ? [event.target.value] : [])
            }
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Бүх ХХК</option>
            {(options?.companies ?? []).map((company) => (
              <option key={company.code} value={company.code}>
                {company.name ?? company.code} ({company.warehouseCount} агуулах ·{' '}
                {company.pharmacyCount} эмийн сан)
              </option>
            ))}
          </select>

          <select
            aria-label="Байршлын төрөл"
            value={filter.locationType ?? ''}
            onChange={(event) => {
              filter.setLocationType(event.target.value || null);
              filter.setLocationCodes([]);
            }}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Бүх төрөл</option>
            {(options?.locationTypes ?? []).map((type) => (
              <option key={type.code} value={type.code}>
                {type.labelMn}
              </option>
            ))}
          </select>

          <select
            aria-label="Суваг / Байршил"
            value={filter.locationCodes[0] ?? ''}
            onChange={(event) =>
              filter.setLocationCodes(event.target.value ? [event.target.value] : [])
            }
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Бүх суваг / байршил</option>
            {visibleLocations.map((location) => (
              <option key={location.code} value={location.code}>
                {location.name ?? location.code} ·{' '}
                {location.type === 'WAREHOUSE' ? 'агуулах' : 'эмийн сан'}
              </option>
            ))}
          </select>

          <select
            aria-label="Суваг"
            disabled={(options?.channels.length ?? 0) === 0}
            title={options?.channelUnavailableReason ?? undefined}
            value={filter.channelCodes[0] ?? ''}
            onChange={(event) =>
              filter.setChannelCodes(event.target.value ? [event.target.value] : [])
            }
            className="h-9 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50"
          >
            <option value="">
              {(options?.channels.length ?? 0) === 0
                ? 'Тусдаа суваг — N/A'
                : 'Бүх суваг'}
            </option>
            {(options?.channels ?? []).map((channel) => (
              <option key={channel.code} value={channel.code}>
                {channel.name ?? channel.code}
              </option>
            ))}
          </select>

          {filter.isFiltered ? (
            <Button size="sm" variant="ghost" onClick={filter.reset}>
              Цэвэрлэх
            </Button>
          ) : null}

          <Button size="sm" onClick={() => void downloadExcel()} disabled={exporting}>
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Download className="h-4 w-4" aria-hidden />
            )}
            Excel татах
          </Button>
        </div>
      </div>

      {filter.isFiltered ? (
        <div className="flex items-center gap-2 border-t bg-accent/40 px-4 py-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" aria-hidden />
          Шүүлтүүр идэвхтэй — бүх хэсэг (KPI · ABCXYZ · Эрсдэл · Татан авалт · Шилжүүлэг ·
          Үнэ · AI) энэ хамрах хүрээгээр тооцогдож байна.
        </div>
      ) : null}
    </header>
  );
}
