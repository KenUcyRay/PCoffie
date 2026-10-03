// API menu cp_setting — padanan store/proxy "cpsetting/cpsetting".
// Endpoint: api/core/home/cpsetting/cpsetting (+ publik api/core/public/app-setting).
// Backend: appservice/app/Models/Mcpsetting.php. Tanpa create/delete.
import { apiPost, getApiBase, getToken } from '@/lib/api';

const SEGMENT = 'home/cpsetting/cpsetting';

export type SettingForm = {
  APPNAME: string;
  SLOGAN: string;
  LOGO: string;
  FAVICON: string;
  CONTACTEMAIL: string;
  CONTACTPHONE: string;
  CONTACTWA: string;
  ADDRESS: string;
  TIMEZONE: string;
  CURRENCY: string;
  DATEFORMAT: string;
  TERMS: string;
  PRIVACY: string;
  TERMSVERSION: string;
  MAILFROMNAME: string;
  MAILFROMEMAIL: string;
  SMTPHOST: string;
  SMTPPORT: string;
  SMTPENCRYPTION: string;
  SMTPUSERNAME: string;
  SMTPPASSWORD: string;
  HAS_PASSWORD?: string;
};

// read_setting: satu baris pengaturan (password tidak pernah dikembalikan).
export async function read_setting() {
  return apiPost(SEGMENT, {
    method: 'read_setting',
  });
}

// process_update: simpan pengaturan (password kosong = pertahankan yang lama).
export async function process_update(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_update',
    vdata: JSON.stringify(vdata),
  });
}

// read_public: identitas publik TANPA login (nama, slogan, logo, favicon).
export async function read_public() {
  return apiPost('public/app-setting', {});
}

// send_test_email: email uji memakai nilai form (rate-limit 5x/menit).
export async function send_test_email(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'send_test_email',
    vdata: JSON.stringify(vdata),
  });
}

// upload_logo/upload_favicon: multipart (bukan JSON). Return {success, path, message}.
async function upload_file(method: string, field: string, file: File) {
  const fd = new FormData();
  fd.append('method', method);
  fd.append(field, file);
  const res = await fetch(`${getApiBase()}/${SEGMENT}`.replace(/([^:])\/+/g, '$1/'), {
    method: 'POST',
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: fd,
  });
  return (await res.json().catch(() => ({}))) as any;
}

export async function upload_logo(file: File) {
  return upload_file('upload_logo', 'logo', file);
}

export async function upload_favicon(file: File) {
  return upload_file('upload_favicon', 'favicon', file);
}

// URL penuh file dari path relatif DB (mis. uploads/setting/x.png).
export function assetUrl(path?: string | null): string {
  if (!path) return '';
  const root = getApiBase().replace(/\/api\/core$/, '');
  return `${root}/${String(path).replace(/^\/+/, '')}`;
}
