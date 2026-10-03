// Pengambilan data di sisi SERVER untuk halaman publik portal.
//
// Halaman publik (beranda, katalog, detail event, berita, promo, merch)
// dirender di server supaya HTML pertama sudah berisi konten. Data tetap
// diambil dari backend yang sama seperti halaman Console - tidak ada logika
// yang diduplikasi.
//
// Only dipanggil dari Server Component (tidak boleh pakai di client).

/** Base URL API absolut untuk sisi server (dev & produksi). */
export function serverApiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE || '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw.replace(/\/+$/, '');
  }
  // Produksi: path relatif. Server Next ada di host yang sama dengan backend,
  // jadi alamat absolutnya=http://127.0.0.1:80 + path.
  return `http://127.0.0.1:80${raw.replace(/\/+$/, '')}`;
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