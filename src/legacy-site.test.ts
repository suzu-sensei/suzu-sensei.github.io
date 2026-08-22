import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readProjectFile = (path: string): string =>
  readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('restored public site', () => {
  it('lists every published column in the slider', () => {
    const html = readProjectFile('legacy-site/index.html');
    const links = [...html.matchAll(/class="column-card" href="(columns\/[^"]+\.html)"/g)].map(match => match[1]);

    expect(links).toEqual([
      'columns/zehi.html',
      'columns/ateji.html',
      'columns/hiki-tou.html',
      'columns/au-niau.html',
      'columns/muke-muki.html',
      'columns/mitai-rashii-ppoi.html',
    ]);
  });

  it('sends public classroom links to the canonical portal', () => {
    const home = readProjectFile('legacy-site/index.html');
    const siteHome = readProjectFile('legacy-site/site/index.html');

    expect(home).toContain('href="/classroom/"');
    expect(siteHome).toContain('href="/classroom/"');
  });

  it('keeps permanent Japanese, Traditional Chinese, and English HOME support', () => {
    const home = readProjectFile('legacy-site/index.html');
    for (const locale of ['ja', 'zh', 'en']) {
      expect(home).toContain(`data-lang="${locale}"`);
      expect(home).toContain(`'lang-${locale}'`);
    }
    expect(home).toContain('function setLang(lang)');
  });

  it('redirects both legacy role URLs to the shared role-aware portal', () => {
    for (const role of ['student', 'teacher']) {
      const html = readProjectFile(`legacy-site/site/classroom/${role}.html`);
      expect(html).toContain("location.replace('/classroom/')");
    }
  });
});
