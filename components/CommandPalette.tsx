// Command palette (Ctrl/Cmd+K) — lompat ke menu + aksi cepat tanpa sentuh mouse.
// Dibuka dari search bar TopBar atau shortcut global (aktif saat DesktopShell tampil).
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { buildModuleTree, type MenuNode } from '@/lib/menu';
import { useTabs } from '@/lib/tabs';
import { useRoute } from '@/lib/route';
import { Icon, iconForLeaf, type IconName } from './Icon';

export const PALETTE_EVENT = 'appcore:palette-toggle';

export function togglePalette() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PALETTE_EVENT));
}

export function toggleSidebarEvent() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('appcore:sidebar-toggle'));
}

type Entry =
  | { kind: 'menu'; label: string; hint: string; icon: IconName; run: () => void }
  | { kind: 'aksi'; label: string; hint: string; icon: IconName; run: () => void };

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { menus, logout, changeLayout, layoutMode } = useAuth();
  const { openTab } = useTabs();
  const { navigate } = useRoute();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const go = (mcontrol: string) => {
    const mc = String(mcontrol || '').toLowerCase();
    if (!mc || mc === '-') return false;
    const path = '/' + mc;
    openTab(path);
    navigate(path);
    return true;
  };

  const entries: Entry[] = useMemo(() => {
    const list: Entry[] = [];
    const walk = (nodes: MenuNode[], modName: string) => nodes.forEach((n) => {
      if (n.children.length) { walk(n.children, modName); return; }
      if (!n.mcontrol || n.mcontrol === '-') return;
      const mc = n.mcontrol;
      list.push({
        kind: 'menu', label: n.name, hint: modName, icon: iconForLeaf(mc),
        run: () => { go(mc); },
      });
    });
    buildModuleTree(menus as any).forEach((m) => walk(m.children, m.name));
    list.push(
      { kind: 'aksi', label: 'Ke Home', hint: 'Navigasi', icon: 'home', run: () => { openTab('/'); navigate('/'); } },
      { kind: 'aksi', label: 'Buka/Tutup sidebar', hint: 'Tampilan', icon: 'panel', run: () => toggleSidebarEvent() },
      {
        kind: 'aksi', label: layoutMode === 'mode_desktop' ? 'Ganti ke mode Standard' : 'Ganti ke mode Desktop',
        hint: 'Tampilan', icon: 'layout',
        run: async () => { await changeLayout(layoutMode === 'mode_desktop' ? 'mode_standard' : 'mode_desktop'); window.location.reload(); },
      },
      { kind: 'aksi', label: 'Logout', hint: 'Sesi', icon: 'logout', run: async () => { await logout(); navigate('/login'); } },
    );
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menus, layoutMode]);

  const filtered = useMemo(() => {
    const f = q.trim().toLowerCase();
    if (!f) return entries.slice(0, 12);
    return entries.filter((e) => e.label.toLowerCase().includes(f) || e.hint.toLowerCase().includes(f)).slice(0, 12);
  }, [entries, q]);

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open ]);

  useEffect(() => { setIdx(0); }, [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, filtered.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const it = filtered[idx];
        if (it) { onClose(); it.run(); }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose, filtered, idx]);

  if (!open) return null;

  return (
    <div className="pal-backdrop" onClick={onClose}>
      <div className="palette" role="dialog" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
        <div className="pal-input">
          <Icon name="search" size={16} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ketik menu atau aksi… (Esc tutup)"
            aria-label="Cari menu atau aksi"
          />
          <kbd>esc</kbd>
        </div>
        <div className="pal-list">
          {filtered.length === 0 && (
            <p className="empty-hint"><Icon name="search" size={16} /> Tidak ada yang cocok.</p>
          )}
          {filtered.map((it, i) => (
            <button
              key={`${it.kind}:${it.label}`}
              type="button"
              className={`pal-item${i === idx ? ' active' : ''}`}
              onMouseEnter={() => setIdx(i)}
              onClick={() => { onClose(); it.run(); }}
            >
              <Icon name={it.icon} size={15} />
              <span className="tree-label">{it.label}</span>
              <span className="pal-hint">{it.hint}</span>
            </button>
          ))}
        </div>
        <div className="pal-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> pilih</span>
          <span><kbd>↵</kbd> buka</span>
          <span><kbd>esc</kbd> tutup</span>
        </div>
      </div>
    </div>
  );
}
