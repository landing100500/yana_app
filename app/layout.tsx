import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import './globals.css';
import PwaServiceWorkerRegister from '@/components/PwaServiceWorkerRegister';
import ReferralCapture from '@/components/ReferralCapture';
import { initDatabase } from '@/lib/initDb';
import { getFreeAiRequestsForNewUsers } from '@/lib/free-ai-requests-settings';
import {
  FREE_AI_REQUESTS_LIMIT,
  formatFreeAiRequestsGiftMeta,
} from '@/lib/free-ai-requests-constants';

export const viewport: Viewport = {
  themeColor: '#7A6B9A',
};

export async function generateMetadata(): Promise<Metadata> {
  let freeLimit = FREE_AI_REQUESTS_LIMIT;
  try {
    await initDatabase();
    freeLimit = await getFreeAiRequestsForNewUsers();
  } catch {
    // fallback to default
  }

  return {
    title: 'ЯСНА - ИИ Психолог-предсказатель',
    description: `Ясность и решение любой ситуации, ${formatFreeAiRequestsGiftMeta(freeLimit)}. Ведическая карта + подсознание`,
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      title: 'ЯСНА',
      statusBarStyle: 'default',
    },
    icons: {
      icon: '/icon.svg',
      apple: [{ url: '/icons/yasna-apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>
        <PwaServiceWorkerRegister />
        <Suspense fallback={null}>
          <ReferralCapture />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
