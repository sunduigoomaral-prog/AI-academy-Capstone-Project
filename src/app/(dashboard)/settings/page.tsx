'use client';

import { useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';

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
import { abcXyzTone } from '@/config/color-system';
import { cn } from '@/lib/utils';

interface Payload {
  settings: Record<string, unknown>;
  policies: Array<{
    locationType: string;
    abcClass: string;
    xyzClass: string;
    targetDays: number;
  }>;
  /** Шилжүүлгийн давуу эрхийн шатлал. quantity=null → гүйлт хийгээгүй (N/A) */
  transferTiers: Array<{
    code: string;
    labelMn: string;
    noteMn: string | null;
    quantity: number | null;
  }>;
  configs: Array<{ key: string; value: string; description: string | null }>;
}

const ABC = ['A', 'B', 'C'];
const XYZ = ['X', 'Y', 'Z'];

/** §27 Settings — Inventory Policy + ABC/XYZ Threshold (DB-ээс уншина) */
export default function SettingsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/settings', { cache: 'no-store' });
      const payload = await res.json();
      if (!res.ok) {
        setError(String(payload.error ?? 'Тохиргоо татаж чадсангүй'));
        return;
      }
      setData(payload as Payload);
    })();
  }, []);

  if (error) {
    return (
      <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
        {error}
      </p>
    );
  }
  if (!data) return <p className="text-sm text-muted-foreground">Ачаалж байна…</p>;

  const target = (type: string, abc: string, xyz: string) =>
    data.policies.find(
      (p) => p.locationType === type && p.abcClass === abc && p.xyzClass === xyz,
    )?.targetDays;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Settings2 className="h-5 w-5" aria-hidden />
          Тохиргоо
        </h1>
        <p className="text-sm text-muted-foreground">
          Бүх утга өгөгдлийн сангаас уншигдана — кодод hardcode байхгүй.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {[
          {
            type: 'WAREHOUSE',
            labelMn: 'Эм ханган нийлүүлэх төв болон бусад',
            noteMn: 'Эмийн сангаас бусад бүх байршлын төрөл энэ утгыг өвлөнө.',
          },
          { type: 'PHARMACY', labelMn: 'Эмийн сан', noteMn: null },
        ].map((group) => (
          <Card key={group.type}>
            <CardHeader>
              <CardTitle>Зохистой нөөцийн хоног</CardTitle>
              <CardDescription>
                {group.labelMn}
                {group.noteMn ? (
                  <span className="mt-0.5 block text-[11px]">{group.noteMn}</span>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <table className="w-full border-separate border-spacing-1">
                <thead>
                  <tr>
                    <th className="w-12 text-xs text-muted-foreground">ABC\XYZ</th>
                    {XYZ.map((xyz) => (
                      <th key={xyz} className="text-center text-xs font-medium">
                        {xyz}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ABC.map((abc) => (
                    <tr key={abc}>
                      <th className="text-right text-xs font-medium">{abc}</th>
                      {XYZ.map((xyz) => {
                        const tone = abcXyzTone(`${abc}${xyz}`);
                        return (
                          <td key={xyz}>
                            <div
                              className={cn(
                                'rounded-md py-2 text-center text-sm font-semibold tabular-nums',
                                tone.cell,
                                tone.text,
                              )}
                            >
                              {target(group.type, abc, xyz) ?? 'N/A'}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Шилжүүлгийн давуу эрхийн шатлал</CardTitle>
          <CardDescription>
            Дутагдлыг эхний шатнаас эхлэн нөхнө. Тухайн шатанд илүүдэл хүрэлцэхгүй
            бол л дараагийн шат руу шилжинэ.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Шат</TableHead>
                <TableHead>Хамрах хүрээ</TableHead>
                <TableHead className="text-right">Санал болгосон</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.transferTiers.map((tier, index) => (
                <TableRow key={tier.code}>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell className="font-medium">{tier.labelMn}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {tier.noteMn ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {tier.quantity === null ? (
                      <span className="text-muted-foreground">N/A</span>
                    ) : (
                      `${tier.quantity.toLocaleString('mn-MN')} ш`
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Тооцооллын параметрүүд</CardTitle>
          <CardDescription>
            ABC / XYZ threshold, lookback, calculation month болон эрсдэлийн босгууд
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Түлхүүр</TableHead>
                <TableHead>Утга</TableHead>
                <TableHead>Тайлбар</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.configs.map((config) => (
                <TableRow key={config.key}>
                  <TableCell className="font-mono text-xs">{config.key}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{config.value}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {config.description ?? '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
