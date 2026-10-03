// Padanan FRM berita: judul + ringkasan + isi (editor ringan built-in) +
// gambar + kategori + relasi + 3 jalur simpan (draft/terbit/jadwal).
// Editor: toolbar format + textarea (tanpa dependensi baru); pratinjau
// memakai sanitasi yang sama dengan backend.
// Form ini dibuka lewat Modal (useModal), padanan window ExtJS.
'use client';
import { useEffect, useRef, useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import {
  process_create, process_update, process_publish, process_schedule,
  upload_image, imageUrl, read_detail,
} from './api';
import { read_active as read_news_cats } from '../mnewscategory/api';
import { sanitizeNewsHtml } from './Cmnewsdata';

export type NewsForm = {
  NEWSID?: number;
  TITLE: string;
  SUMMARY: string;
  BODY: string;
  MAINIMAGE: string;
  NEWSCATCODE: string;
  EVENTCATCODE: string;
  EVENTID: string;
};

type FieldErrors = Partial<Record<'TITLE' | 'SUMMARY' | 'BODY' | 'NEWSCATCODE' | 'MAINIMAGE' | 'SCHEDULEDAT', string>>;

// Bungkus seleksi textarea dengan tag (atau sisipkan di kursor).
function wrapSelection(el: HTMLTextAreaElement | null, open: string, close: string, set: (v: string) => void, cur: string) {
  if (!el) {
    set(cur + open + close);
    return;
  }
  const s = el.selectionStart ?? cur.length;
  const e = el.selectionEnd ?? cur.length;
  const sel = cur.slice(s, e) || 'teks';
  const next = cur.slice(0, s) + open + sel + close + cur.slice(e);
  set(next);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(s + open.length, s + open.length + sel.length);
  });
}

export default function FRMmnewsdata({
  isNew,
  initial,
  newsId,
  onSaved,
}: {
  isNew: boolean;
  initial?: NewsForm;
  newsId?: number;
  onSaved: () => void;
}) {
  const { close } = useModal();
  const [form, setForm] = useState<NewsForm>(
    initial || {
      TITLE: '', SUMMARY: '', BODY: '', MAINIMAGE: '',
      NEWSCATCODE: '', EVENTCATCODE: '', EVENTID: '',
    },
  );
  const [errs, setErrs] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [cats, setCats] = useState<{ CATCODE: string; CATNAME?: string }[]>([]);
  const [evCats, setEvCats] = useState<{ CATCODE: string; CATNAME?: string }[]>([]);
  const [events, setEvents] = useState<{ EVENTID: number; TITLE?: string }[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [schedAt, setSchedAt] = useState('');
  const [schedErr, setSchedErr] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [imgPath, setImgPath] = useState('');

  // Detail penuh saat ubah (baris grid tidak membawa semua kolom).
  useEffect(() => {
    if (isNew || !newsId) return;
    (async () => {
      try {
        const res: any = await read_detail(newsId);
        if (parseBoolean(res?.success)) {
          const r = (res.Rows || [])[0] || {};
          setForm((f) => ({
            ...f,
            NEWSID: newsId,
            TITLE: String(r.TITLE || ''),
            SUMMARY: String(r.SUMMARY || ''),
            BODY: String(r.BODY || ''),
            MAINIMAGE: String(r.MAINIMAGE || ''),
            NEWSCATCODE: String(r.NEWSCATCODE || ''),
            EVENTCATCODE: String(r.EVENTCATCODE || ''),
            EVENTID: r.EVENTID == null ? '' : String(r.EVENTID),
          }));
        }
      } catch { /* biarkan isian baris grid */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, newsId]);

  // Dropdown kategori berita + kategori event + event (cari).
  useEffect(() => {
    (async () => {
      try {
        const c: any = await read_news_cats();
        if (parseBoolean(c?.success)) setCats(c.Rows || []);
      } catch { /* abaikan */ }
      try {
        const res: any = await (await import('../meventdata/api')).read_dropdown({});
        if (parseBoolean(res?.success)) {
          setEvents(res.Rows || []);
        }
      } catch { /* abaikan */ }
    })();
    (async () => {
      try {
        const res: any = await (await import('@/app/cp_category/api')).read_active();
        if (parseBoolean(res?.success)) setEvCats(res.Rows || []);
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

  const set = (k: keyof NewsForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrs((e) => ({ ...e, [k]: undefined }));
    setDirty(true);
  };

  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!form.TITLE.trim()) e.TITLE = 'Judul wajib diisi.';
    else if (form.TITLE.trim().length > 150) e.TITLE = 'Judul maksimal 150 karakter.';
    if (form.SUMMARY.trim().length > 300) e.SUMMARY = 'Ringkasan maksimal 300 karakter.';
    if (!form.BODY.trim()) e.BODY = 'Isi wajib diisi.';
    if (!form.NEWSCATCODE) (e as any).NEWSCATCODE = 'Kategori wajib dipilih.';
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const payload = () => ({
    NEWSID: form.NEWSID,
    TITLE: form.TITLE.trim(),
    SUMMARY: form.SUMMARY.trim(),
    BODY: form.BODY,
    MAINIMAGE: form.MAINIMAGE,
    NEWSCATCODE: form.NEWSCATCODE,
    EVENTCATCODE: form.EVENTCATCODE || '',
    EVENTID: form.EVENTID || '',
  });

  const afterSave = (res: any, fallback: string, then?: (id: number) => Promise<void>) => {
    if (parseBoolean(res?.success)) {
      toast('Success', res.message || fallback, 'ok');
      setDirty(false);
      const id = Number((res.Rows || [])[0]?.NEWSID ?? form.NEWSID ?? 0);
      if (then && id) {
        then(id).then(() => {
          onSaved();
          close();
        });
      } else {
        onSaved();
        close();
      }
    } else toast('Error', res?.message || 'Gagal menyimpan berita.', 'err');
  };

  const saveDraft = async () => {
    if (!validate()) return;
    if (!await confirmDialog({ message: isNew ? 'Simpan sebagai Draft?' : 'Simpan perubahan?' })) return;
    setBusy(true);
    try {
      const res: any = isNew ? await process_create(payload()) : await process_update(payload());
      afterSave(res, 'Berita tersimpan.');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const publishNow = async () => {
    if (!validate()) return;
    if (!await confirmDialog({ message: 'Simpan dan Terbitkan Sekarang?' })) return;
    setBusy(true);
    try {
      const res: any = isNew ? await process_create(payload()) : await process_update(payload());
      if (!parseBoolean(res?.success)) {
        toast('Error', res?.message || 'Gagal menyimpan berita.', 'err');
        return;
      }
      const id = Number((res.Rows || [])[0]?.NEWSID ?? form.NEWSID ?? 0);
      if (!id) {
        toast('Error', 'ID berita tidak ditemukan.', 'err');
        return;
      }
      const pub: any = await process_publish({ NEWSID: id });
      afterSave(pub, 'Berita diterbitkan.');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const schedule = async () => {
    if (!validate()) return;
    if (!schedAt) { setSchedErr('Pilih tanggal dan jam terbit.'); return; }
    if (new Date(schedAt).getTime() <= Date.now()) { setSchedErr('Jadwal harus di masa depan.'); return; }
    if (!await confirmDialog({ message: `Jadwalkan terbit ${schedAt.replace('T', ' ')}?` })) return;
    setBusy(true);
    try {
      const saved: any = isNew ? await process_create(payload()) : await process_update(payload());
      if (!parseBoolean(saved?.success)) {
        toast('Error', saved?.message || 'Gagal menyimpan berita.', 'err');
        return;
      }
      const id = Number((saved.Rows || [])[0]?.NEWSID ?? form.NEWSID ?? 0);
      if (!id) {
        toast('Error', 'ID berita tidak ditemukan.', 'err');
        return;
      }
      const sch: any = await process_schedule({ NEWSID: id, SCHEDULEDAT: schedAt.replace('T', ' ') + ':00' });
      afterSave(sch, 'Berita dijadwalkan.');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const pickImage = async (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { setErrs((e) => ({ ...e, MAINIMAGE: 'Gambar hanya boleh JPG, PNG, atau WebP.' })); return; }
    if (f.size > 2 * 1024 * 1024) { setErrs((e) => ({ ...e, MAINIMAGE: 'Ukuran gambar maksimal 2MB.' })); return; }
    setUploading(true);
    try {
      const { upload_image } = await import('./api');
      const res: any = await upload_image(f);
      if (parseBoolean(res?.success) && res.path) {
        set('MAINIMAGE', String(res.path));
        setErrs((e) => ({ ...e, MAINIMAGE: undefined }));
      } else {
        setErrs((e) => ({ ...e, MAINIMAGE: res?.message || 'Upload gambar gagal.' }));
      }
    } catch (e: any) {
      setErrs((e2) => ({ ...e2, MAINIMAGE: e.message || 'Upload gambar gagal.' }));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const tb = (label: string, title: string, fn: () => void) => (
    <Btn key={label} className="btn-sm" title={title} onClick={fn}>{label}</Btn>
  );

  const imgSrc = form.MAINIMAGE ? imageUrl(form.MAINIMAGE) : '';

  return (
    <Window
      title={isNew ? 'Tambah Berita' : 'Ubah Berita'}
      icon={isNew ? 'add' : 'edit'}
      width="720px"
      footer={
        <>
          <Btn className="btn-sm" icon="view" onClick={() => setShowPreview((v) => !v)}>
            {showPreview ? 'Tutup Pratinjau' : 'Pratinjau'}
          </Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
          <Btn className="btn-sm" icon="save" disabled={busy || uploading} onClick={saveDraft}>Simpan Draft</Btn>
          <Btn pid="btsave" className="primary" icon="check" disabled={busy || uploading} onClick={publishNow}>Terbitkan</Btn>
        </>
      }
    >
      <FrmSet legend="Berita" icon="form" columns={2}>
        <FrmRow label="Judul">
          <div>
            <input className="input" value={form.TITLE} onChange={(e) => set('TITLE', e.target.value)} maxLength={150} />
            {errs.TITLE && <span className="field-err">{errs.TITLE}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Kategori">
          <div>
            <select value={form.NEWSCATCODE} onChange={(e) => set('NEWSCATCODE', e.target.value)}>
              <option value="">Pilih kategori</option>
              {cats.map((c) => <option key={c.CATCODE} value={c.CATCODE}>{c.CATNAME || c.CATCODE}</option>)}
            </select>
            {(errs as any).NEWSCATCODE && <span className="field-err">{(errs as any).NEWSCATCODE}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Ringkasan">
          <div>
            <textarea className="input" rows={2} value={form.SUMMARY} onChange={(e) => set('SUMMARY', e.target.value)} maxLength={300} />
            <span className="loading-hint">{form.SUMMARY.length}/300 karakter.</span>
            {errs.SUMMARY && <span className="field-err">{errs.SUMMARY}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Kat. Event">
          <select value={form.EVENTCATCODE} onChange={(e) => set('EVENTCATCODE', e.target.value)}>
            <option value="">Tanpa relasi</option>
            {evCats.map((c) => <option key={c.CATCODE} value={c.CATCODE}>{c.CATNAME || c.CATCODE}</option>)}
          </select>
        </FrmRow>
        <FrmRow label="Event">
          <select value={form.EVENTID} onChange={(e) => set('EVENTID', e.target.value)}>
            <option value="">Tanpa relasi</option>
            {events.map((e) => <option key={e.EVENTID} value={e.EVENTID}>{e.TITLE}</option>)}
          </select>
        </FrmRow>
        <FrmRow label="Gambar">
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {imgSrc && <img src={imgSrc} alt="Gambar utama" width={64} height={64} style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={(e) => pickImage(e.target.files?.[0])}
              />
            </div>
            {uploading && <span className="loading-hint"><Icon name="loading" size={14} className="spin" /> Mengupload…</span>}
            {errs.MAINIMAGE && <span className="field-err">{errs.MAINIMAGE}</span>}
          </div>
        </FrmRow>
      </FrmSet>
      <FrmSet legend="Isi" icon="report" columns={1}>
        <div className="toolbar" style={{ flexWrap: 'wrap' }}>
          {tb('B', 'Tebal', () => wrapSelection(bodyRef.current, '<b>', '</b>', (v) => set('BODY', v), form.BODY))}
          {tb('I', 'Miring', () => wrapSelection(bodyRef.current, '<i>', '</i>', (v) => set('BODY', v), form.BODY))}
          {tb('H2', 'Judul 2', () => wrapSelection(bodyRef.current, '<h2>', '</h2>', (v) => set('BODY', v), form.BODY))}
          {tb('H3', 'Judul 3', () => wrapSelection(bodyRef.current, '<h3>', '</h3>', (v) => set('BODY', v), form.BODY))}
          {tb('List', 'Daftar', () => wrapSelection(bodyRef.current, '<ul>\n<li>', '</li>\n</ul>', (v) => set('BODY', v), form.BODY))}
          {tb('Kutip', 'Kutipan', () => wrapSelection(bodyRef.current, '<blockquote>', '</blockquote>', (v) => set('BODY', v), form.BODY))}
          <input
            className="input" placeholder="https://… (tautan)" value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)} style={{ width: 180 }}
          />
          <Btn
            className="btn-sm" icon="add"
            onClick={() => {
              if (!/^https?:\/\//i.test(linkUrl.trim())) { toast('Error', 'Tautan harus http/https.', 'err'); return; }
              wrapSelection(bodyRef.current, `<a href="${linkUrl.trim()}">`, '</a>', (v) => set('BODY', v), form.BODY);
            }}
          >
            Tautan
          </Btn>
          <input
            className="input" placeholder="uploads/news/x.png (gambar)"
            value={imgPath} onChange={(e) => setImgPath(e.target.value)} style={{ width: 200 }}
          />
          <Btn
            className="btn-sm" icon="add"
            onClick={() => {
              const p = imgPath.trim();
              if (!/^uploads\//.test(p)) { toast('Error', 'Gambar isi hanya dari unggahan sendiri (uploads/…).', 'err'); return; }
              wrapSelection(bodyRef.current, '', `<img src="${p}">`, (v) => set('BODY', v), form.BODY);
            }}
          >
            Gambar
          </Btn>
        </div>
        <div>
          <textarea
            ref={bodyRef}
            className="input" rows={8} value={form.BODY} onChange={(e) => set('BODY', e.target.value)}
            placeholder="Tulis isi berita. Format HTML terbatas diizinkan (p, h2/h3, b, i, list, quote, link, gambar)."
          />
          {errs.BODY && <span className="field-err">{errs.BODY}</span>}
        </div>
      </FrmSet>
      {showPreview && (
        <FrmSet legend="Pratinjau" icon="view" columns={1}>
          <div className="card-body">
            <h3 style={{ margin: 0 }}>{form.TITLE || '(tanpa judul)'}</h3>
            <div dangerouslySetInnerHTML={{ __html: sanitizeNewsHtml(form.BODY) || '<p class="empty-hint">(tanpa isi)</p>' }} />
          </div>
        </FrmSet>
      )}
      <FrmSet legend="Jadwalkan" icon="calendar" columns={1}>
        <FrmRow label="Terbit pada">
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="input" type="datetime-local" value={schedAt} onChange={(e) => { setSchedAt(e.target.value); setSchedErr(''); }} />
            <Btn className="btn-sm" icon="calendar" disabled={busy || uploading} onClick={schedule}>Jadwalkan</Btn>
          </div>
        </FrmRow>
        {schedErr && <span className="field-err">{schedErr}</span>}
      </FrmSet>
    </Window>
  );
}
