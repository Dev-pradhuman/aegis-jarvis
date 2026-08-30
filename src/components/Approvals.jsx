import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import '../styles/approvals.css';

const FALLBACK_APPROVALS = [
  { icon: 'shield', risk: 'med', title: 'Access external API', sub: 'Service: OpenAI API' },
  { icon: 'circleCheck', risk: 'high', title: 'Install dependencies', sub: 'Project: agi-sr-core' },
  { icon: 'terminal', risk: 'high', title: 'Execute shell command', sub: 'Command: system update' },
  { icon: 'mail', risk: 'med', title: 'Send email to team', sub: 'From: Jarvis' },
];

export default function Approvals() {
  const [approvals, setApprovals] = useState(FALLBACK_APPROVALS);
  useEffect(() => {
    let mounted = true;
    fetch('/api/approvals').then((response) => response.ok ? response.json() : null).then((data) => {
      if (mounted && data?.approvals) setApprovals(data.approvals);
    }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  async function resolve(id, outcome) {
    try {
      await fetch(`/api/approvals/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ outcome }) });
      setApprovals((items) => items.filter((item) => item.id !== id));
    } catch {}
  }

  return (
    <section className="approvals-panel hud-panel">
      <div className="panel-head">
        <div className="hud-title">Pending Approvals</div>
        <div className="view-all">View All &rsaquo;</div>
      </div>
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
        </div>
      ))}
    </section>
  );
}
