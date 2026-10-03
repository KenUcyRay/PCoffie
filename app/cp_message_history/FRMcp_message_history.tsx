// Padanan FRM riwayat pesan: detail pesan + daftar penerima + tarik pesan.
// Dibuka lewat Modal (useModal), padanan window ExtJS. Tanpa ubah isi/hapus.
'use client';
import { useCallback, useEffect, useState } from 'react';
import { parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast'
import { confirmDialog } from '@/components/Confirm';
import { Btn, Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { formatTanggal } from './Ccp_message_history';
import { read_detail, read_recipients, process_recall } from './api';

const RECIP_PAGE = 25;

type RecipRow = {
  RECIPIENTID?: number;
  USERID?: number;
  USERLOGIN?: string;
  READSTATUS?: string;
  READTIME?: string;
};

export default function FRMcp_message_history({
  msgid,
  canWrite,
  onRecalled,
}: {
  msgid: number;
  canWrite: boolean;
  onRecalled: () => void;
}) {
  const { close } = useModal();
  const [detail, setDetail] = useState<any>(null);
  const [recips, setRecips] = useState<RecipRow[]>([]);
  const [recipPage, setRecipPage] = useState(0);
  const [recipTotal, setRecipTotal] = useState(0);
  const [recipQ, setRecipQ] = useState('');
  const [recipStatus, setRecipStatus] = useState('');
  const [reason, setReason] = useState('');
  const [reasonErr, setReasonErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res: any = await read_detail(msgid);
      if (parseBoolean(res?.success)) setDetail((res.Rows || [])[0] || null);
      else setErr(res?.message || 'Gagal memuat data.');
    } catch (e: any) {
      setErr(e.message || 'Gagal memuat data.');
    } finally {
      setLoading(false);
    }
  }, [msgid]);

  const loadRecips = useCallback(async (p?: number, q?: string, st?: string) => {
    try {
      const res: any = await read_recipients({
        msgid, limit: RECIP_PAGE, offset: (p ?? recipPage) * RECIP_PAGE,
        q: q ?? recipQ, readstatus: st ?? recipStatus,
      });
      if (parseBoolean(res?.success)) {
        setRecips(res.Rows || []);
        setRecipTotal(Number(res.TotalRows) || 0);
        if (p !== undefined) setRecipPage(p);
      }
    } catch { /* daftar penerima gagal: biarkan kosong */ }
  }, [msgid, recipPage, recipQ, recipStatus]);

  useEffect(() => {
    loadDetail();
    loadRecips(0, '', '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgid]);

  const recall = async () => {
    if (!reason.trim()) { setReasonErr('Alasan penarikan wajib diisi.'); return; }
    if (reason.trim().length > 200) { setReasonErr('Alasan maksimal 200 karakter.'); return; }
    if (!await confirmDialog({ message: `Tarik pesan "${detail?.TITLE || ''}"? Pesan hilang dari inbox penerima.`, okText: 'Ya, Tarik', danger: true })) return;
    setBusy(true);
    try {
      const res: any = await process_recall({ MSGID: msgid, REASON: reason.trim() });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message || 'Pesan berhasil ditarik.', 'ok');
        onRecalled();
        close();
      } else toast('Error', res?.message || 'Gagal menarik pesan.', 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  const recalled = String(detail?.STATUS || '').toUpperCase() === 'DITARIK';

  return (
    <Window
      title="Detail Pesan"
      icon="history"
      width="720px"
      footer={
        <>
          <span className="frm-foot-gap" />
          <Btn icon="close" onClick={close}>Tutup</Btn>
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
          <Btn className="btn-sm" icon="refresh" onClick={() => loadDetail()}>Coba lagi</Btn>
        </div>
      ) : detail ? (
        <>
          <FrmSet legend="Pesan" icon="mail" columns={2}>
            <FrmRow label="Judul"><span><b>{detail.TITLE}</b></span></FrmRow>
            <FrmRow label="Prioritas">
              <span className={`badge ${detail.PRIORITY === 'DARURAT' ? 'err' : detail.PRIORITY === 'PENTING' ? '' : 'ok'}`}>
                {detail.PRIORITY}
              </span>
            </FrmRow>
            <FrmRow label="Isi"><span style={{ whiteSpace: 'pre-wrap' }}>{detail.BODY}</span></FrmRow>
            <FrmRow label="Target"><span>{detail.TARGETTYPE} • {detail.RECIPIENTCOUNT} penerima • dibaca {detail.READCOUNT} ({detail.READPCT}%)</span></FrmRow>
            <FrmRow label="Pengirim"><span>{detail.SENDERLOGIN || '-'}</span></FrmRow>
            <FrmRow label="Dikirim"><span>{formatTanggal(detail.SENTAT)}</span></FrmRow>
            <FrmRow label="Berakhir tampil"><span>{formatTanggal(detail.EXPIRESAT)}</span></FrmRow>
            <FrmRow label="Status">
              <span className={`badge ${recalled ? 'err' : 'ok'}`}>{detail.STATUS}</span>
            </FrmRow>
            {recalled && (
              <FrmRow label="Penarikan">
                <span>{formatTanggal(detail.RECALLTIME)} oleh {detail.RECALLBY || '-'} — {detail.RECALLREASON || '-'}</span>
              </FrmRow>
            )}
          </FrmSet>
          <FrmSet legend={`Penerima (${recipTotal})`} icon="user" columns={1}>
            <div className="toolbar" style={{ flexWrap: 'wrap' }}>
              <input
                className="input" placeholder="Cari username…" value={recipQ}
                onChange={(e) => { setRecipQ(e.target.value); loadRecips(0, e.target.value, recipStatus); }}
                style={{ flex: 1, minWidth: 140 }}
              />
              <select value={recipStatus} onChange={(e) => { setRecipStatus(e.target.value); loadRecips(0, recipQ, e.target.value); }} style={{ width: 140 }}>
                <option value="">Semua status</option>
                <option value="BELUM_DIBACA">BELUM_DIBACA</option>
                <option value="DIBACA">DIBACA</option>
              </select>
            </div>
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr><th>Username</th><th>Status baca</th><th>Waktu baca</th></tr>
                </thead>
                <tbody>
                  {recips.map((r) => (
                    <tr key={r.RECIPIENTID}>
                      <td>{r.USERLOGIN || '-'}</td>
                      <td>
                        <span className={`badge ${String(r.READSTATUS || '').toUpperCase() === 'DIBACA' ? 'ok' : ''}`}>
                          {r.READSTATUS}
                        </span>
                      </td>
                      <td>{formatTanggal(r.READTIME)}</td>
                    </tr>
                  ))}
                  {!recips.length && (
                    <tr><td colSpan={3}><span className="empty-hint">Tidak ada penerima.</span></td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {recipTotal > RECIP_PAGE && (
              <div className="toolbar bbar">
                <Btn className="btn-sm" icon="prev" disabled={recipPage <= 0} onClick={() => loadRecips(recipPage - 1)}>Prev</Btn>
                <span className="pageinfo">{recipPage + 1}/{Math.max(1, Math.ceil(recipTotal / RECIP_PAGE))}</span>
                <Btn className="btn-sm" icon="next" disabled={(recipPage + 1) * RECIP_PAGE >= recipTotal} onClick={() => loadRecips(recipPage + 1)}>Next</Btn>
              </div>
            )}
          </FrmSet>
          {!recalled && canWrite && (
            <FrmSet legend="Tarik Pesan" icon="close" columns={1}>
              <FrmRow label="Alasan">
                <div>
                  <input
                    className="input" placeholder="Alasan penarikan (wajib)"
                    value={reason} onChange={(e) => { setReason(e.target.value); setReasonErr(''); }}
                  />
                  {reasonErr && <span className="field-err">{reasonErr}</span>}
                </div>
              </FrmRow>
              <div className="toolbar">
                <Btn className="danger btn-sm" icon="close" disabled={busy} onClick={recall}>
                  {busy ? 'Menarik…' : 'Tarik Pesan'}
                </Btn>
              </div>
            </FrmSet>
          )}
        </>
      ) : null}
    </Window>
  );
}
