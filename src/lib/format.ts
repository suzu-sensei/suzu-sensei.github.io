export const money = (amountMinor: number | null, currency: string | null, locale = 'ja-JP') =>
  amountMinor === null || !currency ? '—' : new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amountMinor / 100);

export const dateTime = (value: string, timeZone = 'Asia/Tokyo', locale = 'ja-JP') => new Intl.DateTimeFormat(locale, {
  dateStyle: 'medium', timeStyle: 'short', timeZone,
}).format(new Date(value));

export const dateOnly = (value: string, timeZone = 'Asia/Tokyo', locale = 'ja-JP') => new Intl.DateTimeFormat(locale, {
  dateStyle: 'medium', timeZone,
}).format(new Date(value));

export const timeOnly = (value: string, timeZone = 'Asia/Tokyo', locale = 'ja-JP') => new Intl.DateTimeFormat(locale, {
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone,
}).format(new Date(value));

export const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

export const statusLabel = (status: string) => ({
  pending: '確認待ち', approved: '承認済み', rejected: '却下', reserved: '予約済み',
  completed: '完了', cancelled: 'キャンセル', available: '未予約', voided: '無効',
  uploaded: '送信済み', missing: '再送信が必要', none: '未添付',
}[status] ?? status);

export const uuid = () => crypto.randomUUID();
