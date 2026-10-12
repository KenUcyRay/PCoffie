// Pengambilan data di sisi SERVER untuk halaman publik portal.
//
// Halaman publik (beranda, reservasi, akun)
// dirender di server supaya HTML pertama sudah berisi konten. Data tetap
// diambil dari backend yang sama seperti halaman Console - tidak ada logika
// yang diduplikasi.
//
// Only dipanggil dari Server Component (tidak boleh pakai di client).

  /** Base URL API absolut untuk sisi server (dev & produksi).
   *
   *  PENTANG: port Apache PCoffie di server produksi adalah 82 (bukan 80/83).
   *  Dulu port ini ditulis hardcoded dan selalu mengarah ke 80, sehingga SSR diam-diam
   *  mengambil data dari backend aplikasi lain yang kebetulan listen di 80.
   *  Karena itu port sekarang diambil dari env:
   *    1. SERVER_API_BASE            (penuh, paling eksplisit — dipakai produksi)
   *    2. NEXT_PUBLIC_API_BASE       (kalau sudah absolut, mis. di mode dev)
   *    3. SERVER_API_PORT + path relatif (fallback)
   */
  export function serverApiBase(): string {
    const absolute = (process.env.SERVER_API_BASE || '').trim();
    if (absolute.startsWith('http://') || absolute.startsWith('https://')) {
      return absolute.replace(/\/+$/, '');
    }

    const raw = process.env.NEXT_PUBLIC_API_BASE || '';
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return raw.replace(/\/+$/, '');
    }

    const port = process.env.SERVER_API_PORT || '80';
    return `http://127.0.0.1:${port}${raw.replace(/\/+$/, '')}`;
  }

export async function serverPortal<T = any>(
  path: string,
  body: Record<string, unknown> = {},
): Promise<T | null> {
  try {
    const res = await fetch(`${serverApiBase()}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json: any = await res.json().catch(() => null);
    if (!json) return null;
    const ok = json.success === true || String(json.success).toLowerCase() === 'true';
    return ok ? (json as T) : null;
  } catch {
    // Jaringan/down: halaman publik tetap harus tampil (fallback ke mode klien).
    return null;
  }
}