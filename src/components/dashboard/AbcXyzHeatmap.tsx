'use client';

import { useState } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { abcXyzTone } from '@/config/color-system';
import { cn } from '@/lib/utils';
import { formatDecimal, formatInt, formatPercent } from '@/utils/format';

/**
 * §6 ABCXYZ MATRIX + §7 HEATMAP.
 *
 * ⚠️ §6: A/B/C болон X/Y/Z-г тусад нь ГОЛ visual болгохгүй — үндсэн visual
 *    нь 9 хосолсон ангилал. Захын нийлбэр зөвхөн лавлах зорилготой, жижиг.
 *
 * Нүд бүр: SKU тоо · борлуулалтын дүн · тоо · одоогийн нөөц · зохистой нөөц ·
 *          эрсдэлийн тоо (§6). Tooltip-д дутагдал/илүүдэл нэмэгдэнэ (§7).
 */

export interface MatrixCell {
  abcXyz: string;
  skuCount: number;
  positions: number;
  salesValue: number;
  salesShare: number;
  currentStock: number;
  recommendedStock: number;
  shortage: number;
  excess: number;
  riskCount: number;
}

const ABC = ['A', 'B', 'C'] as const;
const XYZ = ['X', 'Y', 'Z'] as const;

export function AbcXyzHeatmap({
  cells,
  activeCell,
  onSelectCell,
}: {
  cells: MatrixCell[];
  activeCell?: string | null;
  onSelectCell?: (abcXyz: string | null) => void;
}) {
  const [hover, setHover] = useState<MatrixCell | null>(null);
  const byClass = new Map(cells.map((c) => [c.abcXyz, c]));
  const totalSku = cells.reduce((acc, c) => acc + c.skuCount, 0);

  const rowTotal = (abc: string) =>
    cells.filter((c) => c.abcXyz.startsWith(abc)).reduce((a, c) => a + c.skuCount, 0);
  const colTotal = (xyz: string) =>
    cells.filter((c) => c.abcXyz.endsWith(xyz)).reduce((a, c) => a + c.skuCount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>ABC–XYZ матриц</CardTitle>
        <CardDescription>
          ⭐ 9 хосолсон ангилал нь нөөцийн бүх тооцооллын үндэс. Нүд дээр дарж
          шүүнэ. Нийт {formatInt(totalSku)} SKU.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="w-10" />
                {XYZ.map((xyz) => (
                  <th key={xyz} className="pb-1 text-center text-xs font-medium">
                    {xyz}
                    <span className="ml-1 font-normal text-muted-foreground">
                      {xyz === 'X' ? 'тогтвортой' : xyz === 'Y' ? 'дунд' : 'хэлбэлзэлтэй'}
                    </span>
                  </th>
                ))}
                {/* Захын нийлбэр — зөвхөн ЛАВЛАХ, жижиг */}
                <th className="w-14 pb-1 text-center text-[10px] font-normal text-muted-foreground">
                  Нийт
                </th>
              </tr>
            </thead>
            <tbody>
              {ABC.map((abc) => (
                <tr key={abc}>
                  <th className="pr-1 text-right align-middle text-xs font-medium">{abc}</th>
                  {XYZ.map((xyz) => {
                    const key = `${abc}${xyz}`;
                    const cell = byClass.get(key);
                    const tone = abcXyzTone(key);
                    const active = activeCell === key;
                    return (
                      <td key={key}>
                        <button
                          type="button"
                          onMouseEnter={() => setHover(cell ?? null)}
                          onMouseLeave={() => setHover(null)}
                          onClick={() => onSelectCell?.(active ? null : key)}
                          className={cn(
                            'w-full rounded-md border p-2.5 text-left transition-all',
                            tone.cell,
                            tone.text,
                            active ? 'border-foreground ring-2 ring-ring' : 'border-transparent',
                            onSelectCell ? 'hover:brightness-95' : 'cursor-default',
                          )}
                        >
                          <div className="flex items-baseline justify-between">
                            <span className="text-sm font-bold">{key}</span>
                            <span className="text-xs font-medium">
                              {formatPercent(cell?.salesShare ?? 0)}
                            </span>
                          </div>
                          <dl className="mt-1 space-y-0.5 text-[11px] leading-tight">
                            <div className="flex justify-between">
                              <dt>SKU</dt>
                              <dd className="font-medium tabular-nums">
                                {formatInt(cell?.skuCount ?? 0)}
                              </dd>
                            </div>
                            <div className="flex justify-between">
                              <dt>Дүн</dt>
                              <dd className="font-medium tabular-nums">
                                {formatInt(cell?.salesValue ?? 0)}
                              </dd>
                            </div>
                            <div className="flex justify-between">
                              <dt>Нөөц</dt>
                              <dd className="font-medium tabular-nums">
                                {formatDecimal(cell?.currentStock ?? 0, 0)}
                              </dd>
                            </div>
                            <div className="flex justify-between">
                              <dt>Зохистой</dt>
                              <dd className="font-medium tabular-nums">
                                {formatDecimal(cell?.recommendedStock ?? 0, 0)}
                              </dd>
                            </div>
                            <div className="flex justify-between">
                              <dt>Эрсдэл</dt>
                              <dd className="font-medium tabular-nums">
                                {formatInt(cell?.riskCount ?? 0)}
                              </dd>
                            </div>
                          </dl>
                        </button>
                      </td>
                    );
                  })}
                  <td className="text-center align-middle text-xs tabular-nums text-muted-foreground">
                    {formatInt(rowTotal(abc))}
                  </td>
                </tr>
              ))}
              <tr>
                <th />
                {XYZ.map((xyz) => (
                  <td
                    key={xyz}
                    className="text-center text-xs tabular-nums text-muted-foreground"
                  >
                    {formatInt(colTotal(xyz))}
                  </td>
                ))}
                <td className="text-center text-xs font-medium tabular-nums">
                  {formatInt(totalSku)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* §7 tooltip — SKU · дүн · тоо · нөөц · дутагдал · илүүдэл */}
        <div className="mt-3 min-h-[3rem] rounded-md border bg-muted/40 p-2.5 text-xs">
          {hover ? (
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              <span className="font-semibold">{hover.abcXyz}</span>
              <span>SKU: {formatInt(hover.skuCount)}</span>
              <span>Борлуулалт: {formatInt(hover.salesValue)} ₮</span>
              <span>Эзлэх: {formatPercent(hover.salesShare)}</span>
              <span>Одоогийн нөөц: {formatDecimal(hover.currentStock, 1)}</span>
              <span>Дутагдал: {formatDecimal(hover.shortage, 1)}</span>
              <span>Илүүдэл: {formatDecimal(hover.excess, 1)}</span>
              <span>Эрсдэлтэй байрлал: {formatInt(hover.riskCount)}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">
              Нүд дээр хулгана аваачихад дэлгэрэнгүй харагдана.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
