import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import '../styles/tasks.css';

const FALLBACK_TASKS = [
  { icon: 'cyan', svg: 'search', title: 'Research quantum computing', sub: 'Deep research • Web sources • Papers', pct: 42 },
  { icon: 'orange', svg: 'chat', title: 'Message Arjun', sub: 'Follow up on project update', pct: null },
  { icon: 'green', svg: 'brain', title: 'Review system architecture', sub: 'Check modules and dependencies', pct: 65 },
  { icon: 'orange', svg: 'calendar', title: 'Prepare meeting agenda', sub: "For tomorrow's standup", pct: null },
  { icon: 'red', svg: 'chat', title: 'Optimize JARVIS memory usage', sub: 'Analysis and cleanup', pct: 28 },
  { icon: 'red', svg: 'notes', title: 'Update documentation', sub: 'System changes and progress', pct: null },
];

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    fetch('/api/tasks').then((response) => response.ok ? response.json() : null).then((data) => {
      if (mounted && data?.tasks) setTasks(data.tasks);
    }).catch(() => { if (mounted) setError('Task state is unavailable.'); });
    return () => { mounted = false; };
  }, []);

  return (
    <section className="tasks-panel hud-panel">
      <div className="panel-head">
        <div className="hud-title">Tasks</div>
        <div className="view-all">View All &rsaquo;</div>
      </div>
      <div className="task-list">
        {!tasks.length && <div className="empty-state">{error || 'No durable tasks.'}</div>}
        {tasks.map((t, i) => (
          <div className="task-item" key={t.id || i}>
            <div className={`task-icon ${t.icon}`}>
              <Icon name={t.svg} />
            </div>
            <div className="task-meta">
              <div className="task-title">{t.title}</div>
              <div className="task-sub">{t.sub}</div>
            </div>
            {t.pct !== null ? (
              <div className="task-right pct cyan">{t.pct}%</div>
            ) : (
              <div className="task-right pending">Pending</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
