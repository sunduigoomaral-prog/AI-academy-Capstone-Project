'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatInt, formatPercent } from '@/utils/format';

export interface MatrixCell {
  abcXyz: string;
  skuCount: number;
  salesValue: number;
  salesShare: number;
}

const ABC_ROWS = ['A', 'B', 'C'] as const;
const XYZ_COLS = ['X', 'Y', 'Z'] as const;

/** Эзлэх хувиас хамаарсан дүүргэлтийн хүч (0–4) */
function intensity(share: number): number {
  if (share >= 0.3) return 4;
  if (share >= 0.15) return 3;
  if (share >= 0.05) return 2;
  if (share > 0) return 1;
  return 0;
}

const FILL = [
  'bg-muted/40',
  'bg-primary/10',
  'bg-primary/20',
  'bg-primary/35',
  'bg-primary/50',
];

/**
 * ⭐ ҮНДСЭН ҮЗҮҮЛЭЛТ — 9 хосолсон ангилал.
 *
 * A/B/C болон X/Y/Z-г тусад нь гол metric болгож харуулахгүй. Захын нийлбэрүүд
 * зөвхөн ЛАВЛАХ зорилготой, жижиг хэмжээтэй байна.
 */
export function AbcXyzMatrix({
  matrix,
  activeCell,
  onSelectCell,
}: {
  matrix: MatrixCell[];
  activeCell?: string | null;
  onSelectCell?: (abcXyz: string | null) => void;
}) {
  const byClass = new Map(matrix.map((cell) => [cell.abcXyz, cell]));
  const totalSku = matrix.reduce((acc, c) => acc + c.skuCount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>ABC–XYZ матриц</CardTitle>
        <CardDescription>
          9 хосолсон ангилал нь дараагийн бүх нөөцийн тооцооллын үндсэн ангилал.
          Нүд дээр дарж SKU-уудыг шүүнэ. Нийт {formatInt(totalSku)} SKU.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="w-12" />
                {XYZ_COLS.map((xyz) => (
                  <th key={xyz} className="pb-1 text-center text-xs font-medium text-muted-foreground">
                    {xyz}
                    <span className="ml-1 font-normal">
                      {xyz === 'X' ? '(тогтвортой)' : xyz === 'Y' ? '(дунд)' : '(хэлбэлзэлтэй)'}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ABC_ROWS.map((abc) => (
                <tr key={abc}>
                  <th className="pr-2 text-right align-middle text-xs font-medium text-muted-foreground">
                    {abc}
                  </th>
                  {XYZ_COLS.map((xyz) => {
                    const key = `${abc}${xyz}`;
                    const cell = byClass.get(key);
                    const share = cell?.salesShare ?? 0;
                    const active = activeCell === key;
                    return (
                      <td key={key}>
                        <button
                          type="button"
                          onClick={() => onSelectCell?.(active ? null : key)}
                          className={cn(
                            'flex w-full flex-col items-start gap-0.5 rounded-md border p-3 text-left transition-colors',
                            FILL[intensity(share)],
                            active ? 'border-primary ring-2 ring-ring' : 'border-transparent',
                            onSelectCell ? 'hover:border-primary' : 'cursor-default',
                          )}
                        >
                          <span className="text-sm font-semibold">{key}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatInt(cell?.skuCount ?? 0)} SKU
                          </span>
                          <span className="text-sm font-medium tabular-nums">
                            {formatPercent(share)}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Хувь нь борлуулалтын мөнгөн дүнгийн эзлэх хэмжээ. Мөрийн A/B/C нь дүнгээр,
          баганын X/Y/Z нь тоо хэмжээний хэлбэлзлээр.
        </p>
      </CardContent>
    </Card>
  );
}
