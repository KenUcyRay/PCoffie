/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '/pcoffie',
  trailingSlash: true,
  images: { unoptimized: true },
  async rewrites() {
    return [
      { source: '/pcoffie/appservice/:path*', destination: 'http://127.0.0.1:83/pcoffie/appservice/:path*' },
    ];
  },
};
module.exports = nextConfig;
