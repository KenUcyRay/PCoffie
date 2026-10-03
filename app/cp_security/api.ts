// API menu cp_security — padanan store/proxy "cpsecurity/cpsecurity".
// Endpoint: api/core/home/cpsecurity/cpsecurity (method read_setting/process_update).
// Backend: appservice/app/Models/Mcpsecurity.php. Tanpa create/delete.
import { apiPost } from '@/lib/api';

const SEGMENT = 'home/cpsecurity/cpsecurity';

export type SecurityForm = {
  PWDMINLEN: string;
  PWDREQUIREUPPER: string;
  PWDREQUIREDIGIT: string;
  PWDREQUIRESYMBOL: string;
  PWDEXPIRYDAYS: string;
  MAXFAILCOUNT: string;
  BLOCKDURATIONMIN: string;
  SESIDLEMIN: string;
  SESMAXHOURS: string;
  MAXSESSION: string;
};

// read_setting: satu baris pengaturan yang berlaku.
export async function read_setting() {
  return apiPost(SEGMENT, {
    method: 'read_setting',
  });
}

// process_update: simpan pengaturan (batas rentang divalidasi backend).
export async function process_update(vdata: unknown) {
  return apiPost(SEGMENT, {
    method: 'process_update',
    vdata: JSON.stringify(vdata),
  });
}
