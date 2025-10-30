/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // クライアント側だけブラウザ版へ差し替え
      config.resolve.alias['mqtt'] = 'mqtt/dist/mqtt.min.js';
    }
    return config;
  },
};

module.exports = nextConfig;
