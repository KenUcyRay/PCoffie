'use client';
import { useEffect, useState } from 'react';

// Deteksi viewport sempit (mobile/tablet kecil).
export function useIsNarrow(maxWidth = 900): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [maxWidth]);
  return narrow;
}