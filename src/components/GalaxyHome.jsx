import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  BrainCircuit,
  ChevronRight,
  Database,
  Expand,
  Home,
  ListTodo,
  MessageSquare,
  Moon,
  RotateCcw,
  Settings2,
  Shrink,
  Sun,
  X,
} from 'lucide-react';
import useTelemetry from '../hooks/useTelemetry.js';
import { pollWithBackoff } from '../hooks/pollWithBackoff.js';
import useVisualState from '../galaxy/useVisualState.js';
import useWindowManager from '../galaxy/WindowManager.jsx';
import Chat from './Chat.jsx';
import {
  TasksWorkspace,
  MemoryWorkspace,
  ActivityWorkspace,
  SettingsWorkspaceCombined,
} from './WorkspaceViews.jsx';
import '../styles/galaxy-home.css';
import '../styles/galaxy-immersive.css';

const NAV = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'memory', label: 'Memory', icon: Database },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];

function getDynamicGreeting() {
  const hr = new Date().getHours();
  if (hr < 12) return 'Good Morning,';
  if (hr < 18) return 'Good Afternoon,';
  return 'Good Evening,';
}

function Scene({ phase, sceneRef, drawerOpen }) {
  const host = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    let controller;
    const sceneUrl = '/galaxy/scene.js';
    const loadScene = new Function('url', 'return import(url)');
    loadScene(sceneUrl)
      .then(({ mountGalaxyScene }) => {
        if (disposed) return;
        try {
          controller = mountGalaxyScene(host.current, {
            reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
            quality:
              import.meta.env.DEV && new URLSearchParams(window.location.search).get('galaxyQuality') === 'low'
                ? 'low'
                : 'auto',
          });
          sceneRef.current = controller;
          if (import.meta.env.DEV) window.__jarvisGalaxyScene = controller;
          controller.setVisualState(phase);
          controller.setDrawerOpen(drawerOpen);
          controller.setImmersive(Boolean(document.fullscreenElement));
        } catch (cause) {
          setError(cause.message);
        }
      })
      .catch((cause) => setError(cause.message));

    return () => {
      disposed = true;
      controller?.dispose();
      sceneRef.current = null;
      if (import.meta.env.DEV) delete window.__jarvisGalaxyScene;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setVisualState(phase);
  }, [phase]);

  useEffect(() => {
    sceneRef.current?.setDrawerOpen(drawerOpen);
  }, [drawerOpen]);

  return (
    <div className="galaxy-scene" ref={host} aria-label="Interactive 3D Gargantua Black Hole">
      {error && <div className="scene-error">3D Black Hole scene unavailable: {error}</div>}
    </div>
  );
}

// Slim 60px Icon-Only Navigation Rail
function Navigation({ open, active, onToggleChat, drawerOpen }) {
  return (
    <nav className="galaxy-sidebar" aria-label="JARVIS navigation rail">
      {/* Top Circular Ring Logo */}
      <div className="galaxy-sidebar-head">
        <button className="rail-brand" onClick={() => open('home')} aria-label="Return to Home" title="Home">
          <div className="glowing-rail-ring">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="#38bdf8" strokeWidth="1.5" strokeOpacity="0.4" />
              <circle cx="12" cy="12" r="5" stroke="#f59e0b" strokeWidth="1.5" />
              <circle cx="12" cy="12" r="2.5" fill="#ffffff" />
            </svg>
          </div>
        </button>
      </div>

      {/* 40x40 Icon Buttons */}
      <div className="galaxy-sidebar-items">
        {/* Home */}
        <button
          key="home"
          type="button"
          className={active === 'home' && !drawerOpen ? 'is-home' : ''}
          onClick={() => open('home')}
          title="Home"
          aria-label="Home"
        >
          <Home size={18} strokeWidth={1.75} />
        </button>

        {/* Chat Drawer Toggle Button */}
        <button
          key="chat-drawer"
          type="button"
          className={drawerOpen && active === 'home' ? 'is-home' : ''}
          onClick={onToggleChat}
          title="Toggle Chat Drawer"
          aria-label="Toggle Chat Drawer"
        >
          <MessageSquare size={18} strokeWidth={1.75} />
        </button>

        {/* Essential Navigation Items */}
        {NAV.filter((item) => item.id !== 'home').map(({ id, label, icon: IconComponent }) => (
          <button
            key={id}
            type="button"
            className={id === active ? 'is-home' : ''}
            onClick={() => open(id)}
            title={label}
            aria-label={label}
          >
            <IconComponent size={18} strokeWidth={1.75} />
          </button>
        ))}
      </div>

      {/* Bottom Online Dot */}
      <div className="galaxy-sidebar-foot" title="Local Core Online">
        <span className="rail-state-dot" />
        <span className="rail-online-text">ONLINE</span>
      </div>
    </nav>
  );
}

export default function GalaxyHome() {
  const telemetry = useTelemetry();
  const visual = useVisualState();
  const manager = useWindowManager();
  const sceneRef = useRef(null);
  const homeRef = useRef(null);
  const hideHudTimer = useRef(null);

  const [activeTab, setActiveTab] = useState('home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commandInput, setCommandInput] = useState('');
  const [commandScreenAttach, setCommandScreenAttach] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [hudVisible, setHudVisible] = useState(false);
  const [executionMode, setExecutionMode] = useState(() => telemetry?.modelRouting?.executionMode || 'cloud');

  useEffect(() => {
    if (telemetry?.modelRouting?.executionMode) {
      setExecutionMode(telemetry.modelRouting.executionMode);
    }
  }, [telemetry?.modelRouting?.executionMode]);

  useEffect(() => {
    fetch('/api/models/routing')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.executionMode) setExecutionMode(data.executionMode);
      })
      .catch(() => {});
  }, []);

  const handleToggleMode = async () => {
    const cycle = { cloud: 'cli', cli: 'local', local: 'cloud' };
    const nextMode = cycle[executionMode] || 'cloud';
    setExecutionMode(nextMode);
    try {
      const res = await fetch('/api/models/execution-mode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: nextMode }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.executionMode) setExecutionMode(data.executionMode);
      }
    } catch (err) {
      console.error('Failed to toggle execution mode:', err);
    }
  };

  const revealHud = () => {
    setHudVisible(true);
    clearTimeout(hideHudTimer.current);
    hideHudTimer.current = setTimeout(() => setHudVisible(false), 3200);
  };

  useEffect(() => {
    const onFullscreen = () => {
      const active = document.fullscreenElement === homeRef.current;
      setImmersive(active);
      sceneRef.current?.setImmersive(active);
      if (active) {
        sceneRef.current?.focus();
        revealHud();
      } else {
        setHudVisible(false);
        clearTimeout(hideHudTimer.current);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen);
      clearTimeout(hideHudTimer.current);
    };
  }, []);

  const toggleImmersive = async () => {
    if (document.fullscreenElement === homeRef.current) await document.exitFullscreen();
    else if (homeRef.current?.requestFullscreen) await homeRef.current.requestFullscreen().catch(() => {});
  };

  // Listen to drawer commands
  useEffect(() => {
    const handleToggle = () => setDrawerOpen((prev) => !prev);
    const handleClose = () => setDrawerOpen(false);
    window.addEventListener('jarvis:toggle-chat', handleToggle);
    window.addEventListener('jarvis:close-drawer', handleClose);
    return () => {
      window.removeEventListener('jarvis:toggle-chat', handleToggle);
      window.removeEventListener('jarvis:close-drawer', handleClose);
    };
  }, []);

  useEffect(() => {
    const handleNav = (e) => {
      const target = e.detail?.id || e.detail?.view;
      if (target) open(target);
    };
    window.addEventListener('jarvis:navigate', handleNav);
    window.addEventListener('jarvis:open-window', handleNav);
    return () => {
      window.removeEventListener('jarvis:navigate', handleNav);
      window.removeEventListener('jarvis:open-window', handleNav);
    };
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        if (drawerOpen) {
          event.preventDefault();
          setDrawerOpen(false);
          return;
        }
        if (activeTab !== 'home') {
          event.preventDefault();
          setActiveTab('home');
          return;
        }
        if (document.fullscreenElement === homeRef.current) {
          event.preventDefault();
          void document.exitFullscreen();
          return;
        }
      }
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.isComposing ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) ||
        document.activeElement?.isContentEditable
      )
        return;
      const ownsNavigation =
        document.activeElement === sceneRef.current?.canvas ||
        (document.fullscreenElement === homeRef.current && document.activeElement === homeRef.current);
      if (!ownsNavigation) return;
      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        void toggleImmersive();
      }
      if (event.key.toLowerCase() === 'h') {
        event.preventDefault();
        sceneRef.current?.resetView();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTab, drawerOpen]);

  const open = (id) => {
    if (visual.phase === 'sleeping') visual.wake();
    if (immersive) void document.exitFullscreen();
    if (id === 'home' || id === 'overview') {
      setActiveTab('home');
      setDrawerOpen(false);
      manager.closeAll();
      return;
    }
    if (id === 'chat') {
      setActiveTab('home');
      setDrawerOpen(true);
      manager.closeAll();
      return;
    }
    const tabMap = {
      tasks: 'tasks',
      reminders: 'tasks',
      memory: 'memory',
      activity: 'activity',
      runs: 'activity',
      approvals: 'activity',
      browser: 'activity',
      settings: 'settings',
      brain: 'settings',
      integrations: 'settings',
      mcp: 'settings',
      system: 'settings',
    };
    if (tabMap[id]) {
      setActiveTab(tabMap[id]);
      setDrawerOpen(false);
      manager.closeAll();
      return;
    }
    manager.open(id);
  };

  const handleFloatingCommandSubmit = () => {
    const text = commandInput.trim();
    if (!text) return;
    setDrawerOpen(true);
    window.dispatchEvent(
      new CustomEvent('jarvis:submit-query', {
        detail: { query: text, attachScreen: commandScreenAttach },
      })
    );
    setCommandInput('');
    setCommandScreenAttach(false);
  };

  return (
    <main
      ref={homeRef}
      className={`galaxy-home phase-${visual.phase}${drawerOpen ? ' drawer-active' : ''}${
        immersive ? ' is-immersive' : ''
      }${hudVisible ? ' show-immersive-hud' : ''}`}
      data-phase={visual.phase}
      onPointerMove={(event) => {
        if (immersive && (event.clientX < 75 || event.clientY > window.innerHeight - 70)) revealHud();
      }}
    >
      {/* 1. Real-Time Gargantua 3D Black Hole Scene */}
      <Scene phase={visual.phase} sceneRef={sceneRef} drawerOpen={drawerOpen} />
      <div className="galaxy-vignette" />

      {/* 2. Slim 60px Icon Navigation Rail */}
      <Navigation
        open={open}
        active={activeTab}
        onToggleChat={() => setDrawerOpen((prev) => !prev)}
        drawerOpen={drawerOpen}
      />

      {/* 3. Top Header Bar with Mode Toggle & Actions */}
      <div className="galaxy-topline">
        <div className="system-identity">
          <span className="identity-tick" />
          <span className="wordmark-title">J A R V I S</span>
          <span className="wordmark-subtitle"> / PERSONAL EXECUTION LAYER</span>
        </div>
        <div className="topline-actions topbar-right">
          <button
            type="button"
            data-testid="execution-mode-toggle"
            className={`execution-mode-btn ${
              executionMode === 'cli' ? 'cli' : executionMode === 'local' ? 'local' : 'cloud'
            }`}
            onClick={handleToggleMode}
            title="Toggle execution mode: Cloud API → CLI Agent (OpenCode/MCP) → Local Ollama"
            aria-label="Toggle execution mode"
          >
            {executionMode === 'cli' ? '⚡ CLI' : executionMode === 'local' ? '💻 LOCAL' : '☁️ CLOUD'}
          </button>
          <span className={`connection-dot ${visual.backendOnline ? 'is-online' : ''}`} />
          <span className="service-status-lbl">{visual.serviceStatus}</span>
          <button onClick={() => sceneRef.current?.resetView()} title="Reset camera (H)" aria-label="Reset camera">
            <RotateCcw size={14} />
          </button>
          <button
            onClick={visual.phase === 'sleeping' ? visual.wake : visual.sleep}
            title={visual.phase === 'sleeping' ? 'Wake JARVIS' : 'Sleep JARVIS'}
            aria-label={visual.phase === 'sleeping' ? 'Wake JARVIS' : 'Sleep JARVIS'}
          >
            {visual.phase === 'sleeping' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>

      <button
        className="galaxy-fullscreen-toggle"
        onClick={() => void toggleImmersive()}
        aria-label={immersive ? 'Exit immersive Galaxy' : 'Enter immersive Galaxy'}
        title={immersive ? 'Exit immersive Galaxy (Esc)' : 'Enter immersive Galaxy (F)'}
      >
        {immersive ? <Shrink size={15} /> : <Expand size={15} />}
      </button>

      {/* HOME TAB VIEW */}
      {activeTab === 'home' && (
        <>
          {/* Centerpiece Hero Greeting Typography */}
          <div className={`galaxy-hero-typography ${drawerOpen ? 'shifted' : 'centered'}`}>
            <h1 className="hero-greeting">
              <span className="hero-prefix">{getDynamicGreeting()}</span>
              <span className="hero-name"> Pradhuman.</span>
            </h1>
            <p className="hero-subtitle">J A R V I S &nbsp; • &nbsp; P E R S O N A L &nbsp; E X E C U T I O N &nbsp; L A Y E R</p>
          </div>

          {/* STATE 2: Docked Left Frosted-Glass Chat Drawer */}
          <div
            className={`galaxy-home-chat-wrapper ${drawerOpen ? 'is-open' : 'is-hidden'}`}
            data-testid="galaxy-home-chat"
          >
            <Chat embedded={true} />
          </div>

          {/* STATE 1: Floating Glass Command Pill at bottom */}
          {!drawerOpen && (
            <div className="floating-command-pill-container">
              <form
                className="floating-command-pill"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleFloatingCommandSubmit();
                }}
              >
                <button
                  type="button"
                  className="pill-action-btn add-btn"
                  onClick={() => setDrawerOpen(true)}
                  title="New prompt"
                  aria-label="New prompt"
                >
                  +
                </button>
                <input
                  type="text"
                  className="pill-input"
                  placeholder="Ask JARVIS anything..."
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  onFocus={() => {
                    // Clicking or focusing opens drawer smoothly
                    setDrawerOpen(true);
                  }}
                />
                <button
                  type="button"
                  className={`pill-action-btn screen-btn ${commandScreenAttach ? 'active' : ''}`}
                  onClick={() => setCommandScreenAttach((prev) => !prev)}
                  title={commandScreenAttach ? 'Screen attached' : 'Attach screen'}
                  aria-label="Attach screen"
                >
                  [o]
                </button>
                <button
                  type="button"
                  className="pill-action-btn mic-btn"
                  onClick={() => setDrawerOpen(true)}
                  title="Voice command"
                  aria-label="Voice command"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5 11a7 7 0 0014 0M12 18v3" />
                  </svg>
                </button>
                <button
                  type="submit"
                  className="pill-action-btn send-btn"
                  title="Send message"
                  aria-label="Send message"
                >
                  →
                </button>
              </form>
            </div>
          )}

          <div className="galaxy-bottomline">
            <span>CORE {visual.phase.toUpperCase()}</span>
            <i />
            <span>{visual.backendOnline ? 'LOCAL SERVICE CONNECTED' : 'LOCAL SERVICE UNAVAILABLE'}</span>
          </div>
        </>
      )}

      {/* FULL-PAGE WORKSPACES FOR NON-HOME TABS */}
      {activeTab !== 'home' && (
        <div
          className="galaxy-fullpage-workspace"
          data-testid="galaxy-fullpage-workspace"
          role="region"
          aria-label={`${activeTab} workspace`}
        >
          <div className="galaxy-fullpage-topbar">
            <div className="galaxy-fullpage-breadcrumb">
              <button type="button" className="fullpage-home-link" onClick={() => setActiveTab('home')}>
                <Home size={14} /> HOME
              </button>
              <ChevronRight size={13} />
              <span className="fullpage-current-tab">{activeTab.toUpperCase()}</span>
            </div>
            <button
              type="button"
              className="galaxy-fullpage-close"
              onClick={() => setActiveTab('home')}
              title="Return to Galaxy Home (Esc)"
            >
              <X size={16} /> <span>CLOSE</span>
            </button>
          </div>
          <div className="galaxy-fullpage-content">
            {activeTab === 'tasks' && <TasksWorkspace />}
            {activeTab === 'memory' && <MemoryWorkspace />}
            {activeTab === 'activity' && <ActivityWorkspace />}
            {activeTab === 'settings' && <SettingsWorkspaceCombined />}
          </div>
        </div>
      )}

      {immersive && hudVisible && (
        <div className="galaxy-gesture-hint">
          Drag orbit · Wheel zoom · Shift drag pan · W A S D Q E move · H home · Esc exit
        </div>
      )}
      {manager.view}
    </main>
  );
}
