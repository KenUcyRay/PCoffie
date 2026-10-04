'use client';

// =============================================================================
// SISTEM IKON PORTAL PEMBELI
// -----------------------------------------------------------------------------
// Satu set ikon untuk SELURUH portal: Tabler Icons (MIT), sama dengan yang
// dipakai Console (components/Icon.tsx). Tidak ada lagi ikon SVG buatan sendiri
// atau ikon unicode/teks yang menyamar sebagai ikon.
//
// Kenapa modul sendiri, bukan mengimpor components/Icon.tsx:
//   components/Icon.tsx menyimpan registry Console sebagai satu objek ICONS.
//   Objek itu tidak bisa di-tree-shake, jadi mengimpornya ke portal akan menarik
//   seluruh ~60 ikon Console ke bundel portal. Modul ini mengimpor nama ikon
//   secara langsung sehingga Next.js hanya membundel ikon yang benar dipakai.
//
// KEADAAN IKON
//   - Gaya  : satu set (Tabler), stroke 2px, sudut bulat, warna mewarisi token
//            lewat currentColor.
//   - Ukuran: hanya 16 / 20 / 24 (skala tetap).
//   - Akses : ikon dekoratif diberi aria-hidden. Ikon yang berdiri sendiri
//            WAJIB diberi `label`, lalu dibungkus role="img" + aria-label.
// =============================================================================

import {
  // navigasi
  IconHome, IconCalendarEvent, IconShoppingBag, IconTicket, IconUser,
  IconMenu2, IconX, IconSearch, IconMapPin,
  IconChevronDown, IconChevronRight, IconChevronLeft,
  IconArrowRight, IconArrowLeft, IconLogout,
  // event
  IconClock, IconBuilding, IconQrcode, IconZoomIn, IconCalendarPlus,
  IconUsers, IconMapPinCheck, IconRosetteDiscount,
  // merchandise
  IconShoppingCart, IconPackage, IconBox,
  // konten
  IconNews, IconPhoto, IconSparkles, IconTag,
  // status & aksi
  IconInfoCircle, IconCheck, IconCircleCheck, IconCircleX, IconAlertTriangle,
  IconRefresh, IconPlus, IconMinus, IconCopy, IconPrinter, IconDownload,
  IconTrash, IconEdit, IconLock, IconFilter,
  // akun & lain-lain
  IconMail, IconPhone, IconDeviceMobile, IconCreditCard, IconReceipt,
  IconWallet, IconSettings, IconShieldCheck, IconBrightness, IconExternalLink,
  type Icon as TablerIcon,
} from '@tabler/icons-react';

export type PfIconName =
  // navigasi
  | 'home' | 'calendar' | 'merch' | 'ticket' | 'user' | 'menu' | 'close'
  | 'search' | 'location' | 'chevronDown' | 'chevronRight' | 'chevronLeft'
  | 'arrowRight' | 'arrowLeft' | 'logout'
  // event
  | 'clock' | 'building' | 'qr' | 'zoom' | 'calendarPlus' | 'users'
  | 'locationCheck' | 'discount'
  // merchandise
  | 'cart' | 'package' | 'box'
  // konten
  | 'news' | 'photo' | 'sparkles' | 'tag'
  // status & aksi
  | 'info' | 'check' | 'checkCircle' | 'xCircle' | 'alert' | 'refresh'
  | 'plus' | 'minus' | 'copy' | 'print' | 'download' | 'trash' | 'edit' | 'lock'
  | 'filter'
  // akun & lain-lain
  | 'mail' | 'phone' | 'mobile' | 'card' | 'receipt' | 'wallet'
  | 'settings' | 'shield' | 'brightness' | 'external';

const ICONS: Record<PfIconName, TablerIcon> = {
  home: IconHome,
  calendar: IconCalendarEvent,
  merch: IconShoppingBag,
  ticket: IconTicket,
  user: IconUser,
  menu: IconMenu2,
  close: IconX,
  search: IconSearch,
  location: IconMapPin,
  chevronDown: IconChevronDown,
  chevronRight: IconChevronRight,
  chevronLeft: IconChevronLeft,
  arrowRight: IconArrowRight,
  arrowLeft: IconArrowLeft,
  logout: IconLogout,
  clock: IconClock,
  building: IconBuilding,
  qr: IconQrcode,
  zoom: IconZoomIn,
  calendarPlus: IconCalendarPlus,
  users: IconUsers,
  locationCheck: IconMapPinCheck,
  discount: IconRosetteDiscount,
  cart: IconShoppingCart,
  package: IconPackage,
  box: IconBox,
  news: IconNews,
  photo: IconPhoto,
  sparkles: IconSparkles,
  tag: IconTag,
  info: IconInfoCircle,
  check: IconCheck,
  checkCircle: IconCircleCheck,
  xCircle: IconCircleX,
  alert: IconAlertTriangle,
  refresh: IconRefresh,
  plus: IconPlus,
  minus: IconMinus,
  copy: IconCopy,
  print: IconPrinter,
  download: IconDownload,
  trash: IconTrash,
  edit: IconEdit,
  lock: IconLock,
  filter: IconFilter,
  mail: IconMail,
  phone: IconPhone,
  mobile: IconDeviceMobile,
  card: IconCreditCard,
  receipt: IconReceipt,
  wallet: IconWallet,
  settings: IconSettings,
  shield: IconShieldCheck,
  brightness: IconBrightness,
  external: IconExternalLink,
};

/** Ukuran yang boleh dipakai (skala tetap 16 / 20 / 24). */
export type PfIconSize = 16 | 20 | 24;

type Props = {
  name: PfIconName;
  /** Ukuran ikon. Default 20. Hanya 16, 20, atau 24. */
  size?: PfIconSize;
  /** Wajib diisi kalau ikon berdiri sendiri (mis. tombol ikon-only). */
  label?: string;
  className?: string;
  stroke?: number;
};

export default function PfIcon({ name, size = 20, label, className, stroke = 2 }: Props) {
  const Cmp = ICONS[name];
  if (!Cmp) return null;

  // Ikon berdiri sendiri diberi nama agar pembaca layar membacanya.
  if (label) {
    return (
      <span role="img" aria-label={label} className={className} style={{ display: 'inline-flex' }}>
        <Cmp size={size} stroke={stroke} aria-hidden="true" />
      </span>
    );
  }
  return <Cmp size={size} stroke={stroke} aria-hidden="true" className={className} />;
}