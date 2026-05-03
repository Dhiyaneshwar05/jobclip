export async function hashUrl(url: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(url);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 12);
}

export async function makeApplicationId(urlCanonical: string, capturedAt: Date): Promise<string> {
  const hash = await hashUrl(urlCanonical);
  const yyyymmdd =
    capturedAt.getFullYear().toString() +
    (capturedAt.getMonth() + 1).toString().padStart(2, '0') +
    capturedAt.getDate().toString().padStart(2, '0');
  return `app_${yyyymmdd}_${hash}`;
}
