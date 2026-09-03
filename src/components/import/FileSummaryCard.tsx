'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBytes, formatInt } from '@/utils/format';

export interface FileSummary {
  fileName: string;
  sizeBytes: number;
  sheetCount: number;
  totalRows: number;
}

export function FileSummaryCard({ summary }: { summary: FileSummary }) {
  const items = [
    { label: 'Файлын нэр', value: summary.fileName },
    { label: 'Хэмжээ', value: formatBytes(summary.sizeBytes) },
    { label: 'Sheet тоо', value: formatInt(summary.sheetCount) },
    { label: 'Мөрийн тоо', value: formatInt(summary.totalRows) },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Файлын мэдээлэл</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {items.map((item) => (
            <div key={item.label}>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</dt>
              <dd className="mt-1 truncate text-sm font-medium" title={String(item.value)}>
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
