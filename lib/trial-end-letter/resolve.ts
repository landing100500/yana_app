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

type ChartPlanetFields = {
  sun: number;
  moon: number;
  mercury: number;
  venus: number;
  mars: number;
  jupiter: number;
  saturn: number;
  ascendant: number;
};

function getPlanetLongitude(chart: ChartPlanetFields, field: string): number | null {
  const key = field as keyof ChartPlanetFields;
  const value = chart[key];
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return value;
}

export async function resolveTrialEndInputs(userId: number): Promise<TrialEndResolveResult | null> {
  const anketa = await UserAnketa.findOne({ where: { userId } });
  const gender = parseAnketaGender(anketa?.gender);
  if (!gender) return null;

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
  if (!chart) return null;

  const ascendant = Number(chart.ascendant);
  if (!Number.isFinite(ascendant)) return null;

  const lagnaSign = longitudeToSignIndex(ascendant);
  const planetField = SIGN_RULER[lagnaSign];
  const planetLon = getPlanetLongitude(chart as unknown as ChartPlanetFields, planetField);
  if (planetLon == null) return null;

  const lagneshaHouse = wholeSignHouse(planetLon, lagnaSign);

  return {
    lagnaSign,
    lagneshaPlanet: PLANET_FIELD_RU[planetField] || planetField,
    lagneshaHouse,
    gender,
  };
}
