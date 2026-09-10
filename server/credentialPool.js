export function credentialEnabled(credentialRef) { return !String(process.env.JARVIS_DISABLED_CREDENTIALS || '').split(',').map((value) => value.trim()).filter(Boolean).includes(credentialRef); }

export function credentialEntries(baseName, max = 4) {
  const refs = [baseName, ...Array.from({ length: max }, (_, index) => `${baseName}_${index + 1}`)];
  const seen = new Set();
  return refs.flatMap((credentialRef) => {
    const key = process.env[credentialRef];
    if (!key || !credentialEnabled(credentialRef) || seen.has(key)) return [];
    seen.add(key);
    return [{ credentialRef, key }];
  });
}

export async function fetchWithCredentialRotation(baseName, request, max = 4) {
  const credentials = credentialEntries(baseName, max);
  if (!credentials.length) throw new Error(`${baseName} is required`);
  let last;
  for (const credential of credentials) {
    const response = await request(credential.key, credential.credentialRef);
    last = { response, credentialRef: credential.credentialRef, key: credential.key };
    if (response.ok) return last;
    if (![401, 403, 404, 408, 429, 500, 502, 503, 504].includes(response.status)) return last;
  }
  return last;
}
