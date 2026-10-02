// Padanan FRM system log: info lengkap + konteks JSON + stack trace collapsible.
// Form ini dibuka lewat Modal (useModal), padanan window ExtJS. Read-only.
'use client';
import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { useModal } from '@/components/Modal';
import { Btn } from '@/components/Icon';
import { toast } from '@/components/toast';
import { formatTanggal, copyText } from './Ccp_syslog';
import type { SysRow } from './GRIDcp_syslog';

export default function FRMcp_syslog({ row, onClose }: { row: SysRow; onClose?: () => void }) {
  const { close } = useModal();
  const dismiss = () => { if (onClose) onClose(); close(); };
  const [stackOpen, setStackOpen] = useState(false);

  let ctx: unknown = null;
  try {
    ctx = row.CONTEXTJSON ? JSON.parse(String(row.CONTEXTJSON)) : null;
  } catch { ctx = String(row.CONTEXTJSON); }

  const doCopy = async () => {
    const ok = await copyText(String(row.STACKTRACE || ''));
    toast(ok ? 'Success' : 'Error', ok ? 'Stack trace disalin.' : 'Gagal menyalin.', ok ? 'ok' : 'err');
  };

  return (
    <Window title="Detail System Log" icon="history" width="720px" footer={
      <Btn icon="close" onClick={dismiss}>Tutup</Btn>
    }>
      <FrmSet legend="Ringkasan" icon="info" columns={2}>
        <FrmRow label="Waktu"><span>{formatTanggal(row.LOGTIME)}</span></FrmRow>
        <FrmRow label="Level"><span>{row.LOGLEVEL}</span></FrmRow>
        <FrmRow label="Sumber"><span>{row.LOGSOURCE || '-'}</span></FrmRow>
        <FrmRow label="HTTP"><span>{row.HTTPSTATUS ?? '-'}</span></FrmRow>
        <FrmRow label="User"><span>{row.USERLOGIN || '-'}</span></FrmRow>
        <FrmRow label="IP"><span>{row.USERIP || '-'}</span></FrmRow>
        <FrmRow label="URL"><span style={{ wordBreak: 'break-all' }}>{[row.METHOD, row.URL].filter(Boolean).join(' ') || '-'}</span></FrmRow>
        <FrmRow label="Pesan"><span>{row.MESSAGE || '-'}</span></FrmRow>
      </FrmSet>

      <FrmSet legend="Konteks" icon="grid" columns={1}>
        {!ctx && <p className="empty-hint"><Icon name="info" size={16} /> Tidak ada konteks.</p>}
        {!!ctx && (
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12 }}>
            {typeof ctx === 'string' ? ctx : JSON.stringify(ctx, null, 2)}
          </pre>
        )}
      </FrmSet>

      <FrmSet legend="Stack Trace" icon="alert" columns={1}>
        {!row.STACKTRACE && <p className="empty-hint"><Icon name="info" size={16} /> Tidak ada stack trace.</p>}
        {!!row.STACKTRACE && (
          <>
            <div>
              <Btn className="btn-sm" icon={stackOpen ? 'chevD' : 'chevR'} onClick={() => setStackOpen((v) => !v)}>
                {stackOpen ? 'Sembunyikan' : 'Tampilkan'}
              </Btn>
              {' '}
              <Btn className="btn-sm" icon="download" onClick={doCopy}>Salin</Btn>
            </div>
            {stackOpen && (
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11.5, maxHeight: 260, overflowY: 'auto' }}>
                {String(row.STACKTRACE)}
              </pre>
            )}
          </>
        )}
      </FrmSet>
    </Window>
  );
}
