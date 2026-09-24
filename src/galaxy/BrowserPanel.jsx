import { useEffect, useState } from 'react';
import { ExternalLink, Globe2, RotateCcw } from 'lucide-react';
import { pollWithBackoff } from '../hooks/pollWithBackoff.js';

export default function BrowserPanel() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    return pollWithBackoff(async (signal) => {
      const response = await fetch('/api/browser/status', { signal });
      if (!response.ok) throw new Error(`Browser status ${response.status}`);
      setStatus(await response.json()); setError('');
    }, { connectedMs: 1800, onError: (cause) => { setStatus(null); setError(cause.message); } });
  }, []);
  const action = async (toolId) => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/tools/execute', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ toolId, input: {} }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || 'Browser action failed');
      setStatus(data.data?.status || data.data);
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  };
  return <div className="browser-workspace">
    <div className="browser-workspace-heading"><Globe2 size={22} /><div><strong>Managed browser</strong><span>Lightpanda primary · Firefox visual fallback</span></div></div>
    <dl><div><dt>State</dt><dd>{status?.state || 'Connecting'}</dd></div><div><dt>Engine</dt><dd>{status?.engine || 'None active'}</dd></div><div><dt>Page</dt><dd className="browser-url">{status?.url || 'No page open'}</dd></div></dl>
    {status?.humanActionRequired && <div className="browser-human"><strong>Human verification required</strong><p>Complete the challenge in Firefox, then resume this same session. JARVIS will not solve the challenge for you.</p>{status.pending?.handoffError && <small>{status.pending.handoffError}</small>}<div><button disabled={busy} onClick={() => action('browser.handoff')}><ExternalLink size={14} /> Open browser</button><button disabled={busy} onClick={() => action('browser.resume')}><RotateCcw size={14} /> Resume when done</button></div></div>}
    {error && <p className="browser-error">{error}</p>}
    <div className="browser-history"><span>RECENT ENGINE EVENTS</span>{status?.history?.length ? status.history.slice().reverse().map((entry, index) => <p key={`${entry.at}-${index}`}><b>{entry.from} → {entry.to}</b><small>{entry.reason}</small></p>) : <p>No browser fallback has been needed.</p>}</div>
  </div>;
}
