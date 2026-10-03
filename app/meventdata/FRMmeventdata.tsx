// Padanan FRM event: 6 bagian (dasar, lokasi, jadwal, media, penyelenggara, syarat).
// Upload poster + pratinjau, dropdown kategori/kota aktif.
// Peringatan bila form kotor ditinggalkan (beforeunload).
// Form ini dibuka lewat Modal (useModal), padanan window ExtJS.
'use client';
import { useEffect, useRef, useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { process_create, process_update, upload_poster, posterUrl, read_cat_active, read_city_active, read_detail } from './api';
import { toInputDateTime } from './Cmeventdata';

export type EventForm = {
  EVENTID?: number;
  TITLE: string;
  CATCODE: string;
  CITYCODE: string;
  VENUE: string;
  ADDRESS: string;
  LATITUDE: string;
  LONGITUDE: string;
  STARTAT: string;
  ENDAT: string;
  POSTER: string;
  ORGNAME: string;
  ORGCONTACT: string;
  DESCR: string;
  TERMS: string;
};

type FieldErrors = Partial<Record<keyof EventForm, string>>;

const toInput = (v: unknown): string => toInputDateTime(v);
const toBackend = (v: string): string => (v ? v.replace('T', ' ') + ':00' : '');

export default function FRMmeventdata({
  isNew,
  initial,
  eventId,
  onSaved,
}: {
  isNew: boolean;
  initial?: EventForm;
  eventId?: number;
  onSaved: () => void;
}) {
  const { close } = useModal();
  const [form, setForm] = useState<EventForm>(
    initial || {
      TITLE: '', CATCODE: '', CITYCODE: '', VENUE: '', ADDRESS: '',
      LATITUDE: '', LONGITUDE: '', STARTAT: '', ENDAT: '', POSTER: '',
      ORGNAME: '', ORGCONTACT: '', DESCR: '', TERMS: '',
    },
  );
  const [errs, setErrs] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [cats, setCats] = useState<{ CATCODE: string; CATNAME?: string }[]>([]);
  const [cities, setCities] = useState<{ CITYCODE: string; CITYNAME?: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Detail penuh saat ubah (baris grid tidak membawa semua kolom).
  useEffect(() => {
    if (isNew || !eventId) return;
    (async () => {
      try {
        const res: any = await read_detail(eventId);
        if (parseBoolean(res?.success)) {
          const r = (res.Rows || [])[0] || {};
          setForm((f) => ({
            ...f,
            TITLE: String(r.TITLE || ''),
            CATCODE: String(r.CATCODE || ''),
            CITYCODE: String(r.CITYCODE || ''),
            VENUE: String(r.VENUE || ''),
            ADDRESS: String(r.ADDRESS || ''),
            LATITUDE: r.LATITUDE == null ? '' : String(r.LATITUDE),
            LONGITUDE: r.LONGITUDE == null ? '' : String(r.LONGITUDE),
            STARTAT: toInput(r.STARTAT),
            ENDAT: toInput(r.ENDAT),
            POSTER: String(r.POSTER || ''),
            ORGNAME: String(r.ORGNAME || ''),
            ORGCONTACT: String(r.ORGCONTACT || ''),
            DESCR: String(r.DESCR || ''),
            TERMS: String(r.TERMS || ''),
          }));
        }
      } catch { /* biarkan isian baris grid */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, eventId]);

  // Dropdown kategori & kota aktif.
  useEffect(() => {
    (async () => {
      try {
        const c: any = await read_cat_active();
        if (parseBoolean(c?.success)) setCats(c.Rows || []);
      } catch { /* abaikan */ }
      try {
        const k: any = await read_city_active();
        if (parseBoolean(k?.success)) setCities(k.Rows || []);
      } catch { /* abaikan */ }
    })();
  }, []);

  // Peringatan bila form kotor ditinggalkan (refresh/tutup tab).
  useEffect(() => {
    if (!dirty) return;
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBefore);
    return () => window.removeEventListener('beforeunload', onBefore);
  }, [dirty]);

  const set = (k: keyof EventForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrs((e) => ({ ...e, [k]: undefined }));
    setDirty(true);
  };

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!form.TITLE.trim()) e.TITLE = 'Judul wajib diisi.';
    else if (form.TITLE.trim().length > 150) e.TITLE = 'Judul maksimal 150 karakter.';
    if (!form.CATCODE) e.CATCODE = 'Kategori wajib dipilih.';
    if (!form.CITYCODE) e.CITYCODE = 'Kota wajib dipilih.';
    if (!form.VENUE.trim()) e.VENUE = 'Venue wajib diisi.';
    if (!form.ADDRESS.trim()) e.ADDRESS = 'Alamat wajib diisi.';
    if (!form.STARTAT) e.STARTAT = 'Tanggal mulai wajib diisi.';
    if (!form.ENDAT) e.ENDAT = 'Tanggal selesai wajib diisi.';
    if (form.STARTAT && form.ENDAT && form.ENDAT < form.STARTAT) e.ENDAT = 'Tanggal selesai tidak boleh sebelum tanggal mulai.';
    if (!form.ORGNAME.trim()) e.ORGNAME = 'Nama penyelenggara wajib diisi.';
    if (form.LATITUDE.trim() !== '' && (!/^-?\d+(\.\d+)?$/.test(form.LATITUDE.trim()) || Number(form.LATITUDE) < -90 || Number(form.LATITUDE) > 90)) {
      e.LATITUDE = 'Latitude harus antara -90 dan 90.';
    }
    if (form.LONGITUDE.trim() !== '' && (!/^-?\d+(\.\d+)?$/.test(form.LONGITUDE.trim()) || Number(form.LONGITUDE) < -180 || Number(form.LONGITUDE) > 180)) {
      e.LONGITUDE = 'Longitude harus antara -180 dan 180.';
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const pickPoster = async (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { setErrs((e) => ({ ...e, POSTER: 'Poster hanya boleh JPG, PNG, atau WebP.' })); return; }
    if (f.size > 2 * 1024 * 1024) { setErrs((e) => ({ ...e, POSTER: 'Ukuran poster maksimal 2MB.' })); return; }
    setUploading(true);
    try {
      const res: any = await upload_poster(f);
      if (parseBoolean(res?.success) && res.path) {
        set('POSTER', String(res.path));
        setErrs((e) => ({ ...e, POSTER: undefined }));
      } else {
        setErrs((e) => ({ ...e, POSTER: res?.message || 'Upload poster gagal.' }));
      }
    } catch (e: any) {
      setErrs((e2) => ({ ...e2, POSTER: e.message || 'Upload poster gagal.' }));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async () => {
    if (!validate()) return;
    if (!await confirmDialog({ message: isNew ? 'Simpan Event baru?' : 'Simpan perubahan Event?' })) return;
    setBusy(true);
    try {
      const payload = {
        EVENTID: form.EVENTID,
        TITLE: form.TITLE.trim(),
        CATCODE: form.CATCODE,
        CITYCODE: form.CITYCODE,
        VENUE: form.VENUE.trim(),
        ADDRESS: form.ADDRESS.trim(),
        LATITUDE: form.LATITUDE.trim(),
        LONGITUDE: form.LONGITUDE.trim(),
        STARTAT: toBackend(form.STARTAT),
        ENDAT: toBackend(form.ENDAT),
        POSTER: form.POSTER,
        ORGNAME: form.ORGNAME.trim(),
        ORGCONTACT: form.ORGCONTACT.trim(),
        DESCR: form.DESCR,
        TERMS: form.TERMS,
      };
      const res: any = isNew ? await process_create(payload) : await process_update(payload);
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Event tersimpan.', 'ok');
        setDirty(false);
        onSaved();
        close();
      } else toast('Error', res?.message || 'Gagal menyimpan event.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const posterSrc = form.POSTER ? posterUrl(form.POSTER) : '';

  return (
    <Window
      title={isNew ? 'Tambah Event' : 'Ubah Event'}
      icon={isNew ? 'add' : 'edit'}
      width="720px"
      footer={
        <>
          <Btn pid="btsave" className="primary" icon="save" disabled={busy || uploading} onClick={save}>Simpan</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
        </>
      }
    >
      <FrmSet legend="Informasi Dasar" icon="form" columns={2}>
        <FrmRow label="Judul">
          <div>
            <input className="input" value={form.TITLE} onChange={(e) => set('TITLE', e.target.value)} maxLength={150} />
            {errs.TITLE && <span className="field-err">{errs.TITLE}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Kategori">
          <div>
            <select value={form.CATCODE} onChange={(e) => set('CATCODE', e.target.value)}>
              <option value="">Pilih kategori</option>
              {cats.map((c) => <option key={c.CATCODE} value={c.CATCODE}>{c.CATNAME || c.CATCODE}</option>)}
            </select>
            {errs.CATCODE && <span className="field-err">{errs.CATCODE}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Deskripsi">
          <div>
            <textarea className="input" rows={3} value={form.DESCR} onChange={(e) => set('DESCR', e.target.value)} />
            <span className="loading-hint">Teks biasa (tanpa HTML).</span>
          </div>
        </FrmRow>
      </FrmSet>
      <FrmSet legend="Lokasi" icon="dept" columns={2}>
        <FrmRow label="Kota">
          <div>
            <select value={form.CITYCODE} onChange={(e) => set('CITYCODE', e.target.value)}>
              <option value="">Pilih kota</option>
              {cities.map((c) => <option key={c.CITYCODE} value={c.CITYCODE}>{c.CITYNAME || c.CITYCODE}</option>)}
            </select>
            {errs.CITYCODE && <span className="field-err">{errs.CITYCODE}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Venue">
          <div>
            <input className="input" value={form.VENUE} onChange={(e) => set('VENUE', e.target.value)} maxLength={150} />
            {errs.VENUE && <span className="field-err">{errs.VENUE}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Alamat">
          <div>
            <textarea className="input" rows={2} value={form.ADDRESS} onChange={(e) => set('ADDRESS', e.target.value)} maxLength={500} />
            {errs.ADDRESS && <span className="field-err">{errs.ADDRESS}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Latitude">
          <div>
            <input className="input" placeholder="opsional, cth. -6.2" value={form.LATITUDE} onChange={(e) => set('LATITUDE', e.target.value)} />
            {errs.LATITUDE && <span className="field-err">{errs.LATITUDE}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Longitude">
          <div>
            <input className="input" placeholder="opsional, cth. 106.8" value={form.LONGITUDE} onChange={(e) => set('LONGITUDE', e.target.value)} />
            {errs.LONGITUDE && <span className="field-err">{errs.LONGITUDE}</span>}
          </div>
        </FrmRow>
      </FrmSet>
      <FrmSet legend="Jadwal" icon="calendar" columns={2}>
        <FrmRow label="Mulai">
          <div>
            <input className="input" type="datetime-local" value={form.STARTAT} onChange={(e) => set('STARTAT', e.target.value)} />
            {errs.STARTAT && <span className="field-err">{errs.STARTAT}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Selesai">
          <div>
            <input className="input" type="datetime-local" value={form.ENDAT} onChange={(e) => set('ENDAT', e.target.value)} />
            {errs.ENDAT && <span className="field-err">{errs.ENDAT}</span>}
          </div>
        </FrmRow>
      </FrmSet>
      <FrmSet legend="Media" icon="upload" columns={1}>
        <FrmRow label="Poster">
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {posterSrc && <img src={posterSrc} alt="Poster" width={64} height={64} style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={(e) => pickPoster(e.target.files?.[0])}
              />
            </div>
            {uploading && <span className="loading-hint"><Icon name="loading" size={14} className="spin" /> Mengupload…</span>}
            {errs.POSTER && <span className="field-err">{errs.POSTER}</span>}
          </div>
        </FrmRow>
      </FrmSet>
      <FrmSet legend="Penyelenggara" icon="user" columns={2}>
        <FrmRow label="Nama">
          <div>
            <input className="input" value={form.ORGNAME} onChange={(e) => set('ORGNAME', e.target.value)} maxLength={100} />
            {errs.ORGNAME && <span className="field-err">{errs.ORGNAME}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Kontak">
          <div>
            <input className="input" placeholder="email atau telepon" value={form.ORGCONTACT} onChange={(e) => set('ORGCONTACT', e.target.value)} maxLength={100} />
            {errs.ORGCONTACT && <span className="field-err">{errs.ORGCONTACT}</span>}
          </div>
        </FrmRow>
      </FrmSet>
      <FrmSet legend="Syarat & Ketentuan" icon="report" columns={1}>
        <FrmRow label="Syarat">
          <div>
            <textarea className="input" rows={3} value={form.TERMS} onChange={(e) => set('TERMS', e.target.value)} />
            <span className="loading-hint">Opsional. Teks biasa (tanpa HTML).</span>
          </div>
        </FrmRow>
      </FrmSet>
    </Window>
  );
}
