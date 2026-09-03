'use client';

import { GlobalHeader } from '@/components/layout/GlobalHeader';
import { Sidebar } from '@/components/layout/Sidebar';
import { DashboardFilterProvider } from '@/hooks/use-dashboard-filter';

/**
 * §1, §2, §27 — enterprise layout.
 *
 * Desktop first (1920 / 1440 / 1280), sidebar нь lg-ээс доош нуугдана.
 * Шүүлтүүр нь бүх дэд хуудсанд НЭГЭН ЗЭРЭГ үйлчилдэг (§3).
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardFilterProvider>
      <div className="min-h-screen">
        <GlobalHeader />
        <div className="flex">
          <Sidebar />
          <main className="min-w-0 flex-1 px-4 py-5 xl:px-6">{children}</main>
        </div>
      </div>
    </DashboardFilterProvider>
  );
}
