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
  const handleChatClick = () => {
    if (activeView !== 'overview') {
      onNavigate?.('overview');
    }
    window.dispatchEvent(new CustomEvent('jarvis:toggle-chat'));
  };

  return (
    <nav className="sidebar hud-panel" aria-label="Primary navigation">
      {/* Glowing Relativistic Ring Logo */}
      <button
        className="brand-rail-logo"
        onClick={() => onNavigate?.('overview')}
        aria-label="JARVIS Home"
        title="JARVIS Personal Execution Layer"
      >
        <div className="glowing-ring-emblem">
          <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="10" stroke="#38bdf8" strokeWidth="1.5" strokeOpacity="0.4" />
            <circle cx="14" cy="14" r="6" stroke="#f59e0b" strokeWidth="1.5" />
            <circle cx="14" cy="14" r="3" fill="#ffffff" />
          </svg>
        </div>
      </button>

      {/* 40x40px Icon Navigation Rail */}
      <div className="navlist">
        {/* Home */}
        <button
          type="button"
          className={`rail-icon-btn${activeView === 'overview' ? ' active' : ''}`}
          onClick={() => onNavigate?.('overview')}
          title="Home"
          aria-label="Home"
          aria-current={activeView === 'overview' ? 'page' : undefined}
        >
          <Icon name="overview" />
          <span className="rail-tooltip">Home</span>
        </button>

        {/* Chat Drawer Toggle */}
        <button
          type="button"
          className={`rail-icon-btn${activeView === 'chat' ? ' active' : ''}`}
          onClick={handleChatClick}
          title="Chat Drawer"
          aria-label="Chat Drawer"
        >
          <Icon name="chat" />
          <span className="rail-tooltip">Chat</span>
        </button>

        {/* Tasks */}
        <button
          type="button"
          className={`rail-icon-btn${activeView === 'tasks' ? ' active' : ''}`}
          onClick={() => onNavigate?.('tasks')}
          title="Tasks"
          aria-label="Tasks"
          aria-current={activeView === 'tasks' ? 'page' : undefined}
        >
          <Icon name="tasks" />
          <span className="rail-tooltip">Tasks</span>
        </button>

        {/* Memory */}
        <button
          type="button"
          className={`rail-icon-btn${activeView === 'memory' ? ' active' : ''}`}
          onClick={() => onNavigate?.('memory')}
          title="Memory"
          aria-label="Memory"
          aria-current={activeView === 'memory' ? 'page' : undefined}
        >
          <Icon name="database" />
          <span className="rail-tooltip">Memory</span>
        </button>

        {/* Activity */}
        <button
          type="button"
          className={`rail-icon-btn${activeView === 'activity' ? ' active' : ''}`}
          onClick={() => onNavigate?.('activity')}
          title="Activity"
          aria-label="Activity"
          aria-current={activeView === 'activity' ? 'page' : undefined}
        >
          <Icon name="activity" />
          <span className="rail-tooltip">Activity</span>
        </button>

        {/* Settings */}
        <button
          type="button"
          className={`rail-icon-btn${activeView === 'settings' ? ' active' : ''}`}
          onClick={() => onNavigate?.('settings')}
          title="Settings"
          aria-label="Settings"
          aria-current={activeView === 'settings' ? 'page' : undefined}
        >
          <Icon name="settings" />
          <span className="rail-tooltip">Settings</span>
        </button>
      </div>

      {/* Online Status Dot */}
      <div className="sidebar-foot" title="Local Core Online">
        <span className="status-dot-green" />
        <span className="online-label">ONLINE</span>
      </div>
    </nav>
  );
}
