'use client';
import Link from 'next/link';
import PortalShell from '@/components/portal/PortalShell';

type Props = { appName: string };

export default function PortalHomeClient({ appName }: Props) {
  return (
    <PortalShell appName={appName}>
      <div className="v-home">
        <section className="v-hero">
          <div className="pf-wrap-inner" style={{ textAlign: 'center', padding: '60px 0 40px' }}>
            <span className="v-hero-pill">PCOFFIE</span>
            <h1>{appName}</h1>
            <p className="v-hero-sub">Sistem warnet — kelola PC, paket, billing, dan member. Portal publik warnet akan dibangun di sini.</p>
            <div style={{ marginTop: 18, display: 'inline-flex', gap: 8 }}>
              <Link href="/console" className="pf-btn" style={{ textDecoration: 'none' }}>Buka Console</Link>
              <Link href="/login" className="pf-btn pf-btn-ghost" style={{ textDecoration: 'none' }}>Masuk</Link>
            </div>
          </div>
        </section>
        <section className="v-section">
          <div className="pf-wrap-inner">
            <div className="v-card" style={{ padding: 24 }}>
              <h3 style={{ margin: 0 }}>Core siap</h3>
              <p style={{ color: '#64748b', fontSize: 13, marginTop: 6 }}>Auth, usergroup, usersetting, menu, matrix tetap aktif. Modul warnet selanjutnya: PC / paket / sesi / billing / member.</p>
            </div>
          </div>
        </section>
      </div>
    </PortalShell>
  );
}
