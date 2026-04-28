'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './NatalChartVisualization.module.css';
import VedicChartCanvas from './VedicChartCanvas';

interface NavamshaData {
  sun?: { longitude: number; sign: number; signName: string; degree: number };
  moon?: { longitude: number; sign: number; signName: string; degree: number };
  mercury?: { longitude: number; sign: number; signName: string; degree: number };
  venus?: { longitude: number; sign: number; signName: string; degree: number };
  mars?: { longitude: number; sign: number; signName: string; degree: number };
  jupiter?: { longitude: number; sign: number; signName: string; degree: number };
  saturn?: { longitude: number; sign: number; signName: string; degree: number };
  ascendant?: { longitude: number; sign: number; signName: string; degree: number };
}

interface DashaData {
  planet?: string;
  startDate?: string;
  endDate?: string;
  duration?: string;
}

interface ChartData {
  name?: string;
  chartDate?: string;
  chartTime?: string;
  /** Город карты (подпись к поясу для транзитов) */
  chartCity?: string;
  sun: number;
  moon: number;
  mercury: number;
  venus: number;
  mars: number;
  jupiter: number;
  saturn: number;
  uranus: number;
  neptune: number;
  pluto: number;
  northNode: number;
  southNode: number;
  ascendant: number;
  midheaven: number;
  house1: number;
  house2: number;
  house3: number;
  house4: number;
  house5: number;
  house6: number;
  house7: number;
  house8: number;
  house9: number;
  house10: number;
  house11: number;
  house12: number;
  ayanamsa?: number;
  ayanamsaName?: string;
  navamsha?: NavamshaData;
  dashas?: DashaData[];
}

interface TransitApiPlanet {
  key: string;
  label: string;
  signName: string;
  signIndex: number;
  degreeInSign: number;
  isRetrograde: boolean;
  houseFromMoon: number;
  houseFromAscendant: number;
}

interface TransitApiResponse {
  date: string;
  time: string;
  timezone: number;
  city: string;
  julianDay: number;
  transitLocalLabel: string;
  planets: TransitApiPlanet[];
}

interface Props {
  chart: ChartData;
  /** Нужен для расчёта транзитов на выбранную дату */
  chartId?: number;
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

const SIGN_ABBREVIATIONS = [
  'Ar', 'Ta', 'Ge', 'Cn', 'Le', 'Vi', 'Li', 'Sc', 'Sg', 'Cp', 'Aq', 'Pi'
];

// Названия знаков для столбца Раши (зодиак по-русски)
const RASHI_SIGN_NAMES = [
  'Овен', 'Телец', 'Близнецы', 'Рак', 'Лев', 'Дева',
  'Весы', 'Скорпион', 'Стрелец', 'Козерог', 'Водолей', 'Рыбы'
];

const PLANET_ABBREVIATIONS: Record<string, string> = {
  sun: 'Su',
  moon: 'Mo',
  mercury: 'Me',
  venus: 'Ve',
  mars: 'Ma',
  jupiter: 'Ju',
  saturn: 'Sa',
  uranus: 'Ur',
  neptune: 'Ne',
  pluto: 'Pl',
  northNode: 'Ra',
  southNode: 'Ke',
  ascendant: 'As',
  midheaven: 'MC'
};

const PLANET_NAMES: Record<string, string> = {
  sun: 'Солнце',
  moon: 'Луна',
  mercury: 'Меркурий',
  venus: 'Венера',
  mars: 'Марс',
  jupiter: 'Юпитер',
  saturn: 'Сатурн',
  uranus: 'Уран',
  neptune: 'Нептун',
  pluto: 'Плутон',
  northNode: 'Раху',
  southNode: 'Кету',
  ascendant: 'Асцендент',
  midheaven: 'MC'
};

function longitudeToSign(longitude: number): { sign: number; degree: number; signName: string } {
  let normalized = Number(longitude) % 360;
  if (normalized < 0) normalized += 360;
  
  const sign = Math.floor(normalized / 30);
  const degree = normalized % 30;
  
  return {
    sign: sign % 12,
    degree: Math.round(degree * 10) / 10,
    signName: SIGN_NAMES[sign % 12]
  };
}

// Определение накшатры
function longitudeToNakshatra(longitude: number): { nakshatra: number; pada: number; name: string; ruler: string } {
  let normalized = longitude % 360;
  if (normalized < 0) normalized += 360;
  
  const nakshatraIndex = Math.floor(normalized / (360 / 27));
  const degreeInNakshatra = normalized % (360 / 27);
  const pada = Math.floor(degreeInNakshatra / (360 / 27 / 4)) + 1;
  
  // 27 накшатр по порядку: 0=Ашвини … 13=Читра (26°40' Дева–13°20' Весов), 14=Свати …
  const nakshatraNames = [
    'Ашвини', 'Бхарани', 'Криттика', 'Рохини', 'Мригашира', 'Ардра',
    'Пурнавасу', 'Пушья', 'Ашлеша', 'Магха', 'Пурва Пхалгуни', 'Уттара Пхалгуни', 'Хаста',
    'Читра', 'Свати', 'Вишакха', 'Анурадха', 'Джьештха', 'Мула',
    'Пурва Ашадха', 'Уттара Ашадха', 'Шравана', 'Дхаништха', 'Шатабхиша',
    'Пурва Бхадрапада', 'Уттара Бхадрапада', 'Ревати'
  ];
  
  // Управители накшатр: Кету(0), Венера(1), Солнце(2), Луна(3), Марс(4), Раху(5), Юпитер(6), Сатурн(7), Меркурий(8)
  const nakshatraRulers = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, // Ашвини(0) - Анурадха(8)
    0, 1, 2, 3, 4, 5, 6, 7, 8, // Джьештха(9) - Ревати(17)
    0, 1, 2, 3, 4, 5, 6, 7, 8, // Ашвини(18) - Ревати(26)
  ];
  const rulerIndex = nakshatraRulers[nakshatraIndex % 27];
  const rulerNames = ['Ке', 'Ve', 'Su', 'Mo', 'Ma', 'Ra', 'Ju', 'Sa', 'Me'];
  const ruler = rulerNames[rulerIndex];
  
  return {
    nakshatra: nakshatraIndex % 27,
    pada: pada > 4 ? 4 : pada,
    name: nakshatraNames[nakshatraIndex % 27],
    ruler
  };
}

// Расчет карак для планет
function calculateKarakas(planets: Array<{ name: string; longitude: number }>): Record<string, string> {
  // Только 7 планет для карак: Солнце, Луна, Марс, Меркурий, Юпитер, Венера, Сатурн
  const planetsForKaraka = planets.filter(p => 
    ['sun', 'moon', 'mars', 'mercury', 'jupiter', 'venus', 'saturn'].includes(p.name)
  );
  
  // Сортируем по долготе (от наибольшей к наименьшей)
  const sorted = [...planetsForKaraka].sort((a, b) => {
    const aNorm = a.longitude % 360;
    const bNorm = b.longitude % 360;
    return bNorm - aNorm;
  });
  
  const karakaNames = ['AK', 'АмК', 'БК', 'MK', 'ПК', 'ΓΚ', 'ДК'];
  const karakaMap: Record<string, string> = {};
  sorted.forEach((planet, index) => {
    karakaMap[planet.name] = karakaNames[index];
  });
  
  return karakaMap;
}

// Форматирование градусов (полная долгота 0–360°)
function formatDegrees(longitude: number): string {
  const degrees = Math.floor(longitude);
  const minutesFloat = (longitude - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.round((minutesFloat - minutes) * 60);
  return `${degrees}°${String(minutes).padStart(2, '0')}'${String(seconds).padStart(2, '0')}"`;
}

// Градусы в знаке (0–30°) — как на vedic-horo в колонке «Градусы»
function formatDegreesInSign(longitude: number): string {
  const degreeInSign = longitude % 30;
  const degrees = Math.floor(degreeInSign);
  const minutesFloat = (degreeInSign - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.round((minutesFloat - minutes) * 60);
  return `${degrees}°${String(minutes).padStart(2, '0')}'${String(seconds).padStart(2, '0')}"`;
}

// Форматирование градусов для отображения в карте
function formatDegreesShort(longitude: number): string {
  const signData = longitudeToSign(longitude);
  return `${Math.floor(signData.degree)}°`;
}

// Определение дома для планеты
function getPlanetHouse(planetLongitude: number, houses: number[], ascendant: number): number {
  let planetNorm = planetLongitude % 360;
  if (planetNorm < 0) planetNorm += 360;
  
  let ascNorm = ascendant % 360;
  if (ascNorm < 0) ascNorm += 360;
  
  // Находим разницу между планетой и асцендентом
  let diff = (planetNorm - ascNorm + 360) % 360;
  
  // Определяем дом (каждый дом = 30 градусов)
  let houseNum = Math.floor(diff / 30) + 1;
  if (houseNum > 12) houseNum = houseNum - 12;
  if (houseNum < 1) houseNum = 1;
  
  return houseNum;
}

type TabType = 'general' | 'transits' | 'other' | 'yogas' | 'bala' | 'bhava-chalita' | 'periods' | 'tajaka' | 'rectification';

function todayLocalYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function NatalChartVisualization({ chart, chartId }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [selectedHouse, setSelectedHouse] = useState<number | null>(null);
  const [selectedChartType, setSelectedChartType] = useState<'D1' | 'D9'>('D1');
  const [transitDate, setTransitDate] = useState(todayLocalYMD);
  const [transitTime, setTransitTime] = useState('12:00');
  const [transitLoading, setTransitLoading] = useState(false);
  const [transitError, setTransitError] = useState<string | null>(null);
  const [transitPayload, setTransitPayload] = useState<TransitApiResponse | null>(null);

  const fetchTransits = useCallback(
    async (d: string, t: string) => {
      if (!chartId) return;
      setTransitLoading(true);
      setTransitError(null);
      try {
        const res = await fetch('/api/natal-chart/transits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ chartId, date: d, time: t }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Не удалось рассчитать транзиты');
        setTransitPayload(data as TransitApiResponse);
      } catch (e: unknown) {
        setTransitPayload(null);
        setTransitError(e instanceof Error ? e.message : 'Ошибка расчёта');
      } finally {
        setTransitLoading(false);
      }
    },
    [chartId]
  );

  useEffect(() => {
    if (activeTab === 'transits' && chartId) {
      void fetchTransits(transitDate, transitTime);
    }
  }, [activeTab, chartId, transitDate, transitTime, fetchTransits]);

  const planets = useMemo(() => {
    const planetList = [
      { name: 'sun', longitude: chart.sun },
      { name: 'moon', longitude: chart.moon },
      { name: 'mercury', longitude: chart.mercury },
      { name: 'venus', longitude: chart.venus },
      { name: 'mars', longitude: chart.mars },
      { name: 'jupiter', longitude: chart.jupiter },
      { name: 'saturn', longitude: chart.saturn },
      { name: 'uranus', longitude: chart.uranus },
      { name: 'neptune', longitude: chart.neptune },
      { name: 'pluto', longitude: chart.pluto },
      { name: 'northNode', longitude: chart.northNode },
      { name: 'southNode', longitude: chart.southNode },
    ];
    
    // Рассчитываем караки
    const karakas = calculateKarakas(planetList);
    
    return planetList.map(planet => {
      const signData = longitudeToSign(planet.longitude);
      const nakshatraData = longitudeToNakshatra(planet.longitude);
      const houses = [
        chart.house1, chart.house2, chart.house3, chart.house4,
        chart.house5, chart.house6, chart.house7, chart.house8,
        chart.house9, chart.house10, chart.house11, chart.house12
      ];
      const house = getPlanetHouse(planet.longitude, houses, chart.ascendant);
      
      return {
        ...planet,
        ...signData,
        nakshatraName: nakshatraData.name,
        nakshatraPada: nakshatraData.pada,
        nakshatraRuler: nakshatraData.ruler,
        karaka: karakas[planet.name] || '',
        house,
        formattedDegrees: formatDegrees(planet.longitude),
        formattedDegreesInSign: formatDegreesInSign(planet.longitude),
        formattedDegreesShort: formatDegreesShort(planet.longitude)
      };
    });
  }, [chart]);

  const houses = useMemo(() => {
    return [
      { num: 1, longitude: chart.house1 },
      { num: 2, longitude: chart.house2 },
      { num: 3, longitude: chart.house3 },
      { num: 4, longitude: chart.house4 },
      { num: 5, longitude: chart.house5 },
      { num: 6, longitude: chart.house6 },
      { num: 7, longitude: chart.house7 },
      { num: 8, longitude: chart.house8 },
      { num: 9, longitude: chart.house9 },
      { num: 10, longitude: chart.house10 },
      { num: 11, longitude: chart.house11 },
      { num: 12, longitude: chart.house12 },
    ].map(house => {
      const signData = longitudeToSign(house.longitude);
      return {
        ...house,
        ...signData,
        signAbbr: SIGN_ABBREVIATIONS[signData.sign]
      };
    });
  }, [chart]);

  // Получаем планеты в каждом доме для D1
  const getPlanetsInHouse = (houseNum: number) => {
    return planets.filter(p => p.house === houseNum);
  };

  // Получаем планеты в каждом доме для D9 (Навамша)
  const getNavamshaPlanetsInHouse = (houseNum: number) => {
    if (!chart.navamsha) return [];
    
    const navamshaPlanets: Array<{ name: string; signName: string; longitude: number; degree: number }> = [];
    
    if (chart.navamsha.sun) {
      const signData = longitudeToSign(chart.navamsha.sun.longitude);
      navamshaPlanets.push({ name: 'Su', signName: chart.navamsha.sun.signName, longitude: chart.navamsha.sun.longitude, degree: signData.degree });
    }
    if (chart.navamsha.moon) {
      const signData = longitudeToSign(chart.navamsha.moon.longitude);
      navamshaPlanets.push({ name: 'Mo', signName: chart.navamsha.moon.signName, longitude: chart.navamsha.moon.longitude, degree: signData.degree });
    }
    if (chart.navamsha.mercury) {
      const signData = longitudeToSign(chart.navamsha.mercury.longitude);
      navamshaPlanets.push({ name: 'Me', signName: chart.navamsha.mercury.signName, longitude: chart.navamsha.mercury.longitude, degree: signData.degree });
    }
    if (chart.navamsha.venus) {
      const signData = longitudeToSign(chart.navamsha.venus.longitude);
      navamshaPlanets.push({ name: 'Ve', signName: chart.navamsha.venus.signName, longitude: chart.navamsha.venus.longitude, degree: signData.degree });
    }
    if (chart.navamsha.mars) {
      const signData = longitudeToSign(chart.navamsha.mars.longitude);
      navamshaPlanets.push({ name: 'Ma', signName: chart.navamsha.mars.signName, longitude: chart.navamsha.mars.longitude, degree: signData.degree });
    }
    if (chart.navamsha.jupiter) {
      const signData = longitudeToSign(chart.navamsha.jupiter.longitude);
      navamshaPlanets.push({ name: 'Ju', signName: chart.navamsha.jupiter.signName, longitude: chart.navamsha.jupiter.longitude, degree: signData.degree });
    }
    if (chart.navamsha.saturn) {
      const signData = longitudeToSign(chart.navamsha.saturn.longitude);
      navamshaPlanets.push({ name: 'Sa', signName: chart.navamsha.saturn.signName, longitude: chart.navamsha.saturn.longitude, degree: signData.degree });
    }
    if (chart.navamsha.ascendant) {
      const signData = longitudeToSign(chart.navamsha.ascendant.longitude);
      navamshaPlanets.push({ name: 'As', signName: chart.navamsha.ascendant.signName, longitude: chart.navamsha.ascendant.longitude, degree: signData.degree });
    }
    
    // Определяем дом для каждой планеты в навамше
    const navamshaAscendant = chart.navamsha.ascendant?.longitude || 0;
    return navamshaPlanets.filter(planet => {
      const planetHouse = getPlanetHouse(planet.longitude, houses.map(h => h.longitude), navamshaAscendant);
      return planetHouse === houseNum;
    });
  };

  // Преобразование данных для VedicChart
  const getPlanetsInHousesForVedicChart = (chartType: 'D1' | 'D9'): string[][] => {
    const result: string[][] = [[], [], [], [], [], [], [], [], [], [], [], []];
    
    for (let houseNum = 1; houseNum <= 12; houseNum++) {
      const planetsInHouse = chartType === 'D9'
        ? getNavamshaPlanetsInHouse(houseNum)
        : getPlanetsInHouse(houseNum);
      
      // Добавляем знак зодиака в начало списка планет
      const house = houses.find(h => h.num === houseNum);
      if (house && chartType === 'D1') {
        result[houseNum - 1].push(house.signAbbr);
      }
      
      // Добавляем планеты
      planetsInHouse.forEach(planet => {
        if (chartType === 'D9') {
          result[houseNum - 1].push(planet.name);
        } else {
          const planetAbbr = PLANET_ABBREVIATIONS[planet.name] || planet.name;
          const degree = 'formattedDegreesShort' in planet
            ? planet.formattedDegreesShort
            : formatDegreesShort(planet.longitude);
          result[houseNum - 1].push(`${planetAbbr} ${degree}`);
        }
      });
    }
    
    return result;
  };

  // Расчет аспектов (упрощенная версия - можно расширить)
  const calculateAspects = (chartType: 'D1' | 'D9'): { from: number; to: number }[] => {
    const aspects: { from: number; to: number }[] = [];
    
    // Находим дом Марса
    const marsPlanet = planets.find(p => p.name === 'mars');
    if (!marsPlanet) return aspects;
    
    const marsHouse = marsPlanet.house;
    
    // В ведической астрологии Марс аспектирует 3-й, 5-й и 10-й дома от себя
    // (7-й, 5-й и 4-й дома считая от себя)
    const aspectHouses = [
      (marsHouse + 2) % 12 || 12, // 3-й дом (7-й от Марса)
      (marsHouse + 4) % 12 || 12, // 5-й дом (5-й от Марса)
      (marsHouse + 7) % 12 || 12  // 10-й дом (4-й от Марса)
    ];
    
    aspectHouses.forEach(toHouse => {
      if (toHouse !== marsHouse) {
        aspects.push({ from: marsHouse, to: toHouse });
      }
    });
    
    return aspects;
  };

  // Рендер ведической карты (North Indian style - квадратная сетка)
  const renderVedicChart = (chartType: 'D1' | 'D9', title: string) => {
    const planetsInHouses = getPlanetsInHousesForVedicChart(chartType);
    const aspects = calculateAspects(chartType);
    
    const handleHouseClick = (houseNumber: number) => {
      if (selectedHouse === houseNumber && selectedChartType === chartType) {
        setSelectedHouse(null);
      } else {
        setSelectedHouse(houseNumber);
        setSelectedChartType(chartType);
      }
    };

              return (
      <div className={styles.vedicChartWrapper}>
        <div className={styles.chartTitle}>{title}</div>
        <VedicChartCanvas
          planetsInHouses={planetsInHouses}
          aspects={aspects}
          onHouseClick={handleHouseClick}
          selectedHouse={selectedHouse && selectedChartType === chartType ? selectedHouse : null}
        />
                </div>
              );
  };

  const tabs = [
    { id: 'general' as TabType, label: 'Общее' },
    { id: 'transits' as TabType, label: 'Транзиты' },
  ];

  // Получаем информацию о выбранном доме
  const getHouseInfo = () => {
    if (!selectedHouse) return null;
    
    // Для D1 карты используем обычные дома
    const house = houses.find(h => h.num === selectedHouse);
    if (!house) return null;
    
    // Всегда используем D1 данные для отображения в плашке (так как D9 убрали)
    const planetsInHouse = getPlanetsInHouse(selectedHouse);
    
    return {
      houseNum: selectedHouse,
      sign: house.signName,
      signAbbr: house.signAbbr,
      cusp: formatDegrees(house.longitude),
      planets: planetsInHouse.map(p => ({
        name: PLANET_NAMES[p.name] || p.name,
        abbreviation: PLANET_ABBREVIATIONS[p.name],
        degree: p.formattedDegreesShort,
        fullDegree: p.formattedDegrees
      }))
    };
  };

  const houseInfo = getHouseInfo();

              return (
    <div className={styles.container}>
      {/* Карта D1 и информация о доме */}
      <div className={styles.chartsRow}>
        {renderVedicChart('D1', 'D1 Раши')}
        
        {/* Информация о выбранном доме */}
        {houseInfo ? (
          <div className={styles.houseInfoPanel}>
            <div className={styles.houseInfoTitle}>
              Дом {houseInfo.houseNum} - {houseInfo.sign} ({houseInfo.signAbbr})
                  </div>
            <div className={styles.houseInfoContent}>
              <div className={styles.houseInfoRow}>
                <span className={styles.houseInfoLabel}>Куспид:</span>
                <span className={styles.houseInfoValue}>{houseInfo.cusp}</span>
                </div>
              {houseInfo.planets.length > 0 ? (
                <div className={styles.houseInfoPlanets}>
                  <div className={styles.houseInfoLabel}>Планеты в доме:</div>
                  {houseInfo.planets.map((planet, idx) => (
                    <div key={idx} className={styles.houseInfoPlanet}>
                      <span className={styles.planetName}>{planet.name}</span>
                      <span className={styles.planetAbbrInfo}>({planet.abbreviation})</span>
                      <span className={styles.planetDegreeInfo}>{planet.fullDegree}</span>
                    </div>
                  ))}
                            </div>
                      ) : (
                <div className={styles.houseInfoEmpty}>В доме нет планет</div>
                      )}
                    </div>
                  </div>
        ) : (
          <div className={styles.houseInfoPanel}>
            <div className={styles.houseInfoTitle}>Выберите дом на карте</div>
            <div className={styles.houseInfoContent}>
              <div className={styles.houseInfoEmpty}>Кликните на любой дом для просмотра информации</div>
          </div>
        </div>
      )}
        
        {/* Вимшоттари даша справа */}
          {chart.dashas && chart.dashas.length > 0 && (
          <div className={styles.dashaPanel}>
            <div className={styles.dashaTitle}>Вимшоттари даша</div>
            <div className={styles.dashaTable}>
              <table>
                <thead>
                  <tr>
                    <th>Планета</th>
                    <th>Начало</th>
                    <th>Конец</th>
                    <th>Длительность</th>
                  </tr>
                </thead>
                <tbody>
                  {chart.dashas.slice(0, 9).map((dasha, idx) => (
                    <tr key={idx}>
                      <td>{dasha.planet}</td>
                      <td>{dasha.startDate}</td>
                      <td>{dasha.endDate}</td>
                      <td>{dasha.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>

      {/* Вкладки */}
      <div className={styles.tabsContainer}>
        <div className={styles.tabs}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Содержимое вкладок */}
      <div className={styles.tabContent}>
        {activeTab === 'general' && (
          <div className={styles.generalTab}>
            <div className={styles.tableWrapper}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Планеты</th>
                    <th>Карака</th>
                    <th>Градусы</th>
                    <th>Раши</th>
                    <th>Навамша</th>
                    <th>Накшатра (Пада, Упр)</th>
                    <th>Дом</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{PLANET_NAMES.ascendant}</td>
                    <td>-</td>
                    <td>{formatDegreesInSign(chart.ascendant)}</td>
                    <td>{RASHI_SIGN_NAMES[longitudeToSign(chart.ascendant).sign]}</td>
                    <td>{chart.navamsha?.ascendant?.signName || '-'}</td>
                    <td>{longitudeToNakshatra(chart.ascendant).name} ({longitudeToNakshatra(chart.ascendant).pada}, {longitudeToNakshatra(chart.ascendant).ruler})</td>
                    <td>1</td>
                  </tr>
                  {planets.map((planet) => (
                    <tr key={planet.name}>
                      <td>{PLANET_NAMES[planet.name] || planet.name}</td>
                      <td>{planet.karaka || '-'}</td>
                      <td>{planet.formattedDegreesInSign ?? planet.formattedDegrees}</td>
                      <td>{RASHI_SIGN_NAMES[planet.sign]}</td>
                      <td>
                        {chart.navamsha && chart.navamsha[planet.name as keyof NavamshaData] 
                          ? (chart.navamsha[planet.name as keyof NavamshaData] as any)?.signName 
                          : '-'}
                      </td>
                      <td>{planet.nakshatraName} ({planet.nakshatraPada}, {planet.nakshatraRuler})</td>
                      <td>{planet.house}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'transits' && (
          <div className={styles.transitsTab}>
            <p className={styles.transitsIntro}>
              Позиции планет в сидерическом зодиаке (как в натале). Дома — целознаковые (whole sign) от{' '}
              <strong>знака натальной Луны</strong> (в приоритете по смыслу) и от <strong>знака асцендента</strong>.
              Время и пояс — как у карты ({chart.chartCity || 'город карты'}).
            </p>
            {!chartId ? (
              <p className={styles.transitsWarning}>Нет ID карты — откройте раздел «Карта» из личного кабинета.</p>
            ) : (
              <>
                <div className={styles.transitControls}>
                  <label className={styles.transitLabel}>
                    Дата
                    <input
                      type="date"
                      className={styles.transitInput}
                      value={transitDate}
                      onChange={(e) => setTransitDate(e.target.value)}
                    />
                  </label>
                  <label className={styles.transitLabel}>
                    Время (местное)
                    <input
                      type="time"
                      className={styles.transitInput}
                      value={transitTime}
                      onChange={(e) => setTransitTime(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className={styles.transitRecalc}
                    onClick={() => void fetchTransits(transitDate, transitTime)}
                    disabled={transitLoading}
                  >
                    {transitLoading ? 'Считаем…' : 'Пересчитать'}
                  </button>
                </div>
                {transitError && <div className={styles.transitError}>{transitError}</div>}
                {transitPayload && !transitLoading && (
                  <p className={styles.transitMeta}>
                    {transitPayload.transitLocalLabel} · JD {transitPayload.julianDay.toFixed(5)}
                  </p>
                )}
                {transitLoading && <p className={styles.transitLoading}>Расчёт эфемерид…</p>}
                {transitPayload && (
                  <div className={styles.tableWrapper}>
                    <table className={styles.dataTable}>
                      <thead>
                        <tr>
                          <th>Планета</th>
                          <th>Знак</th>
                          <th>° в знаке</th>
                          <th>Дом от Луны</th>
                          <th>Дом от асцендента</th>
                          <th>Ретро</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transitPayload.planets.map((p) => (
                          <tr key={p.key}>
                            <td>{p.label}</td>
                            <td>{RASHI_SIGN_NAMES[p.signIndex] ?? p.signName}</td>
                            <td>
                              {`${Math.floor(p.degreeInSign)}°${String(
                                Math.floor((p.degreeInSign % 1) * 60)
                              ).padStart(2, '0')}'`}
                            </td>
                            <td>{p.houseFromMoon}</td>
                            <td>{p.houseFromAscendant}</td>
                            <td>{p.isRetrograde ? 'R' : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className={styles.transitsFootnote}>
                  Любая дата: Swiss Ephemeris (сидерик и аянамша как в расчёте натала). Медленные планеты — без
                  привязки к 2026; при необходимости сверяйте переходы по знакам с календарём.
                </p>
              </>
            )}
          </div>
        )}

        {activeTab === 'other' && (
          <div className={styles.otherTab}>
            <p>Разное - в разработке</p>
          </div>
        )}

        {activeTab === 'yogas' && (
          <div className={styles.yogasTab}>
            <p>Йоги - в разработке</p>
          </div>
        )}

        {activeTab === 'bala' && (
          <div className={styles.balaTab}>
            <p>Бала - в разработке</p>
          </div>
        )}

        {activeTab === 'bhava-chalita' && (
          <div className={styles.bhavaChalitaTab}>
            <p>Бхава Чалита - в разработке</p>
          </div>
        )}

        {activeTab === 'periods' && (
          <div className={styles.periodsTab}>
            <p>Периоды - в разработке</p>
          </div>
        )}

        {activeTab === 'tajaka' && (
          <div className={styles.tajakaTab}>
            <p>Таджака-йоги - в разработке</p>
          </div>
        )}

        {activeTab === 'rectification' && (
          <div className={styles.rectificationTab}>
            <p>Ректификация - в разработке</p>
          </div>
        )}
      </div>
    </div>
  );
}
