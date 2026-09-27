import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import '../styles/tasks.css';

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let mounted = true;
    fetch('/api/tasks').then((response) => { if (!response.ok) throw new Error(); return response.json(); }).then((data) => {
      if (mounted) { setTasks(data.tasks || []); setStatus('ready'); }
    }).catch(() => { if (mounted) setStatus('error'); });
    return () => { mounted = false; };
  }, []);

  return (
    <section className="tasks-panel hud-panel">
      <div className="panel-head">
        <div className="hud-title">Tasks</div>
        <div className="view-all">View All &rsaquo;</div>
      </div>
      <div className="task-list">
        {status === 'loading' && <p role="status">Loading tasks…</p>}
        {status === 'error' && <p role="alert">Tasks are unavailable.</p>}
        {status === 'ready' && tasks.length === 0 && <p>No tasks yet.</p>}
        {tasks.map((t, i) => (
          <div className="task-item" key={t.id || i}>
            <div className="task-icon cyan">
              <Icon name="notes" />
            </div>
            <div className="task-meta">
              <div className="task-title">{t.title}</div>
              <div className="task-sub">{t.status || 'pending'}</div>
            </div>
            <div className="task-right pending">{t.status || 'pending'}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
