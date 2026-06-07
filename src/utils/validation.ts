export function isValidUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

export function isYouTubeUrl(str: string): boolean {
  return /youtube\.com|youtu\.be/i.test(str);
}

export function isSoundCloudUrl(str: string): boolean {
  return /soundcloud\.com/i.test(str);
}
