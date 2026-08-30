import Icon from './Icon.jsx';
import '../styles/quick-actions.css';

const QUICK_ACTIONS = [
  { t: 'New Task', s: 'Create task', icon: 'newTask' },
  { t: 'Web Search', s: 'Search the web', icon: 'search' },
  { t: 'Code Runner', s: 'Run code', icon: 'code' },
  { t: 'Terminal', s: 'Open terminal', icon: 'terminal' },
  { t: 'File Browser', s: 'Browse files', icon: 'files' },
  { t: 'Notes', s: 'Quick note', icon: 'notes' },
  { t: 'System Scan', s: 'Run diagnostics', icon: 'scan' },
  { t: 'Voice Input', s: 'Talk to Jarvis', icon: 'voice' },
  { t: 'Take Screenshot', s: 'Capture screen', icon: 'screenshot' },
];

export default function QuickActions() {
  return (
    <section className="qa-panel hud-panel">
      <div className="hud-title">Quick Actions</div>
      <div className="qa-grid">
        {QUICK_ACTIONS.map((a) => (
          <button className="qa-btn hud-button" key={a.t}>
            <Icon name={a.icon} />
            <div className="t">{a.t}</div>
            <div className="s">{a.s}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
