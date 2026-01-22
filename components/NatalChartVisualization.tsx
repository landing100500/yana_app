'use client';

import { useMemo, useState } from 'react';
import styles from './NatalChartVisualization.module.css';

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

const PLANET_NAMES: Record<string, string> = {
  sun: 'Сурья',
  moon: 'Чандра',
  mercury: 'Будха',
  venus: 'Шукра',
  mars: 'Мангала',
  jupiter: 'Гуру',
  saturn: 'Шани',
  uranus: 'Уран',
  neptune: 'Нептун',
  pluto: 'Плутон',
  northNode: 'Раху',
  southNode: 'Кету',
  ascendant: 'Лагна',
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

function angleToRadians(angle: number): number {
  return ((angle - 90) * Math.PI) / 180;
}

type VisualizationType = 'circle' | 'square' | 'list' | 'diamond';

export default function NatalChartVisualization({ chart }: Props) {
  const [visualizationType, setVisualizationType] = useState<VisualizationType>('circle');
  
  const centerX = 400;
  const centerY = 400;
  const radius = 350;
  const innerRadius = 250;
  const houseRadius = 220;

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
      return {
        ...planet,
        ...signData,
        angle: planet.longitude,
        x: centerX + radius * Math.cos(angleToRadians(planet.longitude)),
        y: centerY + radius * Math.sin(angleToRadians(planet.longitude)),
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
        angle: house.longitude,
        x: centerX + houseRadius * Math.cos(angleToRadians(house.longitude)),
        y: centerY + houseRadius * Math.sin(angleToRadians(house.longitude)),
      };
    });
  }, [chart]);

  const ascendantData = useMemo(() => {
    const signData = longitudeToSign(chart.ascendant);
    return {
      ...signData,
      angle: chart.ascendant,
      x: centerX + innerRadius * Math.cos(angleToRadians(chart.ascendant)),
      y: centerY + innerRadius * Math.sin(angleToRadians(chart.ascendant)),
    };
  }, [chart.ascendant]);

  const midheavenData = useMemo(() => {
    const signData = longitudeToSign(chart.midheaven);
    return {
      ...signData,
      angle: chart.midheaven,
      x: centerX + innerRadius * Math.cos(angleToRadians(chart.midheaven)),
      y: centerY + innerRadius * Math.sin(angleToRadians(chart.midheaven)),
    };
  }, [chart.midheaven]);

  // Переключатель вариантов визуализации
  const visualizationOptions = [
    { value: 'circle' as VisualizationType, label: 'Круг' },
    { value: 'square' as VisualizationType, label: 'Квадрат' },
    { value: 'diamond' as VisualizationType, label: 'Ромб' },
    { value: 'list' as VisualizationType, label: 'Список' },
  ];

  return (
    <div className={styles.container}>
      {/* Переключатель вариантов визуализации */}
      <div className={styles.visualizationSwitcher}>
        {visualizationOptions.map((option) => (
          <button
            key={option.value}
            className={`${styles.switchButton} ${
              visualizationType === option.value ? styles.switchButtonActive : ''
            }`}
            onClick={() => setVisualizationType(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Круговая визуализация */}
      {visualizationType === 'circle' && (
        <div className={styles.chartWrapper}>
          <svg width="800" height="800" viewBox="0 0 800 800" className={styles.chart}>
          {/* Внешний круг - знаки зодиака */}
          {SIGN_NAMES.map((sign, index) => {
            const angle = (index * 30) - 90;
            const rad = angleToRadians(index * 30);
            const x = centerX + radius * Math.cos(rad);
            const y = centerY + radius * Math.sin(rad);
            
            return (
              <g key={sign}>
                <line
                  x1={centerX}
                  y1={centerY}
                  x2={x}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.2)"
                  strokeWidth="1"
                />
                <text
                  x={centerX + (radius + 30) * Math.cos(rad)}
                  y={centerY + (radius + 30) * Math.sin(rad)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className={styles.signLabel}
                >
                  {sign}
                </text>
              </g>
            );
          })}

          {/* Дома */}
          {houses.map((house, index) => {
            const nextHouse = houses[(index + 1) % houses.length];
            const startAngle = angleToRadians(house.longitude);
            const endAngle = angleToRadians(nextHouse.longitude);
            
            return (
              <g key={`house-${house.num}`}>
                <line
                  x1={centerX}
                  y1={centerY}
                  x2={house.x}
                  y2={house.y}
                  stroke="rgba(155, 143, 184, 0.4)"
                  strokeWidth="2"
                />
                <text
                  x={house.x}
                  y={house.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className={styles.houseLabel}
                >
                  {house.num}
                </text>
              </g>
            );
          })}

          {/* Асцендент и MC */}
          <line
            x1={centerX}
            y1={centerY}
            x2={ascendantData.x}
            y2={ascendantData.y}
            stroke="#9b8fb8"
            strokeWidth="3"
          />
          <text
            x={ascendantData.x + 20}
            y={ascendantData.y}
            className={styles.ascLabel}
          >
            ASC
          </text>

          <line
            x1={centerX}
            y1={centerY}
            x2={midheavenData.x}
            y2={midheavenData.y}
            stroke="#9b8fb8"
            strokeWidth="3"
          />
          <text
            x={midheavenData.x}
            y={midheavenData.y - 20}
            textAnchor="middle"
            className={styles.mcLabel}
          >
            MC
          </text>

          {/* Планеты */}
          {planets.map((planet) => (
            <g key={planet.name}>
              <circle
                cx={planet.x}
                cy={planet.y}
                r="8"
                fill="#9b8fb8"
                className={styles.planet}
              />
              <text
                x={planet.x}
                y={planet.y - 15}
                textAnchor="middle"
                className={styles.planetLabel}
              >
                {PLANET_NAMES[planet.name] || planet.name}
              </text>
            </g>
          ))}
        </svg>
        </div>
      )}

      {/* Квадратная визуализация (North Indian style) */}
      {visualizationType === 'square' && (
        <div className={styles.squareChartWrapper}>
          <div className={styles.squareChart}>
            {houses.map((house, idx) => {
              const houseNum = house.num;
              
              // Позиционирование домов в квадрате (North Indian style)
              // Дома 1-6 внизу слева направо, 7-12 вверху справа налево
              let top = '0%', left = '0%';
              if (houseNum === 1) { top = '75%'; left = '50%'; }
              else if (houseNum === 2) { top = '75%'; left = '66.66%'; }
              else if (houseNum === 3) { top = '75%'; left = '83.33%'; }
              else if (houseNum === 4) { top = '50%'; left = '100%'; }
              else if (houseNum === 5) { top = '25%'; left = '83.33%'; }
              else if (houseNum === 6) { top = '25%'; left = '66.66%'; }
              else if (houseNum === 7) { top = '25%'; left = '50%'; }
              else if (houseNum === 8) { top = '25%'; left = '33.33%'; }
              else if (houseNum === 9) { top = '25%'; left = '16.66%'; }
              else if (houseNum === 10) { top = '50%'; left = '0%'; }
              else if (houseNum === 11) { top = '75%'; left = '16.66%'; }
              else if (houseNum === 12) { top = '75%'; left = '33.33%'; }

              const planetsInHouse = planets.filter(p => {
                const planetNorm = p.longitude % 360;
                const houseNorm = house.longitude % 360;
                const nextHouseNorm = houses[(idx + 1) % 12].longitude % 360;
                const diff = (planetNorm - houseNorm + 360) % 360;
                const houseSize = (nextHouseNorm - houseNorm + 360) % 360;
                return diff < houseSize;
              });

              return (
                <div
                  key={houseNum}
                  className={styles.squareHouse}
                  style={{ top, left }}
                >
                  <div className={styles.squareHouseNumber}>{houseNum}</div>
                  <div className={styles.squareHouseSign}>{house.signName}</div>
                  <div className={styles.squarePlanets}>
                    {planetsInHouse.map(planet => (
                      <span key={planet.name} className={styles.squarePlanet}>
                        {PLANET_NAMES[planet.name].charAt(0)}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ромбовидная визуализация (South Indian style) */}
      {visualizationType === 'diamond' && (
        <div className={styles.diamondChartWrapper}>
          <div className={styles.diamondChart}>
            {houses.map((house, idx) => {
              const houseNum = idx + 1;
              const angle = (houseNum - 1) * 30 - 90; // Начинаем с верха
              const radius = 200;
              const x = 50 + (radius * Math.cos((angle * Math.PI) / 180)) / 4;
              const y = 50 + (radius * Math.sin((angle * Math.PI) / 180)) / 4;

              const planetsInHouse = planets.filter(p => {
                const planetNorm = p.longitude % 360;
                const houseNorm = house.longitude % 360;
                const nextHouseNorm = houses[(idx + 1) % 12].longitude % 360;
                const diff = (planetNorm - houseNorm + 360) % 360;
                const houseSize = (nextHouseNorm - houseNorm + 360) % 360;
                return diff < houseSize;
              });

              return (
                <div
                  key={houseNum}
                  className={styles.diamondHouse}
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                  }}
                >
                  <div className={styles.diamondHouseNumber}>{houseNum}</div>
                  <div className={styles.diamondHouseSign}>{house.signName}</div>
                  <div className={styles.diamondPlanets}>
                    {planetsInHouse.map(planet => (
                      <span key={planet.name} className={styles.diamondPlanet}>
                        {PLANET_NAMES[planet.name]}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Список/таблица визуализация */}
      {visualizationType === 'list' && (
        <div className={styles.listChartWrapper}>
          <div className={styles.listChart}>
            <h3 className={styles.listTitle}>Натальная карта (Джйотиш)</h3>
            <div className={styles.listHouses}>
              {houses.map((house, idx) => {
                const houseNum = idx + 1;
                const planetsInHouse = planets.filter(p => {
                  const planetNorm = p.longitude % 360;
                  const houseNorm = house.longitude % 360;
                  const nextHouseNorm = houses[(idx + 1) % 12].longitude % 360;
                  const diff = (planetNorm - houseNorm + 360) % 360;
                  const houseSize = (nextHouseNorm - houseNorm + 360) % 360;
                  return diff < houseSize;
                });

                return (
                  <div key={houseNum} className={styles.listHouse}>
                    <div className={styles.listHouseHeader}>
                      <span className={styles.listHouseNumber}>Дом {houseNum}</span>
                      <span className={styles.listHouseSign}>{house.signName}</span>
                    </div>
                    <div className={styles.listPlanets}>
                      {planetsInHouse.length > 0 ? (
                        planetsInHouse.map(planet => {
                          const signData = longitudeToSign(planet.longitude);
                          return (
                            <div key={planet.name} className={styles.listPlanet}>
                              <span className={styles.listPlanetName}>
                                {PLANET_NAMES[planet.name]}
                              </span>
                              <span className={styles.listPlanetPosition}>
                                {signData.signName} {signData.degree.toFixed(1)}°
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <span className={styles.listEmpty}>Нет планет</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Планеты в знаках и Детальная информация - внизу, рядом */}
      <div className={styles.bottomSection}>
        <div className={styles.legend}>
          <h3 className={styles.legendTitle}>Планеты в раши (Джйотиш)</h3>
          <div className={styles.planetsList}>
            {planets.map((planet) => {
              const signData = longitudeToSign(planet.longitude);
              const degrees = Math.floor(planet.longitude);
              const minutesFloat = (planet.longitude - degrees) * 60;
              const minutes = Math.floor(minutesFloat);
              const seconds = Math.round((minutesFloat - minutes) * 60);
              
              // Определяем накшатру
              const nakshatraIndex = Math.floor((planet.longitude % 360) / (360 / 27));
              const nakshatraDegree = (planet.longitude % 360) % (360 / 27);
              const pada = Math.floor(nakshatraDegree / (360 / 27 / 4)) + 1;
              const nakshatraNames = [
                'Ашвини', 'Бхарани', 'Криттика', 'Рохини', 'Мригашира', 'Ардра',
                'Пушья', 'Ашлеша', 'Магха', 'Пурва Пхалгуни', 'Уттара Пхалгуни', 'Хаста',
                'Читра', 'Свати', 'Вишакха', 'Анурадха', 'Джьештха', 'Мула',
                'Пурва Ашадха', 'Уттара Ашадха', 'Шравана', 'Дхаништха', 'Шатабхиша',
                'Пурва Бхадрапада', 'Уттара Бхадрапада', 'Ревати'
              ];
              const nakshatraName = nakshatraNames[nakshatraIndex % 27] || 'Неизвестно';
              
              return (
                <div key={planet.name} className={styles.planetItem}>
                  <div className={styles.planetRow}>
                    <span className={styles.planetName}>{PLANET_NAMES[planet.name]}:</span>
                    <span className={styles.planetSign}>
                      {signData.signName} {signData.degree.toFixed(1)}°
                    </span>
                  </div>
                  <div className={styles.planetDetails}>
                    <span className={styles.planetDegrees}>
                      {degrees}°{String(minutes).padStart(2, '0')}&apos;{String(seconds).padStart(2, '0')}&quot;
                    </span>
                    <span className={styles.planetNakshatra}>
                      {nakshatraName} ({pada > 4 ? 4 : pada})
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Детальная таблица для ведической астрологии */}
        <div className={styles.detailsTable}>
          <h3 className={styles.legendTitle}>Детальная информация (Джйотиш)</h3>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
            <thead>
              <tr>
                <th>Планета</th>
                <th>Градусы</th>
                <th>Раши</th>
                <th>Накшатра</th>
                <th>Пада</th>
                <th>Дом</th>
              </tr>
            </thead>
            <tbody>
              {planets.map((planet) => {
                const signData = longitudeToSign(planet.longitude);
                const degrees = Math.floor(planet.longitude);
                const minutesFloat = (planet.longitude - degrees) * 60;
                const minutes = Math.floor(minutesFloat);
                const seconds = Math.round((minutesFloat - minutes) * 60);
                
                // Определяем накшатру
                const nakshatraIndex = Math.floor((planet.longitude % 360) / (360 / 27));
                const nakshatraDegree = (planet.longitude % 360) % (360 / 27);
                const pada = Math.floor(nakshatraDegree / (360 / 27 / 4)) + 1;
                const nakshatraNames = [
                  'Ашвини', 'Бхарани', 'Криттика', 'Рохини', 'Мригашира', 'Ардра',
                  'Пушья', 'Ашлеша', 'Магха', 'Пурва Пхалгуни', 'Уттара Пхалгуни', 'Хаста',
                  'Читра', 'Свати', 'Вишакха', 'Анурадха', 'Джьештха', 'Мула',
                  'Пурва Ашадха', 'Уттара Ашадха', 'Шравана', 'Дхаништха', 'Шатабхиша',
                  'Пурва Бхадрапада', 'Уттара Бхадрапада', 'Ревати'
                ];
                const nakshatraName = nakshatraNames[nakshatraIndex % 27] || 'Неизвестно';
                
                // Определяем дом (упрощенная версия)
                let houseNum = 1;
                const planetNorm = planet.longitude % 360;
                const ascNorm = chart.ascendant % 360;
                const diff = (planetNorm - ascNorm + 360) % 360;
                houseNum = Math.floor(diff / 30) + 1;
                if (houseNum > 12) houseNum = houseNum - 12;
                if (houseNum < 1) houseNum = 1;
                
                return (
                  <tr key={planet.name}>
                    <td>{PLANET_NAMES[planet.name]}</td>
                    <td>{degrees}°{String(minutes).padStart(2, '0')}&apos;{String(seconds).padStart(2, '0')}&quot;</td>
                    <td>{signData.signName}</td>
                    <td>{nakshatraName}</td>
                    <td>{pada > 4 ? 4 : pada}</td>
                    <td>{houseNum}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          
          {/* Навамша (D9) */}
          {chart.navamsha && (
            <div className={styles.navamshaSection}>
              <h4 className={styles.navamshaTitle}>Навамша (D9)</h4>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Планета</th>
                    <th>Раши</th>
                    <th>Градусы</th>
                  </tr>
                </thead>
                <tbody>
                  {chart.navamsha.sun && (
                    <tr>
                      <td>Сурья</td>
                      <td>{chart.navamsha.sun.signName}</td>
                      <td>{chart.navamsha.sun.degree.toFixed(2)}°</td>
                    </tr>
                  )}
                  {chart.navamsha.moon && (
                    <tr>
                      <td>Чандра</td>
                      <td>{chart.navamsha.moon.signName}</td>
                      <td>{chart.navamsha.moon.degree.toFixed(2)}°</td>
                    </tr>
                  )}
                  {chart.navamsha.mercury && (
                    <tr>
                      <td>Будха</td>
                      <td>{chart.navamsha.mercury.signName}</td>
                      <td>{chart.navamsha.mercury.degree.toFixed(2)}°</td>
                    </tr>
                  )}
                  {chart.navamsha.venus && (
                    <tr>
                      <td>Шукра</td>
                      <td>{chart.navamsha.venus.signName}</td>
                      <td>{chart.navamsha.venus.degree.toFixed(2)}°</td>
                    </tr>
                  )}
                  {chart.navamsha.mars && (
                    <tr>
                      <td>Мангала</td>
                      <td>{chart.navamsha.mars.signName}</td>
                      <td>{chart.navamsha.mars.degree.toFixed(2)}°</td>
                    </tr>
                  )}
                  {chart.navamsha.jupiter && (
                    <tr>
                      <td>Гуру</td>
                      <td>{chart.navamsha.jupiter.signName}</td>
                      <td>{chart.navamsha.jupiter.degree.toFixed(2)}°</td>
                    </tr>
                  )}
                  {chart.navamsha.saturn && (
                    <tr>
                      <td>Шани</td>
                      <td>{chart.navamsha.saturn.signName}</td>
                      <td>{chart.navamsha.saturn.degree.toFixed(2)}°</td>
                    </tr>
                  )}
                  {chart.navamsha.ascendant && (
                    <tr>
                      <td>Лагна</td>
                      <td>{chart.navamsha.ascendant.signName}</td>
                      <td>{chart.navamsha.ascendant.degree.toFixed(2)}°</td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </div>
          )}
          
          {/* Вимшоттари даши */}
          {chart.dashas && chart.dashas.length > 0 && (
            <div className={styles.dashaSection}>
              <h4 className={styles.dashaTitle}>Вимшоттари даши</h4>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
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
      </div>
    </div>
  );
}
