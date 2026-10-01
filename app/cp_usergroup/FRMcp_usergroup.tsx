// FRMcp_usergroup — panel hak akses menu untuk 1 group user (panel kanan).
//
// Padanan form/panel yang di ExtJS punya reference sendiri dan dikendalikan
// dari controller. Semua logic yang dulu ada di mainpage (load tree akses,
// centang/nocentak, filter, accordion, save) dipindah ke file INI.
// GRIDcp_usergroup memanggil `load(group)` saat baris group diklik —
// controller cuma meneruskan lewat btsave_click untuk tombol Save.
'use client';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from 'react';
import { Btn, Icon } from '@/components/Icon';
import { toast } from '@/components/toast';
import { parseBoolean } from '@/lib/api';
import { useIsNarrow } from '@/lib/useIsNarrow';
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
  const isNarrow = useIsNarrow(760);
  const [group, setGroup] = useState<GroupRow | null>(null);
  const [menus, setMenus] = useState<MenuRow[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [treeFilter, setTreeFilter] = useState('');

  const load = useCallback(async (g: GroupRow) => {
    setGroup(g);
    const res: any = await proxy.read_akses_menu_department(g);
    if (!parseBoolean(res?.success)) { toast('Error', res?.message, 'err'); return; }
    const rows: MenuRow[] = res.Rows || [];
    setMenus(rows);
    setChecked(new Set(rows.filter((r) => String(r.CHECKED || '').toUpperCase() === 'TRUE').map((r) => String(r.MCODE))));
    setOpenIds(new Set());
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

  const save = useCallback(async () => {
    if (!group) return;
    if (!window.confirm('Simpan pengaturan User Group?')) return;
    const dataTree = menus.filter((m) => checked.has(String(m.MCODE))).map((m) => ({ MCODE: m.MCODE, MPARRENT: m.MPARRENT }));
    const res: any = await proxy.update_akses_group(group, dataTree);
    if (parseBoolean(res?.success)) toast('Success', res.message, 'ok');
    else toast('Error', res?.message, 'err');
  }, [group, menus, checked]);

  // Reference ke panel ini (ExtJS: reference: 'akses'). Dipakai controller btsave_click.
  const api = useMemo<AksesApi>(() => ({ load, save, clear }), [load, save, clear]);
  useImperativeHandle(ref, () => api, [api]);

  // Filter tree: node cocok + turunan + leluhur (mirror filterfield langit_v2).
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
    return set;
  })();

  const renderNodes = (parent: string | number): React.ReactNode => {
    const kids = menus
      .filter((m) => String(m.MPARRENT) === String(parent))
      .filter((m) => !visibleCodes || visibleCodes.has(String(m.MCODE)))
      .sort((a, b) => (Number(a.MSHORT) || 0) - (Number(b.MSHORT) || 0));
    if (!kids.length) return null;
    return (
      <ul className="tree" style={{ listStyle: 'none', margin: 0, paddingLeft: 16 }}>
        {kids.map((k) => (
          <li key={k.MCODE}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
              <input type="checkbox" checked={checked.has(String(k.MCODE))} onChange={(e) => toggle(String(k.MCODE), e.target.checked)} /> {k.MNAME}
            </label>
            {renderNodes(k.MCODE)}
          </li>
        ))}
      </ul>
    );
  };

  const renderAccordion = () => {
    const childOf = (code: string): MenuRow[] =>
      menus
        .filter((m) => String(m.MPARRENT) === code)
        .filter((m) => !visibleCodes || visibleCodes.has(String(m.MCODE)))
        .sort((a, b) => (Number(a.MSHORT) || 0) - (Number(b.MSHORT) || 0));
    const roots = childOf('0');
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {roots.map((r) => {
          const kids = childOf(String(r.MCODE));
          const open = openIds.has(String(r.MCODE));
          return (
            <div key={r.MCODE} style={{ border: '1px solid #e5e7eb', borderRadius: 8 }}>
              <label style={{ display: 'flex', gap: 8, padding: 10, alignItems: 'center' }}>
                <input type="checkbox" checked={checked.has(String(r.MCODE))} onChange={(e) => toggle(String(r.MCODE), e.target.checked)} />
                <b>{r.MNAME}</b>
                {kids.length > 0 && (
                  <Btn
                    className="btn-sm"
                    iconOnly
                    iconSize={14}
                    style={{ marginLeft: 'auto' }}
                    aria-label={open ? `Tutup ${r.MNAME}` : `Buka ${r.MNAME}`}
                    icon={open ? 'minus' : 'add'}
                    onClick={() => {
                      const n = new Set(openIds);
                      if (n.has(String(r.MCODE))) n.delete(String(r.MCODE)); else n.add(String(r.MCODE));
                      setOpenIds(n);
                    }}
                  />
                )}
              </label>
              {open && (
                <div style={{ padding: '0 10px 10px 28px', display: 'grid', gap: 6 }}>
                  {kids.map((k) => (
                    <label key={k.MCODE} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="checkbox" checked={checked.has(String(k.MCODE))} onChange={(e) => toggle(String(k.MCODE), e.target.checked)} />
                      {k.MNAME}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
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
        {menus.length > 0 && (isNarrow ? renderAccordion() : renderNodes(0))}
      </div>
    </div>
  );
});

export default FRMcp_usergroup;