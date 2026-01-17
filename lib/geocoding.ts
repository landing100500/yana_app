/**
 * Получение координат города для расчета натальной карты
 */
export async function getCityCoordinates(cityName: string): Promise<{ lat: number; lon: number; timezone: number }> {
  try {
    // Нормализуем название города
    const normalizedCity = cityName.trim();
    
    // Попробуем несколько вариантов поиска
    const searchQueries = [
      normalizedCity,
      `${normalizedCity}, Россия`,
      `${normalizedCity}, Russia`,
    ];
    
    // Используем бесплатный API Nominatim (OpenStreetMap)
    for (const query of searchQueries) {
      try {
        const encodedCity = encodeURIComponent(query);
        const url = `https://nominatim.openstreetmap.org/search?q=${encodedCity}&format=json&limit=5&accept-language=ru`;
        
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'YasnaApp/1.0',
          },
        });
        
        if (!response.ok) {
          continue; // Пробуем следующий вариант
        }
        
        const data = await response.json();
        
        if (!data || data.length === 0) {
          continue; // Пробуем следующий вариант
        }
        
        // Ищем наиболее подходящий результат
        let bestMatch = data[0];
        
        // Если есть несколько результатов, выбираем город (не страну, не регион)
        for (const item of data) {
          const type = item.type || '';
          const classType = item.class || '';
          
          // Приоритет: city > town > village > administrative
          if (classType === 'place' && (type === 'city' || type === 'town' || type === 'village')) {
            bestMatch = item;
            break;
          }
        }
        
        const lat = parseFloat(bestMatch.lat);
        const lon = parseFloat(bestMatch.lon);
        
        if (isNaN(lat) || isNaN(lon)) {
          continue; // Пробуем следующий вариант
        }
        
        // Получаем часовой пояс
        const timezone = calculateTimezone(lon);
        
        console.log(`Город найден: ${bestMatch.display_name}, координаты: ${lat}, ${lon}`);
        
        return { lat, lon, timezone };
      } catch (err) {
        console.warn(`Ошибка при поиске "${query}":`, err);
        continue; // Пробуем следующий вариант
      }
    }
    
    // Если ничего не найдено, пробуем исправить возможные опечатки для известных городов
    const cityCorrections: Record<string, string> = {
      'нормльск': 'норильск',
      'нормльск, россия': 'норильск, россия',
      'москва': 'москва, россия',
      'санкт-петербург': 'санкт-петербург, россия',
      'спб': 'санкт-петербург, россия',
    };
    
    const lowerCity = normalizedCity.toLowerCase();
    if (cityCorrections[lowerCity]) {
      console.log(`Исправление опечатки: "${normalizedCity}" -> "${cityCorrections[lowerCity]}"`);
      return getCityCoordinates(cityCorrections[lowerCity]);
    }
    
    throw new Error(`Город "${cityName}" не найден. Проверьте правильность написания названия города.`);
  } catch (error: any) {
    console.error('Geocoding error:', error);
    throw new Error(`Ошибка при получении координат города: ${error.message}`);
  }
}

/**
 * Приблизительный расчет часового пояса по долготе
 * Для России: Москва +3, Екатеринбург +5, Иркутск +8 и т.д.
 */
function calculateTimezone(longitude: number): number {
  // Базовый часовой пояс для России (UTC+3 для Москвы)
  const moscowLon = 37.6173;
  const baseTimezone = 3;
  
  // Каждые 15 градусов долготы = 1 час
  const timezoneOffset = Math.round((longitude - moscowLon) / 15);
  
  return baseTimezone + timezoneOffset;
}
