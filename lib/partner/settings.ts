import AppSetting from '@/models/AppSetting';

export const PARTNER_SETTINGS_KEYS = {
  commissionPercent: 'partner_commission_percent',
  volumeBonusPercent: 'partner_volume_bonus_percent',
  volumeThreshold: 'partner_volume_threshold',
  minWithdrawalRub: 'partner_min_withdrawal_rub',
  ndflPercent: 'partner_ndfl_percent',
  referralMonths: 'partner_referral_months',
} as const;

export interface PartnerSettings {
  commissionPercent: number;
  volumeBonusPercent: number;
  volumeThreshold: number;
  minWithdrawalRub: number;
  ndflPercent: number;
  referralMonths: number;
}

export const PARTNER_SETTINGS_DEFAULTS: PartnerSettings = {
  commissionPercent: 30,
  volumeBonusPercent: 5,
  volumeThreshold: 50,
  minWithdrawalRub: 5000,
  ndflPercent: 13,
  referralMonths: 6,
};

function parseNumber(raw: string | null | undefined, fallback: number): number {
  if (raw == null || raw === '') return fallback;
  const n = Number.parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

async function getSettingNumber(key: string, fallback: number): Promise<number> {
  try {
    const row = await AppSetting.findByPk(key);
    return parseNumber(row?.value, fallback);
  } catch {
    return fallback;
  }
}

export async function getPartnerSettings(): Promise<PartnerSettings> {
  const d = PARTNER_SETTINGS_DEFAULTS;
  const [
    commissionPercent,
    volumeBonusPercent,
    volumeThreshold,
    minWithdrawalRub,
    ndflPercent,
    referralMonths,
  ] = await Promise.all([
    getSettingNumber(PARTNER_SETTINGS_KEYS.commissionPercent, d.commissionPercent),
    getSettingNumber(PARTNER_SETTINGS_KEYS.volumeBonusPercent, d.volumeBonusPercent),
    getSettingNumber(PARTNER_SETTINGS_KEYS.volumeThreshold, d.volumeThreshold),
    getSettingNumber(PARTNER_SETTINGS_KEYS.minWithdrawalRub, d.minWithdrawalRub),
    getSettingNumber(PARTNER_SETTINGS_KEYS.ndflPercent, d.ndflPercent),
    getSettingNumber(PARTNER_SETTINGS_KEYS.referralMonths, d.referralMonths),
  ]);

  return {
    commissionPercent,
    volumeBonusPercent,
    volumeThreshold,
    minWithdrawalRub,
    ndflPercent,
    referralMonths,
  };
}

export async function setPartnerSettings(patch: Partial<PartnerSettings>): Promise<PartnerSettings> {
  const entries: Array<[string, number | undefined]> = [
    [PARTNER_SETTINGS_KEYS.commissionPercent, patch.commissionPercent],
    [PARTNER_SETTINGS_KEYS.volumeBonusPercent, patch.volumeBonusPercent],
    [PARTNER_SETTINGS_KEYS.volumeThreshold, patch.volumeThreshold],
    [PARTNER_SETTINGS_KEYS.minWithdrawalRub, patch.minWithdrawalRub],
    [PARTNER_SETTINGS_KEYS.ndflPercent, patch.ndflPercent],
    [PARTNER_SETTINGS_KEYS.referralMonths, patch.referralMonths],
  ];

  for (const [key, value] of entries) {
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid partner setting ${key}`);
    }
    await AppSetting.upsert({ key, value: String(value) });
  }

  return getPartnerSettings();
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatMoney(value: number): string {
  return roundMoney(value).toFixed(2);
}

export function parseMoney(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}
