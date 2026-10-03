// Controller menu mpromolist (Discovery) — katalog promo hanya baca.
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import type { GridApi } from './GRIDmpromolist';

export const mcontrol = 'mpromolist';

const FILTER_KEY = 'tiket-app::promo-filter';

export type PromoFilter = {
  status: string; q: string; disctype: string; scopetype: string; sort: string; page: number;
};

// Default publik: promo yang bisa dipakai + yang akan datang.
export const DEFAULT_PROMO_FILTER: PromoFilter = {
  status: 'PUBLIK', q: '', disctype: '', scopetype: '', sort: 'terbaru', page: 0,
};

export function loadFilter(): PromoFilter {
  try {
    const v = window.sessionStorage.getItem(FILTER_KEY);
    if (v) {
      const p = JSON.parse(v);
      if (p && typeof p === 'object') return { ...DEFAULT_PROMO_FILTER, ...p };
    }
  } catch { /* abaikan */ }
  return { ...DEFAULT_PROMO_FILTER };
}

export function saveFilter(f: PromoFilter): void {
  try { window.sessionStorage.setItem(FILTER_KEY, JSON.stringify(f)); } catch { /* abaikan */ }
}

export function formatPromoTgl(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Warna badge status turunan (sama seperti halaman pengelolaan promo).
export function promoBadge(status?: string): string {
  switch (String(status || '').toUpperCase()) {
    case 'BERLAKU': return 'ok';
    case 'NONAKTIF': return 'off';
    case 'KUOTA_HABIS': case 'KEDALUWARSA': return 'err';
    default: return '';
  }
}

// Pintasan: hak akses ke menu pengelola promo (mpromocode).
export function usePromoAccess(): { canPromo: boolean } {
  const { checkMenuAccess, menus } = useAuth();
  const [canPromo, setCanPromo] = useState(false);
  useEffect(() => {
    const get = (mc: string) => (menus || []).find((m: any) => String(m.MCONTROL || '').toLowerCase() === mc);
    const pc = get('mpromocode');
    if (pc) checkMenuAccess(String(pc.MCODE)).then(setCanPromo).catch(() => setCanPromo(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { canPromo };
}

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  try { /* renderer controller mpromolist */ } catch { /* abaikan */ }
}

export function btrefresh_click(grid: GridApi | null): void {
  grid?.refresh();
}

// Tidak ada tambah/ubah di katalog baca.
export function btnew_click(_grid: GridApi | null): void {
  // sengaja kosong
}