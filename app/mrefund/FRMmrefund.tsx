// Padanan FRM pengajuan refund: cari tiket + cek syarat + nominal + alasan.
// Form ini dibuka lewat Modal (useModal), padanan window ExtJS.
'use client';
import { useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { formatIDR } from './Cmrefund';
import { check_ticket, search_ticket, process_apply } from './api';

type FoundTicket = {
  ATTENDEEID: number;
  TICKETCODE?: string;
  NAME?: string;
  EVENTTITLE?: string;
  PAYSTATUS?: string;
  ATTENDSTATUS?: string;
  TIKETSTATUS?: string;
  PRICE?: number | string;
};

export default function FRMmrefund({ onSaved }: { onSaved: () => void }) {
  const { close } = useModal();
  const [findQ, setFindQ] = useState('');
  const [found, setFound] = useState<FoundTicket[]>([]);
  const [finding, setFinding] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [check, setCheck] = useState<{ ELIGIBLE?: string; REASONS?: string[]; PRICE?: string; DEADLINE?: string; TICKET?: any } | null>(null);
  const [checking, setChecking] = useState(false);
  const [nominal, setNominal] = useState('');
  const [reason, setReason] = useState('');
  const [errs, setErrs] = useState<{ NOMINAL?: string; REASON?: string }>({});
  const [busy, setBusy] = useState(false);

  const find = async () => {
    if (!findQ.trim()) return;
    setFinding(true);
    try {
      const res: any = await search_ticket(findQ.trim());
      if (parseBoolean(res?.success)) setFound(res.Rows || []);
      else toast('Error', res?.message || 'Pencarian gagal.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setFinding(false);
    }
  };

  const pick = async (id: number) => {
    setPicked(id);
    setCheck(null);
    setChecking(true);
    try {
      const res: any = await check_ticket(id);
      if (parseBoolean(res?.success)) {
        const row = (res.Rows || [])[0] || {};
        setCheck(row);
        if (String(row.ELIGIBLE || '') === 'YES') setNominal(String(row.PRICE ?? ''));
      } else toast('Error', res?.message || 'Gagal memeriksa syarat.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setChecking(false);
    }
  };

  const save = async () => {
    if (picked == null) { toast('Error', 'Pilih tiket dulu.', 'err'); return; }
    const e: typeof errs = {};
    if (nominal.trim() === '' || Number.isNaN(Number(nominal)) || Number(nominal) < 0) e.NOMINAL = 'Nominal wajib diisi dan tidak negatif.';
    if (!reason.trim()) e.REASON = 'Alasan pengajuan wajib diisi.';
    else if (reason.trim().length > 200) e.REASON = 'Alasan maksimal 200 karakter.';
    setErrs(e);
    if (Object.keys(e).length) return;
    if (!await confirmDialog({ message: 'Ajukan refund?' })) return;
    setBusy(true);
    try {
      const res: any = await process_apply({ ATTENDEEID: picked, NOMINAL: nominal.trim(), REASON: reason.trim() });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Refund diajukan.', 'ok');
        onSaved();
        close();
      } else toast('Error', res?.message || 'Gagal mengajukan.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const eligible = String(check?.ELIGIBLE || '') === 'YES';

  return (
    <Window
      title="Ajukan Refund"
      icon="add"
      width="560px"
      footer={
        <>
          <Btn pid="btsave" className="primary" icon="save" disabled={busy} onClick={save}>Simpan</Btn>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Batal</Btn>
        </>
      }
    >
      <FrmSet legend="Tiket" icon="ticket" columns={1}>
        <FrmRow label="Cari">
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="input" placeholder="Kode atau nama tiket…" value={findQ} onChange={(e) => setFindQ(e.target.value)} />
            <Btn className="btn-sm" icon="search" disabled={finding} onClick={find}>Cari</Btn>
          </div>
        </FrmRow>
        {found.length > 0 && (
          <FrmRow label="Hasil">
            <select value={picked ?? ''} onChange={(e) => pick(e.target.value ? Number(e.target.value) : 0)}>
              <option value="">Pilih tiket</option>
              {found.map((t) => (
                <option key={t.ATTENDEEID} value={t.ATTENDEEID}>
                  {t.TICKETCODE} — {t.NAME} ({t.TIKETSTATUS}/{t.PAYSTATUS})
                </option>
              ))}
            </select>
          </FrmRow>
        )}
      </FrmSet>
      {checking && (
        <p className="loading-hint"><Icon name="refresh" size={16} /> Memeriksa syarat…</p>
      )}
      {check && (
        <FrmSet legend="Syarat" icon="check" columns={1}>
          {eligible ? (
            <p className="loading-hint"><Icon name="checkCircle" size={16} /> Memenuhi syarat. Nominal default = harga tiket ({formatIDR(check.PRICE)}).</p>
          ) : (
            <>
              <p className="toast-err alert-inline"><Icon name="alertCircle" size={17} /><span>Tidak memenuhi syarat:</span></p>
              <ul>
                {(check.REASONS || []).map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </>
          )}
          {check.DEADLINE && <p className="loading-hint">Batas pengajuan: {check.DEADLINE}.</p>}
        </FrmSet>
      )}
      <FrmSet legend="Pengajuan" icon="form" columns={1}>
        <FrmRow label="Nominal (Rp)">
          <div>
            <input className="input" type="number" min={0} value={nominal} onChange={(e) => { setNominal(e.target.value); setErrs((x) => ({ ...x, NOMINAL: undefined })); }} />
            {errs.NOMINAL && <span className="field-err">{errs.NOMINAL}</span>}
          </div>
        </FrmRow>
        <FrmRow label="Alasan">
          <div>
            <input className="input" placeholder="Alasan pengajuan (wajib)" value={reason} onChange={(e) => { setReason(e.target.value); setErrs((x) => ({ ...x, REASON: undefined })); }} maxLength={200} />
            {errs.REASON && <span className="field-err">{errs.REASON}</span>}
          </div>
        </FrmRow>
      </FrmSet>
    </Window>
  );
}
