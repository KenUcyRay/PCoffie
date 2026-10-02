// FRMcp_usergroup — panel hak akses menu untuk 1 group user (panel kanan).
//
// Padanan form/panel yang di ExtJS punya reference sendiri dan dikendalikan
// dari controller. Semua logic yang dulu ada di mainpage (load tree akses,
// centang/nocentak, filter, accordion, save) dipindah ke file INI.
// GRIDcp_usergroup memanggil `load(group)` saat baris group diklik —
// controller cuma meneruskan lewat btsave_click untuk tombol Save.
'use client';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from 'react';
import { Btn, Icon, iconForLeaf, iconForModule } from '@/components/Icon';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { parseBoolean } from '@/lib/api';
import { buildModuleTree, type MenuNode, type ModuleNode } from '@/lib/menu';
import * as proxy from './api';
import type { GroupRow } from './GRIDcp_usergroup';
import { btsave_click } from './Ccp_usergroup';

type MenuRow = { MCODE: string; MPARRENT: string | number; MMODULE?: string; MNAME?: string; CHECKED?: string; MSHORT?: any; [k: string]: any };

// Yang diexpose: dipanggil controller btsave_click (ExtJS: reference ke form).
export type AksesApi = {
  load: (g: GroupRow) => void;
  save: () => void;
  clear: () => void;
};

const FRMcp_usergroup = forwardRef<AksesApi>(function FRMcp_usergroup(_props, ref) {
  const [group, setGroup] = useState<GroupRow | null>(null);
  const [menus, setMenus] = useState<MenuRow[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const [treeFilter, setTreeFilter] = useState('');

  // Kelompokkan flat rows per module (MMODULE_SHORT), sama seperti sidebar.
  const modules = useMemo(() => buildModuleTree(menus as any), [menus]);

  const modKey = (code: string) => `mod:${code}`;

  const load = useCallback(async (g: GroupRow) => {
    setGroup(g);
    const res: any = await proxy.read_akses_menu(g);
    if (!parseBoolean(res?.success)) { toast('Error', res?.message, 'err'); return; }
    const rows: MenuRow[] = res.Rows || [];
    setMenus(rows);
    setChecked(new Set(rows.filter((r) => String(r.CHECKED || '').toUpperCase() === 'TRUE').map((r) => String(r.MCODE))));
    // Semua module terbuka di awal; filter memaksa tampil walau tertutup.
    setOpenIds(new Set(buildModuleTree(rows as any).map((m) => `mod:${m.code}`)));
    setTreeFilter('');
  }, []);

  const clear = useCallback(() => {
    setGroup(null);
    setMenus([]);
    setChecked(new Set());
    setOpenIds(new Set());
    setTreeFilter('');
  }, []);

  const toggle = useCallback((code: string, on: boolean) => {
    const childrenOf = (p: string): string[] => {
      const direct = menus.filter((m) => String(m.MPARRENT) === p).map((m) => String(m.MCODE));
      return direct.concat(direct.flatMap(childrenOf));
    };
    const next = new Set(checked);
    const apply = (c: string) => (on ? next.add(c) : next.delete(c));
    apply(code);
    childrenOf(code).forEach(apply);
    let cur = menus.find((m) => String(m.MCODE) === code);
    while (cur) {
      const p = String(cur.MPARRENT);
      if (p === '0') break;
      const siblings = menus.filter((m) => String(m.MPARRENT) === p).map((m) => String(m.MCODE));
      if (siblings.some((s) => next.has(s))) next.add(p); else next.delete(p);
      cur = menus.find((m) => String(m.MCODE) === p);
    }
    setChecked(next);
  }, [menus, checked]);

  // Centang/hapus semua menu dalam 1 module sekaligus.
  const toggleModule = useCallback((modCode: string, on: boolean) => {
    const mod = modules.find((m) => m.code === modCode);
    if (!mod) return;
    const codes: string[] = [];
    const walk = (nodes: MenuNode[]) => nodes.forEach((n) => { codes.push(n.mcode); walk(n.children); });
    walk(mod.children);
    const next = new Set(checked);
    codes.forEach((c) => (on ? next.add(c) : next.delete(c)));
    setChecked(next);
  }, [modules, checked]);

  const toggleOpen = useCallback((key: string) => {
    setOpenIds((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  }, []);

  const save = useCallback(async () => {
    if (!group) return;
    if (!await confirmDialog({ message: 'Simpan pengaturan User Group?' })) return;
    const dataTree = menus.filter((m) => checked.has(String(m.MCODE))).map((m) => ({ MCODE: m.MCODE, MPARRENT: m.MPARRENT }));
    const res: any = await proxy.update_akses_group(group, dataTree);
    if (parseBoolean(res?.success)) toast('Success', res.message, 'ok');
    else toast('Error', res?.message, 'err');
  }, [group, menus, checked]);

  // Reference ke panel ini (ExtJS: reference: 'akses'). Dipakai controller btsave_click.
  const api = useMemo<AksesApi>(() => ({ load, save, clear }), [load, save, clear]);
  useImperativeHandle(ref, () => api, [api]);

  // Filter tree: node cocok + turunan + leluhur (mirror filterfield langit_v2),
  // ditambah: kalau nama module cocok, seluruh isi module ikut tampil.
  const visibleCodes: Set<string> | null = (() => {
    const f = treeFilter.trim().toLowerCase();
    if (!f) return null;
    const kidsOf = (code: string) => menus.filter((m) => String(m.MPARRENT) === code).map((m) => String(m.MCODE));
    const parentOf = (code: string) => String(menus.find((m) => String(m.MCODE) === code)?.MPARRENT ?? '0');
    const set = new Set<string>();
    for (const m of menus) {
      const code = String(m.MCODE);
      if (!(String(m.MNAME || '').toLowerCase().includes(f) || code.toLowerCase().includes(f))) continue;
      const addSub = (c: string) => { set.add(c); kidsOf(c).forEach(addSub); };
      addSub(code);
      let p = parentOf(code);
      while (p && p !== '0') { set.add(p); p = parentOf(p); }
    }
    for (const mod of modules) {
      if (!(mod.name.toLowerCase().includes(f) || mod.code.toLowerCase().includes(f))) continue;
      const addAll = (nodes: MenuNode[]) => nodes.forEach((n) => { set.add(n.mcode); addAll(n.children); });
      addAll(mod.children);
    }
    return set;
  })();

  const modCodes = (mod: ModuleNode): string[] => {
    const codes: string[] = [];
    const walk = (nodes: MenuNode[]) => nodes.forEach((n) => { codes.push(n.mcode); walk(n.children); });
    walk(mod.children);
    return codes;
  };

  const renderNode = (node: MenuNode): React.ReactNode => {
    if (visibleCodes && !visibleCodes.has(node.mcode)) return null;
    const isGroup = node.children.length > 0;
    return (
      <li key={node.menuKey}>
        <label className="akses-row">
          <input type="checkbox" checked={checked.has(node.mcode)} onChange={(e) => toggle(node.mcode, e.target.checked)} />
          <Icon name={isGroup ? 'folderOpen' : iconForLeaf(node.mcontrol)} size={15} />
          <span className="tree-label">{node.name}</span>
        </label>
        {isGroup && (
          <ul className="akses-tree">
            {node.children.map((c) => renderNode(c))}
          </ul>
        )}
      </li>
    );
  };

  const renderModule = (mod: ModuleNode): React.ReactNode => {
    const key = modKey(mod.code);
    const codes = modCodes(mod);
    // Sembunyikan module yang tidak punya node cocok saat filter aktif.
    if (visibleCodes && !codes.some((c) => visibleCodes.has(c))) return null;
    const filtering = treeFilter.trim().length > 0;
    const open = filtering || openIds.has(key);
    const done = codes.filter((c) => checked.has(c)).length;
    const all = codes.length > 0 && done === codes.length;
    const some = done > 0 && !all;
    return (
      <div key={key} className="akses-mod">
        <div className="akses-mod-head">
          <input
            type="checkbox"
            ref={(el) => { if (el) el.indeterminate = some; }}
            checked={all}
            onChange={(e) => toggleModule(mod.code, e.target.checked)}
            aria-label={`Pilih semua menu ${mod.name}`}
          />
          <button type="button" className="akses-mod-title" onClick={() => toggleOpen(key)} aria-expanded={open}>
            <Icon name={iconForModule(mod.code)} size={17} />
            <span className="tree-label">{mod.name}</span>
            <span className="akses-count">{done}/{codes.length}</span>
            <span className={`akses-chev${open ? '' : ' closed'}`}><Icon name="chevD" size={14} /></span>
          </button>
        </div>
        {open && (
          <div className="akses-mod-body">
            <ul className="akses-tree root">
              {mod.children.map((n) => renderNode(n))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid-box">
      {/* toolbar panel ini sendiri; handler-nya di controller */}
      <div className="toolbar">
        <b className="panel-title"><Icon name="users" size={15} /> Group Setting: {group?.DEFCODE || '-'}</b>
        <span className="spacer" />
        <Btn pid="btsave" className="primary" icon="save" disabled={!group} onClick={() => btsave_click(api)}>
          Save Group Setting
        </Btn>
      </div>

      <div className="card-body">
        <label className="form-field" style={{ maxWidth: 320 }}>
          Group Name
          <input className="input" value={group?.DEFCODE || ''} readOnly />
        </label>

        {menus.length > 0 && (
          <span className="field-with-icon" style={{ maxWidth: 320 }}>
            <Icon name="filter" size={15} />
            <input
              className="input"
              placeholder="Filter menu (nama/kode)"
              value={treeFilter}
              onChange={(e) => setTreeFilter(e.target.value)}
            />
          </span>
        )}

        {menus.length === 0 && (
          <p className="empty-hint"><Icon name="users" size={16} /> Pilih group di sebelah kiri untuk melihat daftar menu.</p>
        )}
        {menus.length > 0 && visibleCodes && visibleCodes.size === 0 && (
          <p className="empty-hint"><Icon name="filter" size={16} /> Tidak ada menu yang cocok dengan filter.</p>
        )}
        {modules.length > 0 && (
          <div className="akses-mods">
            {modules.map((m) => renderModule(m))}
          </div>
        )}
      </div>
    </div>
  );
});

export default FRMcp_usergroup;