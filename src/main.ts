import './styles.css';
import { supabase } from './lib/supabase';
import { claimProfile, isTeacher, loadStudent, loadTeacher, loginWithGoogle, logout } from './lib/api';
import { escapeHtml } from './lib/format';
import { bindStudentActions, renderStudent } from './ui/student';
import { bindTeacherActions, renderTeacher } from './ui/teacher';
import { shell, showToast } from './ui/shared';
import { authErrorNotice } from './lib/auth-url';
import { getStudentLocale, languageSwitch, setStudentLocale, studentCopy, type StudentLocale } from './i18n';

const app = document.querySelector<HTMLDivElement>('#app')!;
let locale: StudentLocale = getStudentLocale();

function bindLanguageSwitch(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-language]').forEach(button => button.addEventListener('click', () => {
    const dirty = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('#booking-form input, #booking-form textarea, #payment-form input[type="file"], #payment-form input[name="amount"]')].some(input => input.type === 'file' ? Boolean((input as HTMLInputElement).files?.length) : Boolean(input.value));
    if (dirty && !window.confirm(studentCopy[locale].languageReset)) return;
    locale = button.dataset.language as StudentLocale;
    setStudentLocale(locale);
    void render();
  }));
}

async function render(): Promise<void> {
  const t = studentCopy[locale];
  setStudentLocale(locale);
  app.innerHTML = `<div class="loading"><span></span><p>${escapeHtml(t.loading)}</p></div>`;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const authNotice = authErrorNotice(window.location.href);
    app.innerHTML = `<main class="login-page"><section class="login-card">${languageSwitch(locale)}<p class="eyebrow">SUZU CLASSROOM</p><h1>${escapeHtml(t.title)}</h1><p>${escapeHtml(t.loginLead)}</p>${authNotice ? `<div class="notice auth-notice" role="alert">${escapeHtml(authNotice)}</div>` : ''}<button class="button google" id="login">${escapeHtml(t.login)}</button><small>${escapeHtml(t.privacy)}</small></section></main><div id="toast" class="toast" role="status" aria-live="polite"></div>`;
    bindLanguageSwitch();
    document.querySelector<HTMLButtonElement>('#login')?.addEventListener('click', async event => {
      const button = event.currentTarget as HTMLButtonElement;
      button.disabled = true; button.textContent = t.loggingIn;
      window.history.replaceState({}, '', window.location.pathname);
      try { await loginWithGoogle(); }
      catch (error) { button.disabled = false; button.textContent = t.login; showToast(error instanceof Error ? error.message : t.login, 'error'); }
    });
    return;
  }
  try {
    const teacher = await isTeacher(session.user.id);
    if (teacher) {
      app.innerHTML = shell(renderTeacher(await loadTeacher()), session.user.email ?? 'Teacher');
      bindTeacherActions(render);
    } else {
      const data = await loadStudent();
      if (data) {
        app.innerHTML = shell(renderStudent(data, locale), session.user.email ?? 'Student', t.logout, languageSwitch(locale));
        bindLanguageSwitch(); bindStudentActions(render, locale);
      } else {
        app.innerHTML = shell(`<section class="claim-card"><p class="eyebrow">WELCOME</p><h1>${escapeHtml(t.claimTitle)}</h1><p>${escapeHtml(t.claimLead)}</p><form id="claim-form"><label>${escapeHtml(t.registrationName)}<input name="fullName" required maxlength="120" autocomplete="name"><small>${escapeHtml(t.registrationHint)}</small></label><label>${escapeHtml(t.claimCode)}<input name="token" required autocomplete="one-time-code"></label><button class="button">${escapeHtml(t.link)}</button></form></section>`, session.user.email ?? 'User', t.logout, languageSwitch(locale));
        bindLanguageSwitch();
        document.querySelector('#claim-form')?.addEventListener('submit', async event => {
          event.preventDefault(); const form = event.currentTarget as HTMLFormElement; const fd = new FormData(form);
          try { await claimProfile(String(fd.get('token')), String(fd.get('fullName'))); await render(); }
          catch (error) { showToast(error instanceof Error ? error.message : t.link, 'error'); }
        });
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
