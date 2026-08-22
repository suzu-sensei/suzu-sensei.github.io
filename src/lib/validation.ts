export const MAX_SLIP_BYTES = 10 * 1024 * 1024;
export const ALLOWED_SLIP_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

export function validateSlip(file: Pick<File, 'size' | 'type'>): void {
  if (file.size <= 0 || file.size > MAX_SLIP_BYTES) throw new Error('ファイルは10MB以下にしてください。');
  if (!ALLOWED_SLIP_TYPES.has(file.type)) throw new Error('JPEG・PNG・WebP・PDFのみ送信できます。');
}

function zonedLocalDate(localStart: string, timeZone?: string): Date {
  if (!timeZone) return new Date(localStart);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localStart);
  if (!match) return new Date(Number.NaN);
  const desired = match.slice(1).map(Number);
  const desiredUtc = Date.UTC(desired[0]!, desired[1]! - 1, desired[2]!, desired[3]!, desired[4]!);
  let instant = desiredUtc;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  for (let i = 0; i < 3; i += 1) {
    const values = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    const displayedUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute));
    instant += desiredUtc - displayedUtc;
  }
  const result = new Date(instant);
  const verification = Object.fromEntries(formatter.formatToParts(result).map(part => [part.type, part.value]));
  const same = Number(verification.year) === desired[0]
    && Number(verification.month) === desired[1]
    && Number(verification.day) === desired[2]
    && Number(verification.hour) === desired[3]
    && Number(verification.minute) === desired[4];
  return same ? result : new Date(Number.NaN);
}

export function toIsoInterval(localStart: string, minutes = 50, timeZone?: string): { starts_at: string; ends_at: string } {
  let start: Date;
  try { start = zonedLocalDate(localStart, timeZone); }
  catch { throw new Error('登録されたタイムゾーンを確認してください。'); }
  if (!localStart || Number.isNaN(start.getTime()) || start.getTime() <= Date.now()) throw new Error('未来の日時を選んでください。');
  return { starts_at: start.toISOString(), ends_at: new Date(start.getTime() + minutes * 60_000).toISOString() };
}

export function toAvailabilityWindow(localDate: string, startTime: string, endTime: string, timeZone?: string): { starts_at: string; ends_at: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)
      || !/^\d{2}:(00|30)$/.test(startTime)
      || !/^\d{2}:(00|30)$/.test(endTime)) {
    throw new Error('日付と、00分または30分の時刻を選んでください。');
  }
  let start: Date;
  let end: Date;
  try {
    start = zonedLocalDate(`${localDate}T${startTime}`, timeZone);
    end = zonedLocalDate(`${localDate}T${endTime}`, timeZone);
  } catch {
    throw new Error('登録されたタイムゾーンを確認してください。');
  }
  const duration = end.getTime() - start.getTime();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() <= Date.now()) {
    throw new Error('未来の日付と時刻を選んでください。');
  }
  if (duration < 50 * 60_000 || duration > 4 * 60 * 60_000) {
    throw new Error('時間範囲は50分以上、4時間以内にしてください。');
  }
  return { starts_at: start.toISOString(), ends_at: end.toISOString() };
}
