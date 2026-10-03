// Form tambah/ubah promo. Dibuka lewat Modal (useModal), padanan window ExtJS.
// Bila promo sudah dipakai (used > 0), field terkunci disembunyikan/disabled.
'use client';
import { useEffect, useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { process_create, process_update, read_detail } from './api';

export default function FRMmpromocode({
  isNew, promoId, onSaved,
}: {
  isNew: boolean;
  promoId?: number;
  onSaved: () => void;
}) {
  const { close } = useModal();
  const [code, setCode] = useState('');
  const [descr, setDescr] = useState('');
  const [type, setType] = useState('PERSEN');
  const [value, setValue] = useState('');
  const [maxdisc, setMaxdisc] = useState('');
  const [minbuy, setMinbuy] = useState('');
  const [quota, setQuota] = useState('');
  const [maxbuyer, setMaxbuyer] = useState('1');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [scope, setScope] = useState('SEMUA');
  const [targets, setTargets] = useState('');
  const [used, setUsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Muat data untuk mode ubah (tanggal dipotong menit lokal).
  useEffect(() => {
    if (isNew || !promoId) return;
    setLoading(true);
    setErr('');
    read_detail(promoId)
      .then((res: any) => {
        if (!parseBoolean(res?.success)) {
          setErr(res?.message || 'Gagal memuat data.');
          return;
        }
        const d = (res.Rows || [])[0] || {};
        setCode(String(d.PROMOCODE || ''));
        setDescr(String(d.DESCR || ''));
        setType(String(d.DISCTYPE || 'PERSEN'));
        setValue(d.DISCVALUE != null ? String(d.DISCVALUE) : '');
        setMaxdisc(d.MAXDISC != null ? String(d.MAXDISC) : '');
        setMinbuy(d.MINPURCHASE != null ? String(d.MINPURCHASE) : '');
        setQuota(d.QUOTA != null ? String(d.QUOTA) : '');
        setMaxbuyer(d.MAXPERBUYER != null ? String(d.MAXPERBUYER) : '1');
        setStart(String(d.STARTAT || '').slice(0, 16).replace(' ', 'T'));
        setEnd(String(d.ENDAT || '').slice(0, 16).replace(' ', 'T'));
        setScope(String(d.SCOPETYPE || 'SEMUA'));
        setTargets(((d.SCOPES || []) as any[]).map((s) => s.TARGETCODE).join('\n'));
        setUsed(Number(d.USEDCOUNT) || 0);
      })
      .catch((e: any) => setErr(e.message || 'Gagal memuat data.'))
      .finally(() => setLoading(false));
  }, [isNew, promoId]);

  const locked = !isNew && used > 0;

  // Target: satu kode per baris -> list kode unik.
  const save = async () => {
    const list = targets.split(/[\r\n,]+/).map((s) => s.trim().toUpperCase()).filter((s) => s !== '');
    const payload = {
      PROMOID: isNew ? undefined : promoId,
      PROMOCODE: code.trim().toUpperCase(),
      DESCR: descr.trim(),
      DISCTYPE: type,
      DISCVALUE: value.trim(),
      MAXDISC: maxdisc.trim(),
      MINPURCHASE: minbuy.trim(),
      QUOTA: quota.trim(),
      MAXPERBUYER: maxbuyer.trim(),
      STARTAT: start.trim().replace('T', ' '),
      ENDAT: end.trim().replace('T', ' '),
      SCOPETYPE: scope,
      TARGETS: [...new Set(list)],
    };
    if (!await confirmDialog({ message: isNew ? 'Buat promo ini?' : 'Simpan perubahan promo?' })) return;
    setBusy(true);
    try {
      const res: any = isNew ? await process_create(payload) : await process_update(payload);
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Promo tersimpan.', 'ok');
        onSaved();
        close();
      } else toast('Error', res?.message || 'Gagal menyimpan.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title={isNew ? 'Tambah Promo' : `Ubah Promo ${code}`}
      icon="form"
      width="560px"
      footer={
        <>
          <Btn className="primary" icon="check" disabled={busy || loading} onClick={save}>Simpan</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
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
          {locked && (
            <div className="toast-err alert-inline">
              <Icon name="alertCircle" size={17} />
              <span>Promo sudah dipakai {used}× — jenis, nilai, maksimum, minimum, mulai, cakupan, dan target terkunci. Yang bisa diubah: deskripsi, kuota (≥ {used}), waktu selesai.</span>
            </div>
          )}
          <FrmSet legend="Promo" icon="form" columns={2}>
            <FrmRow label="Kode">
              <input className="input" style={{ fontFamily: 'monospace' }} placeholder="HEMAT10" value={code} disabled={locked} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={20} />
            </FrmRow>
            <FrmRow label="Batas/pembeli">
              <input className="input" type="number" min={1} value={maxbuyer} disabled={locked} onChange={(e) => setMaxbuyer(e.target.value)} />
            </FrmRow>
            <FrmRow label="Deskripsi">
              <input className="input" value={descr} onChange={(e) => setDescr(e.target.value)} maxLength={200} />
            </FrmRow>
            <FrmRow label="Jenis">
              <select value={type} disabled={locked} onChange={(e) => setType(e.target.value)}>
                <option value="PERSEN">Persen (%)</option>
                <option value="NOMINAL">Nominal (Rp)</option>
              </select>
            </FrmRow>
            <FrmRow label={type === 'PERSEN' ? 'Nilai (1–100)' : 'Nilai (Rp)'}>
              <input className="input" type="number" min={0} value={value} disabled={locked} onChange={(e) => setValue(e.target.value)} />
            </FrmRow>
            {type === 'PERSEN' ? (
              <>
                <FrmRow label="Maks (Rp)">
                  <input className="input" type="number" min={0} placeholder="opsional" value={maxdisc} disabled={locked} onChange={(e) => setMaxdisc(e.target.value)} />
                </FrmRow>
                <FrmRow label="Min beli (Rp)">
                  <input className="input" type="number" min={0} placeholder="opsional" value={minbuy} disabled={locked} onChange={(e) => setMinbuy(e.target.value)} />
                </FrmRow>
              </>
            ) : (
              <FrmRow label="Min beli (Rp)">
                <input className="input" type="number" min={0} value={minbuy} disabled={locked} onChange={(e) => setMinbuy(e.target.value)} />
              </FrmRow>
            )}
            <FrmRow label="Kuota">
              <input className="input" type="number" min={1} placeholder="kosong = tanpa batas" value={quota} onChange={(e) => setQuota(e.target.value)} />
            </FrmRow>
            <FrmRow label="Mulai">
              <input className="input" type="datetime-local" value={start} disabled={locked} onChange={(e) => setStart(e.target.value)} />
            </FrmRow>
            <FrmRow label="Selesai">
              <input className="input" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </FrmRow>
            <FrmRow label="Cakupan">
              <select value={scope} disabled={locked} onChange={(e) => setScope(e.target.value)}>
                <option value="SEMUA">Semua</option>
                <option value="KATEGORI">Kategori tertentu</option>
                <option value="EVENT">Event tertentu</option>
              </select>
            </FrmRow>
            {scope !== 'SEMUA' && (
              <FrmRow label="Target">
                <textarea className="input" style={{ fontFamily: 'monospace' }} rows={3} placeholder={scope === 'KATEGORI' ? 'KONSER' : 'JKT-2026-001'} value={targets} disabled={locked} onChange={(e) => setTargets(e.target.value)} />
              </FrmRow>
            )}
          </FrmSet>
          <p className="loading-hint">Kode 4–20 karakter huruf besar, angka, dan strip. Target: satu {scope === 'KATEGORI' ? 'kode kategori' : 'kode event'} per baris.</p>
        </>
      )}
    </Window>
  );
}
