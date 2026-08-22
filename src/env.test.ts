import { describe, expect, it } from 'vitest';
import { readEnvironment } from './env';

describe('environment boundary', () => {
  it('defaults to the approved development project', () => expect(readEnvironment({ VITE_SUPABASE_URL: 'https://cjypnhxouqxvwwctzojs.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key' }).deployEnvironment).toBe('development'));
  it('rejects production unless the production build target is explicit', () => expect(() => readEnvironment({ VITE_SUPABASE_URL: 'https://ploropobmgwlpphtkndo.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key' })).toThrow(/development/));
  it('accepts the production ref only for an explicit production target', () => expect(readEnvironment({ VITE_DEPLOY_ENV: 'production', VITE_SUPABASE_URL: 'https://ploropobmgwlpphtkndo.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key' }).deployEnvironment).toBe('production'));
  it('rejects development when the production build target is explicit', () => expect(() => readEnvironment({ VITE_DEPLOY_ENV: 'production', VITE_SUPABASE_URL: 'https://cjypnhxouqxvwwctzojs.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key' })).toThrow(/production/));
  it('rejects an unknown project', () => expect(() => readEnvironment({ VITE_SUPABASE_URL: 'https://unknown.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key' })).toThrow(/development/));
  it('rejects an unknown deployment target', () => expect(() => readEnvironment({ VITE_DEPLOY_ENV: 'preview', VITE_SUPABASE_URL: 'https://cjypnhxouqxvwwctzojs.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key' })).toThrow(/VITE_DEPLOY_ENV/));
});
