import type { StudentInvitation, TeacherSnapshot } from '../types';
import { approveBooking, approvePayment, cancelBookingAsTeacher, completeBooking, inviteStudent, registerPurchase, reissueClaimCode, rejectBooking, rejectPayment, retryPaymentSlip, signedSlipUrl, submitPayment, voidCredit } from '../lib/api';
import { dateTime, escapeHtml, money, statusLabel } from '../lib/format';
import { badge, card, empty, setBusy, showToast } from './shared';

let latestInvitation: StudentInvitation | null = null;

export function renderTeacher(data: TeacherSnapshot): string {
  const name = (studentId: string) => data.students.find(s => s.id === studentId)?.full_name ?? '不明';
  const zone = (studentId: string) => data.students.find(s => s.id === studentId)?.timezone ?? 'Asia/Tokyo';
  const pendingRequests = data.requests.filter(r => r.status === 'pending').map(r => {
    const candidates = data.candidates.filter(c => c.request_id === r.id);
    return `<div class="teacher-record"><div><strong>${escapeHtml(name(r.student_id))}</strong><small>${escapeHtml(r.note || 'メモなし')} · ${escapeHtml(zone(r.student_id))}</small></div><div class="candidate-actions">${candidates.map(c => `<button class="button mini" data-approve-request="${r.id}" data-candidate="${c.id}" data-label="${escapeHtml(`${name(r.student_id)}・${dateTime(c.starts_at, zone(r.student_id))}（${zone(r.student_id)}）`)}">${dateTime(c.starts_at, zone(r.student_id))}を承認</button>`).join('')}<button class="button mini danger" data-reject-request="${r.id}">却下</button></div></div>`;
  }).join('') || empty();
  const pendingPayments = data.payments.filter(p => p.status === 'pending').map(p => `<div class="teacher-record"><div><strong>${escapeHtml(name(p.student_id))}</strong><small>${p.application_mode === 'evidence_only' ? '証拠のみ（credit発行なし）' : `${p.requested_lesson_count}回のcreditを発行`} · ${money(p.amount_minor, p.currency)} · ${dateTime(p.submitted_at)}</small></div><div class="button-row">${p.slip_path && p.slip_status === 'uploaded' ? `<button class="button mini ghost" data-slip="${p.slip_path}">証拠</button>` : badge(p.slip_status, statusLabel(p.slip_status))}${p.slip_status === 'missing' ? `<label class="file-retry">証拠を選び直す<input type="file" data-retry-file="${p.id}" accept="image/jpeg,image/png,image/webp,application/pdf"></label><button class="button mini" data-retry-payment="${p.id}">再送信</button>` : ''}<button class="button mini" data-approve-payment="${p.id}" data-payment-label="${escapeHtml(p.application_mode === 'evidence_only' ? `${name(p.student_id)}・証拠のみ（credit発行なし）` : `${name(p.student_id)}・${p.requested_lesson_count}回のcredit発行`)}" ${p.slip_status !== 'uploaded' ? 'disabled' : ''}>承認</button><button class="button mini danger" data-reject-payment="${p.id}">却下</button></div></div>`).join('') || empty();
  const activeBookings = data.bookings.filter(b => b.status === 'reserved').map(b => `<div class="teacher-record"><div><strong>${escapeHtml(name(b.student_id))}</strong><small>${dateTime(b.starts_at, zone(b.student_id))}（${escapeHtml(zone(b.student_id))}）</small></div><div class="button-row"><button class="button mini" data-complete="${b.id}" data-label="${escapeHtml(`${name(b.student_id)}・${dateTime(b.starts_at, zone(b.student_id))}（${zone(b.student_id)}）`)}">授業完了</button><button class="button mini danger ghost" data-cancel-booking="${b.id}" data-label="${escapeHtml(`${name(b.student_id)}・${dateTime(b.starts_at, zone(b.student_id))}（${zone(b.student_id)}）`)}">キャンセル</button></div></div>`).join('') || empty();
  const studentRows = data.students.map(student => {
    const counts = ['available', 'reserved', 'completed'].map(status => data.credits.filter(c => c.student_id === student.id && c.status === status).length);
    return `<div class="student-line"><div><strong>${escapeHtml(student.full_name)}</strong><small>${escapeHtml(student.email)}</small></div><div class="student-actions">${student.auth_user_id ? badge('approved', '連携済み') : `<button class="button mini ghost" data-reissue="${student.id}">claim code再発行</button>`}<div class="credit-mini"><span>未予約 ${counts[0]}</span><span>予約 ${counts[1]}</span><span>完了 ${counts[2]}</span></div></div></div>`;
  }).join('') || empty();
  const voidable = data.credits.filter(c => c.status === 'available').slice(0, 100).map(c => `<option value="${c.id}">${escapeHtml(name(c.student_id))} · ${c.id.slice(0, 8)}</option>`).join('');

  const invitationPanel = latestInvitation ? `<div class="invitation-result" role="status"><strong>${escapeHtml(latestInvitation.student.full_name)}さんのclaim code</strong><code id="claim-code">${escapeHtml(latestInvitation.claim_code)}</code><div class="button-row"><button class="button mini" id="copy-claim-code">コピー</button><span>${dateTime(latestInvitation.expires_at)}まで有効</span></div><small>この画面を閉じる前に、本人へ安全な方法で送ってください。再発行すると前のcodeは無効になります。</small></div>` : '';

  return `<div class="hero teacher-hero"><p class="eyebrow">TEACHER DESK</p><h1>教室管理</h1><p>予約・授業完了・支払い・creditを安全なtransactionで管理します。</p></div>
  <div class="stats"><div><span>確認待ち予約</span><strong>${data.requests.filter(r => r.status === 'pending').length}</strong><small>件</small></div><div><span>確認待ち支払い</span><strong>${data.payments.filter(p => p.status === 'pending').length}</strong><small>件</small></div><div><span>予約済み授業</span><strong>${data.bookings.filter(b => b.status === 'reserved').length}</strong><small>件</small></div></div>
  <div class="grid two">
    ${card('✉️ 生徒を招待', `${invitationPanel}<p class="hint">生徒のGoogleログイン用メールを登録し、72時間有効のclaim codeを発行します。</p><form id="invite-form"><div class="form-grid"><label>お名前<input name="fullName" required maxlength="120" autocomplete="off"></label><label>メールアドレス<input name="email" type="email" required autocomplete="off"></label><label>呼び名（任意）<input name="nickname" maxlength="80" autocomplete="off"></label><label>タイムゾーン<select name="timezone"><option value="Asia/Tokyo">日本</option><option value="Asia/Taipei" selected>台湾</option><option value="Asia/Bangkok">タイ</option></select></label></div><button class="button">生徒を作成してcodeを発行</button></form>`, 'span-two onboarding-card')}
    ${card('🗓️ 予約申請', pendingRequests, 'span-two')}
    ${card('💳 支払い確認', pendingPayments, 'span-two payment-card')}
    ${card('🎓 予約済み授業', activeBookings)}
    ${card('👥 生徒一覧', studentRows)}
    ${card('➕ 手動credit発行', `<form id="purchase-form"><label>生徒<select name="studentId" required><option value="">選択してください</option>${data.students.map(s => `<option value="${s.id}">${escapeHtml(s.full_name)}</option>`).join('')}</select></label><label>回数<input type="number" name="lessons" min="1" max="100" value="10" required></label><label>理由<textarea name="note" required maxlength="500"></textarea></label><button class="button">発行する</button></form>`)}
    ${card('📷 先生が代理upload', `<form id="proxy-payment-form"><label>生徒<select name="studentId" required><option value="">選択してください</option>${data.students.map(s => `<option value="${s.id}">${escapeHtml(s.full_name)}</option>`).join('')}</select></label><label>申請内容<select name="mode"><option value="grant_new_credits">新規購入</option><option value="evidence_only">証拠のみ</option></select></label><label>回数<input type="number" name="lessons" min="1" max="100" value="10"></label><label>証拠<input type="file" name="slip" accept="image/jpeg,image/png,image/webp,application/pdf" required></label><button class="button">代理送信</button></form>`)}
    ${card('🚫 未使用creditを無効化', `<form id="void-form"><label>credit<select name="creditId" required><option value="">選択してください</option>${voidable}</select></label><label>理由<textarea name="reason" required maxlength="500"></textarea></label><button class="button danger">無効化する</button></form>`)}
  </div>`;
}

function askReason(message: string, title: string, submitLabel: string): Promise<string> {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'reason-dialog';
    dialog.innerHTML = `<form method="dialog"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p><label>理由<textarea name="reason" required maxlength="500" rows="4" autofocus></textarea></label><div class="button-row"><button class="button ghost" value="cancel">戻る</button><button class="button danger" value="submit">${escapeHtml(submitLabel)}</button></div></form>`;
    document.body.append(dialog);
    dialog.addEventListener('close', () => {
      const value = dialog.returnValue === 'submit'
        ? (new FormData(dialog.querySelector('form')!).get('reason')?.toString().trim() ?? '')
        : '';
      dialog.remove();
      resolve(value);
    }, { once: true });
    dialog.showModal();
  });
}
async function runButton(button: HTMLButtonElement, action: () => Promise<void>, refresh: () => Promise<void>, success: string) {
  try { setBusy(button, true); await action(); await refresh(); showToast(success); } catch (error) { const message = error instanceof Error ? error.message : '処理できませんでした。'; setBusy(button, false); await refresh().catch(() => undefined); showToast(message, 'error'); }
}

export function bindTeacherActions(refresh: () => Promise<void>): void {
  document.querySelectorAll<HTMLButtonElement>('[data-approve-request]').forEach(b => b.addEventListener('click', () => { if (window.confirm(`${b.dataset.label}\nこの日時で予約を確定し、creditを1回予約済みにしますか？`)) void runButton(b, () => approveBooking(b.dataset.approveRequest!, b.dataset.candidate!), refresh, '予約を承認しました。'); }));
  document.querySelectorAll<HTMLButtonElement>('[data-reject-request]').forEach(b => b.addEventListener('click', async () => { const value = await askReason('生徒にも表示されます。具体的で丁寧に入力してください。', '予約を却下', '理由を記録して却下'); if (value) void runButton(b, () => rejectBooking(b.dataset.rejectRequest!, value), refresh, '予約を却下しました。'); }));
  document.querySelectorAll<HTMLButtonElement>('[data-complete]').forEach(b => b.addEventListener('click', () => { if (window.confirm(`${b.dataset.label}\n授業を完了し、creditを使用済みにしますか？`)) void runButton(b, () => completeBooking(b.dataset.complete!), refresh, '授業を完了しました。'); }));
  document.querySelectorAll<HTMLButtonElement>('[data-cancel-booking]').forEach(b => b.addEventListener('click', async () => { const value = await askReason(`${b.dataset.label ?? ''}\n生徒にも表示するキャンセル理由を入力してください。`, '予約をキャンセル', '理由を記録してキャンセル'); if (value && window.confirm('予約をキャンセルし、creditを未予約へ戻しますか？')) void runButton(b, () => cancelBookingAsTeacher(b.dataset.cancelBooking!, value), refresh, '予約をキャンセルし、creditを戻しました。'); }));
  document.querySelectorAll<HTMLButtonElement>('[data-approve-payment]').forEach(b => b.addEventListener('click', () => { if (window.confirm(`${b.dataset.paymentLabel}\n証拠と内容を確認しましたか？`)) void runButton(b, () => approvePayment(b.dataset.approvePayment!), refresh, '支払いを承認しました。'); }));
  document.querySelectorAll<HTMLButtonElement>('[data-reject-payment]').forEach(b => b.addEventListener('click', async () => { const value = await askReason('生徒にも表示されます。再提出に必要なことが分かるように入力してください。', '支払いを却下', '理由を記録して却下'); if (value) void runButton(b, () => rejectPayment(b.dataset.rejectPayment!, value), refresh, '支払いを却下しました。'); }));
  document.querySelectorAll<HTMLButtonElement>('[data-slip]').forEach(b => b.addEventListener('click', async () => { try { window.open(await signedSlipUrl(b.dataset.slip!), '_blank', 'noopener,noreferrer'); } catch (error) { showToast(error instanceof Error ? error.message : '表示できませんでした。', 'error'); } }));
  document.querySelectorAll<HTMLButtonElement>('[data-retry-payment]').forEach(button => button.addEventListener('click', async () => { const file = document.querySelector<HTMLInputElement>(`[data-retry-file="${button.dataset.retryPayment}"]`)?.files?.[0]; if (!file) return showToast('再送信する証拠ファイルを選んでください。', 'error'); await runButton(button, () => retryPaymentSlip(button.dataset.retryPayment!, file), refresh, '証拠ファイルを再送信しました。'); }));
  document.querySelector('#invite-form')?.addEventListener('submit', async e => { e.preventDefault(); const form = e.currentTarget as HTMLFormElement; const fd = new FormData(form); const button = form.querySelector('button')!; try { setBusy(button, true); latestInvitation = await inviteStudent({ email: String(fd.get('email')), fullName: String(fd.get('fullName')), nickname: String(fd.get('nickname') ?? ''), timezone: String(fd.get('timezone')) }); showToast('生徒を作成し、claim codeを発行しました。'); await refresh(); } catch (error) { showToast(error instanceof Error ? error.message : '発行できませんでした。', 'error'); setBusy(button, false); } });
  document.querySelectorAll<HTMLButtonElement>('[data-reissue]').forEach(b => b.addEventListener('click', async () => { if (!window.confirm('新しいclaim codeを発行しますか？以前のcodeはすぐ無効になります。')) return; try { setBusy(b, true); latestInvitation = await reissueClaimCode(b.dataset.reissue!); showToast('新しいclaim codeを発行しました。'); await refresh(); } catch (error) { showToast(error instanceof Error ? error.message : '再発行できませんでした。', 'error'); setBusy(b, false); } }));
  document.querySelector('#copy-claim-code')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(latestInvitation?.claim_code ?? ''); showToast('claim codeをコピーしました。'); } catch { showToast('コピーできませんでした。codeを選択してコピーしてください。', 'error'); } });
  document.querySelector('#purchase-form')?.addEventListener('submit', async e => { e.preventDefault(); const form = e.currentTarget as HTMLFormElement; const fd = new FormData(form); if (window.confirm(`${Number(fd.get('lessons'))}回のcreditを発行しますか？理由も記録されます。`)) await runButton(form.querySelector('button')!, () => registerPurchase(String(fd.get('studentId')), Number(fd.get('lessons')), String(fd.get('note'))), refresh, 'creditを発行しました。'); });
  document.querySelector('#void-form')?.addEventListener('submit', async e => { e.preventDefault(); const form = e.currentTarget as HTMLFormElement; const fd = new FormData(form); if (window.confirm('このcreditを無効化しますか？この操作は元に戻せません。')) await runButton(form.querySelector('button')!, () => voidCredit(String(fd.get('creditId')), String(fd.get('reason'))), refresh, 'creditを無効化しました。'); });
  document.querySelector('#proxy-payment-form')?.addEventListener('submit', async e => { e.preventDefault(); const form = e.currentTarget as HTMLFormElement; const fd = new FormData(form); const file = fd.get('slip'); if (!(file instanceof File)) return showToast('ファイルを選んでください。', 'error'); const mode = String(fd.get('mode')) as 'grant_new_credits' | 'evidence_only'; await runButton(form.querySelector('button')!, () => submitPayment({ studentId: String(fd.get('studentId')), mode, lessons: mode === 'grant_new_credits' ? Number(fd.get('lessons')) : undefined, file }), refresh, '代理uploadが完了しました。'); });
}
