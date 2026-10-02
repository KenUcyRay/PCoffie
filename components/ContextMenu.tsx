// Menu konteks klik-kanan — pengganti Ext.menu.Menu langit_v2.
//
// Cara pakai (pola event seperti toast/confirmDialog, bisa dari mana saja):
//   openContextMenu({ x: e.clientX, y: e.clientY, items: [
//     { label: 'Buka', icon: 'chevR', onClick: () => ... },
//     { label: 'Hapus', icon: 'del', danger: true, onClick: () => ... },
//   ]});
//
// Posisi dijepit ke viewport, tutup via Esc / klik luar / scroll / resize.
'use client';
import { useCallback, useEffect, useState } from 'react';
import { Icon, type IconName } from './Icon';

export type CtxItem = {
  label: string;
  icon?: IconName;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

type CtxState = { x: number; y: number; items: CtxItem[] } | null;

let seq = 0;
const shown = new Map<number, CtxState & { id: number }>();

export function openContextMenu(opts: { x: number; y: number; items: CtxItem[] }) {
  if (typeof window === 'undefined') return;
  const id = ++seq;
  shown.set(id, { ...opts, id });
  window.dispatchEvent(new CustomEvent('appcore:ctxmenu', { detail: { id } }));
}

function closeContextMenu(id: number) {
  shown.delete(id);
  window.dispatchEvent(new CustomEvent('appcore:ctxmenu-close', { detail: { id } }));
}

export function ContextMenuHost() {
  const [cur, setCur] = useState<(CtxState & { id: number }) | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent).detail?.id as number;
      const st = shown.get(id);
      if (st) setCur(st);
    };
    const onClose = (e: Event) => {
      const id = (e as CustomEvent).detail?.id as number;
      setCur((prev) => (prev && prev.id === id ? null : prev));
    };
    window.addEventListener('appcore:ctxmenu', onOpen);
    window.addEventListener('appcore:ctxmenu-close', onClose);
    return () => {
      window.removeEventListener('appcore:ctxmenu', onOpen);
      window.removeEventListener('appcore:ctxmenu-close', onClose);
    };
  }, []);

  const close = useCallback(() => { if (cur) closeContextMenu(cur.id); }, [cur]);

  useEffect(() => {
    if (!cur) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [cur, close]);

  if (!cur) return null;

  // Jepit ke viewport (buka ke kiri/atas bila mepet tepi).
  const w = Math.min(240, window.innerWidth - 16);
  const h = Math.min(cur.items.length * 34 + 12, window.innerHeight - 16);
  const left = Math.max(8, Math.min(cur.x, window.innerWidth - w - 8));
  const top = Math.max(8, Math.min(cur.y, window.innerHeight - h - 8));

  return (
    <div className="ctx-backdrop" onClick={close} onContextMenu={(e) => { e.preventDefault(); close(); }}>
      <div
        className="ctx-menu"
        role="menu"
        style={{ left, top, minWidth: w }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {cur.items.map((it, i) => (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={`ctx-item${it.danger ? ' danger' : ''}`}
            disabled={it.disabled}
            onClick={() => { close(); it.onClick(); }}
          >
            {it.icon && <Icon name={it.icon} size={15} />}
            <span>{it.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
