'use client';

// Keranjang merchandise. Dikelompokkan per PENJUAL: satu pesanan hanya boleh
// berisi produk dari satu penjual, jadi satu keranjang bisa jadi beberapa
// pesanan. Ongkos kirim memakai tarif tetap dari T_SHIPPING_RATE.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { BASE_PATH } from '@/lib/app-config';
import { isOk, portalPost } from '@/lib/portal/api';
import { rp } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import { PfEmpty, PfError, PfLoading } from '@/components/portal/ui';

type Line = { productid: number; name: string; price: number; qty: number; amount: number };
type Group = { sellerid: number; sellername: string; items: Line[]; subtotal: number };
type Courier = { COURIER: string; COST: number; ESTIMATEHOURS: number; NOTE?: string };

export default function CartPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [courier, setCourier] = useState('');
  const [addr, setAddr] = useState({ address: '', city: '', province: '', postalcode: '', phone: '', name: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r: any = await portalPost('portal/cart', { action: 'list' });
      if (!isOk(r)) {
        setError(String(r?.message || 'Gagal memuat keranjang.'));
        if (String(r?.message || '').includes('Silakan masuk')) router.push(`/login/?next=${encodeURIComponent('/cart/')}`);
        return;
      }
      setGroups((r.cart as Group[]) || []);
      setOpen((r.cart as Group[])?.length ? (r.cart as Group[])[0].sellerid : null);
    } catch (e: any) {
      setError(e?.message || 'Silakan masuk terlebih dahulu.');
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    portalPost('portal/public/couriers', {}, { auth: false })
      .then((r) => { if (isOk(r)) setCouriers((r.rows as Courier[]) || []); })
      .catch(() => {});
    portalPost('portal/profile', { action: 'read' })
      .then((r) => { if (isOk(r)) setAddr((s) => ({ ...s, name: String(r?.profile?.USERNAME || '') })); })
      .catch(() => {});
  }, []);

  const change = async (productid: number, qty: number) => {
    const r: any = await portalPost('portal/cart', { action: qty <= 0 ? 'remove' : 'update', productid, qty });
    if (isOk(r)) setGroups((r.cart as Group[]) || []);
    else setMsg(String(r?.message || 'Gagal memperbarui keranjang.'));
  };

  const shipCost = (c: Courier[]) => c.find((x) => x.COURIER === courier)?.COST || 0;

  const checkout = async (g: Group) => {
    setBusy(true);
    setMsg('');
    const r: any = await portalPost('portal/merch/order', {
      sellerid: g.sellerid,
      courier,
      address: addr.address, city: addr.city, province: addr.province,
      postalcode: addr.postalcode, phone: addr.phone, name: addr.name,
    });
    setBusy(false);
    if (!isOk(r)) { setMsg(String(r?.message || 'Pesanan gagal dibuat.')); return; }
    load();
    router.push(`/purchases/`);
  };

  const totalQty = groups.reduce((s, g) => s + g.items.reduce((a, i) => a + i.qty, 0), 0);

  return (
    <PortalShell>
      <div className="pf-col" style={{ gap: 14 }}>
        <div className="pf-row-between">
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 850, letterSpacing: '-.02em' }}>Keranjang</h1>
          <Link href={`/merch`} className="pf-btn pf-btn-sm">Lanjut belanja</Link>
        </div>

        {msg ? <div className="pf-alert pf-alert-error">{msg}</div> : null}
        {error ? <PfError message={error} onRetry={load} /> : null}
        {loading ? <PfLoading /> : null}
        {!loading && !error && groups.length === 0 ? (
          <PfEmpty title="Keranjang kosong" hint="Tambah produk dari halaman merchandise."
            action={<Link href={`/merch`} className="pf-btn pf-btn-sm">Lihat merchandise</Link>} />
        ) : null}

        {groups.map((g) => {
          const sc = shipCost(couriers);
          const isOpen = open === g.sellerid;
          return (
            <div key={g.sellerid} className="pf-card">
              <div className="pf-card-head">
                <span className="pf-card-title">Penjual: {g.sellername}</span>
                <button className="pf-btn pf-btn-ghost pf-btn-sm" type="button" onClick={() => setOpen(isOpen ? null : g.sellerid)}>
                  {isOpen ? 'Tutup' : 'Checkout'}
                </button>
              </div>
              <div className="pf-card-pad pf-col" style={{ gap: 10 }}>
                {g.items.map((i) => (
                  <div key={i.productid} className="pf-row-between">
                    <div className="pf-col" style={{ gap: 2 }}>
                      <span style={{ fontWeight: 650, fontSize: 14 }}>{i.name}</span>
                      <span className="pf-tiny">{rp(i.price)} × {i.qty}</span>
                    </div>
                    <div className="pf-row pf-gap-sm">
                      <div className="pf-qty">
                        <button type="button" onClick={() => change(i.productid, i.qty - 1)}>−</button>
                        <span>{i.qty}</span>
                        <button type="button" onClick={() => change(i.productid, i.qty + 1)}>+</button>
                      </div>
                      <span style={{ fontWeight: 700, minWidth: 90, textAlign: 'right' }}>{rp(i.amount)}</span>
                    </div>
                  </div>
                ))}

                {isOpen && (
                  <div className="pf-col" style={{ gap: 12, borderTop: '1px solid var(--pf-border)', paddingTop: 12 }}>
                    <label className="pf-field"><span className="pf-label">Nama penerima</span>
                      <input className="pf-input" value={addr.name} onChange={(e) => setAddr((s) => ({ ...s, name: e.target.value }))} required /></label>
                    <label className="pf-field"><span className="pf-label">Alamat *</span>
                      <textarea className="pf-textarea" rows={2} value={addr.address} onChange={(e) => setAddr((s) => ({ ...s, address: e.target.value }))} required /></label>
                    <div className="pf-row pf-gap-sm pf-wrapx">
                      <input className="pf-input" style={{ flex: 1, minWidth: 140 }} placeholder="Kota" value={addr.city} onChange={(e) => setAddr((s) => ({ ...s, city: e.target.value }))} />
                      <input className="pf-input" style={{ flex: 1, minWidth: 140 }} placeholder="Provinsi" value={addr.province} onChange={(e) => setAddr((s) => ({ ...s, province: e.target.value }))} />
                      <input className="pf-input" style={{ width: 120 }} placeholder="Kode pos" value={addr.postalcode} onChange={(e) => setAddr((s) => ({ ...s, postalcode: e.target.value }))} />
                      <input className="pf-input" style={{ width: 150 }} placeholder="No. HP" value={addr.phone} onChange={(e) => setAddr((s) => ({ ...s, phone: e.target.value }))} />
                    </div>
                    <label className="pf-field">
                      <span className="pf-label">Kurir (ongkir tarif tetap)</span>
                      <select className="pf-select" value={courier} onChange={(e) => setCourier(e.target.value)} required>
                        <option value="">Pilih kurir</option>
                        {couriers.map((c) => <option key={c.COURIER} value={c.COURIER}>{c.COURIER} — {rp(c.COST)}</option>)}
                      </select>
                    </label>

                    <div className="pf-row-between"><span className="pf-dim">Subtotal</span><span>{rp(g.subtotal)}</span></div>
                    <div className="pf-row-between"><span className="pf-dim">Ongkir</span><span>{courier ? rp(sc) : '-'}</span></div>
                    <div className="pf-row-between" style={{ borderTop: '1px solid var(--pf-border)', paddingTop: 8 }}>
                      <strong>Total</strong><strong className="pf-price" style={{ fontSize: 18 }}>{rp(g.subtotal + (courier ? sc : 0))}</strong>
                    </div>
                    <button className="pf-btn pf-btn-block" type="button" disabled={busy || !courier || !addr.address.trim()} onClick={() => checkout(g)}>
                      {busy ? 'Membuat pesanan…' : 'Buat pesanan'}
                    </button>
                    <span className="pf-tiny">Stok dikurangi saat pesanan dibuat. Pembayaran dicatat operator di Console.</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {groups.length > 1 && (
          <span className="pf-tiny">{totalQty} item di keranjang, dibagi menjadi {groups.length} pesanan (satu per penjual).</span>
        )}
      </div>
    </PortalShell>
  );
}