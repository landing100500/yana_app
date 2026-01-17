'use client';

import { useMemo } from 'react';
import styles from './NatalChartVisualization.module.css';

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
}

interface Props {
  chart: ChartData;
}

const SIGN_NAMES = [
  'Овен', 'Телец', 'Близнецы', 'Рак',
  'Лев', 'Дева', 'Весы', 'Скорпион',
  'Стрелец', 'Козерог', 'Водолей', 'Рыбы'
];

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
  northNode: 'Северный узел',
  southNode: 'Южный узел',
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

function angleToRadians(angle: number): number {
  return ((angle - 90) * Math.PI) / 180;
}

export default function NatalChartVisualization({ chart }: Props) {
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

  return (
    <div className={styles.container}>
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

      {/* Планеты в знаках и Детальная информация - внизу, рядом */}
      <div className={styles.bottomSection}>
        <div className={styles.legend}>
          <h3 className={styles.legendTitle}>Планеты в знаках</h3>
          <div className={styles.planetsList}>
            {planets.map((planet) => {
              const signData = longitudeToSign(planet.longitude);
              const degrees = Math.floor(planet.longitude);
              const minutesFloat = (planet.longitude - degrees) * 60;
              const minutes = Math.floor(minutesFloat);
              const seconds = Math.round((minutesFloat - minutes) * 60);
              
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
                      {degrees}°{String(minutes).padStart(2, '0')}'{String(seconds).padStart(2, '0')}"
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Детальная таблица */}
        <div className={styles.detailsTable}>
          <h3 className={styles.legendTitle}>Детальная информация</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Планета</th>
                <th>Градусы</th>
                <th>Знак</th>
                <th>Дом</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {planets.map((planet) => {
                const signData = longitudeToSign(planet.longitude);
                const degrees = Math.floor(planet.longitude);
                const minutesFloat = (planet.longitude - degrees) * 60;
                const minutes = Math.floor(minutesFloat);
                const seconds = Math.round((minutesFloat - minutes) * 60);
                
                // Определяем дом (упрощенная версия - нужно использовать реальные куспиды домов)
                // Пока используем приблизительный расчет
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
                    <td>{degrees}°{String(minutes).padStart(2, '0')}'{String(seconds).padStart(2, '0')}"</td>
                    <td>{signData.signName}</td>
                    <td>{houseNum}</td>
                    <td>
                      {signData.degree < 1 ? 'В начале знака' : 
                       signData.degree > 29 ? 'В конце знака' : 'В знаке'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
