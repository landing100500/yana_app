import { getCityCoordinates } from '@/lib/geocoding';
import { getHistoricalTimezoneOffset } from '@/lib/historical-timezone';
import { calculateNatalChart, BirthData, NatalChartData } from '@/lib/natal-chart-calculator';

export interface RecalculatedChartFields {
  chartTime: string;
  chartCity: string;
  chartLatitude: number;
  chartLongitude: number;
  timezone: number;
  julianDay: number;
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
  houseSystem: string;
  siderealTime: number;
  calculatedAt: Date;
  chartData: NatalChartData;
}

export function parseChartDate(chartDate: string): { year: number; month: number; day: number } | null {
  const parts = chartDate.split('-');
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return { year, month, day };
}

export function parseChartTime(chartTime: string): { hour: number; minute: number; second: number } | null {
  const parts = chartTime.split(':');
  if (parts.length < 2) return null;
  const hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);
  const second = parts.length > 2 ? parseInt(parts[2], 10) : 0;
  if (isNaN(hour) || isNaN(minute) || isNaN(second)) return null;
  return { hour, minute, second };
}

export function formatChartTime(hour: number, minute: number, second = 0): string {
  const base = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return second > 0 ? `${base}:${String(second).padStart(2, '0')}` : base;
}

export async function recalculateChartFromBirthInput(params: {
  chartDate: string;
  chartTime: string;
  chartCity: string;
}): Promise<RecalculatedChartFields> {
  const dateParts = parseChartDate(params.chartDate);
  if (!dateParts) {
    throw new Error('Неверный формат даты карты.');
  }

  const timeParts = parseChartTime(params.chartTime);
  if (!timeParts) {
    throw new Error('Неверный формат времени. Ожидается HH:MM.');
  }

  const city = params.chartCity.trim();
  if (!city) {
    throw new Error('Город не может быть пустым.');
  }

  const { year, month, day } = dateParts;
  const { hour, minute } = timeParts;

  let lat: number;
  let lon: number;
  let timezone: number;
  try {
    const coords = await getCityCoordinates(city);
    lat = coords.lat;
    lon = coords.lon;
    const historicalOffset = getHistoricalTimezoneOffset(lat, lon, year, month, day, hour, minute);
    timezone = historicalOffset ?? coords.timezone;
  } catch (geocodingError: any) {
    throw new Error(geocodingError.message || 'Не удалось найти координаты города.');
  }

  const birthData: BirthData = {
    year,
    month,
    day,
    hour,
    minute,
    latitude: lat,
    longitude: lon,
    timezone,
  };

  const chartData = await calculateNatalChart(birthData);
  const chartTime = formatChartTime(hour, minute, timeParts.second);

  return {
    chartTime,
    chartCity: city,
    chartLatitude: lat,
    chartLongitude: lon,
    timezone,
    julianDay: chartData.julianDay,
    sun: chartData.planets.sun.longitude,
    moon: chartData.planets.moon.longitude,
    mercury: chartData.planets.mercury.longitude,
    venus: chartData.planets.venus.longitude,
    mars: chartData.planets.mars.longitude,
    jupiter: chartData.planets.jupiter.longitude,
    saturn: chartData.planets.saturn.longitude,
    uranus: chartData.planets.uranus.longitude,
    neptune: chartData.planets.neptune.longitude,
    pluto: chartData.planets.pluto.longitude,
    northNode: chartData.planets.northNode.longitude,
    southNode: chartData.planets.southNode.longitude,
    ascendant: chartData.houses.ascendant.longitude,
    midheaven: chartData.houses.midheaven.longitude,
    house1: chartData.houses.house1.longitude,
    house2: chartData.houses.house2.longitude,
    house3: chartData.houses.house3.longitude,
    house4: chartData.houses.house4.longitude,
    house5: chartData.houses.house5.longitude,
    house6: chartData.houses.house6.longitude,
    house7: chartData.houses.house7.longitude,
    house8: chartData.houses.house8.longitude,
    house9: chartData.houses.house9.longitude,
    house10: chartData.houses.house10.longitude,
    house11: chartData.houses.house11.longitude,
    house12: chartData.houses.house12.longitude,
    houseSystem: chartData.houseSystem,
    siderealTime: chartData.siderealTime,
    calculatedAt: new Date(),
    chartData,
  };
}
