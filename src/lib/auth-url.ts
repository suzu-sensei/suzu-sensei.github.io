export function authErrorNotice(href: string): string | null {
  const url = new URL(href);
  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  if (!query.get('error') && !hash.get('error')) return null;
  return 'Googleログインを完了できませんでした。GoogleまたはSupabaseの設定を確認して、もう一度お試しください。';
}

export function authRedirectUrl(href: string, basePath: string): string {
  const current = new URL(href);
  return new URL(basePath, `${current.origin}/`).toString();
}
