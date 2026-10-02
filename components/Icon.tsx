// Sistem icon global — Tabler Icons (https://tabler.io/icons), gratis MIT.
// Cara pakai ala iconCls langit_v2 (refresh/add/edit/del):
//   <Icon name="refresh" />  atau  <Btn icon="refresh" onClick={...}>Refresh</Btn>
// Tidak ada lagi ikon unicode/emoji/teks masquerading sebagai ikon: semua
// titik UI (toolbar, tree, tab, grid, form, modal, toast) memakai registry ini.
// Daftar ikon Tabler lengkap: https://tabler.io/icons
// Tambah icon baru = tambah 1 baris di ICONS (import + mapping).
'use client';
import type { ButtonHTMLAttributes, CSSProperties } from 'react';
import {
  IconRefresh, IconPlus, IconPencil, IconTrash, IconDeviceFloppy,
  IconSearch, IconDownload, IconX, IconMenu2, IconHome, IconUser,
  IconUsers, IconLogout, IconLayoutGrid, IconChevronDown, IconChevronRight,
  IconFilter, IconLock, IconKey, IconBuilding, IconTable,
  IconChevronLeft, IconCheck, IconBox, IconSettings, IconAlertTriangle,
  // tambahan: semantik per-fungsi (bukan satu ikon untuk semua kebutuhan)
  IconMinus, IconEraser, IconUserCircle,
  IconArrowRight, IconArrowLeft, IconCircleCheck, IconAlertCircle,
  IconLayoutDashboard, IconDatabaseOff, IconFileAnalytics, IconHistory,
  IconCalendar, IconEye, IconMail, IconUpload, IconLoader2, IconSortAscending,
  IconLogin, IconAddressBook, IconForms, IconWorld, IconChartBar,
  // sidebar & navigasi
  IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand,
  IconApps, IconSelect, IconFolderOpen, IconStack, IconSitemap, IconInfoCircle,
  // module icons
  IconCalendarEvent, IconTicket, IconPackage, IconSpeakerphone, IconCash, IconPlanet,
  type Icon as TablerIcon,
} from '@tabler/icons-react';

export type IconName =
  | 'refresh' | 'add' | 'edit' | 'del' | 'save' | 'search' | 'download'
  | 'close' | 'menu' | 'home' | 'user' | 'users' | 'logout' | 'layout'
  | 'chevD' | 'chevR' | 'filter' | 'lock' | 'key' | 'dept' | 'grid'
  | 'prev' | 'next' | 'check' | 'profile' | 'start' | 'box' | 'gear'
  | 'minus' | 'eraser' | 'userCircle' | 'arrowR' | 'arrowL' | 'checkCircle'
  | 'alertCircle' | 'dashboard' | 'empty' | 'report' | 'history'
  | 'calendar' | 'calendarEvent' | 'view' | 'mail' | 'upload' | 'loading' | 'sortAsc'
  | 'login' | 'contacts' | 'form' | 'world' | 'chart' | 'ticket' | 'package'
  | 'megaphone' | 'cash' | 'planet' | 'settings'
  | 'panel' | 'panelOpen' | 'apps' | 'select' | 'folderOpen' | 'navStack' | 'sitemap'
  | 'info' | 'alert';

// Satu tempat untuk ganti/tambah icon — mirip daftar iconCls di langit_v2.
const ICONS: Record<IconName, TablerIcon> = {
  refresh: IconRefresh,
  add: IconPlus,
  edit: IconPencil,
  del: IconTrash,
  save: IconDeviceFloppy,
  search: IconSearch,
  download: IconDownload,
  close: IconX,
  menu: IconMenu2,
  home: IconHome,
  user: IconUser,
  users: IconUsers,
  logout: IconLogout,
  // "layout" = dashboard; "start"/"grid" = grid tabel. Tidak kembar lagi.
  layout: IconLayoutDashboard,
  chevD: IconChevronDown,
  chevR: IconChevronRight,
  filter: IconFilter,
  lock: IconLock,
  key: IconKey,
  dept: IconBuilding,
  grid: IconTable,
  prev: IconChevronLeft,
  next: IconArrowRight,
  check: IconCheck,
  profile: IconUserCircle,
  start: IconLayoutGrid,
  box: IconBox,
  gear: IconSettings,
  minus: IconMinus,
  eraser: IconEraser,
  userCircle: IconUserCircle,
  arrowR: IconArrowRight,
  arrowL: IconArrowLeft,
  checkCircle: IconCircleCheck,
  alertCircle: IconAlertCircle,
  dashboard: IconLayoutDashboard,
  empty: IconDatabaseOff,
  report: IconFileAnalytics,
  history: IconHistory,
  calendar: IconCalendar,
  view: IconEye,
  mail: IconMail,
  upload: IconUpload,
  loading: IconLoader2,
  sortAsc: IconSortAscending,
  login: IconLogin,
  contacts: IconAddressBook,
  form: IconForms,
  world: IconWorld,
  chart: IconChartBar,
  calendarEvent: IconCalendarEvent,
  ticket: IconTicket,
  package: IconPackage,
  megaphone: IconSpeakerphone,
  cash: IconCash,
  planet: IconPlanet,
  settings: IconSettings,
  // sidebar & navigasi
  panel: IconLayoutSidebarLeftCollapse,
  panelOpen: IconLayoutSidebarLeftExpand,
  apps: IconApps,
  select: IconSelect,
  folderOpen: IconFolderOpen,
  navStack: IconStack,
  sitemap: IconSitemap,
  info: IconInfoCircle,
  alert: IconAlertTriangle,
};

export function iconForModule(code: string): IconName {
  const c = String(code || '').toLowerCase();
  if (c.includes('user')) return 'users';
  if (c.includes('group') || c.includes('akses')) return 'users';
  if (c.includes('menu') || c.includes('modul')) return 'grid';
  if (c.includes('home') || c.includes('dash')) return 'home';
  if (c.includes('moddisc')) return 'planet';
  if (c.includes('modevent')) return 'calendarEvent';
  if (c.includes('modticket')) return 'ticket';
  if (c.includes('modmerch')) return 'box';
  if (c.includes('modmarketing')) return 'chart';
  if (c.includes('modfinance')) return 'cash';
  if (c.includes('modaccount')) return 'userCircle';
  if (c.includes('modsystem')) return 'gear';
  return 'box';
}

// Ikon leaf per MCONTROL (CPMENU tidak punya kolom ikon, jadi dipetakan di sini
// seperti menu lama). Parent ber-child selalu 'folderOpen' (di Sidebar).
const LEAF_ICONS: Record<string, IconName> = {
  moddischome: 'home',
  moddisceventlist: 'calendarEvent',
  moddisceventcategory: 'grid',
  moddisceventcity: 'dept',
  moddiscnewslist: 'report',
  moddiscpromolist: 'ticket',
  modeventdata: 'form',
  modeventtickettype: 'ticket',
  modeventattendee: 'users',
  modticketmy: 'ticket',
  modticketrefund: 'refresh',
  modticketcheckscan: 'search',
  modticketcheckhistory: 'history',
  modmerchproduct: 'box',
  modmerchpurchase: 'download',
  modmerchproductdata: 'form',
  modmerchsellerorder: 'report',
  modmarketingpromo: 'ticket',
  modmarketingcampaign: 'chart',
  modmarketingnewsdata: 'form',
  modmarketingnewscategory: 'grid',
  modfinancepayment: 'cash',
  modfinanceinvoice: 'report',
  modfinancesales: 'chart',
  modfinancepayout: 'cash',
  modfinancesellerbalance: 'cash',
  modfinancesellerwithdraw: 'download',
  modfinancebank: 'dept',
  modaccountnotification: 'mail',
  modaccountprofile: 'user',
  modaccountchangepassword: 'key',
  cp_matrix: 'grid',
  cp_menu: 'menu',
  cp_category: 'grid',
  cp_city: 'dept',
  cp_bank: 'dept',
  cp_paymentmethod: 'cash',
  cp_fee: 'cash',
  cp_security: 'lock',
  cp_session: 'history',
  cp_blocked: 'alertCircle',
  cp_auditlog: 'history',
  cp_syslog: 'history',
  cp_loginlog: 'history',
  cp_message_send: 'mail',
  cp_message_history: 'history',
  cp_setting: 'gear',
  cp_notification_template: 'mail',
};

export function iconForLeaf(mcontrol: string): IconName {
  const c = String(mcontrol || '').toLowerCase();
  if (LEAF_ICONS[c]) return LEAF_ICONS[c];
  if (c === '' || c === 'home') return 'home';
  if (c.includes('group')) return 'users';
  if (c.includes('setting') || c.includes('login') || c.includes('user')) return 'user';
  if (c.includes('menu') || c.includes('modul')) return 'grid';
  if (c.includes('dept')) return 'dept';
  // log/audit/sesi = riwayat, bukan kunci/penguncian.
  if (c.includes('log') || c.includes('audit') || c.includes('sesi')) return 'history';
  return 'chevR';
}

export function Icon({
  name,
  size = 16,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const C = ICONS[name];
  return (
    <C
      size={size}
      stroke={2}
      aria-hidden
      className={className}
      style={{ flex: 'none', display: 'inline-block', verticalAlign: 'middle', ...style }}
    />
  );
}

// Tombol ala toolbar langit_v2: <Btn icon="refresh" onClick={...}>Refresh</Btn>
// Semua button di menu sebaiknya memakai ini supaya icon konsisten.
// `iconOnly` = tombol ikon tanpa teks (butuh `aria-label` dari pemanggil).
// `pid` = penanda komponen ala ExtJS (`pid: "btrefresh"`) supaya mudah dicari.
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: IconName;
  iconOnly?: boolean;
  iconSize?: number;
  pid?: string;
};
export function Btn({ icon, iconOnly, iconSize, children, className, type, pid, ...rest }: BtnProps) {
  const cls = [
    'btn',
    icon ? 'with-icon' : '',
    iconOnly ? 'icon-only' : '',
    className || '',
  ].filter(Boolean).join(' ');
  const hasText = children !== undefined && children !== null && children !== '';
  return (
    <button type={type ?? 'button'} className={cls} data-pid={pid} {...rest}>
      {icon && <Icon name={icon} size={iconSize ?? 15} />}
      {hasText && !iconOnly && <span>{children}</span>}
    </button>
  );
}

// "No Matching Records" / "Memuat…" diberi ikon yang tepat
// supaya tidak lagi teks polos.
export function EmptyRow({
  colSpan,
  loading,
  message,
}: {
  colSpan: number;
  loading?: boolean;
  message?: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <span className="empty-cell">
          {loading ? <Icon name="loading" size={16} className="spin" /> : <Icon name="empty" size={16} />}
          <span>{loading ? 'Memuat…' : message || 'No Matching Records'}</span>
        </span>
      </td>
    </tr>
  );
}