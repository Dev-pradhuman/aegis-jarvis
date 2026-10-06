const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

export function requestOriginAllowed(req) {
  const headers = req.headers || {};
  let host;
  try { host = new URL(`http://${headers.host || ''}`).hostname.toLowerCase(); }
  catch { return false; }
  if (!localHosts.has(host) && !process.env.JARVIS_REMOTE_BIND) return false;
  
  const origin = headers.origin;
  if (!origin) {
    // If no Origin, but it's a state-changing method from a browser (has Sec-Fetch-Mode or Mozilla UA),
    // we require a valid Referer or we reject it to prevent CSRF.
    const method = req.method || 'GET';
    const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
    const isBrowser = headers['sec-fetch-mode'] || (headers['user-agent'] && headers['user-agent'].startsWith('Mozilla/'));
    if (isStateChanging && isBrowser) {
      const referer = headers.referer;
      if (!referer) return false;
      try {
        const parsedRef = new URL(referer);
        if (!localHosts.has(parsedRef.hostname.toLowerCase())) {
          const allowedOrigins = String(process.env.JARVIS_ALLOWED_ORIGINS || '').split(',').map(i => i.trim()).filter(Boolean);
          if (!allowedOrigins.includes(parsedRef.origin)) return false;
        }
      } catch { return false; }
    }
    return true;
  }
  
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (localHosts.has(parsed.hostname.toLowerCase()) && ['5173', '8787'].includes(parsed.port)) return true;
    return String(process.env.JARVIS_ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()).filter(Boolean).includes(parsed.origin);
  } catch { return false; }
}
