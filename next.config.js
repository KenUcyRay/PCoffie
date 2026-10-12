/** @type {import('next').NextConfig} */
// basePath kosong = aplikasi di root domain (portal '/', console '/control').
// Next tidak mengizinkan basePath '/' atau '' eksplisit sebagai nilai,
// jadi hanya dipasang kalau env-nya benar-benar berisi prefix.
const basePathEnv = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '');

const nextConfig = {
  ...(basePathEnv ? { basePath: basePathEnv } : {}),
  trailingSlash: true,
  images: { unoptimized: true },
  // CATATAN: TIDAK ada rewrite ke backend.
  // Backend PHP dilayani Apache dan dipanggil dari browser memakai
  // NEXT_PUBLIC_API_BASE (lihat .env.*), jadi tetap satu jalur yang sama
  // baik saat aplikasi diakses lewat Apache maupun langsung ke Node.
  // (Dulu ada rewrite /pcoffie/appservice, tapi Next memotong basePath dari
  //  destination sehingga request mendarat di backend aplikasi lain.)
};

module.exports = nextConfig;
