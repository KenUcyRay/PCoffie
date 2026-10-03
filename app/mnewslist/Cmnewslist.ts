// Controller menu mnewslist (Discovery).
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import type { GridApi } from './GRIDmnewslist';
import { sanitizeNewsHtml } from '../mnewsdata/Cmnewsdata';

export const mcontrol = 'mnewslist';

const FILTER_KEY = 'tiket-app::news-filter';

export type NewsFilter = { status: string; cat: string; ecat: string; q: string; sort: string; page: number };

export const DEFAULT_NEWS_FILTER: NewsFilter = { status: 'TERBIT', cat: '', ecat: '', q: '', sort: 'terbaru', page: 0 };

export function loadFilter(): NewsFilter {
  try {
    const v = window.sessionStorage.getItem(FILTER_KEY);
    if (v) {
      const p = JSON.parse(v);
      if (p && typeof p === 'object') return { ...DEFAULT_NEWS_FILTER, ...p };
    }
  } catch { /* abaikan */ }
  return { ...DEFAULT_NEWS_FILTER };
}

export function saveFilter(f: NewsFilter): void {
  try { window.sessionStorage.setItem(FILTER_KEY, JSON.stringify(f)); } catch { /* abaikan */ }
}

export function formatTanggal(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const NEWS_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  TERJADWAL: 'Terjadwal',
  TERBIT: 'Terbit',
  DIARSIPKAN: 'Diarsipkan',
};

export { sanitizeNewsHtml };

// Pintasan: hak akses ke menu pengelola berita (mnewsdata).
export function useNewsAccess(): { canNews: boolean } {
  const { checkMenuAccess, menus } = useAuth();
  const [canNews, setCanNews] = useState(false);
  useEffect(() => {
    const get = (mc: string) => (menus || []).find((m: any) => String(m.MCONTROL || '').toLowerCase() === mc);
    const nw = get('mnewsdata');
    if (nw) checkMenuAccess(String(nw.MCODE)).then(setCanNews).catch(() => setCanNews(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { canNews };
}

export function init(): void {
  renderpage();
}
export function renderpage(): void {
  try { /* renderer */ } catch { /* abaikan */ }
}
export function btrefresh_click(grid: GridApi | null): void {
  grid?.refresh();
}
export function btnew_click(_grid: GridApi | null): void {
  // tidak ada tombol tambah di Discovery.
}
