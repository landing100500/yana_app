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
  sign: number; // 0-11 (Овен, Телец, и т.д.)
  signName: string;
  degree: number; // Градус в знаке (0-29.99)
  degreeMinutes?: number; // Минуты
  degreeSeconds?: number; // Секунды
  speed?: number; // Скорость планеты (для определения ретроградности)
  isRetrograde?: boolean; // Ретроградность
  house?: number; // Дом (1-12)
  dignity?: string; // Достоинство планеты (exaltation, fall, rulership, etc.)
}

export interface NatalChartData {
  julianDay: number;
  siderealTime: number;
  houseSystem: string;
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
    northNode: PlanetPosition;
    southNode: PlanetPosition;
  };
  houses: {
    ascendant: PlanetPosition;
    midheaven: PlanetPosition;
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
}

const SIGN_NAMES = [
  'Овен', 'Телец', 'Близнецы', 'Рак',
  'Лев', 'Дева', 'Весы', 'Скорпион',
  'Стрелец', 'Козерог', 'Водолей', 'Рыбы'
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
    
    // Флаги для расчета
    const flags = swisseph.SEFLG_SWIEPH | swisseph.SEFLG_SPEED;
    
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
          dignity
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
    
    // Рассчитываем дома (Placidus)
    // Пробуем разные системы домов, если Placidus не работает
    let housesResult: any = null;
    let houseSystemUsed = 'P';
    const houseSystems = ['P', 'K', 'E', 'R']; // Placidus, Koch, Equal, Regiomontanus
    
    for (const system of houseSystems) {
      try {
        console.log(`Пробуем систему домов: ${system}`);
        housesResult = swisseph.swe_houses(
          julianDay,
          latitude,
          birthData.longitude,
          system
        );
        
        if (housesResult && !housesResult.error && housesResult.ascmc) {
          houseSystemUsed = system;
          console.log(`Успешно использована система домов: ${system}`);
          break;
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

    return {
      julianDay,
      siderealTime,
      houseSystem: houseSystemUsed,
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
      }
    };
  } catch (error: any) {
    console.error('Natal chart calculation error:', error);
    throw new Error(`Ошибка при расчете натальной карты: ${error.message}`);
  }
}
