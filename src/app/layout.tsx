import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Inventory Intelligence & Decision Support System',
  description:
    'Эм ханган нийлүүлэлтийн нөөцийн шинжилгээ, эрсдэлийг эрт илрүүлэх шийдвэр дэмжих систем',
};

/**
 * Root layout — зөвхөн html/body.
 *
 * Header ба sidebar нь `(dashboard)/layout.tsx`-д байна (§2, §27), тиймээс
 * энд давхардуулахгүй.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
