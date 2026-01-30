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

  // ТОЧНЫЕ координаты из эталонного SVG - НЕ МЕНЯТЬ!
  // s = 119px, d = s * √2 / 2 ≈ 84.1px
  const houseData: Array<{
    houseNum: number;
    centerX: number;
    centerY: number;
    polygonPoints: string;
  }> = [
    {
      houseNum: 1,
      centerX: 0,
      centerY: 0,
      polygonPoints: "0,-59.5 59.5,0 0,59.5 -59.5,0"
    },
    {
      houseNum: 2,
      centerX: -84.1,
      centerY: 84.1,
      polygonPoints: "-84.1,24.6 -24.6,84.1 -84.1,143.6 -143.6,84.1"
    },
    {
      houseNum: 3,
      centerX: -84.1,
      centerY: 168.2,
      polygonPoints: "-84.1,108.7 -24.6,168.2 -84.1,227.7 -143.6,168.2"
    },
    {
      houseNum: 4,
      centerX: 84.1,
      centerY: 84.1,
      polygonPoints: "84.1,24.6 143.6,84.1 84.1,143.6 24.6,84.1"
    },
    {
      houseNum: 5,
      centerX: -84.1,
      centerY: 252.3,
      polygonPoints: "-84.1,192.8 -24.6,252.3 -84.1,311.8 -143.6,252.3"
    },
    {
      houseNum: 6,
      centerX: 0,
      centerY: 252.3,
      polygonPoints: "0,192.8 59.5,252.3 0,311.8 -59.5,252.3"
    },
    {
      houseNum: 7,
      centerX: 0,
      centerY: 336.4,
      polygonPoints: "0,276.9 59.5,336.4 0,395.9 -59.5,336.4"
    },
    {
      houseNum: 8,
      centerX: 84.1,
      centerY: 168.2,
      polygonPoints: "84.1,108.7 143.6,168.2 84.1,227.7 24.6,168.2"
    },
    {
      houseNum: 9,
      centerX: 0,
      centerY: 420.5,
      polygonPoints: "0,361 59.5,420.5 0,480 -59.5,420.5"
    },
    {
      houseNum: 10,
      centerX: 84.1,
      centerY: 252.3,
      polygonPoints: "84.1,192.8 143.6,252.3 84.1,311.8 24.6,252.3"
    },
    {
      houseNum: 11,
      centerX: 84.1,
      centerY: 336.4,
      polygonPoints: "84.1,276.9 143.6,336.4 84.1,395.9 24.6,336.4"
    },
    {
      houseNum: 12,
      centerX: 84.1,
      centerY: 0,
      polygonPoints: "84.1,-59.5 143.6,0 84.1,59.5 24.6,0"
    },
  ];

  // Координаты центров для аспектов
  const centers: Record<number, { x: number; y: number }> = {};
  houseData.forEach(({ houseNum, centerX, centerY }) => {
    centers[houseNum] = { x: centerX, y: centerY };
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
        from: () => [transform.scale],
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

  // ТОЧНЫЙ viewBox из эталонного SVG
  const viewBox = "-250 -150 700 1000";

  return (
    <div className={styles.chartCanvasWrapper}>
      {/* Кнопки управления zoom */}
      <div className={styles.zoomControls}>
        <button onClick={handleZoomIn} className={styles.zoomButton}>+</button>
        <button onClick={handleZoomOut} className={styles.zoomButton}>−</button>
        <button onClick={handleReset} className={styles.zoomButton} title="Сброс">⌂</button>
      </div>

      {/* Контейнер с overflow: hidden - БЕЗ transform, filter, clip-path */}
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
          {/* Единый SVG холст - ТОЧНАЯ геометрия из эталона */}
          <svg
            ref={svgRef}
            xmlns="http://www.w3.org/2000/svg"
            viewBox={viewBox}
            width="600"
            height="900"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-hidden="true"
            style={{ display: 'block', background: '#1e1e2e' }}
          >
          {/* Аспекты (рисуем первыми, чтобы были под ромбами) */}
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

          {/* Ромбы (дома) - ТОЧНАЯ геометрия из эталонного SVG */}
          {houseData.map(({ houseNum, centerX, centerY, polygonPoints }) => {
            const planets = planetsInHouses[houseNum - 1] || [];
            const isSelected = selectedHouse === houseNum;

            return (
              <g
                key={`house-${houseNum}`}
                onClick={(e) => handleHouseClick(houseNum, e)}
                className={styles.houseGroup}
                style={{ cursor: 'pointer' }}
              >
                {/* Ромб - ТОЧНЫЕ координаты из эталона */}
                <polygon
                  points={polygonPoints}
                  className={`${styles.rhombus} ${isSelected ? styles.rhombusSelected : ''}`}
                />
                
                {/* Номер дома - ТОЧНАЯ позиция из эталона */}
                <text
                  x={centerX}
                  y={centerY}
                  className={styles.houseNumber}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {houseNum}
                </text>

                {/* Планеты - динамические данные, позиция как в эталоне */}
                {planets.map((planet, pIdx) => {
                  // В эталоне первая планета на centerY + 14, следующие с шагом 14
                  const yOffset = centerY + 14 + (pIdx * 14);
                  
                  return (
                    <text
                      key={pIdx}
                      x={centerX}
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
            );
          })}
          </svg>
        </div>
      </div>
    </div>
  );
};

export default VedicChartCanvas;
