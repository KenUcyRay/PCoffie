// Controller menu meventcategory (Discovery). Preferensi disimpan di sessionStorage.
import { useEventAccess } from '../meventlist/Cmeventlist';

export const mcontrol = 'meventcategory';

const FILTER_KEY = 'tiket-app::ventcat-filter';

export type VentCatFilter = { city: string; from: string; to: string; sel: string };

export const DEFAULT_VENTCAT: VentCatFilter = { city: '', from: '', to: '', sel: '' };

export function loadFilter(): VentCatFilter {
  try {
    const v = window.sessionStorage.getItem(FILTER_KEY);
    if (v) {
      const p = JSON.parse(v);
      if (p && typeof p === 'object') return { ...DEFAULT_VENTCAT, ...p };
    }
  } catch { /* abaikan */ }
  return { ...DEFAULT_VENTCAT };
}

export function saveFilter(f: VentCatFilter): void {
  try { window.sessionStorage.setItem(FILTER_KEY, JSON.stringify(f)); } catch { /* abaikan */ }
}

// Format Rupiah Indonesia, mis. 150000 -> Rp150.000.
export function formatVentRp(value: unknown): string {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '-';
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}

export { useEventAccess as useCategoryEventAccess };

export function init(): void {
  renderpage();
}
export function renderpage(): void {
  try { /* renderer controller meventcategory */ } catch { /* abaikan */ }
}
export function btrefresh_click(_onRefresh?: () => void): void {
  _onRefresh && _onRefresh();
}
export function btnew_click(_onNew?: () => void): void {
  // sengaja kosong
}
