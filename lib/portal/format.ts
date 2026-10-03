// Format tampilan portal: Rupiah, tanggal Indonesia, dan angka.

/** Rupiah penuh, mis. Rp125.000 */
export function rp(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return `Rp${Math.round(v).toLocaleString('id-ID')}`;
}

/** Rupiah ringkas untuk kartu event, mis. Rp125rb / Rp1,2jt */
export function rpShort(n: number | string | null | undefined): string {
  const v = Math.round(Number(n ?? 0));
  if (v <= 0) return 'Gratis';
  if (v < 1000) return `Rp${v}`;
  if (v < 1_000_000) return `Rp${Math.round(v / 1000)}rb`;
  return `Rp${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1).replace('.', ',')}jt`;
}

function toDate(v: any): Date | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s || s.startsWith('0001-01-01')) return null;
  const d = new Date(s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

const DAY = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MON = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/** 12 Oktober 2026, 19:30 */
export function tanggalJam(v: any): string {
  const d = toDate(v);
  if (!d) return '-';
  const jam = `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
  return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}, ${jam}`;
}

/** Senin, 12 Oktober 2026 */
export function tanggalPanjang(v: any): string {
  const d = toDate(v);
  if (!d) return '-';
  return `${DAY[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}

/** 12 Okt 2026 */
export function tanggalPendek(v: any): string {
  const d = toDate(v);
  if (!d) return '-';
  return `${d.getDate()} ${MON[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

/** Sisa waktu dalam bahasa manusia, mis. "2 jam 5 menit" */
export function sisaWaktu(v: any): string {
  const d = toDate(v);
  if (!d) return '-';
  const ms = d.getTime() - Date.now();
  if (ms <= 0) return 'kedaluwarsa';
  const menit = Math.floor(ms / 60000);
  const jam = Math.floor(menit / 60);
  const s = menit % 60;
  if (jam <= 0) return `${s} menit`;
  if (s === 0) return `${jam} jam`;
  return `${jam} jam ${s} menit`;
}