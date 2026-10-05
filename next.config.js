/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '/tiket-app',
  trailingSlash: true,
  images: { unoptimized: true },
  async rewrites() {
    return [
      { source: '/tiket-app/appservice/:path*', destination: 'http://127.0.0.1:83/tiket-app/appservice/:path*' },
    ];
  },
};
module.exports = nextConfig;