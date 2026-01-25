/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['mysql2', 'fluent-ffmpeg', '@ffmpeg-installer/ffmpeg', 'swisseph'],
  },
  // Увеличиваем лимит размера body для API routes (по умолчанию 1MB)
  // В Next.js 14 это настраивается через runtime config
  serverRuntimeConfig: {
    // Максимальный размер body для API routes (500MB)
    bodyParser: {
      sizeLimit: '500mb',
    },
  },
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

