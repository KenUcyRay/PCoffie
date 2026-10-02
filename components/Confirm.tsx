// Pengganti window.confirm / Ext.Msg.confirm: dialog konfirmasi modern yang
// tampil sebagai window aplikasi (bukan alert bawaan browser).
//
// Cara pakai (seperti toast): panggil dari mana saja, tunggu hasilnya.
//   if (!await confirmDialog({ message: 'Hapus User Group: X?' })) return;
//   ...lanjut hapus...
//
// Opsi danger=true membuat tombol Ya berwarna merah dan fokus awal di Batal
// (menghindari hapus tidak sengaja). Batal / ESC / klik backdrop = false.
'use client';
import { useCallback, useEffect, useState } from 'react';
import { Btn, Icon } from './Icon';
import { Window } from './Window';

export type ConfirmOptions = {
  /** Judul window. Default 'Konfirmasi' (seperti Ext.Msg.confirm langit_v2). */
  title?: string;
  message: string;
  /** Teks tombol setuju. Default 'Ya'. */
  okText?: string;
  /** Teks tombol batal. Default 'Batal'. */
  cancelText?: string;
  /** true = aksi destruktif (hapus): tombol Ya merah, fokus awal di Batal. */
  danger?: boolean;
};

type Req = { id: number; title: string; message: string; okText: string; cancelText: string; danger: boolean };

let seq = 0;
const resolvers = new Map<number, (v: boolean) => void>();

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    const id = ++seq;
    resolvers.set(id, resolve);
    window.dispatchEvent(new CustomEvent('appcore:confirm', {
      detail: {
        id,
        title: 'Konfirmasi',
        okText: 'Ya',
        cancelText: 'Batal',
        danger: false,
        ...opts,
      } satisfies Req,
    }));
  });
}

function settle(id: number, v: boolean) {
  const r = resolvers.get(id);
  resolvers.delete(id);
  r?.(v);
}

export function ConfirmHost() {
  const [queue, setQueue] = useState<Req[]>([]);

  useEffect(() => {
    const onReq = (e: Event) => setQueue((prev) => [...prev, (e as CustomEvent).detail as Req]);
    window.addEventListener('appcore:confirm', onReq);
    return () => window.removeEventListener('appcore:confirm', onReq);
  }, []);

  const cur = queue[0];

  const done = useCallback((v: boolean) => {
    setQueue((prev) => {
      const head = prev[0];
      if (head) settle(head.id, v);
      return prev.slice(1);
    });
  }, []);

  useEffect(() => {
    if (!cur) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') done(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cur, done]);

  if (!cur) return null;

  return (
    <Window
      key={cur.id}
      title={cur.title}
      icon={cur.danger ? 'alertCircle' : 'info'}
      width="420px"
      footer={
        <>
          <span className="spacer" />
          <Btn icon="close" onClick={() => done(false)} autoFocus={cur.danger}>{cur.cancelText}</Btn>
          <Btn
            className={cur.danger ? 'danger' : 'primary'}
            icon={cur.danger ? 'del' : 'check'}
            onClick={() => done(true)}
            autoFocus={!cur.danger}
          >
            {cur.okText}
          </Btn>
        </>
      }
    >
      <p className={`confirm-msg ${cur.danger ? 'danger' : 'info'}`}>
        <Icon name={cur.danger ? 'alertCircle' : 'info'} size={20} />
        <span>{cur.message}</span>
      </p>
    </Window>
  );
}
