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
  // Состояние для трансформации - начальный масштаб увеличен в 2 раза
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 2 });
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Правильная структура из map-test.svg
  // Сетка 4x4, размер квадрата 800x800, внешняя рамка 50,50 700x700
  // Линии делят на: x=225, 400, 575 и y=225, 400, 575
  // Центры ромбов в неповернутой системе (до rotate(45)):
  // Структура:
  //    6    5
  //  8  7  4  3
  //  9 10  1  2
  //   11 12
  const gridSize = 800; // размер квадрата из map-test.svg
  const borderOffset = 50; // отступ внешней рамки
  const innerSize = 700; // размер внутреннего квадрата
  const cellSize = innerSize / 4; // размер ячейки сетки (175)
  
  // Правильная структура из map-test.svg
  // В неповернутой системе координаты центров (относительно центра 0,0):
  // После поворота на 45° получаем правильную структуру:
  //    6    5
  //  8  7  4  3
  //  9 10  1  2
  //   11 12
  // Дом 1 внизу по центру, дом 7 вверху по центру
  const finalHouseCenters: Array<{
    houseNum: number;
    x: number;
    y: number;
  }> = [
    { houseNum: 1, x: 87.5, y: 87.5 },      // внизу по центру после поворота
    { houseNum: 2, x: 262.5, y: 87.5 },     // справа от 1
    { houseNum: 3, x: 262.5, y: -87.5 },    // справа вверху
    { houseNum: 4, x: 87.5, y: -87.5 },     // вверху справа
    { houseNum: 5, x: 87.5, y: -262.5 },    // вверху
    { houseNum: 6, x: -87.5, y: -262.5 },  // вверху слева
    { houseNum: 7, x: -87.5, y: -87.5 },   // вверху по центру
    { houseNum: 8, x: -262.5, y: -87.5 },  // вверху слева
    { houseNum: 9, x: -262.5, y: 87.5 },   // слева
    { houseNum: 10, x: -87.5, y: 87.5 },   // слева по центру
    { houseNum: 11, x: -87.5, y: 262.5 },  // внизу слева
    { houseNum: 12, x: 87.5, y: 262.5 },   // внизу справа
  ];
  
  // Координаты центров для аспектов (в исходной системе)
  const centers: Record<number, { x: number; y: number }> = {};
  finalHouseCenters.forEach(({ houseNum, x, y }) => {
    centers[houseNum] = { x, y };
  });

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
        setTransform(prev => ({ ...prev, scale: Math.max(0.5, Math.min(6, scale)) }));
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
          scale: Math.max(0.5, Math.min(6, prev.scale * zoomFactor))
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
      scale: Math.min(6, prev.scale * 1.2)
    }));
  };

  const handleZoomOut = () => {
    setTransform(prev => ({
      ...prev,
      scale: Math.max(0.5, prev.scale / 1.2)
    }));
  };

  const handleReset = () => {
    setTransform({ x: 0, y: 0, scale: 2 });
  };

  // ViewBox с запасом для всех домов (центр в 0,0)
  const viewBox = "-350 -350 700 700";
  
  // Функция для вычисления вершин ромба
  // Размер ромба примерно 175x175 (размер ячейки сетки)
  const rhombusSize = cellSize * 0.8; // немного меньше ячейки
  const getRhombusPoints = (cx: number, cy: number, size: number = rhombusSize): string => {
    const halfSize = size / 2;
    return `${cx},${cy - halfSize} ${cx + halfSize},${cy} ${cx},${cy + halfSize} ${cx - halfSize},${cy}`;
  };

  // Парсинг планет из строк для отображения
  const parsePlanetInfo = (planetStr: string) => {
    // Формат может быть: "Su 27°", "Ra 12°R", "As 19°", "AL", "UL", "A7 A11"
    const isRetrograde = planetStr.includes('R') || planetStr.includes('R');
    const isRed = planetStr.includes('As') || planetStr === 'AL' || planetStr === 'UL' || /^AL\b/.test(planetStr) || /^UL\b/.test(planetStr);
    const isAValue = /^A\d+/.test(planetStr) || /\bA\d+\b/.test(planetStr);
    return { text: planetStr, isRetrograde, isRed, isAValue };
  };

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
            {/* Группа с поворотом на 45° для всей карты (как в map-test.svg) */}
            <g transform="rotate(45 0 0)">
              {/* Внешний квадрат (граница чакры) - соответствует 700x700 из map-test.svg */}
              <rect 
                x={-innerSize/2} 
                y={-innerSize/2} 
                width={innerSize} 
                height={innerSize} 
                fill="none" 
                stroke="#444" 
                strokeWidth="2" 
              />

              {/* Вертикальные линии: делят на 4 части */}
              <line 
                x1={-innerSize/2 + cellSize} 
                y1={-innerSize/2} 
                x2={-innerSize/2 + cellSize} 
                y2={innerSize/2} 
                stroke="#444" 
                strokeWidth="1.5" 
              />
              <line 
                x1={0} 
                y1={-innerSize/2} 
                x2={0} 
                y2={innerSize/2} 
                stroke="#444" 
                strokeWidth="1.5" 
              />
              <line 
                x1={innerSize/2 - cellSize} 
                y1={-innerSize/2} 
                x2={innerSize/2 - cellSize} 
                y2={innerSize/2} 
                stroke="#444" 
                strokeWidth="1.5" 
              />

              {/* Горизонтальные линии: делят на 4 части */}
              <line 
                x1={-innerSize/2} 
                y1={-innerSize/2 + cellSize} 
                x2={innerSize/2} 
                y2={-innerSize/2 + cellSize} 
                stroke="#444" 
                strokeWidth="1.5" 
              />
              <line 
                x1={-innerSize/2} 
                y1={0} 
                x2={innerSize/2} 
                y2={0} 
                stroke="#444" 
                strokeWidth="1.5" 
              />
              <line 
                x1={-innerSize/2} 
                y1={innerSize/2 - cellSize} 
                x2={innerSize/2} 
                y2={innerSize/2 - cellSize} 
                stroke="#444" 
                strokeWidth="1.5" 
              />

              {/* Аспекты */}
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

              {/* Дома - ромбы через polygon */}
              {finalHouseCenters.map(({ houseNum, x, y }) => {
                const planets = planetsInHouses[houseNum - 1] || [];
                const isSelected = selectedHouse === houseNum;
                const rhombusPoints = getRhombusPoints(x, y, rhombusSize);

                return (
                  <g
                    key={`house-${houseNum}`}
                    onClick={(e) => handleHouseClick(houseNum, e)}
                    className={`${styles.houseGroup} ${isSelected ? styles.houseGroupSelected : ''}`}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Ромб дома - кликабельная область */}
                    <polygon
                      points={rhombusPoints}
                      fill="transparent"
                      stroke={isSelected ? "#fff" : "transparent"}
                      strokeWidth={isSelected ? 2 : 0}
                      className={styles.houseArea}
                      style={{ pointerEvents: 'all' }}
                    />
                    
                    {/* Номер дома в углу ромба (до поворота текста) */}
                    <text
                      x={x - rhombusSize/2 + 6}
                      y={y - rhombusSize/2 + 10}
                      className={styles.houseNumber}
                      textAnchor="start"
                      dominantBaseline="hanging"
                      fill="#4a9eff"
                      fontSize="11"
                      fontWeight="500"
                      style={{ pointerEvents: 'none' }}
                    >
                      {houseNum}
                    </text>
                    
                    {/* Текст с обратным поворотом для горизонтального отображения */}
                    <g transform={`rotate(-45 ${x} ${y})`}>
                      {/* Контент в центре ромба */}
                      <g transform={`translate(${x}, ${y})`}>
                        {/* D1 селектор для дома 1 */}
                        {houseNum === 1 && (
                          <g>
                            <rect
                              x={-25}
                              y={-rhombusSize/2 + 5}
                              width={50}
                              height={18}
                              fill="#4a9eff"
                              fillOpacity={0.2}
                              stroke="#4a9eff"
                              strokeWidth={1}
                              rx={3}
                              style={{ pointerEvents: 'none' }}
                            />
                            <text
                              x={0}
                              y={-rhombusSize/2 + 15}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fill="#4a9eff"
                              fontSize="10"
                              fontWeight="600"
                              style={{ pointerEvents: 'none' }}
                            >
                              D1
                            </text>
                            {/* Стрелки вверх/вниз */}
                            <text
                              x={18}
                              y={-rhombusSize/2 + 15}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fill="#4a9eff"
                              fontSize="8"
                              style={{ pointerEvents: 'none' }}
                            >
                              ▲▼
                            </text>
                          </g>
                        )}

                        {/* Планеты и другие элементы */}
                        {planets.map((planet, pIdx) => {
                          const planetInfo = parsePlanetInfo(planet);
                          const yOffset = -rhombusSize/2 + 30 + (pIdx * 16);
                          
                          return (
                            <text
                              key={pIdx}
                              x={0}
                              y={yOffset}
                              className={styles.planetText}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fill={planetInfo.isRed ? "#ff4444" : "#a0a0c0"}
                              fontSize={planetInfo.isAValue ? "9" : "10"}
                              fontWeight={planetInfo.isRed ? "600" : "400"}
                              style={{ pointerEvents: 'none' }}
                            >
                              {planetInfo.text}
                            </text>
                          );
                        })}
                      </g>
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
