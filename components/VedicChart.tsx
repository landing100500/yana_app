'use client';

import React from 'react';
import styles from './VedicChart.module.css';

interface VedicChartProps {
  planetsInHouses: string[][]; // planetsInHouses[0] = house 1, ..., [11] = house 12
  aspects?: { from: number; to: number }[]; // house numbers 1–12
  onHouseClick?: (houseNumber: number) => void;
  selectedHouse?: number | null;
}

const VedicChart: React.FC<VedicChartProps> = ({ 
  planetsInHouses, 
  aspects = [],
  onHouseClick,
  selectedHouse
}) => {
  // Координаты центров ромбов (в px), дом 1 → индекс 0
  // Расположение в крестообразной сетке 4×3 (North Indian style):
  // Дом 1 - вверху по центру (~240,120)
  // Дом 7 - внизу по центру (~360,480) - напротив 1
  // Дом 4 - справа от 1 (~360,240)
  // Дом 10 - слева от 7 (~240,540) - напротив 4, между 6 и 7
  const positions = [
    { x: 240, y: 120 }, // 1 - вверху по центру
    { x: 120, y: 240 }, // 2 - слева вверху
    { x: 120, y: 360 }, // 3 - слева по центру
    { x: 360, y: 240 }, // 4 - справа от 1
    { x: 120, y: 480 }, // 5 - слева внизу
    { x: 240, y: 600 }, // 6 - слева внизу по центру
    { x: 360, y: 480 }, // 7 - внизу по центру (напротив 1)
    { x: 480, y: 360 }, // 8 - справа по центру
    { x: 240, y: 720 }, // 9 - внизу слева (ниже 6)
    { x: 240, y: 540 }, // 10 - слева от 7, между 6 и 7 (напротив 4)
    { x: 480, y: 480 }, // 11 - справа внизу
    { x: 360, y: 120 }, // 12 - справа вверху
  ];

  const handleHouseClick = (houseNumber: number) => {
    if (onHouseClick) {
      onHouseClick(houseNumber);
    }
  };

  return (
    <div className={styles.vedicChartContainer}>
      {/* Ромбы */}
      {positions.map((pos, i) => {
        const houseNumber = i + 1;
        const planets = planetsInHouses[i] || [];
        const isSelected = selectedHouse === houseNumber;
        
        return (
          <div
            key={houseNumber}
            className={`${styles.vedicRhombus} ${isSelected ? styles.vedicRhombusSelected : ''}`}
            style={{
              left: `${pos.x - 60}px`,
              top: `${pos.y - 60}px`,
            }}
            onClick={() => handleHouseClick(houseNumber)}
          >
            <div className={styles.rhombusContent}>
              <div className={styles.houseNumber}>{houseNumber}</div>
              <div className={styles.planetsList}>
                {planets.map((planet, pIdx) => {
                  // Первый элемент может быть знаком зодиака
                  const isSign = pIdx === 0 && planet.length <= 3 && /^[A-Z][a-z]?$/.test(planet);
                  return (
                    <div 
                      key={pIdx} 
                      className={`${styles.planetLabel} ${isSign ? styles.signLabel : ''}`}
                    >
                      {planet}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {/* Аспекты (SVG поверх) */}
      <svg
        className={styles.aspectsSvg}
        viewBox="0 0 800 840"
        preserveAspectRatio="none"
      >
        {aspects.map((aspect, idx) => {
          const fromPos = positions[aspect.from - 1];
          const toPos = positions[aspect.to - 1];
          if (!fromPos || !toPos) return null;
          return (
            <line
              key={idx}
              x1={fromPos.x}
              y1={fromPos.y}
              x2={toPos.x}
              y2={toPos.y}
              className={styles.aspectLine}
            />
          );
        })}
      </svg>
    </div>
  );
};

export default VedicChart;
