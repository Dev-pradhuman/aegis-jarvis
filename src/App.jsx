import { useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import TopBar from './components/TopBar.jsx';
import NeuralCore from './components/NeuralCore.jsx';
import Approvals from './components/Approvals.jsx';
import QuickActions from './components/QuickActions.jsx';
import Chat from './components/Chat.jsx';
import Tasks from './components/Tasks.jsx';
import StatusBar from './components/StatusBar.jsx';
import WorkspaceViews from './components/WorkspaceViews.jsx';
import VoiceIsland from './components/VoiceIsland.jsx';
import useAppearance from './hooks/useAppearance.js';

function Overview({ onNewChat }) {
  return (
    <main className="main overview-main">
      <div className="main-left">
        <NeuralCore onNewChat={onNewChat} />
        <div className="lower-row"><Approvals /><QuickActions /></div>
      </div>
      <div className="main-right"><Chat /><Tasks /></div>
    </main>
  );
}

export default function App() {
  useAppearance();
  const params = new URLSearchParams(window.location.search);
  const [activeView, setActiveView] = useState('overview');
  if (params.get('island') === '1') return <VoiceIsland desktopOverlay />;
  const desktopShell = params.get('desktop') === '1';
  async function newChat() {
    const response = await fetch('/api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (!response.ok) return;
    const { session } = await response.json();
    window.dispatchEvent(new CustomEvent('jarvis:session-change', { detail: { sessionId: session.id } }));
    setActiveView('overview');
  }

  return (
    <div className="app">
      {!desktopShell && <VoiceIsland />}
      <Sidebar activeView={activeView} onNavigate={setActiveView} />
      <TopBar />
      {activeView === 'overview' ? <Overview onNewChat={newChat} /> : <main className="main workspace-main"><WorkspaceViews view={activeView} /></main>}
      <StatusBar />
    </div>
  );
}
