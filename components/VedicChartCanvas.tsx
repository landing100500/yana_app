'use client';

import React, { useState, useRef } from 'react';
import { useGesture } from '@use-gesture/react';
import styles from './VedicChartCanvas.module.css';

interface VedicChartProps {
  planetsInHouses: string[][]; // 12 домов, planetsInHouses[0] = дом 1
  aspects?: { from: number; to: number }[];
  onHouseClick?: (houseNumber: number) => void;
  selectedHouse?: number | null;
}

const VedicChartCanvas: React.FC<VedicChartProps> = ({ 
  planetsInHouses, 
  aspects = [],
  onHouseClick,
  selectedHouse
}) => {
  // Состояние для трансформации
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Координаты центров домов из эталонного SVG (неповернутая система)
  const houseCenters: Array<{
    houseNum: number;
    x: number;
    y: number;
  }> = [
    { houseNum: 1, x: -50, y: -150 },  // Дом 1
    { houseNum: 2, x: -150, y: -50 },   // Дом 2
    { houseNum: 3, x: -150, y: 50 },    // Дом 3
    { houseNum: 4, x: 50, y: -150 },    // Дом 4
    { houseNum: 5, x: -150, y: 150 },   // Дом 5
    { houseNum: 6, x: -50, y: 150 },    // Дом 6
    { houseNum: 7, x: 50, y: 150 },     // Дом 7
    { houseNum: 8, x: 150, y: 50 },     // Дом 8
    { houseNum: 9, x: 50, y: -50 },     // Дом 9
    { houseNum: 10, x: 150, y: -50 },   // Дом 10
    { houseNum: 11, x: 150, y: -150 },  // Дом 11
    { houseNum: 12, x: 50, y: 50 },     // Дом 12
  ];

  // Координаты центров для аспектов (в исходной системе)
  const centers: Record<number, { x: number; y: number }> = {};
  houseCenters.forEach(({ houseNum, x, y }) => {
    centers[houseNum] = { x, y };
  });

  // Параметры сетки из эталонного SVG (квадрат 400x400)
  const gridSize = 400; // размер квадрата
  const halfSize = gridSize / 2; // 200

  // Обработка drag (pan) и pinch (zoom)
  useGesture(
    {
      onDrag: ({ offset: [x, y], event }) => {
        if (Math.abs(x - transform.x) > 5 || Math.abs(y - transform.y) > 5) {
          event?.preventDefault();
        }
        setTransform(prev => ({ ...prev, x, y }));
      },
      onPinch: ({ offset: [scale] }) => {
        setTransform(prev => ({ ...prev, scale: Math.max(0.5, Math.min(2, scale)) }));
      },
    },
    {
      target: containerRef,
      drag: {
        from: () => [transform.x, transform.y],
        filterTaps: true,
        threshold: 5,
      },
      pinch: {
        scaleBounds: { min: 0.5, max: 2 },
        from: () => [transform.scale, transform.scale],
      },
    }
  );

  // Обработка wheel для zoom
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        setTransform(prev => ({
          ...prev,
          scale: Math.max(0.5, Math.min(2, prev.scale * zoomFactor))
        }));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const handleHouseClick = (houseNumber: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onHouseClick) {
      onHouseClick(houseNumber);
    }
  };

  const handleZoomIn = () => {
    setTransform(prev => ({
      ...prev,
      scale: Math.min(2, prev.scale * 1.2)
    }));
  };

  const handleZoomOut = () => {
    setTransform(prev => ({
      ...prev,
      scale: Math.max(0.5, prev.scale / 1.2)
    }));
  };

  const handleReset = () => {
    setTransform({ x: 0, y: 0, scale: 1 });
  };

  // ViewBox увеличен с большим запасом во всех направлениях
  const viewBox = "-300 -300 600 600";

  return (
    <div className={styles.chartCanvasWrapper}>
      {/* Кнопки управления zoom */}
      <div className={styles.zoomControls}>
        <button onClick={handleZoomIn} className={styles.zoomButton}>+</button>
        <button onClick={handleZoomOut} className={styles.zoomButton}>−</button>
        <button onClick={handleReset} className={styles.zoomButton} title="Сброс">⌂</button>
      </div>

      {/* Контейнер с overflow: hidden */}
      <div 
        ref={containerRef}
        className={styles.chartCanvas}
      >
        {/* Обёртка с фиксированными размерами */}
        <div 
          className={styles.svgWrapper}
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: 'center center',
          }}
        >
          {/* Единый SVG холст */}
          <svg
            ref={svgRef}
            xmlns="http://www.w3.org/2000/svg"
            viewBox={viewBox}
            width="600"
            height="600"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-hidden="true"
            style={{ display: 'block', background: '#1e1e2e' }}
          >
            {/* Группа с поворотом на 45° */}
            <g transform="rotate(45 0 0)">
              {/* Внешний квадрат (граница чакры) */}
              <rect x="-200" y="-200" width="400" height="400" fill="none" stroke="#444" strokeWidth="1" />

              {/* Вертикальные линии: x = -100, 0, 100 */}
              <line x1="-100" y1="-200" x2="-100" y2="200" stroke="#444" strokeWidth="0.8" />
              <line x1="0" y1="-200" x2="0" y2="200" stroke="#444" strokeWidth="0.8" />
              <line x1="100" y1="-200" x2="100" y2="200" stroke="#444" strokeWidth="0.8" />

              {/* Горизонтальные линии: y = -100, 0, 100 */}
              <line x1="-200" y1="-100" x2="200" y2="-100" stroke="#444" strokeWidth="0.8" />
              <line x1="-200" y1="0" x2="200" y2="0" stroke="#444" strokeWidth="0.8" />
              <line x1="-200" y1="100" x2="200" y2="100" stroke="#444" strokeWidth="0.8" />

              {/* Аспекты (рисуем внутри повернутой группы) */}
              <g className={styles.aspectsGroup}>
                {aspects.map((aspect, i) => {
                  const from = centers[aspect.from];
                  const to = centers[aspect.to];
                  if (!from || !to) return null;
                  
                  return (
                    <line
                      key={i}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      className={styles.aspectLine}
                    />
                  );
                })}
              </g>

              {/* Дома с текстом (текст повернут обратно на -45°) */}
              {houseCenters.map(({ houseNum, x, y }) => {
                const planets = planetsInHouses[houseNum - 1] || [];
                const isSelected = selectedHouse === houseNum;

                // Определяем границы квадрата для этого дома
                // Каждый дом занимает область 100x100 в сетке
                const cellSize = 100;
                let rectX: number, rectY: number;
                
                // Вычисляем позицию квадрата на основе координат центра
                if (x === -50 && y === -150) { rectX = -100; rectY = -200; } // Дом 1
                else if (x === -150 && y === -50) { rectX = -200; rectY = -100; } // Дом 2
                else if (x === -150 && y === 50) { rectX = -200; rectY = 0; } // Дом 3
                else if (x === 50 && y === -150) { rectX = 0; rectY = -200; } // Дом 4
                else if (x === -150 && y === 150) { rectX = -200; rectY = 100; } // Дом 5
                else if (x === -50 && y === 150) { rectX = -100; rectY = 100; } // Дом 6
                else if (x === 50 && y === 150) { rectX = 0; rectY = 100; } // Дом 7
                else if (x === 150 && y === 50) { rectX = 100; rectY = 0; } // Дом 8
                else if (x === 50 && y === -50) { rectX = 0; rectY = -100; } // Дом 9
                else if (x === 150 && y === -50) { rectX = 100; rectY = -100; } // Дом 10
                else if (x === 150 && y === -150) { rectX = 100; rectY = -200; } // Дом 11
                else { rectX = 0; rectY = 0; } // Дом 12

                return (
                  <g
                    key={`house-${houseNum}`}
                    onClick={(e) => handleHouseClick(houseNum, e)}
                    className={`${styles.houseGroup} ${isSelected ? styles.houseGroupSelected : ''}`}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Невидимый прямоугольник для hover и клика */}
                    <rect
                      x={rectX}
                      y={rectY}
                      width={cellSize}
                      height={cellSize}
                      fill="transparent"
                      className={styles.houseArea}
                    />
                    
                    {/* Текст с обратным поворотом для горизонтального отображения */}
                    <g transform={`rotate(-45 ${x} ${y})`}>
                      {/* Номер дома */}
                      <text
                        x={x}
                        y={y}
                        className={styles.houseNumber}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {houseNum}
                      </text>

                      {/* Планеты */}
                      {planets.map((planet, pIdx) => {
                        let yOffset: number;
                        if (y < 0) {
                          yOffset = y + 14 + (pIdx * 14);
                        } else {
                          yOffset = y + 14 + (pIdx * 14);
                        }
                        return (
                          <text
                            key={pIdx}
                            x={x}
                            y={yOffset}
                            className={styles.planetText}
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            {planet}
                          </text>
                        );
                      })}
                    </g>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
};

export default VedicChartCanvas;
