import { apiPost } from '@/lib/api';
const SEGMENT='home/cwarnetbooking/cwarnetbooking';
export type SortState={ key:string; dir:'ASC'|'DESC'}|null;
export async function read_data(opts:{limit?:number;offset?:number;q?:string;filters?:Record<string,string>;sort?:SortState}={}){ return apiPost(SEGMENT,{method:'read_data',limit:opts.limit,offset:opts.offset,q:opts.q,filters:opts.filters?JSON.stringify(opts.filters):undefined,sort:opts.sort?.key,dir:opts.sort?.dir}); }
export async function read_users(){ return apiPost(SEGMENT,{method:'read_users'}); }
export async function process_create(vdata:unknown){ return apiPost(SEGMENT,{method:'process_create',vdata:JSON.stringify(vdata)}); }
export async function process_update(vdata:unknown){ return apiPost(SEGMENT,{method:'process_update',vdata:JSON.stringify(vdata)}); }
export async function change_status(vdata:unknown){ return apiPost(SEGMENT,{method:'change_status',vdata:JSON.stringify(vdata)}); }
export async function process_delete(vdata:unknown){ return apiPost(SEGMENT,{method:'process_delete',vdata:JSON.stringify(vdata)}); }
