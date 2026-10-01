// Komponen kerangka area kerja — dipakai semua halaman menu supaya bentuknya
// konsisten. Padalan "Ext.form.Panel + dockedItems" di langit_v2: judul
// halaman + aksi terpisah dari isi card.
'use client';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * Judul halaman di area kerja.
 * Judul ini milik halaman (bukan milik menu), jadi tiap mainpage mengisinya
 * sendiri. Judul tab/topbar tetap datang dari Shell.
 */
export function PageHead({
  title,
  subtitle,
  icon,
  actions,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div className="page-head-info">
        <h1 className="page-title">
          {icon && <Icon name={icon} size={20} />}
          {title}
        </h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </div>
  );
}

/** Panel judul+aksi di dalam card (dipakai panel sekunder / header tabel). */
export function CardHead({ icon, children }: { icon?: IconName; children: ReactNode }) {
  return (
    <div className="card-head">
      <b>{icon && <Icon name={icon} size={16} />}{children}</b>
    </div>
  );
}