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

function Overview() {
  return (
    <main className="main overview-main">
      <div className="main-left">
        <NeuralCore />
        <div className="lower-row"><Approvals /><QuickActions /></div>
      </div>
      <div className="main-right"><Chat /><Tasks /></div>
    </main>
  );
}

export default function App() {
  const [activeView, setActiveView] = useState('overview');

  return (
    <div className="app">
      <Sidebar activeView={activeView} onNavigate={setActiveView} />
      <TopBar />
      {activeView === 'overview' ? <Overview /> : <main className="main workspace-main"><WorkspaceViews view={activeView} /></main>}
      <StatusBar />
    </div>
  );
}
