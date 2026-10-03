// Controller menu mattendee — padanan Cmattendee.js langit_v2.
// State/API milik GRIDmattendee. Tanpa state/async di sini.
import type { GridApi } from './GRIDmattendee';

export const mcontrol = 'mattendee';

// Format datetime ke lokal Indonesia lengkap dengan detik, mis. 03 Okt 2026, 14.05.22.
export function formatTanggal(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// Unduh CSV dari base64 (hasil read_export).
export function downloadCSV(csvBase64: string, filename: string) {
  const bin = atob(csvBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Contoh file CSV import (dibuat di browser, tanpa backend).
export function downloadSampleCSV() {
  const head = 'nama_tipe,nama,email,telepon,status_bayar';
  const rows = [
    'Regular,Nama Contoh,contoh@contoh.test,0812000000,LUNAS',
    'VIP,Nama Contoh 2,contoh2@contoh.test,0812000001,BELUM_BAYAR',
  ];
  const csv = `\uFEFF${head}\n${rows.join('\n')}\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'contoh_import_peserta.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// Pecah teks CSV menjadi baris objek (header fleksibel, dukung tanda kutip).
export function parseImportCSV(text: string): { TYPENAME: string; NAME: string; EMAIL: string; PHONE: string; PAYSTATUS: string }[] {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let cur = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"') {
        if (clean[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(cur); cur = '';
    } else if (c === '\n') {
      row.push(cur); rows.push(row); row = []; cur = '';
    } else if (c === '\r') {
      // abaikan (ditangani \n)
    } else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, ''));
  const idx = (names: string[]): number => {
    for (const n of names) {
      const i = head.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iType = idx(['nama_tipe', 'namatipe', 'tipe', 'type']);
  const iName = idx(['nama', 'name']);
  const iEmail = idx(['email']);
  const iPhone = idx(['telepon', 'telp', 'phone', 'hp', 'no_hp']);
  const iPay = idx(['status_bayar', 'statusbayar', 'bayar', 'paystatus']);
  const cell = (r: string[], i: number): string => (i >= 0 && i < r.length ? r[i].trim() : '');
  return rows.slice(1)
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => ({
      TYPENAME: cell(r, iType),
      NAME: cell(r, iName),
      EMAIL: cell(r, iEmail),
      PHONE: cell(r, iPhone),
      PAYSTATUS: cell(r, iPay).toUpperCase() || 'BELUM_BAYAR',
    }));
}

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  try {
    // console.log('renderer controller mattendee');
  } catch {
    /* abaikan */
  }
}

// toolbar mainpage: pid="btrefresh"
export function btrefresh_click(grid: GridApi | null): void {
  grid?.refresh();
}

// toolbar mainpage: pid="btnew"
export function btnew_click(grid: GridApi | null): void {
  grid?.create();
}
