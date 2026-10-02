// DataTable — komponen grid reusable untuk SEMUA menu.
//
// Semua halaman memakai BENTUK YANG SAMA: kolom didefinisikan lewat konfigurasi
// (key, label, tipe filter), lalu komponen ini yang merender header, baris
// filter, isi tabel, dan baris paging. Tidak ada lagi kotak pencarian global
// atau tombol "Cari" — filter per kolom langsung jalan saat mengetik.
//
// Standar penamaan (dipakai konsisten di semua menu):
//   Column.key / Column.label / Column.filter / Column.options / Column.render
//   props: columns, rows, filters, onFilter, startRow, rowKey, isActive
//   state di GRID: filters, page, total, loading
'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Btn, EmptyRow, Icon } from './Icon';

export type ColumnFilterType = 'text' | 'select' | false;

export type Column<T = any> = {
  /** nama kolom di response backend; dipakai juga sebagai key filter */
  key: string;
  label: string;
  width?: number | string;
  align?: 'left' | 'right';
  /** 'text' (default), 'select', atau false = tanpa filter */
  filter?: ColumnFilterType;
  /** opsi dropdown bila filter = 'select' */
  options?: readonly { value: string; label: string }[];
  /** true = header bisa diklik untuk sorting server (perlu onSort) */
  sortable?: boolean;
  render?: (row: T, index: number) => React.ReactNode;
};

export type Filters = Record<string, string>;

/** Status sorting server. null = tanpa sorting (urutan default backend). */
export type SortDir = { key: string; dir: 'ASC' | 'DESC' } | null;

/** Nilai dropdown "tidak ada filter". */
export const FILTER_ALL = '__ALL__';
/** Key khusus untuk kolom nomor urut & kolom aksi (selalu tanpa filter). */
export const COL_NO = '__no';
export const COL_ACTIONS = '__actions';

/** Kolom nomor urut — seragam di semua menu. */
export const noColumn: Column = {
  key: COL_NO,
  label: '#',
  width: 40,
  align: 'right',
  filter: false,
  render: (_row, i) => i + 1,
};

/**
 * Kolom aksi (edit/hapus) — seragam di semua menu.
 * `width` default 88px supaya dua tombol ikon muat_sebaris (tidak tertekuk).
 */
export function actionsColumn<T>(render: (row: T) => React.ReactNode, width = 88): Column<T> {
  return {
    key: COL_ACTIONS,
    label: '',
    width,
    filter: false,
    render: (row) => <span className="dt-actions">{render(row)}</span>,
  };
}

/** Kolom dengan filter dropdown (Aktif/Status dll). */
export function selectColumn<T>(key: string, label: string, options: readonly string[]): Column<T> {
  return { key, label, filter: 'select', options: options.map((v) => ({ value: v, label: v })) };
}

const DEBOUNCE_MS = 300;

/** filter tidak diisi = kolom teks (bukan tanpa filter). */
function filterType<T>(c: Column<T>): ColumnFilterType {
  return c.filter === undefined ? 'text' : c.filter;
}

export function DataTable<T>({
  columns,
  rows,
  filters,
  onFilter,
  sort,
  onSort,
  startRow = 0,
  loading = false,
  emptyMessage,
  rowKey,
  isActive,
  onRowContextMenu,
}: {
  columns: Column<T>[];
  rows: T[];
  filters: Filters;
  /** Dipanggil otomatis 300ms setelah user berhenti mengetik. */
  onFilter: (next: Filters) => void;
  sort?: SortDir;
  /** Dipanggil saat header sortable diklik. Tanpa ini kolom sortable tampil polos. */
  onSort?: (next: SortDir) => void;
  /** Klik-kanan baris. Tanpa ini tidak ada menu konteks (grid lama tak berubah). */
  onRowContextMenu?: (row: T, e: React.MouseEvent) => void;
  startRow?: number;
  loading?: boolean;
  emptyMessage?: string;
  rowKey?: (row: T, i: number) => string;
  isActive?: (row: T) => boolean;
}) {
  const [draft, setDraft] = useState<Filters>(filters);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Reset input filter mengikuti perubahan dari luar (mis. tombol Refresh).
  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);
  useEffect(() => { setDraft(JSON.parse(filtersKey) as Filters); }, [filtersKey]);

  useEffect(() => () => {
    Object.values(timers.current).forEach(clearTimeout);
  }, []);

  const push = (key: string, value: string) => {
    const next = { ...draft, [key]: value };
    if (value === '' || value === FILTER_ALL) delete next[key];
    setDraft(next);
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => onFilter(next), DEBOUNCE_MS);
  };

  // Klik header: mati -> ASC -> DESC -> mati. Tanpa onSort, header tampil polos.
  const cycleSort = (key: string) => {
    if (!onSort) return;
    if (!sort || sort.key !== key) onSort({ key, dir: 'ASC' });
    else if (sort.dir === 'ASC') onSort({ key, dir: 'DESC' });
    else onSort(null);
  };

  return (
    <div className="table-wrap">
      <table className="grid">
        <thead>
          <tr>
            {columns.map((c) => {
              const active = !!sort && sort.key === c.key;
              const canSort = !!c.sortable && !!onSort;
              return (
                <th
                  key={c.key}
                  style={c.width ? { width: c.width } : undefined}
                  className={c.align === 'right' ? 'dt-right' : undefined}
                  aria-sort={canSort ? (active ? (sort.dir === 'ASC' ? 'ascending' : 'descending') : 'none') : undefined}
                >
                  {canSort ? (
                    <button type="button" className="dt-sortbtn" onClick={() => cycleSort(c.key)} title={`Urutkan ${c.label}`}>
                      {c.label}
                      <span className={`dt-sort${active ? ' on' : ''}`}>
                        <Icon name="sortAsc" size={12} style={active && sort.dir === 'DESC' ? { transform: 'scaleY(-1)' } : undefined} />
                      </span>
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
          {/* baris filter per kolom data (langsung di bawah header) */}
          <tr className="dt-filter-row">
            {columns.map((c) => (
              <th key={c.key} className="dt-filter-cell">
                {filterType(c) === false ? null : filterType(c) === 'select' ? (
                  <select
                    className="dt-filter"
                    aria-label={`Filter ${c.label}`}
                    value={draft[c.key] ?? FILTER_ALL}
                    onChange={(e) => push(c.key, e.target.value)}
                  >
                    <option value={FILTER_ALL}>Semua</option>
                    {(c.options || []).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="dt-filter"
                    aria-label={`Filter ${c.label}`}
                    placeholder={c.label}
                    value={draft[c.key] ?? ''}
                    onChange={(e) => push(c.key, e.target.value)}
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey ? rowKey(row, i) : String((row as any)?.[columns[0]?.key] ?? i)}
              className={isActive?.(row) ? 'dt-active' : undefined}
              onContextMenu={onRowContextMenu ? (e) => onRowContextMenu(row, e) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={c.align === 'right' ? 'grid-num' : undefined}>
                  {c.render
                    ? c.render(row, startRow + i)
                    : String((row as any)?.[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && <EmptyRow colSpan={columns.length} loading={loading} message={emptyMessage} />}
        </tbody>
      </table>
    </div>
  );
}

/** Baris paging — seragam di semua menu. */
export function GridPager({
  total,
  page,
  pageSize,
  onPage,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startRow = page * pageSize;
  const label = total === 0 ? '0 data' : `${startRow + 1}–${Math.min(startRow + pageSize, total)} dari ${total}`;
  return (
    <div className="toolbar bbar">
      <span className="count">{label}</span>
      <Btn className="btn-sm" icon="prev" disabled={page <= 0} onClick={() => onPage(page - 1)}>Prev</Btn>
      <span className="pageinfo">{page + 1}/{totalPages}</span>
      <Btn className="btn-sm" icon="next" disabled={(page + 1) * pageSize >= total} onClick={() => onPage(page + 1)}>Next</Btn>
      <span className="loading-hint"><Icon name="refresh" size={12} /> {pageSize}/page</span>
    </div>
  );
}