/**
 * Расчет натальной карты с использованием Swiss Ephemeris
 * Используем динамический импорт для избежания проблем с webpack
 */
import {
  calculateMahadashas,
  DASHA_LORDS,
  NAKSHATRA_NAMES,
  type DashaPeriod,
} from '@/lib/vimshottari-dasha';

export type { DashaPeriod };

const path = require('path');

async function getSwisseph() {
  // Динамический импорт только на сервере
  if (typeof window === 'undefined') {
    return require('swisseph');
  }
  throw new Error('Swiss Ephemeris can only be used on the server');
}

/** Выставить путь к папке ephe Swiss Ephemeris (на сервере cwd может быть не корнем проекта). */
function setSwissephEphePath(swisseph: any) {
  if (typeof swisseph.swe_set_ephe_path !== 'function') return;
  const envPath = process.env.SWISSEPH_EPHE_PATH;
  const candidates = envPath
    ? [envPath]
    : [
        path.join(process.cwd(), 'node_modules', 'swisseph', 'ephe'),
        path.join(process.cwd(), 'swisseph', 'ephe'),
        path.join(__dirname, '..', 'node_modules', 'swisseph', 'ephe'),
      ];
  for (const ephePath of candidates) {
    try {
      swisseph.swe_set_ephe_path(ephePath);
      return;
    } catch (_) {
      /* ignore */
    }
  }
}

export interface BirthData {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  latitude: number;
  longitude: number;
  timezone: number;
}

export interface PlanetPosition {
  longitude: number;
  sign: number; // 0-11 (Меша, Вришабха, и т.д.)
  signName: string;
  degree: number; // Градус в знаке (0-29.99)
  degreeMinutes?: number; // Минуты
  degreeSeconds?: number; // Секунды
  speed?: number; // Скорость планеты (для определения ретроградности)
  isRetrograde?: boolean; // Ретроградность
  house?: number; // Дом (1-12)
  dignity?: string; // Достоинство планеты (exaltation, fall, rulership, etc.)
  nakshatra?: number; // Индекс накшатры (0-26)
  nakshatraName?: string; // Название накшатры
  pada?: number; // Пада накшатры (1-4)
  nakshatraRuler?: string; // Управитель накшатры (Кету, Венера, Солнце, Луна, Марс, Раху, Юпитер, Сатурн, Меркурий)
  karaka?: string; // Карака (AK, АмК, БК, MK, ПК, ΓΚ, ДК, ПиК)
}

export interface NavamshaData {
  sun: PlanetPosition;
  moon: PlanetPosition;
  mercury: PlanetPosition;
  venus: PlanetPosition;
  mars: PlanetPosition;
  jupiter: PlanetPosition;
  saturn: PlanetPosition;
  ascendant: PlanetPosition;
}

export interface NatalChartData {
  julianDay: number;
  siderealTime: number;
  houseSystem: string;
  ayanamsa: number; // Значение аянамши
  ayanamsaName: string; // Название аянамши (Лахири)
  planets: {
    sun: PlanetPosition;
    moon: PlanetPosition;
    mercury: PlanetPosition;
    venus: PlanetPosition;
    mars: PlanetPosition;
    jupiter: PlanetPosition;
    saturn: PlanetPosition;
    uranus: PlanetPosition;
    neptune: PlanetPosition;
    pluto: PlanetPosition;
    northNode: PlanetPosition; // Раху
    southNode: PlanetPosition; // Кету
  };
  houses: {
    ascendant: PlanetPosition; // Лагна
    midheaven: PlanetPosition; // MC
    house1: PlanetPosition;
    house2: PlanetPosition;
    house3: PlanetPosition;
    house4: PlanetPosition;
    house5: PlanetPosition;
    house6: PlanetPosition;
    house7: PlanetPosition;
    house8: PlanetPosition;
    house9: PlanetPosition;
    house10: PlanetPosition;
    house11: PlanetPosition;
    house12: PlanetPosition;
  };
  navamsha?: NavamshaData; // D9 - навамша
  dashas?: DashaPeriod[]; // Вимшоттари даши
}

// Названия знаков в ведической астрологии (сидерический зодиак)
const SIGN_NAMES = [
  'Меша',      // Овен (Aries)
  'Вришабха',  // Телец (Taurus)
  'Митхуна',   // Близнецы (Gemini)
  'Карка',     // Рак (Cancer)
  'Симха',     // Лев (Leo)
  'Канья',     // Дева (Virgo)
  'Тула',      // Весы (Libra)
  'Вришчика',  // Скорпион (Scorpio)
  'Дхану',     // Стрелец (Sagittarius)
  'Макара',    // Козерог (Capricorn)
  'Кумбха',    // Водолей (Aquarius)
  'Мина'       // Рыбы (Pisces)
];

// NAKSHATRA_NAMES импортирован из vimshottari-dasha (27 накшатр, включая Пурнавасу)

function longitudeToSign(longitude: number): { sign: number; degree: number; signName: string } {
  // Нормализуем долготу в диапазон 0-360
  let normalized = longitude % 360;
  if (normalized < 0) normalized += 360;
  
  const sign = Math.floor(normalized / 30);
  const degree = normalized % 30;
  
  return {
    sign: sign % 12,
    degree,
    signName: SIGN_NAMES[sign % 12]
  };
}

// Функция для определения накшатры
function longitudeToNakshatra(longitude: number): { nakshatra: number; pada: number; name: string } {
  let normalized = longitude % 360;
  if (normalized < 0) normalized += 360;
  
  // Каждая накшатра занимает 13.333... градуса (360/27)
  const nakshatraIndex = Math.floor(normalized / (360 / 27));
  const degreeInNakshatra = normalized % (360 / 27);
  const pada = Math.floor(degreeInNakshatra / (360 / 27 / 4)) + 1; // Пада от 1 до 4
  
  return {
    nakshatra: nakshatraIndex % 27,
    pada: pada > 4 ? 4 : pada,
    name: NAKSHATRA_NAMES[nakshatraIndex % 27]
  };
}

export async function calculateNatalChart(birthData: BirthData): Promise<NatalChartData> {
  try {
    const swisseph = await getSwisseph();
    setSwissephEphePath(swisseph);

    // Конвертируем локальное время в UTC (local = UTC + timezone => UTC = local - timezone)
    let hourUTC = birthData.hour - birthData.timezone;
    let dayUTC = birthData.day;
    let monthUTC = birthData.month;
    let yearUTC = birthData.year;
    
    // Корректируем дату при переходе через полночь
    if (hourUTC < 0) {
      hourUTC += 24;
      dayUTC -= 1;
      if (dayUTC < 1) {
        monthUTC -= 1;
        if (monthUTC < 1) {
          monthUTC = 12;
          yearUTC -= 1;
        }
        const daysInMonth = new Date(yearUTC, monthUTC, 0).getDate();
        dayUTC = daysInMonth;
      }
    } else if (hourUTC >= 24) {
      hourUTC -= 24;
      dayUTC += 1;
      const daysInMonth = new Date(yearUTC, monthUTC, 0).getDate();
      if (dayUTC > daysInMonth) {
        dayUTC = 1;
        monthUTC += 1;
        if (monthUTC > 12) {
          monthUTC = 1;
          yearUTC += 1;
        }
      }
    }
    
    // Вычисляем юлианский день (UT)
    const julianDay = swisseph.swe_julday(
      yearUTC,
      monthUTC,
      dayUTC,
      hourUTC + birthData.minute / 60,
      swisseph.SE_GREG_CAL
    );

    // Флаги для расчета в ведической астрологии (сидерический зодиак)
    const flags = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SPEED | swisseph.SEFLG_SIDEREAL;
    
    // Аянамша: по умолчанию Lahiri (совпадает с эталоном vedic-horo при корректной широте и системе домов)
    const ayanamsaEnv = (process.env.NATAL_CHART_AYANAMSA || 'LAHIRI').toUpperCase().replace(/-/g, '_');
    const ayanamsaMap: Record<string, number> = {
      FAGAN_BRADLEY: swisseph.SE_SIDM_FAGAN_BRADLEY,
      LAHIRI: swisseph.SE_SIDM_LAHIRI,
      DELUCE: swisseph.SE_SIDM_DELUCE,
      RAMAN: swisseph.SE_SIDM_RAMAN,
      USHASHASHI: swisseph.SE_SIDM_USHASHASHI,
      KRISHNAMURTI: swisseph.SE_SIDM_KRISHNAMURTI,
      YUKTESHWAR: swisseph.SE_SIDM_YUKTESHWAR,
      TRUE_CITRA: swisseph.SE_SIDM_TRUE_CITRA,
      SS_CITRA: swisseph.SE_SIDM_SS_CITRA,
      SURYASIDDHANTA: swisseph.SE_SIDM_SURYASIDDHANTA,
      SS_REVATI: swisseph.SE_SIDM_SS_REVATI,
      TRUE_REVATI: swisseph.SE_SIDM_TRUE_REVATI,
      TRUE_PUSHYA: swisseph.SE_SIDM_TRUE_PUSHYA,
      TRUE_MULA: swisseph.SE_SIDM_TRUE_MULA,
      ARYABHATA: swisseph.SE_SIDM_ARYABHATA,
    };
    const ayanamsa = ayanamsaMap[ayanamsaEnv] ?? swisseph.SE_SIDM_LAHIRI;
    swisseph.swe_set_sid_mode(ayanamsa, 0, 0);
    
    // Вспомогательные функции для расчета планет
    // Определяем дом для планеты в системе Whole Sign Houses
    // В Whole Sign системе планета находится в доме, соответствующем знаку, в котором она находится
    const getPlanetHouse = (planetLongitude: number, houses: { house1: PlanetPosition; house2: PlanetPosition; house3: PlanetPosition; house4: PlanetPosition; house5: PlanetPosition; house6: PlanetPosition; house7: PlanetPosition; house8: PlanetPosition; house9: PlanetPosition; house10: PlanetPosition; house11: PlanetPosition; house12: PlanetPosition }): number => {
      // Нормализуем долготу планеты
      let planetNorm = planetLongitude % 360;
      if (planetNorm < 0) planetNorm += 360;
      
      // Определяем знак планеты
      const planetSign = Math.floor(planetNorm / 30) % 12;
      
      // В Whole Sign системе каждый дом занимает целый знак
      // Дом 1 = знак Лагны, Дом 2 = следующий знак, и т.д.
      // Находим, какой дом соответствует знаку планеты
      for (let i = 1; i <= 12; i++) {
        const house = houses[`house${i}` as keyof typeof houses] as PlanetPosition;
        if (!house) continue;
        
        // В Whole Sign системе куспид дома = начало знака (0° знака)
        const houseSign = Math.floor(house.longitude / 30) % 12;
        
        if (houseSign === planetSign) {
          return i;
        }
      }
      
      // Если не нашли, возвращаем дом 1 по умолчанию
      return 1;
    };
    
    // Определяем достоинство планеты
    const getPlanetDignity = (planetId: number, longitude: number): string => {
      const sign = Math.floor(longitude / 30) % 12;
      
      const rulerships: Record<number, number[]> = {
        [swisseph.SE_SUN]: [4], // Лев
        [swisseph.SE_MOON]: [3], // Рак
        [swisseph.SE_MERCURY]: [1, 5], // Близнецы, Дева
        [swisseph.SE_VENUS]: [1, 5], // Телец, Весы
        [swisseph.SE_MARS]: [0, 7], // Овен, Скорпион
        [swisseph.SE_JUPITER]: [8, 10], // Стрелец, Рыбы
        [swisseph.SE_SATURN]: [9, 10], // Козерог, Водолей
      };
      
      const exaltations: Record<number, number> = {
        [swisseph.SE_SUN]: 4, // Лев
        [swisseph.SE_MOON]: 1, // Телец
        [swisseph.SE_MERCURY]: 5, // Дева
        [swisseph.SE_VENUS]: 8, // Рыбы
        [swisseph.SE_MARS]: 9, // Козерог
        [swisseph.SE_JUPITER]: 3, // Рак
        [swisseph.SE_SATURN]: 6, // Весы
      };
      
      const falls: Record<number, number> = {
        [swisseph.SE_SUN]: 9, // Водолей
        [swisseph.SE_MOON]: 6, // Скорпион
        [swisseph.SE_MERCURY]: 11, // Рыбы
        [swisseph.SE_VENUS]: 1, // Дева
        [swisseph.SE_MARS]: 2, // Рак
        [swisseph.SE_JUPITER]: 8, // Козерог
        [swisseph.SE_SATURN]: 3, // Овен
      };
      
      if (rulerships[planetId]?.includes(sign)) {
        return 'Управление';
      } else if (exaltations[planetId] === sign) {
        return 'Экзальтация';
      } else if (falls[planetId] === sign) {
        return 'Падение';
      }
      
      return 'Нейтрально';
    };
    
    // Рассчитываем позиции планет
    const calculatePlanet = (planetId: number, houses?: { house1: PlanetPosition; house2: PlanetPosition; house3: PlanetPosition; house4: PlanetPosition; house5: PlanetPosition; house6: PlanetPosition; house7: PlanetPosition; house8: PlanetPosition; house9: PlanetPosition; house10: PlanetPosition; house11: PlanetPosition; house12: PlanetPosition }): PlanetPosition => {
      try {
        const result = swisseph.swe_calc_ut(julianDay, planetId, flags);
        
        if (!result) {
          throw new Error(`Пустой результат для планеты ${planetId}`);
        }
        
        let longitude: number;
        let speed: number = 0;
        
        if (result && result.xx && Array.isArray(result.xx) && result.xx.length > 0) {
          longitude = result.xx[0];
          speed = result.xx[3] || 0;
        } else if (result && Array.isArray(result) && result.length > 0) {
          longitude = result[0];
          speed = result[3] || 0;
        } else if (result && typeof result.longitude === 'number') {
          longitude = result.longitude;
          speed = result.speed || 0;
        } else if (result && Array.isArray(result.longitude) && result.longitude.length > 0) {
          longitude = result.longitude[0];
          speed = result.speed || 0;
        } else {
          console.error('Неожиданный формат результата swisseph для планеты', planetId, ':', result);
          throw new Error(`Неверный формат ответа для планеты ${planetId}`);
        }
        
        if (isNaN(longitude) || longitude === undefined || longitude === null) {
          throw new Error(`Не удалось получить долготу для планеты ${planetId}`);
        }
        
        const signData = longitudeToSign(longitude);
        
        // Преобразуем градусы в градусы, минуты, секунды
        const totalDegrees = longitude;
        const degrees = Math.floor(totalDegrees);
        const minutesFloat = (totalDegrees - degrees) * 60;
        const minutes = Math.floor(minutesFloat);
        const seconds = Math.round((minutesFloat - minutes) * 60);
        
        // Определяем ретроградность
        const isRetrograde = speed < 0;
        
        // Определяем достоинство
        const dignity = getPlanetDignity(planetId, longitude);
        
        // Определяем дом
        const house = houses ? getPlanetHouse(longitude, houses) : 0;
        
        // Определяем накшатру
        const nakshatraData = longitudeToNakshatra(longitude);
        
        const rulerIndex = nakshatraData.nakshatra % 9;
        const rulerAbbr: Record<string, string> = {
          Кету: 'Ке',
          Венера: 'Ve',
          Солнце: 'Su',
          Луна: 'Mo',
          Марс: 'Ma',
          Раху: 'Ra',
          Юпитер: 'Ju',
          Сатурн: 'Sa',
          Меркурий: 'Me',
        };
        const nakshatraRuler = rulerAbbr[DASHA_LORDS[rulerIndex]] || DASHA_LORDS[rulerIndex];
        
        return {
          longitude,
          sign: signData.sign,
          signName: signData.signName,
          degree: signData.degree,
          degreeMinutes: minutes % 60,
          degreeSeconds: seconds,
          speed,
          isRetrograde,
          house,
          dignity,
          nakshatra: nakshatraData.nakshatra,
          nakshatraName: nakshatraData.name,
          pada: nakshatraData.pada,
          nakshatraRuler
        };
      } catch (error: any) {
        console.error(`Ошибка при расчете планеты ${planetId}:`, error);
        throw new Error(`Ошибка при расчете планеты ${planetId}: ${error.message}`);
      }
    };
    
    // Проверяем параметры перед расчетом домов
    if (isNaN(birthData.latitude) || isNaN(birthData.longitude)) {
      throw new Error(`Неверные координаты: lat=${birthData.latitude}, lon=${birthData.longitude}`);
    }
    
    const latitude = birthData.latitude;
    // На высоких широтах (>66.5°) Placidus не сходится — пробуем Equal (E) первым
    const systemsToTry = Math.abs(latitude) > 66.5 ? ['E', 'P', 'S', 'K', 'R'] : ['P', 'S', 'K', 'E', 'R'];
    
    // Сначала получаем асцендент (Лагну) через swe_houses
    let housesResult: any = null;
    let houseSystemUsed = 'W'; // Whole Sign Houses для ведической астрологии
    
    // Получаем асцендент через swe_houses (любая система даст нам асцендент)
    for (const system of systemsToTry) {
      try {
        housesResult = swisseph.swe_houses(
          julianDay,
          latitude,
          birthData.longitude,
          system
        );
        if (housesResult && !housesResult.error) break;
      } catch (err: any) {
        console.warn(`Ошибка при использовании системы ${system} для получения асцендента:`, err.message);
      }
    }
    
    if (!housesResult || housesResult.error) {
      throw new Error(`Не удалось получить асцендент. ${housesResult?.error || 'Все системы домов вернули ошибку'}.`);
    }
    
    // Получаем асцендент из результата
    let ascendantLongitude: number;
    if (housesResult.ascmc && Array.isArray(housesResult.ascmc) && housesResult.ascmc.length > 0) {
      ascendantLongitude = housesResult.ascmc[0];
    } else if (housesResult.ascendant !== undefined) {
      ascendantLongitude = housesResult.ascendant;
    } else {
      throw new Error('Не удалось получить асцендент из результата swe_houses.');
    }
    
    // Получаем MC
    let mcLongitude: number;
    if (housesResult.ascmc && Array.isArray(housesResult.ascmc) && housesResult.ascmc.length > 1) {
      mcLongitude = housesResult.ascmc[1];
    } else if (housesResult.mc !== undefined) {
      mcLongitude = housesResult.mc;
    } else {
      // Если MC не получен, используем приблизительный расчет
      const ascSign = Math.floor((ascendantLongitude % 360) / 30);
      mcLongitude = ((ascSign + 9) % 12) * 30;
    }
    
    // swe_houses возвращает тропические позиции; переводим в сидерические (Лахири)
    const ayanamsaValue = swisseph.swe_get_ayanamsa(julianDay);
    ascendantLongitude = (ascendantLongitude - ayanamsaValue + 360) % 360;
    mcLongitude = (mcLongitude - ayanamsaValue + 360) % 360;
    
    // Нормализуем долготу асцендента
    let ascNormalized = ascendantLongitude % 360;
    if (ascNormalized < 0) ascNormalized += 360;

    // Определяем знак Лагны (восходящий знак)
    const lagnaSign = Math.floor(ascNormalized / 30) % 12;
    
    // Функция для расчета дома в Whole Sign системе
    // В Whole Sign Houses каждый дом занимает целый знак (30°)
    // Дом 1 = знак Лагны, Дом 2 = следующий знак, и т.д.
    const calculateWholeSignHouse = (houseNum: number): PlanetPosition => {
      // Дом 1 начинается со знака Лагны
      // Дом 2 - следующий знак, и так далее
      const houseSign = (lagnaSign + houseNum - 1) % 12;
      // Куспид дома - начало знака (0° знака)
      const houseLongitude = houseSign * 30;
      
      return {
        longitude: houseLongitude,
        sign: houseSign,
        signName: SIGN_NAMES[houseSign],
        degree: 0
      };
    };
    
    // Рассчитываем асцендент
    const ascendant = {
      longitude: ascendantLongitude,
      sign: lagnaSign,
      signName: SIGN_NAMES[lagnaSign],
      degree: ascNormalized % 30
    };
    
    // Рассчитываем MC
    const mcSignData = longitudeToSign(mcLongitude);
    const midheaven = {
      longitude: mcLongitude,
      sign: mcSignData.sign,
      signName: mcSignData.signName,
      degree: mcSignData.degree
    };
    
    // Рассчитываем куспиды всех 12 домов по Whole Sign системе
    const house1 = calculateWholeSignHouse(1);
    const house2 = calculateWholeSignHouse(2);
    const house3 = calculateWholeSignHouse(3);
    const house4 = calculateWholeSignHouse(4);
    const house5 = calculateWholeSignHouse(5);
    const house6 = calculateWholeSignHouse(6);
    const house7 = calculateWholeSignHouse(7);
    const house8 = calculateWholeSignHouse(8);
    const house9 = calculateWholeSignHouse(9);
    const house10 = calculateWholeSignHouse(10);
    const house11 = calculateWholeSignHouse(11);
    const house12 = calculateWholeSignHouse(12);
    
    // Для совместимости с существующим кодом, создаем ascmc массив
    const ascmc = [
      ascendantLongitude,
      mcLongitude,
      housesResult.ascmc?.[2] || 0,
      housesResult.ascmc?.[3] || 0
    ];
    
    // Создаем объект домов для определения позиций планет
    const housesObj = {
      house1, house2, house3, house4, house5, house6,
      house7, house8, house9, house10, house11, house12
    };
    
    // Планеты (SE уже в сидерике по выбранной аянамше)
    const sunFull = calculatePlanet(swisseph.SE_SUN, housesObj);
    const moonFull = calculatePlanet(swisseph.SE_MOON, housesObj);
    const mercuryFull = calculatePlanet(swisseph.SE_MERCURY, housesObj);
    const venusFull = calculatePlanet(swisseph.SE_VENUS, housesObj);
    const marsFull = calculatePlanet(swisseph.SE_MARS, housesObj);
    const jupiterFull = calculatePlanet(swisseph.SE_JUPITER, housesObj);
    const saturnFull = calculatePlanet(swisseph.SE_SATURN, housesObj);
    const uranusFull = calculatePlanet(swisseph.SE_URANUS, housesObj);
    const neptuneFull = calculatePlanet(swisseph.SE_NEPTUNE, housesObj);
    const plutoFull = calculatePlanet(swisseph.SE_PLUTO, housesObj);
    const northNodeFull = calculatePlanet(swisseph.SE_TRUE_NODE, housesObj);
    const southNodeFull = calculatePlanet(swisseph.SE_TRUE_NODE, housesObj);
    southNodeFull.longitude = (southNodeFull.longitude + 180) % 360;
    const southNodeSign = longitudeToSign(southNodeFull.longitude);
    southNodeFull.sign = southNodeSign.sign;
    southNodeFull.signName = southNodeSign.signName;
    southNodeFull.degree = southNodeSign.degree;
    southNodeFull.house = getPlanetHouse(southNodeFull.longitude, housesObj);
    
    // Сидерическое время (ARMC - Ascendant Right Ascension)
    const siderealTime = (ascmc[2] !== undefined && !isNaN(ascmc[2])) ? ascmc[2] : 0;

    const ayanamsaName = ayanamsa === swisseph.SE_SIDM_FAGAN_BRADLEY ? 'Fagan-Bradley' : 'Лахири';

    // Рассчитываем навамшу (D9) - девятая варга
    // Навамша делит каждый знак на 9 частей по 3°20' (3.333... градуса)
    // Правило: 
    // - Movable знаки (0,3,6,9 - Овен, Рак, Весы, Козерог): начинаем с того же знака
    // - Fixed знаки (1,4,7,10 - Телец, Лев, Скорпион, Водолей): начинаем с 9-го знака от исходного
    // - Dual знаки (2,5,8,11 - Близнецы, Дева, Стрелец, Рыбы): начинаем с 5-го знака от исходного
    const calculateNavamsha = (planetLongitude: number): PlanetPosition => {
      let normalized = planetLongitude % 360;
      if (normalized < 0) normalized += 360;
      
      const sign = Math.floor(normalized / 30) % 12;
      const degreeInSign = normalized % 30;
      
      // Определяем номер навамши (1-9)
      const navamshaSize = 30 / 9; // 3.333...
      const navamshaNumber = Math.floor(degreeInSign / navamshaSize) + 1;
      const navamshaNum = navamshaNumber > 9 ? 9 : navamshaNumber;
      
      // Определяем начальный знак для навамши (как на vedic-horo / стандарт Джйотиш)
      let startSign: number;
      if ([0, 3, 6, 9].includes(sign)) {
        // Movable (Овен, Рак, Весы, Козерог) — 1-я навамша = тот же знак
        startSign = sign;
      } else if ([1, 4, 7, 10].includes(sign)) {
        // Fixed (Телец, Лев, Скорпион, Водолей) — с 9-го знака (Каприкорн и далее)
        startSign = (sign + 9) % 12;
      } else {
        // Dual (Близнецы, Дева, Стрелец, Рыбы) — с 4-го знака вперёд, чтобы 9-я навамша = тот же знак
        startSign = (sign + 4) % 12;
      }
      
      // Знак навамши = начальный знак + (номер навамши - 1)
      const navamshaSign = (startSign + navamshaNum - 1) % 12;
      
      // Градус в навамше = остаток от деления градуса в знаке на размер навамши, умноженный на 9
      const navamshaDegree = (degreeInSign % navamshaSize) * 9;
      const navamshaLongitude = navamshaSign * 30 + navamshaDegree;
      
      const signData = longitudeToSign(navamshaLongitude);
      return {
        longitude: navamshaLongitude,
        sign: signData.sign,
        signName: signData.signName,
        degree: signData.degree,
      };
    };

    const navamsha: NavamshaData = {
      sun: calculateNavamsha(sunFull.longitude),
      moon: calculateNavamsha(moonFull.longitude),
      mercury: calculateNavamsha(mercuryFull.longitude),
      venus: calculateNavamsha(venusFull.longitude),
      mars: calculateNavamsha(marsFull.longitude),
      jupiter: calculateNavamsha(jupiterFull.longitude),
      saturn: calculateNavamsha(saturnFull.longitude),
      ascendant: calculateNavamsha(ascendant.longitude),
    };

    // Рассчитываем караки (только для 7 планет: Солнце, Луна, Марс, Меркурий, Юпитер, Венера, Сатурн)
    // Караки определяются по градусу планеты ВНУТРИ знака (0°..29°59'), от наибольшего к наименьшему.
    // Это устраняет неверные случаи, когда сравнение по полной долготе 0..360 дает неправильную AK.
    // Порядок карак: AK (Атмакарака - наибольшая), АмК, БК, MK, ПК, ΓΚ, ДК (Дарикарака - наименьшая)
    const planetsForKaraka = [
      { name: 'sun', longitude: sunFull.longitude, planetName: 'Солнце' },
      { name: 'moon', longitude: moonFull.longitude, planetName: 'Луна' },
      { name: 'mars', longitude: marsFull.longitude, planetName: 'Марс' },
      { name: 'mercury', longitude: mercuryFull.longitude, planetName: 'Меркурий' },
      { name: 'jupiter', longitude: jupiterFull.longitude, planetName: 'Юпитер' },
      { name: 'venus', longitude: venusFull.longitude, planetName: 'Венера' },
      { name: 'saturn', longitude: saturnFull.longitude, planetName: 'Сатурн' },
    ];
    
    // Сортируем по градусу внутри знака (от наибольшего к наименьшему)
    const sortedPlanets = [...planetsForKaraka].sort((a, b) => {
      const aInSign = (((a.longitude % 360) + 360) % 360) % 30;
      const bInSign = (((b.longitude % 360) + 360) % 360) % 30;
      return bInSign - aInSign;
    });
    
    // Назначаем караки в порядке от наибольшей долготы (AK) к наименьшей (ДК)
    const karakaNames = ['AK', 'АмК', 'БК', 'MK', 'ПК', 'ΓΚ', 'ДК'];
    const karakaMap: Record<string, string> = {};
    sortedPlanets.forEach((planet, index) => {
      if (index < karakaNames.length) {
        karakaMap[planet.name] = karakaNames[index];
      }
    });
    
    // Добавляем караки к планетам
    sunFull.karaka = karakaMap['sun'];
    moonFull.karaka = karakaMap['moon'];
    marsFull.karaka = karakaMap['mars'];
    mercuryFull.karaka = karakaMap['mercury'];
    jupiterFull.karaka = karakaMap['jupiter'];
    venusFull.karaka = karakaMap['venus'];
    saturnFull.karaka = karakaMap['saturn'];

    const chartDate = `${birthData.year}-${String(birthData.month).padStart(2, '0')}-${String(birthData.day).padStart(2, '0')}`;
    const chartTime = `${String(birthData.hour).padStart(2, '0')}:${String(birthData.minute).padStart(2, '0')}`;
    const dashas: DashaPeriod[] = calculateMahadashas({
      moonLongitude: moonFull.longitude,
      birthDate: chartDate,
      birthTime: chartTime,
      timezone: birthData.timezone,
      cycles: 1,
    });

    return {
      julianDay,
      siderealTime,
      houseSystem: houseSystemUsed,
      ayanamsa: ayanamsaValue,
      ayanamsaName,
      planets: {
        sun: sunFull,
        moon: moonFull,
        mercury: mercuryFull,
        venus: venusFull,
        mars: marsFull,
        jupiter: jupiterFull,
        saturn: saturnFull,
        uranus: uranusFull,
        neptune: neptuneFull,
        pluto: plutoFull,
        northNode: northNodeFull,
        southNode: southNodeFull
      },
      houses: {
        ascendant,
        midheaven,
        house1,
        house2,
        house3,
        house4,
        house5,
        house6,
        house7,
        house8,
        house9,
        house10,
        house11,
        house12
      },
      navamsha,
      dashas
    };
  } catch (error: any) {
    console.error('Natal chart calculation error:', error);
    throw new Error(`Ошибка при расчете натальной карты: ${error.message}`);
  }
}
