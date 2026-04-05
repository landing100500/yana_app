import AppSetting from '@/models/AppSetting';

export const PERSONALITY_READING_ALGORITHM_KEY = 'personality_reading_algorithm_enabled';

export async function getPersonalityReadingAlgorithmEnabled(): Promise<boolean> {
  try {
    const row = await AppSetting.findByPk(PERSONALITY_READING_ALGORITHM_KEY);
    if (!row) return false;
    const v = row.value.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  } catch {
    return false;
  }
}

export async function setPersonalityReadingAlgorithmEnabled(enabled: boolean): Promise<void> {
  await AppSetting.upsert({
    key: PERSONALITY_READING_ALGORITHM_KEY,
    value: enabled ? 'true' : 'false',
  });
}
