// Padanan FRM produk: penjual + nama + deskripsi + kategori + harga +
// stok + kondisi + berat + status + banyak gambar (pratinjau + urutan).
// Form ini dibuka lewat Modal (useModal), padanan window ExtJS.
'use client';
import { useEffect, useRef, useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { process_product_create, process_product_update, upload_image, imageUrl, read_seller_dropdown } from './api';

export const CATEGORIES = ['Lightstick', 'Photocard', 'Figure', 'Apparel', 'Poster', 'Aksesori', 'Lainnya'];

export type ProductForm = {
  PRODUCTID?: number;
  SELLERID: string;
  NAME: string;
  DESCR: string;
  CATEGORY: string;
  PRICE: string;
  STOCK: string;
  CONDITION: string;
  WEIGHT: string;
  ISACTIVE: string;
  IMAGES: string[];
};

type FieldErrors = Partial<Record<keyof ProductForm, string>>;

export default function FRMmproductdata({
  isNew,
  initial,
  onSaved,
}: {
  isNew: boolean;
  initial?: ProductForm;
  onSaved: () => void;
}) {
  const { close } = useModal();
  const [form, setForm] = useState<ProductForm>(
    initial || {
      SELLERID: '', NAME: '', DESCR: '', CATEGORY: 'Lainnya', PRICE: '',
      STOCK: '', CONDITION: 'BARU', WEIGHT: '', ISACTIVE: 'YES', IMAGES: [],
    },
  );
  const [errs, setErrs] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sellers, setSellers] = useState<{ SELLERID: number; SHOPNAME?: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const res: any = await read_seller_dropdown();
        if (parseBoolean(res?.success)) setSellers(res.Rows || []);
      } catch { /* abaikan */ }
    })();
  }, []);

  const set = (k: keyof ProductForm, v: string | string[]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrs((e) => ({ ...e, [k]: undefined }));
  };

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!form.SELLERID) e.SELLERID = 'Penjual wajib dipilih.';
    if (!form.NAME.trim()) e.NAME = 'Nama wajib diisi.';
    else if (form.NAME.trim().length > 150) e.NAME = 'Nama maksimal 150 karakter.';
    if (!CATEGORIES.includes(form.CATEGORY)) e.CATEGORY = 'Kategori tidak valid.';
    if (form.PRICE.trim() === '' || Number.isNaN(Number(form.PRICE)) || Number(form.PRICE) < 0) {
      e.PRICE = 'Harga wajib diisi dan tidak negatif.';
    }
    if (!/^\d+$/.test(form.STOCK.trim())) e.STOCK = 'Stok wajib bilangan bulat tidak negatif.';
    if (form.CONDITION !== 'BARU' && form.CONDITION !== 'BEKAS') e.CONDITION = 'Kondisi harus BARU atau BEKAS.';
    if (!/^\d+$/.test(form.WEIGHT.trim()) || Number(form.WEIGHT) < 1) e.WEIGHT = 'Berat wajib > 0 gram.';
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const pickImages = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const room = 5 - form.IMAGES.length;
    if (room <= 0) { setErrs((e) => ({ ...e, IMAGES: 'Maksimal 5 gambar.' })); return; }
    const batch = Array.from(files).slice(0, room);
    for (const f of batch) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { setErrs((e) => ({ ...e, IMAGES: 'Gambar hanya boleh JPG, PNG, atau WebP.' })); return; }
      if (f.size > 2 * 1024 * 1024) { setErrs((e) => ({ ...e, IMAGES: 'Ukuran gambar maksimal 2MB.' })); return; }
    }
    setUploading(true);
    try {
      for (const f of batch) {
        const res: any = await upload_image(f);
        if (parseBoolean(res?.success) && res.path) {
          setForm((prev) => ({ ...prev, IMAGES: [...prev.IMAGES, String(res.path)] }));
        } else {
          setErrs((e) => ({ ...e, IMAGES: res?.message || 'Upload gambar gagal.' }));
          break;
        }
      }
      setErrs((e) => ({ ...e, IMAGES: undefined }));
    } catch (e: any) {
      setErrs((e2) => ({ ...e2, IMAGES: e.message || 'Upload gambar gagal.' }));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const moveImage = (i: number, dir: -1 | 1) => {
    setForm((f) => {
      const imgs = [...f.IMAGES];
      const j = i + dir;
      if (j < 0 || j >= imgs.length) return f;
      [imgs[i], imgs[j]] = [imgs[j], imgs[i]];
      return { ...f, IMAGES: imgs };
    });
  };

  const removeImage = (i: number) => {
    setForm((f) => ({ ...f, IMAGES: f.IMAGES.filter((_, x) => x !== i) }));
  };

  const save = async () => {
    if (!validate()) return;
    if (!await confirmDialog({ message: isNew ? 'Simpan Produk?' : 'Simpan perubahan Produk?' })) return;
    setBusy(true);
    try {
      const payload = {
        PRODUCTID: form.PRODUCTID,
        SELLERID: Number(form.SELLERID),
        NAME: form.NAME.trim(),
        DESCR: form.DESCR,
        CATEGORY: form.CATEGORY,
        PRICE: form.PRICE.trim(),
        STOCK: form.STOCK.trim(),
        CONDITION: form.CONDITION,
        WEIGHT: form.WEIGHT.trim(),
        ISACTIVE: form.ISACTIVE,
        IMAGES: form.IMAGES,
      };
      const res: any = isNew ? await process_product_create(payload) : await process_product_update(payload);
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Produk tersimpan.', 'ok');
        onSaved();
        close();
      } else toast('Error', res?.message || 'Gagal menyimpan produk.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title={isNew ? 'Tambah Produk' : 'Ubah Produk'}
      icon={isNew ? 'add' : 'edit'}
      width="640px"
      footer={
        <>
          <Btn pid="btsave" className="primary" icon="save" disabled={busy || uploading} onClick={save}>Simpan</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
        </>
      }
    >
      <FrmSet legend="Produk" icon="box" columns={2}>
        <FrmRow label="Penjual">
          <div>
            <select value={form.SELLERID} onChange={(e) => set('SELLERID', e.target.value)}>
              <option value="">Pilih penjual</option>
              {sellers.map((s) => <option key={s.SELLERID} value={s.SELLERID}>{s.SHOPNAME}</option>)}
            </select>
            {errs.SELLERID && <span className="field-err">{errs.SELLERID}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Nama">
          <div>
            <input className="input" value={form.NAME} onChange={(e) => set('NAME', e.target.value)} maxLength={150} />
            {errs.NAME && <span className="field-err">{errs.NAME}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Deskripsi">
          <div>
            <textarea className="input" rows={2} value={form.DESCR} onChange={(e) => set('DESCR', e.target.value)} maxLength={5000} />
            <span className="loading-hint">Teks biasa (tanpa HTML).</span>
          </div>
        </FrmRow>
        <FrmRow label="Kategori">
          <div>
            <select value={form.CATEGORY} onChange={(e) => set('CATEGORY', e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {errs.CATEGORY && <span className="field-err">{errs.CATEGORY}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Harga (Rp)">
          <div>
            <input className="input" type="number" min={0} value={form.PRICE} onChange={(e) => set('PRICE', e.target.value)} />
            {errs.PRICE && <span className="field-err">{errs.PRICE}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Stok">
          <div>
            <input className="input" type="number" min={0} value={form.STOCK} onChange={(e) => set('STOCK', e.target.value)} />
            {errs.STOCK && <span className="field-err">{errs.STOCK}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Kondisi">
          <div>
            <select value={form.CONDITION} onChange={(e) => set('CONDITION', e.target.value)}>
              <option value="BARU">BARU</option>
              <option value="BEKAS">BEKAS</option>
            </select>
            {errs.CONDITION && <span className="field-err">{errs.CONDITION}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Berat (gr)">
          <div>
            <input className="input" type="number" min={1} value={form.WEIGHT} onChange={(e) => set('WEIGHT', e.target.value)} />
            {errs.WEIGHT && <span className="field-err">{errs.WEIGHT}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Status">
          <select value={form.ISACTIVE} onChange={(e) => set('ISACTIVE', e.target.value)}>
            <option value="YES">Aktif</option>
            <option value="NO">Nonaktif</option>
          </select>
        </FrmRow>
      </FrmSet>
      <FrmSet legend={`Gambar (${form.IMAGES.length}/5)`} icon="upload" columns={1}>
        <FrmRow label="File">
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {form.IMAGES.map((p, i) => (
                <span key={`${p}-${i}`} style={{ position: 'relative', display: 'inline-flex' }}>
                  <img src={imageUrl(p)} alt={`Gambar ${i + 1}`} width={56} height={56} style={{ objectFit: 'cover', borderRadius: 8, border: i === 0 ? '2px solid var(--brand)' : '1px solid var(--border)' }} title={i === 0 ? 'Gambar utama' : `Gambar ${i + 1}`} />
                  <span style={{ position: 'absolute', bottom: -6, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 2 }}>
                    <button type="button" className="icon-btn" style={{ padding: 1, minHeight: 0, background: 'var(--surface)' }} aria-label="Geser kiri" disabled={i === 0} onClick={() => moveImage(i, -1)}>‹</button>
                    <button type="button" className="icon-btn" style={{ padding: 1, minHeight: 0, background: 'var(--surface)' }} aria-label="Geser kanan" disabled={i === form.IMAGES.length - 1} onClick={() => moveImage(i, 1)}>›</button>
                    <button type="button" className="icon-btn" style={{ padding: 1, minHeight: 0, background: 'var(--surface)' }} aria-label="Hapus gambar" onClick={() => removeImage(i)}>×</button>
                  </span>
                </span>
              ))}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                disabled={uploading}
                onChange={(e) => pickImages(e.target.files)}
              />
            </div>
            {uploading && <span className="loading-hint"><Icon name="loading" size={14} className="spin" /> Mengupload…</span>}
            <span className="loading-hint">Bingkai tebal = gambar utama. Maksimal 5.</span>
            {errs.IMAGES && <span className="field-err">{errs.IMAGES}</span>}
          </div>
        </FrmRow>
      </FrmSet>
    </Window>
  );
}
