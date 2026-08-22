import { describe, expect, it } from 'vitest';
import { authErrorNotice, authRedirectUrl } from './auth-url';

describe('authErrorNotice', () => {
  it('recognizes OAuth errors without exposing provider details', () => {
    const result = authErrorNotice('http://127.0.0.1:4173/?error=server_error&error_description=sensitive');
    expect(result).toContain('Googleログイン');
    expect(result).not.toContain('sensitive');
  });

  it('ignores a normal URL', () => {
    expect(authErrorNotice('http://127.0.0.1:4173/')).toBeNull();
  });

  it('keeps local development at the root', () => {
    expect(authRedirectUrl('http://127.0.0.1:4173/?error=old#fragment', '/')).toBe('http://127.0.0.1:4173/');
  });

  it('returns OAuth to the production classroom path', () => {
    expect(authRedirectUrl('https://suzu-sensei.github.io/classroom/?error=old#fragment', '/classroom/')).toBe(
      'https://suzu-sensei.github.io/classroom/',
    );
  });
});
