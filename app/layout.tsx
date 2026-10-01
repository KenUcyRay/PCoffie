import type { Viewport } from 'next';

export const metadata = { title: 'App Core', description: 'Core universal — login + usergroup + usersetting' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

import Providers from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        <Providers>{children}</Providers>
        {/* PENTING: <style> adalah raw-text element. Browser TIDAK decode entity di
            dalamnya, sedangkan React meng-escape ' < > & " ' saat SSR. karakter
            itu di CSS = hydration error "Text content does not match ...".
            Larangan: < > & " ' (termasuk content: "" dan child selector).
            Pakai descendant selector, tanpa content, dsb. */}
        <style>{`
          * { box-sizing: border-box; }
          body { margin: 0; font-family: Segoe UI, Arial, sans-serif; background: #eef2f7; color: #1f2937; }
          a { color: #1d4ed8; text-decoration: none; }
          button { cursor: pointer; min-height: 36px; }
          .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px; overflow-x: auto; }
          .btn { border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; padding: 8px 14px; }
          .btn.primary { background: #1d4ed8; border-color: #1d4ed8; color: #fff; }
          .btn.danger { background: #dc2626; border-color: #dc2626; color: #fff; }
          .btn:disabled { opacity: .6; }
          /* tombol ber-icon (Tabler): icon + label rata tengah */
          .btn.with-icon { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
          .btn.icon-only { padding: 8px 10px; min-width: 40px; }
          /* tombol ikon tanpa label (drawer close, sidebar toggle, tab close) */
          .icon-btn { display: inline-flex; align-items: center; justify-content: center; background: transparent; border: 0; padding: 6px 8px; min-height: 36px; color: inherit; }
          .icon-btn:hover { background: #e2e8f0; color: #0f172a; }
          .empty-cell { display: inline-flex; align-items: center; gap: 8px; color: #64748b; }
          .spin { animation: icon-spin 1s linear infinite; }
          @keyframes icon-spin { to { transform: rotate(360deg); } }
          .input, select { width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; font-size: 16px; }
          table.grid { width: 100%; border-collapse: collapse; background: #fff; min-width: 560px; }
          table.grid th, table.grid td { border: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; font-size: 14px; }
          table.grid th { background: #f8fafc; }
          /* standard shell */
          .layout.std { display: flex; min-height: 100vh; }
          .main { flex: 1; display: flex; flex-direction: column; min-width: 0; height: 100vh; }
          .content { padding: 16px; display: grid; gap: 16px; align-content: start; flex: 1; overflow: auto; }
          /* ---- sidebar (lihat components/Sidebar.tsx) ---- */
          .sb { width: 264px; flex: none; background: #0f1729; color: #cbd5e1; display: flex; flex-direction: column; overflow: hidden; transition: width 240ms cubic-bezier(.4,0,.2,1); }
          .sb.sb-collapsed { width: 64px; }
          .sb-overlay { position: fixed; inset: 0; z-index: 65; background: rgba(2,6,23,.6); }
          .sb-head { height: 64px; min-height: 64px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 12px; border-bottom: 1px solid rgba(255,255,255,.07); }
          .sb-brand { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; background: transparent; border: 0; padding: 0; color: inherit; text-align: left; border-radius: 10px; }
          .sb-logo { position: relative; width: 40px; height: 40px; flex: none; border-radius: 10px; background: linear-gradient(135deg,#3b82f6,#1d4ed8); color: #fff; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(59,130,246,.35); }
          .sb-logo-app, .sb-logo-tog { position: absolute; display: inline-flex; transition: opacity 160ms ease; }
          .sb-logo-tog { opacity: 0; }
          .sb-brand:hover .sb-logo-app { opacity: 0; }
          .sb-brand:hover .sb-logo-tog { opacity: 1; }
          .sb-collapsed .sb-logo-app { opacity: 0; }
          .sb-collapsed .sb-logo-tog { opacity: 1; }
          .sb-appname { font-size: 15px; font-weight: 700; color: #f1f5f9; white-space: nowrap; overflow: hidden; opacity: 1; transition: opacity 180ms ease; }
          .sb-toggle { width: 34px; height: 34px; flex: none; display: inline-flex; align-items: center; justify-content: center; background: transparent; border: 0; border-radius: 8px; color: #94a3b8; }
          .sb-toggle:hover { background: rgba(255,255,255,.06); color: #fff; }
          .sb-collapsed .sb-toggle { display: none; }
          .sb-collapsed .sb-appname { opacity: 0; }
          .sb-nav { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 4px 12px 12px; }
          .sb-group-label { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #64748b; padding: 12px 0 6px; white-space: nowrap; opacity: 1; transition: opacity 180ms ease; }
          .sb-collapsed .sb-group-label { opacity: 0; }
          .sb-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
          .sb-sub-inner .sb-list { padding-left: 20px; margin-left: 20px; border-left: 1px solid rgba(255,255,255,.09); }
          .sb-node { display: block; }
          /* kolom ikon 40px tetap, jadi posisi ikon tidak bergeser saat collapse */
          .sb-item { position: relative; display: flex; align-items: center; width: 100%; height: 40px; min-height: 40px; padding: 0; gap: 0; border: 0; border-radius: 10px; background: transparent; color: #cbd5e1; text-align: left; cursor: pointer; overflow: hidden; }
          .sb-item:hover { background: rgba(255,255,255,.06); color: #e2e8f0; }
          .sb-item.active { background: rgba(59,130,246,.16); color: #93c5fd; box-shadow: inset 3px 0 0 #3b82f6; }
          .sb-item.has-active { color: #fff; }
          .sb-ico { width: 40px; flex: none; display: inline-flex; align-items: center; justify-content: center; }
          .sb-label { flex: 1; min-width: 0; padding-right: 10px; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 1; transition: opacity 180ms ease; }
          .sb-chev { width: 22px; flex: none; margin-right: 8px; display: inline-flex; align-items: center; justify-content: center; color: #64748b; opacity: 1; transition: transform 220ms cubic-bezier(.4,0,.2,1), opacity 180ms ease; }
          .sb-item.open .sb-chev { transform: rotate(180deg); color: #94a3b8; }
          .sb-collapsed .sb-label, .sb-collapsed .sb-chev, .sb-collapsed .sb-pinfo, .sb-collapsed .sb-pchev { opacity: 0; }
          .sb-sub { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 220ms cubic-bezier(.4,0,.2,1); }
          .sb-sub.open { grid-template-rows: 1fr; }
          .sb-sub-inner { overflow: hidden; }
          .sb-collapsed .sb-sub { display: none; }
          .sb-empty { display: flex; align-items: center; gap: 8px; margin: 8px 0 0; padding: 0 10px; font-size: 12px; color: #64748b; white-space: nowrap; }
          .sb-foot { position: relative; flex: none; border-top: 1px solid rgba(255,255,255,.07); padding: 10px 12px; }
          .sb-profile { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px; border: 0; border-radius: 10px; background: transparent; color: inherit; text-align: left; cursor: pointer; overflow: hidden; }
          .sb-profile:hover { background: rgba(255,255,255,.06); }
          .sb-avatar { width: 36px; height: 36px; flex: none; border-radius: 50%; background: linear-gradient(135deg,#3b82f6,#8b5cf6); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; letter-spacing: .02em; }
          .sb-pinfo { flex: 1; min-width: 0; display: grid; gap: 2px; opacity: 1; transition: opacity 180ms ease; }
          .sb-pinfo b { font-size: 13px; font-weight: 700; color: #f1f5f9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .sb-pinfo small { font-size: 11px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .sb-pchev { flex: none; display: inline-flex; color: #64748b; opacity: 1; transition: opacity 180ms ease; }
          .sb-popup { position: absolute; left: 12px; right: 12px; bottom: calc(100% - 6px); z-index: 80; background: #111c31; border: 1px solid rgba(255,255,255,.09); border-radius: 12px; padding: 6px; box-shadow: 0 18px 44px rgba(0,0,0,.55); }
          .sb-collapsed .sb-popup { left: calc(100% + 10px); right: auto; bottom: 4px; width: 200px; }
          .sb-pop-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border: 0; border-radius: 8px; background: transparent; color: #cbd5e1; font-size: 13px; text-align: left; cursor: pointer; }
          .sb-pop-item:hover { background: rgba(255,255,255,.06); color: #fff; }
          .sb-pop-item.danger:hover { background: rgba(239,68,68,.16); color: #fca5a5; }
          .sb-tip { position: fixed; left: 76px; transform: translateY(-50%); z-index: 90; background: #0b1220; color: #e2e8f0; border: 1px solid rgba(255,255,255,.1); border-radius: 8px; padding: 6px 10px; font-size: 12px; white-space: nowrap; box-shadow: 0 10px 28px rgba(0,0,0,.5); pointer-events: none; }
          .sb :focus-visible { outline: 2px solid #3b82f6; outline-offset: 2px; }
          @media (max-width: 768px) {
            .sb { position: fixed; inset: 0 auto 0 0; z-index: 70; width: 280px; max-width: 86vw; transform: translateX(-100%); transition: transform 240ms cubic-bezier(.4,0,.2,1); box-shadow: 0 0 40px rgba(0,0,0,.5); }
            .sb.sb-open { transform: translateX(0); }
          }
          @media (prefers-reduced-motion: reduce) {
            .sb, .sb-sub, .sb-chev, .sb-logo-app, .sb-logo-tog, .sb-label, .sb-pinfo, .sb-pchev, .sb-group-label { transition: none; }
          }
          /* tree menu 2 tingkat (dipakai Start menu pada mode_desktop) */
          .menutree { display: grid; gap: 2px; }
          ul.tree { list-style: none; margin: 0; padding-left: 14px; }
          .tree-row {
            display: flex; align-items: center; gap: 6px; width: 100%;
            background: transparent; border: 0; color: #e2e8f0; text-align: left;
            padding: 7px 8px; border-radius: 6px; min-height: 34px;
          }
          .tree-row:hover { background: #1e293b; }
          .tree-row.active { background: #1d4ed8; color: #fff; }
          .module-row .tree-label { font-weight: 700; color: #fff; }
          .tree-caret { width: 14px; flex: none; color: #94a3b8; font-size: 11px; display: inline-flex; align-items: center; justify-content: center; }
          .tree-caret.leaf { color: transparent; }
          .tree-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          /* tab panel */
          .tabbar { display: flex; align-items: stretch; background: #f1f5f9; border-bottom: 1px solid #e5e7eb; overflow-x: auto; }
          .toggle-side { color: #1f2937; border-right: 1px solid #e5e7eb; }
          .tab { display: inline-flex; align-items: center; border-right: 1px solid #e5e7eb; background: #e8edf3; }
          .tab.active { background: #fff; box-shadow: inset 0 -3px 0 #1d4ed8; }
          .tab-label { background: transparent; border: 0; padding: 10px 12px; min-height: 40px; color: #334155; }
          .tab.active .tab-label { font-weight: 700; color: #1d4ed8; }
          .tab-x { background: transparent; border: 0; color: #64748b; padding: 0 8px; min-height: 40px; display: inline-flex; align-items: center; justify-content: center; }
          .tab-x:hover { color: #dc2626; }
          .topbar-title { display: none; align-items: center; padding: 0 12px; font-size: 15px; font-weight: 700; color: #0f172a; white-space: nowrap; }
          @media (max-width: 768px) { .topbar-title { display: inline-flex; } }
          /* bottom toolbar */
          .bottombar { display: flex; align-items: center; gap: 10px; background: #fff; border-top: 1px solid #e5e7eb; padding: 6px 12px; }
          .bottombar .spacer { flex: 1; }
          .clock { text-align: right; font-size: 12px; color: #475569; line-height: 1.3; }
          .dropdown { position: absolute; bottom: 100%; left: 0; z-index: 40; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; min-width: 170px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,.12); }
          .dropdown.down { bottom: auto; top: 100%; left: auto; right: 0; }
          .mode-compact { min-height: 40px; padding: 8px 10px; }
          .dropdown-item { display: block; width: 100%; text-align: left; background: #fff; border: 0; padding: 9px 12px; }
          .dropdown-item.with-icon { display: flex; align-items: center; gap: 8px; }
          .dropdown-item:hover { background: #f1f5f9; }
          .dropdown-item.current { font-weight: 700; color: #1d4ed8; }
          .two-col { display: grid; grid-template-columns: 320px 1fr; gap: 16px; align-items: start; }
          .toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
          /* modal parts */
          .modal-foot { display: flex; gap: 8px; justify-content: flex-end; }
          .modal-toolbar { display: flex; gap: 8px; align-items: center; }
          .modal-toolbar .input { width: auto; flex: 1; }
          .fset { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 12px 12px; margin: 0; }
          .fset legend { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #64748b; padding: 0 4px; }
          .fset-grid { display: grid; gap: 8px; }
          .fset-grid label { display: grid; gap: 4px; font-size: 13px; color: #475569; }
          .toast-host { position: fixed; top: 14px; right: 14px; z-index: 60; display: grid; gap: 8px; width: 320px; max-width: calc(100vw - 28px); }
          .toast-host b { display: block; margin-bottom: 2px; }
          .toast-item { display: flex; align-items: flex-start; gap: 10px; }
          .toast-item svg { margin-top: 1px; }
          .alert-inline { display: flex; align-items: flex-start; gap: 8px; }
          .loading-hint { display: inline-flex; align-items: center; gap: 6px; color: #64748b; font-size: 13px; }
          .empty-hint { display: flex; align-items: center; gap: 8px; color: #64748b; }
          .field-with-icon { position: relative; display: inline-flex; align-items: center; width: 100%; max-width: 320px; }
          .field-with-icon svg { position: absolute; left: 10px; color: #94a3b8; pointer-events: none; }
          .field-with-icon .input { padding-left: 32px; }
          .btn-sm { min-height: 28px; padding: 4px 8px; border-radius: 6px; }
          .btn-sm.icon-only { min-width: 32px; padding: 4px 6px; }
          .modal-head { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 16px; }
          .modal-toolbar .field-with-icon { flex: 1; max-width: none; }
          /* desktop shell (ala mode_desktop langit_v2) */
          .layout.desktop { min-height: 100vh; display: flex; flex-direction: column; background: linear-gradient(135deg,#0f172a,#1e293b 60%,#0b1220); }
          .desktop-area { flex: 1; position: relative; padding: 18px; overflow: hidden; }
          .desktop-window { position: absolute; inset: 18px 18px 18px 18px; display: flex; flex-direction: column; background: #fff; border: 1px solid #0f172a; border-radius: 10px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,.45); }
          .desktop-window-title { display: flex; align-items: center; gap: 8px; background: #1e293b; color: #fff; padding: 6px 10px; }
          .desktop-window-title .spacer { flex: 1; }
          .desktop-window-title .btn { min-height: 32px; background: #334155; border-color: #475569; color: #fff; }
          .desktop-window-body { flex: 1; overflow: auto; padding: 14px; display: grid; gap: 14px; align-content: start; }
          .desktop-start { position: absolute; left: 18px; bottom: 18px; width: 300px; max-height: 70vh; overflow-y: auto; background: #0f172a; color: #e2e8f0; border: 1px solid #1e293b; border-radius: 10px; padding: 10px; z-index: 45; box-shadow: 0 20px 50px rgba(0,0,0,.5); }
          .desktop-start-head { display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #1e293b; padding-bottom: 8px; margin-bottom: 8px; }
          .desktop-start-head .start-user { flex: 1; }
          .desktop-start-menu { margin-bottom: 8px; }
          .desktop-start-foot { border-top: 1px solid #1e293b; padding-top: 8px; }
          .desktop-start .tree-row { color: #e2e8f0; }
          .desktop-start .tree-row:hover { background: #1e293b; }
          .desktop-start .tree-row.active { background: #1d4ed8; color: #fff; }
          .desktop-start .module-row .tree-label { color: #fff; font-weight: 700; }
          .desktop-taskbar { display: flex; align-items: center; gap: 10px; background: rgba(15,23,42,.95); border-top: 1px solid #1e293b; color: #e2e8f0; padding: 6px 12px; min-height: 48px; }
          .desktop-taskbar .spacer { flex: 1; }
          .desktop-taskbar .btn { min-height: 40px; background: #1e293b; border-color: #334155; color: #e2e8f0; }
          .desktop-taskbar .clock { color: #cbd5e1; }
          .taskbar-start { min-height: 40px; background: #1d4ed8; color: #fff; border: 1px solid #1d4ed8; border-radius: 8px; padding: 8px 14px; font-weight: 700; }
          /* login template */
          .login-page { min-height: 100vh; display: grid; grid-template-columns: 1fr 1fr; }
          .login-brand { background: linear-gradient(135deg,#1e3a8a,#0f172a); color: #fff; padding: 48px; display: flex; flex-direction: column; justify-content: center; gap: 12px; }
          .login-brand h1 { margin: 0; font-size: 34px; display: flex; align-items: center; gap: 10px; }
          .login-title { margin-top: 0; display: flex; align-items: center; gap: 8px; }
          .login-brand p { color: #bfdbfe; margin: 0; }
          .login-form-wrap { display: grid; place-items: center; padding: 24px; }
          .login-form { width: 360px; max-width: 100%; }
          .modal-wrap { position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,.45); display: grid; place-items: center; padding: 16px; overflow-y: auto; }
          .modal { background: #fff; border-radius: 10px; padding: 18px; width: 640px; max-width: 100%; display: grid; gap: 12px; box-shadow: 0 20px 50px rgba(0,0,0,.25); }
          .toast-err { background: #fee2e2; border: 1px solid #fecaca; color: #991b1b; padding: 10px 12px; border-radius: 8px; }
          .toast-ok { background: #dcfce7; border: 1px solid #bbf7d0; color: #166534; padding: 10px 12px; border-radius: 8px; }
          .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
          .stat { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
          .stat b { font-size: 22px; display: block; }
          .stat span { display: inline-flex; align-items: center; gap: 6px; color: #64748b; font-size: 12px; }
          .page-title { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; }
          @media (max-width: 900px) {
            .two-col { grid-template-columns: 1fr; }
            .stat-grid { grid-template-columns: 1fr; }
            .layout.std .content { padding: 12px; }
            .modal { width: 100%; }
          }
          @media (max-width: 760px) {
            .login-page { grid-template-columns: 1fr; }
            .login-brand { padding: 28px 24px; }
            .modal-wrap { padding: 0; align-items: end; }
            .modal { border-radius: 12px 12px 0 0; max-height: 92vh; overflow-y: auto; }
          }
        `}</style>
      </body>
    </html>
  );
}
