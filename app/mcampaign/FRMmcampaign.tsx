// Form tambah/ubah kampanye iklan. Dibuka lewat Modal (useModal).
// Tujuan EVENT (pilih ID event) atau URL. Banner diupload terpisah
// setelah kampanye tersimpan (butuh CAMPAIGNID).
// Setelah AKTIF: tanggal & posisi terkunci (disembunyikan/disabled).
'use client';
import { useEffect, useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { process_create, process_update, read_detail, read_position, upload_banner } from './api';

export default function FRMmcampaign({
  isNew, campaignId, onSaved,
}: {
  isNew: boolean;
  campaignId?: number;
  onSaved: () => void;
}) {
  const { close } = useModal();
  const [title, setTitle] = useState('');
  const [adv, setAdv] = useState('');
  const [contact, setContact] = useState('');
  const [linktype, setLinktype] = useState('EVENT');
  const [eventid, setEventid] = useState('');
  const [linkurl, setLinkurl] = useState('');
  const [posid, setPosid] = useState('');
  const [positions, setPositions] = useState<any[]>([]);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [status, setStatus] = useState('DRAFT');
  const [bannerName, setBannerName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');

  // Posisi aktif untuk dropdown (tanpa paging, sedikit baris).
  useEffect(() => {
    read_position()
      .then((res: any) => {
        if (parseBoolean(res?.success)) setPositions((res.Rows || []).filter((p: any) => String(p.ISACTIVE).toUpperCase() === 'YES'));
      })
      .catch(() => { /* dropdown kosong: backend tetap validasi */ });
  }, []);

  // Muat data untuk mode ubah (tanggal dipotong hari).
  useEffect(() => {
    if (isNew || !campaignId) return;
    setLoading(true);
    setErr('');
    read_detail(campaignId)
      .then((res: any) => {
        if (!parseBoolean(res?.success)) {
          setErr(res?.message || 'Gagal memuat data.');
          return;
        }
        const d = (res.Rows || [])[0] || {};
        setTitle(String(d.TITLE || ''));
        setAdv(String(d.ADVERTISER || ''));
        setContact(String(d.CONTACT || ''));
        setLinktype(String(d.LINKTYPE || 'EVENT'));
        setEventid(d.EVENTID != null ? String(d.EVENTID) : '');
        setLinkurl(String(d.LINKURL || ''));
        setPosid(d.POSITIONID != null ? String(d.POSITIONID) : '');
        setStart(String(d.STARTDATE || '').slice(0, 10));
        setEnd(String(d.ENDDATE || '').slice(0, 10));
        setStatus(String(d.STATUS || 'DRAFT'));
        setBannerName(String(d.BANNERIMAGE || ''));
      })
      .catch((e: any) => setErr(e.message || 'Gagal memuat data.'))
      .finally(() => setLoading(false));
  }, [isNew, campaignId]);

  const lockedPeriod = !isNew && (status === 'AKTIF' || status === 'DIJEDA');
  const readOnly = !isNew && status === 'DIBATALKAN';

  const save = async () => {
    const payload = {
      CAMPAIGNID: isNew ? undefined : campaignId,
      TITLE: title.trim(),
      ADVERTISER: adv.trim(),
      CONTACT: contact.trim(),
      LINKTYPE: linktype,
      EVENTID: eventid.trim(),
      LINKURL: linkurl.trim(),
      POSITIONID: posid.trim(),
      STARTDATE: start.trim(),
      ENDDATE: end.trim(),
    };
    if (!await confirmDialog({ message: isNew ? 'Buat kampanye ini?' : 'Simpan perubahan kampanye?' })) return;
    setBusy(true);
    try {
      const res: any = isNew ? await process_create(payload) : await process_update(payload);
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Kampanye tersimpan.', 'ok');
        onSaved();
        close();
      } else toast('Error', res?.message || 'Gagal menyimpan.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  // Upload banner (hanya setelah kampanye tersimpan).
  const upload = async () => {
    if (!file || !campaignId) return;
    setUploading(true);
    try {
      const res: any = await upload_banner(campaignId, file);
      if (parseBoolean(res?.success)) {
        const name = res.Rows?.[0]?.BANNERIMAGE || '';
        setBannerName(name);
        setFile(null);
        toast('Success', res.message || 'Banner diupload.', 'ok');
        onSaved();
      } else toast('Error', res?.message || 'Upload banner gagal.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Window
      title={isNew ? 'Tambah Kampanye' : `Ubah Kampanye ${title}`}
      icon="form"
      width="600px"
      footer={
        <>
          {!readOnly && (
            <Btn className="primary" icon="check" disabled={busy || loading} onClick={save}>Simpan</Btn>
          )}
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>{readOnly ? 'Tutup' : 'Batal'}</Btn>
        </>
      }
    >
      {loading ? (
        <div className="card-body">
          <span className="loading-hint"><Icon name="refresh" size={16} /> Memuat…</span>
        </div>
      ) : err ? (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>{err}</span>
        </div>
      ) : (
        <>
          {lockedPeriod && (
            <div className="toast-err alert-inline">
              <Icon name="alertCircle" size={17} />
              <span>Kampanye {status} — tanggal & posisi terkunci. Yang bisa diubah: judul, pengiklan, kontak, tujuan, banner.</span>
            </div>
          )}
          {readOnly && (
            <div className="toast-err alert-inline">
              <Icon name="alertCircle" size={17} />
              <span>Kampanye dibatalkan — read-only.</span>
            </div>
          )}
          <FrmSet legend="Kampanye" icon="form" columns={2}>
            <FrmRow label="Judul">
              <input className="input" value={title} disabled={readOnly} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
            </FrmRow>
            <FrmRow label="Pengiklan">
              <input className="input" value={adv} disabled={readOnly} onChange={(e) => setAdv(e.target.value)} maxLength={100} />
            </FrmRow>
            <FrmRow label="Kontak">
              <input className="input" value={contact} disabled={readOnly} onChange={(e) => setContact(e.target.value)} maxLength={100} />
            </FrmRow>
            <FrmRow label="Tujuan">
              <select value={linktype} disabled={readOnly} onChange={(e) => setLinktype(e.target.value)}>
                <option value="EVENT">Event</option>
                <option value="URL">URL luar</option>
              </select>
            </FrmRow>
            {linktype === 'EVENT' ? (
              <FrmRow label="ID Event">
                <input className="input" type="number" min={1} value={eventid} disabled={readOnly} onChange={(e) => setEventid(e.target.value)} />
              </FrmRow>
            ) : (
              <FrmRow label="URL">
                <input className="input" placeholder="https://" value={linkurl} disabled={readOnly} onChange={(e) => setLinkurl(e.target.value)} maxLength={500} />
              </FrmRow>
            )}
            <FrmRow label="Posisi">
              <select value={posid} disabled={readOnly || lockedPeriod} onChange={(e) => setPosid(e.target.value)}>
                <option value="">— pilih —</option>
                {positions.map((p) => (
                  <option key={p.POSITIONID} value={p.POSITIONID}>{p.POSCODE} — {p.POSNAME}</option>
                ))}
              </select>
            </FrmRow>
            <FrmRow label="Periode">
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="input" type="date" value={start} disabled={readOnly || lockedPeriod} onChange={(e) => setStart(e.target.value)} />
                <input className="input" type="date" value={end} disabled={readOnly || lockedPeriod} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </FrmRow>
          </FrmSet>
          {!isNew && !readOnly && (
            <FrmSet legend="Banner" icon="form" columns={1}>
              <FrmRow label="File">
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="file" accept=".jpg,.jpeg,.png,.webp"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  <Btn className="primary btn-sm" icon="check" disabled={!file || uploading} onClick={upload}>
                    {uploading ? 'Mengupload…' : 'Upload'}
                  </Btn>
                </div>
              </FrmRow>
              {bannerName && (
                <FrmRow label="Aktif">
                  <span style={{ fontFamily: 'monospace' }}>{bannerName}</span>
                </FrmRow>
              )}
            </FrmSet>
          )}
          <p className="loading-hint">Banner JPG/PNG/WEBP maks 2MB (rekomendasi 1200×300). Tarif & total dihitung dari posisi saat disimpan.</p>
        </>
      )}
    </Window>
  );
}
