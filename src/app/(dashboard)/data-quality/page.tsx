'use client';

import Link from 'next/link';
import { Database } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * §27 Data → Data Quality.
 *
 * Чанарын дэлгэрэнгүй нь upload бүрийн хүрээнд гардаг тул тэр хуудас руу
 * чиглүүлнэ (нэг л эх сурвалж — давхардуулахгүй).
 */
export default function DataQualityPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Database className="h-5 w-5" aria-hidden />
          Өгөгдлийн чанар
        </h1>
        <p className="text-sm text-muted-foreground">
          Валидацийн үр дүн ачаалалт бүрээр бүртгэгдэнэ
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Чанарын тайлан ачаалалтын хүрээнд</CardTitle>
          <CardDescription>
            VALID / WARNING / ERROR ангилал, дүрэм тус бүрийн задаргаа болон мөр бүрийн
            алдааны хүснэгт нь Excel Upload хуудсанд харагдана. Мөн Excel экспортын
            «17.Data Quality» хуудсанд бүрэн орно.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href="/upload">
            <Button>Excel Upload хуудас руу очих</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
