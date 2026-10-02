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
            itu di CSS = hydration error "Text content did not match ...".
            Larangan: < > & " ' (termasuk content: "" dan child selector).
            Pakai descendant selector, tanpa content, dsb. */}
        <style>{`
          /* ============ 1. DESIGN TOKEN ============ */
          :root {
            --bg: #f4f7fb;
            --surface: #ffffff;
            --surface-2: #f8fafc;
            --border: #e8edf4;
            --border-2: #dbe3ee;
            --text: #0f172a;
            --text-2: #475569;
            --muted: #64748b;
            --muted-2: #94a3b8;
            --brand: #2563eb;
            --brand-2: #1d4ed8;
            --brand-soft: #eff6ff;
            --danger: #dc2626;
            --danger-soft: #fef2f2;
            --ok: #16a34a;
            --ok-soft: #f0fdf4;
            --r-lg: 12px;
            --r: 8px;
            --r-sm: 6px;
            --sh: 0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.05);
            --sh-lg: 0 24px 64px rgba(15,23,42,.22);
            --h-ctl: 32px;
          }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: Inter, Segoe UI, system-ui, Arial, sans-serif; background: var(--bg); color: var(--text); font-size: 13px; -webkit-font-smoothing: antialiased; }
          a { color: var(--brand); text-decoration: none; }
          button { cursor: pointer; }
          :focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
          .spin { animation: icon-spin 1s linear infinite; }
          @keyframes icon-spin { to { transform: rotate(360deg); } }

          /* ============ 2. TOMBOL ============ */
          .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: var(--h-ctl); padding: 0 11px; border: 1px solid var(--border-2); border-radius: var(--r); background: var(--surface); color: var(--text-2); font-family: inherit; font-size: 12.5px; font-weight: 600; line-height: 1; white-space: nowrap; box-shadow: 0 1px 2px rgba(15,23,42,.04); transition: background .15s ease, border-color .15s ease, color .15s ease, box-shadow .15s ease; }
          .btn:hover:not(:disabled) { background: var(--surface-2); border-color: #c6d2e2; color: var(--text); }
          .btn:active:not(:disabled) { transform: translateY(1px); }
          .btn.primary { background: var(--brand); border-color: var(--brand); color: #fff; box-shadow: 0 1px 2px rgba(37,99,235,.28); }
          .btn.primary:hover:not(:disabled) { background: var(--brand-2); border-color: var(--brand-2); color: #fff; }
          .btn.danger { background: var(--surface); border-color: #f6cccc; color: var(--danger); }
          .btn.danger:hover:not(:disabled) { background: var(--danger-soft); border-color: #f0a9a9; color: #b91c1c; }
          .btn:disabled { opacity: .55; cursor: not-allowed; box-shadow: none; }
          .btn.with-icon { display: inline-flex; }
          .btn.icon-only { padding: 0 8px; min-width: 32px; }
          .btn-sm { height: 26px; padding: 0 8px; font-size: 11.5px; border-radius: var(--r-sm); }
          .btn-sm.icon-only { width: 26px; min-width: 26px; padding: 0; }
          .icon-btn { display: inline-flex; align-items: center; justify-content: center; background: transparent; border: 0; padding: 5px 7px; min-height: 32px; color: inherit; border-radius: var(--r-sm); }
          .icon-btn:hover { background: rgba(148,163,184,.18); }

          /* ============ 3. FORM ============ */
          .input, select, textarea { width: 100%; height: var(--h-ctl); border: 1px solid var(--border-2); border-radius: var(--r); padding: 0 10px; background: var(--surface); color: var(--text); font-family: inherit; font-size: 12.5px; transition: border-color .15s ease, box-shadow .15s ease; }
          textarea { height: auto; padding: 8px 10px; resize: vertical; }
          select { cursor: pointer; }
          .input::placeholder { color: var(--muted-2); }
          .input:focus, select:focus, textarea:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px rgba(37,99,235,.14); }
          .input[readonly] { background: var(--surface-2); color: var(--muted); cursor: default; }
          .field-with-icon { position: relative; display: inline-flex; align-items: center; width: 100%; max-width: 320px; }
          .field-with-icon svg { position: absolute; left: 9px; color: var(--muted-2); pointer-events: none; }
          .field-with-icon .input { padding-left: 30px; }
          .fset { border: 1px solid var(--border); border-radius: var(--r); background: var(--surface-2); padding: 10px 12px 12px; margin: 0; }
          .fset legend { display: inline-flex; align-items: center; gap: 7px; padding: 0 6px; font-size: 11.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
          .fset-grid { display: grid; gap: 9px; }
          .fset-grid label { display: grid; gap: 4px; font-size: 12px; font-weight: 600; color: var(--text-2); }

          /* ============ 4. TABEL ============ */
          .table-wrap { width: 100%; overflow-x: auto; }
          table.grid { width: 100%; border-collapse: separate; border-spacing: 0; background: var(--surface); min-width: 520px; }
          table.grid th { position: sticky; top: 0; z-index: 1; background: var(--surface-2); color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; text-align: left; padding: 8px 12px; white-space: nowrap; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
          table.grid td { padding: 8px 12px; font-size: 12.5px; color: var(--text); border-bottom: 1px solid var(--border); vertical-align: middle; }
          table.grid tbody tr:hover td { background: var(--surface-2); }
          table.grid tbody tr:last-child td { border-bottom: 0; }
          table.grid a { font-weight: 600; }
          table.grid th.dt-right { text-align: right; }
          table.grid th.dt-filter-cell { padding: 6px 8px; background: #fff; border-bottom: 1px solid var(--border); }
          table.grid tr.dt-filter-row th { position: static; border-top: 0; }
          .dt-filter { width: 100%; height: 28px; min-width: 40px; border: 1px solid var(--border-2); border-radius: var(--r-sm); padding: 0 8px; background: var(--surface); color: var(--text); font-family: inherit; font-size: 12px; }
          .dt-filter::placeholder { color: var(--muted-2); }
          .dt-filter:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 2px rgba(37,99,235,.16); }
          select.dt-filter { padding-right: 4px; cursor: pointer; }
          table.grid tbody tr.dt-active td { background: var(--brand-soft); }
          .dt-actions { display: inline-flex; align-items: center; gap: 4px; }
          table.grid td.grid-num { text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
          .toolbar.bbar { justify-content: flex-end; }
          .toolbar.bbar .count { color: var(--muted); font-size: 12px; }
          .toolbar.bbar .pageinfo { color: var(--text-2); font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
          .toolbar .panel-title { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 700; }
          .toolbar .panel-title svg { color: var(--brand); }
          .form-field { display: grid; gap: 4px; font-size: 12px; font-weight: 600; color: var(--text-2); }
          .empty-cell { display: flex; align-items: center; justify-content: center; gap: 9px; padding: 30px 14px; color: var(--muted-2); font-size: 12.5px; }
          .badge { display: inline-flex; align-items: center; gap: 5px; height: 19px; padding: 0 8px; border-radius: 999px; font-size: 10.5px; font-weight: 700; letter-spacing: .02em; }
          .badge.ok { background: var(--ok-soft); color: var(--ok); }
          .badge.off { background: var(--surface-2); color: var(--muted); }

          /* ============ 5. AREA KERJA ============ */
          .layout.std { display: flex; min-height: 100vh; }
          .main { flex: 1; display: flex; flex-direction: column; min-width: 0; height: 100vh; background: var(--bg); }
          .content { flex: 1; overflow: auto; padding: 16px 18px 22px; display: grid; gap: 12px; align-content: start; }
          .page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 0 2px; }
          .page-head-info { min-width: 0; display: grid; gap: 2px; }
          .page-title { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 17px; font-weight: 700; letter-spacing: -.01em; color: var(--text); }
          .page-title svg { color: var(--brand); }
          .page-sub { margin: 0; font-size: 12px; color: var(--muted); }
          .page-head-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
          .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); box-shadow: var(--sh); padding: 0; overflow: hidden; }
          .card-body { padding: 14px 16px; display: grid; gap: 12px; }
          .card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 10px 14px; border-bottom: 1px solid var(--border); background: linear-gradient(180deg,#ffffff,#fbfcfe); }
          .card-head b { font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 7px; }
          .card-head svg { color: var(--brand); }
          .two-col { display: grid; grid-template-columns: 320px 1fr; gap: 12px; align-items: stretch; height: calc(100vh - 170px); min-height: 400px; }
          .two-col .card { display: flex; flex-direction: column; min-height: 0; height: 100%; }
          .two-col .grid-box { display: flex; flex-direction: column; flex: 1; min-height: 0; }
          .two-col .card-body { flex: 1; min-height: 0; overflow-y: auto; }
          .grid-box { display: block; }
          .card-grid { display: flex; flex-direction: column; height: calc(100vh - 170px); min-height: 400px; }
          .card-grid .grid-box { flex: 1; min-height: 0; display: flex; flex-direction: column; }
          .card-grid .table-wrap { flex: 1; min-height: 0; overflow: auto; }
          .toolbar { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
          .card .toolbar:first-child, .grid-box .toolbar:first-child { padding: 10px 14px; border-bottom: 1px solid var(--border); background: linear-gradient(180deg,#ffffff,#fbfcfe); }
          .grid-box .toolbar:last-child { padding: 8px 14px; border-top: 1px solid var(--border); background: var(--surface-2); }
          .toolbar .spacer { flex: 1; }
          .loading-hint, .empty-hint { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }

          /* ============ 6. SIDEBAR (lihat components/Sidebar.tsx) ============ */
          .sb { position: sticky; top: 0; height: 100vh; width: 264px; flex: none; background: #0f1729; color: #cbd5e1; display: flex; flex-direction: column; overflow: hidden; transition: width 240ms cubic-bezier(.4,0,.2,1); }
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
          .sb-collapsed .sb-group-label { display: none; }
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
          .sb-collapsed .sb-label, .sb-collapsed .sb-chev { opacity: 0; }
          .sb-collapsed .sb-pinfo, .sb-collapsed .sb-pchev { display: none; }
          .sb-sub { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 220ms cubic-bezier(.4,0,.2,1); }
          .sb-sub.open { grid-template-rows: 1fr; }
          .sb-sub-inner { overflow: hidden; }
          .sb-collapsed .sb-sub { display: none; }
          .sb-empty { display: flex; align-items: center; gap: 8px; margin: 8px 0 0; padding: 0 10px; font-size: 12px; color: #64748b; white-space: nowrap; }
          .sb-foot { position: relative; flex: none; border-top: 1px solid rgba(255,255,255,.07); padding: 10px 12px; }
          .sb-profile { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 0; border: 0; border-radius: 10px; background: transparent; color: inherit; text-align: left; cursor: pointer; overflow: hidden; }
          .sb-profile:hover { background: rgba(255,255,255,.06); }
          .sb-avcol { width: 40px; flex: none; display: inline-flex; align-items: center; justify-content: center; }
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
            .sb, .sb-sub, .sb-chev, .sb-logo-app, .sb-logo-tog, .sb-label, .sb-pinfo, .sb-pchev, .sb-group-label, .btn { transition: none; }
          }

          /* ============ 7. TOPBAR / TAB / BOTTOMBAR ============ */
          .tabbar { display: flex; align-items: stretch; background: var(--surface); border-bottom: 1px solid var(--border); overflow-x: auto; }
          .toggle-side { color: var(--text-2); border-right: 1px solid var(--border); }
          .tab { display: inline-flex; align-items: center; border-right: 1px solid var(--border); background: var(--surface); }
          .tab:hover { background: var(--surface-2); }
          .tab.active { background: var(--brand-soft); box-shadow: inset 0 -2px 0 var(--brand); }
          .tab-label { background: transparent; border: 0; padding: 0 12px; min-height: 38px; font-family: inherit; font-size: 12.5px; font-weight: 600; color: var(--muted); }
          .tab.active .tab-label { color: var(--brand); }
          .tab-x { background: transparent; border: 0; color: var(--muted-2); padding: 0 8px; min-height: 38px; display: inline-flex; align-items: center; justify-content: center; border-radius: var(--r-sm); }
          .tab-x:hover { color: var(--danger); background: var(--danger-soft); }
          .topbar-title { display: none; align-items: center; padding: 0 12px; font-size: 15px; font-weight: 700; color: var(--text); white-space: nowrap; }
          @media (max-width: 768px) { .topbar-title { display: inline-flex; } }
          .bottombar { display: flex; align-items: center; gap: 10px; background: var(--surface); border-top: 1px solid var(--border); padding: 6px 16px; }
          .bottombar .spacer { flex: 1; }
          .clock { text-align: right; font-size: 12px; color: var(--muted); line-height: 1.35; font-variant-numeric: tabular-nums; }
          .dropdown { position: absolute; bottom: 100%; left: 0; z-index: 40; min-width: 180px; overflow: hidden; background: var(--surface); border: 1px solid var(--border-2); border-radius: var(--r); box-shadow: var(--sh-lg); }
          .dropdown.down { bottom: auto; top: 100%; left: auto; right: 0; }
          .dropdown-item { display: block; width: 100%; text-align: left; background: transparent; border: 0; padding: 8px 11px; font-family: inherit; font-size: 12.5px; color: var(--text-2); }
          .dropdown-item.with-icon { display: flex; align-items: center; gap: 9px; }
          .dropdown-item:hover { background: var(--surface-2); color: var(--text); }
          .dropdown-item.current { font-weight: 700; color: var(--brand); background: var(--brand-soft); }
          .mode-compact { min-height: 40px; }

          /* ============ 8. MODAL ============ */
          .modal-layer { position: fixed; inset: 0; }
          .modal-wrap { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 18px; overflow: hidden; background: rgba(15,23,42,.5); backdrop-filter: blur(3px); }
          .modal { display: flex; flex-direction: column; min-width: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--sh-lg); overflow: hidden; }
          .modal-head { display: flex; align-items: center; gap: 8px; flex: none; padding: 11px 14px; border-bottom: 1px solid var(--border); background: linear-gradient(180deg,#ffffff,#fbfcfe); font-size: 13.5px; font-weight: 700; }
          .modal-head svg { color: var(--brand); }
          .modal-body { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; }
          .modal-foot { display: flex; gap: 6px; align-items: center; flex: none; padding: 9px 14px; border-top: 1px solid var(--border); background: var(--surface-2); }
          .modal-foot .spacer { flex: 1; }
          .confirm-layer { position: fixed; inset: 0; z-index: 200; }
          .confirm-msg { display: flex; gap: 10px; align-items: flex-start; margin: 2px 0; font-size: 13px; color: var(--text); }
          .confirm-msg svg { flex: none; margin-top: 1px; }
          .confirm-msg.info svg { color: var(--brand); }
          .confirm-msg.danger svg { color: var(--danger); }
          .modal-toolbar { display: flex; gap: 6px; align-items: center; flex: none; }
          .modal-toolbar .input { width: auto; flex: 1; }
          .modal-toolbar .field-with-icon { flex: 1; max-width: none; }
          .frm-foot-gap { flex: 1; }
          .frm-set { border: 1px solid var(--border); border-radius: var(--r); background: var(--surface-2); padding: 8px 10px 10px; margin: 0; flex: none; }
          .frm-set legend { display: inline-flex; align-items: center; gap: 6px; padding: 0 5px; font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); }
          .frm-grid { display: grid; gap: 7px 12px; }
          .frm-row { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 8px; align-items: center; font-size: 12px; font-weight: 600; color: var(--text-2); }
          .frm-row span:first-child { text-align: right; }

          /* ============ 9. TOAST + ALERT ============ */
          .toast-host { position: fixed; top: 16px; right: 16px; z-index: 60; display: grid; gap: 10px; width: 330px; max-width: calc(100vw - 32px); }
          .toast-item { display: flex; align-items: flex-start; gap: 9px; padding: 10px 12px; border-radius: 10px; box-shadow: var(--sh-lg); }
          .toast-item svg { margin-top: 1px; }
          .toast-host b { display: block; margin-bottom: 2px; font-size: 12.5px; }
          .toast-item div { font-size: 12px; line-height: 1.45; }
          .toast-ok { background: var(--ok-soft); border: 1px solid #bbf7d0; color: #15803d; }
          .toast-err { background: var(--danger-soft); border: 1px solid #fecaca; color: #b91c1c; padding: 11px 14px; border-radius: var(--r); }
          .alert-inline { display: flex; align-items: flex-start; gap: 9px; }

          /* ============ 10. HOME / STAT ============ */
          .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
          .stat { position: relative; display: grid; gap: 4px; padding: 13px 15px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); box-shadow: var(--sh); }
          .stat span { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 11.5px; font-weight: 600; }
          .stat span svg { color: var(--brand); }
          .stat b { font-size: 17px; font-weight: 700; letter-spacing: -.01em; overflow: hidden; text-overflow: ellipsis; }
          .menu-list { display: grid; gap: 12px; }
          .menu-group { display: grid; gap: 6px; }
          .menu-group-head { display: flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 700; color: var(--text); }
          .menu-group-head svg { color: var(--brand); }
          .menu-group ul { margin: 0; padding: 0 0 0 20px; list-style: none; display: grid; gap: 4px; font-size: 12px; color: var(--muted); }
          .menu-group li { display: flex; align-items: center; gap: 8px; }

          /* ============ 11. SCROLLBAR HALUS ============ */
          .content::-webkit-scrollbar, .sb-nav::-webkit-scrollbar, .table-wrap::-webkit-scrollbar, .modal::-webkit-scrollbar { width: 10px; height: 10px; }
          .content::-webkit-scrollbar-thumb, .sb-nav::-webkit-scrollbar-thumb, .table-wrap::-webkit-scrollbar-thumb, .modal::-webkit-scrollbar-thumb { background: rgba(100,116,139,.3); border-radius: 999px; border: 3px solid transparent; background-clip: padding-box; }
          .content::-webkit-scrollbar-thumb:hover, .table-wrap::-webkit-scrollbar-thumb:hover { background: rgba(100,116,139,.5); background-clip: padding-box; }
          .sb-nav::-webkit-scrollbar-thumb { background: rgba(148,163,184,.3); background-clip: padding-box; }

          /* ============ 12. DESKTOP SHELL (mode_desktop) ============ */
          .menutree { display: grid; gap: 2px; }
          ul.tree { list-style: none; margin: 0; padding-left: 14px; }
          .tree-row { display: flex; align-items: center; gap: 6px; width: 100%; background: transparent; border: 0; color: #e2e8f0; text-align: left; padding: 8px 9px; border-radius: var(--r-sm); min-height: 34px; }
          .tree-row:hover { background: #1e293b; }
          .tree-row.active { background: var(--brand); color: #fff; }
          .module-row .tree-label { font-weight: 700; color: #fff; }
          .tree-caret { width: 14px; flex: none; color: #94a3b8; font-size: 11px; display: inline-flex; align-items: center; justify-content: center; }
          .tree-caret.leaf { color: transparent; }
          .tree-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .akses-mods { display: grid; gap: 8px; }
          .akses-mod { border: 1px solid var(--border); border-radius: var(--r); overflow: hidden; background: var(--surface); }
          .akses-mod-head { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: var(--surface-2); border-bottom: 1px solid var(--border); }
          .akses-mod-title { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; background: transparent; border: 0; padding: 4px 2px; font-size: 13px; font-weight: 700; color: var(--text); cursor: pointer; text-align: left; }
          .akses-mod-title svg { flex: none; color: var(--brand); }
          .akses-count { margin-left: auto; flex: none; font-size: 11px; font-weight: 700; color: var(--muted); background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; }
          .akses-chev { flex: none; display: inline-flex; color: var(--muted); }
          .akses-chev.closed svg { transform: rotate(-90deg); }
          .akses-mod-body { padding: 6px 10px 10px; }
          .akses-tree { list-style: none; margin: 0; padding-left: 20px; }
          .akses-tree.root { padding-left: 0; }
          .akses-row { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: var(--r-sm); font-size: 12.5px; color: var(--text); cursor: pointer; }
          .akses-row:hover { background: var(--surface-2); }
          .akses-row svg { flex: none; color: var(--muted); }
          .layout.desktop { min-height: 100vh; display: flex; flex-direction: column; background: linear-gradient(135deg,#0f172a,#1e293b 60%,#0b1220); }
          .desktop-area { flex: 1; position: relative; padding: 18px; overflow: hidden; }
          .desktop-window { position: absolute; inset: 18px 18px 18px 18px; display: flex; flex-direction: column; background: var(--bg); border: 1px solid #0f172a; border-radius: 16px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,.45); }
          .desktop-window-title { display: flex; align-items: center; gap: 8px; background: #1e293b; color: #fff; padding: 7px 12px; }
          .desktop-window-title .spacer { flex: 1; }
          .desktop-window-title .btn { min-height: 32px; background: #334155; border-color: #475569; color: #fff; }
          .desktop-window-body { flex: 1; overflow: auto; padding: 16px; display: grid; gap: 14px; align-content: start; }
          .desktop-start { position: absolute; left: 18px; bottom: 18px; width: 300px; max-height: 70vh; overflow-y: auto; background: #0f1729; color: #e2e8f0; border: 1px solid #1e293b; border-radius: 14px; padding: 10px; z-index: 45; box-shadow: 0 20px 50px rgba(0,0,0,.5); }
          .desktop-start-head { display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #1e293b; padding-bottom: 8px; margin-bottom: 8px; }
          .desktop-start-head .start-user { flex: 1; }
          .desktop-start-menu { margin-bottom: 8px; }
          .desktop-start-foot { border-top: 1px solid #1e293b; padding-top: 8px; }
          .desktop-start .tree-row { color: #e2e8f0; }
          .desktop-start .tree-row:hover { background: #1e293b; }
          .desktop-start .tree-row.active { background: var(--brand); color: #fff; }
          .desktop-start .module-row .tree-label { color: #fff; font-weight: 700; }
          .desktop-taskbar { display: flex; align-items: center; gap: 10px; background: rgba(15,23,42,.95); border-top: 1px solid #1e293b; color: #e2e8f0; padding: 8px 16px; min-height: 50px; }
          .desktop-taskbar .spacer { flex: 1; }
          .desktop-taskbar .btn { min-height: 40px; background: #1e293b; border-color: #334155; color: #e2e8f0; }
          .desktop-taskbar .clock { color: #cbd5e1; }
          .taskbar-start { min-height: 40px; background: var(--brand); color: #fff; border: 1px solid var(--brand); border-radius: var(--r); padding: 0 15px; font-weight: 700; }

          /* ============ 13. LOGIN ============ */
          .login-page { min-height: 100vh; display: grid; grid-template-columns: 1fr 1fr; background: var(--bg); }
          .login-brand { display: flex; flex-direction: column; justify-content: center; gap: 14px; padding: 52px; color: #fff; background: radial-gradient(1200px 600px at 20% 10%, #1e40af 0%, #0f172a 60%, #0b1220 100%); }
          .login-brand h1 { display: flex; align-items: center; gap: 11px; margin: 0; font-size: 34px; font-weight: 700; letter-spacing: -.02em; }
          .login-brand p { margin: 0; color: #bfdbfe; }
          .login-form-wrap { display: grid; place-items: center; padding: 24px; }
          .login-form { width: 380px; max-width: 100%; display: grid; gap: 10px; padding: 22px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--sh-lg); }
          .login-title { display: flex; align-items: center; gap: 8px; margin: 0 0 4px; font-size: 17px; font-weight: 700; }
          .login-title svg { color: var(--brand); }

          /* ============ 14. RESPONSIF ============ */
          @media (max-width: 1100px) { .two-col { grid-template-columns: 300px 1fr; } }
          @media (max-width: 900px) {
            .two-col { grid-template-columns: 1fr; height: auto; }
            .two-col .card-body { max-height: 70vh; }
            .stat-grid { grid-template-columns: 1fr; }
            .content { padding: 16px; }
            .modal { width: 100%; }
          }
          @media (max-width: 768px) {
            .input, select, textarea { font-size: 16px; }
            .page-title { font-size: 18px; }
          }
          @media (max-width: 760px) {
            .login-page { grid-template-columns: 1fr; }
            .login-brand { padding: 28px 24px; }
            .modal-wrap { padding: 0; align-items: end; }
            .modal { border-radius: 16px 16px 0 0; max-height: 94vh; width: 100%; }
          }
        `}</style>
      </body>
    </html>
  );
}