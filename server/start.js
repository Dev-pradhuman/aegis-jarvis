const port = Number(process.env.JARVIS_PORT || 8787);

async function healthyServer() {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 800);
  try { const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: controller.signal }); const data = await response.json().catch(() => ({})); return response.ok && data.service === 'jarvis'; }
  catch { return false; }
  finally { clearTimeout(timer); }
}

if (await healthyServer()) console.log(`JARVIS is already running on http://127.0.0.1:${port}; using the existing backend.`);
else await import('./index.js');
