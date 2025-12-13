/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['mysql2'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Игнорируем предупреждения о динамических require в sequelize
      config.ignoreWarnings = [
        { module: /node_modules\/sequelize/ },
        { module: /node_modules\/mysql2/ },
      ];
    }
    return config;
  },
}

module.exports = nextConfig

