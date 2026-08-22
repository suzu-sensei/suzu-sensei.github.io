import { escapeHtml } from '../lib/format';

export const shell = (content: string, userLabel: string, logoutLabel = 'ログアウト', controls = '') => `
  <header class="topbar"><a class="brand" href="#">すず先生の教室 <span>Suzu Classroom</span></a>
    <div class="session">${controls}<span>${escapeHtml(userLabel)}</span><button class="button ghost" data-action="logout">${escapeHtml(logoutLabel)}</button></div>
  </header><main class="page">${content}</main><div id="toast" class="toast" role="status" aria-live="polite"></div>`;

export const card = (title: string, body: string, className = '') => `<section class="card ${className}"><h2>${title}</h2>${body}</section>`;
export const empty = (label = '記録はありません') => `<p class="empty">${label}</p>`;
export const badge = (status: string, label: string) => `<span class="badge ${escapeHtml(status)}">${escapeHtml(label)}</span>`;

export function showToast(message: string, tone: 'ok' | 'error' = 'ok'): void {
  const toast = document.querySelector<HTMLDivElement>('#toast');
  if (!toast) return;
  toast.textContent = message; toast.className = `toast visible ${tone}`;
  window.setTimeout(() => { toast.className = 'toast'; }, 3600);
}

export function setBusy(button: HTMLButtonElement, busy: boolean): void {
  button.disabled = busy; button.dataset.original ??= button.textContent ?? '';
  button.textContent = busy ? '処理中…' : button.dataset.original;
}
