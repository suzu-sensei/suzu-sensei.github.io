import type { Candidate, StudentSnapshot } from '../types';
import type { StudentLocale } from '../i18n';
import { localeTag, studentCopy } from '../i18n';
import { cancelOwnBooking, retryPaymentSlip, submitBooking, submitPayment, signedSlipUrl, type BookingWindow } from '../lib/api';
import { dateOnly, dateTime, escapeHtml, money, timeOnly } from '../lib/format';
import { safeGoogleDriveUrl, safeGoogleMeetUrl } from '../lib/classroom-links';
import { isRecording, startLessonRecording, stopLessonRecording } from '../lib/recording';
import { toAvailabilityWindow } from '../lib/validation';
import { badge, card, empty, setBusy, showToast } from './shared';

const status = (value: string, locale: StudentLocale) => {
  const t = studentCopy[locale];
  const labels: Record<string, string> = {
    pending: t.pending, approved: t.approved, rejected: t.rejected, reserved: t.reserved,
    completed: t.completed, cancelled: t.cancelled, available: t.available, voided: t.voided,
    uploaded: t.uploaded, missing: t.missing, none: t.none,
  };
  return labels[value] ?? value;
};

const timeOptions = (choose: string) => {
  const values: string[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (const minute of ['00', '30']) values.push(`${String(hour).padStart(2, '0')}:${minute}`);
  }
  return `<option value="">${escapeHtml(choose)}</option>${values.map(value => `<option value="${value}">${value}</option>`).join('')}`;
};

function preferenceRow(rank: number, locale: StudentLocale): string {
  const t = studentCopy[locale];
  const label = [t.preference1, t.preference2, t.preference3][rank - 1];
  return `<fieldset class="time-preference" data-time-rank="${rank}"><legend>${escapeHtml(label)}</legend>
    <label>${escapeHtml(t.from)}<select data-range-start ${rank === 1 ? 'required' : ''}>${timeOptions(t.choose)}</select></label>
    <span aria-hidden="true">→</span>
    <label>${escapeHtml(t.to)}<select data-range-end ${rank === 1 ? 'required' : ''}>${timeOptions(t.choose)}</select></label>
  </fieldset>`;
}

function candidateDay(rank: number, locale: StudentLocale): string {
  const t = studentCopy[locale];
  return `<section class="candidate-day" data-day-rank="${rank}">
    <div class="candidate-day-heading"><strong>${escapeHtml(t.dayCandidate)} ${rank}</strong>${rank > 1 ? `<button type="button" class="text-button danger-text" data-remove-day>${escapeHtml(t.removeDay)}</button>` : ''}</div>
    <label>${escapeHtml(t.date)}<input data-candidate-date type="date" required></label>
    <span class="field-caption">${escapeHtml(t.timePreference)}</span>
    ${[1, 2, 3].map(value => preferenceRow(value, locale)).join('')}
  </section>`;
}

function candidateSummary(candidates: Candidate[], timezone: string, locale: StudentLocale): string {
  const tag = localeTag[locale];
  const groups = new Map<number, Candidate[]>();
  [...candidates].sort((a, b) => a.day_rank - b.day_rank || a.time_rank - b.time_rank).forEach(candidate => {
    groups.set(candidate.day_rank, [...(groups.get(candidate.day_rank) ?? []), candidate]);
  });
  return [...groups.values()].map(group => {
    const first = group[0]!;
    const ranges = group.map(item => `${timeOnly(item.starts_at, timezone, tag)}–${timeOnly(item.ends_at, timezone, tag)}`).join(' / ');
    return `${dateOnly(first.starts_at, timezone, tag)}<br><small>${ranges}</small>`;
  }).join('<br>');
}

export function renderStudent(data: StudentSnapshot, locale: StudentLocale = 'ja'): string {
  const t = studentCopy[locale];
  const tag = localeTag[locale];
  const timezone = data.student.timezone;
  const counts = {
    available: data.credits.filter(c => c.status === 'available').length,
    reserved: data.credits.filter(c => c.status === 'reserved').length,
    completed: data.credits.filter(c => c.status === 'completed').length,
  };
  const pendingCount = data.requests.filter(r => r.status === 'pending').length;
  const canRequest = data.student.status === 'active' && counts.available > pendingCount;
  const candidateRows = data.requests.map(request => {
    const candidates = data.candidates.filter(c => c.request_id === request.id);
    return `<div class="record"><div><strong>${candidateSummary(candidates, timezone, locale) || '—'}</strong><small>${escapeHtml(request.note || t.noNote)} · ${escapeHtml(timezone)}</small></div>${badge(request.status, status(request.status, locale))}</div>`;
  }).join('') || empty(t.noRecords);
  const bookingRows = data.bookings.filter(b => b.status === 'reserved').map(b => {
    const beforeDeadline = new Date(b.starts_at).getTime() > Date.now() + 12 * 60 * 60_000;
    return `<div class="record"><div><strong>${dateTime(b.starts_at, timezone, tag)}</strong><small>${escapeHtml(data.student.meeting_url || t.onlineLesson)} · ${escapeHtml(timezone)}</small></div><div class="booking-actions">${badge(b.status, status(b.status, locale))}${beforeDeadline ? `<button class="button mini danger ghost" data-cancel-own="${b.id}" data-label="${escapeHtml(`${dateTime(b.starts_at, timezone, tag)}（${timezone}）`)}">${escapeHtml(t.cancel)}</button>` : `<small>${escapeHtml(t.lateNotice)}</small>`}</div></div>`;
  }).join('') || empty(t.noBooking);
  const historyRows = data.history.map(h => `<div class="record"><div><strong>${dateTime(h.starts_at, timezone, tag)}</strong><small>${escapeHtml(h.note || t.received)} · ${escapeHtml(timezone)}</small></div>${badge('completed', t.completed)}</div>`).join('') || empty(t.noRecords);
  const paymentRows = data.payments.map(p => `<div class="record"><div><strong>${money(p.amount_minor, p.currency, tag)}</strong><small>${p.application_mode === 'evidence_only' ? t.evidenceNoCredit : `${p.requested_lesson_count}${t.count}`} · ${dateTime(p.submitted_at, timezone, tag)}</small>${p.rejection_reason ? `<small class="danger-text">${escapeHtml(t.reason)}：${escapeHtml(p.rejection_reason)}</small>` : ''}</div><div class="inline">${p.slip_path && p.slip_status === 'uploaded' ? `<button class="text-button" data-slip="${p.slip_path}">${escapeHtml(t.viewSlip)}</button>` : ''}${p.slip_status === 'missing' && p.status === 'pending' ? `<label class="file-retry">${escapeHtml(t.retryChoose)}<input type="file" data-retry-file="${p.id}" accept="image/jpeg,image/png,image/webp,application/pdf"></label><button class="button mini" data-retry-payment="${p.id}">${escapeHtml(t.retry)}</button>` : ''}${badge(p.status, status(p.status, locale))}</div></div>`).join('') || empty(t.noRecords);

  const bookingForm = canRequest
    ? `<p class="hint">${escapeHtml(t.requestHelp)}<br><strong>${escapeHtml(timezone)}</strong></p><form id="booking-form" data-timezone="${escapeHtml(timezone)}"><div id="candidate-fields">${candidateDay(1, locale)}</div><div class="button-row"><button type="button" class="button ghost" id="add-candidate">${escapeHtml(t.addDay)}</button><button class="button">${escapeHtml(t.sendRequest)}</button></div><label>${escapeHtml(t.noteToTeacher)}<textarea name="note" rows="2" maxlength="500"></textarea></label></form>`
    : `<div class="notice"><strong>${escapeHtml(data.student.status === 'inactive' ? t.inactiveTitle : t.cannotRequest)}</strong><p>${escapeHtml(data.student.status === 'inactive' ? t.inactiveHelp : data.student.status === 'paused' ? t.pausedHelp : t.cannotRequestHelp)}</p></div>`;

  const paymentForm = data.student.status === 'inactive'
    ? `<div class="notice"><strong>${escapeHtml(t.inactiveTitle)}</strong><p>${escapeHtml(t.inactiveHelp)}</p></div>`
    : `<p class="hint">${escapeHtml(t.paymentHelp)}</p><form id="payment-form"><div class="form-grid"><label>${escapeHtml(t.application)}<select name="mode"><option value="grant_new_credits">${escapeHtml(t.newCredits)}</option><option value="evidence_only">${escapeHtml(t.evidenceOnly)}</option></select></label><label data-lessons>${escapeHtml(t.lessonCount)}<input name="lessons" type="number" min="1" max="100" value="10" required></label><label>${escapeHtml(t.amount)}<input name="amount" type="number" min="0" step="0.01"></label><label>${escapeHtml(t.currency)}<select name="currency"><option>JPY</option><option>TWD</option><option>THB</option><option>USD</option></select></label><label class="wide">${escapeHtml(t.slip)}<input name="slip" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required></label></div><button class="button">${escapeHtml(t.send)}</button></form>`;

  const meetingUrl = safeGoogleMeetUrl(data.student.meeting_url);
  const notesFolderUrl = safeGoogleDriveUrl(data.student.notes_folder_url);
  const resourceLinks = [
    meetingUrl ? `<a class="button resource-link" href="${escapeHtml(meetingUrl)}" target="_blank" rel="noopener noreferrer">📹 ${escapeHtml(t.joinMeet)}</a>` : '',
    notesFolderUrl ? `<a class="button resource-link ghost" href="${escapeHtml(notesFolderUrl)}" target="_blank" rel="noopener noreferrer">📁 ${escapeHtml(t.openDrive)}</a>` : '',
  ].filter(Boolean).join('');
  const studentStatus = data.student.status === 'active' ? t.activeStatus : data.student.status === 'paused' ? t.pausedStatus : t.inactiveStatus;
  const lessonTimeline = `<div class="lesson-columns"><div><strong>${escapeHtml(t.bookedLessons)}</strong>${bookingRows}</div><div><strong>${escapeHtml(t.pastLessons)}</strong>${historyRows}</div></div>`;

  return `<div class="hero"><p class="eyebrow">MY CLASSROOM</p><h1>${escapeHtml(data.student.full_name)}${escapeHtml(t.hello)}</h1><p>${escapeHtml(t.intro)}</p><div class="hero-actions">${badge(data.student.status, studentStatus)}<button class="button mini ghost" data-toggle-student-lessons aria-expanded="false" aria-controls="student-lesson-timeline">${escapeHtml(t.showLessonDates)}</button></div></div>
  <ol class="flow-steps" aria-label="booking flow"><li class="done"><span>1</span>${escapeHtml(t.flow1)}</li><li class="${pendingCount ? 'active' : ''}"><span>2</span>${escapeHtml(t.flow2)}</li><li><span>3</span>${escapeHtml(t.flow3)}</li></ol>
  <div class="stats"><div><span>${escapeHtml(t.available)}</span><strong>${counts.available}</strong><small>${escapeHtml(t.count)}</small></div><div><span>${escapeHtml(t.reserved)}</span><strong>${counts.reserved}</strong><small>${escapeHtml(t.count)}</small></div><div><span>${escapeHtml(t.completed)}</span><strong>${counts.completed}</strong><small>${escapeHtml(t.count)}</small></div></div>
  <div class="grid two">
    <section class="student-lesson-timeline span-two" id="student-lesson-timeline" hidden>${card(t.lessonDates, lessonTimeline)}</section>
    ${card(t.resources, `${resourceLinks || `<p class="empty">${escapeHtml(t.noResources)}</p>`}<div class="recording-tool"><p class="hint">${escapeHtml(t.recordingHelp)}</p><button class="button" data-recording data-recording-label="${escapeHtml(data.student.full_name)}">🔴 ${escapeHtml(t.recordingStart)}</button><span class="hint" data-recording-status></span></div>`, 'span-two resource-card')}
    ${card(t.nextLesson, bookingRows, 'accent-card')}
    ${card(t.requestTitle, bookingForm)}
    ${card(t.paymentTitle, paymentForm, 'payment-card')}
    ${card(t.requests, candidateRows)}${card(t.payments, paymentRows)}${card(t.history, historyRows)}
  </div>`;
}

function reindexCandidateDays(locale: StudentLocale): void {
  const t = studentCopy[locale];
  document.querySelectorAll<HTMLElement>('.candidate-day').forEach((day, index) => {
    day.dataset.dayRank = String(index + 1);
    const heading = day.querySelector<HTMLElement>('.candidate-day-heading strong');
    if (heading) heading.textContent = `${t.dayCandidate} ${index + 1}`;
  });
}

function bindRemoveDays(locale: StudentLocale): void {
  document.querySelectorAll<HTMLButtonElement>('[data-remove-day]').forEach(button => {
    button.onclick = () => { button.closest('.candidate-day')?.remove(); reindexCandidateDays(locale); };
  });
}

function applyDateMinimum(timezone: string): void {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  const minimum = `${parts.year}-${parts.month}-${parts.day}`;
  document.querySelectorAll<HTMLInputElement>('[data-candidate-date]').forEach(input => { input.min = minimum; });
}

export function bindStudentActions(refresh: () => Promise<void>, locale: StudentLocale = 'ja'): void {
  const t = studentCopy[locale];
  document.querySelector<HTMLButtonElement>('[data-toggle-student-lessons]')?.addEventListener('click', event => {
    const button = event.currentTarget as HTMLButtonElement;
    const panel = document.querySelector<HTMLElement>('#student-lesson-timeline');
    if (!panel) return;
    const opening = panel.hidden;
    panel.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
    button.textContent = opening ? t.hideLessonDates : t.showLessonDates;
    if (opening) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.querySelector<HTMLButtonElement>('[data-recording]')?.addEventListener('click', async event => {
    const button = event.currentTarget as HTMLButtonElement;
    const statusElement = document.querySelector<HTMLElement>('[data-recording-status]');
    if (isRecording()) return stopLessonRecording();
    try {
      button.disabled = true;
      await startLessonRecording(button.dataset.recordingLabel ?? 'lesson', state => {
        button.disabled = false;
        button.textContent = state === 'recording' ? `⏹ ${t.recordingStop}` : `🔴 ${t.recordingStart}`;
        if (statusElement) statusElement.textContent = state === 'recording' ? `🔴 ${t.recording}` : t.recordingSaved;
        if (state === 'stopped') showToast(t.recordingSaved);
      });
    } catch (error) {
      button.disabled = false;
      showToast(error instanceof Error ? error.message : t.recording, 'error');
    }
  });
  document.querySelector('#add-candidate')?.addEventListener('click', () => {
    const container = document.querySelector('#candidate-fields');
    const count = container?.querySelectorAll('.candidate-day').length ?? 0;
    if (!container || count >= 5) return showToast(t.maxDays, 'error');
    container.insertAdjacentHTML('beforeend', candidateDay(count + 1, locale));
    bindRemoveDays(locale);
    applyDateMinimum(document.querySelector<HTMLFormElement>('#booking-form')?.dataset.timezone ?? 'Asia/Tokyo');
  });
  bindRemoveDays(locale);
  applyDateMinimum(document.querySelector<HTMLFormElement>('#booking-form')?.dataset.timezone ?? 'Asia/Tokyo');
  document.querySelector<HTMLSelectElement>('[name="mode"]')?.addEventListener('change', event => {
    const mode = (event.target as HTMLSelectElement).value;
    const field = document.querySelector<HTMLElement>('[data-lessons]');
    const input = field?.querySelector<HTMLInputElement>('input');
    if (field) field.hidden = mode === 'evidence_only';
    if (input) { input.disabled = mode === 'evidence_only'; input.required = mode !== 'evidence_only'; }
  });
  document.querySelectorAll<HTMLButtonElement>('[data-cancel-own]').forEach(button => button.addEventListener('click', async () => {
    if (!window.confirm(`${button.dataset.label}\n${t.cancel}?`)) return;
    try { setBusy(button, true); await cancelOwnBooking(button.dataset.cancelOwn!, t.cancel); await refresh(); showToast(t.cancelled); }
    catch (error) { showToast(error instanceof Error ? error.message : t.cancelled, 'error'); setBusy(button, false); }
  }));
  document.querySelector('#booking-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"], button:not([type])')!;
    try {
      setBusy(button, true);
      const windows: BookingWindow[] = [];
      [...form.querySelectorAll<HTMLElement>('.candidate-day')].forEach((day, dayIndex) => {
        const date = day.querySelector<HTMLInputElement>('[data-candidate-date]')?.value ?? '';
        [...day.querySelectorAll<HTMLElement>('.time-preference')].forEach((row, timeIndex) => {
          const start = row.querySelector<HTMLSelectElement>('[data-range-start]')?.value ?? '';
          const end = row.querySelector<HTMLSelectElement>('[data-range-end]')?.value ?? '';
          if (!start && !end && timeIndex > 0) return;
          if (!start || !end) throw new Error(t.invalidRange);
          windows.push({ ...toAvailabilityWindow(date, start, end, form.dataset.timezone), day_rank: dayIndex + 1, time_rank: timeIndex + 1 });
        });
      });
      await submitBooking(windows, String(new FormData(form).get('note') ?? ''));
      await refresh(); showToast(t.sentBooking);
    } catch (error) { showToast(error instanceof Error ? error.message : t.invalidRange, 'error'); setBusy(button, false); await refresh(); }
  });
  document.querySelectorAll<HTMLButtonElement>('[data-retry-payment]').forEach(button => button.addEventListener('click', async () => {
    const file = document.querySelector<HTMLInputElement>(`[data-retry-file="${button.dataset.retryPayment}"]`)?.files?.[0];
    if (!file) return showToast(t.retryChoose, 'error');
    try { setBusy(button, true); await retryPaymentSlip(button.dataset.retryPayment!, file); await refresh(); showToast(t.sentPayment); }
    catch (error) { showToast(error instanceof Error ? error.message : t.retry, 'error'); setBusy(button, false); await refresh(); }
  }));
  document.querySelector('#payment-form')?.addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement; const button = form.querySelector('button') as HTMLButtonElement;
    try { setBusy(button, true); const fd = new FormData(form); const file = fd.get('slip'); if (!(file instanceof File)) throw new Error(t.slip); const amount = String(fd.get('amount') ?? ''); const mode = String(fd.get('mode')) as 'grant_new_credits' | 'evidence_only'; await submitPayment({ mode, lessons: mode === 'grant_new_credits' ? Number(fd.get('lessons')) : undefined, amountMinor: amount ? Math.round(Number(amount) * 100) : undefined, currency: String(fd.get('currency')), file }); await refresh(); showToast(t.sentPayment); }
    catch (error) { showToast(error instanceof Error ? error.message : t.send, 'error'); setBusy(button, false); }
  });
  document.querySelectorAll<HTMLButtonElement>('[data-slip]').forEach(button => button.addEventListener('click', async () => {
    try { const url = await signedSlipUrl(button.dataset.slip!); window.open(url, '_blank', 'noopener,noreferrer'); } catch (error) { showToast(error instanceof Error ? error.message : t.viewSlip, 'error'); }
  }));
}
