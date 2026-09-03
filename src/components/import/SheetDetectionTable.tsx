'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatInt, formatPercent } from '@/utils/format';

export interface DetectedSheet {
  name: string;
  index: number;
  datasetType: string;
  confidence: number;
  rowCount: number;
  columnCount?: number;
  columnMap: Record<string, string> | null;
  unmappedColumns: string[] | null;
  reason?: string;
}

const KNOWN = new Set(['SALES', 'PURCHASE', 'STOCK', 'PRODUCT', 'LOCATION', 'CHANNEL']);

export function SheetDetectionTable({ sheets }: { sheets: DetectedSheet[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sheet detection</CardTitle>
        <CardDescription>
          Sheet-ийн нэрээр бус баганын бүтцээр танигдсан. Mapping нь{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            src/config/dataset-signatures.json
          </code>{' '}
          дотор тодорхойлогдоно.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sheet</TableHead>
              <TableHead>Танигдсан төрөл</TableHead>
              <TableHead className="text-right">Итгэлцүүр</TableHead>
              <TableHead className="text-right">Мөр</TableHead>
              <TableHead>Багана mapping</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sheets.map((sheet) => {
              const recognized = KNOWN.has(sheet.datasetType);
              const mappedCount = sheet.columnMap ? Object.keys(sheet.columnMap).length : 0;
              const unmapped = sheet.unmappedColumns ?? [];
              return (
                <TableRow key={`${sheet.index}-${sheet.name}`}>
                  <TableCell className="font-medium">{sheet.name}</TableCell>
                  <TableCell>
                    <Badge variant={recognized ? 'success' : 'destructive'}>
                      {sheet.datasetType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {recognized ? formatPercent(sheet.confidence) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatInt(sheet.rowCount)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {mappedCount} багана танигдсан
                    {unmapped.length > 0 ? (
                      <span className="ml-1 text-warning">
                        · {unmapped.length} mapping-гүй ({unmapped.join(', ')})
                      </span>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
