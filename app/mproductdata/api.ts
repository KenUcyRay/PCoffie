// API menu mproductdata — padanan store/proxy "mproductdata/mproductdata".
// Endpoint: api/core/home/mproductdata/mproductdata.
// Backend: appservice/app/Models/Mmproductdata.php.
import { apiPost, getApiBase, getToken } from '@/lib/api';

const SEGMENT = 'home/mproductdata/mproductdata';

export type SortState = { key: string; dir: 'ASC' | 'DESC' } | null;

// read_products: grid produk (paging + filter + sorting server).
export async function read_products(opts: {
  limit?: number; offset?: number; q?: string; filters?: Record<string, string>;
  sort?: SortState; category?: string; sellerid?: string; condition?: string; status?: string;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_products',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
    sort: opts.sort?.key, dir: opts.sort?.dir,
    category: opts.category, sellerid: opts.sellerid,
    condition: opts.condition, status: opts.status,
  });
}

// read_product_detail: satu produk + gambar.
export async function read_product_detail(productid: number) {
  return apiPost(SEGMENT, {
    method: 'read_product_detail',
    vdata: JSON.stringify({ PRODUCTID: productid }),
  });
}

// process_product_create/update/delete + change_product_status + adjust_stock.
export async function process_product_create(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_product_create',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_product_update(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_product_update',
    vdata: JSON.stringify(vdata),
  });
}

export async function change_product_status(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'change_product_status',
    vdata: JSON.stringify(vdata),
  });
}

export async function adjust_stock(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'adjust_stock',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_product_delete(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_product_delete',
    vdata: JSON.stringify(vdata),
  });
}

// upload_image: multipart (bukan JSON). Return {success, path, message}.
export async function upload_image(file: File) {
  const fd = new FormData();
  fd.append('method', 'upload_image');
  fd.append('image', file);
  const res = await fetch(`${getApiBase()}/${SEGMENT}`.replace(/([^:])\/+/g, '$1/'), {
    method: 'POST',
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: fd,
  });
  return (await res.json().catch(() => ({}))) as any;
}

// process_image_delete: hapus satu file gambar.
export async function process_image_delete(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_image_delete',
    vdata: JSON.stringify(vdata),
  });
}

// URL penuh file dari path relatif DB (mis. uploads/merch/x.png).
export function imageUrl(path?: string | null): string {
  if (!path) return '';
  const root = getApiBase().replace(/\/api\/core$/, '');
  return `${root}/${String(path).replace(/^\/+/, '')}`;
}

// read_sellers + CRUD penjual + dropdown penjual aktif.
export async function read_sellers(opts: {
  limit?: number; offset?: number; q?: string; filters?: Record<string, string>;
} = {}) {
  return apiPost(SEGMENT, {
    method: 'read_sellers',
    limit: opts.limit, offset: opts.offset, q: opts.q,
    filters: opts.filters ? JSON.stringify(opts.filters) : undefined,
  });
}

export async function read_seller_dropdown() {
  return apiPost(SEGMENT, {
    method: 'read_seller_dropdown',
  });
}

export async function process_seller_create(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_seller_create',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_seller_update(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_seller_update',
    vdata: JSON.stringify(vdata),
  });
}

export async function change_seller_status(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'change_seller_status',
    vdata: JSON.stringify(vdata),
  });
}

export async function process_seller_delete(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_seller_delete',
    vdata: JSON.stringify(vdata),
  });
}
