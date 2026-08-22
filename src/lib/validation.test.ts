import { describe, expect, it, vi } from 'vitest';
import { MAX_SLIP_BYTES, toAvailabilityWindow, toIsoInterval, validateSlip } from './validation';

describe('payment slip validation', () => {
  it('accepts supported content', () => expect(() => validateSlip({ size: 100, type: 'image/png' } as File)).not.toThrow());
  it('rejects oversized content', () => expect(() => validateSlip({ size: MAX_SLIP_BYTES + 1, type: 'image/png' } as File)).toThrow(/10MB/));
  it('rejects unsupported MIME', () => expect(() => validateSlip({ size: 100, type: 'text/html' } as File)).toThrow(/JPEG/));
});

describe('booking availability window', () => {
  it('converts a local range in the student timezone', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const result = toAvailabilityWindow('2026-01-02', '19:00', '22:00', 'Asia/Taipei');
    expect(result).toEqual({ starts_at: '2026-01-02T11:00:00.000Z', ends_at: '2026-01-02T14:00:00.000Z' });
    vi.useRealTimers();
  });
  it('rejects times outside 00/30 minute boundaries', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    expect(() => toAvailabilityWindow('2026-01-02', '19:15', '22:00', 'Asia/Taipei')).toThrow(/00分/);
    vi.useRealTimers();
  });
  it('rejects ranges longer than four hours or shorter than fifty minutes', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    expect(() => toAvailabilityWindow('2026-01-02', '19:00', '19:30', 'Asia/Taipei')).toThrow(/50分/);
    expect(() => toAvailabilityWindow('2026-01-02', '18:00', '22:30', 'Asia/Taipei')).toThrow(/4時間/);
    vi.useRealTimers();
  });
});

describe('booking interval', () => {
  it('creates a 50 minute persisted candidate', () => { vi.setSystemTime(new Date('2026-01-01T00:00:00Z')); const result = toIsoInterval('2026-01-02T10:00'); expect(new Date(result.ends_at).getTime() - new Date(result.starts_at).getTime()).toBe(50 * 60_000); vi.useRealTimers(); });
  it('interprets a candidate in the student profile timezone', () => { vi.setSystemTime(new Date('2026-01-01T00:00:00Z')); const result = toIsoInterval('2026-01-02T10:00', 50, 'Asia/Taipei'); expect(result.starts_at).toBe('2026-01-02T02:00:00.000Z'); vi.useRealTimers(); });
  it('rejects past candidates', () => expect(() => toIsoInterval('2020-01-01T10:00')).toThrow(/未来/));
});
