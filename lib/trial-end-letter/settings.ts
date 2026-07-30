import AppSetting from '@/models/AppSetting';
import { mergeTrialEndTemplates } from './compose';
import { DEFAULT_TRIAL_END_TEMPLATES } from './defaults';
import type { TrialEndTemplates } from './types';

export const TRIAL_END_ENABLED_KEY = 'trial_end_letter_enabled';
export const TRIAL_END_TEMPLATES_KEY = 'trial_end_letter_templates';

export async function getTrialEndLetterEnabled(): Promise<boolean> {
  try {
    const row = await AppSetting.findByPk(TRIAL_END_ENABLED_KEY);
    if (!row) return false;
    const v = row.value.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  } catch {
    return false;
  }
}

export async function setTrialEndLetterEnabled(enabled: boolean): Promise<void> {
  await AppSetting.upsert({
    key: TRIAL_END_ENABLED_KEY,
    value: enabled ? 'true' : 'false',
  });
}

export async function getTrialEndTemplates(): Promise<TrialEndTemplates> {
  try {
    const row = await AppSetting.findByPk(TRIAL_END_TEMPLATES_KEY);
    if (!row?.value) return mergeTrialEndTemplates(DEFAULT_TRIAL_END_TEMPLATES);
    const parsed = JSON.parse(row.value) as Partial<TrialEndTemplates>;
    return mergeTrialEndTemplates(parsed);
  } catch {
    return mergeTrialEndTemplates(DEFAULT_TRIAL_END_TEMPLATES);
  }
}

export async function setTrialEndTemplates(templates: TrialEndTemplates): Promise<TrialEndTemplates> {
  const merged = mergeTrialEndTemplates(templates);
  await AppSetting.upsert({
    key: TRIAL_END_TEMPLATES_KEY,
    value: JSON.stringify(merged),
  });
  return merged;
}
