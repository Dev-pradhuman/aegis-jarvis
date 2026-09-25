import { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import NeuralCore from './components/NeuralCore.jsx';
import Approvals from './components/Approvals.jsx';
import QuickActions from './components/QuickActions.jsx';
import Chat from './components/Chat.jsx';
import Tasks from './components/Tasks.jsx';
import StatusBar from './components/StatusBar.jsx';
import WorkspaceViews from './components/WorkspaceViews.jsx';
import GalaxyHome from './components/GalaxyHome.jsx';

function LegacyConsole() {
  const [activeView, setActiveView] = useState('overview');
  return <div className="app">
      <Sidebar activeView={activeView} onNavigate={setActiveView} />
      <TopBar />
      <a href="/" className="legacy-return">Return to Galaxy</a>
      {activeView === 'overview' ? <main className="main overview-main"><div className="main-left"><NeuralCore /><div className="lower-row"><Approvals /><QuickActions /></div></div><div className="main-right"><Chat /><Tasks /></div></main> : <main className="main workspace-main"><WorkspaceViews view={activeView} /></main>}
      <StatusBar />
    </div>;
}

export default function App() {
  const isLegacy = window.location.pathname === '/legacy';
  useEffect(() => { document.title = isLegacy ? 'JARVIS // Legacy Console' : 'JARVIS // Galaxy'; }, [isLegacy]);
  return <AuthGate>{isLegacy ? <LegacyConsole /> : <GalaxyHome />}</AuthGate>;
}

function AuthGate({ children }) {
  const [status, setStatus] = useState('checking');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const response = await fetch('/api/auth/status', { cache: 'no-store' });
        if (!response.ok) throw new Error('Service unavailable');
        const result = await response.json();
        if (active) setStatus(result.required && !result.authenticated ? 'locked' : 'open');
      } catch { if (active) setStatus('offline'); }
    };
    check();
    const timer = window.setInterval(() => { if (active) check(); }, 10_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const login = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
      if (!response.ok) throw new Error(response.status === 401 ? 'Invalid access token' : 'Service unavailable');
      setToken('');
      setStatus('open');
    } catch (cause) { setError(cause.message); }
  };

  if (status === 'checking') return <div className="jarvis-auth" role="status">CONNECTING TO JARVIS</div>;
  if (status !== 'locked') return children;
  return <main className="jarvis-auth"><form className="jarvis-auth-card" onSubmit={login}>
    <div className="jarvis-auth-eyebrow">SECURE LOCAL SESSION</div>
    <h1>JARVIS access</h1>
    <p>Enter the configured access token to connect to this JARVIS host.</p>
    <label htmlFor="jarvis-access-token">Access token</label>
    <input id="jarvis-access-token" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} autoFocus required />
    {error && <p className="jarvis-auth-error" role="alert">{error}</p>}
    <button type="submit">CONNECT</button>
  </form></main>;
}
