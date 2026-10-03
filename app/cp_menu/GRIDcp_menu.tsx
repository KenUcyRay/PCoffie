// GRIDcp_menu — dropdown module + pohon menu + pencarian + ubah.
// Pakai komponen reusable (Modal/toast/Confirm/Icon). Tree dirender manual
// (bukan DataTable) karena strukturnya hierarkis, bukan baris datar.
//
// State: module, tree, q, open:Set<MCODE>, loading, err
import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { parseBoolean } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openContextMenu } from '@/components/ContextMenu';
import { Btn, Icon } from '@/components/Icon';
import FRMcp_menu, { type MenuForm } from './FRMcp_menu';
import * as proxy from './api';

export type GridApi = {
  refresh: () => void;
  edit: (mcode: number) => void;
};

export type MenuNode = {
  MCODE: number | string;
  MPARRENT: number | string;
  MMODULE?: string;
  MNAME?: string;
  MCONTROL?: string;
  MCHILDREN?: string;
  MEXPAND?: string;
  MLEAF?: string;
  MSHORT?: number | string;
  CHILDREN?: MenuNode[];
};

const toForm = (r: MenuNode): MenuForm => ({
  MCODE: r.MCODE,
  MNAME: String(r.MNAME || ''),
  MSHORT: String(r.MSHORT ?? '0'),
  MEXPAND: String(r.MEXPAND || 'FALSE').toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE',
});

const GRIDcp_menu = forwardRef<GridApi>(function GRIDcp_menu(_props, ref) {
  const { open } = useModal();
  const { layoutMode } = useAuth();
  const [modules, setModules] = useState<{ DEFCODE: string; DEFNAME?: string }[]>([]);
  const [module, setModule] = useState('');
  const [tree, setTree] = useState<MenuNode[]>([]);
  const [q, setQ] = useState('');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const loadModules = useCallback(async () => {
    try {
      const res: any = await proxy.read_modules();
      if (parseBoolean(res?.success)) {
        const rows = res.Rows || [];
        setModules(rows.map((r: any) => ({ DEFCODE: String(r.DEFCODE), DEFNAME: String(r.DEFNAME || r.DEFCODE) })));
        if (!module && rows.length) setModule(String(rows[0].DEFCODE));
      }
    } catch { /* modul gagal: dropdown kosong, tree ikut kosong */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async (opts?: { mmodule?: string; q?: string }) => {
    const mm = opts?.mmodule ?? module;
    const qq = opts?.q ?? q;
    if (!mm) return;
    setLoading(true);
    setErr('');
    try {
      const res: any = await proxy.read_tree({ mmodule: mm, q: qq || undefined });
      if (parseBoolean(res?.success)) {
        const rows = (res.Rows || []) as MenuNode[];
        setTree(rows);
        // Buka semua induk saat cari; selain itu ikut MEXPAND.
        if (qq) {
          const all = new Set<string>();
          const walk = (list: MenuNode[]) => list.forEach((n) => {
            if ((n.CHILDREN || []).length) { all.add(String(n.MCODE)); walk(n.CHILDREN || []); }
          });
          walk(rows);
          setOpenIds(all);
        } else {
          setOpenIds(new Set());
        }
      } else setErr(res?.message || 'Gagal memuat data.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [module, q]);

  const refresh = useCallback(() => {
    setQ('');
    load({ q: '' });
  }, [load]);

  const openMenu = useCallback(async (mcode: number | string) => {
    try {
      const res: any = await proxy.read_detail(Number(mcode));
      if (!parseBoolean(res?.success)) { toast('Error', res?.message, 'err'); return; }
      const row = (res.Rows || [])[0] as MenuNode;
      open(<FRMcp_menu initial={toForm(row)} extra={{ MCONTROL: String(row.MCONTROL || ''), GROUPCOUNT: Number((row as any).GROUPCOUNT || 0) }} onSaved={() => load({})} />);
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [load, open]);

  // Klik-kanan node (hanya mode desktop; standard tidak berubah).
  const nodeMenu = useCallback((n: MenuNode, e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: `Ubah ${n.MNAME}`, icon: 'edit', onClick: () => openMenu(n.MCODE) },
      ],
    });
  }, [openMenu]);

  useImperativeHandle(ref, () => ({ refresh, edit: openMenu }), [refresh, openMenu]);

  useEffect(() => { loadModules(); }, [loadModules]);

  useEffect(() => {
    if (module) load({ mmodule: module });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module]);

  const toggle = (key: string) => {
    setOpenIds((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  const searching = q.trim().length > 0;
  const renderNodes = (list: MenuNode[], depth: number): React.ReactNode => (
    <ul className="akses-tree" style={depth === 0 ? { paddingLeft: 0 } : undefined}>
      {list.map((n) => {
        const kids = n.CHILDREN || [];
        const isGroup = kids.length > 0 || String(n.MCHILDREN || '').toUpperCase() === 'TRUE';
        const key = String(n.MCODE);
        const openState = searching || openIds.has(key) || String(n.MEXPAND || '').toUpperCase() === 'TRUE';
        const leaf = String(n.MLEAF || '').toUpperCase() === 'TRUE';
        return (
          <li key={key}>
            <div className="akses-row" style={{ cursor: 'default' }}>
              {isGroup ? (
                <button
                  type="button" className="icon-btn" aria-label={openState ? `Tutup ${n.MNAME}` : `Buka ${n.MNAME}`}
                  onClick={() => toggle(key)}
                  onContextMenu={layoutMode === 'mode_desktop' ? (e) => nodeMenu(n, e) : undefined}
                >
                  <Icon name={openState ? 'chevD' : 'chevR'} size={14} />
                </button>
              ) : (
                <span style={{ width: 26, display: 'inline-flex', justifyContent: 'center' }}>
                  <Icon name="chevR" size={12} />
                </span>
              )}
              <Icon name={isGroup ? 'folderOpen' : 'grid'} size={15} />
              <span className="tree-label"><b>{n.MNAME}</b></span>
              <span className="loading-hint">{leaf ? String(n.MCONTROL || '') : 'induk'}</span>
              <span className="loading-hint">#{String(n.MSHORT ?? '0')}</span>
              <span style={{ flex: 1 }} />
              <Btn
                className="btn-sm" iconOnly icon="edit"
                title={`Ubah ${n.MNAME}`} aria-label={`Ubah ${n.MNAME}`}
                onClick={() => openMenu(n.MCODE)}
                onContextMenu={layoutMode === 'mode_desktop' ? (e) => nodeMenu(n, e) : undefined}
              />
            </div>
            {isGroup && openState && kids.length > 0 && renderNodes(kids, depth + 1)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="grid-box">
      <div className="toolbar" style={{ flexWrap: 'wrap' }}>
        <span className="loading-hint">Module</span>
        <select value={module} onChange={(e) => { setModule(e.target.value); setQ(''); load({ mmodule: e.target.value, q: '' }); }} style={{ minWidth: 200 }}>
          {modules.map((m) => <option key={m.DEFCODE} value={m.DEFCODE}>{m.DEFNAME || m.DEFCODE}</option>)}
        </select>
        <input
          className="input" placeholder="Cari nama/control…" value={q}
          onChange={(e) => { setQ(e.target.value); load({ q: e.target.value }); }}
          style={{ flex: 1, minWidth: 160 }}
        />
      </div>
      {err && (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>{err}</span>
          <Btn className="btn-sm" icon="refresh" onClick={() => load({})}>Coba lagi</Btn>
        </div>
      )}
      {loading && (
        <div className="card-body">
          <span className="loading-hint"><Icon name="loading" size={16} className="spin" /> Memuat…</span>
        </div>
      )}
      {!loading && !err && tree.length === 0 && (
        <div className="card-body">
          <p className="empty-hint"><Icon name="menu" size={16} /> Belum ada menu di module ini.</p>
        </div>
      )}
      {!loading && tree.length > 0 && (
        <div className="card-body" style={{ overflowY: 'auto' }}>
          {renderNodes(tree, 0)}
        </div>
      )}
    </div>
  );
});

export default GRIDcp_menu;
