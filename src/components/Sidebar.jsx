import Icon from './Icon.jsx';
import '../styles/sidebar.css';

export const NAV_ITEMS = [
  { id: 'overview', label: 'Home', icon: 'overview' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks' },
  { id: 'memory', label: 'Memory', icon: 'database' },
  { id: 'activity', label: 'Activity', icon: 'activity' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export default function Sidebar({ activeView, onNavigate }) {
  return (
    <nav className="sidebar hud-panel" aria-label="Primary navigation">
      <button className="brand" onClick={() => onNavigate('overview')} aria-label="Open overview">
        <div className="brand-emblem">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" strokeWidth="1.5">
            <circle cx="12" cy="12" r="3" />
            <circle cx="12" cy="12" r="8" strokeDasharray="3 3" />
          </svg>
        </div>
        <div className="brand-text">
          <div className="name">JARVIS</div>
          <div className="sub">AUTONOMOUS REACTIVE<br />VIRTUAL INTELLIGENCE SYSTEM</div>
        </div>
      </button>

      <div className="navlist">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`navitem${item.id === activeView ? ' active' : ''}`}
            onClick={() => onNavigate(item.id)}
            aria-current={item.id === activeView ? 'page' : undefined}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      <div className="sidebar-foot mono"><span className="dot green" /> LOCAL CORE ONLINE</div>
    </nav>
  );
}
