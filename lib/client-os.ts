export type ClientOS = 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'unknown';

/** Определение ОС в браузере (для инструкций «установить на устройство»). */
export function getClientOS(): ClientOS {
  if (typeof navigator === 'undefined') return 'unknown';

  const ua = navigator.userAgent || '';
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform = nav.userAgentData?.platform || navigator.platform || '';

  const isTouchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/i.test(ua) || isTouchMac) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Win/i.test(platform) || /Windows/i.test(ua)) return 'windows';
  if (/Mac/i.test(platform) || /Mac OS X/i.test(ua)) return 'macos';
  if (/Linux/i.test(platform) || /Linux/i.test(ua)) return 'linux';
  return 'unknown';
}
