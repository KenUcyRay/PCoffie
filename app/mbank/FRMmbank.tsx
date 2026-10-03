// Form tambah/ubah rekening. Dibuka lewat Modal (useModal).
// Ubah: kolom nomor kosong ("kosongkan jika tidak diubah"); mengisi nomor
// (atau ganti bank/nama pemilik) mengembalikan verifikasi ke awal.
'use client';
import { useEffect, useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { process_create, process_update, read_banks, read_detail, read_orgs, read_sellers } from './api';

export default function FRMmbank({
  isNew, bankAccountId, onSaved,
}: {
  isNew: boolean;
  bankAccountId?: number;
  onSaved: () => void;
}) {
  const { close } = useModal();
  const [otype, setOtype] = useState('SELLER');
  const [sellerid, setSellerid] = useState('');
  const [sellers, setSellers] = useState<any[]>([]);
  const [org, setOrg] = useState('');
  const [orgs, setOrgs] = useState<any[]>([]);
  const [orgQ, setOrgQ] = useState('');
  const [bankid, setBankid] = useState('');
  const [banks, setBanks] = useState<any[]>([]);
  const [acctno, setAcctno] = useState('');
  const [acctname, setAcctname] = useState('');
  const [verify, setVerify] = useState('BELUM_VERIFIKASI');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [fieldErr, setFieldErr] = useState('');

  // Opsi bank + penjual (sekali saat buka).
  useEffect(() => {
    read_banks()
      .then((res: any) => { if (parseBoolean(res?.success)) setBanks(res.Rows || []); })
      .catch(() => { /* dropdown kosong: backend tetap validasi */ });
    read_sellers()
      .then((res: any) => { if (parseBoolean(res?.success)) setSellers(res.Rows || []); })
      .catch(() => { /* dropdown kosong: backend tetap validasi */ });
    read_orgs('')
      .then((res: any) => { if (parseBoolean(res?.success)) setOrgs(res.Rows || []); })
      .catch(() => { /* dropdown kosong: backend tetap validasi */ });
  }, []);

  // Cari nama penyelenggara (dari T_EVENT).
  const searchOrgs = async () => {
    try {
      const res: any = await read_orgs(orgQ.trim());
      if (parseBoolean(res?.success)) setOrgs(res.Rows || []);
      else toast('Error', res?.message || 'Pencarian gagal.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  };

  // Muat data untuk mode ubah (nomor dikosongkan).
  useEffect(() => {
    if (isNew || !bankAccountId) return;
    setLoading(true);
    setErr('');
    read_detail(bankAccountId)
      .then((res: any) => {
        if (!parseBoolean(res?.success)) {
          setErr(res?.message || 'Gagal memuat data.');
          return;
        }
        const d = (res.Rows || [])[0] || {};
        setOtype(String(d.OWNERTYPE || 'SELLER'));
        setSellerid(d.SELLERID != null ? String(d.SELLERID) : '');
        setOrg(String(d.ORGNAME || ''));
        setBankid(d.BANKID != null ? String(d.BANKID) : '');
        setAcctname(String(d.ACCTNAME || ''));
        setVerify(String(d.VERIFYSTATUS || 'BELUM_VERIFIKASI'));
      })
      .catch((e: any) => setErr(e.message || 'Gagal memuat data.'))
      .finally(() => setLoading(false));
  }, [isNew, bankAccountId]);

  const save = async () => {
    setFieldErr('');
    if (!isNew && acctno.trim() !== '' && !/^[0-9 ]+$/.test(acctno.trim())) {
      setFieldErr('Nomor rekening hanya boleh berisi angka.');
      return;
    }
    const payload = {
      BANKACCOUNTID: isNew ? undefined : bankAccountId,
      OWNERTYPE: otype,
      SELLERID: sellerid.trim(),
      ORGNAME: org.trim(),
      BANKID: bankid.trim(),
      ACCTNO: acctno.trim(),
      ACCTNAME: acctname.trim(),
    };
    if (!await confirmDialog({ message: isNew ? 'Buat rekening ini?' : 'Simpan perubahan rekening?' })) return;
    setBusy(true);
    try {
      const res: any = isNew ? await process_create(payload) : await process_update(payload);
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Rekening tersimpan.', 'ok');
        onSaved();
        close();
      } else {
        // Pesan validasi per kolom dari backend.
        setFieldErr(res?.message || 'Gagal menyimpan.');
      }
    } catch (e: any) {
      setFieldErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Window
      title={isNew ? 'Tambah Rekening' : 'Ubah Rekening'}
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
          {!isNew && verify !== 'BELUM_VERIFIKASI' && (
            <div className="toast-err alert-inline">
              <Icon name="alertCircle" size={17} />
              <span>Mengganti bank, nomor, atau nama pemilik mengembalikan verifikasi ke BELUM_VERIFIKASI.</span>
            </div>
          )}
          <FrmSet legend="Rekening" icon="form" columns={2}>
            <FrmRow label="Jenis pemilik">
              <select value={otype} onChange={(e) => setOtype(e.target.value)}>
                <option value="SELLER">Penjual</option>
                <option value="ORGANIZER">Penyelenggara</option>
              </select>
            </FrmRow>
            <FrmRow label="Bank">
              <select value={bankid} onChange={(e) => setBankid(e.target.value)}>
                <option value="">— pilih —</option>
                {banks.map((b) => (
                  <option key={b.BANKID} value={b.BANKID}>{b.BANKNAME}</option>
                ))}
              </select>
            </FrmRow>
            {otype === 'SELLER' ? (
              <FrmRow label="Penjual">
                <select value={sellerid} onChange={(e) => setSellerid(e.target.value)}>
                  <option value="">— pilih —</option>
                  {sellers.map((s) => (
                    <option key={s.SELLERID} value={s.SELLERID}>{s.SHOPNAME} ({s.SELLERCODE})</option>
                  ))}
                </select>
              </FrmRow>
            ) : (
              <FrmRow label="Penyelenggara">
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="input" placeholder="ketik lalu cari" value={orgQ} onChange={(e) => setOrgQ(e.target.value)} />
                  <Btn className="btn-sm" icon="search" onClick={searchOrgs}>Cari</Btn>
                </div>
              </FrmRow>
            )}
            {otype === 'ORGANIZER' && (
              <FrmRow label="Nama dipilih">
                <select value={org} onChange={(e) => setOrg(e.target.value)}>
                  <option value="">— pilih —</option>
                  {orgs.map((o: any) => (
                    <option key={o.ORGNAME} value={o.ORGNAME}>{o.ORGNAME}</option>
                  ))}
                </select>
              </FrmRow>
            )}
            <FrmRow label="Nomor rekening">
              <div>
                <input
                  className="input" style={{ fontFamily: 'monospace' }} inputMode="numeric"
                  placeholder={isNew ? 'hanya angka, 6–20 digit' : 'kosongkan jika tidak diubah'}
                  value={acctno} onChange={(e) => setAcctno(e.target.value.replace(/[^0-9 ]/g, ''))} maxLength={24}
                />
                {!isNew && <span className="loading-hint">Kosongkan jika tidak diubah.</span>}
              </div>
            </FrmRow>
            <FrmRow label="Nama pemilik">
              <input className="input" value={acctname} onChange={(e) => setAcctname(e.target.value)} maxLength={100} />
            </FrmRow>
          </FrmSet>
          {fieldErr && <div className="toast-err alert-inline"><Icon name="alertCircle" size={17} /><span>{fieldErr}</span></div>}
        </>
      )}
    </Window>
  );
}
