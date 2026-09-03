'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  PackagePlus,
  PauseCircle,
  ShoppingCart,
  StopCircle,
  ArrowLeftRight,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** §19 СИСТЕМ АВТОМАТААР ХАРИУЛНА */
export interface AutoAnswer {
  key: string;
  questionMn: string;
  answer: string | null;
  unitMn: string;
  href: string;
}

const ICONS: Record<string, typeof AlertTriangle> = {
  stockout: AlertTriangle,
  days: CalendarClock,
  orderQty: ShoppingCart,
  newPurchase: PackagePlus,
  transfer: ArrowLeftRight,
  stagnant: PauseCircle,
  stop: StopCircle,
};

export function AutoAnswers({ questions }: { questions: AutoAnswer[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Систем автоматаар хариулна</CardTitle>
        <CardDescription>
          Бүх хариулт одоогийн шүүлтүүр болон тооцооллын үр дүн дээр суурилсан.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {questions.map((item) => {
            const Icon = ICONS[item.key] ?? AlertTriangle;
            return (
              <Link
                key={item.key}
                href={item.href}
                className="group rounded-md border p-3 transition-colors hover:border-primary"
              >
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <p className="text-xs font-medium leading-tight">{item.questionMn}</p>
                </div>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  {item.answer ?? 'N/A'}
                </p>
                <p className="text-[11px] text-muted-foreground">{item.unitMn}</p>
                <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground group-hover:text-foreground">
                  Дэлгэрэнгүй
                  <ArrowRight className="h-3 w-3" aria-hidden />
                </span>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
