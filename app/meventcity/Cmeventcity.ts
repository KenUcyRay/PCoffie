// Controller menu meventcity (Discovery). Preferensi di sessionStorage.

export const mcontrol = 'meventcity';

const FILTER_KEY = 'tiket-app::ventcity-filter';

export type VentCityFilter = { cat: string; from: string; to: string; sel: string };

export const DEFAULT_VENTCITY: VentCityFilter = { cat: '', from: '', to: '', sel: '' };

export function loadFilter(): VentCityFilter {
  try {
    const v = window.sessionStorage.getItem(FILTER_KEY);
    if (v) {
      const p = JSON.parse(v);
      if (p && typeof p === 'object') return { ...DEFAULT_VENTCITY, ...p };
    }
  } catch { /* abaikan */ }
  return { ...DEFAULT_VENTCITY };
}

export function saveFilter(f: VentCityFilter): void {
  try { window.sessionStorage.setItem(FILTER_KEY, JSON.stringify(f)); } catch { /* abaikan */ }
}

// Format Rupiah Indonesia, mis. 150000 -> Rp150.000.
export function formatVentRp(value: unknown): string {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return '-';
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}

export function init(): void {
  renderpage();
}
export function renderpage(): void {
  try { /* renderer controller meventcity */ } catch { /* abaikan */ }
}
export function btrefresh_click(_onRefresh?: () => void): void {
  _onRefresh && _onRefresh();
}
export function btnew_click(_onNew?: () => void): void {
  // sengaja kosong
}
