import { describe, expect, it } from 'vitest';
import { authErrorNotice } from './auth-url';

describe('authErrorNotice', () => {
  it('recognizes OAuth errors without exposing provider details', () => {
    const result = authErrorNotice('http://127.0.0.1:4173/?error=server_error&error_description=sensitive');
    expect(result).toContain('Googleログイン');
    expect(result).not.toContain('sensitive');
  });

  it('ignores a normal URL', () => {
    expect(authErrorNotice('http://127.0.0.1:4173/')).toBeNull();
  });
});
