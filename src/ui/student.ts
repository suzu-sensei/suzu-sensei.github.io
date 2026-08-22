import type { StudentSnapshot } from '../types';
import { cancelOwnBooking, retryPaymentSlip, submitBooking, submitPayment, signedSlipUrl } from '../lib/api';
import { dateTime, escapeHtml, money, statusLabel } from '../lib/format';
import { toIsoInterval } from '../lib/validation';
import { badge, card, empty, setBusy, showToast } from './shared';

export function renderStudent(data: StudentSnapshot): string {
  const timezone = data.student.timezone;
  const counts = {
    available: data.credits.filter(c => c.status === 'available').length,
    reserved: data.credits.filter(c => c.status === 'reserved').length,
    completed: data.credits.filter(c => c.status === 'completed').length,
    voided: data.credits.filter(c => c.status === 'voided').length,
  };
  const pendingCount = data.requests.filter(r => r.status === 'pending').length;
  const canRequest = counts.available > pendingCount;
  const candidateRows = data.requests.map(request => {
    const candidates = data.candidates.filter(c => c.request_id === request.id);
    return `<div class="record"><div><strong>${candidates.map(c => dateTime(c.starts_at, timezone)).join('<br>') || '—'}</strong><small>${escapeHtml(request.note || 'メモなし')} · ${escapeHtml(timezone)}</small></div>${badge(request.status, statusLabel(request.status))}</div>`;
  }).join('') || empty();
  const bookingRows = data.bookings.filter(b => b.status === 'reserved').map(b => {
    const beforeDeadline = new Date(b.starts_at).getTime() > Date.now() + 12 * 60 * 60_000;
    return `<div class="record"><div><strong>${dateTime(b.starts_at, timezone)}</strong><small>${escapeHtml(data.student.meeting_url || 'オンライン授業')} · ${escapeHtml(timezone)}</small></div><div class="booking-actions">${badge(b.status, statusLabel(b.status))}${beforeDeadline ? `<button class="button mini danger ghost" data-cancel-own="${b.id}" data-label="${escapeHtml(`${dateTime(b.starts_at, timezone)}（${timezone}）`)}">キャンセル</button>` : '<small>12時間前を過ぎた変更は先生へ連絡</small>'}</div></div>`;
  }).join('') || empty('現在、確定した予約はありません');
  const historyRows = data.history.map(h => `<div class="record"><div><strong>${dateTime(h.starts_at, timezone)}</strong><small>${escapeHtml(h.note || '受講済み')} · ${escapeHtml(timezone)}</small></div>${badge('completed', '完了')}</div>`).join('') || empty();
  const paymentRows = data.payments.map(p => `<div class="record"><div><strong>${money(p.amount_minor, p.currency)}</strong><small>${p.application_mode === 'evidence_only' ? '証拠のみ · credit発行なし' : `${p.requested_lesson_count}回分`} · ${dateTime(p.submitted_at)}</small>${p.rejection_reason ? `<small class="danger-text">理由：${escapeHtml(p.rejection_reason)}</small>` : ''}</div><div class="inline">${p.slip_path && p.slip_status === 'uploaded' ? `<button class="text-button" data-slip="${p.slip_path}">証拠を見る</button>` : ''}${p.slip_status === 'missing' && p.status === 'pending' ? `<label class="file-retry">証拠を選び直す<input type="file" data-retry-file="${p.id}" accept="image/jpeg,image/png,image/webp,application/pdf"></label><button class="button mini" data-retry-payment="${p.id}">再送信</button>` : ''}${badge(p.status, statusLabel(p.status))}</div></div>`).join('') || empty();

  const bookingForm = canRequest
    ? `<p class="hint">候補は最大5件。時刻は${escapeHtml(timezone)}として登録します。送信しただけでは予約確定になりません。</p><form id="booking-form" data-timezone="${escapeHtml(timezone)}"><div id="candidate-fields"><label>第1希望（${escapeHtml(timezone)}）<input name="candidate" type="datetime-local" required></label></div><div class="button-row"><button type="button" class="button ghost" id="add-candidate">＋候補を追加</button><button class="button">予約を申請</button></div><label>先生へのメモ<textarea name="note" rows="2" maxlength="500"></textarea></label></form>`
    : `<div class="notice"><strong>現在は新しい予約申請を送れません</strong><p>未予約creditがないか、確認待ちの申請があります。支払いまたは先生の確認が完了すると申請できます。</p></div>`;

  return `<div class="hero"><p class="eyebrow">MY CLASSROOM</p><h1>${escapeHtml(data.student.nickname || data.student.full_name)}さん、こんにちは</h1><p>授業の回数・予約・お支払いをここで確認できます。</p></div>
  <ol class="flow-steps" aria-label="予約の流れ"><li class="done"><span>1</span>creditを確認</li><li class="${pendingCount ? 'active' : ''}"><span>2</span>希望日時を送信</li><li><span>3</span>先生の承認で確定</li></ol>
  <div class="stats">
    <div><span>未予約</span><strong>${counts.available}</strong><small>回</small></div>
    <div><span>予約済み</span><strong>${counts.reserved}</strong><small>回</small></div>
    <div><span>完了</span><strong>${counts.completed}</strong><small>回</small></div>
  </div>
  <div class="grid two">
    ${card('🗓️ 次の授業', bookingRows, 'accent-card')}
    ${card('✨ 希望日時を送る', bookingForm)}
    ${card('💳 お支払い証拠を送る', `<p class="hint">JPEG・PNG・WebP・PDF、10MB以下。先生の確認後にcreditへ反映されます。</p><form id="payment-form"><div class="form-grid"><label>申請内容<select name="mode"><option value="grant_new_credits">新しい授業回数を購入</option><option value="evidence_only">証拠のみ提出</option></select></label><label data-lessons>授業回数<input name="lessons" type="number" min="1" max="100" value="10" required></label><label>金額<input name="amount" type="number" min="0" step="0.01" placeholder="例：3000"></label><label>通貨<select name="currency"><option>JPY</option><option>TWD</option><option>THB</option><option>USD</option></select></label><label class="wide">振込証拠<input name="slip" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required></label></div><button class="button">安全に送信する</button></form>`, 'payment-card')}
    ${card('📋 予約申請', candidateRows)}
    ${card('🧾 支払い記録', paymentRows)}
    ${card('🎓 授業履歴', historyRows)}
  </div>`;
}

export function bindStudentActions(refresh: () => Promise<void>): void {
  document.querySelector('#add-candidate')?.addEventListener('click', () => {
    const container = document.querySelector('#candidate-fields');
    const count = container?.querySelectorAll('input').length ?? 0;
    if (!container || count >= 5) return showToast('候補は最大5件です。', 'error');
    const timezone = document.querySelector<HTMLFormElement>('#booking-form')?.dataset.timezone ?? '';
    container.insertAdjacentHTML('beforeend', `<label>第${count + 1}希望（${escapeHtml(timezone)}）<input name="candidate" type="datetime-local" required></label>`);
  });
  document.querySelector<HTMLSelectElement>('[name="mode"]')?.addEventListener('change', (event) => {
    const mode = (event.target as HTMLSelectElement).value;
    const field = document.querySelector<HTMLElement>('[data-lessons]');
    const input = field?.querySelector<HTMLInputElement>('input');
    if (field) field.hidden = mode === 'evidence_only';
    if (input) { input.disabled = mode === 'evidence_only'; input.required = mode !== 'evidence_only'; }
  });
  document.querySelectorAll<HTMLButtonElement>('[data-cancel-own]').forEach(button => button.addEventListener('click', async () => {
    if (!window.confirm(`${button.dataset.label}\nこの予約をキャンセルしますか？creditは未予約へ戻ります。`)) return;
    try { setBusy(button, true); await cancelOwnBooking(button.dataset.cancelOwn!, '生徒によるキャンセル'); await refresh(); showToast('予約をキャンセルし、creditを戻しました。'); }
    catch (error) { showToast(error instanceof Error ? error.message : 'キャンセルできませんでした。', 'error'); setBusy(button, false); }
  }));
  document.querySelector('#booking-form')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement;
    const button = form.querySelector('button[type="submit"], button:not([type])') as HTMLButtonElement;
    try { setBusy(button, true); const fd = new FormData(form); const starts = fd.getAll('candidate').map(v => toIsoInterval(String(v), 50, form.dataset.timezone).starts_at); await submitBooking(starts, String(fd.get('note') ?? '')); await refresh(); showToast('予約希望を送りました。'); }
    catch (error) { showToast(error instanceof Error ? error.message : '送信できませんでした。', 'error'); setBusy(button, false); await refresh(); }
  });
  document.querySelectorAll<HTMLButtonElement>('[data-retry-payment]').forEach(button => button.addEventListener('click', async () => {
    const file = document.querySelector<HTMLInputElement>(`[data-retry-file="${button.dataset.retryPayment}"]`)?.files?.[0];
    if (!file) return showToast('再送信する証拠ファイルを選んでください。', 'error');
    try { setBusy(button, true); await retryPaymentSlip(button.dataset.retryPayment!, file); await refresh(); showToast('証拠ファイルを再送信しました。'); }
    catch (error) { showToast(error instanceof Error ? error.message : '再送信できませんでした。', 'error'); setBusy(button, false); await refresh(); }
  }));
  document.querySelector('#payment-form')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget as HTMLFormElement; const button = form.querySelector('button') as HTMLButtonElement;
    try { setBusy(button, true); const fd = new FormData(form); const file = fd.get('slip'); if (!(file instanceof File)) throw new Error('ファイルを選んでください。'); const amount = String(fd.get('amount') ?? ''); const mode = String(fd.get('mode')) as 'grant_new_credits' | 'evidence_only'; await submitPayment({ mode, lessons: mode === 'grant_new_credits' ? Number(fd.get('lessons')) : undefined, amountMinor: amount ? Math.round(Number(amount) * 100) : undefined, currency: String(fd.get('currency')), file }); await refresh(); showToast('お支払い証拠を安全に送信しました。'); }
    catch (error) { showToast(error instanceof Error ? error.message : '送信できませんでした。', 'error'); setBusy(button, false); }
  });
  document.querySelectorAll<HTMLButtonElement>('[data-slip]').forEach(button => button.addEventListener('click', async () => {
    try { const url = await signedSlipUrl(button.dataset.slip!); window.open(url, '_blank', 'noopener,noreferrer'); } catch (error) { showToast(error instanceof Error ? error.message : '表示できませんでした。', 'error'); }
  }));
}
