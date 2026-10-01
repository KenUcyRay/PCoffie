'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type ModalCtx = {
  open: (node: React.ReactNode) => void;
  close: () => void;
  depth: number;
};

const Ctx = createContext<ModalCtx | null>(null);

// Pengganti Ext.window.Window modal: backdrop, tutup via klik area luar atau ESC.
// Bertumpuk (stack) supaya popup di atas modal utama tidak menghapus isinya.
export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<React.ReactNode[]>([]);

  const close = useCallback(() => setStack((prev) => prev.slice(0, -1)), []);
  const open = useCallback((n: React.ReactNode) => setStack((prev) => [...prev, n]), []);

  useEffect(() => {
    if (!stack.length) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stack.length, close]);

  return (
    <Ctx.Provider value={{ open, close, depth: stack.length }}>
      {children}
      {stack.map((node, i) => (
        <div
          key={i}
          className="modal-wrap"
          style={{ zIndex: 50 + i }}
          onClick={i === stack.length - 1 ? close : undefined}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>{node}</div>
        </div>
      ))}
    </Ctx.Provider>
  );
}

export function useModal(): ModalCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useModal di luar ModalProvider');
  return v;
}