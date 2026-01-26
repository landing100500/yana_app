/** @type {import('next').NextConfig} */
const nextConfig = {
  // Увеличиваем лимит буферизации тела запроса при использовании прокси (Nginx)
  // По умолчанию 10MB, что вызывает проблемы с большими файлами
  experimental: {
    proxyClientMaxBodySize: '500mb', // До 500MB для больших видео файлов
  },
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['mysql2', 'fluent-ffmpeg', '@ffmpeg-installer/ffmpeg', 'swisseph'],
  },
  // В Next.js 14 нет прямого способа изменить лимит body через config
  // Лимит контролируется через переменные окружения или настройки сервера
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Игнорируем предупреждения о динамических require в sequelize и ffmpeg
            config.ignoreWarnings = [
              { module: /node_modules\/sequelize/ },
              { module: /node_modules\/mysql2/ },
              { module: /node_modules\/fluent-ffmpeg/ },
              { module: /node_modules\/swisseph/ },
            ];
      
      // Внешние пакеты для сервера
      config.externals = config.externals || [];
      config.externals.push({
        'fluent-ffmpeg': 'commonjs fluent-ffmpeg',
        '@ffmpeg-installer/ffmpeg': 'commonjs @ffmpeg-installer/ffmpeg',
        'swisseph': 'commonjs swisseph',
      });
    }
    return config;
  },
}

module.exports = nextConfig

