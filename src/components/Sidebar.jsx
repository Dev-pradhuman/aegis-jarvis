import { Home, MessageSquare, Layers, Zap, Database, LayoutGrid } from 'lucide-react';
import '../styles/sidebar.css';

export const NAV_ITEMS = [
  { id: 'overview', label: 'Home', icon: Home },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'tasks', label: 'Tasks', icon: Layers },
  { id: 'activity', label: 'Activity', icon: Zap },
  { id: 'memory', label: 'Memory', icon: Database },
  { id: 'settings', label: 'Settings', icon: LayoutGrid },
];

export default function Sidebar({ activeView = 'home', onNavigate, onToggleChat }) {
  const handleChatClick = () => {
    if (onToggleChat) {
      onToggleChat();
    } else {
      window.dispatchEvent(new CustomEvent('jarvis:toggle-chat'));
    }
  };

  const handleNav = (id) => {
    if (id === 'chat') {
      handleChatClick();
      return;
    }
    const resolved = id === 'home' ? 'overview' : id;
    if (onNavigate) {
      onNavigate(resolved);
    } else {
      window.dispatchEvent(new CustomEvent('jarvis:navigate', { detail: { id: resolved } }));
    }
  };

  const isHomeActive = activeView === 'home' || activeView === 'overview';

  return (
    <nav className="sidebar galaxy-sidebar" aria-label="Primary navigation rail">
      {/* Top: Glowing Circular Ring Logo (26px diameter outline circle) */}
      <div className="sidebar-head galaxy-sidebar-head">
        <button
          type="button"
          className="brand-rail-logo rail-brand"
          onClick={() => handleNav('home')}
          aria-label="JARVIS Home"
          title="JARVIS Personal Execution Layer"
        >
          <div className="glowing-ring-emblem">
            <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="11" stroke="#38bdf8" strokeWidth="1.5" strokeOpacity="0.4" />
              <circle cx="14" cy="14" r="6.5" stroke="#f59e0b" strokeWidth="1.5" />
              <circle cx="14" cy="14" r="2.5" fill="#ffffff" />
            </svg>
          </div>
        </button>
      </div>

      {/* Middle 6 Vertical Outline Icons (40x40px buttons, gap: 14px) */}
      <div className="navlist galaxy-sidebar-items">
        {/* 1. Home (House outline — active rounded dark-grey pill background rgba(255,255,255,0.12) when on Home) */}
        <button
          type="button"
          className={`rail-icon-btn ${isHomeActive && activeView !== 'chat' ? 'active is-home' : ''}`}
          onClick={() => handleNav('home')}
          title="Home"
          aria-label="Home"
          aria-current={isHomeActive && activeView !== 'chat' ? 'page' : undefined}
        >
          <Home size={19} strokeWidth={1.75} />
          <span className="rail-tooltip">Home</span>
        </button>

        {/* 2. Chat (Speech bubble outline — toggles Left Slide-Over Chat Drawer) */}
        <button
          type="button"
          className={`rail-icon-btn ${activeView === 'chat' ? 'active is-home' : ''}`}
          onClick={handleChatClick}
          title="Chat Drawer"
          aria-label="Chat Drawer"
          aria-current={activeView === 'chat' ? 'page' : undefined}
        >
          <MessageSquare size={19} strokeWidth={1.75} />
          <span className="rail-tooltip">Chat</span>
        </button>

        {/* 3. Tasks (Stacked layers outline) */}
        <button
          type="button"
          className={`rail-icon-btn ${activeView === 'tasks' ? 'active is-home' : ''}`}
          onClick={() => handleNav('tasks')}
          title="Tasks"
          aria-label="Tasks"
          aria-current={activeView === 'tasks' ? 'page' : undefined}
        >
          <Layers size={19} strokeWidth={1.75} />
          <span className="rail-tooltip">Tasks</span>
        </button>

        {/* 4. Activity (Lightning bolt outline) */}
        <button
          type="button"
          className={`rail-icon-btn ${activeView === 'activity' ? 'active is-home' : ''}`}
          onClick={() => handleNav('activity')}
          title="Activity"
          aria-label="Activity"
          aria-current={activeView === 'activity' ? 'page' : undefined}
        >
          <Zap size={19} strokeWidth={1.75} />
          <span className="rail-tooltip">Activity</span>
        </button>

        {/* 5. Memory (Database cylinder outline) */}
        <button
          type="button"
          className={`rail-icon-btn ${activeView === 'memory' ? 'active is-home' : ''}`}
          onClick={() => handleNav('memory')}
          title="Memory"
          aria-label="Memory"
          aria-current={activeView === 'memory' ? 'page' : undefined}
        >
          <Database size={19} strokeWidth={1.75} />
          <span className="rail-tooltip">Memory</span>
        </button>

        {/* 6. Apps / Grid (2x2 rounded square grid outline) */}
        <button
          type="button"
          className={`rail-icon-btn ${activeView === 'settings' || activeView === 'apps' ? 'active is-home' : ''}`}
          onClick={() => handleNav('settings')}
          title="Apps & Settings"
          aria-label="Apps & Settings"
          aria-current={activeView === 'settings' || activeView === 'apps' ? 'page' : undefined}
        >
          <LayoutGrid size={19} strokeWidth={1.75} />
          <span className="rail-tooltip">Apps</span>
        </button>
      </div>

      {/* Bottom: Subtle horizontal divider line + glowing green online status dot (8px #22c55e) */}
      <div className="sidebar-foot galaxy-sidebar-foot" title="Local Core Online">
        <span className="status-dot-green rail-state-dot" />
        <span className="online-label rail-online-text">ONLINE</span>
      </div>
    </nav>
  );
}
