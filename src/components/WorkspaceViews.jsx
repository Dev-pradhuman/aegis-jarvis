import { useEffect, useRef, useState } from 'react';
import Approvals from './Approvals.jsx';
import Chat from './Chat.jsx';
import Icon from './Icon.jsx';
import Tasks from './Tasks.jsx';
import useAppearance from '../hooks/useAppearance.js';
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

const workflowData = [
  { name: 'Morning intelligence brief', trigger: 'Weekdays · 08:00', runs: 42, state: 'active', steps: ['Collect', 'Verify', 'Summarize', 'Deliver'] },
  { name: 'Repository health scan', trigger: 'On push · main', runs: 118, state: 'active', steps: ['Inspect', 'Test', 'Score', 'Notify'] },
  { name: 'Meeting preparation', trigger: '30 min before event', runs: 17, state: 'paused', steps: ['Context', 'People', 'Agenda', 'Brief'] },
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

function ChatWorkspace() {
  return (
    <div className="workspace-page">
      <WorkspaceHeader view="chat" action={<button className="primary-action">New conversation</button>} />
      <div className="chat-workspace-grid">
        <aside className="workspace-panel conversation-list">
          <div className="panel-label">Recent channels</div>
          {['Quantum research', 'Project Aegis', 'System architecture', 'Meeting prep'].map((label, i) => (
            <button className={`conversation-row${i === 0 ? ' selected' : ''}`} key={label}>
              <span>{label}</span><small>{i === 0 ? 'Now' : `${i + 1}h`}</small>
            </button>
          ))}
        </aside>
        <Chat />
        <aside className="workspace-panel context-rail">
          <div className="panel-label">Active context</div>
          <div className="context-stat"><span>Sources</span><b>14</b></div>
          <div className="context-stat"><span>Working memory</span><b>62%</b></div>
          <div className="context-stat"><span>Tools available</span><b>09</b></div>
          <div className="context-note">JARVIS is using the current project, selected files, and the last 12 messages.</div>
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

function TasksWorkspace() {
  const [filter, setFilter] = useState('All');
  return (
    <div className="workspace-page">
      <WorkspaceHeader view="tasks" action={<button className="primary-action">Create task</button>} />
      <MetricStrip items={[["Active", '03', 'cyan'], ['Queued', '12'], ['Completion', '81%', 'green'], ['Blocked', '01', 'red']]} />
      <div className="task-workspace-grid">
        <div className="workspace-panel expanded-list">
          <div className="panel-toolbar"><div className="panel-label">Execution queue</div><div className="filter-group">{['All', 'Active', 'Pending'].map((item) => <button className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} key={item}>{item}</button>)}</div></div>
          <Tasks />
        </div>
        <aside className="workspace-panel timeline-panel">
          <div className="panel-label">Today</div>
          {['Research started', 'Architecture review queued', 'Documentation paused', 'Meeting brief scheduled'].map((item, i) => <div className="timeline-item" key={item}><span>{`0${9 + i}:30`}</span><p>{item}</p></div>)}
        </aside>
      </div>
    </div>
  );
}

function ApprovalsWorkspace() {
  const [reviewed, setReviewed] = useState(0);
  return (
    <div className="workspace-page">
      <WorkspaceHeader view="approvals" action={<button className="secondary-action" onClick={() => setReviewed(4)}>Review all</button>} />
      <MetricStrip items={[["Pending", String(4 - reviewed).padStart(2, '0')], ['High risk', reviewed >= 4 ? '00' : '02', 'red'], ['Median wait', '3m 18s', 'cyan'], ['Policy blocks', '01']]} />
      <div className="approval-workspace-grid">
        <div className="workspace-panel expanded-list"><Approvals /></div>
        <aside className="workspace-panel policy-panel">
          <div className="panel-label">Authorization policy</div>
          <div className="policy-score">ASSISTED <span>MODE</span></div>
          <p>External communications, shell commands, dependency changes, and spending require confirmation.</p>
          <button className="primary-action" onClick={() => setReviewed((value) => Math.min(4, value + 1))}>Resolve next</button>
        </aside>
      </div>
    </div>
  );
}

function ConnectionsWorkspace() {
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
  const [workflows, setWorkflows] = useState(workflowData.map((flow, index) => ({ ...flow, id: `legacy-${index}` })));
  useEffect(() => { let mounted = true; fetch('/api/workflows').then((response) => response.ok ? response.json() : null).then((data) => { if (mounted && data?.workflows) setWorkflows(data.workflows); }).catch(() => {}); return () => { mounted = false; }; }, []);
  async function run(id) { const response = await fetch(`/api/workflows/${id}/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); if (response.ok) setWorkflows((items) => items.map((flow) => flow.id === id ? { ...flow, runs: Number(flow.runs || 0) + 1, lastRun: { state: 'completed' } } : flow)); }
  const active = workflows.filter((flow) => flow.state === 'active').length;
  const runs = workflows.reduce((sum, flow) => sum + Number(flow.runs || 0), 0);
  return <div className="workspace-page"><WorkspaceHeader view="workflows" action={<button className="primary-action">New workflow</button>} /><MetricStrip items={[["Active", String(active).padStart(2, '0'), 'green'], ['Total runs', String(runs), 'cyan'], ['Success rate', '100%', 'green'], ['Paused', String(workflows.filter((flow) => flow.state === 'paused').length).padStart(2, '0')]]} /><div className="workflow-list">{workflows.map((flow) => <article className="workspace-panel workflow-row" key={flow.id || flow.name}><div className="workflow-summary"><span className={`state-mark ${flow.state}`} /><div><h3>{flow.name}</h3><p>{flow.trigger} · {flow.runs} total runs</p></div></div><div className="workflow-steps">{flow.steps.map((step, i) => <div key={step}><span>{i + 1}</span>{step}</div>)}</div><button className="row-menu" onClick={() => run(flow.id)} aria-label={`Run ${flow.name}`}>RUN</button></article>)}</div></div>;
}

function GoalsWorkspace() {
  return <div className="workspace-page"><WorkspaceHeader view="goals" action={<button className="primary-action">Define goal</button>} /><MetricStrip items={[["In progress", '04', 'cyan'], ['On track', '03', 'green'], ['At risk', '01', 'red'], ['Avg progress', '68%']]} /><div className="goal-grid">{goalData.map((goal) => <article className="workspace-panel goal-card" key={goal.name}><div className="goal-progress" style={{ '--progress': `${goal.progress * 3.6}deg` }}><strong>{goal.progress}%</strong></div><div><span className="card-eyebrow">DUE {goal.due}</span><h3>{goal.name}</h3><p>{goal.owner}</p><div className="goal-track"><i style={{ width: `${goal.progress}%` }} /></div></div></article>)}</div></div>;
}

function AgentsWorkspace() {
  const [paused, setPaused] = useState([]);
  return <div className="workspace-page"><WorkspaceHeader view="agents" action={<button className="primary-action">Deploy agent</button>} /><MetricStrip items={[["Online", String(agentData.length - paused.length).padStart(2, '0'), 'green'], ['Working', '03', 'cyan'], ['Queued actions', '19'], ['Avg load', '46%']]} /><div className="agent-grid">{agentData.map((agent, i) => { const isPaused = paused.includes(i); return <article className="workspace-panel agent-card" key={agent.code}><div className="agent-orbit"><Icon name="agents" /></div><div className="agent-title"><span>{agent.code}</span><h3>{agent.name} Agent</h3></div><span className={`agent-state ${isPaused ? 'paused' : agent.state}`}>{isPaused ? 'paused' : agent.state}</span><p>{isPaused ? 'Execution suspended by operator' : agent.task}</p><div className="load-row"><span>Compute load</span><b>{isPaused ? 0 : agent.load}%</b></div><div className="goal-track"><i style={{ width: `${isPaused ? 0 : agent.load}%` }} /></div><button className="secondary-action" onClick={() => setPaused((items) => items.includes(i) ? items.filter((x) => x !== i) : [...items, i])}>{isPaused ? 'Resume' : 'Pause'}</button></article>; })}</div></div>;
}

function SkillsWorkspace() {
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

function CredentialsPanel() {
  const modelKeys = Array.from({ length: 12 }, (_, index) => `MODEL_API_KEY_${index + 1}`);
  const providerKeys = ['GROQ', 'GEMINI', 'OPENROUTER', 'OPENCODE_ZEN', 'NINEROUTER', 'CUSTOM'].flatMap((provider) => [`${provider}_API_KEY`, ...Array.from({ length: 4 }, (_, index) => `${provider}_API_KEY_${index + 1}`)]);
  const fields = [...providerKeys, 'GROQ_CHAT_MODEL', 'GROQ_STT_MODEL', 'GROQ_TTS_MODEL', 'GROQ_TTS_VOICE', 'GEMINI_IMAGE_MODEL', 'GEMINI_VIDEO_MODEL', 'TTS_PROVIDER', 'PROVIDER_FALLBACK_ORDER', 'MODEL_PROVIDER_POOLS', 'JARVIS_ROUTER_DEBUG', ...modelKeys, 'COMPOSIO_API_KEY', 'COMPOSIO_USER_ID', 'COMPOSIO_AUTH_CONFIGS', 'SLACK_BOT_TOKEN', 'SLACK_CHANNEL_ID', 'SLACK_WEBHOOK_URL', 'SEARCH_PROVIDER_URL', 'CALENDAR_API_URL', 'MESSAGING_API_URL', 'HARDWARE_ENDPOINT', 'JARVIS_AUTH_TOKEN'];
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
  const textPresets = { local: ['Local model', 'http://127.0.0.1:11434/v1', 'llama3.2'], groq: ['Groq', 'https://api.groq.com/openai/v1', 'openai/gpt-oss-20b'], openrouter: ['OpenRouter', 'https://openrouter.ai/api/v1', 'openai/gpt-oss-20b'], 'opencode-zen': ['OpenCode Zen', 'https://opencode.ai/zen/v1', 'openai/gpt-oss-20b'], '9router': ['9router', 'https://9router.com/v1', 'openai/gpt-oss-20b'], custom: ['Custom API', '', ''] };
  const [routing, setRouting] = useState({ textProvider: 'local', textModel: 'llama3.2', textBaseUrl: textPresets.local[1], sttProvider: 'groq', sttModel: 'whisper-large-v3-turbo', ttsProvider: 'browser', ttsModel: 'canopylabs/orpheus-v1-english', ttsVoice: 'autumn' }); const [saved, setSaved] = useState(false);
  useEffect(() => { Promise.all([fetch('/api/provider').then((r) => r.ok ? r.json() : null), fetch('/api/voice/tts').then((r) => r.ok ? r.json() : null)]).then(([text, voice]) => setRouting((current) => ({ ...current, textProvider: text?.provider?.id || current.textProvider, textModel: text?.provider?.model || current.textModel, textBaseUrl: text?.provider?.baseUrl || current.textBaseUrl, sttProvider: voice?.sttProvider || current.sttProvider, sttModel: voice?.groq?.sttModel || current.sttModel, ttsProvider: voice?.provider || current.ttsProvider, ttsModel: voice?.groq?.ttsModel || current.ttsModel, ttsVoice: voice?.groq?.voice || current.ttsVoice }))).catch(() => {}); }, []);
  function chooseText(id) { const preset = textPresets[id]; setRouting((current) => ({ ...current, textProvider: id, textBaseUrl: preset[1], textModel: preset[2] })); }
  async function save() { setSaved(false); const preset = textPresets[routing.textProvider]; const providerResponse = await fetch('/api/provider', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: routing.textProvider, label: preset[0], model: routing.textModel, baseUrl: routing.textBaseUrl, configured: true }) }); const configResponse = await fetch('/api/config', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ STT_PROVIDER: routing.sttProvider, GROQ_STT_MODEL: routing.sttModel, TTS_PROVIDER: routing.ttsProvider, ...(routing.ttsProvider === 'groq' ? { GROQ_TTS_MODEL: routing.ttsModel, GROQ_TTS_VOICE: routing.ttsVoice } : {}) }) }); setSaved(providerResponse.ok && configResponse.ok); }
  return <section className="workspace-panel settings-section full function-routing"><div className="routing-head"><div><div className="panel-label">Function routing</div><p className="setting-help">Choose the provider and model used for each stage of a JARVIS interaction.</p></div><button type="button" className="primary-action" onClick={save}>Save routes {saved ? '✓' : ''}</button></div><div className="route-grid"><article><span className="route-step">01</span><h3>Voice to text</h3><label>Provider<select value={routing.sttProvider} onChange={(event) => setRouting((current) => ({ ...current, sttProvider: event.target.value }))}><option value="groq">Groq Whisper</option><option value="browser">Browser recognition</option></select></label><label>Model<input value={routing.sttModel} disabled={routing.sttProvider === 'browser'} onChange={(event) => setRouting((current) => ({ ...current, sttModel: event.target.value }))} /></label></article><article><span className="route-step">02</span><h3>Text intelligence</h3><label>Provider<select value={routing.textProvider} onChange={(event) => chooseText(event.target.value)}>{Object.entries(textPresets).map(([id, value]) => <option key={id} value={id}>{value[0]}</option>)}</select></label><label>Model<input value={routing.textModel} onChange={(event) => setRouting((current) => ({ ...current, textModel: event.target.value }))} /></label></article><article><span className="route-step">03</span><h3>Text to speech</h3><label>Provider<select value={routing.ttsProvider} onChange={(event) => setRouting((current) => ({ ...current, ttsProvider: event.target.value }))}><option value="browser">Browser voice</option><option value="groq">Groq</option><option value="elevenlabs">ElevenLabs</option><option value="fish-audio">Fish Audio</option></select></label><label>Model<input value={routing.ttsModel} disabled={routing.ttsProvider === 'browser'} onChange={(event) => setRouting((current) => ({ ...current, ttsModel: event.target.value }))} /></label></article></div></section>;
}

function ModelRoutingControl() {
  const [data, setData] = useState({ settings: { jarvisMode: 'normal', modelMode: 'auto', manualModel: 'muse-spark-1.2', manualFallbackAllowed: true }, models: {}, recentTelemetry: [] }); const [saved, setSaved] = useState(false);
  useEffect(() => { fetch('/api/model-routing').then((response) => response.ok ? response.json() : null).then((value) => value && setData(value)).catch(() => {}); }, []);
  async function save(settings) { setSaved(false); setData((current) => ({ ...current, settings })); const response = await fetch('/api/model-routing', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(settings) }); setSaved(response.ok); }
  const selected = data.settings.modelMode === 'auto' ? 'auto' : data.settings.manualModel; const latest = data.recentTelemetry?.[0];
  return <section className="workspace-panel settings-section full model-routing-control"><div><div className="panel-label">JARVIS intelligence mode</div><p className="setting-help">Normal uses Muse Spark as the agent brain, Coding selects Laguna, and Deep Thinking selects GLM. A manual model still overrides the selected mode.</p></div><label>Mode<select value={data.settings.jarvisMode || 'normal'} onChange={(event) => void save({ ...data.settings, jarvisMode: event.target.value, modelMode: 'auto' })}><option value="normal">Normal · Muse Spark 1.2</option><option value="coding">Coding · Laguna S 2.1</option><option value="deepthinking">Deep Thinking · GLM-5.2</option></select></label><label>Model override<select value={selected} onChange={(event) => { const value = event.target.value; void save({ ...data.settings, modelMode: value === 'auto' ? 'auto' : 'manual', manualModel: value === 'auto' ? data.settings.manualModel : value }); }}><option value="auto">Auto within mode</option>{Object.entries(data.models).map(([id, model]) => <option key={id} value={id}>{model.label}</option>)}</select></label><label className="check-control"><input type="checkbox" checked={data.settings.manualFallbackAllowed} onChange={(event) => void save({ ...data.settings, manualFallbackAllowed: event.target.checked })} /> Allow GLM-5.2 fallback</label><div className="routing-summary">{saved ? 'Saved · ' : ''}{latest ? `Last handled by ${data.models[latest.finalModel]?.label || latest.finalModel}` : 'No model routing recorded yet'}</div></section>;
}

function AppearancePanel() {
  const [appearance, setAppearance] = useAppearance();
  return <section className="workspace-panel settings-section full appearance-panel"><div className="panel-label">Appearance</div><p className="setting-help">Personalize the interface locally. Changes persist in this browser.</p><div className="form-grid appearance-grid"><label>Theme<select value={appearance.theme} onChange={(event) => setAppearance((current) => ({ ...current, theme: event.target.value }))}><option value="carbon">Carbon / amber</option><option value="midnight">Midnight / cyan</option><option value="light">Light / amber</option></select></label><label>Font size <span className="range-value">{appearance.fontSize}px</span><input type="range" min="13" max="20" value={appearance.fontSize} onChange={(event) => setAppearance((current) => ({ ...current, fontSize: Number(event.target.value) }))} /></label><label>Accent colour<div className="colour-control"><input type="color" value={appearance.accent} onChange={(event) => setAppearance((current) => ({ ...current, accent: event.target.value }))} /><code>{appearance.accent.toUpperCase()}</code></div></label></div></section>;
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

export default function WorkspaceViews({ view }) {
  const views = {
    chat: <ChatWorkspace />, brain: <BrainWorkspace />, tasks: <TasksWorkspace />, approvals: <ApprovalsWorkspace />,
    connections: <ConnectionsWorkspace />, workflows: <WorkflowsWorkspace />, goals: <GoalsWorkspace />,
    agents: <AgentsWorkspace />, skills: <SkillsWorkspace />, settings: <div className="settings-shell"><ModelRoutingControl /><ComposioPanel /><FunctionRoutingPanel /><SettingsWorkspace /></div>,
  };
  return views[view] || null;
}
