// Mainpage menu cp_fee (MCONTROL = cp_fee).
//
// Berbeda dari grid biasa: kartu Pengaturan Saat Ini + Dijadwalkan di atas,
// riwayat versi di bawah. State current/scheduled milik mainpage (bukan GRID)
// karena dipakai kartu atas dan prefill form. Controller tetap stateless.
// Dipanggil default oleh MenuHost, jadi tanpa <Shell>.
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Btn, Icon } from '@/components/Icon';
import { PageHead } from '@/components/Page';
import { toast } from '@/components/toast';
import { confirmDialog } from '@/components/Confirm';
import { parseBoolean } from '@/lib/api';
import { init as controller_init, btrefresh_click, btnew_click, formatIDR, formatPct, formatTanggal } from './Ccp_fee';
import GRIDcp_fee, { type FeeRow, type GridApi } from './GRIDcp_fee';
import type { FeeForm } from './FRMcp_fee';
import { read_effective, read_scheduled, cancel_version } from './api';

export type FeeCurrent = FeeRow | null;

function toFeeForm(r: FeeRow): FeeForm {
  return {
    EFFECTIVEFROM: String(r.EFFECTIVEFROM || '').slice(0, 10),
    PLATFORMPCT: String(r.PLATFORMPCT ?? '0'),
    PLATFORMFIX: String(r.PLATFORMFIX ?? '0'),
    SERVICEPERTICKET: String(r.SERVICEPERTICKET ?? '0'),
    WITHDRAWFEE: String(r.WITHDRAWFEE ?? '0'),
    MINWITHDRAW: r.MINWITHDRAW === null || r.MINWITHDRAW === undefined || r.MINWITHDRAW === '' ? '' : String(r.MINWITHDRAW),
    PAYOUTWAITDAYS: String(r.PAYOUTWAITDAYS ?? '0'),
    PAYTIMEOUTMIN: String(r.PAYTIMEOUTMIN ?? '15'),
    FEENOTE: '',
  };
}

function ValueGrid({ r }: { r: FeeRow }) {
  const items: [string, string][] = [
    ['Platform', `${formatPct(r.PLATFORMPCT)} + ${formatIDR(r.PLATFORMFIX)}`],
    ['Layanan / tiket', formatIDR(r.SERVICEPERTICKET)],
    ['Penarikan', `${formatIDR(r.WITHDRAWFEE)} (min. ${formatIDR(r.MINWITHDRAW)})`],
    ['Tunggu payout', `${r.PAYOUTWAITDAYS ?? '-'} hari`],
    ['Batas bayar', `${r.PAYTIMEOUTMIN ?? '-'} menit`],
  ];
  return (
    <div className="stat-grid">
      {items.map(([label, value]) => (
        <div key={label} className="stat-card">
          <span className="stat-info"><b>{value}</b><span>{label}</span></span>
        </div>
      ))}
    </div>
  );
}

export default function cp_fee() {
  // ExtJS reference: "cp_fee"
  const grid = useRef<GridApi>(null);
  const [current, setCurrent] = useState<FeeCurrent>(null);
  const [scheduled, setScheduled] = useState<FeeCurrent>(null);
  const [loadingTop, setLoadingTop] = useState(false);
  const [errTop, setErrTop] = useState('');

  const loadTop = useCallback(async () => {
    setLoadingTop(true);
    setErrTop('');
    try {
      const [ce, sc] = await Promise.all([read_effective(), read_scheduled()]);
      if (!parseBoolean((ce as any)?.success)) { setErrTop((ce as any)?.message || 'Gagal memuat pengaturan.'); return; }
      if (!parseBoolean((sc as any)?.success)) { setErrTop((sc as any)?.message || 'Gagal memuat jadwal.'); return; }
      setCurrent(((ce as any).Rows || [])[0] || null);
      setScheduled(((sc as any).Rows || [])[0] || null);
    } catch (e: any) {
      setErrTop(e.message || 'Gagal memuat pengaturan.');
    } finally {
      setLoadingTop(false);
    }
  }, []);

  useEffect(() => {
    controller_init();
    loadTop();
  }, [loadTop]);

  const refreshAll = useCallback(() => {
    btrefresh_click(grid.current);
    loadTop();
  }, [loadTop]);

  const openVersion = useCallback(() => {
    btnew_click(grid.current, current ? toFeeForm(current) : undefined);
  }, [current]);

  const cancelScheduled = useCallback(async () => {
    if (!scheduled?.FEEID) return;
    if (!await confirmDialog({
      message: `Batalkan versi berlaku ${formatTanggal(scheduled.EFFECTIVEFROM)}?`,
      okText: 'Ya, Batalkan', danger: true,
    })) return;
    try {
      const res: any = await cancel_version({ FEEID: scheduled.FEEID });
      if (parseBoolean(res?.success)) {
        toast('Success', res.message, 'ok');
        refreshAll();
      } else toast('Error', res?.message, 'err');
    } catch (e: any) {
      toast('Error', e.message, 'err');
    }
  }, [scheduled, refreshAll]);

  return (
    <>
      <PageHead
        icon="cash"
        title="Fee Setting"
        subtitle="Versi pengaturan fee. Versi lama tidak bisa diubah atau dihapus."
      />

      {errTop && (
        <div className="toast-err alert-inline">
          <Icon name="alertCircle" size={17} />
          <span>{errTop}</span>
          <Btn className="btn-sm" icon="refresh" onClick={loadTop}>Coba lagi</Btn>
        </div>
      )}
      {loadingTop && (
        <div className="card"><div className="card-body">
          <span className="loading-hint"><Icon name="loading" size={16} className="spin" /> Memuat…</span>
        </div></div>
      )}

      {!loadingTop && !errTop && current && (
        <div className="card">
          <div className="card-head">
            <b><Icon name="checkCircle" size={16} /> Pengaturan Saat Ini</b>
            <span className="loading-hint">Berlaku sejak {formatTanggal(current.EFFECTIVEFROM)}</span>
          </div>
          <div className="card-body">
            <ValueGrid r={current} />
            {current.FEENOTE && <p className="empty-hint"><Icon name="info" size={16} /> {current.FEENOTE}</p>}
          </div>
        </div>
      )}

      {!loadingTop && !errTop && !current && (
        <div className="card"><div className="card-body">
          <p className="empty-hint"><Icon name="alertCircle" size={16} /> Belum ada pengaturan yang berlaku.</p>
        </div></div>
      )}

      {!loadingTop && !errTop && scheduled && (
        <div className="card">
          <div className="card-head">
            <b><Icon name="calendar" size={16} /> Dijadwalkan</b>
            <span className="loading-hint">Berlaku {formatTanggal(scheduled.EFFECTIVEFROM)}</span>
          </div>
          <div className="card-body">
            <ValueGrid r={scheduled} />
            <div>
              <Btn className="danger btn-sm" icon="close" onClick={cancelScheduled}>
                Batalkan versi ini
              </Btn>
            </div>
          </div>
        </div>
      )}

      <div className="card card-grid">
        <div className="toolbar">
          <Btn
            pid="btrefresh"
            iconOnly
            icon="refresh"
            title="Refresh Data"
            aria-label="Refresh Data"
            onClick={refreshAll}
          />
          <Btn pid="btnew" className="primary" icon="add" onClick={openVersion}>Ubah Pengaturan</Btn>
          <span className="loading-hint">Riwayat versi</span>
        </div>
        <GRIDcp_fee ref={grid} onChanged={loadTop} />
      </div>
    </>
  );
}
