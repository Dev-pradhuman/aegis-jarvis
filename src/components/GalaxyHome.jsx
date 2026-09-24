import { useEffect, useRef, useState } from 'react';
import { Activity, AudioLines, Bot, BrainCircuit, ChevronRight, Database, Expand, FlaskConical, FolderKanban, Globe2, Home, ListTodo, MemoryStick, MessageCircle, Moon, PanelLeftClose, PanelLeftOpen, Phone, PlugZap, Radio, RotateCcw, Settings2, ShieldCheck, Shrink, Sparkles, Sun, Workflow, Wrench } from 'lucide-react';
import useTelemetry from '../hooks/useTelemetry.js';
import { pollWithBackoff } from '../hooks/pollWithBackoff.js';
import useVisualState from '../galaxy/useVisualState.js';
import useWindowManager from '../galaxy/WindowManager.jsx';
import '../styles/galaxy-home.css';
import '../styles/galaxy-immersive.css';

const NAV = [
  { id: 'home', label: 'Home', icon: Home }, { id: 'chat', label: 'Chat', icon: MessageCircle },
  { id: 'tasks', label: 'Tasks', icon: ListTodo }, { id: 'runs', label: 'Runs', icon: Activity },
  { id: 'workflows', label: 'Workflows', icon: Workflow }, { id: 'memory', label: 'Memory', icon: Database },
  { id: 'browser', label: 'Browser', icon: Globe2 },
  { id: 'approvals', label: 'Approvals', icon: ShieldCheck }, { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'mcp', label: 'MCP & tools', icon: Wrench }, { id: 'research', label: 'Research', icon: FlaskConical },
  { id: 'projects', label: 'Projects', icon: FolderKanban }, { id: 'media', label: 'Media', icon: Sparkles },
  { id: 'integrations', label: 'Integrations', icon: PlugZap }, { id: 'phone', label: 'Phone', icon: Phone },
  { id: 'messaging', label: 'Messaging', icon: Radio }, { id: 'system', label: 'System', icon: MemoryStick },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];

function Scene({ phase, sceneRef }) {
  const host = useRef(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    let controller;
    const sceneUrl = '/galaxy/scene.js';
    const loadScene = new Function('url', 'return import(url)');
    loadScene(sceneUrl).then(({ mountGalaxyScene }) => {
      if (disposed) return;
      try {
        controller = mountGalaxyScene(host.current, { reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, quality: import.meta.env.DEV && new URLSearchParams(window.location.search).get('galaxyQuality') === 'low' ? 'low' : 'auto' });
        sceneRef.current = controller;
        if (import.meta.env.DEV) window.__jarvisGalaxyScene = controller;
        controller.setVisualState(phase);
        controller.setImmersive(Boolean(document.fullscreenElement));
      } catch (cause) { setError(cause.message); }
    }).catch((cause) => setError(cause.message));
    return () => { disposed = true; controller?.dispose(); sceneRef.current = null; if (import.meta.env.DEV) delete window.__jarvisGalaxyScene; };
  }, []);
  useEffect(() => { sceneRef.current?.setVisualState(phase); }, [phase]);
  return <div className="galaxy-scene" ref={host} aria-label="Interactive three-dimensional JARVIS galaxy">{error && <div className="scene-error">3D scene unavailable: {error}</div>}</div>;
}

function Navigation({ expanded, onToggle, open, phase, active }) {
  return <nav className={`galaxy-sidebar ${expanded ? 'is-expanded' : ''}`} aria-label="JARVIS navigation">
    <div className="galaxy-sidebar-head">
      <button className="rail-brand" onClick={() => open('home')} aria-label="Galaxy home"><BrainCircuit size={20} strokeWidth={1.5} /><span>JARVIS</span></button>
      <button className="rail-toggle" onClick={onToggle} aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}>{expanded ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}</button>
    </div>
    <div className="galaxy-sidebar-items">
      {NAV.map(({ id, label, icon: Icon }) => <button key={id} className={id === active ? 'is-home' : ''} onClick={() => open(id)} title={label} aria-label={label}><Icon size={17} strokeWidth={1.65} /><span>{label}</span></button>)}
    </div>
    <div className="galaxy-sidebar-foot"><span className="rail-state-dot" /><span>{phase.toUpperCase()}</span><a href="/legacy" title="Open preserved legacy console">Legacy console <ChevronRight size={13} /></a></div>
  </nav>;
}

function Telemetry({ metrics, telemetry, status, open }) {
  const stats = [['CPU', metrics?.cpuPercent], ['RAM', metrics?.memoryPercent], ['GPU', metrics?.gpuPercent]];
  return <button className="galaxy-telemetry" onClick={() => open('system')} aria-label="Open system diagnostics">
    {stats.map(([label, value]) => <div className="telemetry-stat" key={label} style={{ '--progress': `${(value || 0) * 3.6}deg` }}><span className="telemetry-ring"><b>{value == null ? '—' : `${value}%`}</b></span><small>{label}</small></div>)}
    <span className={`telemetry-link ${status === 'ONLINE' ? 'is-online' : ''}`}>{status}<small>{telemetry.modelRouting?.last?.finalModel || telemetry.provider?.model || 'MODEL —'}</small></span>
  </button>;
}

function VoiceChannel({ phase, open }) {
  return <button className="galaxy-voice" onClick={() => open('chat')} aria-label="Open conversation and voice channel">
    <div className="voice-channel-meta"><span><AudioLines size={13} /> Voice channel</span><b>JARVIS</b><span className="voice-phase">{phase.toUpperCase()}</span></div>
    <div className="voice-bars" aria-hidden="true">{Array.from({ length: 39 }, (_, i) => <i key={i} style={{ '--i': i, '--height': `${7 + (i * 19 % 23)}px` }} />)}</div>
  </button>;
}

export default function GalaxyHome() {
  const telemetry = useTelemetry();
  const visual = useVisualState();
  const manager = useWindowManager();
  const sceneRef = useRef(null);
  const homeRef = useRef(null);
  const hideHudTimer = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [immersive, setImmersive] = useState(false);
  const [hudVisible, setHudVisible] = useState(false);
  useEffect(() => pollWithBackoff(async (signal) => {
    const response = await fetch('/api/system/metrics', { signal });
    if (!response.ok) throw new Error(`Metrics ${response.status}`);
    setMetrics(await response.json());
  }, { connectedMs: 5000, onError: () => setMetrics(null) }), []);
  useEffect(() => pollWithBackoff(async (signal) => {
    const response = await fetch('/api/device/status', { signal });
    if (!response.ok) throw new Error(`Device status ${response.status}`);
    const status = await response.json();
    const latestCall = (status.events || []).find((event) => event.type.startsWith('call.'));
    setIncomingCall(latestCall?.type === 'call.incoming' && Date.now() - Date.parse(latestCall.at) < 120_000 ? latestCall : null);
  }, { connectedMs: 5000, onError: () => setIncomingCall(null) }), []);
  const revealHud = () => { setHudVisible(true); clearTimeout(hideHudTimer.current); hideHudTimer.current = setTimeout(() => setHudVisible(false), 3200); };
  useEffect(() => {
    const onFullscreen = () => { const active = document.fullscreenElement === homeRef.current; setImmersive(active); sceneRef.current?.setImmersive(active); if (active) { sceneRef.current?.focus(); revealHud(); } else { setHudVisible(false); clearTimeout(hideHudTimer.current); } };
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => { document.removeEventListener('fullscreenchange', onFullscreen); clearTimeout(hideHudTimer.current); };
  }, []);
  const toggleImmersive = async () => {
    if (document.fullscreenElement === homeRef.current) await document.exitFullscreen();
    else if (homeRef.current?.requestFullscreen) await homeRef.current.requestFullscreen().catch(() => {});
  };
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && document.fullscreenElement === homeRef.current) { event.preventDefault(); void document.exitFullscreen(); return; }
      if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;
      const ownsNavigation = document.activeElement === sceneRef.current?.canvas || document.fullscreenElement === homeRef.current && document.activeElement === homeRef.current;
      if (!ownsNavigation) return;
      if (event.key.toLowerCase() === 'f') { event.preventDefault(); void toggleImmersive(); }
      if (event.key.toLowerCase() === 'h') { event.preventDefault(); sceneRef.current?.resetView(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const open = (id) => {
    if (visual.phase === 'sleeping') visual.wake();
    if (immersive) void document.exitFullscreen();
    if (id === 'home') { manager.closeAll(); setExpanded(false); return; }
    manager.open(id);
    setExpanded(false);
  };
  return <main ref={homeRef} className={`galaxy-home phase-${visual.phase}${immersive ? ' is-immersive' : ''}${hudVisible ? ' show-immersive-hud' : ''}`} data-phase={visual.phase} onPointerMove={(event) => { if (immersive && (event.clientX < 75 || event.clientY > window.innerHeight - 70)) revealHud(); }}>
    <Scene phase={visual.phase} sceneRef={sceneRef} />
    <div className="galaxy-vignette" />
    <Navigation expanded={expanded} onToggle={() => setExpanded((value) => !value)} open={open} phase={visual.phase} active={manager.windows.filter((item) => !item.minimized).at(-1)?.id || 'home'} />
    <div className="galaxy-topline"><div className="system-identity"><span className="identity-tick" /> SYSTEM ACCESS <span> / INTELLIGENCE</span></div><div className="topline-actions"><span className={`connection-dot ${visual.backendOnline ? 'is-online' : ''}`} />{visual.serviceStatus}<button onClick={() => sceneRef.current?.resetView()} title="Reset camera (H)" aria-label="Reset camera"><RotateCcw size={14} /></button><button onClick={visual.phase === 'sleeping' ? visual.wake : visual.sleep} title={visual.phase === 'sleeping' ? 'Wake JARVIS' : 'Sleep JARVIS'} aria-label={visual.phase === 'sleeping' ? 'Wake JARVIS' : 'Sleep JARVIS'}>{visual.phase === 'sleeping' ? <Sun size={15} /> : <Moon size={15} />}</button></div></div>
    <button className="galaxy-fullscreen-toggle" onClick={() => void toggleImmersive()} aria-label={immersive ? 'Exit immersive Galaxy' : 'Enter immersive Galaxy'} title={immersive ? 'Exit immersive Galaxy (Esc)' : 'Enter immersive Galaxy (F)'}>{immersive ? <Shrink size={15} /> : <Expand size={15} />}</button>
    <section className="galaxy-left-card" aria-label="JARVIS activity"><div className="micro-label">SYSTEM ACTIVITY <span>{visual.backendOnline ? 'LIVE' : visual.serviceStatus}</span></div><div className="activity-primary"><strong>{visual.backendOnline && telemetry.online ? telemetry.usage?.requests ?? '—' : '—'}</strong><span>REQUESTS</span></div><div className="activity-sub">{!visual.backendOnline ? 'SERVICE UNAVAILABLE' : visual.activeRun ? `RUNNING · ${visual.activeRun.title || visual.activeRun.id}` : telemetry.modelRouting?.last?.finalModel || telemetry.provider?.model || 'MODEL UNAVAILABLE'}</div><div className="activity-line"><span>CORE STATE</span><b>{visual.phase.toUpperCase()}</b></div></section>
    <Telemetry metrics={visual.backendOnline ? metrics : null} telemetry={telemetry} status={visual.serviceStatus} open={open} />
    {visual.activeRun && <div className="galaxy-task-cards"><button onClick={() => open('runs')}><span>{visual.activeRun.title || visual.activeRun.id}</span><small>{visual.activeRun.status}</small></button></div>}
    {visual.browserStatus?.engine && <button className="galaxy-browser-chip" onClick={() => open('browser')}><Globe2 size={13} />{visual.browserStatus.humanActionRequired ? 'HUMAN ACTION' : !visual.browserStatus.active ? 'BROWSER READY' : visual.browserStatus.engine === 'firefox' ? 'VISUAL BROWSER' : 'BROWSING'}<span>{visual.browserStatus.engine.toUpperCase()}</span></button>}
    {visual.browserStatus?.humanActionRequired && <div className="galaxy-handoff"><strong>Human verification required</strong><span>Firefox needs your interaction to continue this browser task.</span><button onClick={() => open('browser')}>Open browser controls <ChevronRight size={14} /></button></div>}
    {incomingCall && <div className="galaxy-call-notice" role="status"><strong>Incoming call</strong><span>{incomingCall.contactName || incomingCall.number || 'Unknown caller'}</span><button onClick={() => open('phone')}>View phone status <ChevronRight size={14} /></button></div>}
    <VoiceChannel phase={visual.phase} open={open} />
    <div className="galaxy-bottomline"><span>CORE {visual.phase.toUpperCase()}</span><i /> <span>{visual.backendOnline ? 'LOCAL SERVICE CONNECTED' : 'LOCAL SERVICE UNAVAILABLE'}</span></div>
    {immersive && hudVisible && <div className="galaxy-gesture-hint">Drag orbit · Wheel zoom · Shift drag pan · W A S D Q E move · H home · Esc exit</div>}
    {visual.previewEnabled && <div className="visual-preview" aria-label="Development visual state preview"><span>STATE PREVIEW</span>{['sleeping', 'idle', 'listening', 'thinking', 'working', 'speaking'].map((state) => <button key={state} className={(visual.preview || visual.phase) === state ? 'active' : ''} onClick={() => visual.setPreview(state)}>{state}</button>)}<button onClick={() => visual.setPreview(null)}>Live</button></div>}
    {manager.view}
  </main>;
}
