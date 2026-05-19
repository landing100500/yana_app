'use client';

import { Suspense } from 'react';
import TariffsPageContent from './TariffsPageContent';

function TariffsFallback() {
  return (
    <div style={{ minHeight: '100vh', padding: '2rem', color: '#fff' }}>
      Загрузка тарифов...
    </div>
  );
}

export default function TariffsPage() {
  return (
    <Suspense fallback={<TariffsFallback />}>
      <TariffsPageContent />
    </Suspense>
  );
}
