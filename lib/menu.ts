// Tiruan Cmode_standard.js: dtmenu flat -> 2 tingkat (Module > Menu),
// dengan urutan sesuai MMODULE_SHORT/MSHORT dan state awal dari MEXPAND.
// Node menu membawa mcontrol (nama folder app/<mcontrol>/) dan mcode (MCODE
// untuk guard hak akses) — sama seperti resolveStandardLeafClass langit_v2.
import type { MenuRow } from './auth';

export type ModuleNode = {
  code: string;
  name: string;
  short: number;
  children: MenuNode[];
};

export type MenuNode = {
  code: string;
  mcode: string;
  mcontrol: string;
  name: string;
  expanded: boolean;
  leaf: boolean;
  menuKey: string;
  children: MenuNode[];
  raw: MenuRow;
};

const asRows = (rows: MenuRow[]): MenuRow[] =>
  rows.map((r) => (r && (r as any).getData ? (r as any).getData() : r));

const shortOf = (v: unknown): number => parseInt(String(v ?? ''), 10) || 0;

// Module unik dari MMODULE, diurutkan oleh MMODULE_SHORT lalu nama.
export function buildModuleTree(rows: MenuRow[]): ModuleNode[] {
  const menuRows = asRows(rows || []);
  if (!menuRows.length) return [];
  if (!menuRows[0].MMODULE) return [];

  const seen = new Map<string, ModuleNode>();
  const ordered = [...menuRows].sort(
    (a, b) => shortOf(a.MMODULE_SHORT) - shortOf(b.MMODULE_SHORT) || String(a.MMODULE_NAME || '').localeCompare(String(b.MMODULE_NAME || '')),
  );

  for (const r of ordered) {
    const code = String(r.MMODULE);
    if (!seen.has(code)) {
      seen.set(code, {
        code,
        name: String(r.MMODULE_NAME || code),
        short: shortOf(r.MMODULE_SHORT),
        children: [],
      });
    }
  }

  //pohon menu per module, mengikuti MPARRENT
  for (const mod of seen.values()) {
    const inModule = menuRows.filter((r) => String(r.MMODULE) === mod.code);
    const build = (parent: string, parentKey: string): MenuNode[] =>
      inModule
        .filter((r) => String(r.MPARRENT ?? '0') === parent)
        .sort((a, b) => shortOf(a.MSHORT) - shortOf(b.MSHORT))
        .map((r) => {
          const code = String(r.MCODE);
          const menuKey = parentKey ? `${parentKey}>${code}` : code;
          const children = build(code, menuKey);
          const node: MenuNode = {
            code,
            mcode: code,
            mcontrol: String(r.MCONTROL || '').toLowerCase(),
            name: String(r.MNAME || r.MCONTROL || code),
            expanded: String(r.MEXPAND ?? '').toUpperCase() === 'TRUE',
            leaf: children.length === 0,
            menuKey,
            children,
            raw: r,
          };
          return node;
        });
    mod.children = build('0', mod.code);
  }

  return [...seen.values()].sort((a, b) => a.short - b.short || a.name.localeCompare(b.name));
}