import { useEffect, useRef, useState } from 'react';
import Approvals from './Approvals.jsx';
import Chat from './Chat.jsx';
import Icon from './Icon.jsx';
import Tasks from './Tasks.jsx';
import useAppearance from '../hooks/useAppearance.js';
import { AppearanceManagerPanel, ContactManagerPanel, CredentialManagerPanel } from './SettingsPanels.jsx';
import '../styles/workspaces.css';

const VIEW_META = {
  chat: ['Communications', 'Conversation channel and active context'],
  brain: ['Neural Brain', 'WebGL cognition model and spatial gesture control'],
  tasks: ['Task Operations', 'Active work, execution state, and queue health'],
  approvals: ['Approval Gate', 'Human authorization for consequential actions'],
  connections: ['Connections', 'Services, channels, and runtime endpoints'],
  workflows: ['Workflows', 'Multi-stage automations and execution history'],
  goals: ['Goals', 'Outcomes, milestones, and completion signals'],
  agents: ['Agent Fleet', 'Specialist workers and current assignments'],
  skills: ['Skill Library', 'Installed capabilities and invocation health'],
  settings: ['System Settings', 'Local policy, interface, and runtime controls'],
};

const connectionData = [
  ['OpenAI', 'Model provider', '12 ms', true],
  ['GitHub', 'Repository access', '38 ms', true],
  ['Local shell', 'Execution bridge', '4 ms', true],
  ['Google Calendar', 'Schedule context', '—', false],
  ['Slack', 'Team messaging', '—', false],
  ['Notion', 'Knowledge workspace', '—', false],
];

const goalData = [
  { name: 'Ship autonomous research loop', owner: 'Research Agent', progress: 74, due: '12 Sep' },
  { name: 'Reduce approval turnaround', owner: 'Planning Agent', progress: 46, due: '18 Sep' },
  { name: 'Consolidate long-term memory', owner: 'Memory Agent', progress: 63, due: '28 Sep' },
  { name: 'Reach 95% tool reliability', owner: 'Execution Agent', progress: 88, due: '04 Oct' },
];

const agentData = [
  { name: 'Research', code: 'RSR-01', state: 'working', task: 'Quantum computing landscape', load: 72 },
  { name: 'Planning', code: 'PLN-02', state: 'working', task: 'Sprint dependency map', load: 48 },
  { name: 'Execution', code: 'EXE-03', state: 'idle', task: 'Awaiting approved action', load: 12 },
  { name: 'Communications', code: 'COM-04', state: 'working', task: 'Drafting stakeholder update', load: 39 },
  { name: 'Memory', code: 'MEM-05', state: 'syncing', task: 'Consolidating session context', load: 61 },
];

const skillData = [
  ['Deep research', 'Search, compare, cite, and synthesize live sources', 'Research', 96],
  ['Code operator', 'Inspect projects, edit files, and verify builds', 'Execution', 98],
  ['Browser control', 'Navigate and operate web applications', 'Execution', 91],
  ['Meeting brief', 'Prepare people, context, decisions, and agenda', 'Planning', 88],
  ['Memory recall', 'Retrieve relevant episodic and semantic context', 'Memory', 94],
  ['Message composer', 'Draft channel-aware communications', 'Comms', 90],
];

function WorkspaceHeader({ view, action }) {
  const [title, subtitle] = VIEW_META[view];
  return (
    <header className="workspace-header">
      <div>
        <div className="workspace-kicker mono">JARVIS / {view.toUpperCase()}</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action}
    </header>
  );
}

function MetricStrip({ items }) {
  return (
    <div className="metric-strip">
      {items.map(([label, value, tone = 'orange']) => (
        <div className="metric-cell" key={label}>
          <span>{label}</span>
          <strong className={tone}>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function LegacyChatWorkspace() {
  const [context, setContext] = useState({ messages: [], runs: [], tools: [] });
  useEffect(() => { let mounted=true;Promise.all([fetch('/api/chats').then(r=>r.ok?r.json():{messages:[]}),fetch('/api/runs').then(r=>r.ok?r.json():{runs:[]}),fetch('/api/tools').then(r=>r.ok?r.json():{tools:[]})]).then(([chats,runs,tools])=>{if(mounted)setContext({messages:chats.messages||[],runs:runs.runs||[],tools:tools.tools||[]});}).catch(()=>{});return()=>{mounted=false;};},[]);
  const recent=context.messages.filter(item=>item.who==='YOU').slice(-4).reverse();
  const activeRuns=context.runs.filter(run=>['queued','planning','running','waiting_for_approval','paused'].includes(run.status));
  return (
    <div className="workspace-page">
      <WorkspaceHeader view="chat" />
      <div className="chat-workspace-grid">
        <aside className="workspace-panel conversation-list">
          <div className="panel-label">Recent channels</div>
          {!recent.length && <div className="empty-state">No saved conversations.</div>}
          {recent.map((item, i) => (
            <button className={`conversation-row${i === 0 ? ' selected' : ''}`} key={`${item.time}-${i}`}>
              <span>{String(item.lines?.[0]||'Conversation').slice(0,40)}</span><small>{new Date(item.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small>
            </button>
          ))}
        </aside>
        <Chat />
        <aside className="workspace-panel context-rail">
          <div className="panel-label">Active context</div>
          <div className="context-stat"><span>Saved messages</span><b>{context.messages.length}</b></div>
          <div className="context-stat"><span>Active Runs</span><b>{activeRuns.length}</b></div>
          <div className="context-stat"><span>Tools available</span><b>{context.tools.filter(tool=>tool.enabled).length}</b></div>
          <div className="context-note">Counts reflect the current backend state. Relevant context is selected per request.</div>
        </aside>
      </div>
    </div>
  );
}

function BrainWorkspace() {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const controllerRef = useRef(null);
  const [sceneState, setSceneState] = useState('initializing');
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [gesture, setGesture] = useState({ hands: 0, mode: 'idle' });
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let mountedController = null;

    function initialize() {
      if (!active || mountedController || !window.mountNeuralBrain) return;
      try {
        mountedController = window.mountNeuralBrain({
          container: containerRef.current,
          video: videoRef.current,
          overlay: overlayRef.current,
          onStatus: setGesture,
          onCameraChange: setCameraOn,
          onError: setError,
        });
        controllerRef.current = mountedController;
        setSceneState('online');
      } catch (reason) {
        setSceneState('failed');
        setError(reason?.message || 'Unable to initialize the WebGL neural scene.');
      }
    }

    initialize();
    window.addEventListener('neural-brain-ready', initialize);

    return () => {
      active = false;
      window.removeEventListener('neural-brain-ready', initialize);
      mountedController?.dispose();
      controllerRef.current = null;
    };
  }, []);

  async function toggleCamera() {
    if (!controllerRef.current || cameraBusy) return;
    setCameraBusy(true);
    setError('');
    try {
      await controllerRef.current.toggleCamera();
    } catch {
      // The bridge already reports a user-facing error and stops partial streams.
    } finally {
      setCameraBusy(false);
    }
  }

  return (
    <div className="workspace-page brain-workspace">
      <WorkspaceHeader
        view="brain"
        action={
          <div className="brain-actions">
            <button className="secondary-action" onClick={() => controllerRef.current?.scene.resetView()}>Reset view</button>
            <button id="start-gesture" className={cameraOn ? 'camera-action active' : 'camera-action'} onClick={toggleCamera} disabled={cameraBusy || sceneState !== 'online'}>
              <span className="dot green"></span>{cameraBusy ? 'Starting…' : cameraOn ? 'Disable camera' : 'Enable camera'}
            </button>
          </div>
        }
      />

      <div className="brain-stage workspace-panel">
        <div id="brain-container" ref={containerRef} className="brain-container" aria-label="Interactive 3D neural brain" />
        <div className="brain-readout top-left mono">
          <span>SCENE</span><b className={sceneState === 'online' ? 'green' : 'orange'}>{sceneState.toUpperCase()}</b>
        </div>
        <div className="brain-readout bottom-left mono">
          <span>GESTURE</span><b>{gesture.mode.toUpperCase()}</b><span>{gesture.hands} HAND{gesture.hands === 1 ? '' : 'S'}</span>
        </div>
        <div className={`gesture-pip${cameraOn ? ' visible' : ''}`}>
          <video id="gesture-cam" ref={videoRef} autoPlay playsInline muted />
          <canvas ref={overlayRef} width="480" height="360" />
          {!cameraOn && <div className="camera-standby"><Icon name="voice" /><span>Camera standby</span></div>}
          <div className="pip-label mono">GESTURE CAM</div>
        </div>
        {error && <div className="brain-error" role="alert">{error}</div>}
      </div>

      <div className="gesture-guide">
        <div><span className="gesture-index">01</span><b>Orbit</b><p>Pinch one hand and move it to rotate the brain.</p></div>
        <div><span className="gesture-index">02</span><b>Roll</b><p>Hold a flat hand and twist your wrist to spin.</p></div>
        <div><span className="gesture-index">03</span><b>Zoom</b><p>Pinch with two hands, then spread or close them.</p></div>
        <div className="gesture-engine"><span>TRACKING ENGINE</span><strong>MediaPipe · Local inference</strong></div>
      </div>
    </div>
  );
}

function LegacyTasksWorkspace() {
  return (
    <div className="workspace-page">
      <WorkspaceHeader view="tasks" />
      <div className="workspace-panel expanded-list"><Tasks /></div>
    </div>
  );
}

function LegacyApprovalsWorkspace() {
  const [pending,setPending]=useState([]);
  useEffect(()=>{let mounted=true;fetch('/api/approvals').then(r=>r.ok?r.json():{approvals:[]}).then(data=>{if(mounted)setPending(data.approvals||[]);}).catch(()=>{});return()=>{mounted=false;};},[]);
  return (
    <div className="workspace-page">
      <WorkspaceHeader view="approvals" />
      <MetricStrip items={[["Pending", String(pending.length).padStart(2, '0')], ['High risk', String(pending.filter(item=>['HIGH','CRITICAL','DESTRUCTIVE','PRIVILEGED'].includes(String(item.risk).toUpperCase())).length).padStart(2,'0'), 'red']]} />
      <div className="approval-workspace-grid">
        <div className="workspace-panel expanded-list"><Approvals /></div>
        <aside className="workspace-panel policy-panel">
          <div className="panel-label">Authorization policy</div>
          <div className="policy-score">ASSISTED <span>MODE</span></div>
          <p>External communications, shell commands, dependency changes, and spending require confirmation.</p>
        </aside>
      </div>
    </div>
  );
}

function LegacyConnectionsWorkspace() {
  const [connections, setConnections] = useState(() => connectionData.map(([name, type, latency, online], index) => ({ id: `legacy-${index}`, name, type, latency, status: online ? 'configured' : 'not configured' })));
  useEffect(() => { let mounted = true; Promise.all([fetch('/api/connections').then((response) => response.ok ? response.json() : null), fetch('/api/composio/status').then((response) => response.ok ? response.json() : null)]).then(([data, composio]) => { if (!mounted) return; const base = data?.connections || []; const apps = (composio?.toolkits || []).map((item) => ({ id: `composio-${item.slug}`, name: item.label, detail: `Composio · ${item.capabilities.join(', ')}${item.note ? ` · ${item.note}` : ''}`, status: composio.connectReady && item.authConfigured ? 'configured' : composio.connectReady ? 'ready to connect' : composio.hasCredential ? 'needs project key' : 'needs key' })); setConnections([...base, ...apps]); }).catch(() => {}); return () => { mounted = false; }; }, []);
  function toggle(index) { setConnections((current) => current.map((value, i) => i === index ? { ...value, status: value.status === 'disabled' ? 'available' : 'disabled' } : value)); }
  const onlineCount = connections.filter((item) => ['configured', 'available'].includes(item.status)).length;
  return (
    <div className="workspace-page">
      <WorkspaceHeader view="connections" action={<button className="primary-action">Add connection</button>} />
      <MetricStrip items={[["Online", String(onlineCount).padStart(2, '0'), 'green'], ['Providers', String(connections.length).padStart(2, '0')], ['Configured', String(connections.filter((item) => item.status === 'configured').length).padStart(2, '0'), 'cyan'], ['Local only', connections.some((item) => item.id === 'local') ? '01' : '00']]} />
      <div className="card-grid">
        {connections.map((connection, i) => <article className="workspace-panel data-card connection-card" key={connection.id || connection.name}><div className="card-icon"><Icon name={connection.id === 'local' ? 'terminal' : 'connections'} /></div><div><h3>{connection.name}</h3><p>{connection.detail || connection.type || connection.kind}</p></div><div className="card-meta"><span>{connection.status}</span><button className={`toggle${['configured', 'available'].includes(connection.status) ? ' on' : ''}`} onClick={() => toggle(i)} aria-label={`Toggle ${connection.name}`}><i /></button></div></article>)}
      </div>
    </div>
  );
}

function WorkflowsWorkspace() {
  const [workflows, setWorkflows] = useState([]);
  const [summary, setSummary] = useState({ active: 0, paused: 0, runs: 0, successRate: 0 });
  const [running, setRunning] = useState(null);
  const [error, setError] = useState('');
  async function load() {
    const response = await fetch('/api/workflows');
    if (!response.ok) throw new Error('Workflow state is unavailable');
    const data = await response.json(); setWorkflows(data.workflows || []); setSummary(data.summary || { active: 0, paused: 0, runs: 0, successRate: 0 });
  }
  useEffect(() => { let mounted = true; fetch('/api/workflows').then((response) => response.ok ? response.json() : Promise.reject(new Error('Workflow state is unavailable'))).then((data) => { if (!mounted) return; setWorkflows(data.workflows || []); setSummary(data.summary || { active: 0, paused: 0, runs: 0, successRate: 0 }); }).catch((reason) => { if (mounted) setError(reason.message); }); return () => { mounted = false; }; }, []);
  async function run(id) {
    setRunning(id); setError('');
    try { const response = await fetch(`/api/workflows/${id}/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Workflow execution failed'); await load(); }
    catch (reason) { setError(reason.message); }
    finally { setRunning(null); }
  }
  return <div className="workspace-page"><WorkspaceHeader view="workflows" /><MetricStrip items={[["Active", String(summary.active).padStart(2, '0'), 'green'], ['Total runs', String(summary.runs), 'cyan'], ['Success rate', `${summary.successRate}%`, summary.successRate === 100 ? 'green' : 'orange'], ['Paused', String(summary.paused).padStart(2, '0')]]} />{error && <div className="workspace-panel empty-state">{error}</div>}<div className="workflow-list">{!workflows.length && !error ? <div className="workspace-panel empty-state">No durable workflows are configured.</div> : workflows.map((flow) => <article className="workspace-panel workflow-row" key={flow.id || flow.name}><div className="workflow-summary"><span className={`state-mark ${flow.lastRun?.status || flow.lastRun?.state || flow.state}`} /><div><h3>{flow.name}</h3><p>{flow.trigger} · {flow.runs} real runs · Last: {flow.lastRun?.status || flow.lastRun?.state || 'never'}</p></div></div><div className="workflow-steps">{(flow.steps || []).map((step, i) => <div key={step.id || `${flow.id}-${i}`}><span>{i + 1}</span>{step.description || step.toolName || 'Invalid step'}</div>)}</div><button className="row-menu" disabled={running === flow.id || flow.state !== 'active'} onClick={() => run(flow.id)} aria-label={`Run ${flow.name}`}>{running === flow.id ? 'RUNNING' : 'RUN'}</button></article>)}</div></div>;
}

function GoalsWorkspace() {
  return <div className="workspace-page"><WorkspaceHeader view="goals" /><div className="workspace-panel empty-state">Durable goal records are not implemented. Use Tasks and Workflows for grounded work tracking.</div></div>;
}

function AgentsWorkspace() {
  const [runs,setRuns]=useState([]);useEffect(()=>{let mounted=true;fetch('/api/runs').then(r=>r.ok?r.json():{runs:[]}).then(data=>{if(mounted)setRuns(data.runs||[]);}).catch(()=>{});return()=>{mounted=false;};},[]);const workers=runs.filter(run=>['queued','planning','running','waiting_for_approval','paused'].includes(run.status));
  return <div className="workspace-page"><WorkspaceHeader view="agents" /><MetricStrip items={[["JARVIS identities",'01','green'],['Active workers',String(workers.length).padStart(2,'0'),'cyan'],['Historical Runs',String(runs.length)]]}/><div className="agent-grid">{!workers.length&&<div className="workspace-panel empty-state">No temporary execution workers are active. JARVIS remains the single assistant identity.</div>}{workers.map(run=><article className="workspace-panel agent-card" key={run.id}><div className="agent-orbit"><Icon name="agents" /></div><div className="agent-title"><span>{run.id.slice(-8)}</span><h3>Execution worker</h3></div><span className={`agent-state ${run.status}`}>{run.status}</span><p>{run.request}</p><div className="load-row"><span>Current step</span><b>{run.currentStep||0}/{run.steps?.length||0}</b></div></article>)}</div></div>;
}

function LegacySkillsWorkspace() {
  const [enabled, setEnabled] = useState(() => skillData.map(() => true));
  return <div className="workspace-page"><WorkspaceHeader view="skills" action={<button className="primary-action">Install skill</button>} /><div className="skill-toolbar workspace-panel"><input aria-label="Search skills" placeholder="Search installed capabilities…" /><span className="mono">{enabled.filter(Boolean).length} / {skillData.length} ENABLED</span></div><div className="skill-grid">{skillData.map(([name, description, domain, score], i) => <article className="workspace-panel skill-card" key={name}><div className="skill-glyph"><Icon name="skills" /></div><span className="card-eyebrow">{domain}</span><h3>{name}</h3><p>{description}</p><div className="skill-footer"><span>Reliability <b>{score}%</b></span><button className={`toggle${enabled[i] ? ' on' : ''}`} onClick={() => setEnabled((items) => items.map((value, x) => x === i ? !value : value))} aria-label={`Toggle ${name}`}><i /></button></div></article>)}</div></div>;
}

function LegacySettingsWorkspace() {
  const [settings, setSettings] = useState({ approvals: true, telemetry: false, motion: true, sounds: false });
  const toggle = (key) => setSettings((value) => ({ ...value, [key]: !value[key] }));
  return <div className="workspace-page"><WorkspaceHeader view="settings" action={<button className="primary-action">Save changes</button>} /><div className="settings-grid"><section className="workspace-panel settings-section"><div className="panel-label">Autonomy & safety</div>{[['approvals', 'Require approval for consequential actions', 'Shell, spending, external messages, and destructive operations'], ['telemetry', 'Share anonymous diagnostics', 'Send aggregate performance data without project content']].map(([key, title, copy]) => <div className="setting-row" key={key}><div><h3>{title}</h3><p>{copy}</p></div><button className={`toggle${settings[key] ? ' on' : ''}`} onClick={() => toggle(key)} aria-label={`Toggle ${title}`}><i /></button></div>)}</section><section className="workspace-panel settings-section"><div className="panel-label">Interface</div>{[['motion', 'Ambient motion', 'Animate HUD telemetry and neural visualizations'], ['sounds', 'Interface sounds', 'Play subtle confirmation and warning tones']].map(([key, title, copy]) => <div className="setting-row" key={key}><div><h3>{title}</h3><p>{copy}</p></div><button className={`toggle${settings[key] ? ' on' : ''}`} onClick={() => toggle(key)} aria-label={`Toggle ${title}`}><i /></button></div>)}</section><section className="workspace-panel settings-section full"><div className="panel-label">Model routing</div><div className="form-grid"><label>Primary provider<select defaultValue="groq"><option>groq</option><option>openai</option><option>anthropic</option></select></label><label>Default model<select defaultValue="gpt-oss"><option value="gpt-oss">openai/gpt-oss-120b</option><option>claude-sonnet</option></select></label><label>Context budget<input type="range" min="20" max="100" defaultValue="72" /></label></div></section></div></div>;
}

function BrowserVoicePanel() {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  function listen() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { setHeard('Speech recognition is unavailable in this browser.'); return; }
    const recognition = new Recognition(); recognition.lang = 'en-US'; recognition.onstart = () => setListening(true); recognition.onend = () => setListening(false); recognition.onerror = () => setHeard('Microphone permission or speech recognition failed.'); recognition.onresult = (event) => { const text = event.results[0][0].transcript; setHeard(text); window.speechSynthesis?.speak(new SpeechSynthesisUtterance(`JARVIS heard: ${text}`)); }; recognition.start();
  }
  return <section className="workspace-panel settings-section full"><div className="panel-label">Voice interface</div><p className="setting-help">Browser-local speech input and output; no audio leaves the browser unless a server voice adapter is configured.</p><button className="secondary-action" onClick={listen}>{listening ? 'Listening…' : 'Start voice command'}</button>{heard && <p className="setting-help">Heard: {heard}</p>}</section>;
}

function VoicePanel() {
  const [provider, setProvider] = useState('browser');
  const [values, setValues] = useState({ elevenlabs: { apiKey: '', modelId: 'eleven_multilingual_v2', voiceId: '' }, 'fish-audio': { apiKey: '', modelId: 's2-pro', voiceId: '' }, groq: { apiKey: '', modelId: 'canopylabs/orpheus-v1-english', voiceId: 'autumn' } });
  const [testText, setTestText] = useState('All JARVIS voice systems are online.');
  const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { fetch('/api/voice/tts').then((response) => response.ok ? response.json() : null).then((data) => { if (!data) return; setProvider(data.provider || 'browser'); setValues((current) => ({ elevenlabs: { ...current.elevenlabs, modelId: data.elevenlabs?.modelId || current.elevenlabs.modelId }, 'fish-audio': { ...current['fish-audio'], modelId: data.fishAudio?.modelId || current['fish-audio'].modelId }, groq: { ...current.groq, modelId: data.groq?.ttsModel || current.groq.modelId, voiceId: data.groq?.voice || current.groq.voiceId } })); }).catch(() => {}); }, []);
  const active = values[provider] || null;
  function update(key, value) { setValues((current) => ({ ...current, [provider]: { ...current[provider], [key]: value } })); }
  async function save() { setStatus('Saving…'); const payload = { TTS_PROVIDER: provider }; if (provider === 'elevenlabs') Object.assign(payload, { ELEVENLABS_API_KEY: active.apiKey, ELEVENLABS_MODEL_ID: active.modelId, ELEVENLABS_VOICE_ID: active.voiceId }); if (provider === 'fish-audio') Object.assign(payload, { FISH_AUDIO_API_KEY: active.apiKey, FISH_AUDIO_MODEL_ID: active.modelId, FISH_AUDIO_VOICE_ID: active.voiceId }); const response = await fetch('/api/config', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== ''))) }); setStatus(response.ok ? 'Saved' : 'Could not save voice settings'); if (response.ok && active) update('apiKey', ''); }
  async function testVoice() { if (provider === 'browser') { window.speechSynthesis?.speak(new SpeechSynthesisUtterance(testText)); return; } setBusy(true); setStatus('Generating speech…'); try { await save(); const response = await fetch('/api/voice/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider, text: testText, modelId: active.modelId, voiceId: active.voiceId }) }); if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.detail || data.error || 'Voice generation failed'); } const url = URL.createObjectURL(await response.blob()); const audio = new Audio(url); audio.onended = () => URL.revokeObjectURL(url); await audio.play(); setStatus('Playing'); } catch (error) { setStatus(error.message); } finally { setBusy(false); } }
  return <section className="workspace-panel settings-section full"><div className="panel-label">JARVIS voice</div><p className="setting-help">Choose browser speech or a hosted neural voice. Provider keys stay on the local JARVIS server.</p><div className="form-grid voice-grid"><label>TTS provider<select value={provider} onChange={(event) => { setProvider(event.target.value); setStatus(''); }}><option value="browser">Browser voice</option><option value="elevenlabs">ElevenLabs</option><option value="fish-audio">Fish Audio</option></select></label>{active && <><label>API key<input type="password" value={active.apiKey} onChange={(event) => update('apiKey', event.target.value)} placeholder="Enter provider API key" /></label><label>TTS model ID<input value={active.modelId} onChange={(event) => update('modelId', event.target.value)} placeholder={provider === 'elevenlabs' ? 'eleven_multilingual_v2' : 's2-pro'} /></label><label>{provider === 'elevenlabs' ? 'Voice ID' : 'Voice model / reference ID'}<input value={active.voiceId} onChange={(event) => update('voiceId', event.target.value)} placeholder="Voice identifier" /></label></>}<label className="voice-test-text">Test phrase<input value={testText} onChange={(event) => setTestText(event.target.value)} /></label></div><div className="model-actions"><button type="button" className="secondary-action" onClick={save}>Save voice</button><button type="button" className="primary-action" onClick={testVoice} disabled={busy}>{busy ? 'Generating…' : 'Test voice'}</button>{status && <span className="model-count">{status}</span>}</div></section>;
}

function LegacyBilingualVoicePanel() {
  const defaults = { elevenlabs: { apiKey: '', modelIdEn: 'eleven_multilingual_v2', modelIdHi: 'eleven_multilingual_v2', voiceId: '' }, 'fish-audio': { apiKey: '', modelIdEn: 's2-pro', modelIdHi: 's2-pro', voiceId: '' } };
  const [provider, setProvider] = useState('browser'); const [values, setValues] = useState(defaults); const [testText, setTestText] = useState('All JARVIS voice systems are online.'); const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { fetch('/api/voice/tts').then((response) => response.ok ? response.json() : null).then((data) => { if (!data) return; setProvider(data.provider || 'browser'); setValues((current) => ({ elevenlabs: { ...current.elevenlabs, modelIdEn: data.elevenlabs?.modelIdEn || current.elevenlabs.modelIdEn, modelIdHi: data.elevenlabs?.modelIdHi || current.elevenlabs.modelIdHi }, 'fish-audio': { ...current['fish-audio'], modelIdEn: data.fishAudio?.modelIdEn || current['fish-audio'].modelIdEn, modelIdHi: data.fishAudio?.modelIdHi || current['fish-audio'].modelIdHi } })); }).catch(() => {}); }, []);
  const active = values[provider]; const update = (key, value) => setValues((current) => ({ ...current, [provider]: { ...current[provider], [key]: value } }));
  async function save() { const payload = { TTS_PROVIDER: provider }; if (provider === 'elevenlabs') Object.assign(payload, { ELEVENLABS_API_KEY: active.apiKey, ELEVENLABS_MODEL_ID_EN: active.modelIdEn, ELEVENLABS_MODEL_ID_HI: active.modelIdHi, ELEVENLABS_VOICE_ID: active.voiceId }); if (provider === 'fish-audio') Object.assign(payload, { FISH_AUDIO_API_KEY: active.apiKey, FISH_AUDIO_MODEL_ID_EN: active.modelIdEn, FISH_AUDIO_MODEL_ID_HI: active.modelIdHi, FISH_AUDIO_VOICE_ID: active.voiceId }); const response = await fetch('/api/config', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.fromEntries(Object.entries(payload).filter(([, value]) => value))) }); setStatus(response.ok ? 'Saved' : 'Could not save voice settings'); return response.ok; }
  async function testVoice() { if (provider === 'browser') { window.speechSynthesis?.speak(new SpeechSynthesisUtterance(testText)); return; } setBusy(true); try { await save(); const language = /\p{Script=Devanagari}/u.test(testText) ? 'hi' : 'en'; const response = await fetch('/api/voice/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider, text: testText, language, modelId: language === 'hi' ? active.modelIdHi : active.modelIdEn, voiceId: active.voiceId }) }); if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.detail || data.error || 'Voice generation failed'); } const url = URL.createObjectURL(await response.blob()); const audio = new Audio(url); audio.onended = () => URL.revokeObjectURL(url); await audio.play(); setStatus(`Playing ${language === 'hi' ? 'Hindi' : 'English'} model`); } catch (error) { setStatus(error.message); } finally { setBusy(false); } }
  return <section className="workspace-panel settings-section full"><div className="panel-label">JARVIS voice</div><p className="setting-help">Configure separate English and Hindi synthesis models. Hindi is selected automatically for Devanagari text.</p><div className="form-grid voice-grid"><label>TTS provider<select value={provider} onChange={(event) => setProvider(event.target.value)}><option value="browser">Browser voice</option><option value="elevenlabs">ElevenLabs</option><option value="fish-audio">Fish Audio</option></select></label>{active && <><label>API key<input type="password" value={active.apiKey} onChange={(event) => update('apiKey', event.target.value)} placeholder="Enter provider API key" /></label><label>English model ID<input value={active.modelIdEn} onChange={(event) => update('modelIdEn', event.target.value)} /></label><label>Hindi model ID<input value={active.modelIdHi} onChange={(event) => update('modelIdHi', event.target.value)} /></label><label>{provider === 'elevenlabs' ? 'Voice ID' : 'Voice model / reference ID'}<input value={active.voiceId} onChange={(event) => update('voiceId', event.target.value)} placeholder="Voice identifier" /></label></>}<label className="voice-test-text">Test phrase<input value={testText} onChange={(event) => setTestText(event.target.value)} /></label></div><div className="model-actions"><button type="button" className="secondary-action" onClick={save}>Save voice</button><button type="button" className="primary-action" onClick={testVoice} disabled={busy}>{busy ? 'Generating…' : 'Test voice'}</button>{status && <span className="model-count">{status}</span>}</div></section>;
}

const CONTACT_CHANNELS = [
  ['phone', 'Phone', '+91 phone number'],
  ['whatsapp', 'WhatsApp', '+91 phone number'],
  ['instagram', 'Instagram', 'Thread / user ID'],
  ['email', 'Email', 'Email address'],
  ['discord', 'Discord', 'DM / channel ID'],
  ['telegram', 'Telegram', 'User / chat ID'],
  ['slack', 'Slack', 'DM / channel ID'],
  ['gmail', 'Gmail', 'Email address'],
];

function ContactLibraryPanel() {
  const [contacts, setContacts] = useState([]);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { let mounted = true; fetch('/api/contacts').then((response) => response.ok ? response.json() : Promise.reject(new Error('Contact library is unavailable'))).then((data) => { if (mounted) setContacts(data.contacts || []); }).catch((error) => { if (mounted) setMessage(error.message); }); return () => { mounted = false; }; }, []);
  function update(id, patch) { setContacts((items) => items.map((contact) => contact.id === id ? { ...contact, ...patch } : contact)); }
  function updateEndpoint(id, platform, value) { setContacts((items) => items.map((contact) => contact.id === id ? { ...contact, endpoints: { ...(contact.endpoints || {}), [platform]: value } } : contact)); }
  async function save(contact) {
    setBusyId(contact.id); setMessage('');
    try {
      const payload = { id: contact.id, name: contact.name, aliases: Array.isArray(contact.aliases) ? contact.aliases : String(contact.aliases || '').split(',').map((item) => item.trim()).filter(Boolean), endpoints: Object.fromEntries(Object.entries(contact.endpoints || {}).filter(([, value]) => String(value || '').trim())) };
      const response = await fetch('/api/contacts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to save contact');
      update(contact.id, data.contact); setMessage(`${data.contact.name} saved.`);
    } catch (error) { setMessage(error.message); } finally { setBusyId(''); }
  }
  return <section className="workspace-panel settings-section full contact-library"><div className="routing-head"><div><div className="panel-label">People &amp; contact aliases</div><p className="setting-help">Teach JARVIS who names such as “Papa” or “Tution Maam” refer to. Identifiers remain local. If a message request omits its platform, JARVIS asks instead of guessing.</p></div><span className="model-count">{contacts.length} SAVED PEOPLE</span></div><div className="contact-grid">{contacts.map((contact) => <article key={contact.id}><div className="contact-card-head"><label>Display name<input value={contact.name || ''} onChange={(event) => update(contact.id, { name: event.target.value })} /></label><button type="button" className="secondary-action" disabled={busyId === contact.id} onClick={() => save(contact)}>{busyId === contact.id ? 'Saving…' : 'Save'}</button></div><label>Aliases<input value={(contact.aliases || []).join(', ')} onChange={(event) => update(contact.id, { aliases: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="papa, dad" /></label><div className="contact-endpoints">{CONTACT_CHANNELS.map(([platform, label, placeholder]) => <label key={platform}>{label}<input value={contact.endpoints?.[platform] || ''} onChange={(event) => updateEndpoint(contact.id, platform, event.target.value)} placeholder={placeholder} /></label>)}</div></article>)}</div>{message && <p className="routing-summary contact-message">{message}</p>}</section>;
}

function CredentialsPanel() {
  const modelKeys = Array.from({ length: 12 }, (_, index) => `MODEL_API_KEY_${index + 1}`);
  const providerKeys = ['GROQ', 'GEMINI', 'OPENAI', 'OPENROUTER', 'OPENCODE_ZEN', 'NINEROUTER', 'CUSTOM'].flatMap((provider) => [`${provider}_API_KEY`, ...Array.from({ length: 4 }, (_, index) => `${provider}_API_KEY_${index + 1}`)]);
  const fields = [...providerKeys, 'OPENAI_CHAT_MODEL', 'GEMINI_CHAT_MODEL', 'GROQ_CHAT_MODEL', 'GROQ_STT_MODEL', 'GROQ_TTS_MODEL', 'GROQ_TTS_VOICE', 'GEMINI_IMAGE_MODEL', 'GEMINI_VIDEO_MODEL', 'TTS_PROVIDER', 'PROVIDER_FALLBACK_ORDER', 'MODEL_PROVIDER_POOLS', 'JARVIS_ROUTER_DEBUG', ...modelKeys, 'VOICE_OS_CONTROL_URL', 'VOICE_OS_CONTROL_TOKEN', 'VOICE_OS_BRIDGE_TOKEN', 'COMPOSIO_API_KEY', 'COMPOSIO_USER_ID', 'COMPOSIO_AUTH_CONFIGS', 'SLACK_BOT_TOKEN', 'SLACK_CHANNEL_ID', 'SLACK_WEBHOOK_URL', 'SEARCH_PROVIDER_URL', 'CALENDAR_API_URL', 'MESSAGING_API_URL', 'HARDWARE_ENDPOINT', 'JARVIS_AUTH_TOKEN'];
  const [values, setValues] = useState(Object.fromEntries(fields.map((key) => [key, ''])));
  const [status, setStatus] = useState({});
  useEffect(() => { fetch('/api/config').then((response) => response.ok ? response.json() : null).then((data) => data && setStatus(data)).catch(() => {}); }, []);
  async function save() { const payload = Object.fromEntries(Object.entries(values).filter(([, value]) => value)); const response = await fetch('/api/config', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); if (response.ok) { setStatus(await response.json()); setValues(Object.fromEntries(fields.map((key) => [key, '']))); } }
  return <section className="workspace-panel settings-section full"><div className="panel-label">Environment credentials</div><p className="setting-help">Values are written to the server-only credentials file and are never returned to this page. MODEL_PROVIDER_POOLS maps logical models to endpoint records whose credentialRef names a MODEL_API_KEY slot. Leave a field blank to keep its existing value.</p><div className="form-grid credential-grid">{fields.map((key) => <label key={key}>{key.replaceAll('_', ' ')}<input type={key.includes('KEY') || key.includes('TOKEN') ? 'password' : 'text'} value={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} placeholder={status[key]?.configured ? 'Configured · enter to replace' : 'Not configured'} /></label>)}</div><button className="secondary-action" onClick={save}>Save credentials</button></section>;
}

function ComposioPanel() {
  const [status, setStatus] = useState({ configured: false, toolkits: [] });
  const [accounts, setAccounts] = useState([]);
  const [message, setMessage] = useState('');
  const [projectKey, setProjectKey] = useState('');
  async function refresh() {
    const response = await fetch('/api/composio/status'); const value = response.ok ? await response.json() : { configured: false, toolkits: [] }; setStatus(value);
    if (value.configured) { const accountsResponse = await fetch('/api/composio/accounts'); if (accountsResponse.ok) setAccounts((await accountsResponse.json()).accounts || []); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => { const onFocus = () => { void refresh(); }; window.addEventListener('focus', onFocus); return () => window.removeEventListener('focus', onFocus); }, []);
  async function saveProjectKey() {
    setMessage('Validating Composio Project API key…');
    try {
      const response = await fetch('/api/composio/config', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKey: projectKey }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage(data.error || 'Composio key validation failed.'); return; }
      setProjectKey(''); setStatus(data.status); setMessage('Project API key verified. Connect is ready.'); await refresh();
    } catch (error) { setMessage(error.message || 'Composio key validation failed.'); }
  }
  async function connect(toolkit) {
    setMessage(`Preparing ${toolkit.label} connection…`); const popup = window.open('', '_blank');
    try {
      const response = await fetch('/api/composio/connect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ toolkit: toolkit.slug }) }); const data = await response.json().catch(() => ({}));
      if (!response.ok) { popup?.close(); setMessage(data.error || `Unable to connect ${toolkit.label}`); return; }
      if (!data.connection?.redirectUrl) { popup?.close(); setMessage(`Composio did not return an authorization link for ${toolkit.label}.`); return; }
      if (popup) popup.location.replace(data.connection.redirectUrl); else window.open(data.connection.redirectUrl, '_blank', 'noopener,noreferrer');
      setStatus((current) => ({ ...current, toolkits: current.toolkits.map((item) => item.slug === toolkit.slug ? { ...item, authConfigured: true } : item) }));
      setMessage(`Authorize ${toolkit.label} in the new tab, then press Refresh.`);
    } catch (error) { popup?.close(); setMessage(error.message || `Unable to connect ${toolkit.label}`); }
  }
  const accountCount = (slug) => accounts.filter((account) => String(account.toolkit || '').toLowerCase() === slug && String(account.status).toUpperCase() === 'ACTIVE').length;
  return <section className="workspace-panel settings-section full composio-panel"><div className="routing-head"><div><div className="panel-label">Composio app connections</div><p className="setting-help">Connect Gmail, Google Calendar, Discord, and Instagram without exposing their OAuth tokens to JARVIS. Managed auth is created automatically. External sends, publishing, deletion, and calendar mutations remain approval-gated.</p>{status.configurationError && <p className="routing-summary composio-message">{status.configurationError}</p>}</div><button type="button" className="secondary-action" onClick={refresh}>Refresh</button></div>{!status.connectReady && <div className="composio-key-setup"><label>Composio Project API key<input type="password" value={projectKey} onChange={(event) => setProjectKey(event.target.value)} placeholder="ak_… from Platform → Project → Settings → API Keys" /></label><button type="button" className="primary-action" disabled={!projectKey.trim()} onClick={saveProjectKey}>Save &amp; validate</button></div>}<div className="composio-grid">{status.toolkits.map((toolkit) => <article key={toolkit.slug}><div><h3>{toolkit.label}</h3><p>{toolkit.capabilities.join(' · ')}</p>{toolkit.note && <small>{toolkit.note}</small>}</div><span className={accountCount(toolkit.slug) ? 'composio-state online' : 'composio-state'}>{accountCount(toolkit.slug) ? `${accountCount(toolkit.slug)} active` : !status.connectReady && status.hasCredential ? 'Project API key required' : !status.configured ? 'API key needed' : toolkit.authConfigured ? 'Ready to connect' : 'Managed auth available'}</span><button type="button" className="secondary-action" disabled={!status.connectReady || accountCount(toolkit.slug) > 0} onClick={() => connect(toolkit)}>{accountCount(toolkit.slug) > 0 ? 'Connected' : 'Connect'}</button></article>)}</div>{message && <p className="routing-summary composio-message">{message}</p>}</section>;
}

function FunctionRoutingPanel() {
  const textPresets = { local: ['Local model', 'http://127.0.0.1:11434/v1', 'llama3.2'], openai: ['OpenAI API', 'https://api.openai.com/v1', 'gpt-5'], gemini: ['Gemini API', 'https://generativelanguage.googleapis.com/v1beta/openai', 'gemini-2.5-pro'], groq: ['Groq', 'https://api.groq.com/openai/v1', 'openai/gpt-oss-20b'], openrouter: ['OpenRouter', 'https://openrouter.ai/api/v1', 'openai/gpt-oss-20b'], 'opencode-zen': ['OpenCode Zen', 'https://opencode.ai/zen/v1', 'openai/gpt-oss-20b'], '9router': ['9router', 'https://9router.com/v1', 'openai/gpt-oss-20b'], custom: ['Custom API', '', ''] };
  const [routing, setRouting] = useState({ textProvider: 'local', textModel: 'llama3.2', textBaseUrl: textPresets.local[1], sttProvider: 'groq', sttModel: 'whisper-large-v3-turbo', ttsProvider: 'browser', ttsModel: 'canopylabs/orpheus-v1-english', ttsVoice: 'autumn' }); const [saved, setSaved] = useState(false);
  useEffect(() => { Promise.all([fetch('/api/provider').then((r) => r.ok ? r.json() : null), fetch('/api/voice/tts').then((r) => r.ok ? r.json() : null)]).then(([text, voice]) => setRouting((current) => ({ ...current, textProvider: text?.provider?.id || current.textProvider, textModel: text?.provider?.model || current.textModel, textBaseUrl: text?.provider?.baseUrl || current.textBaseUrl, sttProvider: voice?.sttProvider || current.sttProvider, sttModel: voice?.groq?.sttModel || current.sttModel, ttsProvider: voice?.provider || current.ttsProvider, ttsModel: voice?.groq?.ttsModel || current.ttsModel, ttsVoice: voice?.groq?.voice || current.ttsVoice }))).catch(() => {}); }, []);
  function chooseText(id) { const preset = textPresets[id]; setRouting((current) => ({ ...current, textProvider: id, textBaseUrl: preset[1], textModel: preset[2] })); }
  async function save() { setSaved(false); const preset = textPresets[routing.textProvider]; const providerResponse = await fetch('/api/provider', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: routing.textProvider, label: preset[0], model: routing.textModel, baseUrl: routing.textBaseUrl, configured: true }) }); const configResponse = await fetch('/api/config', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ STT_PROVIDER: routing.sttProvider, GROQ_STT_MODEL: routing.sttModel, TTS_PROVIDER: routing.ttsProvider, ...(routing.ttsProvider === 'groq' ? { GROQ_TTS_MODEL: routing.ttsModel, GROQ_TTS_VOICE: routing.ttsVoice } : {}) }) }); setSaved(providerResponse.ok && configResponse.ok); }
  return <section className="workspace-panel settings-section full function-routing"><div className="routing-head"><div><div className="panel-label">Function routing</div><p className="setting-help">Choose the provider and model used for each stage of a JARVIS interaction.</p></div><button type="button" className="primary-action" onClick={save}>Save routes {saved ? '✓' : ''}</button></div><div className="route-grid"><article><span className="route-step">01</span><h3>Voice to text</h3><label>Provider<select value={routing.sttProvider} onChange={(event) => setRouting((current) => ({ ...current, sttProvider: event.target.value }))}><option value="groq">Groq Whisper</option><option value="browser">Browser recognition</option></select></label><label>Model<input value={routing.sttModel} disabled={routing.sttProvider === 'browser'} onChange={(event) => setRouting((current) => ({ ...current, sttModel: event.target.value }))} /></label></article><article><span className="route-step">02</span><h3>Text intelligence</h3><label>Provider<select value={routing.textProvider} onChange={(event) => chooseText(event.target.value)}>{Object.entries(textPresets).map(([id, value]) => <option key={id} value={id}>{value[0]}</option>)}</select></label><label>Model<input value={routing.textModel} onChange={(event) => setRouting((current) => ({ ...current, textModel: event.target.value }))} /></label></article><article><span className="route-step">03</span><h3>Text to speech</h3><label>Provider<select value={routing.ttsProvider} onChange={(event) => setRouting((current) => ({ ...current, ttsProvider: event.target.value }))}><option value="browser">Browser voice</option><option value="groq">Groq</option><option value="elevenlabs">ElevenLabs</option><option value="fish-audio">Fish Audio</option></select></label><label>Model<input value={routing.ttsModel} disabled={routing.ttsProvider === 'browser'} onChange={(event) => setRouting((current) => ({ ...current, ttsModel: event.target.value }))} /></label></article></div></section>;
}

function ModelRoutingControl() {
  const [data, setData] = useState({ settings: { jarvisMode: 'normal', modelMode: 'auto', manualModel: 'muse-spark-1.2', manualFallbackAllowed: true, defaultBackend: 'auto', fallbackBackend: 'gemini-web', streaming: true }, models: {}, recentTelemetry: [] }); const [saved, setSaved] = useState(false);
  useEffect(() => { fetch('/api/model-routing').then((response) => response.ok ? response.json() : null).then((value) => value && setData(value)).catch(() => {}); }, []);
  async function save(settings) { setSaved(false); setData((current) => ({ ...current, settings })); const response = await fetch('/api/model-routing', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(settings) }); setSaved(response.ok); }
  const selected = data.settings.modelMode === 'auto' ? 'auto' : data.settings.manualModel; const latest = data.recentTelemetry?.[0];
  return <section className="workspace-panel settings-section full model-routing-control"><div><div className="panel-label">JARVIS intelligence mode</div><p className="setting-help">Every brain uses the same canonical JARVIS tools, permissions, approvals, Runs and verification.</p></div><label>Mode<select value={data.settings.jarvisMode || 'normal'} onChange={(event) => void save({ ...data.settings, jarvisMode: event.target.value, modelMode: 'auto' })}><option value="normal">Normal · Muse Spark 1.2</option><option value="coding">Coding · Laguna S 2.1</option><option value="deepthinking">Deep Thinking · GLM-5.2</option></select></label><label>Default browser brain<select value={data.settings.defaultBackend || 'auto'} onChange={(event) => void save({ ...data.settings, defaultBackend: event.target.value })}><option value="auto">Automatic / API routing</option><option value="chatgpt-web">ChatGPT Headless</option><option value="gemini-web">Gemini Headless</option></select></label><label>Browser-brain fallback<select value={data.settings.fallbackBackend || 'none'} onChange={(event) => void save({ ...data.settings, fallbackBackend: event.target.value })}><option value="none">No fallback</option><option value="chatgpt-web">ChatGPT Headless</option><option value="gemini-web">Gemini Headless</option><option value="api">Existing API model pool</option></select></label><label>Model override<select value={selected} onChange={(event) => { const value = event.target.value; void save({ ...data.settings, modelMode: value === 'auto' ? 'auto' : 'manual', manualModel: value === 'auto' ? data.settings.manualModel : value }); }}><option value="auto">Auto within mode</option>{Object.entries(data.models).map(([id, model]) => <option key={id} value={id}>{model.label}</option>)}</select></label><label className="check-control"><input type="checkbox" checked={data.settings.streaming !== false} onChange={(event) => void save({ ...data.settings, streaming: event.target.checked })} /> Stream model text and real tool activity</label><label className="check-control"><input type="checkbox" checked={data.settings.manualFallbackAllowed} onChange={(event) => void save({ ...data.settings, manualFallbackAllowed: event.target.checked })} /> Allow configured fallback</label><div className="routing-summary">{saved ? 'Saved · ' : ''}{latest ? `Last handled by ${data.models[latest.finalModel]?.label || latest.finalModel}` : 'No model routing recorded yet'}</div></section>;
}

function ChatGPTWebPanel() {
  const [status, setStatus] = useState({ enabled: false, useAsDefault: false, status: 'STOPPED', browser: 'STOPPED', authenticated: false, mode: 'HEADLESS', session: 'NONE', experimental: true });
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState('');
  async function refresh() { const response = await fetch('/api/chatgpt-web/status'); const data = await response.json().catch(() => ({})); if (response.ok) setStatus(data); else setMessage(data.error || 'Status unavailable.'); }
  useEffect(() => { void refresh(); const timer = window.setInterval(refresh, 5000); return () => window.clearInterval(timer); }, []);
  async function action(name, url, method = 'POST', body) { setBusy(name); setMessage(''); try { const response = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error?.message || data.error || 'Request failed.'); setMessage(name === 'login' ? 'A normal private-profile browser opened. Sign in, close that browser window, then click Verify login.' : name === 'verify' ? 'ChatGPT login verified. Headless mode is ready.' : name === 'reset' ? 'Conversation reset. The next request starts a fresh ChatGPT thread.' : 'Saved.'); await refresh(); } catch (error) { setMessage(error.message); } finally { setBusy(''); } }
  const save = (changes) => action('save', '/api/chatgpt-web/settings', 'PATCH', { enabled: status.enabled, useAsDefault: status.useAsDefault, ...changes });
  return <section className="workspace-panel settings-section full chatgpt-web-panel"><div className="routing-head"><div><div className="panel-label">ChatGPT Web brain <span className="field-hint">Experimental</span></div><p className="setting-help">Uses a private persistent browser profile and the consumer ChatGPT website. JARVIS keeps control of every local tool, approval, and verification. No OpenAI API key is used.</p></div><button type="button" className="secondary-action" disabled={Boolean(busy)} onClick={refresh}>Refresh</button></div><div className="context-grid"><div className="context-stat"><span>Browser</span><b>{status.browser}</b></div><div className="context-stat"><span>Authentication</span><b>{status.authenticated ? 'SIGNED IN' : 'REQUIRED'}</b></div><div className="context-stat"><span>Worker</span><b>{status.status}</b></div><div className="context-stat"><span>Session</span><b>{status.session}</b></div></div><div className="model-actions"><button type="button" className="primary-action" disabled={Boolean(busy)} onClick={() => action('login', '/api/chatgpt-web/auth/start')}>{busy === 'login' ? 'Opening…' : 'Open normal login'}</button><button type="button" className="secondary-action" disabled={Boolean(busy) || status.browser !== 'STOPPED'} onClick={() => action('verify', '/api/chatgpt-web/auth/check')}>{busy === 'verify' ? 'Checking…' : 'Verify login'}</button><button type="button" className="secondary-action" disabled={Boolean(busy) || !status.authenticated} onClick={() => action('reset', '/api/chatgpt-web/session/reset')}>New session</button><label className="check-control"><input type="checkbox" checked={status.enabled} onChange={(event) => { setStatus((current) => ({ ...current, enabled: event.target.checked })); void save({ enabled: event.target.checked }); }} /> Enable brain</label><label className="check-control"><input type="checkbox" checked={status.useAsDefault} disabled={!status.enabled} onChange={(event) => { setStatus((current) => ({ ...current, useAsDefault: event.target.checked })); void save({ useAsDefault: event.target.checked }); }} /> Use for general requests</label></div>{message && <p className="routing-summary composio-message">{message}</p>}<p className="signin-footnote">Authentication opens a normal browser because Google rejects automated sign-in windows. Sign in, close it, then verify. JARVIS never automates your password or bypasses Google security.</p></section>;
}

function GeminiWebPanel() {
  const [status, setStatus] = useState({ enabled: false, status: 'STOPPED', browser: 'STOPPED', authenticated: false, mode: 'HEADLESS', session: 'NONE', toolAccess: true, streaming: true });
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState('');
  async function refresh() { const response = await fetch('/api/gemini-web/status'); const data = await response.json().catch(() => ({})); if (response.ok) setStatus(data); else setMessage(data.error || 'Status unavailable.'); }
  useEffect(() => { void refresh(); const timer = window.setInterval(refresh, 5000); return () => window.clearInterval(timer); }, []);
  async function action(name, url, method = 'POST', body) { setBusy(name); setMessage(''); try { const response = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error?.message || data.error || 'Request failed.'); setMessage(name === 'login' ? 'A normal browser opened. Sign in to Gemini, close it, then verify.' : name === 'verify' ? 'Gemini login verified. Headless mode is ready.' : name === 'reset' ? 'The next request starts a fresh Gemini conversation.' : 'Saved.'); await refresh(); } catch (error) { setMessage(error.message); } finally { setBusy(''); } }
  return <section className="workspace-panel settings-section full chatgpt-web-panel"><div className="routing-head"><div><div className="panel-label">Gemini Headless <span className="field-hint">Experimental</span></div><p className="setting-help">Uses a separate persistent Google browser profile. Tool requests are validated and executed only by the canonical JARVIS runtime.</p></div><button type="button" className="secondary-action" disabled={Boolean(busy)} onClick={refresh}>Refresh</button></div><div className="context-grid"><div className="context-stat"><span>Browser</span><b>{status.browser}</b></div><div className="context-stat"><span>Authentication</span><b>{status.authenticated ? 'SIGNED IN' : 'REQUIRED'}</b></div><div className="context-stat"><span>Worker</span><b>{status.status}</b></div><div className="context-stat"><span>Tools / stream</span><b>{status.toolAccess && status.streaming ? 'READY' : 'DISABLED'}</b></div></div><div className="model-actions"><button type="button" className="primary-action" disabled={Boolean(busy)} onClick={() => action('login', '/api/gemini-web/auth/start')}>{busy === 'login' ? 'Opening…' : 'Open normal login'}</button><button type="button" className="secondary-action" disabled={Boolean(busy) || status.browser !== 'STOPPED'} onClick={() => action('verify', '/api/gemini-web/auth/check')}>{busy === 'verify' ? 'Checking…' : 'Verify login'}</button><button type="button" className="secondary-action" disabled={Boolean(busy) || !status.authenticated} onClick={() => action('reset', '/api/gemini-web/session/reset')}>New session</button><label className="check-control"><input type="checkbox" checked={status.enabled} onChange={(event) => { const enabled = event.target.checked; setStatus((current) => ({ ...current, enabled })); void action('save', '/api/gemini-web/settings', 'PATCH', { enabled }); }} /> Enable brain</label></div>{message && <p className="routing-summary composio-message">{message}</p>}<p className="signin-footnote">JARVIS does not automate passwords, CAPTCHA, account challenges, cookies, or security bypasses.</p></section>;
}

function AppearanceOnlyPanel() {
  const [appearance, setAppearance] = useAppearance();
  return <section className="workspace-panel settings-section full appearance-panel"><div className="panel-label">Appearance</div><p className="setting-help">Personalize the interface locally. Changes persist in this browser.</p><div className="form-grid appearance-grid"><label>Theme<select value={appearance.theme} onChange={(event) => setAppearance((current) => ({ ...current, theme: event.target.value }))}><option value="carbon">Carbon / amber</option><option value="midnight">Midnight / cyan</option><option value="light">Light / amber</option></select></label><label>Font size <span className="range-value">{appearance.fontSize}px</span><input type="range" min="13" max="20" value={appearance.fontSize} onChange={(event) => setAppearance((current) => ({ ...current, fontSize: Number(event.target.value) }))} /></label><label>Accent colour<div className="colour-control"><input type="color" value={appearance.accent} onChange={(event) => setAppearance((current) => ({ ...current, accent: event.target.value }))} /><code>{appearance.accent.toUpperCase()}</code></div></label></div></section>;
}

function VoiceOsPanel() {
  const [value, setValue] = useState({ enabled: true, topIsland: true, globalHotkeys: false, pushToTalkKey: 'Alt', dictationKey: 'Ctrl+Shift', notifications: { enabled: false, allApps: true, apps: [] } });
  const [supportedApps, setSupportedApps] = useState(['gmail', 'whatsapp', 'slack', 'discord', 'instagram', 'calendar']);
  const [bridge, setBridge] = useState({ available: false, running: false });
  const [controlConfigured, setControlConfigured] = useState(false);
  const [message, setMessage] = useState('');
  async function refresh() { const response = await fetch('/api/voice-os/settings'); if (!response.ok) return; const data = await response.json(); setValue(data.settings); setSupportedApps(data.supportedApps || []); setBridge(data.platformBridge || data.windowsBridge || {}); setControlConfigured(Boolean(data.browserControlConfigured)); }
  useEffect(() => { void refresh(); }, []);
  async function save(next = value) { setMessage('Saving…'); const response = await fetch('/api/voice-os/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) }); const data = await response.json().catch(() => ({})); if (!response.ok) { setMessage(data.error || 'Could not save Voice OS settings'); return; } setValue(data.settings); setMessage('Saved'); window.dispatchEvent(new CustomEvent('jarvis:voice-settings')); }
  async function enableNotifications() { if (!('Notification' in window)) { setMessage('Windows browser notifications are unavailable.'); return; } const permission = await Notification.requestPermission(); if (permission !== 'granted') { setMessage('Notification permission was not granted.'); return; } const next = { ...value, notifications: { ...value.notifications, enabled: true } }; setValue(next); await save(next); new Notification('JARVIS notifications enabled', { body: 'Only your selected app sources will appear.' }); }
  async function startBridge() { setMessage('Starting Windows hotkeys…'); const response = await fetch('/api/voice-os/bridge/start', { method: 'POST' }); const data = await response.json().catch(() => ({})); if (!response.ok) { setMessage(data.error || 'Could not start Windows bridge'); return; } setMessage(`Global ${value.pushToTalkKey} and ${value.dictationKey} hotkeys are active.`); setBridge((current) => ({ ...current, running: true })); const next = { ...value, globalHotkeys: true }; setValue(next); await save(next); }
  function toggleApp(app) { setValue((current) => ({ ...current, notifications: { ...current.notifications, apps: current.notifications.apps.includes(app) ? current.notifications.apps.filter((item) => item !== app) : [...current.notifications.apps, app] } })); }
  const toggle = (key) => setValue((current) => ({ ...current, [key]: !current[key] }));
  const notificationsGranted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
  return <section className="workspace-panel settings-section full voice-os-settings"><div className="routing-head"><div><div className="panel-label">Voice OS</div><p className="setting-help">A compact top island, configurable hold-to-talk and dictation shortcuts, and grounded communication controls. Browser hotkeys work while JARVIS is focused; native global hotkeys depend on platform support.</p></div><button type="button" className="primary-action" onClick={() => save()}>Save Voice OS</button></div><div className="voice-os-control-grid"><article><div className="setting-row"><div><h3>Voice OS</h3><p>Enable push-to-talk and dictation.</p></div><button className={`toggle${value.enabled ? ' on' : ''}`} onClick={() => toggle('enabled')}><i /></button></div><div className="setting-row"><div><h3>Compact top island</h3><p>Show listening, transcription, calls, and action status.</p></div><button className={`toggle${value.topIsland ? ' on' : ''}`} onClick={() => toggle('topIsland')}><i /></button></div></article><article><h3>Platform shortcuts</h3><p className="setting-help"><kbd>{value.pushToTalkKey}</kbd> hold to talk · <kbd>{value.dictationKey}</kbd> toggle dictation</p><div className="bridge-status"><span className={`dot ${bridge.running ? 'green' : 'red'}`} />{bridge.running ? 'Global bridge running' : bridge.available ? 'Browser-only hotkeys' : `${bridge.platform || 'Platform'} global bridge unavailable`}</div>{bridge.available && !bridge.running && <button type="button" className="secondary-action" onClick={startBridge}>Enable global hotkeys</button>}{bridge.lastError && <p className="setting-help">{bridge.lastError}</p>}<p className="setting-help">Communication control: {controlConfigured ? 'connected' : 'not configured · call answering requires a connected control bridge'}</p></article></div><div className="notification-settings"><div className="routing-head"><div><h3>Notifications</h3><p className="setting-help">Show only real events received from connected apps or the communication bridge.</p></div><button type="button" className="secondary-action" onClick={enableNotifications}>{value.notifications.enabled && notificationsGranted ? 'Notifications enabled' : 'Enable notifications'}</button></div><label className="check-control"><input type="checkbox" checked={value.notifications.allApps} onChange={(event) => setValue((current) => ({ ...current, notifications: { ...current.notifications, allApps: event.target.checked } }))} /> Notify me for all connected apps</label>{!value.notifications.allApps && <div className="notification-apps">{supportedApps.map((app) => <label key={app} className="check-control"><input type="checkbox" checked={value.notifications.apps.includes(app)} onChange={() => toggleApp(app)} /> {app}</label>)}</div>}</div>{message && <p className="routing-summary composio-message">{message}</p>}</section>;
}

function AppearancePanel() {
  return <><AppearanceOnlyPanel /><VoiceOsPanel /><VoiceShortcutPanel /></>;
}

function VoiceShortcutPanel() {
  const [settings, setSettings] = useState({ pushToTalkKey: 'Alt', dictationKey: 'Ctrl+Shift' });
  const [message, setMessage] = useState('');
  useEffect(() => { fetch('/api/voice-os/settings').then((response) => response.ok ? response.json() : null).then((data) => { if (data?.settings) setSettings(data.settings); }).catch(() => {}); }, []);
  async function save() { if (settings.pushToTalkKey === settings.dictationKey) { setMessage('Talk and dictation need different shortcuts.'); return; } setMessage('Saving...'); const response = await fetch('/api/voice-os/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pushToTalkKey: settings.pushToTalkKey, dictationKey: settings.dictationKey }) }); const data = await response.json().catch(() => ({})); if (response.ok) { setSettings(data.settings); setMessage('Saved. The global bridge has reloaded both shortcuts.'); window.dispatchEvent(new CustomEvent('jarvis:voice-settings')); } else setMessage(data.error || 'Could not save shortcuts'); }
  return <section className="workspace-panel settings-section full shortcut-editor"><div className="routing-head"><div><div className="panel-label">Voice shortcuts</div><p className="setting-help">Click a control, hold every key in the combination together, then release one key. Escape cancels recording.</p></div><button type="button" className="primary-action" onClick={save}>Save shortcuts</button></div><div className="shortcut-recorder-grid"><ShortcutRecorder label="Hold to talk" description="JARVIS listens until you release any key in the shortcut." value={settings.pushToTalkKey} onChange={(value) => setSettings((current) => ({ ...current, pushToTalkKey: value }))} /><ShortcutRecorder label="Toggle dictation" description="Press the full shortcut once to start dictating, then again to stop." value={settings.dictationKey} onChange={(value) => setSettings((current) => ({ ...current, dictationKey: value }))} /></div><p className="shortcut-caution"><strong>Fn cannot be assigned on standard Windows keyboards.</strong> It is normally handled inside the keyboard and never reaches JARVIS. Use a detectable combination such as Ctrl + Alt, Ctrl + Space, Win + Shift, or Ctrl + F12. JARVIS never blocks global key events, preventing stuck Ctrl, Shift, Alt, Win, or Caps Lock state.</p>{message && <p className="routing-summary composio-message">{message}</p>}</section>;
}

function ShortcutRecorder({ label, description, value, onChange }) {
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState('');
  const [captureError, setCaptureError] = useState('');
  const previewRef = useRef('');
  const chordRef = useRef([]);
  useEffect(() => {
    if (!recording) return undefined;
    document.documentElement.dataset.shortcutRecording = 'true';
    const keyName = (event) => { if (event.key === 'Fn' || event.code === 'Fn') return '__FN__'; if (event.key === 'Control') return 'Ctrl'; if (event.key === 'Meta') return 'Win'; if (event.key === ' ') return 'Space'; if (/^[a-z0-9]$/i.test(event.key)) return event.key.toUpperCase(); if (/^F(?:[1-9]|1\d|2[0-4])$/i.test(event.key)) return event.key.toUpperCase(); return ['Shift', 'Alt'].includes(event.key) ? event.key : null; };
    const normalizedChord = () => { const modifiers = ['Ctrl', 'Shift', 'Alt', 'Win'].filter((key) => chordRef.current.includes(key)); const primary = chordRef.current.filter((key) => !modifiers.includes(key)); return [...modifiers, ...primary].join('+'); };
    const down = (event) => { event.preventDefault(); event.stopImmediatePropagation(); if (event.key === 'Escape') { chordRef.current = []; setRecording(false); setPreview(''); setCaptureError(''); return; } const current = keyName(event); if (current === '__FN__') { setCaptureError('Fn is handled by keyboard firmware and cannot be detected reliably. Choose another key.'); return; } if (!current || event.repeat) return; if (!chordRef.current.includes(current)) chordRef.current = [...chordRef.current, current]; const next = normalizedChord(); previewRef.current = next; setPreview(next); };
    const up = (event) => { event.preventDefault(); event.stopImmediatePropagation(); const current = keyName(event); if (!current || current === '__FN__' || !previewRef.current) return; const candidate = previewRef.current; chordRef.current = []; setRecording(false); if (['Ctrl', 'Shift', 'Win'].includes(candidate)) { setCaptureError(`Only ${candidate} reached Windows. Fn is not detectable; hold a supported second key such as Alt, Space, F12, or J.`); setPreview(''); return; } setCaptureError(''); onChange(candidate); };
    window.addEventListener('keydown', down, true); window.addEventListener('keyup', up, true);
    return () => { delete document.documentElement.dataset.shortcutRecording; window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); };
  }, [onChange, recording]);
  const shown = recording ? preview || 'Press shortcut...' : value;
  return <article className={`shortcut-recorder${recording ? ' recording' : ''}`}><div><h3>{label}</h3><p>{description}</p></div><button type="button" data-shortcut-recorder aria-pressed={recording} onClick={() => { chordRef.current = []; previewRef.current = ''; setPreview(''); setCaptureError(''); setRecording(true); }}>{shown.split('+').map((key) => <kbd key={key}>{key}</kbd>)}</button><span className={captureError ? 'shortcut-error' : ''}>{captureError || (recording ? 'Hold the full shortcut, then release' : 'Click to change')}</span></article>;
}

function LegacyProviderSettingsWorkspace() {
  const [provider, setProvider] = useState({ id: 'local', label: 'Local model', model: 'llama3.2', baseUrl: 'http://127.0.0.1:11434/v1', configured: false });
  const [saved, setSaved] = useState(false);
  useEffect(() => { fetch('/api/provider').then((response) => response.ok ? response.json() : null).then((data) => data?.provider && setProvider(data.provider)).catch(() => {}); }, []);
  async function saveProvider() {
    setSaved(false);
    try { const response = await fetch('/api/provider', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...provider, configured: true }) }); const data = await response.json(); if (data.provider) setProvider(data.provider); setSaved(true); } catch {}
  }
  const options = [
    ['local', 'Local model', 'Ollama / LM Studio / OpenAI-compatible local endpoint'],
    ['openrouter', 'OpenRouter', 'Hosted model routing via OPENROUTER_API_KEY'],
    ['opencode-zen', 'OpenCode Zen', 'Hosted model routing via OPENCODE_ZEN_API_KEY'],
    ['9router', '9router', 'Self-hosted or hosted router adapter'],
    ['custom', 'Custom API', 'Any OpenAI-compatible base URL'],
  ];
  return <div className="workspace-page"><WorkspaceHeader view="settings" action={<button className="primary-action" onClick={saveProvider}>Save provider {saved ? '✓' : ''}</button>} /><div className="settings-grid"><section className="workspace-panel settings-section full"><div className="panel-label">Model routing</div><div className="form-grid"><label>Provider<select value={provider.id} onChange={(event) => { const id = event.target.value; const option = options.find((item) => item[0] === id); setProvider((current) => ({ ...current, id, label: option?.[1] || id, configured: false })); }}>{options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>Model<input value={provider.model || ''} onChange={(event) => setProvider((current) => ({ ...current, model: event.target.value }))} placeholder="llama3.2 / openai/gpt-4o-mini" /></label><label>API base URL<input value={provider.baseUrl || ''} onChange={(event) => setProvider((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://.../v1" /></label></div><p className="setting-help">{options.find((item) => item[0] === provider.id)?.[2]}. API keys stay server-side in environment variables and are never returned to the browser.</p></section><CredentialsPanel /><VoicePanel /><LegacySettingsWorkspace /></div></div>;
}

const PROVIDER_PRESETS = {
  local: { label: 'Local model', baseUrl: 'http://127.0.0.1:11434/v1', keyName: '' },
  openai: { label: 'OpenAI API', baseUrl: 'https://api.openai.com/v1', keyName: 'OPENAI_API_KEY' },
  gemini: { label: 'Gemini API', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', keyName: 'GEMINI_API_KEY' },
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', keyName: 'OPENROUTER_API_KEY' },
  groq: { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', keyName: 'GROQ_API_KEY' },
  'opencode-zen': { label: 'OpenCode Zen', baseUrl: 'https://opencode.ai/zen/v1', keyName: 'OPENCODE_ZEN_API_KEY' },
  '9router': { label: '9router', baseUrl: 'https://9router.com/v1', keyName: 'NINEROUTER_API_KEY' },
  custom: { label: 'Custom API', baseUrl: '', keyName: 'CUSTOM_API_KEY' },
};

function SettingsWorkspace() {
  const [provider, setProvider] = useState({ id: 'local', label: 'Local model', model: 'llama3.2', baseUrl: PROVIDER_PRESETS.local.baseUrl, configured: false });
  const [apiKey, setApiKey] = useState(''); const [models, setModels] = useState([]); const [freeOnly, setFreeOnly] = useState(false); const [loadingModels, setLoadingModels] = useState(false); const [modelError, setModelError] = useState(''); const [saved, setSaved] = useState(false);
  useEffect(() => { fetch('/api/provider').then((response) => response.ok ? response.json() : null).then((data) => data?.provider && setProvider(data.provider)).catch(() => {}); }, []);
  function selectProvider(id) { const preset = PROVIDER_PRESETS[id]; setProvider((current) => ({ ...current, id, label: preset.label, baseUrl: preset.baseUrl, configured: false })); setModels([]); setModelError(''); }
  async function saveProvider() { setSaved(false); const response = await fetch('/api/provider', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...provider, configured: true }) }); if (response.ok) { const data = await response.json(); if (data.provider) setProvider(data.provider); const keyName = PROVIDER_PRESETS[provider.id]?.keyName; if ((apiKey && keyName) || provider.id === 'groq') await fetch('/api/config', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...(apiKey && keyName ? { [keyName]: apiKey } : {}), ...(provider.id === 'groq' ? { TTS_PROVIDER: 'groq' } : {}) }) }); setApiKey(''); setSaved(true); } }
  async function fetchModels() { setLoadingModels(true); setModelError(''); try { const keyName = PROVIDER_PRESETS[provider.id]?.keyName; await fetch('/api/provider', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...provider, configured: true }) }); if (apiKey && keyName) await fetch('/api/config', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ [keyName]: apiKey }) }); const response = await fetch('/api/provider/models'); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to fetch models'); setModels((data.models || []).map((model) => ({ ...model, free: Boolean(model.free || /(^|:)free($|\b)/i.test(model.id || '') || /free/i.test(model.name || '')) }))); } catch (error) { setModelError(error.message); setModels([]); } finally { setLoadingModels(false); } }
  const visibleModels = models.filter((model) => !freeOnly || model.free);
  return <div className="workspace-page"><WorkspaceHeader view="settings" action={<button type="button" className="primary-action" onClick={saveProvider}>Save provider {saved ? '✓' : ''}</button>} /><div className="settings-grid"><AppearancePanel /><section className="workspace-panel settings-section full"><div className="panel-label">Model routing</div><div className="form-grid provider-grid"><label>Provider<select value={provider.id} onChange={(event) => selectProvider(event.target.value)}>{Object.entries(PROVIDER_PRESETS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select></label><label>Model<select value={provider.model || ''} onChange={(event) => setProvider((current) => ({ ...current, model: event.target.value }))}><option value="">Select a model</option>{visibleModels.map((model) => <option key={model.id} value={model.id}>{model.name}{model.free ? ' · FREE' : ''}</option>)}</select><input value={provider.model || ''} onChange={(event) => setProvider((current) => ({ ...current, model: event.target.value }))} placeholder="Or enter a model ID" /></label><label>API base URL<input value={provider.baseUrl || ''} readOnly={provider.id !== 'custom' && provider.id !== 'local'} onChange={(event) => setProvider((current) => ({ ...current, baseUrl: event.target.value }))} /></label><label>API key {PROVIDER_PRESETS[provider.id]?.keyName && <span className="field-hint">{PROVIDER_PRESETS[provider.id].keyName}</span>}<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Enter key for this provider" /></label></div><div className="model-actions"><button type="button" className="secondary-action" onClick={fetchModels} disabled={loadingModels}>{loadingModels ? 'Fetching…' : 'Fetch models'}</button><label className="check-control"><input type="checkbox" checked={freeOnly} onChange={(event) => setFreeOnly(event.target.checked)} /> Free models only</label><span className="model-count">{models.length ? `${visibleModels.length} models` : 'No models loaded'}</span></div>{modelError && <p className="form-error">{modelError}</p>}<p className="setting-help">Preset providers use their standard endpoint automatically. API keys are stored server-side and never displayed after saving.</p></section><CredentialsPanel /><VoicePanel /><LegacySettingsWorkspace /></div></div>;
}

function ChatWorkspace(){const[state,setState]=useState({messages:[],runs:[],tools:[]});useEffect(()=>{let mounted=true;Promise.all([fetch('/api/chats').then(r=>r.ok?r.json():{messages:[]}),fetch('/api/runs').then(r=>r.ok?r.json():{runs:[]}),fetch('/api/tools').then(r=>r.ok?r.json():{tools:[]})]).then(([chats,runs,tools])=>{if(mounted)setState({messages:chats.messages||[],runs:runs.runs||[],tools:tools.tools||[]});}).catch(()=>{});return()=>{mounted=false;};},[]);const recent=state.messages.filter(item=>item.who==='YOU').slice(-4).reverse();const active=state.runs.filter(run=>['queued','planning','running','waiting_for_approval','paused'].includes(run.status));return <div className="workspace-page"><WorkspaceHeader view="chat"/><div className="chat-workspace-grid"><aside className="workspace-panel conversation-list"><div className="panel-label">Recent requests</div>{!recent.length&&<div className="empty-state">No saved conversations.</div>}{recent.map((item,i)=><div className="conversation-row" key={`${item.time}-${i}`}><span>{String(item.lines?.[0]||'Request').slice(0,42)}</span><small>{new Date(item.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div>)}</aside><Chat/><aside className="workspace-panel context-rail"><div className="panel-label">Runtime context</div><div className="context-stat"><span>Saved messages</span><b>{state.messages.length}</b></div><div className="context-stat"><span>Active Runs</span><b>{active.length}</b></div><div className="context-stat"><span>Tools available</span><b>{state.tools.filter(tool=>tool.enabled).length}</b></div><div className="context-note">Counts come from the current backend. Context is selected per request.</div></aside></div></div>;}
function TasksWorkspace(){return <div className="workspace-page"><WorkspaceHeader view="tasks"/><div className="workspace-panel expanded-list"><Tasks/></div></div>;}
function ApprovalsWorkspace(){const[pending,setPending]=useState([]);useEffect(()=>{let mounted=true;fetch('/api/approvals').then(r=>r.ok?r.json():{approvals:[]}).then(data=>{if(mounted)setPending(data.approvals||[]);}).catch(()=>{});return()=>{mounted=false;};},[]);return <div className="workspace-page"><WorkspaceHeader view="approvals"/><MetricStrip items={[["Pending",String(pending.length).padStart(2,'0')],["Destructive",String(pending.filter(item=>String(item.risk).toUpperCase()==='DESTRUCTIVE').length).padStart(2,'0'),'red']]}/><div className="workspace-panel expanded-list"><Approvals/></div></div>;}
function ConnectionsWorkspace(){const[connections,setConnections]=useState([]);const[error,setError]=useState('');useEffect(()=>{let mounted=true;Promise.all([fetch('/api/connections').then(r=>r.ok?r.json():Promise.reject()),fetch('/api/composio/status').then(r=>r.ok?r.json():null)]).then(([data,composio])=>{if(!mounted)return;const apps=(composio?.toolkits||[]).map(item=>({id:`composio-${item.slug}`,name:item.label,detail:`Composio: ${item.capabilities.join(', ')}`,status:item.connected?'configured':composio.connectReady?'ready to connect':'configuration required'}));setConnections([...(data.connections||[]),...apps]);}).catch(()=>{if(mounted)setError('Connection status is unavailable.');});return()=>{mounted=false;};},[]);const configured=connections.filter(item=>item.status==='configured').length;return <div className="workspace-page"><WorkspaceHeader view="connections"/><MetricStrip items={[["Reported",String(connections.length).padStart(2,'0')],["Configured",String(configured).padStart(2,'0'),'green']]}/><div className="card-grid">{!connections.length&&<div className="workspace-panel empty-state">{error||'No connection status reported.'}</div>}{connections.map(connection=><article className="workspace-panel data-card connection-card" key={connection.id||connection.name}><div className="card-icon"><Icon name={connection.id==='local'?'terminal':'connections'}/></div><div><h3>{connection.name}</h3><p>{connection.detail||connection.kind}</p></div><div className="card-meta"><span>{connection.status}</span></div></article>)}</div></div>;}
function SkillsWorkspace(){const[tools,setTools]=useState([]);const[query,setQuery]=useState('');useEffect(()=>{let mounted=true;fetch('/api/tools').then(r=>r.ok?r.json():{tools:[]}).then(data=>{if(mounted)setTools(data.tools||[]);}).catch(()=>{});return()=>{mounted=false;};},[]);const visible=tools.filter(tool=>`${tool.id} ${tool.description} ${tool.module}`.toLowerCase().includes(query.toLowerCase()));return <div className="workspace-page"><WorkspaceHeader view="skills"/><div className="skill-toolbar workspace-panel"><input aria-label="Search capabilities" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search canonical capabilities"/><span className="mono">{tools.filter(tool=>tool.enabled).length} / {tools.length} ENABLED</span></div><div className="skill-grid">{visible.map(tool=><article className="workspace-panel skill-card" key={tool.id}><div className="skill-glyph"><Icon name="skills"/></div><span className="card-eyebrow">{tool.module}</span><h3>{tool.name}</h3><p>{tool.description}</p><div className="skill-footer"><span>{tool.riskLevel}</span><b>{tool.enabled?'AVAILABLE':'DISABLED'}</b></div></article>)}</div></div>;}

function ProviderSetupPanel() {
  const [provider, setProvider] = useState({ id: 'local', label: 'Local model', model: 'llama3.2', baseUrl: PROVIDER_PRESETS.local.baseUrl, configured: false });
  const [apiKey, setApiKey] = useState(''); const [models, setModels] = useState([]); const [freeOnly, setFreeOnly] = useState(false); const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { fetch('/api/provider').then((response) => response.ok ? response.json() : null).then((data) => data?.provider && setProvider(data.provider)).catch(() => setStatus('Provider state is unavailable.')); }, []);
  function choose(id) { const preset = PROVIDER_PRESETS[id]; setProvider((current) => ({ ...current, id, label: preset.label, baseUrl: preset.baseUrl, model: '', configured: false })); setModels([]); setStatus(''); }
  async function persist() { const selected = PROVIDER_PRESETS[provider.id]; const providerResponse = await fetch('/api/provider', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...provider, configured: true }) }); if (!providerResponse.ok) throw new Error('Unable to save provider settings.'); if (apiKey && selected?.keyName) { const keyResponse = await fetch('/api/config', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ [selected.keyName]: apiKey }) }); if (!keyResponse.ok) throw new Error('Unable to store provider credential.'); } setApiKey(''); }
  async function save() { setBusy(true); setStatus('Saving…'); try { await persist(); setStatus('Provider saved.'); } catch (error) { setStatus(error.message); } finally { setBusy(false); } }
  async function fetchModels() { setBusy(true); setStatus('Fetching available models…'); try { await persist(); const response = await fetch('/api/provider/models'); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Unable to fetch models.'); setModels((data.models || []).map((model) => ({ ...model, free: Boolean(model.free || /(^|:)free($|\b)/i.test(model.id || '') || /free/i.test(model.name || '')) }))); setStatus(`${data.models?.length || 0} models loaded.`); } catch (error) { setModels([]); setStatus(error.message); } finally { setBusy(false); } }
  const visible = models.filter((model) => !freeOnly || model.free);
  return <section className="workspace-panel settings-section full"><div className="routing-head"><div><div className="panel-label">Provider endpoint</div><p className="setting-help">Choose a provider, fetch its real catalog, and select the model used by the configured text route.</p></div><button type="button" className="primary-action" disabled={busy} onClick={save}>Save provider</button></div><div className="form-grid provider-grid"><label>Provider<select value={provider.id} onChange={(event) => choose(event.target.value)}>{Object.entries(PROVIDER_PRESETS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select></label><label>Model<select value={provider.model || ''} onChange={(event) => setProvider((current) => ({ ...current, model: event.target.value }))}><option value="">Select a model</option>{visible.map((model) => <option key={model.id} value={model.id}>{model.name}{model.free ? ' · FREE' : ''}</option>)}</select><input value={provider.model || ''} onChange={(event) => setProvider((current) => ({ ...current, model: event.target.value }))} placeholder="Or enter a model ID" /></label><label>API base URL<input value={provider.baseUrl || ''} readOnly={provider.id !== 'custom' && provider.id !== 'local'} onChange={(event) => setProvider((current) => ({ ...current, baseUrl: event.target.value }))} /></label><label>API key<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={PROVIDER_PRESETS[provider.id]?.keyName || 'Not required'} /></label></div><div className="model-actions"><button type="button" className="secondary-action" disabled={busy} onClick={fetchModels}>{busy ? 'Working…' : 'Fetch models'}</button><label className="check-control"><input type="checkbox" checked={freeOnly} onChange={(event) => setFreeOnly(event.target.checked)} /> Free models only</label><span className="model-count">{status || (models.length ? `${visible.length} shown` : 'No catalog loaded')}</span></div></section>;
}

function AccountSignInPanel() {
  const [busy, setBusy] = useState(''); const [status, setStatus] = useState('');
  async function open(platform) { setBusy(platform); setStatus(`Opening ${platform} sign-in…`); try { const response = await fetch('/api/connections/auth/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ platform }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error?.message || data.error || 'Unable to open sign-in.'); setStatus(`${platform} sign-in opened in the visible managed browser. Complete the QR or login there.`); } catch (error) { setStatus(error.message); } finally { setBusy(''); } }
  const services = [
    ['whatsapp', 'WhatsApp Web', 'Scan the QR code with your phone.'],
    ['instagram', 'Instagram', 'Complete account login in the managed browser.'],
    ['discord', 'Discord', 'Sign in without sharing credentials with JARVIS.'],
    ['gmail', 'Google account', 'Open Google sign-in for a persistent browser session.'],
  ];
  return <section className="workspace-panel settings-section full account-signin"><div className="panel-label">Visible account sign-in</div><p className="setting-help">Authentication cannot be headless: JARVIS opens a visible browser for QR or OAuth, then retains that browser profile for later automation. It never reads or stores your password.</p><div className="signin-grid">{services.map(([id, label, detail]) => <article key={id}><div><h3>{label}</h3><p>{detail}</p></div><button type="button" className="secondary-action" disabled={Boolean(busy)} onClick={() => open(id)}>{busy === id ? 'Opening…' : id === 'whatsapp' ? 'Open QR sign-in' : 'Open sign-in'}</button></article>)}</div>{status && <p className="routing-summary contact-message">{status}</p>}<p className="signin-footnote">Opening a sign-in page does not mean the connector is ready. Connected status appears below only after the provider confirms authorization.</p></section>;
}

function PermissionModePanel() {
  const [data,setData]=useState({mode:'normal',pending:0,recent:[]});const [status,setStatus]=useState('');
  useEffect(()=>{fetch('/api/permissions').then(response=>response.ok?response.json():Promise.reject()).then(setData).catch(()=>setStatus('Permission state is unavailable.'));},[]);
  async function change(mode){setStatus('Saving…');const response=await fetch('/api/permissions',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({mode})});const value=await response.json().catch(()=>({}));if(!response.ok){setStatus(value.error||'Could not change mode.');return;}setData(current=>({...current,...value}));setStatus('Saved. Existing pending actions were not executed.');}
  async function emergency(active){const response=await fetch('/api/emergency-stop',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({active})});const value=await response.json().catch(()=>({}));if(response.ok){setData(current=>({...current,emergencyStop:value.active,pending:value.active?0:current.pending}));setStatus(value.active?'Emergency stop active. New side effects and pending approvals are blocked.':'Execution resumed.');}else setStatus(value.error||'Emergency control failed.');}
  const modes=[['normal','Normal','Ask before consequential or external actions.'],['skip_permissions','Skip routine approvals','Auto-run intentional routine messaging, media, browser, app and task actions.'],['full_permissions','Full permissions','Auto-run registered non-critical tools. Destructive, security and privileged actions remain guarded.']];
  return <section className="workspace-panel settings-section full"><div className="routing-head"><div><div className="panel-label">Permission mode</div><p className="setting-help">Policy changes affect future tool calls only. Validation, authentication, idempotency, verification and audit logging always remain enabled.</p></div><span className="mono">{data.pending||0} PENDING</span></div><div className="signin-grid">{modes.map(([id,label,detail])=><article key={id}><div><h3>{label}</h3><p>{detail}</p></div><button type="button" className={data.mode===id?'primary-action':'secondary-action'} onClick={()=>change(id)}>{data.mode===id?'Active':'Use mode'}</button></article>)}</div><div className="model-actions"><button type="button" className={data.emergencyStop?'secondary-action':'review-btn'} onClick={()=>emergency(!data.emergencyStop)}>{data.emergencyStop?'Resume execution':'Emergency stop'}</button></div>{status&&<p className="routing-summary">{status}</p>}</section>;
}

const SETTINGS_SECTIONS = [['intelligence', 'Intelligence', 'Models, providers and routing'], ['security','Security','Permissions, approvals and execution policy'], ['accounts', 'Accounts & contacts', 'People, OAuth and QR sign-in'], ['voice', 'Voice OS', 'Speech, shortcuts and notifications'], ['appearance', 'Appearance', 'Theme, type and colour'], ['credentials', 'Credentials', 'Advanced secret configuration']];

function SettingsHub() {
  const [active, setActive] = useState(() => { try { return window.sessionStorage.getItem('jarvis-settings-section') || 'intelligence'; } catch { return 'intelligence'; } });
  function select(section) { setActive(section); try { window.sessionStorage.setItem('jarvis-settings-section', section); } catch {} }
  const activeLabel = SETTINGS_SECTIONS.find(([id]) => id === active)?.[1] || 'Settings';
  return <div className="workspace-page settings-hub"><WorkspaceHeader view="settings" /><div className="settings-layout"><nav className="settings-nav workspace-panel" role="tablist" aria-label="Settings sections">{SETTINGS_SECTIONS.map(([id, label, detail]) => <button key={id} id={`settings-tab-${id}`} type="button" role="tab" aria-selected={active === id} aria-controls="settings-panel" tabIndex={active === id ? 0 : -1} className={active === id ? 'active' : ''} onClick={() => select(id)}><span>{label}</span><small>{detail}</small></button>)}</nav><main id="settings-panel" className="settings-content" role="tabpanel" aria-labelledby={`settings-tab-${active}`}><div className="settings-mobile-title">{activeLabel}</div>{active === 'intelligence' && <><ModelRoutingControl /><ChatGPTWebPanel /><GeminiWebPanel /><ProviderSetupPanel /><FunctionRoutingPanel /></>}{active === 'security'&&<PermissionModePanel/>}{active === 'accounts' && <><AccountSignInPanel /><ContactManagerPanel /><ComposioPanel /></>}{active === 'voice' && <><VoicePanel /><VoiceOsPanel /><VoiceShortcutPanel /></>}{active === 'appearance' && <AppearanceManagerPanel />}{active === 'credentials' && <CredentialManagerPanel />}</main></div></div>;
}

export default function WorkspaceViews({ view }) {
  const views = {
    chat: <ChatWorkspace />, brain: <BrainWorkspace />, tasks: <TasksWorkspace />, approvals: <ApprovalsWorkspace />,
    connections: <ConnectionsWorkspace />, workflows: <WorkflowsWorkspace />, goals: <GoalsWorkspace />,
    agents: <AgentsWorkspace />, skills: <SkillsWorkspace />, settings: <SettingsHub />,
  };
  return views[view] || null;
}
