// Phase 5: Client-side cryptographic integrity verification using Web Crypto API

export async function computeSubmissionHmac(
  sessionKey: string,
  answers: Record<string, any>
): Promise<string> {
  if (!sessionKey || typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    return '';
  }

  try {
    const enc = new TextEncoder();
    // Deterministic canonical JSON (sorted keys)
    const sortedKeys = Object.keys(answers).sort();
    const canonicalObj: Record<string, any> = {};
    for (const key of sortedKeys) {
      canonicalObj[key] = answers[key];
    }
    const dataString = JSON.stringify(canonicalObj);

    const keyBuffer = enc.encode(sessionKey);
    const cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, enc.encode(dataString));
    const hashBytes = Array.from(new Uint8Array(signature));
    return hashBytes.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (err) {
    console.warn('[Crypto] Failed to compute HMAC signature', err);
    return '';
  }
}
