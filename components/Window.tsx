// Window = padanan Ext.window.Window di langit_v2.
//
// Di langit_v2 setiap FRM mendefinisikan ukurannya sendiri di dalam
// Ext.define, contoh FRMmpph.js:
//
//   width:  mainpage.getWidth()  * 0.35,
//   height: mainpage.getHeight() * 0.44,
//
// Di sini width/height bisa number (px) atau string ('46%', '520px'),
// dan(body) scroll sendiri supaya form panjang tidak ikut menarik window.
'use client';
import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export type WindowProps = {
  title: string;
  icon?: IconName;
  /** Lebar window. number = px, string = satuan CSS. Default 46% area kerja. */
  width?: number | string;
  /** Tinggi window. Default: menyesuaikan isi (maksimal 90vh). */
  height?: number | string;
  footer?: ReactNode;
  children: ReactNode;
};

export function Window({
  title,
  icon,
  width = '46%',
  height,
  footer,
  children,
}: WindowProps) {
  const style: CSSProperties = {
    width,
    ...(height ? { height } : { maxHeight: '90vh' }),
  };

  return (
    <div className="modal-wrap">
      {/* stopPropagation: klik di dalam window tidak boleh menutup window
          (ModalProvider menutup window lewat klik area luarnya). */}
      <div
        className="modal"
        style={style}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          {icon && <Icon name={icon} size={16} />}
          {title}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * Baris form compact ala ExtJS `fieldDefaults: { labelAlign: left, labelWidth }`.
 * Pakai: <FrmRow label="Kode"><input …/></FrmRow>
 */
export function FrmRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="frm-row">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Fieldset form. `title` sempit, isi rapat — bukan memanjang ke bawah. */
export function FrmSet({
  legend,
  icon,
  columns = 2,
  children,
}: {
  legend: string;
  icon?: IconName;
  columns?: 1 | 2 | 3;
  children: ReactNode;
}) {
  return (
    <fieldset className="frm-set">
      <legend>
        {icon && <Icon name={icon} size={13} />}
        {legend}
      </legend>
      <div className="frm-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {children}
      </div>
    </fieldset>
  );
}