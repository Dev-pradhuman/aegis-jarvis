const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

export function requestOriginAllowed(headers = {}) {
  let host;
  try { host = new URL(`http://${headers.host || ''}`).hostname.toLowerCase(); }
  catch { return false; }
  if (!localHosts.has(host) && !process.env.JARVIS_REMOTE_BIND) return false;
  const origin = headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (localHosts.has(parsed.hostname.toLowerCase()) && ['5173', '8787'].includes(parsed.port)) return true;
    return String(process.env.JARVIS_ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean).includes(parsed.origin);
  } catch { return false; }
}
