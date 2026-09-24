import { useReducer, useRef } from 'react';
import { Minus, Maximize2, Minimize2, X, PanelTopOpen } from 'lucide-react';
import Chat from '../components/Chat.jsx';
import WorkspaceViews from '../components/WorkspaceViews.jsx';
import LiveModule from './LiveModule.jsx';
import BrowserPanel from './BrowserPanel.jsx';

const TITLES = {
  chat: 'Conversation', tasks: 'Tasks', approvals: 'Approvals', runs: 'Execution runs',
  workflows: 'Workflows', memory: 'Memory', research: 'Research', mcp: 'MCP tools',
  agents: 'Agents', projects: 'Projects', media: 'Media', integrations: 'Integrations',
  system: 'System', settings: 'Settings', phone: 'Phone', messaging: 'Messaging', browser: 'Browser',
};

function initialGeometry(index) {
  const width = Math.min(690, Math.max(420, window.innerWidth - 140));
  const height = Math.min(580, Math.max(350, window.innerHeight - 140));
  return {
    x: Math.max(64, Math.round((window.innerWidth - width) / 2 + index * 28)),
    y: Math.max(60, Math.round((window.innerHeight - height) / 2 + index * 24)),
    width, height,
  };
}

function reducer(windows, action) {
  if (action.type === 'closeAll') return [];
  const existing = windows.find((item) => item.id === action.id);
  if (action.type === 'open') {
    if (existing) return [...windows.filter((item) => item.id !== action.id), { ...existing, minimized: false }];
    return [...windows, { id: action.id, title: TITLES[action.id] || action.id, ...initialGeometry(windows.length), minimized: false, maximized: false, restore: null }];
  }
  if (action.type === 'close') return windows.filter((item) => item.id !== action.id);
  if (!existing) return windows;
  const next = windows.map((item) => {
    if (item.id !== action.id) return item;
    if (action.type === 'minimize') return { ...item, minimized: true };
    if (action.type === 'restore') return { ...item, minimized: false };
    if (action.type === 'maximize') return item.maximized
      ? { ...item, ...item.restore, maximized: false, restore: null }
      : { ...item, restore: { x: item.x, y: item.y, width: item.width, height: item.height }, maximized: true, minimized: false };
    if (action.type === 'geometry') return { ...item, ...action.geometry };
    return item;
  });
  if (action.type === 'focus' || action.type === 'restore' || action.type === 'open') return [...next.filter((item) => item.id !== action.id), next.find((item) => item.id === action.id)];
  return next;
}

function WindowBody({ id }) {
  if (id === 'chat') return <Chat />;
  if (id === 'browser') return <BrowserPanel />;
  if (id === 'settings') return <WorkspaceViews view="settings" />;
  return <LiveModule id={id} />;
}

function JarvisWindow({ windowData, index, dispatch }) {
  const drag = useRef(null);
  const windowRef = useRef(null);
  const { id, title, x, y, width, height, maximized, minimized } = windowData;
  const startDrag = (event, mode) => {
    if (event.button !== 0 || maximized) return;
    event.preventDefault();
    drag.current = { mode, x: event.clientX, y: event.clientY, start: { x, y, width, height } };
    event.currentTarget.setPointerCapture(event.pointerId);
    dispatch({ type: 'focus', id });
  };
  const move = (event) => {
    if (!drag.current) return;
    const { mode, start, x: originX, y: originY } = drag.current;
    const dx = event.clientX - originX, dy = event.clientY - originY;
    const geometry = mode === 'resize'
      ? { width: Math.max(360, Math.min(window.innerWidth - start.x - 12, start.width + dx)), height: Math.max(300, Math.min(window.innerHeight - start.y - 12, start.height + dy)) }
      : { x: Math.max(8, Math.min(window.innerWidth - 110, start.x + dx)), y: Math.max(8, Math.min(window.innerHeight - 48, start.y + dy)) };
    dispatch({ type: 'geometry', id, geometry });
  };
  return <section
    ref={windowRef}
    className={`jarvis-window${maximized ? ' is-maximized' : ''}${minimized ? ' is-minimized' : ''}`}
    style={maximized ? { zIndex: 30 + index } : { left: x, top: y, width, height, zIndex: 30 + index }}
    onPointerDown={() => dispatch({ type: 'focus', id })}
    aria-label={`${title} window`}
    data-window={id}
  >
    <header className="window-titlebar" onPointerDown={(event) => { if (!event.target.closest('button')) startDrag(event, 'drag'); }} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onDoubleClick={() => dispatch({ type: 'maximize', id })}>
      <span className="window-mark" /><span className="window-title">{title}</span><span className="window-subtitle">JARVIS / {id.toUpperCase()}</span>
      <div className="window-controls">
        <button aria-label={`Minimize ${title}`} title="Minimize" onClick={() => dispatch({ type: 'minimize', id })}><Minus size={15} /></button>
        <button aria-label={`${maximized ? 'Restore' : 'Maximize'} ${title}`} title={maximized ? 'Restore' : 'Maximize'} onClick={() => dispatch({ type: 'maximize', id })}>{maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>
        <button aria-label={`Close ${title}`} title="Close" onClick={() => dispatch({ type: 'close', id })}><X size={16} /></button>
      </div>
    </header>
    <div className="window-content"><WindowBody id={id} /></div>
    {!maximized && <div className="window-resize" role="separator" aria-label={`Resize ${title}`} onPointerDown={(event) => startDrag(event, 'resize')} onPointerMove={move} onPointerUp={() => { drag.current = null; }} />}
  </section>;
}

export default function useWindowManager() {
  const [windows, dispatch] = useReducer(reducer, []);
  const open = (id) => dispatch({ type: 'open', id });
  const closeAll = () => dispatch({ type: 'closeAll' });
  const view = <>
    {windows.map((item, index) => <JarvisWindow key={item.id} windowData={item} index={index} dispatch={dispatch} />)}
    {windows.some((item) => item.minimized) && <div className="window-dock" aria-label="Minimized windows">
      {windows.filter((item) => item.minimized).map((item) => <button key={item.id} onClick={() => dispatch({ type: 'restore', id: item.id })}><PanelTopOpen size={14} />{item.title}</button>)}
    </div>}
  </>;
  return { open, closeAll, windows, view };
}
