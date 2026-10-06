import type { GridApi } from './GRIDcp_paket';
export const mcontrol = 'cp_paket';
export function init(): void { renderpage(); }
export function renderpage(): void { try {} catch {} }
export function btrefresh_click(grid: GridApi | null): void { grid?.refresh(); }
export function btnew_click(grid: GridApi | null): void { grid?.create(); }
