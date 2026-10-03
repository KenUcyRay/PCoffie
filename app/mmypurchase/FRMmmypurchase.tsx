// Padanan FRM pesanan: wizard 5 langkah (penjual -> produk -> pembeli ->
// kurir -> ringkasan). Kalau dibuka dari Product List, penjual + produk
// sudah terisi. Total dihitung backend; frontend hanya pratinjau.
// Form ini dibuka lewat Modal (useModal), padanan window ExtJS.
'use client';
import { useEffect, useRef, useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { formatIDR } from './Cmmypurchase';
import { read_sellers, read_products, process_create } from './api';

const COURIERS = ['JNE', 'J&T', 'SiCepat', 'AnterAja', 'Pos Indonesia', 'Lainnya'];

type SellerOpt = { SELLERID: number; SHOPNAME?: string };
type ProductOpt = {
  PRODUCTID: number; NAME?: string; PRICE?: number | string;
  STOCK?: number | string; CONDITION?: string;
};

type FieldErrors = Record<string, string | undefined>;

const STEPS = ['Penjual', 'Produk', 'Pembeli', 'Kurir', 'Ringkasan'];

export default function FRMmmypurchase({ onSaved }: { onSaved: () => void }) {
  const { close } = useModal();
  const [step, setStep] = useState(0);
  const [sellers, setSellers] = useState<SellerOpt[]>([]);
  const [sellerId, setSellerId] = useState('');
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [buyer, setBuyer] = useState({ name: '', phone: '', email: '', address: '', city: '', province: '', postal: '' });
  const [courier, setCourier] = useState('JNE');
  const [shipping, setShipping] = useState('');
  const [note, setNote] = useState('');
  const [errs, setErrs] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  // Idempotency: satu kunci per wizard (klik ganda = satu pesanan).
  const idemKey = useRef(`${Date.now()}-${Math.floor(Math.random() * 1000000)}`);

  // Preselect dari Product List (penjual + produk sudah terisi).
  useEffect(() => {
    (async () => {
      try {
        const res: any = await read_sellers();
        if (parseBoolean(res?.success)) setSellers(res.Rows || []);
      } catch { /* abaikan */ }
      try {
        const raw = window.sessionStorage.getItem('tiket-app::order-pick');
        window.sessionStorage.removeItem('tiket-app::order-pick');
        if (raw) {
          const pick = JSON.parse(raw) as { sellerid?: number; productid?: number };
          if (pick.sellerid) {
            setSellerId(String(pick.sellerid));
            const pr: any = await read_products(pick.sellerid);
            if (parseBoolean(pr?.success)) {
              setProducts(pr.Rows || []);
              if (pick.productid) setCart({ [pick.productid]: 1 });
            }
            setStep(1);
          }
        }
      } catch { /* abaikan */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickSeller = async (sid: string) => {
    setSellerId(sid);
    setCart({});
    setProducts([]);
    if (!sid) return;
    try {
      const res: any = await read_products(Number(sid));
      if (parseBoolean(res?.success)) setProducts(res.Rows || []);
      else toast('Error', res?.message || 'Gagal memuat produk.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  };

  const setQty = (pid: number, qty: number, stock: number) => {
    const q = Math.max(0, Math.min(Math.floor(qty) || 0, stock));
    setCart((c) => {
      const next = { ...c };
      if (q <= 0) delete next[pid];
      else next[pid] = q;
      return next;
    });
  };

  const cartLines = Object.keys(cart)
    .map((k) => {
      const p = products.find((x) => x.PRODUCTID === Number(k));
      if (!p) return null;
      return { ...p, qty: cart[Number(k)] };
    })
    .filter(Boolean) as (ProductOpt & { qty: number })[];
  const subtotal = cartLines.reduce((s, l) => s + Number(l.PRICE || 0) * l.qty, 0);

  const setB = (k: keyof typeof buyer, v: string) => {
    setBuyer((b) => ({ ...b, [k]: v }));
    setErrs((e) => ({ ...e, [k]: undefined }));
  };

  const validateStep = (): boolean => {
    const e: FieldErrors = {};
    if (step === 0) {
      if (!sellerId) { toast('Error', 'Pilih penjual dulu.', 'err'); return false; }
    } else if (step === 1) {
      if (!cartLines.length) { toast('Error', 'Pilih minimal satu produk.', 'err'); return false; }
    } else if (step === 2) {
      if (!buyer.name.trim()) e.name = 'Nama pembeli wajib diisi.';
      if (buyer.phone.trim() && !/^[0-9+\-\s]+$/.test(buyer.phone.trim())) e.phone = 'Telepon hanya boleh angka, plus, spasi, dan strip.';
      if (buyer.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.email.trim())) e.email = 'Format email tidak valid.';
      if (!buyer.address.trim()) e.address = 'Alamat wajib diisi.';
    } else if (step === 3) {
      if (!COURIERS.includes(courier)) { toast('Error', 'Pilih kurir.', 'err'); return false; }
      if (shipping.trim() === '' || Number.isNaN(Number(shipping)) || Number(shipping) < 0) {
        e.shipping = 'Ongkos kirim wajib diisi dan tidak negatif.';
      }
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const next = () => { if (validateStep()) setStep((s) => Math.min(4, s + 1)); };
  const prev = () => setStep((s) => Math.max(0, s - 1));

  const save = async () => {
    if (!validateStep()) return;
    if (!await confirmDialog({ message: `Buat pesanan (${cartLines.length} item, total ${formatIDR(subtotal + Number(shipping || 0))})?` })) return;
    setBusy(true);
    try {
      const res: any = await process_create({
        SELLERID: Number(sellerId),
        BUYERNAME: buyer.name.trim(),
        BUYERPHONE: buyer.phone.trim(),
        BUYEREMAIL: buyer.email.trim(),
        ADDRESS: buyer.address.trim(),
        CITY: buyer.city.trim(),
        PROVINCE: buyer.province.trim(),
        POSTALCODE: buyer.postal.trim(),
        COURIER: courier,
        SHIPPING: shipping.trim(),
        NOTE: note.trim(),
        ITEMS: cartLines.map((l) => ({ PRODUCTID: l.PRODUCTID, QTY: l.qty })),
        IDEMPOTENCYKEY: idemKey.current,
      });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Pesanan dibuat.', 'ok');
        onSaved();
        close();
      } else toast('Error', res?.message || 'Gagal membuat pesanan.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title={`Buat Pesanan (${step + 1}/5: ${STEPS[step]})`}
      icon="add"
      width="640px"
      footer={
        <>
          {step > 0 && <Btn icon="arrowL" disabled={busy} onClick={prev}>Kembali</Btn>}
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
          {step < 4 && <Btn className="primary" icon="arrowR" disabled={busy} onClick={next}>Lanjut</Btn>}
          {step === 4 && (
            <Btn pid="btsave" className="primary" icon="save" disabled={busy} onClick={save}>
              {busy ? 'Menyimpan…' : 'Simpan Pesanan'}
            </Btn>
          )}
        </>
      }
    >
      {step === 0 && (
        <FrmSet legend="Penjual" icon="dept" columns={1}>
          <FrmRow label="Penjual">
            <select value={sellerId} onChange={(e) => pickSeller(e.target.value)}>
              <option value="">Pilih penjual</option>
              {sellers.map((s) => <option key={s.SELLERID} value={s.SELLERID}>{s.SHOPNAME}</option>)}
            </select>
          </FrmRow>
        </FrmSet>
      )}
      {step === 1 && (
        <FrmSet legend="Produk" icon="box" columns={1}>
          {products.length === 0 && (
            <p className="empty-hint"><Icon name="box" size={16} /> Tidak ada produk layak jual.</p>
          )}
          {products.map((p) => {
            const stock = Number(p.STOCK) || 0;
            const qty = cart[p.PRODUCTID] || 0;
            return (
              <div key={p.PRODUCTID} className="toolbar" style={{ flexWrap: 'wrap' }}>
                <span style={{ flex: 1, minWidth: 160 }}>
                  <b>{p.NAME}</b> <span className="loading-hint">{formatIDR(p.PRICE)} • stok {stock} • {p.CONDITION}</span>
                </span>
                <Btn
                  className="btn-sm" iconOnly icon="minus" aria-label="Kurangi"
                  disabled={qty <= 0} onClick={() => setQty(p.PRODUCTID, qty - 1, stock)}
                />
                <span style={{ minWidth: 28, textAlign: 'center' }}><b>{qty}</b></span>
                <Btn
                  className="btn-sm" iconOnly icon="add" aria-label="Tambah"
                  disabled={qty >= stock} onClick={() => setQty(p.PRODUCTID, qty + 1, stock)}
                />
              </div>
            );
          })}
        </FrmSet>
      )}
      {step === 2 && (
        <FrmSet legend="Pembeli" icon="user" columns={2}>
          <FrmRow label="Nama">
            <div>
              <input className="input" value={buyer.name} onChange={(e) => setB('name', e.target.value)} maxLength={100} />
              {errs.name && <span className="field-err">{errs.name}</span>}
            </div>
          </FrmRow>
          <FrmRow label="Telepon">
            <div>
              <input className="input" value={buyer.phone} onChange={(e) => setB('phone', e.target.value)} maxLength={30} />
              {errs.phone && <span className="field-err">{errs.phone}</span>}
            </div>
          </FrmRow>
          <FrmRow label="Email">
            <div>
              <input className="input" value={buyer.email} onChange={(e) => setB('email', e.target.value)} maxLength={100} />
              {errs.email && <span className="field-err">{errs.email}</span>}
            </div>
          </FrmRow>
          <FrmRow label="Alamat">
            <div>
              <textarea className="input" rows={2} value={buyer.address} onChange={(e) => setB('address', e.target.value)} maxLength={500} />
              {errs.address && <span className="field-err">{errs.address}</span>}
            </div>
          </FrmRow>
          <FrmRow label="Kota">
            <input className="input" value={buyer.city} onChange={(e) => setB('city', e.target.value)} maxLength={100} />
          </FrmRow>
          <FrmRow label="Provinsi">
            <input className="input" value={buyer.province} onChange={(e) => setB('province', e.target.value)} maxLength={100} />
          </FrmRow>
          <FrmRow label="Kode pos">
            <input className="input" value={buyer.postal} onChange={(e) => setB('postal', e.target.value)} maxLength={10} />
          </FrmRow>
        </FrmSet>
      )}
      {step === 3 && (
        <FrmSet legend="Pengiriman" icon="package" columns={1}>
          <FrmRow label="Kurir">
            <select value={courier} onChange={(e) => setCourier(e.target.value)}>
              {COURIERS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FrmRow>
          <FrmRow label="Ongkir (Rp)">
            <div>
              <input className="input" type="number" min={0} value={shipping} onChange={(e) => { setShipping(e.target.value); setErrs((x) => ({ ...x, shipping: undefined })); }} />
              {errs.shipping && <span className="field-err">{errs.shipping}</span>}
            </div>
          </FrmRow>
          <FrmRow label="Catatan">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </FrmRow>
        </FrmSet>
      )}
      {step === 4 && (
        <FrmSet legend="Ringkasan" icon="report" columns={1}>
          <div className="table-wrap">
            <table className="grid">
              <tbody>
                {cartLines.map((l) => (
                  <tr key={l.PRODUCTID}>
                    <td>{l.NAME} × {l.qty}</td>
                    <td className="grid-num">{formatIDR(Number(l.PRICE || 0) * l.qty)}</td>
                  </tr>
                ))}
                <tr><td>Subtotal</td><td className="grid-num">{formatIDR(subtotal)}</td></tr>
                <tr><td>Ongkir ({courier})</td><td className="grid-num">{formatIDR(Number(shipping || 0))}</td></tr>
                <tr><td><b>Total (dihitung server)</b></td><td className="grid-num"><b>{formatIDR(subtotal + Number(shipping || 0))}</b></td></tr>
              </tbody>
            </table>
          </div>
          <p className="loading-hint">Total final dihitung backend dari harga produk saat ini.</p>
        </FrmSet>
      )}
    </Window>
  );
}
