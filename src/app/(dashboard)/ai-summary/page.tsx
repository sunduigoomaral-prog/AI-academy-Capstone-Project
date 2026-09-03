'use client';

import { useState } from 'react';
import { Play, RefreshCw, Sparkles } from 'lucide-react';

import { ManagementSummary, priorityVariant } from '@/components/ai/ManagementSummary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAiSummary } from '@/hooks/use-ai-summary';
import { formatInt } from '@/utils/format';

/**
 * §12 — AI менежерийн хураангуй + §13 аудит.
 *
 * ⚠️ ЭНЭ COMPONENT ДОТОР ТООЦООЛОЛ БАЙХГҮЙ.
 *    Бүх тоо `/api/analysis/ai-recommendations/summary`-аас БЭЛЭН ирнэ.
 */
export default function AiSummaryPage() {
  const ai = useAiSummary();
  const [reviewer, setReviewer] = useState('');
  const data = ai.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">AI удирдлагын хураангуй</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Эрсдэл · худалдан авалт · шилжүүлэг · зогсоолт · үнийн эрсдэл
          </p>
        </div>
        <Button onClick={() => void ai.runAll()} disabled={ai.running}>
          {ai.running ? (
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Play className="h-4 w-4" aria-hidden />
          )}
          {ai.running ? 'Тооцоолж байна…' : 'Үнэ + AI тооцоолол ажиллуулах'}
        </Button>
      </div>

      {ai.error ? (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {ai.error}
        </p>
      ) : null}

      {data ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" aria-hidden />
                Ерөнхий байдал
              </CardTitle>
              <CardDescription>
                Calculation month {data.run.calculationMonth} · нийт{' '}
                {formatInt(data.total)} зөвлөмж. Зөвлөмж бүр WHY / IMPACT / ACTION гэсэн
                гурван хэсэгтэй. Тоон утга нь тооцооллын engine-ээс ирсэн — AI өөрчлөөгүй.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {data.byPriority.map((item) => (
                  <Badge key={item.code} variant={priorityVariant(item.code)}>
                    {item.code}: {formatInt(item.count)}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {data.byRisk.map((item) => (
                  <Badge key={item.code} variant="outline">
                    {item.code}: {formatInt(item.count)}
                  </Badge>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <label htmlFor="reviewer" className="text-sm text-muted-foreground">
                  Шийдвэрлэгч (аудитад бүртгэгдэнэ):
                </label>
                <input
                  id="reviewer"
                  value={reviewer}
                  onChange={(event) => setReviewer(event.target.value)}
                  placeholder="Нэр эсвэл и-мэйл"
                  className="h-9 w-64 rounded-md border border-input bg-background px-3 text-sm"
                />
                {!reviewer.trim() ? (
                  <span className="text-xs text-muted-foreground">
                    Нэр оруулсны дараа Зөвшөөрөх / Татгалзах товч идэвхжинэ.
                  </span>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <ManagementSummary
            sections={data.sections}
            priceRisks={data.priceRisks}
            grossMarginReason={data.grossMargin.available ? null : data.grossMargin.reason}
            busy={ai.busy || !reviewer.trim()}
            onReview={
              reviewer.trim()
                ? (row, action) => void ai.review(row, action, reviewer.trim())
                : undefined
            }
          />
        </>
      ) : ai.loading ? (
        <p className="text-sm text-muted-foreground">Ачаалж байна…</p>
      ) : null}
    </div>
  );
}
