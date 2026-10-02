// Padanan FRM audit log: informasi lengkap + data sebelum/sesudah berdampingan.
// Form ini dibuka lewat Modal (useModal), padanan window ExtJS.
'use client';
import { Icon } from '@/components/Icon';
import { Window, FrmRow, FrmSet } from '@/components/Window';
import { useModal } from '@/components/Modal';
import { Btn } from '@/components/Icon';
import { formatTanggal } from './Ccp_auditlog';
import type { AuditRow } from './GRIDcp_auditlog';

type DiffRow = { key: string; before: string; after: string; changed: boolean };

function parseJSON(s: unknown): Record<string, unknown> | null {
  if (!s || typeof s !== 'string') return null;
  try {
    const o = JSON.parse(s);
    return o && typeof o === 'object' ? o as Record<string, unknown> : null;
  } catch { return null; }
}

export default function FRMcp_auditlog({ row, onClose }: { row: AuditRow; onClose?: () => void }) {
  const { close } = useModal();
  const dismiss = () => { if (onClose) onClose(); close(); };
  const before = parseJSON(row.BEFOREJSON);
  const after = parseJSON(row.AFTERJSON);
  const keys = Array.from(new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ])).sort();
  const diffs: DiffRow[] = keys.map((k) => {
    const b = before ? String((before as any)[k] ?? '') : '';
    const a = after ? String((after as any)[k] ?? '') : '';
    return { key: k, before: b, after: a, changed: b !== a };
  });

  return (
    <Window title="Detail Audit Log" icon="history" width="720px" footer={
      <Btn icon="close" onClick={dismiss}>Tutup</Btn>
    }>
      <FrmSet legend="Ringkasan" icon="info" columns={2}>
        <FrmRow label="Waktu"><span>{formatTanggal(row.LOGTIME)}</span></FrmRow>
        <FrmRow label="User"><span>{row.USERLOGIN || '-'} {row.USERNAME ? `(${row.USERNAME})` : ''}</span></FrmRow>
        <FrmRow label="Aksi"><span>{row.ACTION}</span></FrmRow>
        <FrmRow label="Halaman"><span>{row.PAGENAME || '-'}</span></FrmRow>
        <FrmRow label="MControl"><span>{row.MCONTROL || '-'}</span></FrmRow>
        <FrmRow label="Tabel"><span>{row.TABLENAME || '-'}</span></FrmRow>
        <FrmRow label="Data ID"><span>{row.DATAID || '-'}</span></FrmRow>
        <FrmRow label="IP"><span>{row.USERIP || '-'}</span></FrmRow>
        <FrmRow label="Ringkasan"><span>{row.SUMMARY || '-'}</span></FrmRow>
        <FrmRow label="Agent"><span style={{ wordBreak: 'break-all' }}>{row.USERAGENT || '-'}</span></FrmRow>
      </FrmSet>

      <FrmSet legend="Perubahan" icon="edit" columns={1}>
        {diffs.length === 0 && <p className="empty-hint"><Icon name="info" size={16} /> Tidak ada data sebelum/sesudah.</p>}
        {diffs.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="grid" style={{ minWidth: 520 }}>
              <thead><tr><th>Kolom</th><th>Sebelum</th><th>Sesudah</th></tr></thead>
              <tbody>
                {diffs.map((d) => (
                  <tr key={d.key} style={d.changed ? { background: 'var(--brand-soft)' } : undefined}>
                    <td><b>{d.key}</b></td>
                    <td style={{ color: d.changed ? 'var(--danger)' : undefined }}>{d.before || <span className="loading-hint">-</span>}</td>
                    <td style={{ color: d.changed ? 'var(--brand-2)' : undefined }}>{d.after || <span className="loading-hint">-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FrmSet>
    </Window>
  );
}
