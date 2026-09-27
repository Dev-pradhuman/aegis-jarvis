import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import '../styles/approvals.css';

export default function Approvals() {
  const [approvals, setApprovals] = useState([]);
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let mounted = true;
    fetch('/api/approvals').then((response) => { if (!response.ok) throw new Error(); return response.json(); }).then((data) => {
      if (mounted) { setApprovals(data.approvals || []); setStatus('ready'); }
    }).catch(() => { if (mounted) setStatus('error'); });
    return () => { mounted = false; };
  }, []);

  async function resolve(id, outcome) {
    try {
      const response = await fetch(`/api/approvals/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ outcome }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.result?.error || 'Approval could not be completed');
      setApprovals((items) => items.filter((item) => item.id !== id));
      setMessage(data.run ? `Workflow ${data.run.state}.` : data.result ? data.result.ok ? 'Approved action completed.' : 'Approved action failed.' : 'Approval resolved.');
    } catch (error) { setMessage(error.message); }
  }

  return (
    <section className="approvals-panel hud-panel">
      <div className="panel-head">
        <div className="hud-title">Pending Approvals</div>
      </div>
      {status === 'loading' && <p role="status">Loading approvals…</p>}
      {status === 'error' && <p role="alert">Approvals are unavailable.</p>}
      {status === 'ready' && approvals.length === 0 && <p>No approvals pending.</p>}
      {message && <p role="status">{message}</p>}
      {approvals.map((a, i) => (
        <div className="appr-item" key={a.id || i}>
          <div className={`appr-icon ${a.risk}`}>
            <Icon name={a.icon} />
          </div>
          <div className="appr-meta">
            <div className="appr-title">{a.title}</div>
            <div className="appr-sub">{a.sub}</div>
          </div>
          <div className={`risk-tag ${a.risk}`}>{a.risk === 'high' ? 'HIGH RISK' : 'MEDIUM RISK'}</div>
          <button className="review-btn" onClick={() => resolve(a.id, 'approved')}>APPROVE</button>
          <button className="review-btn" onClick={() => resolve(a.id, 'rejected')}>DENY</button>
        </div>
      ))}
    </section>
  );
}
