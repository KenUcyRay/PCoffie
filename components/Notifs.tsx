// Pusat notifikasi ringan: setiap toast(ok/err) juga tercatat sebagai notifikasi,
// dibaca lewat lonceng di TopBar mode desktop. In-memory (hilang saat refresh),
// tanpa backend — riwayat presisten bukan kebutuhan panel ini.
'use client';
import { useCallback, useEffect, useState } from 'react';

export type Notif = { id: number; kind: 'ok' | 'err'; title: string; text: string; at: number };

let seq = 0;
const store: Notif[] = [];
const subs = new Set<() => void>();
const MAX = 30;

function emit(n: Notif) {
  store.unshift(n);
  while (store.length > MAX) store.pop();
  subs.forEach((fn) => fn());
}

function snapshot(): Notif[] {
  return [...store];
}

export function pushNotif(kind: 'ok' | 'err', title: string, text: string) {
  if (typeof window === 'undefined') return;
  emit({ id: ++seq, kind, title, text, at: Date.now() });
}

// Jembatan otomatis: toast() yang sudah ada ikut tercatat (sekali per event).
export function NotifBridge() {
  useEffect(() => {
    const onToast = (e: Event) => {
      const d = (e as CustomEvent).detail as { title?: string; text?: string; kind?: 'ok' | 'err' };
      if (!d || (d.kind !== 'ok' && d.kind !== 'err')) return;
      emit({ id: ++seq, kind: d.kind, title: String(d.title || ''), text: String(d.text || ''), at: Date.now() });
    };
    window.addEventListener('appcore:toast', onToast);
    return () => window.removeEventListener('appcore:toast', onToast);
  }, []);
  return null;
}

export function useNotifs() {
  const [items, setItems] = useState<Notif[]>(() => snapshot());
  const [seenId, setSeenId] = useState(0);
  useEffect(() => {
    const refresh = () => setItems(snapshot());
    subs.add(refresh);
    return () => { subs.delete(refresh); };
  }, []);
  const unread = items.filter((n) => n.id > seenId).length;
  const markAllRead = useCallback(() => {
    setSeenId(items.length ? items[0].id : seenId);
  }, [items, seenId]);
  const clear = useCallback(() => {
    store.length = 0;
    subs.forEach((fn) => fn());
  }, []);
  return { items, unread, markAllRead, clear };
}
