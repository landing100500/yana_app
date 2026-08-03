import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import './globals.css';
import PwaServiceWorkerRegister from '@/components/PwaServiceWorkerRegister';
import ReferralCapture from '@/components/ReferralCapture';

export const viewport: Viewport = {
  themeColor: '#7A6B9A',
};

export const metadata: Metadata = {
  title: 'ЯСНА - ИИ Психолог-предсказатель',
  description:
    'Ясность и решение любой ситуации, 10 запросов к ИИ в подарок. Ведическая карта + подсознание',
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

