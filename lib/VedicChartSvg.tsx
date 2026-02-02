import React from 'react';

export function VedicChartSvg() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-250 -150 700 1000"
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ background: '#1e1e2e', display: 'block' }}
    >
      {/* Дом 1: (0, 0) */}
      <polygon points="0,-59.5 59.5,0 0,59.5 -59.5,0" fill="#2d2d3d" stroke="#444" strokeWidth="0.8" />
      <text x="0" y="0" textAnchor="middle" dominantBaseline="middle" fill="#e0e0e0" fontSize="12">1</text>
      <text x="0" y="14" textAnchor="middle" dominantBaseline="middle" fill="#a0a0c0" fontSize="10">Li</text>

      {/* Дом 2: (-84.1, 84.1) */}
      <polygon points="-84.1,24.6 -24.6,84.1 -84.1,143.6 -143.6,84.1" fill="#2d2d3d" stroke="#444" strokeWidth="0.8" />
      <text x="-84.1" y="84.1" textAnchor="middle" dominantBaseline="middle" fill="#e0e0e0" fontSize="12">2</text>
      <text x="-84.1" y="98" textAnchor="middle" dominantBaseline="middle" fill="#a0a0c0" fontSize="10">Sc</text>

      {/* Дом 3: (-84.1, 168.2) */}
      <polygon points="-84.1,108.7 -24.6,168.2 -84.1,227.7 -143.6,168.2" fill="#2d2d3d" stroke="#444" strokeWidth="0.8" />
      <text x="-84.1" y="168.2" textAnchor="middle" dominantBaseline="middle" fill="#e0e0e0" fontSize="12">3</text>
      <text x="-84.1" y="182" textAnchor="middle" dominantBaseline="middle" fill="#a0a0c0" fontSize="10">Sg</text>

      {/* Дом 4: (84.1, 84.1) */}
      <polygon points="84.1,24.6 143.6,84.1 84.1,143.6 24.6,84.1" fill="#2d2d3d" stroke="#444" strokeWidth="0.8" />
      <text x="84.1" y="84.1" textAnchor="middle" dominantBaseline="middle" fill="#e0e0e0" fontSize="12">4</text>
      <text x="84.1" y="98" textAnchor="middle" dominantBaseline="middle" fill="#a0a0c0" fontSize="10">Cp</text>

      {/* Дом 5: (-84.1, 252.3) */}
      <polygon points="-84.1,192.8 -24.6,252.3 -84.1,311.8 -143.6,252.3" fill="#2d2d3d" stroke="#444" strokeWidth="0.8" />
      <text x="-84.1" y="252.3" textAnchor="middle" dominantBaseline="middle" fill="#e0e0e0" fontSize="12">5</text>
      <text x="-84.1" y="266" textAnchor="middle" dominantBaseline="middle" fill="#a0a0c0" fontSize="10">Aq</text>

      {/* Дом 6: (0, 252.3) */}
      <polygon points="0,192.8 59.5,252.3 0,311.8 -59.5,252.3" fill="#2d2d3d" stroke="#444" strokeWidth="0.8" />
      <text x="0" y="252.3" textAnchor="middle" dominantBaseline="middle" fill="#e0e0e0" fontSize="12">6</text>
      <text x="0" y="266" textAnchor="middle" dominantBaseline="middle" fill="#a0a0c0" fontSize="10">Pi</text>

      {/* Дом 7: (0, 336.4) */}
      <polygon points="0,276.9 59.5,336.4 0,395.9 -59.5,336.4" fill="#2d2d3d" stroke="#444" strokeWidth="0.8" />
      <text x="0" y="336.4" textAnchor="middle" dominantBaseline="middle" fill="#e0e0e0" fontSize="12">7</text>
      <text x="0" y="350" textAnchor="middle" dominantBaseline="middle" fill="#a0a0c0" fontSize="10">Ar</text>

      {/* Дом 8: (84.1, 168.2) */}
      <polygon points="84.1,108.7 143.6,168.2 84.1,227.7 24.6,168.2" fill="#2d2d3d" stroke="#444" strokeWidth="0.8" />
      <text x="84.1" y="168.2" textAnchor="middle" dominantBaseline="middle" fill="#e0e0e0" fontSize="12">8</text>
      <text x="84.1" y="182" textAnchor="middle" dominantBaseline="middle" fill="#a0a0c0" fontSize="10">Ta</text>

      {/* Дом 9: (0, 420.5) */}
      <polygon points="0,361 59.5,420.5 0,480 -59.5,420.5" fill="#2d2d3d" stroke="#444" strokeWidth="0.8" />
      <text x="0" y="420.5" textAnchor="middle" dominantBaseline="middle" fill="#e0e0e0" fontSize="12">9</text>
      <text x="0" y="434" textAnchor="middle" dominantBaseline="middle" fill="#a0a0c0" fontSize="10">Ge</text>

      {/* Дом 10: (84.1, 252.3) */}
      <polygon points="84.1,192.8 143.6,252.3 84.1,311.8 24.6,252.3" fill="#2d2d3d" stroke="#444" strokeWidth="0.8" />
      <text x="84.1" y="252.3" textAnchor="middle" dominantBaseline="middle" fill="#e0e0e0" fontSize="12">10</text>
      <text x="84.1" y="266" textAnchor="middle" dominantBaseline="middle" fill="#a0a0c0" fontSize="10">Cn</text>

      {/* Дом 11: (84.1, 336.4) */}
      <polygon points="84.1,276.9 143.6,336.4 84.1,395.9 24.6,336.4" fill="#2d2d3d" stroke="#444" strokeWidth="0.8" />
      <text x="84.1" y="336.4" textAnchor="middle" dominantBaseline="middle" fill="#e0e0e0" fontSize="12">11</text>
      <text x="84.1" y="350" textAnchor="middle" dominantBaseline="middle" fill="#a0a0c0" fontSize="10">Le</text>

      {/* Дом 12: (84.1, 0) */}
      <polygon points="84.1,-59.5 143.6,0 84.1,59.5 24.6,0" fill="#2d2d3d" stroke="#444" strokeWidth="0.8" />
      <text x="84.1" y="0" textAnchor="middle" dominantBaseline="middle" fill="#e0e0e0" fontSize="12">12</text>
      <text x="84.1" y="14" textAnchor="middle" dominantBaseline="middle" fill="#a0a0c0" fontSize="10">Vi</text>

      {/* Аспекты */}
      <line x1="0" y1="420.5" x2="-84.1" y2="168.2" stroke="#d32f2f" strokeWidth="1" strokeDasharray="4,2" />
      <line x1="0" y1="420.5" x2="-84.1" y2="252.3" stroke="#d32f2f" strokeWidth="1" strokeDasharray="4,2" />
      <line x1="0" y1="420.5" x2="84.1" y2="252.3" stroke="#d32f2f" strokeWidth="1" strokeDasharray="4,2" />
    </svg>
  );
}
