import type { StudentInvitation, TeacherSnapshot } from '../types';
import { approveBooking, approvePayment, cancelBookingAsTeacher, completeBooking, inviteStudent, registerPurchase, reissueClaimCode, rejectBooking, rejectPayment, retryPaymentSlip, setStudentTeacherLabel, signedSlipUrl, submitPayment, updateStudentClassroomSettings, voidCredit } from '../lib/api';
import { dateOnly, dateTime, escapeHtml, money, statusLabel, timeOnly } from '../lib/format';
import { safeGoogleDriveUrl, safeGoogleMeetUrl } from '../lib/classroom-links';
import { isRecording, startLessonRecording, stopLessonRecording } from '../lib/recording';
import { badge, card, empty, setBusy, showToast } from './shared';

let latestInvitation: StudentInvitation | null = null;

export function renderTeacher(data: TeacherSnapshot): string {
  const name = (studentId: string) => data.students.find(s => s.id === studentId)?.full_name ?? '不明';
  const nickname = (studentId: string) => data.labels.find(label => label.student_id === studentId)?.nickname;
  const teacherName = (studentId: string) => nickname(studentId) ? `${name(studentId)}（${nickname(studentId)}）` : name(studentId);
  const zone = (studentId: string) => data.students.find(s => s.id === studentId)?.timezone ?? 'Asia/Tokyo';
  const exactStarts = (startsAt: string, endsAt: string) => {
    const values: string[] = [];
    for (let instant = new Date(startsAt).getTime(); instant + 50 * 60_000 <= new Date(endsAt).getTime(); instant += 30 * 60_000) values.push(new Date(instant).toISOString());
    return values;
  };
  const pendingRequests = data.requests.filter(r => r.status === 'pending').map(r => {
    const candidates = data.candidates.filter(c => c.request_id === r.id).sort((a, b) => a.day_rank - b.day_rank || a.time_rank - b.time_rank);
    return `<div class="teacher-record booking-review"><div><strong>${escapeHtml(teacherName(r.student_id))}</strong><small>${escapeHtml(r.note || 'メモなし')} · ${escapeHtml(zone(r.student_id))}</small></div><div class="candidate-actions">${candidates.map(c => {
      const options = exactStarts(c.starts_at, c.ends_at).map(value => `<option value="${value}">${timeOnly(value, zone(r.student_id))}開始</option>`).join('');
      const label = `候補日${c.day_rank}・第${c.time_rank}希望：${dateOnly(c.starts_at, zone(r.student_id))} ${timeOnly(c.starts_at, zone(r.student_id))}–${timeOnly(c.ends_at, zone(r.student_id))}`;
      return `<div class="candidate-approval"><strong>${escapeHtml(label)}</strong><div class="inline"><select data-approved-start="${c.id}" aria-label="確定する開始時刻">${options}</select><button class="button mini" data-approve-request="${r.id}" data-candidate="${c.id}" data-label="${escapeHtml(`${teacherName(r.student_id)}・${label}`)}">この時刻で承認</button></div></div>`;
    }).join('')}<button class="button mini danger" data-reject-request="${r.id}">申請を却下</button></div></div>`;
  }).join('') || empty();
  const pendingPayments = data.payments.filter(p => p.status === 'pending').map(p => `<div class="teacher-record"><div><strong>${escapeHtml(teacherName(p.student_id))}</strong><small>${p.application_mode === 'evidence_only' ? '証拠のみ（credit発行なし）' : `${p.requested_lesson_count}回のcreditを発行`} · ${money(p.amount_minor, p.currency)} · ${dateTime(p.submitted_at)}</small></div><div class="button-row">${p.slip_path && p.slip_status === 'uploaded' ? `<button class="button mini ghost" data-slip="${p.slip_path}">証拠</button>` : badge(p.slip_status, statusLabel(p.slip_status))}${p.slip_status === 'missing' ? `<label class="file-retry">証拠を選び直す<input type="file" data-retry-file="${p.id}" accept="image/jpeg,image/png,image/webp,application/pdf"></label><button class="button mini" data-retry-payment="${p.id}">再送信</button>` : ''}<button class="button mini" data-approve-payment="${p.id}" data-payment-label="${escapeHtml(p.application_mode === 'evidence_only' ? `${teacherName(p.student_id)}・証拠のみ（credit発行なし）` : `${teacherName(p.student_id)}・${p.requested_lesson_count}回のcredit発行`)}" ${p.slip_status !== 'uploaded' ? 'disabled' : ''}>承認</button><button class="button mini danger" data-reject-payment="${p.id}">却下</button></div></div>`).join('') || empty();
  const activeBookings = data.bookings.filter(b => b.status === 'reserved').map(b => `<div class="teacher-record"><div><strong>${escapeHtml(teacherName(b.student_id))}</strong><small>${dateTime(b.starts_at, zone(b.student_id))}（${escapeHtml(zone(b.student_id))}）</small></div><div class="button-row"><button class="button mini" data-complete="${b.id}" data-label="${escapeHtml(`${teacherName(b.student_id)}・${dateTime(b.starts_at, zone(b.student_id))}（${zone(b.student_id)}）`)}">授業完了</button><button class="button mini danger ghost" data-cancel-booking="${b.id}" data-label="${escapeHtml(`${teacherName(b.student_id)}・${dateTime(b.starts_at, zone(b.student_id))}（${zone(b.student_id)}）`)}">キャンセル</button></div></div>`).join('') || empty();
  const studentRows = data.students.map(student => {
    const counts = ['available', 'reserved', 'completed'].map(status => data.credits.filter(c => c.student_id === student.id && c.status === status).length);
    const meetingUrl = safeGoogleMeetUrl(student.meeting_url);
    const notesFolderUrl = safeGoogleDriveUrl(student.notes_folder_url);
    const statusText = student.status === 'active' ? '在籍中' : student.status === 'paused' ? '休止中' : '退会・停止中';
    const reservedLessons = data.bookings.filter(booking => booking.student_id === student.id && booking.status === 'reserved')
      .map(booking => `<div class="record"><strong>${dateTime(booking.starts_at, student.timezone)}</strong>${badge('reserved', '予約済み')}</div>`).join('') || empty('予約済み授業はありません');
    const pastLessons = data.history.filter(history => history.student_id === student.id)
      .map(history => `<div class="record"><div><strong>${dateTime(history.starts_at, student.timezone)}</strong><small>${escapeHtml(history.note || 'メモなし')}</small></div>${badge('completed', '完了')}</div>`).join('') || empty('過去の授業はありません');
    return `<div class="student-entry">
      <div class="student-line"><div><strong>${escapeHtml(teacherName(student.id))}</strong><small>${escapeHtml(student.email)}${nickname(student.id) ? ' · 括弧内は先生のみ表示' : ''}</small><div class="inline">${badge(student.status, statusText)}${student.auth_user_id ? badge('approved', '連携済み') : `<button class="button mini ghost" data-reissue="${student.id}">claim code再発行</button>`}</div></div>
      <div class="student-actions"><div class="credit-mini"><span>未予約 ${counts[0]}</span><span>予約 ${counts[1]}</span><span>完了 ${counts[2]}</span></div><div class="button-row">${meetingUrl ? `<a class="button mini" href="${escapeHtml(meetingUrl)}" target="_blank" rel="noopener noreferrer">📹 Meet</a>` : ''}${notesFolderUrl ? `<a class="button mini ghost" href="${escapeHtml(notesFolderUrl)}" target="_blank" rel="noopener noreferrer">📁 Drive</a>` : ''}<button class="button mini ghost" data-recording data-recording-label="${escapeHtml(teacherName(student.id))}">🔴 録画</button><button class="button mini ghost" data-toggle-student-lessons="${student.id}" aria-expanded="false">授業を見る</button><button class="button mini ghost" data-toggle-student-settings="${student.id}" aria-expanded="false">編集</button></div></div></div>
      <div class="student-lesson-panel" id="student-lessons-${student.id}" hidden><div><strong>予約済み授業</strong>${reservedLessons}</div><div><strong>過去の授業</strong>${pastLessons}</div></div>
      <div class="student-settings-panel" id="student-settings-${student.id}" hidden>
        <form class="teacher-label-form" data-label-form="${student.id}"><label>先生用の呼び名<input name="nickname" value="${escapeHtml(nickname(student.id) ?? '')}" maxlength="80" placeholder="未設定"></label><button class="button mini ghost">呼び名を保存</button></form>
        <form class="student-settings-form" data-settings-form="${student.id}"><div class="form-grid"><label>在籍状態<select name="status"><option value="active" ${student.status === 'active' ? 'selected' : ''}>在籍中（Active）</option><option value="paused" ${student.status === 'paused' ? 'selected' : ''}>休止中</option><option value="inactive" ${student.status === 'inactive' ? 'selected' : ''}>退会・停止（Inactive）</option></select></label><label>Google Meet<input name="meetingUrl" type="url" value="${escapeHtml(meetingUrl ?? '')}" placeholder="https://meet.google.com/..."></label><label class="wide">Google Drive・学習ノート<input name="notesFolderUrl" type="url" value="${escapeHtml(notesFolderUrl ?? '')}" placeholder="https://drive.google.com/..."></label></div><p class="hint">Inactiveにすると、新しい予約と支払いをDB側で停止します。過去の授業とリンクは本人に残ります。</p><button class="button">設定を保存</button></form>
      </div>
    </div>`;
  }).join('') || empty();
  const voidable = data.credits.filter(c => c.status === 'available').slice(0, 100).map(c => `<option value="${c.id}">${escapeHtml(teacherName(c.student_id))} · ${c.id.slice(0, 8)}</option>`).join('');

  const invitationPanel = latestInvitation ? `<div class="invitation-result" role="status"><strong>${escapeHtml(latestInvitation.student.email)} のclaim code</strong><code id="claim-code">${escapeHtml(latestInvitation.claim_code)}</code><div class="button-row"><button class="button mini" id="copy-claim-code">コピー</button><span>${dateTime(latestInvitation.expires_at)}まで有効</span></div><small>この画面を閉じる前に、本人へ安全な方法で送ってください。再発行すると前のcodeは無効になります。</small></div>` : '';

  return `<div class="hero teacher-hero"><p class="eyebrow">TEACHER DESK</p><h1>教室管理</h1><p>予約・授業完了・支払い・creditを安全なtransactionで管理します。</p></div>
  <div class="stats"><div><span>確認待ち予約</span><strong>${data.requests.filter(r => r.status === 'pending').length}</strong><small>件</small></div><div><span>確認待ち支払い</span><strong>${data.payments.filter(p => p.status === 'pending').length}</strong><small>件</small></div><div><span>予約済み授業</span><strong>${data.bookings.filter(b => b.status === 'reserved').length}</strong><small>件</small></div></div>
  <div class="grid two">
    ${card('✉️ 生徒を招待', `${invitationPanel}<p class="hint">生徒のGoogleログイン用メールを登録し、72時間有効のclaim codeを発行します。正式な登録名は、生徒本人が初回連携時に入力します。</p><form id="invite-form"><div class="form-grid"><label>メールアドレス<input name="email" type="email" required autocomplete="off"></label><label>先生用の呼び名（任意）<input name="nickname" maxlength="80" autocomplete="off"><small>生徒本人には表示されません。</small></label><label>タイムゾーン<select name="timezone"><option value="Asia/Tokyo">日本</option><option value="Asia/Taipei" selected>台湾</option><option value="Asia/Bangkok">タイ</option></select></label></div><button class="button">claim codeを発行</button></form>`, 'span-two onboarding-card')}
    ${card('🗓️ 予約申請', pendingRequests, 'span-two')}
    ${card('💳 支払い確認', pendingPayments, 'span-two payment-card')}
    ${card('🎓 予約済み授業', activeBookings)}
    ${card('🎥 録画（任意）', '<p class="hint">生徒一覧の「録画」を押し、Google Meetのタブと「タブの音声を共有」を選んでください。停止後、動画はこのMacへ保存されます。サーバーには送信されません。</p><span class="hint" data-teacher-recording-status></span>')}
    ${card('👥 生徒一覧', studentRows)}
    ${card('➕ 手動credit発行', `<form id="purchase-form"><label>生徒<select name="studentId" required><option value="">選択してください</option>${data.students.map(s => `<option value="${s.id}">${escapeHtml(teacherName(s.id))}</option>`).join('')}</select></label><label>回数<input type="number" name="lessons" min="1" max="100" value="10" required></label><label>理由<textarea name="note" required maxlength="500"></textarea></label><button class="button">発行する</button></form>`)}
    ${card('📷 先生が代理upload', `<form id="proxy-payment-form"><label>生徒<select name="studentId" required><option value="">選択してください</option>${data.students.map(s => `<option value="${s.id}">${escapeHtml(teacherName(s.id))}</option>`).join('')}</select></label><label>申請内容<select name="mode"><option value="grant_new_credits">新規購入</option><option value="evidence_only">証拠のみ</option></select></label><label>回数<input type="number" name="lessons" min="1" max="100" value="10"></label><label>証拠<input type="file" name="slip" accept="image/jpeg,image/png,image/webp,application/pdf" required></label><button class="button">代理送信</button></form>`)}
    ${card('⚙️ 管理者用（訂正・返金時のみ）', `<p class="hint">誤発行・返金・重複発行を訂正するときだけ使います。通常の授業運用では使いません。</p><details class="admin-tool"><summary>未使用creditの無効化を開く</summary><form id="void-form"><label>credit<select name="creditId" required><option value="">選択してください</option>${voidable}</select></label><label>理由<textarea name="reason" required maxlength="500"></textarea></label><button class="button danger">無効化する</button></form></details>`)}
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
  document.querySelectorAll<HTMLButtonElement>('[data-toggle-student-lessons]').forEach(button => button.addEventListener('click', () => {
    const panel = document.querySelector<HTMLElement>(`#student-lessons-${button.dataset.toggleStudentLessons}`);
    if (!panel) return;
    const opening = panel.hidden;
    panel.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
    button.textContent = opening ? '授業を閉じる' : '授業を見る';
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-toggle-student-settings]').forEach(button => button.addEventListener('click', () => {
    const panel = document.querySelector<HTMLElement>(`#student-settings-${button.dataset.toggleStudentSettings}`);
    if (!panel) return;
    const opening = panel.hidden;
    panel.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
    button.textContent = opening ? '編集を閉じる' : '編集';
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-recording]').forEach(button => button.addEventListener('click', async () => {
    if (isRecording()) return stopLessonRecording();
    const allButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-recording]')];
    const statusElement = document.querySelector<HTMLElement>('[data-teacher-recording-status]');
    try {
      allButtons.forEach(item => { item.disabled = true; });
      await startLessonRecording(button.dataset.recordingLabel ?? 'lesson', state => {
        allButtons.forEach(item => {
          item.disabled = state === 'recording' && item !== button;
          item.textContent = state === 'recording' && item === button ? '⏹ 録画停止' : '🔴 録画';
        });
        if (statusElement) statusElement.textContent = state === 'recording' ? `🔴 ${button.dataset.recordingLabel ?? ''}を録画中` : '録画をMacへ保存しました。';
        if (state === 'stopped') showToast('録画をMacへ保存しました。');
      });
    } catch (error) {
      allButtons.forEach(item => { item.disabled = false; });
      showToast(error instanceof Error ? error.message : '録画を開始できませんでした。', 'error');
    }
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-approve-request]').forEach(b => b.addEventListener('click', () => { const startsAt = document.querySelector<HTMLSelectElement>(`[data-approved-start="${b.dataset.candidate}"]`)?.value; if (!startsAt) return showToast('開始時刻を選んでください。', 'error'); if (window.confirm(`${b.dataset.label}\n開始：${dateTime(startsAt)}\nこの日時で予約を確定し、creditを1回予約済みにしますか？`)) void runButton(b, () => approveBooking(b.dataset.approveRequest!, b.dataset.candidate!, startsAt), refresh, '予約を承認しました。'); }));
  document.querySelectorAll<HTMLButtonElement>('[data-reject-request]').forEach(b => b.addEventListener('click', async () => { const value = await askReason('生徒にも表示されます。具体的で丁寧に入力してください。', '予約を却下', '理由を記録して却下'); if (value) void runButton(b, () => rejectBooking(b.dataset.rejectRequest!, value), refresh, '予約を却下しました。'); }));
  document.querySelectorAll<HTMLButtonElement>('[data-complete]').forEach(b => b.addEventListener('click', () => { if (window.confirm(`${b.dataset.label}\n授業を完了し、creditを使用済みにしますか？`)) void runButton(b, () => completeBooking(b.dataset.complete!), refresh, '授業を完了しました。'); }));
  document.querySelectorAll<HTMLButtonElement>('[data-cancel-booking]').forEach(b => b.addEventListener('click', async () => { const value = await askReason(`${b.dataset.label ?? ''}\n生徒にも表示するキャンセル理由を入力してください。`, '予約をキャンセル', '理由を記録してキャンセル'); if (value && window.confirm('予約をキャンセルし、creditを未予約へ戻しますか？')) void runButton(b, () => cancelBookingAsTeacher(b.dataset.cancelBooking!, value), refresh, '予約をキャンセルし、creditを戻しました。'); }));
  document.querySelectorAll<HTMLButtonElement>('[data-approve-payment]').forEach(b => b.addEventListener('click', () => { if (window.confirm(`${b.dataset.paymentLabel}\n証拠と内容を確認しましたか？`)) void runButton(b, () => approvePayment(b.dataset.approvePayment!), refresh, '支払いを承認しました。'); }));
  document.querySelectorAll<HTMLButtonElement>('[data-reject-payment]').forEach(b => b.addEventListener('click', async () => { const value = await askReason('生徒にも表示されます。再提出に必要なことが分かるように入力してください。', '支払いを却下', '理由を記録して却下'); if (value) void runButton(b, () => rejectPayment(b.dataset.rejectPayment!, value), refresh, '支払いを却下しました。'); }));
  document.querySelectorAll<HTMLButtonElement>('[data-slip]').forEach(b => b.addEventListener('click', async () => { try { window.open(await signedSlipUrl(b.dataset.slip!), '_blank', 'noopener,noreferrer'); } catch (error) { showToast(error instanceof Error ? error.message : '表示できませんでした。', 'error'); } }));
  document.querySelectorAll<HTMLButtonElement>('[data-retry-payment]').forEach(button => button.addEventListener('click', async () => { const file = document.querySelector<HTMLInputElement>(`[data-retry-file="${button.dataset.retryPayment}"]`)?.files?.[0]; if (!file) return showToast('再送信する証拠ファイルを選んでください。', 'error'); await runButton(button, () => retryPaymentSlip(button.dataset.retryPayment!, file), refresh, '証拠ファイルを再送信しました。'); }));
  document.querySelector('#invite-form')?.addEventListener('submit', async e => { e.preventDefault(); const form = e.currentTarget as HTMLFormElement; const fd = new FormData(form); const button = form.querySelector('button')!; try { setBusy(button, true); latestInvitation = await inviteStudent({ email: String(fd.get('email')), nickname: String(fd.get('nickname') ?? ''), timezone: String(fd.get('timezone')) }); showToast('claim codeを発行しました。'); await refresh(); } catch (error) { showToast(error instanceof Error ? error.message : '発行できませんでした。', 'error'); setBusy(button, false); } });
  document.querySelectorAll<HTMLButtonElement>('[data-reissue]').forEach(b => b.addEventListener('click', async () => { if (!window.confirm('新しいclaim codeを発行しますか？以前のcodeはすぐ無効になります。')) return; try { setBusy(b, true); latestInvitation = await reissueClaimCode(b.dataset.reissue!); showToast('新しいclaim codeを発行しました。'); await refresh(); } catch (error) { showToast(error instanceof Error ? error.message : '再発行できませんでした。', 'error'); setBusy(b, false); } }));
  document.querySelectorAll<HTMLFormElement>('[data-label-form]').forEach(form => form.addEventListener('submit', async event => { event.preventDefault(); const button = form.querySelector('button')!; const value = String(new FormData(form).get('nickname') ?? ''); await runButton(button, () => setStudentTeacherLabel(form.dataset.labelForm!, value), refresh, value.trim() ? '先生用の呼び名を保存しました。' : '先生用の呼び名を削除しました。'); }));
  document.querySelectorAll<HTMLFormElement>('[data-settings-form]').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(form);
    const status = String(data.get('status')) as 'active' | 'paused' | 'inactive';
    if (status === 'inactive' && !window.confirm('Inactiveにすると、この生徒は新しい予約と支払いを送れなくなります。保存しますか？')) return;
    await runButton(form.querySelector('button')!, () => updateStudentClassroomSettings({
      studentId: form.dataset.settingsForm!,
      status,
      meetingUrl: String(data.get('meetingUrl') ?? ''),
      notesFolderUrl: String(data.get('notesFolderUrl') ?? ''),
    }), refresh, '在籍状態とレッスンリンクを保存しました。');
  }));
  document.querySelector('#copy-claim-code')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(latestInvitation?.claim_code ?? ''); showToast('claim codeをコピーしました。'); } catch { showToast('コピーできませんでした。codeを選択してコピーしてください。', 'error'); } });
  document.querySelector('#purchase-form')?.addEventListener('submit', async e => { e.preventDefault(); const form = e.currentTarget as HTMLFormElement; const fd = new FormData(form); if (window.confirm(`${Number(fd.get('lessons'))}回のcreditを発行しますか？理由も記録されます。`)) await runButton(form.querySelector('button')!, () => registerPurchase(String(fd.get('studentId')), Number(fd.get('lessons')), String(fd.get('note'))), refresh, 'creditを発行しました。'); });
  document.querySelector('#void-form')?.addEventListener('submit', async e => { e.preventDefault(); const form = e.currentTarget as HTMLFormElement; const fd = new FormData(form); if (window.confirm('このcreditを無効化しますか？この操作は元に戻せません。')) await runButton(form.querySelector('button')!, () => voidCredit(String(fd.get('creditId')), String(fd.get('reason'))), refresh, 'creditを無効化しました。'); });
  document.querySelector('#proxy-payment-form')?.addEventListener('submit', async e => { e.preventDefault(); const form = e.currentTarget as HTMLFormElement; const fd = new FormData(form); const file = fd.get('slip'); if (!(file instanceof File)) return showToast('ファイルを選んでください。', 'error'); const mode = String(fd.get('mode')) as 'grant_new_credits' | 'evidence_only'; await runButton(form.querySelector('button')!, () => submitPayment({ studentId: String(fd.get('studentId')), mode, lessons: mode === 'grant_new_credits' ? Number(fd.get('lessons')) : undefined, file }), refresh, '代理uploadが完了しました。'); });
}
