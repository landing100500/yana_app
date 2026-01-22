/**
 * Расчет натальной карты с использованием Swiss Ephemeris
 * Используем динамический импорт для избежания проблем с webpack
 */
async function getSwisseph() {
  // Динамический импорт только на сервере
  if (typeof window === 'undefined') {
    return require('swisseph');
  }
  throw new Error('Swiss Ephemeris can only be used on the server');
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

export interface DashaPeriod {
  planet: string;
  startDate: string;
  endDate: string;
  duration: string;
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

// Названия накшатр (27 лунных стоянок)
const NAKSHATRA_NAMES = [
  'Ашвини', 'Бхарани', 'Криттика', 'Рохини', 'Мригашира', 'Ардра',
  'Пушья', 'Ашлеша', 'Магха', 'Пурва Пхалгуни', 'Уттара Пхалгуни', 'Хаста',
  'Читра', 'Свати', 'Вишакха', 'Анурадха', 'Джьештха', 'Мула',
  'Пурва Ашадха', 'Уттара Ашадха', 'Шравана', 'Дхаништха', 'Шатабхиша',
  'Пурва Бхадрапада', 'Уттара Бхадрапада', 'Ревати'
];

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
    
    // Конвертируем локальное время в UTC
    const hourUTC = birthData.hour - birthData.timezone;
    const dayUTC = birthData.day;
    let monthUTC = birthData.month;
    let yearUTC = birthData.year;
    
    // Корректируем дату если час стал отрицательным
    let adjustedHour = hourUTC;
    if (adjustedHour < 0) {
      adjustedHour += 24;
      // Уменьшаем день
    }
    
    // Вычисляем юлианский день
    const julianDay = swisseph.swe_julday(
      yearUTC,
      monthUTC,
      dayUTC,
      adjustedHour + birthData.minute / 60,
      swisseph.SE_GREG_CAL
    );
    
    // Флаги для расчета в ведической астрологии (сидерический зодиак)
    // SEFLG_SIDEREAL - используем сидерический зодиак
    // SE_SIDM_LAHIRI - аянамша Лахири
    const flags = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SPEED | swisseph.SEFLG_SIDEREAL;
    
    // Устанавливаем аянамшу Лахири
    const ayanamsa = swisseph.SE_SIDM_LAHIRI;
    swisseph.swe_set_sid_mode(ayanamsa, 0, 0);
    
    // Вспомогательные функции для расчета планет
    // Определяем дом для планеты
    const getPlanetHouse = (planetLongitude: number, houses: { house1: PlanetPosition; house2: PlanetPosition; house3: PlanetPosition; house4: PlanetPosition; house5: PlanetPosition; house6: PlanetPosition; house7: PlanetPosition; house8: PlanetPosition; house9: PlanetPosition; house10: PlanetPosition; house11: PlanetPosition; house12: PlanetPosition }): number => {
      let planetNorm = planetLongitude % 360;
      if (planetNorm < 0) planetNorm += 360;
      
      const houseCusps = [
        houses.house1.longitude,
        houses.house2.longitude,
        houses.house3.longitude,
        houses.house4.longitude,
        houses.house5.longitude,
        houses.house6.longitude,
        houses.house7.longitude,
        houses.house8.longitude,
        houses.house9.longitude,
        houses.house10.longitude,
        houses.house11.longitude,
        houses.house12.longitude,
      ];
      
      for (let i = 0; i < 12; i++) {
        const cusp1 = houseCusps[i] % 360;
        const cusp2 = houseCusps[(i + 1) % 12] % 360;
        
        if (cusp2 < cusp1) {
          if (planetNorm >= cusp1 || planetNorm < cusp2) {
            return i + 1;
          }
        } else {
          if (planetNorm >= cusp1 && planetNorm < cusp2) {
            return i + 1;
          }
        }
      }
      
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
          pada: nakshatraData.pada
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
    
    // Ограничиваем широту для Placidus (не работает за полярными кругами)
    let latitude = birthData.latitude;
    if (Math.abs(latitude) > 66.5) {
      console.warn(`Широта ${latitude} близка к полярному кругу, используем ограничение`);
      latitude = latitude > 0 ? 66.0 : -66.0;
    }
    
    console.log('Параметры для swe_houses:', {
      julianDay,
      latitude,
      longitude: birthData.longitude,
      houseSystem: 'P'
    });
    
    // Рассчитываем дома в ведической астрологии
    // Используем систему Шрипати (S) для ведической астрологии
    // Также пробуем другие системы если Шрипати не работает
    let housesResult: any = null;
    let houseSystemUsed = 'S'; // Шрипати для ведической астрологии
    const houseSystems = ['S', 'P', 'K', 'E', 'R']; // Шрипати, Placidus, Koch, Equal, Regiomontanus
    
    for (const system of houseSystems) {
      try {
        console.log(`Пробуем систему домов: ${system}`);
        // Для ведической астрологии используем сидерический расчет домов
        // swe_houses с флагом сидерического зодиака
        housesResult = swisseph.swe_houses(
          julianDay,
          latitude,
          birthData.longitude,
          system
        );
        
        if (housesResult && !housesResult.error) {
          // Проверяем наличие ascmc или отдельных полей
          if (housesResult.ascmc || (housesResult.ascendant !== undefined && housesResult.mc !== undefined)) {
            houseSystemUsed = system;
            console.log(`Успешно использована система домов: ${system}`);
            break;
          }
        } else if (housesResult && housesResult.error) {
          console.warn(`Система ${system} вернула ошибку:`, housesResult.error);
          housesResult = null;
        }
      } catch (err: any) {
        console.warn(`Ошибка при использовании системы ${system}:`, err.message);
        housesResult = null;
      }
    }
    
    if (!housesResult || housesResult.error) {
      console.error('Не удалось рассчитать дома ни одной системой. Результат:', housesResult);
      throw new Error(`Не удалось рассчитать дома. ${housesResult?.error || 'Все системы домов вернули ошибку'}. Возможно, проблема с координатами или датой.`);
    }
    
    console.log('Результат swe_houses:', JSON.stringify(housesResult, null, 2));
    
    // swisseph может возвращать результат в разных форматах
    let ascmc: number[];
    let cusps: number[];
    
    // Формат 1: объект с ascmc и cusps
    if (housesResult.ascmc && Array.isArray(housesResult.ascmc)) {
      ascmc = housesResult.ascmc;
    } 
    // Формат 2: отдельные поля ascendant, mc, armc, vertex
    else if (housesResult.ascendant !== undefined && housesResult.mc !== undefined) {
      ascmc = [
        housesResult.ascendant,
        housesResult.mc,
        housesResult.armc || 0,
        housesResult.vertex || 0
      ];
      console.log('Используем формат с отдельными полями для ascmc');
    } else {
      console.error('Не найден ascmc в результате:', housesResult);
      throw new Error('Ошибка при расчете домов. Не найден ascmc в результате.');
    }
    
    // Формат 1: массив cusps (индексы 1-12)
    if (housesResult.cusps && Array.isArray(housesResult.cusps)) {
      cusps = housesResult.cusps;
    } 
    // Формат 2: массив house (индексы 0-11 для домов 1-12)
    else if (housesResult.house && Array.isArray(housesResult.house) && housesResult.house.length >= 12) {
      // Добавляем элемент в начало для соответствия индексации cusps[1-12]
      // house[0] = дом 1, house[11] = дом 12
      cusps = [0, ...housesResult.house];
      console.log('Используем формат house, преобразован в cusps. Длина house:', housesResult.house.length);
    } else {
      console.error('Не найден cusps/house в результате:', housesResult);
      throw new Error('Ошибка при расчете домов. Не найден cusps/house в результате.');
    }
    
    const calculateHouse = (longitude: number): PlanetPosition => {
      if (longitude === undefined || isNaN(longitude)) {
        throw new Error(`Неверная долгота для дома: ${longitude}`);
      }
      const signData = longitudeToSign(longitude);
      return {
        longitude,
        sign: signData.sign,
        signName: signData.signName,
        degree: signData.degree
      };
    };
    
    // ascmc: [ascendant, midheaven, armc, vertex]
    if (!Array.isArray(ascmc) || ascmc.length < 2) {
      throw new Error(`Неверный формат ascmc: ${JSON.stringify(ascmc)}`);
    }
    
    const ascendant = calculateHouse(ascmc[0]);
    const midheaven = calculateHouse(ascmc[1]);
    
    // cusps: индексы 1-12 соответствуют домам 1-12
    // В swisseph cusps может быть массивом из 13 элементов (0-12), где индекс 0 не используется
    // Или массивом из 12 элементов (0-11), где индекс 0 = дом 1
    if (!Array.isArray(cusps) || cusps.length < 12) {
      throw new Error(`Неверный формат cusps: длина ${cusps.length}, ожидалось >= 12`);
    }
    
    console.log('Длина cusps:', cusps.length, 'формат:', cusps.length === 13 ? 'стандартный (0-12)' : 'альтернативный (0-11)');
    
    // Получаем куспиды домов
    // Если cusps имеет 13 элементов (индексы 0-12), используем индексы 1-12
    // Если cusps имеет 12 элементов (индексы 0-11), используем индексы 0-11 для домов 1-12
    const getHouseCusp = (houseNum: number): number => {
      if (cusps.length >= 13) {
        // Формат с индексом 0 неиспользуемым, дома в индексах 1-12
        return cusps[houseNum];
      } else if (cusps.length >= 12) {
        // Формат где индекс 0 = дом 1, индекс 11 = дом 12
        return cusps[houseNum - 1];
      } else {
        throw new Error(`Не удалось получить куспид дома ${houseNum}. Длина массива: ${cusps.length}`);
      }
    };
    
    const house1 = calculateHouse(getHouseCusp(1));
    const house2 = calculateHouse(getHouseCusp(2));
    const house3 = calculateHouse(getHouseCusp(3));
    const house4 = calculateHouse(getHouseCusp(4));
    const house5 = calculateHouse(getHouseCusp(5));
    const house6 = calculateHouse(getHouseCusp(6));
    const house7 = calculateHouse(getHouseCusp(7));
    const house8 = calculateHouse(getHouseCusp(8));
    const house9 = calculateHouse(getHouseCusp(9));
    const house10 = calculateHouse(getHouseCusp(10));
    const house11 = calculateHouse(getHouseCusp(11));
    const house12 = calculateHouse(getHouseCusp(12));
    
    // Создаем объект домов для определения позиций планет
    const housesObj = {
      house1, house2, house3, house4, house5, house6,
      house7, house8, house9, house10, house11, house12
    };
    
    // Пересчитываем планеты с учетом домов и дополнительных параметров
    // Планеты
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
    
    // Лунные узлы
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

    // Получаем значение аянамши
    const ayanamsaValue = swisseph.swe_get_ayanamsa(julianDay);
    const ayanamsaName = 'Лахири';

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
      
      // Определяем начальный знак для навамши в зависимости от типа знака
      let startSign: number;
      if ([0, 3, 6, 9].includes(sign)) {
        // Movable (Овен, Рак, Весы, Козерог) - начинаем с того же знака
        startSign = sign;
      } else if ([1, 4, 7, 10].includes(sign)) {
        // Fixed (Телец, Лев, Скорпион, Водолей) - начинаем с 9-го знака
        startSign = (sign + 9) % 12;
      } else {
        // Dual (Близнецы, Дева, Стрелец, Рыбы) - начинаем с 5-го знака
        startSign = (sign + 5) % 12;
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

    // Рассчитываем Вимшоттари даши
    // Начало даши рассчитывается от положения Луны в накшатре
    const moonLongitude = moonFull.longitude;
    const moonNormalized = moonLongitude % 360;
    const nakshatraIndex = Math.floor(moonNormalized / 13.333333);
    const nakshatraDegree = moonNormalized % 13.333333;
    
    // Периоды Вимшоттари даши (в годах) в порядке: Кету, Венера, Солнце, Луна, Марс, Раху, Юпитер, Сатурн, Меркурий
    const dashaPeriods = [7, 20, 6, 10, 7, 18, 16, 19, 17];
    const dashaLords = ['Кету', 'Венера', 'Солнце', 'Луна', 'Марс', 'Раху', 'Юпитер', 'Сатурн', 'Меркурий'];
    
    // Определяем управителя накшатры и начальную дашу
    // 27 накшатр, каждая управляется одной из 9 планет в цикле
    // Порядок планет: Кету(0), Венера(1), Солнце(2), Луна(3), Марс(4), Раху(5), Юпитер(6), Сатурн(7), Меркурий(8)
    const nakshatraRulers = [
      0, 1, 2, 3, 4, 5, 6, 7, 8, // Ашвини(0) - Анурадха(8)
      0, 1, 2, 3, 4, 5, 6, 7, 8, // Джьештха(9) - Ревати(17)
      0, 1, 2, 3, 4, 5, 6, 7, 8, // Ашвини(18) - Ревати(26) - повторение цикла
    ];
    
    const initialDashaIndex = nakshatraRulers[nakshatraIndex % 27];
    const remainingInNakshatra = (13.333333 - nakshatraDegree) / 13.333333;
    const initialDashaYears = dashaPeriods[initialDashaIndex] * remainingInNakshatra;
    
    // Рассчитываем даты даш от даты рождения
    const dashas: DashaPeriod[] = [];
    let currentDate = new Date(birthData.year, birthData.month - 1, birthData.day);
    let dashaIndex = initialDashaIndex;
    let remainingYears = initialDashaYears;
    
    // Первая даша (текущая)
    const firstPlanet = dashaLords[dashaIndex];
    const firstEndDate = new Date(currentDate);
    firstEndDate.setFullYear(firstEndDate.getFullYear() + remainingYears);
    
    dashas.push({
      planet: firstPlanet,
      startDate: currentDate.toISOString().split('T')[0],
      endDate: firstEndDate.toISOString().split('T')[0],
      duration: `${remainingYears.toFixed(2)} лет`,
    });
    
    // Следующие 8 даш
    currentDate = firstEndDate;
    dashaIndex = (dashaIndex + 1) % 9;
    
    for (let i = 0; i < 8; i++) {
      const planet = dashaLords[dashaIndex];
      const startDate = new Date(currentDate);
      const endDate = new Date(currentDate);
      endDate.setFullYear(endDate.getFullYear() + dashaPeriods[dashaIndex]);
      
      dashas.push({
        planet,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        duration: `${dashaPeriods[dashaIndex]} лет`,
      });
      
      currentDate = endDate;
      dashaIndex = (dashaIndex + 1) % 9;
    }

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
