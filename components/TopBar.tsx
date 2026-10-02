// Top bar mode desktop: burger (mobile) + logo + search pemicu palette +
// lonceng notifikasi + profil. Quiet chrome: tipis 56px, netral, aksen biru.
'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useRoute } from '@/lib/route';
import { useModal } from './Modal';
import UserProfileModal from '@/app/cp_usersetting/FRMprofile_user';
import { APP_NAME } from '@/lib/app-config';
import { toast } from './toast';
import { Icon } from './Icon';
import { togglePalette } from './CommandPalette';
import { useNotifs } from './Notifs';

export default function TopBar({ onBurger }: { onBurger: () => void }) {
  const { profile, logout, layoutMode, changeLayout } = useAuth();
  const { navigate } = useRoute();
  const { open } = useModal();
  const { items, unread, markAllRead, clear } = useNotifs();
  const [popOpen, setPopOpen] = useState<'notif' | 'user' | null>(null);
  const [busy, setBusy] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!popOpen) return;
    const onDown = (e: PointerEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setPopOpen(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPopOpen(null); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [popOpen]);

  const displayName = profile?.USERNAME || profile?.USERLOGIN || 'Guest';
  const initials = String(displayName).trim().slice(0, 2).toUpperCase() || 'GU';

  const switchMode = async () => {
    setPopOpen(null);
    setBusy(true);
    try {
      await changeLayout(layoutMode === 'mode_desktop' ? 'mode_standard' : 'mode_desktop');
      window.location.reload();
    } catch (e: any) {
      toast('Error', e.message || 'Gagal mengubah mode layout.', 'err');
      setBusy(false);
    }
  };

  const doLogout = async () => {
    setPopOpen(null);
    await logout();
    navigate('/login');
  };

  return (
    <div className="dtop" ref={barRef}>
      <button type="button" className="icon-btn dtop-burger" aria-label="Buka menu navigasi" onClick={onBurger}>
        <Icon name="menu" size={19} />
      </button>
      <span className="dtop-logo"><Icon name="apps" size={20} /></span>
      <b className="dtop-name">{APP_NAME}</b>

      <button type="button" className="dtop-search" onClick={togglePalette} aria-label="Cari menu atau aksi">
        <Icon name="search" size={15} />
        <span>Cari menu, aksi…</span>
        <kbd>Ctrl K</kbd>
      </button>

      <span className="spacer" />

      <div className="dtop-pop">
        <button
          type="button"
          className="icon-btn dtop-bell"
          aria-label={unread > 0 ? `${unread} notifikasi belum dibaca` : 'Notifikasi'}
          onClick={() => { setPopOpen((v) => (v === 'notif' ? null : 'notif')); if (popOpen !== 'notif') markAllRead(); }}
        >
          <Icon name="bell" size={18} />
          {unread > 0 && <span className="dtop-badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
        {popOpen === 'notif' && (
          <div className="dropdown down" role="menu" aria-label="Notifikasi">
            <div className="drop-head">
              <b>Notifikasi</b>
              {items.length > 0 && <button type="button" className="drop-link" onClick={clear}>Bersihkan</button>}
            </div>
            {items.length === 0 && (
              <p className="empty-hint"><Icon name="bell" size={16} /> Belum ada notifikasi.</p>
            )}
            {items.slice(0, 8).map((n) => (
              <div key={n.id} className="drop-note" role="menuitem">
                <Icon name={n.kind === 'ok' ? 'checkCircle' : 'alertCircle'} size={15} />
                <span><b>{n.title}</b><small>{n.text}</small></span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dtop-pop">
        <button type="button" className="dtop-user" onClick={() => setPopOpen((v) => (v === 'user' ? null : 'user'))} aria-label="Menu user">
          <span className="dtop-avatar">{initials}</span>
          <span className="dtop-uname">{displayName}</span>
          <Icon name="chevD" size={14} />
        </button>
        {popOpen === 'user' && (
          <div className="dropdown down" role="menu" aria-label="Menu user">
            <button type="button" role="menuitem" className="dropdown-item with-icon" onClick={() => { setPopOpen(null); open(<UserProfileModal />); }}>
              <Icon name="userCircle" size={15} /><span>User Profile</span>
            </button>
            <button type="button" role="menuitem" className="dropdown-item with-icon" disabled={busy} onClick={switchMode}>
              <Icon name="layout" size={15} /><span>{layoutMode === 'mode_desktop' ? 'Mode Standard' : 'Mode Desktop'}</span>
            </button>
            <button type="button" role="menuitem" className="dropdown-item with-icon danger" onClick={doLogout}>
              <Icon name="logout" size={15} /><span>Logout</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
