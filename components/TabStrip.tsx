// Strip tab — dipakai StandardShell dan DesktopShell baru dengan render
// dan perilaku yang sama persis (dipindah verbatim dari StandardShell).
'use client';
import { useCurrentPath, useRoute } from '@/lib/route';
import { useTabs } from '@/lib/tabs';
import { Icon } from './Icon';

export default function TabStrip() {
  const { navigate } = useRoute();
  const pathname = useCurrentPath();
  const { tabs, openTab, closeTab } = useTabs();

  const go = (path: string) => {
    openTab(path);
    navigate(path);
  };

  const close = (path: string) => {
    const idx = tabs.findIndex((t) => t.path === path);
    closeTab(path);
    if (pathname === path) {
      const fallback = tabs[Math.max(0, idx - 1)]?.path || '/';
      navigate(fallback);
    }
  };

  return (
    <>
      {tabs.map((t) => (
        <span key={t.key} className={`tab${t.path === pathname ? ' active' : ''}`}>
          <button className="tab-label" onClick={() => go(t.path)}>{t.title}</button>
          {t.closable && (
            <button className="tab-x" aria-label={`Tutup ${t.title}`} onClick={() => close(t.path)}>
              <Icon name="close" size={14} />
            </button>
          )}
        </span>
      ))}
    </>
  );
}
