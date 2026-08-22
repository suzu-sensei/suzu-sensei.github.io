import { describe, expect, it } from 'vitest';
import { safeGoogleDriveUrl, safeGoogleMeetUrl } from './classroom-links';

describe('classroom resource URLs', () => {
  it('accepts only the intended HTTPS Google hosts', () => {
    expect(safeGoogleMeetUrl('https://meet.google.com/abc-defg-hij')).toBe('https://meet.google.com/abc-defg-hij');
    expect(safeGoogleDriveUrl('https://drive.google.com/drive/folders/example')).toBe('https://drive.google.com/drive/folders/example');
    expect(safeGoogleMeetUrl('javascript:alert(1)')).toBeNull();
    expect(safeGoogleMeetUrl('https://meet.google.com.example.invalid/room')).toBeNull();
    expect(safeGoogleDriveUrl('http://drive.google.com/drive/folders/example')).toBeNull();
  });
});
