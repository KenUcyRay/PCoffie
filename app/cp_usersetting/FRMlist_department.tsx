'use client';
import { useEffect, useState } from 'react';
import { apiPost, parseBoolean } from '@/lib/api';
import { useModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Btn, EmptyRow, Icon } from '@/components/Icon';

export type Dept = { DEPTCODE: string; DEPTNAME: string };

// Padanan FRMlist_department.js langit_v2: grid checkbox + tombol "Pilih Department".
export default function FRMlist_department({ onSelect }: { onSelect: (rows: Dept[]) => void }) {
  const { close } = useModal();
  const [rows, setRows] = useState<Dept[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');

  useEffect(() => {
    (async () => {
      const res: any = await apiPost('home/cpusergroup/cpusergroup', { method: 'read_department' });
      if (parseBoolean(res?.success)) setRows((res.Rows || []).map((r: any) => ({ DEPTCODE: r.DEFCODE, DEPTNAME: r.DEFNAME })));
      else toast('Error', res?.message || 'Gagal memuat department.', 'err');
    })();
  }, []);

  const shown = rows.filter((r) =>
    !filter.trim() ||
    String(r.DEPTCODE).toLowerCase().includes(filter.toLowerCase()) ||
    String(r.DEPTNAME).toLowerCase().includes(filter.toLowerCase()),
  );

  const toggle = (code: string, on: boolean) => {
    const next = new Set(sel);
    if (on) next.add(code); else next.delete(code);
    setSel(next);
  };

  const choose = () => {
    const picked = rows.filter((r) => sel.has(r.DEPTCODE));
    onSelect(picked);
    close();
  };

  return (
    <>
      <div className="modal-head"><Icon name="dept" size={17} /> Pilih Department</div>
      <div className="modal-toolbar">
        <span className="field-with-icon">
          <Icon name="filter" size={15} />
          <input className="input" placeholder="Filter kode / department" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </span>
        <Btn className="primary" icon="check" onClick={choose} disabled={!sel.size}>Pilih Department</Btn>
      </div>
      <div className="table-wrap">
        <table className="grid">
          <thead><tr><th style={{ width: 36 }} /><th>Kode</th><th>Department</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.DEPTCODE}>
                <td><input type="checkbox" checked={sel.has(r.DEPTCODE)} onChange={(e) => toggle(r.DEPTCODE, e.target.checked)} /></td>
                <td>{r.DEPTCODE}</td>
                <td>{r.DEPTNAME}</td>
              </tr>
            ))}
            {!shown.length && <EmptyRow colSpan={3} />}
          </tbody>
        </table>
      </div>
    </>
  );
}