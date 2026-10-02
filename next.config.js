/** @type {import('next').NextConfig} */
const nextConfig = {
  // Diambil dari env agar rebrand cukup ganti .env (lihat lib/app-config.ts).
  // Next.js memuat .env sebelum mengevaluasi file ini.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '/tiket-app',
  trailingSlash: true,
  images: { unoptimized: true },
};
module.exports = nextConfig;