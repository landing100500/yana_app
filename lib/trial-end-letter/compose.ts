import { DEFAULT_TRIAL_END_TEMPLATES } from './defaults';
import type {
  HouseNumber,
  SignIndex,
  TrialEndTemplates,
  TrialGender,
  GenderedText,
} from './types';

function pickGendered(text: GenderedText | undefined, gender: TrialGender): string {
  if (!text) return '';
  return (gender === 'female' ? text.female : text.male) || text.male || text.female || '';
}

function mergeGendered(
  base: GenderedText | undefined,
  override: GenderedText | undefined
): GenderedText {
  return {
    male: override?.male?.trim() ? override.male : base?.male || '',
    female: override?.female?.trim() ? override.female : base?.female || base?.male || '',
  };
}

/** Сливает сохранённые формулы с дефолтами (дыры не роняют прод). */
export function mergeTrialEndTemplates(stored: Partial<TrialEndTemplates> | null | undefined): TrialEndTemplates {
  const part1: TrialEndTemplates['part1'] = {};
  const part2: TrialEndTemplates['part2'] = {};

  for (let h = 1; h <= 12; h++) {
    const key = String(h);
    part1[key] = mergeGendered(DEFAULT_TRIAL_END_TEMPLATES.part1[key], stored?.part1?.[key]);
  }
  for (let s = 0; s <= 11; s++) {
    const key = String(s);
    part2[key] = mergeGendered(DEFAULT_TRIAL_END_TEMPLATES.part2[key], stored?.part2?.[key]);
  }

  const part3 =
    typeof stored?.part3 === 'string' && stored.part3.trim()
      ? stored.part3
      : DEFAULT_TRIAL_END_TEMPLATES.part3;

  return { part1, part2, part3 };
}

export function composeTrialEndLetter(params: {
  templates: TrialEndTemplates;
  lagneshaHouse: HouseNumber;
  lagnaSign: SignIndex;
  gender: TrialGender;
}): string {
  const { templates, lagneshaHouse, lagnaSign, gender } = params;
  const p1 = pickGendered(templates.part1[String(lagneshaHouse)], gender).trim();
  const p2 = pickGendered(templates.part2[String(lagnaSign)], gender).trim();
  const p3 = templates.part3.trim();
  return [p1, p2, p3].filter(Boolean).join('\n');
}
