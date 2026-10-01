// Pengganti COMP.TipToast.msgbox: pesan singkat di pojok layar.
'use client';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';

type Item = { id: number; kind: 'ok' | 'err'; title: string; text: string };
let seq = 0;

export function toast(title: string, text: string, kind: 'ok' | 'err', delay = 3000) {
  if (typeof window === 'undefined') return;
  const id = ++seq;
  window.dispatchEvent(new CustomEvent('appcore:toast', { detail: { id, title, text, kind, delay } }));
}

export function ToastHost() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent).detail as Item & { delay?: number };
      setItems((prev) => [...prev, { id: d.id, kind: d.kind, title: d.title, text: d.text }]);
      const t = setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== d.id)), d.delay ?? 3000);
      return () => clearTimeout(t);
    };
    window.addEventListener('appcore:toast', onToast);
    return () => window.removeEventListener('appcore:toast', onToast);
  }, []);

  if (!items.length) return null;
  return (
    <div className="toast-host">
      {items.map((i) => (
        <div key={i.id} className={`toast-item ${i.kind === 'ok' ? 'toast-ok' : 'toast-err'}`}>
          <Icon name={i.kind === 'ok' ? 'checkCircle' : 'alertCircle'} size={17} />
          <div>
            <b>{i.title}</b>
            <div>{i.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}