import { describe, expect, it } from 'vitest';
import { friendlyMessage } from './errors';

describe('friendlyMessage', () => {
  it('explains the cancellation deadline', () => {
    expect(friendlyMessage('booking cancellation deadline has passed')).toContain('12時間前');
  });

  it('does not expose raw unknown database errors', () => {
    expect(friendlyMessage('internal database detail: secret')).not.toContain('secret');
  });

  it('explains booking overlap', () => {
    expect(friendlyMessage('violates exclusion constraint bookings_no_active_time_overlap')).toContain('重な');
  });
});
