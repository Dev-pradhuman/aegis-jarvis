import { useEffect, useState } from 'react';

export default function ApprovalPolicyPanel() {
  const [policy, setPolicy] = useState(null);
  const [tools, setTools] = useState([]);
  const [rule, setRule] = useState({ toolId: 'command.execute', effect: 'always_ask', appId: '' });
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([fetch('/api/approval-policy').then((response) => response.ok ? response.json() : null), fetch('/api/tools').then((response) => response.ok ? response.json() : null)])
      .then(([current, catalog]) => { if (active) { setPolicy(current); setTools(catalog?.tools || []); } })
      .catch(() => { if (active) setMessage('Approval policy is unavailable.'); });
    return () => { active = false; };
  }, []);

  async function change(mode, rules = policy?.rules || []) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/approval-policy', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode, rules }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Policy update failed');
      setPolicy(result);
      setMessage(`${mode} mode active.`);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  async function enableFull() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/approval-policy/activate-full', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: confirmation, acceptRisk: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Full mode activation failed');
      setPolicy(result); setConfirmation(''); setMessage('Full mode active. JARVIS approval dialogs are bypassed; OS and account permissions still apply.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  if (!policy) return <section className="workspace-panel policy-panel"><div className="panel-label">Authorization policy</div><p>{message || 'Loading policy…'}</p></section>;
  return <section className="workspace-panel policy-panel">
    <div className="panel-label">Authorization policy</div>
    <div className="policy-score">{policy.mode} <span>MODE</span></div>
    <p>{policy.warning}</p>
    <div className="model-actions"><button className="secondary-action" disabled={busy || policy.mode === 'SAFE'} onClick={() => change('SAFE')}>Safe / Light</button><button className="secondary-action" disabled={busy || policy.mode === 'CUSTOM'} onClick={() => change('CUSTOM')}>Custom</button></div>
    {policy.mode === 'FULL' && <p role="alert">Full mode is active. Every internal approval decision is logged. Choose Safe to turn it off.</p>}
    {policy.mode === 'CUSTOM' && <div>
      <p>Rules match the exact tool and optional application ID. First matching rule wins.</p>
      {(policy.rules || []).map((item) => <div className="setting-row" key={item.id}><span>{item.toolId} · {item.effect}{item.appId ? ` · ${item.appId}` : ''}</span><button disabled={busy} onClick={() => change('CUSTOM', policy.rules.filter((entry) => entry.id !== item.id))}>Remove</button></div>)}
      <label>Tool<select value={rule.toolId} onChange={(event) => setRule({ ...rule, toolId: event.target.value })}>{tools.map((tool) => <option key={tool.id} value={tool.id}>{tool.name}</option>)}</select></label>
      <label>Decision<select value={rule.effect} onChange={(event) => setRule({ ...rule, effect: event.target.value })}><option value="always_ask">Always ask</option><option value="always_allow">Always allow</option><option value="allow_once">Allow once</option><option value="deny">Deny</option></select></label>
      <label>Application ID (optional)<input value={rule.appId} onChange={(event) => setRule({ ...rule, appId: event.target.value })} placeholder="Exact app ID" /></label>
      <button className="secondary-action" disabled={busy} onClick={() => change('CUSTOM', [...policy.rules, rule])}>Add rule</button>
    </div>}
    <details><summary>Enable Full mode</summary><p role="alert">Full mode removes JARVIS approval prompts for consequential actions. Exact target checks, idempotency, OS consent, logins, CAPTCHA and zero-spend policy remain enforced. Set an authentication token before enabling it.</p><label>Type ENABLE FULL MODE<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label><button className="secondary-action" disabled={busy || confirmation !== 'ENABLE FULL MODE'} onClick={enableFull}>Enable Full mode</button></details>
    {message && <p role="status">{message}</p>}
  </section>;
}
