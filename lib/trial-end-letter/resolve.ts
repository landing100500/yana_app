import NatalChart from '@/models/NatalChart';
import UserAnketa from '@/models/UserAnketa';
import {
  PLANET_FIELD_RU,
  SIGN_RULER,
  type HouseNumber,
  type SignIndex,
  type TrialEndResolveResult,
  type TrialGender,
} from './types';

function longitudeToSignIndex(longitude: number): SignIndex {
  let normalized = longitude % 360;
  if (normalized < 0) normalized += 360;
  return (Math.floor(normalized / 30) % 12) as SignIndex;
}

/** Whole Sign: дом лагнеши относительно знака лагны. */
export function wholeSignHouse(planetLongitude: number, lagnaSign: SignIndex): HouseNumber {
  const planetSign = longitudeToSignIndex(planetLongitude);
  return ((((planetSign - lagnaSign + 12) % 12) + 1) as HouseNumber);
}

export function parseAnketaGender(raw: string | null | undefined): TrialGender | null {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'мужской' || v === 'male' || v === 'm') return 'male';
  if (v === 'женский' || v === 'female' || v === 'f') return 'female';
  return null;
}

function getPlanetLongitude(chart: Record<string, unknown>, field: string): number | null {
  const raw = chart[field];
  // DECIMAL из MySQL часто приходит строкой
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value)) return null;
  return value;
}

export type TrialEndResolveFailReason =
  | 'no_gender'
  | 'no_chart'
  | 'bad_ascendant'
  | 'bad_lagnesha';

export async function resolveTrialEndInputs(
  userId: number
): Promise<TrialEndResolveResult | { ok: false; reason: TrialEndResolveFailReason }> {
  const anketa = await UserAnketa.findOne({ where: { userId } });
  const gender = parseAnketaGender(anketa?.gender);
  if (!gender) return { ok: false, reason: 'no_gender' };

  let chart = await NatalChart.findOne({
    where: { userId, isMain: true },
    order: [['updatedAt', 'DESC']],
  });
  if (!chart) {
    chart = await NatalChart.findOne({
      where: { userId },
      order: [['updatedAt', 'DESC']],
    });
  }
  if (!chart) return { ok: false, reason: 'no_chart' };

  const ascendant = Number(chart.ascendant);
  if (!Number.isFinite(ascendant)) return { ok: false, reason: 'bad_ascendant' };

  const lagnaSign = longitudeToSignIndex(ascendant);
  const planetField = SIGN_RULER[lagnaSign];
  const planetLon = getPlanetLongitude(
    chart.get({ plain: true }) as unknown as Record<string, unknown>,
    planetField
  );
  if (planetLon == null) return { ok: false, reason: 'bad_lagnesha' };

  const lagneshaHouse = wholeSignHouse(planetLon, lagnaSign);

  return {
    lagnaSign,
    lagneshaPlanet: PLANET_FIELD_RU[planetField] || planetField,
    lagneshaHouse,
    gender,
  };
}

export function isTrialEndResolveResult(
  value: TrialEndResolveResult | { ok: false; reason: TrialEndResolveFailReason }
): value is TrialEndResolveResult {
  return !('ok' in value && value.ok === false);
}
