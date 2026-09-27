import { useEffect, useState } from 'react';
import { pollWithBackoff } from '../hooks/pollWithBackoff.js';

export default function RemindersPanel() {
  const [reminders, setReminders] = useState([]);
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState([]);
  const [busy, setBusy] = useState(false);
  const refresh = async (signal) => {
    const response = await fetch('/api/reminders', { signal });
    if (!response.ok) throw new Error(`Reminders unavailable (${response.status})`);
    setReminders((await response.json()).reminders || []); setError('');
  };
  useEffect(() => pollWithBackoff(refresh, { connectedMs: 5000, onError: (cause) => setError(cause.message) }), []);

  async function act(toolId, input) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/tools/execute', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ toolId, input, idempotencyKey: crypto.randomUUID() }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || result.code || 'Reminder action failed');
      await refresh();
      if (toolId === 'reminders.create') { setTitle(''); setDueAt(''); }
    } catch (cause) { setError(cause.message); }
    finally { setBusy(false); }
  }

  const active = reminders.filter((item) => ['scheduled', 'due'].includes(item.status));
  const visible = active.filter((item) => !dismissed.includes(item.id));
  return <section className="reminders-panel" aria-label="Local reminders">
    <h2>Local reminders</h2>
    <p>Saved on this JARVIS host. Due reminders appear here and request a desktop notification.</p>
    <form onSubmit={(event) => { event.preventDefault(); if (title.trim() && dueAt) void act('reminders.create', { title: title.trim(), dueAt: new Date(dueAt).toISOString() }); }}>
      <label>Reminder<input value={title} maxLength={300} onChange={(event) => setTitle(event.target.value)} placeholder="What should JARVIS remind you about?" required /></label>
      <label>When<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} required /></label>
      <button type="submit" disabled={busy}>Create reminder</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {active.length === 0 && <p>No active reminders.</p>}
    {dismissed.length > 0 && <button onClick={() => setDismissed([])}>Show dismissed in this window</button>}
    {visible.map((item) => <article className={`reminder-entry ${item.status}`} key={item.id}>
      <strong>{item.title}</strong><span>{item.status === 'due' ? 'Due now' : new Date(item.dueAt).toLocaleString()}</span>
      <div className="reminder-actions">
        <button disabled={busy} onClick={() => void act('reminders.complete', { id: item.id })}>Done</button>
        <button disabled={busy} onClick={() => void act('reminders.snooze', { id: item.id, dueAt: new Date(Date.now() + 10 * 60_000).toISOString() })}>Snooze 10m</button>
        {item.status === 'due' && <button onClick={() => setDismissed((items) => [...items, item.id])}>Dismiss here</button>}
        <button disabled={busy} onClick={() => void act('reminders.cancel', { id: item.id })}>Cancel</button>
      </div>
    </article>)}
  </section>;
}
