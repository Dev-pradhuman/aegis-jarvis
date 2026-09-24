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
  return isLegacy ? <LegacyConsole /> : <GalaxyHome />;
}
