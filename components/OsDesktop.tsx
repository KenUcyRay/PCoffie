// OsDesktop — workspace ala Windows 11 untuk mode_desktop.
//
// Bukan web admin biasa: wallpaper + ikon modul + jendela aplikasi yang bisa
// dibuka banyak sekaligus (overlap), di-drag, minimize/maximize/close, taskbar
// dengan tombol Start + tombol per jendela + system tray (jam, notif, profil),
// serta Start menu dengan search. Isi jendela = halaman menu existing
// (resolve MCONTROL -> app/<mcontrol>/<mcontrol>.tsx, sama seperti MenuHost).
'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { buildModuleTree, type MenuNode, type ModuleNode } from '@/lib/menu';
import { useTabs } from '@/lib/tabs';
import { useCurrentPath, useRoute } from '@/lib/route';
import { useModal } from './Modal';
import UserProfileModal from '@/app/cp_usersetting/FRMprofile_user';
import { toast } from './toast';
import { Icon, iconForLeaf, iconForModule } from './Icon';
import { MenuTree, Clock } from './Shells';
import { openContextMenu, ContextMenuHost } from './ContextMenu';
import { NotifBridge, useNotifs } from './Notifs';

type Win =
  | { id: number; kind: 'menu'; mcontrol: string; title: string; min: boolean; max: boolean; z: number; x: number; y: number }
  | { id: number; kind: 'module'; modCode: string; title: string; min: boolean; max: boolean; z: number; x: number; y: number };

// Isi jendela menu: resolve MCONTROL seperti MenuHost, tanpa bungkus Shell
// (chrome jendela OS yang jadi bingkainya).
function WinContent({ mcontrol }: { mcontrol: string }) {
  const { menus } = useAuth();
  const [Comp, setComp] = useState<React.ComponentType | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let alive = true;
    setState('loading');
    setComp(null);
    if (!mcontrol || mcontrol === '-') {
      setState('missing');
      return () => { alive = false; };
    }
    import(
      /* webpackInclude: /[/\\][A-Za-z0-9_()[\]-]+[/\\](?!page\.|layout\.|loading\.|error\.|not-found\.|template\.|default\.)[A-Za-z0-9_]+\.tsx$/ */
      `@/app/${mcontrol}/${mcontrol}`
    )
      .then((m: any) => {
        if (!alive) return;
        if (typeof m?.default === 'function') { setComp(() => m.default); setState('ready'); }
        else setState('missing');
      })
      .catch(() => { if (alive) setState('missing'); });
    return () => { alive = false; };
  }, [mcontrol]);

  if (state === 'missing') {
    return (
      <div style={{ padding: 4 }}>
        <p className="empty-hint"><Icon name="info" size={16} /> Halaman belum dibuat</p>
        <p>menu Control: <code>{mcontrol}</code> tidak ditemukan. Buat folder <code>app/{mcontrol}/</code> dari <code>templates/menu/</code>.</p>
      </div>
    );
  }
  if (state === 'loading' || !Comp) {
    return <span className="loading-hint"><Icon name="loading" size={16} className="spin" /> Memuat…</span>;
  }
  return <Comp />;
}

// Isi jendela module: browser 2 tingkat. Tingkat 1 = daftar induk (folder,
// klik masuk) + menu langsung (klik buka). Tingkat 2 = isi induk + tombol kembali.
function ModuleWin({ mod, onOpen }: { mod: ModuleNode; onOpen: (mcontrol: string) => void }) {
  const [at, setAt] = useState<string | null>(null);
  const parents = mod.children.filter((n) => n.children.length > 0);
  const direct = mod.children.filter((n) => !n.children.length && n.mcontrol && n.mcontrol !== '-');
  const cur = at ? parents.find((p) => p.menuKey === at) : null;

  if (!parents.length && !direct.length) {
    return <p className="empty-hint"><Icon name="grid" size={16} /> Belum ada menu di module ini.</p>;
  }

  if (cur) {
    const leaves = cur.children.filter((n) => !n.children.length && n.mcontrol && n.mcontrol !== '-');
    return (
      <div className="mod-nav">
        <button type="button" className="mod-back" onClick={() => setAt(null)}>
          <Icon name="chevR" size={14} style={{ transform: 'scaleX(-1)' }} />
          <span>{cur.name}</span>
        </button>
        <div className="mod-cards">
          {leaves.map((l) => (
            <button key={l.menuKey} type="button" className="mod-card" onClick={() => onOpen(l.mcontrol)}>
              <div className="mod-top">
                <span className="mod-ico tint-4"><Icon name={iconForLeaf(l.mcontrol)} size={20} /></span>
                <span className="mod-meta"><b>{l.name}</b><span>{mod.name}</span></span>
                <Icon name="chevR" size={15} />
              </div>
            </button>
          ))}
          {leaves.length === 0 && (
            <p className="empty-hint"><Icon name="folderOpen" size={16} /> Tidak ada halaman di grup ini.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mod-nav">
      {parents.length > 0 && (
        <>
          <p className="mod-sect">Menu induk</p>
          <div className="mod-cards">
            {parents.map((p, i) => {
              const count = p.children.filter((n) => !n.children.length).length;
              return (
                <button key={p.menuKey} type="button" className="mod-card" onClick={() => setAt(p.menuKey)}>
                  <div className="mod-top">
                    <span className={`mod-ico tint-${i % 7}`}><Icon name="folderOpen" size={20} /></span>
                    <span className="mod-meta"><b>{p.name}</b><span>{count} menu</span></span>
                    <Icon name="chevR" size={15} />
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
      {direct.length > 0 && (
        <>
          <p className="mod-sect">Menu langsung</p>
          <div className="mod-cards">
            {direct.map((l) => (
              <button key={l.menuKey} type="button" className="mod-card" onClick={() => onOpen(l.mcontrol)}>
                <div className="mod-top">
                  <span className="mod-ico tint-1"><Icon name={iconForLeaf(l.mcontrol)} size={20} /></span>
                  <span className="mod-meta"><b>{l.name}</b><span>{mod.name}</span></span>
                  <Icon name="chevR" size={15} />
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function OsDesktop() {
  const { profile, menus, logout, checkMenuAccess, changeLayout, layoutMode } = useAuth();
  const { navigate } = useRoute();
  const pathname = useCurrentPath();
  const { openTab } = useTabs();
  const { open } = useModal();
  const { items: notifs, unread, markAllRead, clear: clearNotifs } = useNotifs();

  const [wins, setWins] = useState<Win[]>([]);
  const [startOpen, setStartOpen] = useState(false);
  const [startQ, setStartQ] = useState('');
  const [trayOpen, setTrayOpen] = useState<'notif' | 'user' | null>(null);
  const [selIcon, setSelIcon] = useState<string | null>(null);
  // Menu terakhir dibuka sesi ini (untuk Recommended di Start). In-memory saja.
  const [recent, setRecent] = useState<string[]>([]);
  const idSeq = useRef(1);
  const zTop = useRef(10);
  const areaRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const trayRef = useRef<HTMLDivElement>(null);

  const modules = useMemo(() => buildModuleTree(menus), [menus]);

  const titleOf = useCallback((mcontrol: string): string => {
    const row: any = (menus || []).find(
      (m: any) => String(m.MCONTROL || '').toLowerCase() === String(mcontrol || '').toLowerCase(),
    );
    return String(row?.MNAME || mcontrol || 'Application');
  }, [menus]);

  const makePos = useCallback((n: number) => ({ x: 28 + (n % 7) * 30, y: 22 + (n % 7) * 26 }), []);

  // Buka/tutup jendela selalu lewat navigate juga supaya state rute (tab,
  // session restore, auth) tetap sinkron seperti mode lain.
  const openMenu = useCallback(async (mcontrol: string, silent = false) => {
    const mc = String(mcontrol || '').toLowerCase();
    if (!mc || mc === '-') { toast('Error', 'menu Control tidak ditemukan', 'err'); return; }
    const row: any = (menus || []).find((m: any) => String(m.MCONTROL || '').toLowerCase() === mc);
    if (row?.MCODE) {
      const ok = await checkMenuAccess(String(row.MCODE));
      if (!ok) { toast('Error', 'Anda tidak memiliki hak akses untuk membuka menu ini.', 'err'); return; }
    }
    const path = '/' + mc;
    if (!silent) {
      openTab(path);
      navigate(path);
    }
    setRecent((prev) => [mc, ...prev.filter((x) => x !== mc)].slice(0, 6));
    setWins((prev) => {
      const ex = prev.find((w) => w.kind === 'menu' && w.mcontrol === mc);
      zTop.current += 1;
      if (ex) return prev.map((w) => (w.id === ex.id ? { ...w, min: false, z: zTop.current } : w));
      const p = makePos(prev.length);
      return [...prev, { id: idSeq.current++, kind: 'menu', mcontrol: mc, title: titleOf(mc), min: false, max: false, z: zTop.current, ...p }];
    });
    setStartOpen(false);
  }, [menus, checkMenuAccess, openTab, navigate, titleOf, makePos]);

  const openModule = useCallback((modCode: string) => {
    const mod = modules.find((m) => m.code === modCode);
    if (!mod) return;
    setWins((prev) => {
      const ex = prev.find((w) => w.kind === 'module' && w.modCode === modCode);
      zTop.current += 1;
      if (ex) return prev.map((w) => (w.id === ex.id ? { ...w, min: false, z: zTop.current } : w));
      const p = makePos(prev.length);
      return [...prev, { id: idSeq.current++, kind: 'module', modCode, title: mod.name, min: false, max: false, z: zTop.current, ...p }];
    });
    setStartOpen(false);
  }, [modules, makePos]);

  // Pulihkan jendela dari posisi tersimpan (refresh) — tanpa navigate ulang.
  useEffect(() => {
    if (!pathname || pathname === '/login' || pathname === '/') return;
    const mc = pathname.replace(/^\//, '');
    setWins((prev) => {
      if (prev.some((w) => w.kind === 'menu' && w.mcontrol === mc)) return prev;
      return prev;
    });
    openMenu(mc, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const closeWin = useCallback((id: number) => {
    setWins((prev) => {
      const gone = prev.find((w) => w.id === id);
      const next = prev.filter((w) => w.id !== id);
      if (gone && gone.kind === 'menu' && '/' + gone.mcontrol === pathname) {
        const top = [...next].filter((w) => !w.min).sort((a, b) => b.z - a.z)[0]
          || [...next].sort((a, b) => b.z - a.z)[0];
        navigate(top && top.kind === 'menu' ? '/' + top.mcontrol : '/');
      }
      return next;
    });
  }, [pathname, navigate]);

  const focusWin = useCallback((id: number) => {
    zTop.current += 1;
    const z = zTop.current;
    setWins((prev) => prev.map((w) => (w.id === id ? { ...w, min: false, z } : w)));
  }, []);

  const minWin = useCallback((id: number) => {
    setWins((prev) => prev.map((w) => (w.id === id ? { ...w, min: true } : w)));
  }, []);

  const maxWin = useCallback((id: number) => {
    setWins((prev) => prev.map((w) => (w.id === id ? { ...w, max: !w.max } : w)));
    focusWin(id);
  }, [focusWin]);

  const closeAll = useCallback(() => {
    setWins([]);
    navigate('/');
  }, [navigate]);

  const showAll = useCallback(() => {
    zTop.current += 1;
    setWins((prev) => prev.map((w) => ({ ...w, min: false })));
  }, []);

  // Drag jendela via title bar.
  const onTitleDown = (e: React.PointerEvent, w: Win) => {
    if (w.max) return;
    if ((e.target as HTMLElement).closest('button')) return;
    focusWin(w.id);
    const area = areaRef.current?.getBoundingClientRect();
    const box = (e.currentTarget as HTMLElement).closest('.os-win')?.getBoundingClientRect();
    if (!area || !box) return;
    dragRef.current = { id: w.id, dx: e.clientX - box.left, dy: e.clientY - box.top };
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const area = areaRef.current?.getBoundingClientRect();
    if (!d || !area) return;
    const x = Math.max(-200, Math.min(e.clientX - area.left - d.dx, area.width - 120));
    const y = Math.max(0, Math.min(e.clientY - area.top - d.dy, area.height - 60));
    setWins((prev) => prev.map((w) => (w.id === d.id ? { ...w, x, y } : w)));
  };
  const endDrag = () => { dragRef.current = null; };

  // Klik di luar menutup tray.
  useEffect(() => {
    if (!trayOpen) return;
    const onDown = (e: PointerEvent) => {
      if (trayRef.current && !trayRef.current.contains(e.target as Node)) setTrayOpen(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [trayOpen]);

  const desktopMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'Tampilkan semua jendela', icon: 'select', onClick: showAll, disabled: wins.length === 0 },
        { label: 'Tutup semua jendela', icon: 'close', onClick: closeAll, disabled: wins.length === 0 },
        { label: 'Mode Standard', icon: 'layout', onClick: async () => { await changeLayout('mode_standard'); window.location.reload(); } },
      ],
    });
  };

  const displayName = profile?.USERNAME || profile?.USERLOGIN || 'Guest';
  const initials = String(displayName).trim().slice(0, 2).toUpperCase() || 'GU';
  const topWin = [...wins].filter((w) => !w.min).sort((a, b) => b.z - a.z)[0] || null;

  const closeStart = useCallback(() => { setStartOpen(false); setStartQ(''); }, []);

  const doLogout = useCallback(async () => {
    setStartOpen(false);
    setTrayOpen(null);
    await logout();
    navigate('/login');
  }, [logout, navigate]);

  const openProfile = useCallback(() => {
    setStartOpen(false);
    setTrayOpen(null);
    open(<UserProfileModal />);
  }, [open ]);

  const recentItems = useMemo(() => recent
    .map((mc) => ({ mc, name: titleOf(mc) }))
    .filter((r) => r.name && r.name !== r.mc)
    .slice(0, 6), [recent, titleOf]);

  return (
    <div className="layout desktop">
      <div
        ref={areaRef}
        className="os-area"
        onClick={() => { setStartOpen(false); setSelIcon(null); }}
        onContextMenu={desktopMenu}
        onPointerMove={onDragMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Ikon desktop per module */}
        <div className="os-icons">
          {modules.map((m) => (
            <button
              key={m.code}
              type="button"
              className={`os-icon${selIcon === m.code ? ' selected' : ''}`}
              onClick={(e) => { e.stopPropagation(); setSelIcon(m.code); }}
              onDoubleClick={() => openModule(m.code)}
              onKeyDown={(e) => { if (e.key === 'Enter') openModule(m.code); }}
              title={m.name}
            >
              <span className="os-ico"><Icon name={iconForModule(m.code)} size={22} /></span>
              <span>{m.name}</span>
            </button>
          ))}
        </div>

        {/* Jendela-jendela */}
        {wins.filter((w) => !w.min).map((w) => (
          <div
            key={w.id}
            className={`os-win${w.max ? ' maxed' : ''}`}
            style={w.max ? { zIndex: w.z } : { left: w.x, top: w.y, zIndex: w.z }}
            onPointerDown={() => focusWin(w.id)}
            onContextMenu={(e) => e.stopPropagation()}
          >
            <div className="os-title" onPointerDown={(e) => onTitleDown(e, w)} onDoubleClick={() => maxWin(w.id)}>
              <Icon name={w.kind === 'menu' ? iconForLeaf(w.mcontrol) : iconForModule(w.modCode)} size={15} />
              <b>{w.title}</b>
              <button type="button" className="os-tbtn" aria-label="Minimize" onClick={() => minWin(w.id)}>
                <Icon name="windowMin" size={15} />
              </button>
              <button type="button" className="os-tbtn" aria-label={w.max ? 'Restore' : 'Maximize'} onClick={() => maxWin(w.id)}>
                <Icon name={w.max ? 'windowRestore' : 'windowMax'} size={14} />
              </button>
              <button type="button" className="os-tbtn danger" aria-label="Close" onClick={() => closeWin(w.id)}>
                <Icon name="close" size={15} />
              </button>
            </div>
            <div className="os-body">
              {w.kind === 'menu'
                ? <WinContent mcontrol={w.mcontrol} />
                : <ModuleWin mod={modules.find((m) => m.code === w.modCode)!} onOpen={(mc) => openMenu(mc)} />}
            </div>
          </div>
        ))}

        {/* Start menu ala Windows 11 */}
        {startOpen && (
          <div className="os-start" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
            <div className="os-start-search big">
              <Icon name="search" size={16} />
              <input
                value={startQ}
                onChange={(e) => setStartQ(e.target.value)}
                placeholder="Cari menu, aplikasi, atau pengaturan..."
                aria-label="Cari menu, aplikasi, atau pengaturan"
              />
            </div>
            {startQ.trim() ? (
              <div className="os-start-menu">
                <MenuTree filter={startQ} onNavigate={closeStart} />
              </div>
            ) : (
              <>
                <p className="os-sect">Pinned</p>
                <div className="os-pins">
                  {modules.map((m, i) => (
                    <button
                      key={m.code}
                      type="button"
                      className="os-pin"
                      title={m.name}
                      onClick={() => { closeStart(); openModule(m.code); }}
                    >
                      <span className={`os-ico tint-${i % 7}`}><Icon name={iconForModule(m.code)} size={22} /></span>
                      <span>{m.name}</span>
                    </button>
                  ))}
                </div>
                <p className="os-sect">Recommended</p>
                <div className="os-recs">
                  {recentItems.length === 0 && (
                    <p className="empty-hint"><Icon name="history" size={16} /> Belum ada aktivitas sesi ini.</p>
                  )}
                  {recentItems.map((r) => (
                    <button
                      key={r.mc}
                      type="button"
                      className="os-rec"
                      onClick={() => { closeStart(); openMenu(r.mc); }}
                    >
                      <Icon name={iconForLeaf(r.mc)} size={16} />
                      <span>{r.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="os-powerbar">
              <button type="button" className="os-powbtn" title={displayName} onClick={openProfile}>
                <span className="os-avatar">{initials}</span>
                <span>{displayName}</span>
              </button>
              <span className="spacer" />
              <button type="button" className="os-icobtn" title="Settings" aria-label="Settings" onClick={openProfile}>
                <Icon name="gear" size={17} />
              </button>
              <button type="button" className="os-icobtn danger" title="Power" aria-label="Power" onClick={doLogout}>
                <Icon name="power" size={17} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Taskbar */}
      <div className="os-taskbar">
        <button type="button" className="os-startbtn" onClick={() => { setStartOpen((v) => !v); setStartQ(''); }}>
          <Icon name="start" size={17} /><span>Start</span>
        </button>
        {wins.map((w) => (
          <button
            key={w.id}
            type="button"
            className={`os-winbtn${topWin?.id === w.id ? ' active' : ''}${w.min ? ' min' : ''}`}
            title={w.title}
            onClick={() => {
              if (topWin?.id === w.id && !w.min) minWin(w.id);
              else focusWin(w.id);
            }}
            onContextMenu={(e) => {
              e.preventDefault(); e.stopPropagation();
              openContextMenu({ x: e.clientX, y: e.clientY, items: [{ label: `Tutup ${w.title}`, icon: 'close', danger: true, onClick: () => closeWin(w.id) }] });
            }}
          >
            <Icon name={w.kind === 'menu' ? iconForLeaf(w.mcontrol) : iconForModule(w.modCode)} size={15} />
            <span>{w.title}</span>
          </button>
        ))}
        <span className="spacer" />
        <div ref={trayRef} className="os-tray">
          <button
            type="button"
            className="os-traybtn"
            aria-label="Notifikasi"
            onClick={() => { setTrayOpen((v) => (v === 'notif' ? null : 'notif')); if (trayOpen !== 'notif') markAllRead(); }}
          >
            <Icon name="bell" size={17} />
            {unread > 0 && <span className="os-badge">{unread > 9 ? '9+' : unread}</span>}
          </button>
          <button
            type="button"
            className="os-traybtn"
            aria-label="Menu user"
            onClick={() => setTrayOpen((v) => (v === 'user' ? null : 'user'))}
          >
            <Icon name="userCircle" size={17} />
          </button>
          <Clock />
          {trayOpen === 'notif' && (
            <div className="os-panel" role="menu" aria-label="Notifikasi">
              <div className="drop-head">
                <b>Notifikasi</b>
                {notifs.length > 0 && <button type="button" className="drop-link" onClick={clearNotifs}>Bersihkan</button>}
              </div>
              {notifs.length === 0 && (
                <p className="empty-hint"><Icon name="bell" size={16} /> Belum ada notifikasi.</p>
              )}
              {notifs.slice(0, 8).map((n) => (
                <div key={n.id} className="drop-note" role="menuitem">
                  <Icon name={n.kind === 'ok' ? 'checkCircle' : 'alertCircle'} size={15} />
                  <span><b>{n.title}</b><small>{n.text}</small></span>
                </div>
              ))}
            </div>
          )}
          {trayOpen === 'user' && (
            <div className="os-panel" role="menu" aria-label="Menu user">
              <div className="drop-head"><b>{displayName}</b><span className="start-user">{profile?.USERLOGIN}</span></div>
              <button type="button" role="menuitem" className="dropdown-item with-icon" onClick={() => { setTrayOpen(null); open(<UserProfileModal />); }}>
                <Icon name="userCircle" size={15} /><span>User Profile</span>
              </button>
              <button type="button" role="menuitem" className="dropdown-item with-icon" onClick={async () => { setTrayOpen(null); await changeLayout(layoutMode === 'mode_desktop' ? 'mode_standard' : 'mode_desktop'); window.location.reload(); }}>
                <Icon name="layout" size={15} /><span>{layoutMode === 'mode_desktop' ? 'Mode Standard' : 'Mode Desktop'}</span>
              </button>
              <button type="button" role="menuitem" className="dropdown-item with-icon danger" onClick={async () => { setTrayOpen(null); await logout(); navigate('/login'); }}>
                <Icon name="logout" size={15} /><span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <ContextMenuHost />
      <NotifBridge />
    </div>
  );
}
