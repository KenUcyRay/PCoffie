// Penanda event terpilih untuk pintasan antar-halaman (Event Data ->
// Ticket Type / Attendee List). Disimpan di sessionStorage, dibaca sekali
// lalu dibersihkan oleh halaman tujuan.
const KEY = 'tiket-app::event-pick';

export function setPickedEvent(eventid: number): void {
  try {
    window.sessionStorage.setItem(KEY, String(eventid));
  } catch {
    /* abaikan */
  }
}

export function takePickedEvent(): number | null {
  try {
    const v = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    const n = Number(v);
    return v != null && v !== '' && Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
