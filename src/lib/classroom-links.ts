const trustedGoogleUrl = (value: string | null, hostname: string): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === hostname ? url.href : null;
  } catch {
    return null;
  }
};

export const safeGoogleMeetUrl = (value: string | null): string | null => trustedGoogleUrl(value, 'meet.google.com');
export const safeGoogleDriveUrl = (value: string | null): string | null => trustedGoogleUrl(value, 'drive.google.com');
