import './styles.css';
import { supabase } from './lib/supabase';
import { claimProfile, isTeacher, loadStudent, loadTeacher, loginWithGoogle, logout } from './lib/api';
import { escapeHtml } from './lib/format';
import { bindStudentActions, renderStudent } from './ui/student';
import { bindTeacherActions, renderTeacher } from './ui/teacher';
import { shell, showToast } from './ui/shared';
import { authErrorNotice } from './lib/auth-url';

const app = document.querySelector<HTMLDivElement>('#app')!;

async function render(): Promise<void> {
  app.innerHTML = '<div class="loading"><span></span><p>教室を準備しています…</p></div>';
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const authNotice = authErrorNotice(window.location.href);
    app.innerHTML = `<main class="login-page"><section class="login-card"><p class="eyebrow">SUZU CLASSROOM</p><h1>すず先生の教室</h1><p>予約、授業回数、お支払いを安全に管理する教室portalです。</p>${authNotice ? `<div class="notice auth-notice" role="alert">${escapeHtml(authNotice)}</div>` : ''}<button class="button google" id="login">Googleでログイン</button><small>ログイン後も、データの閲覧範囲はデータベース側で保護されます。</small></section></main><div id="toast" class="toast" role="status" aria-live="polite"></div>`;
    document.querySelector<HTMLButtonElement>('#login')?.addEventListener('click', async event => { const button = event.currentTarget as HTMLButtonElement; button.disabled = true; button.textContent = 'Googleへ移動中…'; window.history.replaceState({}, '', window.location.origin); try { await loginWithGoogle(); } catch (error) { button.disabled = false; button.textContent = 'Googleでログイン'; showToast(error instanceof Error ? error.message : 'ログインを開始できませんでした。', 'error'); } });
    return;
  }
  try {
    const teacher = await isTeacher(session.user.id);
    if (teacher) {
      app.innerHTML = shell(renderTeacher(await loadTeacher()), session.user.email ?? 'Teacher');
      bindTeacherActions(render);
    } else {
      const data = await loadStudent();
      if (data) { app.innerHTML = shell(renderStudent(data), session.user.email ?? 'Student'); bindStudentActions(render); }
      else {
        app.innerHTML = shell(`<section class="claim-card"><p class="eyebrow">WELCOME</p><h1>生徒profileを連携</h1><p>先生から受け取ったclaim codeを入力してください。他の生徒の情報は表示されません。</p><form id="claim-form"><label>Claim code<input name="token" required autocomplete="one-time-code"></label><button class="button">連携する</button></form></section>`, session.user.email ?? 'User');
        document.querySelector('#claim-form')?.addEventListener('submit', async e => { e.preventDefault(); const form = e.currentTarget as HTMLFormElement; const token = String(new FormData(form).get('token')); try { await claimProfile(token); await render(); } catch (error) { showToast(error instanceof Error ? error.message : '連携できませんでした。', 'error'); } });
      }
    }
    document.querySelector('[data-action="logout"]')?.addEventListener('click', () => logout().then(render));
  } catch (error) {
    app.innerHTML = `<main class="login-page"><section class="login-card"><h1>読み込みに失敗しました</h1><p>${escapeHtml(error instanceof Error ? error.message : '不明なエラー')}</p><button class="button" id="retry">再読み込み</button></section></main>`;
    document.querySelector('#retry')?.addEventListener('click', render);
  }
}

supabase.auth.onAuthStateChange(() => { void render(); });
void render();
