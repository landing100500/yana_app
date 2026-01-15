/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['mysql2', 'fluent-ffmpeg', '@ffmpeg-installer/ffmpeg'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Игнорируем предупреждения о динамических require в sequelize и ffmpeg
      config.ignoreWarnings = [
        { module: /node_modules\/sequelize/ },
        { module: /node_modules\/mysql2/ },
        { module: /node_modules\/fluent-ffmpeg/ },
      ];
      
      // Внешние пакеты для сервера
      config.externals = config.externals || [];
      config.externals.push({
        'fluent-ffmpeg': 'commonjs fluent-ffmpeg',
        '@ffmpeg-installer/ffmpeg': 'commonjs @ffmpeg-installer/ffmpeg',
      });
    }
    return config;
  },
}

module.exports = nextConfig

