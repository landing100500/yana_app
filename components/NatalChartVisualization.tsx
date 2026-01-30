'use client';

import { useMemo, useState } from 'react';
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

interface Props {
  chart: ChartData;
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
function longitudeToNakshatra(longitude: number): { nakshatra: number; pada: number; name: string } {
  let normalized = longitude % 360;
  if (normalized < 0) normalized += 360;
  
  const nakshatraIndex = Math.floor(normalized / (360 / 27));
  const degreeInNakshatra = normalized % (360 / 27);
  const pada = Math.floor(degreeInNakshatra / (360 / 27 / 4)) + 1;
  
  const nakshatraNames = [
    'Ашвини', 'Бхарани', 'Криттика', 'Рохини', 'Мригашира', 'Ардра',
    'Пушья', 'Ашлеша', 'Магха', 'Пурва Пхалгуни', 'Уттара Пхалгуни', 'Хаста',
    'Читра', 'Свати', 'Вишакха', 'Анурадха', 'Джьештха', 'Мула',
    'Пурва Ашадха', 'Уттара Ашадха', 'Шравана', 'Дхаништха', 'Шатабхиша',
    'Пурва Бхадрапада', 'Уттара Бхадрапада', 'Ревати'
  ];
  
  return {
    nakshatra: nakshatraIndex % 27,
    pada: pada > 4 ? 4 : pada,
    name: nakshatraNames[nakshatraIndex % 27]
  };
}

// Форматирование градусов
function formatDegrees(longitude: number): string {
  const degrees = Math.floor(longitude);
  const minutesFloat = (longitude - degrees) * 60;
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

type TabType = 'general' | 'other' | 'yogas' | 'bala' | 'bhava-chalita' | 'periods' | 'tajaka' | 'rectification';

export default function NatalChartVisualization({ chart }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [selectedHouse, setSelectedHouse] = useState<number | null>(null);
  const [selectedChartType, setSelectedChartType] = useState<'D1' | 'D9'>('D1');

  const planets = useMemo(() => {
    return [
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
    ].map(planet => {
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
        house,
        formattedDegrees: formatDegrees(planet.longitude),
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
          const degree = planet.formattedDegreesShort;
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
    { id: 'other' as TabType, label: 'Разное' },
    { id: 'yogas' as TabType, label: 'Йоги' },
    { id: 'bala' as TabType, label: 'Бала' },
    { id: 'bhava-chalita' as TabType, label: 'Бхава Чалита' },
    { id: 'periods' as TabType, label: 'Периоды' },
    { id: 'tajaka' as TabType, label: 'Таджака-йоги' },
    { id: 'rectification' as TabType, label: 'Ректификация' },
  ];

  // Получаем информацию о выбранном доме
  const getHouseInfo = () => {
    if (!selectedHouse) return null;
    
    const house = houses.find(h => h.num === selectedHouse);
    if (!house) return null;
    
    const planetsInHouse = selectedChartType === 'D9'
      ? getNavamshaPlanetsInHouse(selectedHouse)
      : getPlanetsInHouse(selectedHouse);
    
    return {
      houseNum: selectedHouse,
      sign: house.signName,
      signAbbr: house.signAbbr,
      cusp: formatDegrees(house.longitude),
      planets: planetsInHouse.map(p => ({
        name: selectedChartType === 'D9' ? p.name : PLANET_NAMES[p.name] || p.name,
        abbreviation: selectedChartType === 'D9' ? p.name : PLANET_ABBREVIATIONS[p.name],
        degree: selectedChartType === 'D9' ? `${Math.floor(p.degree)}°` : p.formattedDegreesShort,
        fullDegree: selectedChartType === 'D9' ? formatDegrees(p.longitude) : p.formattedDegrees
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
            <table className={styles.dataTable}>
              <thead>
                <tr>
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
                  <td>Асцендент</td>
                  <td>{formatDegrees(chart.ascendant)}</td>
                  <td>{longitudeToSign(chart.ascendant).signName}</td>
                  <td>{chart.navamsha?.ascendant?.signName || '-'}</td>
                  <td>{longitudeToNakshatra(chart.ascendant).name} ({longitudeToNakshatra(chart.ascendant).pada})</td>
                  <td>1</td>
                </tr>
                {planets.map((planet) => (
                  <tr key={planet.name}>
                    <td>{PLANET_NAMES[planet.name]}</td>
                    <td>{planet.formattedDegrees}</td>
                    <td>{planet.signName}</td>
                    <td>
                      {chart.navamsha && chart.navamsha[planet.name as keyof NavamshaData] 
                        ? (chart.navamsha[planet.name as keyof NavamshaData] as any)?.signName 
                        : '-'}
                    </td>
                    <td>{planet.nakshatraName} ({planet.nakshatraPada})</td>
                    <td>{planet.house}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
