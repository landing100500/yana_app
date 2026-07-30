export type TrialGender = 'male' | 'female';

/** 0=Овен … 11=Рыбы */
export type SignIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

/** 1–12 */
export type HouseNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export type GenderedText = {
  male: string;
  female: string;
};

export type TrialEndTemplates = {
  part1: Record<string, GenderedText>; // "1".."12"
  part2: Record<string, GenderedText>; // "0".."11"
  part3: string;
};

export type TrialEndResolveResult = {
  lagnaSign: SignIndex;
  lagneshaPlanet: string;
  lagneshaHouse: HouseNumber;
  gender: TrialGender;
};

export const SIGN_NAMES_RU = [
  'Овен',
  'Телец',
  'Близнецы',
  'Рак',
  'Лев',
  'Дева',
  'Весы',
  'Скорпион',
  'Стрелец',
  'Козерог',
  'Водолей',
  'Рыбы',
] as const;

/** Управитель лагны (лагнеша): знак → планета */
export const SIGN_RULER: Record<SignIndex, string> = {
  0: 'mars', // Овен
  1: 'venus', // Телец
  2: 'mercury', // Близнецы
  3: 'moon', // Рак
  4: 'sun', // Лев
  5: 'mercury', // Дева
  6: 'venus', // Весы
  7: 'mars', // Скорпион
  8: 'jupiter', // Стрелец
  9: 'saturn', // Козерог
  10: 'saturn', // Водолей
  11: 'jupiter', // Рыбы
};

export const PLANET_FIELD_RU: Record<string, string> = {
  sun: 'Солнце',
  moon: 'Луна',
  mercury: 'Меркурий',
  venus: 'Венера',
  mars: 'Марс',
  jupiter: 'Юпитер',
  saturn: 'Сатурн',
};
