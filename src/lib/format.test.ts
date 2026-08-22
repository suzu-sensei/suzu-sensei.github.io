import { describe, expect, it } from 'vitest';
import { escapeHtml, statusLabel } from './format';

describe('safe rendering', () => {
  it('escapes database text before HTML rendering', () => expect(escapeHtml('<img src=x onerror=alert(1)>')).not.toContain('<img'));
  it('maps workflow states', () => expect(statusLabel('reserved')).toBe('予約済み'));
});
