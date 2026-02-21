/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ['mysql2', 'fluent-ffmpeg', '@ffmpeg-installer/ffmpeg', 'swisseph'],
  },
  reactStrictMode: true,
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

