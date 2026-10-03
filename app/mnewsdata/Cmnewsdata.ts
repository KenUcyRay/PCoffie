// Controller menu mnewsdata — padanan Cmnewsdata.js langit_v2.
// Tanpa state/async di sini; state milik GRID, aksi form milik FRM.
import type { GridApi } from './GRIDmnewsdata';

export const mcontrol = 'mnewsdata';

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

// Sanitasi HTML sisi klien untuk pratinjau (cerminan NewsHtml backend;
// backend tetap otoritatif). Buang script/style, event handler,
// javascript:, src gambar non-unggahan, dan tag di luar daftar.
const CLIENT_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'blockquote', 'br', 'hr', 'a', 'img'];

export function sanitizeNewsHtml(html: unknown): string {
  let s = String(html ?? '');
  if (!s.trim()) return '';
  s = s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  return s.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (full, _slash: string, t: string, raw: string) => {
    const tag = String(t).toLowerCase();
    const closing = full.startsWith('</');
    if (!CLIENT_TAGS.includes(tag)) return '';
    if (closing) return `</${tag}>`;
    const keep: Record<string, string[]> = { a: ['href', 'title'], img: ['src', 'alt', 'width', 'height'] };
    const allowed = keep[tag] || [];
    if (!allowed.length) return `<${tag}>`;
    let attrs = '';
    const re = /([a-zA-Z][a-zA-Z0-9-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw || '')) !== null) {
      const name = m[1].toLowerCase();
      if (name.startsWith('on') || !allowed.includes(name)) continue;
      const val = m[2] ?? m[3] ?? m[4] ?? '';
      if (tag === 'a' && name === 'href' && !/^https?:\/\//i.test(val.trim())) continue;
      if (tag === 'img' && name === 'src' && !/^uploads\//.test(val.trim())) continue;
      attrs += ` ${name}="${val.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`;
    }
    return `<${tag}${attrs}>`;
  });
}

export function init(): void {
  renderpage();
}

export function renderpage(): void {
  try {
    // console.log('renderer controller mnewsdata');
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
