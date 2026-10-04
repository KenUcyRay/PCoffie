'use client';

// =============================================================================
// KERANJANG MERCHANDISE
// -----------------------------------------------------------------------------
// Dikelompokkan per PENJUAL: satu pesanan hanya boleh berisi produk dari satu
// penjual, jadi satu keranjang bisa jadi beberapa pesanan. Ongkos kirim memakai
// tarif tetap dari T_SHIPPING_RATE. Endpoint dan alur tidak berubah.
// =============================================================================

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { isOk, portalPost } from '@/lib/portal/api';
import { rp } from '@/lib/portal/format';
import PortalShell from '@/components/portal/PortalShell';
import PfIcon from '@/components/portal/PfIcon';
import {
  PfAlert, PfBadge, PfButton, PfCrumbs, PfEmpty, PfError, PfField,
  PfLoadingGrid, PfQty, PfSelectWrap, useToast,
} from '@/components/portal/ui';

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
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const { toast, toastNode } = useToast();

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
    const bad: Record<string, string> = {};
    if (!addr.address.trim()) bad.address = 'Alamat pengiriman wajib diisi.';
    if (!courier) bad.courier = 'Pilih kurir terlebih dahulu.';
    setFieldErr(bad);
    if (Object.keys(bad).length) {
      document.getElementById(`pf-${Object.keys(bad)[0]}`)?.focus();
      return;
    }
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
    toast('Pesanan merchandise dibuat', 'ok');
    load();
    router.push(`/purchases/`);
  };

  const totalQty = groups.reduce((s, g) => s + g.items.reduce((a, i) => a + i.qty, 0), 0);

  return (
    <PortalShell>
      <div className="pf-col pf-gap-md">
        <PfCrumbs items={[{ label: 'Beranda', href: '/' }, { label: 'Merchandise', href: '/merch' }, { label: 'Keranjang' }]} />

        <div className="pf-row-between pf-wrapx pf-gap-sm">
          <h1 className="pf-h1">Keranjang</h1>
          <Link href={`/merch`} className="pf-btn pf-btn-soft pf-btn-sm">
            <PfIcon name="arrowLeft" size={16} /> Lanjut belanja
          </Link>
        </div>

        {msg ? <PfAlert tone="error">{msg}</PfAlert> : null}
        {error ? <PfError message={error} onRetry={load} /> : null}
        {loading ? <PfLoadingGrid count={2} /> : null}

        {!loading && !error && groups.length === 0 ? (
          <div className="pf-card">
            <PfEmpty icon="cart" title="Keranjang kosong" hint="Tambah produk dari halaman merchandise."
              action={<Link href={`/merch`} className="pf-btn pf-btn-sm">Lihat merchandise</Link>} />
          </div>
        ) : null}

        {groups.map((g) => {
          const sc = shipCost(couriers);
          const isOpen = open === g.sellerid;
          return (
            <section key={g.sellerid} className="pf-card">
              <div className="pf-card-head">
                <span className="pf-card-title">
                  <PfIcon name="building" size={20} /> Penjual: {g.sellername}
                </span>
                <PfButton variant="ghost" size="sm"
                  iconRight={isOpen ? 'chevronDown' : 'chevronRight'}
                  onClick={() => setOpen(isOpen ? null : g.sellerid)}>
                  {isOpen ? 'Tutup' : 'Checkout'}
                </PfButton>
              </div>

              <div className="pf-card-pad pf-col pf-gap-md">
                {g.items.map((i) => (
                  <div key={i.productid} className="pf-row-between pf-gap-sm pf-wrapx">
                    <div className="pf-col pf-gap-xs" style={{ minWidth: 0, flex: '1 1 140px' }}>
                      <span className="pf-sm pf-strong pf-clamp-2">{i.name}</span>
                      <span className="pf-tiny">{rp(i.price)} × {i.qty}</span>
                    </div>
                    <div className="pf-row pf-gap-sm">
                      <PfQty value={i.qty} max={99} label={`Jumlah ${i.name}`}
                        onChange={(n) => change(i.productid, n)} />
                      <strong className="pf-sm" style={{ minWidth: 88, textAlign: 'right' }}>{rp(i.amount)}</strong>
                    </div>
                  </div>
                ))}

                {isOpen ? (
                  <div className="pf-col pf-gap-md" style={{ borderTop: '1px solid var(--pf-border)', paddingTop: 'var(--pf-s4)' }}>
                    <PfField label="Nama penerima" htmlFor="pf-name">
                      <input id="pf-name" className="pf-input" value={addr.name}
                        onChange={(e) => setAddr((s) => ({ ...s, name: e.target.value }))} required />
                    </PfField>

                    <PfField label="Alamat" required htmlFor="pf-address" error={fieldErr.address}
                      hint="Tulis lengkap sampai kode pos agar pengantaran lancar.">
                      <textarea id="pf-address" className="pf-textarea" rows={3} value={addr.address}
                        onChange={(e) => { setAddr((s) => ({ ...s, address: e.target.value })); if (fieldErr.address) setFieldErr((f) => ({ ...f, address: '' })); }}
                        required />
                    </PfField>

                    <div className="pf-grid pf-grid-2">
                      <PfField label="Kota" htmlFor="pf-city">
                        <input id="pf-city" className="pf-input" value={addr.city}
                          onChange={(e) => setAddr((s) => ({ ...s, city: e.target.value }))} />
                      </PfField>
                      <PfField label="Provinsi" htmlFor="pf-prov">
                        <input id="pf-prov" className="pf-input" value={addr.province}
                          onChange={(e) => setAddr((s) => ({ ...s, province: e.target.value }))} />
                      </PfField>
                      <PfField label="Kode pos" htmlFor="pf-postal">
                        <input id="pf-postal" className="pf-input" inputMode="numeric" value={addr.postalcode}
                          onChange={(e) => setAddr((s) => ({ ...s, postalcode: e.target.value.replace(/\D/g, '') }))} />
                      </PfField>
                      <PfField label="No. HP" htmlFor="pf-phone">
                        <input id="pf-phone" className="pf-input" type="tel" inputMode="tel" placeholder="08xxxxxxxxxx"
                          value={addr.phone} onChange={(e) => setAddr((s) => ({ ...s, phone: e.target.value }))} />
                      </PfField>
                    </div>

                    <PfField label="Kurir" required htmlFor="pf-courier" error={fieldErr.courier}
                      hint="Ongkos memakai tarif tetap dari daftar kurir.">
                      <PfSelectWrap id="pf-courier" value={courier}
                        onChange={(e) => { setCourier(e.target.value); if (fieldErr.courier) setFieldErr((f) => ({ ...f, courier: '' })); }}>
                        <option value="">Pilih kurir</option>
                        {couriers.map((c) => (
                          <option key={c.COURIER} value={c.COURIER}>{c.COURIER} — {rp(c.COST)}</option>
                        ))}
                      </PfSelectWrap>
                    </PfField>

                    <dl className="pf-sum">
                      <div className="pf-sum-row"><dt>Subtotal</dt><dd>{rp(g.subtotal)}</dd></div>
                      <div className="pf-sum-row"><dt>Ongkir</dt><dd>{courier ? rp(sc) : '—'}</dd></div>
                      <div className="pf-sum-total">
                        <dt>Total</dt>
                        <dd className="pf-price pf-price-lg">{rp(g.subtotal + (courier ? sc : 0))}</dd>
                      </div>
                    </dl>

                    <PfButton block size="lg" icon="check" busy={busy} busyLabel="Membuat pesanan…"
                      disabled={!courier || !addr.address.trim()} onClick={() => checkout(g)}>
                      Buat pesanan
                    </PfButton>
                    <span className="pf-tiny">
                      Stok dikurangi saat pesanan dibuat. Pembayaran dicatat operator di Console.
                    </span>
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}

        {groups.length > 1 ? (
          <PfBadge tone="info" icon="info">
            {totalQty} item di keranjang, dibagi menjadi {groups.length} pesanan (satu per penjual).
          </PfBadge>
        ) : null}
      </div>

      {toastNode}
    </PortalShell>
  );
}