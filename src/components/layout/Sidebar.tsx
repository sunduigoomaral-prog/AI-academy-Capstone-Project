'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Boxes,
  Database,
  Grid3x3,
  LayoutDashboard,
  Package,
  PauseCircle,
  Settings,
  ShoppingCart,
  Sparkles,
  Tag,
  Timer,
  Upload,
  Warehouse,
} from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * §27 NAVIGATION — sidebar.
 *
 * Идэвхтэй холбоос нь одоогийн зам + query-гээр тодорхойлогдоно
 * (жишээ нь `/inventory?stockStatus=OVERSTOCK` нь "Илүүдэл").
 */

interface NavItem {
  href: string;
  labelMn: string;
  icon: typeof LayoutDashboard;
}

interface NavGroup {
  labelMn: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    labelMn: '',
    items: [{ href: '/dashboard', labelMn: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    labelMn: 'Нөөц',
    items: [
      { href: '/inventory', labelMn: 'Нөөцийн ерөнхий байдал', icon: Warehouse },
      { href: '/inventory?stockStatus=STOCKOUT_RISK', labelMn: 'Нөөцийн эрсдэл', icon: AlertTriangle },
      { href: '/inventory?stockStatus=OVERSTOCK', labelMn: 'Илүүдэл', icon: Boxes },
      { href: '/inventory?stockStatus=NO_MOVEMENT', labelMn: 'Хөдөлгөөнгүй', icon: PauseCircle },
      { href: '/inventory?stockStatus=SLOW_MOVING', labelMn: 'Удаан эргэлт', icon: Timer },
      { href: '/dashboard', labelMn: 'Байршлын баланс', icon: BarChart3 },
    ],
  },
  {
    labelMn: 'ABC–XYZ',
    items: [
      { href: '/analysis', labelMn: 'ABCXYZ Analysis', icon: Grid3x3 },
      { href: '/dashboard', labelMn: 'ABCXYZ Matrix', icon: Grid3x3 },
      { href: '/products', labelMn: 'Бүтээгдэхүүний шинжилгээ', icon: Package },
    ],
  },
  {
    labelMn: 'Татан авалт',
    items: [
      { href: '/inventory?decision=NEW_PURCHASE', labelMn: 'Худалдан авалтын санал', icon: ShoppingCart },
      { href: '/price-control', labelMn: 'Үнийн хяналт', icon: Tag },
    ],
  },
  {
    labelMn: 'Шилжүүлэлт',
    items: [
      { href: '/inventory?decision=TRANSFER', labelMn: 'Шилжүүлэх санал', icon: ArrowLeftRight },
    ],
  },
  {
    labelMn: 'AI',
    items: [{ href: '/ai-summary', labelMn: 'AI зөвлөмж', icon: Sparkles }],
  },
  {
    labelMn: 'Өгөгдөл',
    items: [
      { href: '/upload', labelMn: 'Excel Upload', icon: Upload },
      { href: '/data-quality', labelMn: 'Өгөгдлийн чанар', icon: Database },
    ],
  },
  {
    labelMn: 'Тохиргоо',
    items: [{ href: '/settings', labelMn: 'Нөөцийн бодлого · Threshold', icon: Settings }],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-card lg:block">
      <nav className="sticky top-0 max-h-screen overflow-y-auto p-3" aria-label="Үндсэн цэс">
        {GROUPS.map((group, index) => (
          <div key={group.labelMn || `group-${index}`} className="mb-4">
            {group.labelMn ? (
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.labelMn}
              </p>
            ) : null}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const [base, query] = item.href.split('?');
                // Query-тэй холбоос нь тухайн query яг тааран идэвхжинэ
                const active =
                  pathname === base && (query ? search === query : search === '');
                return (
                  <li key={item.labelMn}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                        active
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="truncate">{item.labelMn}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
