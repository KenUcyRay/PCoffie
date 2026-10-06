'use client';
import Link from 'next/link';
import PortalNav from '@/components/PortalNav';

type Paket = { PAKETID:number; KODE:string; NAMA:string; ZONA:string; DURASI_MENIT:number; HARGA:number; DESKRIPSI:string; SORTNO:number };
type Props = { appName: string; pakets: Paket[] };

export default function PortalHomeClient({ appName, pakets }: Props) {
  const list = Array.isArray(pakets) ? pakets : [];
  const popularId = (() => {
    if (!list.length) return null;
    const vip = list.find(p => String(p.ZONA).toUpperCase() === 'VIP');
    if (vip) return vip.PAKETID;
    return [...list].sort((a,b)=>b.HARGA-a.HARGA)[0]?.PAKETID ?? null;
  })();
  return (
    <div className="pc-dark">
      <style>{`html{scroll-behavior:smooth}`}</style>
      <PortalNav appName={appName} />

      <section id="beranda" className="pc-hero">
        <div className="pc-hero-inner">
          <div>
            <span className="pc-hero-kicker">PREMIUM GAMING EXPERIENCE</span>
            <h1 className="pc-hero-title">MAIN LEBIH SERU,<br /><em>NGOPI LEBIH SANTAI</em></h1>
            <p className="pc-hero-sub">PCoffie menghadirkan kombinasi sempurna antara PC gaming berspesifikasi tinggi dan kopi berkualitas. Tempat terbaik untuk mabar, push rank, atau sekadar bersantai dengan koneksi internet super cepat.</p>
            <div className="pc-hero-actions">
              <Link href="/reservasi" className="pc-btn-primary">Booking Sekarang →</Link>
              <Link href="/#fasilitas" className="pc-btn-ghost pc-btn-ghost-light">Lihat Fasilitas</Link>
            </div>
            <div className="pc-hero-stats">
              <span className="pc-hero-stat"><b>50+</b><span>HIGH-END PC</span></span>
              <span className="pc-hero-stat"><b>1 Gbps</b><span>INTERNET SPEED</span></span>
              <span className="pc-hero-stat"><b>24/7</b><span>OPEN HOURS</span></span>
            </div>
          </div>
          <div className="pc-hero-visual">
            <img src="https://images.unsplash.com/photo-1591488320449-011701bb6704?w=800&q=80" alt="Gaming keyboard" loading="eager" />
            <span className="pc-hero-badge">◆ Dilengkapi dengan RTX 4090</span>
          </div>
        </div>
      </section>

      <section id="fasilitas" className="pc-section">
        <div className="pc-section-head">
          <span className="pc-section-kicker">Fasilitas Kami</span>
          <h2 className="pc-section-title">PENGALAMAN GAMING LEVEL TURNAMEN</h2>
          <p className="pc-section-sub">Kami menyediakan segala yang Anda butuhkan untuk sesi gaming yang tak terlupakan. Dari hardware monster hingga kenyamanan maksimal.</p>
        </div>
        <div className="pc-grid-4">
          {[
            { t: 'PC Gaming Spek Tinggi', d: 'Dilengkapi dengan Intel i9 Gen 13, RTX 4090, dan monitor 240Hz untuk performa maksimal.', i: '🖥' },
            { t: 'Internet Cepat', d: 'Dedicated bandwidth hingga 1Gbps. Latency rendah, tanpa lag saat main game online.', i: '📶' },
            { t: 'Ruangan Nyaman ber-AC', d: 'Kursi gaming ergonomis premium dan suhu ruangan yang selalu terjaga kenyamanannya.', i: '❄' },
            { t: 'Cafe & Snack', d: 'Barista profesional siap menyajikan kopi berkualitas dan cemilan lezat menemani sesi mabar.', i: '☕' },
          ].map(c => (
            <div key={c.t} className="pc-feat">
              <span className="pc-feat-ico">{c.i}</span>
              <h3>{c.t}</h3>
              <p>{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pc-section" style={{ background: '#020617', maxWidth: 'none', margin: 0, paddingLeft: 24, paddingRight: 24 }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <span className="pc-section-kicker">Cara Booking</span>
              <h2 className="pc-section-title" style={{ textAlign: 'left', marginTop: 8 }}>PROSES BOOKING CEPAT & MUDAH</h2>
            </div>
            <a href="#" style={{ fontSize: 11, color: '#3b82f6', fontWeight: 700 }}>Lihat Tutorial Lengkap →</a>
          </div>
          <div className="pc-steps">
            {[
              { n: '01', t: 'Pilih PC', d: 'Pilih zona dan spesifikasi PC yang sesuai dengan keinginanmu, mulai dari Regular hingga VIP.', i: '🖥' },
              { n: '02', t: 'Pilih Jam', d: 'Tentukan durasi bermainmu. Tersedia paket per jam maupun paket malam yang lebih hemat.', i: '🕐' },
              { n: '03', t: 'Datang & Main', d: 'Tunjukkan bukti booking ke kasir kami, ambil kopimu, dan nikmati bermain premium.', i: '🎮' },
            ].map(s => (
              <div key={s.n} className="pc-step">
                <span className="pc-step-num">{s.n}</span>
                <span className="pc-step-ico">{s.i}</span>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="harga" className="pc-section">
        <div className="pc-section-head">
          <span className="pc-section-kicker">Daftar Harga</span>
          <h2 className="pc-section-title">PILIH PAKET GAMING KAMU</h2>
          <p className="pc-section-sub">Harga kompetitif dengan fasilitas terbaik di kelasnya. Booking lebih awal untuk menjamin ketersediaan PC favoritmu.</p>
        </div>
        {list.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#64748b', fontSize: 12, padding: 24, border: '1px dashed #1e3a5f', borderRadius: 12 }}>Belum ada paket — hubungi operator untuk input paket di Console → Paket.</div>
        ) : (
          <div className="pc-pricing">
            {list.map(p => {
              const isPopular = p.PAKETID === popularId;
              const durLabel = p.DURASI_MENIT >= 60 ? `${p.DURASI_MENIT/60} Jam` : `${p.DURASI_MENIT} Menit`;
              const ico = p.ZONA === 'VIP' ? '👑' : p.ZONA === 'VVIP' ? '🌙' : '⚡';
              return (
                <div key={p.PAKETID} className={`pc-plan${isPopular ? ' is-popular' : ''}`}>
                  {isPopular ? <span className="pc-plan-badge">TERPOPULER</span> : null}
                  <span className="pc-plan-ico" style={isPopular ? { background: '#3b82f6', color: '#fff' } : { background: 'rgba(59,130,246,.15)', color: '#3b82f6' }}>{ico}</span>
                  <h3>{p.NAMA}</h3>
                  <div className="pc-plan-price">Rp {Number(p.HARGA).toLocaleString('id-ID')} <small>/ {durLabel}</small></div>
                  <ul>
                    <li><span>{isPopular ? '●' : '○'}</span> {p.KODE} • {p.ZONA}</li>
                    <li><span>{isPopular ? '●' : '○'}</span> {durLabel}</li>
                    <li><span>{isPopular ? '●' : '○'}</span> {p.DESKRIPSI || 'Paket warnet'}</li>
                    <li><span>{isPopular ? '●' : '○'}</span> Harga per paket Rp {Number(p.HARGA).toLocaleString('id-ID')}</li>
                  </ul>
                  <Link href={`/reservasi?paket=${p.PAKETID}`} className={isPopular ? 'pc-btn-primary' : 'pc-btn-ghost'} style={{ justifyContent: 'center' }}>PILIH PAKET</Link>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="pc-cta">
        <h2>SIAP MAIN?<br /><em>BOOKING PC KAMU SEKARANG</em></h2>
        <p>Jangan biarkan squad-mu menunggu. Amankan setup gaming terbaikmu hari ini dan rasakan performa tanpa batas.</p>
        <div className="pc-cta-actions">
          <Link href="/reservasi" className="pc-btn-primary">RESERVASI ONLINE ▸</Link>
          <a href="https://wa.me/6281234567890" target="_blank" rel="noopener noreferrer" className="pc-btn-ghost">HUBUNGI WHATSAPP</a>
        </div>
      </section>

      <footer id="kontak" style={{ background: '#020617', borderTop: '1px solid #111e38', padding: '32px 24px 20px' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 28, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#fff' }}><span style={{ width: 28, height: 28, borderRadius: 8, background: '#3b82f6', display: 'grid', placeItems: 'center', fontSize: 12 }}>🎮</span>{appName}</div>
            <p style={{ marginTop: 8, fontSize: 11, color: '#64748b', lineHeight: 1.6 }}>PCoffie adalah internet cafe gaming premium untuk para gamer. Rasakan performa tanpa batas dengan fasilitas high-end kami.</p>
          </div>
          <div><div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: '#fff', marginBottom: 10 }}>TAUTAN</div><div style={{ display: 'grid', gap: 6, fontSize: 11 }}><Link href="/#beranda" style={{ color: '#64748b' }}>Beranda</Link><Link href="/#fasilitas" style={{ color: '#64748b' }}>Fasilitas</Link><Link href="/#harga" style={{ color: '#64748b' }}>Harga</Link><a href="#" style={{ color: '#64748b' }}>Syarat & Ketentuan</a></div></div>
          <div><div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: '#fff', marginBottom: 10 }}>KONTAK</div><div style={{ display: 'grid', gap: 6, fontSize: 11, color: '#64748b' }}><span>📍 Jl. Gaming No.123, Jakarta Selatan, Indonesia</span><span>📞 +62 812 3456 7890</span><span>✉ halo@pcoffie.gg</span></div></div>
          <div><div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: '#fff', marginBottom: 10 }}>IKUTI KAMI</div><div style={{ display: 'flex', gap: 8 }}><a href="#" style={{ width: 28, height: 28, borderRadius: 6, background: '#111e38', border: '1px solid #1e3a5f', display: 'grid', placeItems: 'center', color: '#64748b' }}>◯</a><a href="#" style={{ width: 28, height: 28, borderRadius: 6, background: '#111e38', border: '1px solid #1e3a5f', display: 'grid', placeItems: 'center', color: '#64748b' }}>◯</a><a href="#" style={{ width: 28, height: 28, borderRadius: 6, background: '#111e38', border: '1px solid #1e3a5f', display: 'grid', placeItems: 'center', color: '#64748b' }}>◯</a></div></div>
        </div>
        <div style={{ maxWidth: 1180, margin: '20px auto 0', paddingTop: 16, borderTop: '1px solid #111e38', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, fontSize: 10, color: '#475569' }}>
          <span>© 2026 {appName}. Seluruh hak cipta dilindungi.</span><span style={{ display: 'flex', gap: 12 }}><a href="#" style={{ color: '#475569' }}>Kebijakan Privasi</a><a href="#" style={{ color: '#475569' }}>Syarat Layanan</a></span>
        </div>
      </footer>
    </div>
  );
}
