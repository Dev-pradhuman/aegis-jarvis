import { useState } from 'react';
import Icon from './Icon.jsx';
import '../styles/quick-actions.css';

export default function QuickActions() {
  const [feedback, setFeedback] = useState('');

  const showFeedback = (msg) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 2500);
  };

  const dispatchWindow = (id) => {
    window.dispatchEvent(new CustomEvent('jarvis:open-window', { detail: { id } }));
    window.dispatchEvent(new CustomEvent('jarvis:navigate', { detail: { view: id } }));
  };

  const executeTool = async (toolId, input = {}) => {
    try {
      const res = await fetch('/api/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolId, input })
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const handleAction = async (title) => {
    switch (title) {
      case 'New Task':
        dispatchWindow('tasks');
        break;
      case 'Web Search':
        dispatchWindow('browser');
        break;
      case 'Code Runner':
        dispatchWindow('projects');
        break;
      case 'Terminal': {
        showFeedback('Opening Terminal...');
        const ok = await executeTool('apps.open', { name: 'kitty' });
        if (!ok) await executeTool('apps.open', { name: 'konsole' });
        break;
      }
      case 'File Browser': {
        showFeedback('Opening File Browser...');
        const ok = await executeTool('apps.open', { name: 'dolphin' });
        if (!ok) dispatchWindow('projects');
        break;
      }
      case 'Notes':
        dispatchWindow('reminders');
        break;
      case 'System Scan':
        showFeedback('Scanning System...');
        fetch('/api/diagnostics').catch(() => {});
        dispatchWindow('system');
        break;
      case 'Voice Input': {
        showFeedback('Toggling Voice...');
        fetch('/api/voice/ptt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'toggle' })
        }).catch(() => {});
        break;
      }
      case 'Take Screenshot': {
        showFeedback('Capturing Screenshot...');
        await executeTool('screen.capture', { target: 'desktop' });
        showFeedback('Screenshot Captured');
        break;
      }
      default:
        break;
    }
  };

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

  return (
    <section className="qa-panel hud-panel">
      <div className="hud-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Quick Actions</span>
        {feedback && <span className="mono" style={{ fontSize: '11px', color: 'var(--cyan, #0ff)', textTransform: 'none' }}>{feedback}</span>}
      </div>
      <div className="qa-grid">
        {QUICK_ACTIONS.map((a) => (
          <button
            className="qa-btn hud-button"
            key={a.t}
            onClick={() => handleAction(a.t)}
            type="button"
            aria-label={`${a.t}: ${a.s}`}
          >
            <Icon name={a.icon} />
            <div className="t">{a.t}</div>
            <div className="s">{a.s}</div>
          </button>
        ))}
      </div>
    </section>
  );
}
