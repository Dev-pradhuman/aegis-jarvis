import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import '../styles/approvals.css';

export default function Approvals() {
  const [approvals, setApprovals] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { let mounted=true;let timer;const refresh=()=>fetch('/api/approvals').then(response=>response.ok?response.json():Promise.reject()).then(data=>{if(mounted){setApprovals(data.approvals||[]);setError('');}}).catch(()=>{if(mounted)setError('Approval state is unavailable.');});void refresh();timer=setInterval(refresh,2000);return()=>{mounted=false;clearInterval(timer);};}, []);

  async function resolve(id, outcome) {
    try {
      const response=await fetch(`/api/approvals/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ outcome }) });
      const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Approval could not be resolved.');
      setApprovals((items) => items.filter((item) => item.id !== id));setError(data.synthesis?.reply||data.reply||'Action resolved.');
    } catch(error) {setError(error.message);}
  }

  return (
    <section className="approvals-panel hud-panel">
      <div className="panel-head">
        <div className="hud-title">Pending Approvals</div>
        <div className="view-all">View All &rsaquo;</div>
      </div>
      {!approvals.length && <div className="empty-state">{error || 'No approvals are waiting.'}</div>}
      {approvals.map((a, i) => (
        <div className="appr-item" key={a.id || i}>
          <div className={`appr-icon ${a.risk}`}>
            <Icon name={a.icon} />
          </div>
          <div className="appr-meta">
            <div className="appr-title">{a.title}</div>
            <div className="appr-sub">{a.toolName} · expires {new Date(a.expiresAt).toLocaleTimeString()}</div>
          </div>
          <div className={`risk-tag ${a.risk}`}>{a.risk === 'high' ? 'HIGH RISK' : 'MEDIUM RISK'}</div>
          <button className="review-btn" onClick={() => resolve(a.id, 'approved')}>APPROVE</button>
          <button className="review-btn" onClick={() => resolve(a.id, 'rejected')}>REJECT</button>
        </div>
      ))}
    </section>
  );
}
