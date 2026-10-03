// Controller menu mhome (Discovery Home).
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import type { GridApi } from './GRIDmhome';

export const mcontrol = 'mhome';

// Ringkasan angka berlabel untuk kartu statistik.
export const SUMMARY_LABEL: { key: string; label: string; icon: string }[] = [
  { key: 'UPCOMING_EVENTS', label: 'Event mendatang', icon: 'calendarEvent' },
  { key: 'EVENT_TOTAL', label: 'Event tayang', icon: 'calendar' },
  { key: 'TICKETS_SOLD', label: 'Tiket terjual', icon: 'ticket' },
  { key: 'NEWS_PUBLISHED', label: 'Berita terbit', icon: 'mail' },
];

export function formatTanggal(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatRp(value: unknown): string {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '-';
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}

// Pintasan: halaman pengelola yang boleh dibuka user ini.
export interface ManageAccess { canEvent: boolean; canNews: boolean; canPromo: boolean; canCategory: boolean; canCity: boolean }

export function useManageAccess(): ManageAccess {
  const { checkMenuAccess, menus } = useAuth();
  const [acc, setAcc] = useState<ManageAccess>({
    canEvent: false, canNews: false, canPromo: false, canCategory: false, canCity: false,
  });
  useEffect(() => {
    const get = (mc: string) => (menus || []).find((m: any) => String(m.MCONTROL || '').toLowerCase() === mc);
    const targets: [string, keyof ManageAccess][] = [
      ['meventdata', 'canEvent'], ['mnewsdata', 'canNews'], ['mpromocode', 'canPromo'],
      ['cpeventcategory', 'canCategory'], ['cpcity', 'canCity'],
    ];
    targets.forEach(([mc, key]) => {
      const row = get(mc);
      if (row) checkMenuAccess(String(row.MCODE)).then((ok) => setAcc((a) => ({ ...a, [key]: !!ok })))
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return acc;
}

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  try { /* renderer controller mhome */ } catch { /* abaikan */ }
}

export function btrefresh_click(grid: GridApi | null): void {
  grid?.refresh();
}

export function btnew_click(_grid: GridApi | null): void {
  // Home hanya ringkasan; tidak ada tambah data.
}