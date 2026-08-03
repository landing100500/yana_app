'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Ловит ?ref=CODE на любой странице и сохраняет cookie через API.
 */
export default function ReferralCapture() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get('ref') || searchParams.get('partner');
    if (!code) return;

    const normalized = code.trim().toUpperCase();
    if (normalized.length < 4) return;

    const key = `yana_ref_captured_${normalized}`;
    try {
      if (sessionStorage.getItem(key) === '1') return;
      sessionStorage.setItem(key, '1');
    } catch {
      // ignore
    }

    void fetch('/api/partner/ref', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: normalized }),
    }).catch(() => undefined);
  }, [searchParams]);

  return null;
}
