import { useEffect, useRef, useState } from 'react';
import BrainManager from './BrainManager.jsx';
import Approvals from './Approvals.jsx';
import ApprovalPolicyPanel from './ApprovalPolicyPanel.jsx';
import Chat from './Chat.jsx';
import Icon from './Icon.jsx';
import Tasks from './Tasks.jsx';
import RemindersPanel from './RemindersPanel.jsx';
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
  agents: ['Agent History', 'Observed model delegations; dynamic agents are not available'],
  skills: ['Skills', 'Installable Skill runtime is not available yet'],
  settings: ['System Settings', 'Local policy, interface, and runtime controls'],
};

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
      <WorkspaceHeader view="chat" />
      <div className="chat-workspace-grid">
        <aside className="workspace-panel conversation-list">
          <div className="panel-label">Conversation</div>
          <p className="setting-help">Messages in this channel come from the JARVIS service.</p>
        </aside>
        <Chat />
        <aside className="workspace-panel context-rail">
          <div className="panel-label">Active context</div>
          <div className="context-note">Inspect each Run for its actual model, tool calls, and retrieved context. Live context metrics are not available in this view.</div>
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
  return (
    <div className="workspace-page">
      <WorkspaceHeader view="tasks" />
      <div className="task-workspace-grid">
        <div className="workspace-panel expanded-list">
          <div className="panel-toolbar"><div className="panel-label">Saved tasks</div></div>
          <Tasks />
        </div>
        <aside className="workspace-panel timeline-panel">
          <div className="panel-toolbar"><div className="panel-label">Schedule & Reminders</div></div>
          <RemindersPanel compact={true} />
        </aside>
      </div>
    </div>
  );
}

function ApprovalsWorkspace() {
  return (
    <div className="workspace-page">
      <WorkspaceHeader view="approvals" />
      <div className="approval-workspace-grid">
        <div className="workspace-panel expanded-list"><Approvals /></div>
        <ApprovalPolicyPanel />
      </div>
    </div>
  );
}

function ConnectionsWorkspace() {
  const [connections, setConnections] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { let mounted = true; Promise.all([fetch('/api/connections').then((response) => { if (!response.ok) throw new Error('Connections unavailable'); return response.json(); }), fetch('/api/composio/status').then((response) => response.ok ? response.json() : null)]).then(([data, composio]) => { if (!mounted) return; const base = data?.connections || []; const apps = (composio?.toolkits || []).map((item) => ({ id: `composio-${item.slug}`, name: item.label, detail: `Composio · ${item.capabilities.join(', ')}${item.note ? ` · ${item.note}` : ''}`, status: composio.connectReady && item.authConfigured ? 'configured' : composio.connectReady ? 'ready to connect' : composio.hasCredential ? 'needs project key' : 'needs key' })); setConnections([...base, ...apps]); }).catch((reason) => { if (mounted) setError(reason.message); }); return () => { mounted = false; }; }, []);
  const availableCount = connections.filter((item) => ['configured', 'available'].includes(item.status)).length;
  return (
    <div className="workspace-page">
      <WorkspaceHeader view="connections" />
      {error && <p role="alert">{error}</p>}
      <MetricStrip items={[["Available / configured", String(availableCount).padStart(2, '0'), 'green'], ['Providers', String(connections.length).padStart(2, '0')], ['Configured', String(connections.filter((item) => item.status === 'configured').length).padStart(2, '0'), 'cyan'], ['Local only', connections.some((item) => item.id === 'local') ? '01' : '00']]} />
      <div className="card-grid">
        {connections.map((connection) => <article className="workspace-panel data-card connection-card" key={connection.id || connection.name}><div className="card-icon"><Icon name={connection.id === 'local' ? 'terminal' : 'connections'} /></div><div><h3>{connection.name}</h3><p>{connection.detail || connection.type || connection.kind}</p></div><div className="card-meta"><span>{connection.status}</span></div></article>)}
      </div>
    </div>
  );
}

function WorkflowsWorkspace() {
  const [workflows, setWorkflows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  async function refresh() {
    try {
      const response = await fetch('/api/workflows');
      if (!response.ok) throw new Error(`Workflow service returned HTTP ${response.status}`);
      const data = await response.json();
      setWorkflows(data.workflows || []);
      setSummary(data.summary || null);
      setStatus('ready');
      setError('');
    } catch (reason) {
      setStatus('error');
      setError(reason.message || 'Workflow service is unavailable');
    }
  }
  useEffect(() => { void refresh(); }, []);
  async function run(id) {
    try {
      const response = await fetch(`/api/workflows/${id}/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      if (!response.ok) throw new Error(`Workflow run returned HTTP ${response.status}`);
      await refresh();
    } catch (reason) { setError(reason.message || 'Workflow run failed'); }
  }
  const active = workflows.filter((flow) => flow.state === 'active').length;
  const runs = workflows.reduce((sum, flow) => sum + Number(flow.runs || 0), 0);
  return <div className="workspace-page">
    <WorkspaceHeader view="workflows" />
    <MetricStrip items={[["Active", status === 'ready' ? String(active).padStart(2, '0') : '—', 'green'], ['Total runs', status === 'ready' ? String(runs) : '—', 'cyan'], ['Latest outcomes', status === 'ready' && summary?.successRate !== null && summary?.successRate !== undefined ? `${summary.successRate}%` : '—', 'green'], ['Paused', status === 'ready' ? String(workflows.filter((flow) => flow.state === 'paused').length).padStart(2, '0') : '—']]} />
    {status === 'loading' && <p className="setting-help" role="status">Loading saved workflows…</p>}
    {status === 'error' && <p className="form-error" role="alert">{error}</p>}
    {status === 'ready' && error && <p className="form-error" role="alert">{error}</p>}
    {status === 'ready' && workflows.length === 0 && <p className="setting-help">No workflows configured. Workflows run only saved canonical tool steps; no demo automations are installed by default.</p>}
    <div className="workflow-list">{status === 'ready' && workflows.map((flow) => <article className="workspace-panel workflow-row" key={flow.id || flow.name}>
      <div className="workflow-summary"><span className={`state-mark ${flow.state}`} /><div><h3>{flow.name}</h3><p>{flow.trigger || 'Manual'} · {flow.runs || 0} total runs · {flow.lastRun?.state || 'never run'}</p></div></div>
      <div className="workflow-steps">{(flow.steps || []).map((step, i) => <div key={step.id || i}><span>{i + 1}</span>{typeof step === 'string' ? step : step.tool}</div>)}</div>
      <button className="row-menu" onClick={() => run(flow.id)} aria-label={`Run ${flow.name}`}>RUN</button>
    </article>)}</div>
  </div>;
}

function GoalsWorkspace() {
  return <div className="workspace-page"><WorkspaceHeader view="goals" /><p className="setting-help">Persistent Goals are not implemented. No goal progress is available.</p></div>;
}

function AgentsWorkspace() {
  const [data, setData] = useState(null);
  useEffect(() => { let active = true; fetch('/api/agents').then((response) => response.ok ? response.json() : null).then((value) => { if (active) setData(value); }).catch(() => { if (active) setData({ agents: [], error: true }); }); return () => { active = false; }; }, []);
  return <div className="workspace-page"><WorkspaceHeader view="agents" /><p className="setting-help">Dynamic agents: {data?.dynamicAgentsAvailable ? 'available' : 'not implemented'}. Historical model delegations are shown below; they are not live workers.</p>{data?.error && <p role="alert">Agent history is unavailable.</p>}{data?.agents?.length === 0 && <p className="setting-help">No model delegations recorded.</p>}<div className="agent-grid">{data?.agents?.map((agent) => <article className="workspace-panel agent-card" key={agent.id}><h3>{agent.name}</h3><p>{agent.status} · Run {agent.runId}</p></article>)}</div></div>;
}

function SkillsWorkspace() {
  return <div className="workspace-page"><WorkspaceHeader view="skills" /><p className="setting-help">An installable Skill runtime is not implemented. Use Tools to inspect actual registered JARVIS capabilities.</p></div>;
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
  const [testText, setTestText] = useState('JARVIS voice test.');
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
  const fields = ['GROQ_STT_MODEL', 'GROQ_TTS_MODEL', 'GROQ_TTS_VOICE', 'GEMINI_IMAGE_MODEL', 'GEMINI_VIDEO_MODEL', 'TTS_PROVIDER', 'COMPOSIO_API_KEY', 'COMPOSIO_USER_ID', 'COMPOSIO_AUTH_CONFIGS', 'SLACK_BOT_TOKEN', 'SLACK_CHANNEL_ID', 'SLACK_WEBHOOK_URL', 'SEARCH_PROVIDER_URL', 'CALENDAR_API_URL', 'MESSAGING_API_URL', 'HARDWARE_ENDPOINT', 'JARVIS_AUTH_TOKEN'];
  const providerPrefixes = ['GROQ', 'GEMINI', 'OPENROUTER', 'OPENCODE_ZEN', 'NINEROUTER', 'CUSTOM', 'MODEL'];
  
  // Create an extensive list of all possible fields including dynamic API key slots
  const allFields = [...fields];
  providerPrefixes.forEach(prefix => {
    allFields.push(`${prefix}_API_KEY`);
    for (let i = 1; i <= 12; i++) allFields.push(`${prefix}_API_KEY_${i}`);
  });

  const [values, setValues] = useState({});
  const [status, setStatus] = useState({});
  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => {
    fetch('/api/config')
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data) {
          setStatus(data);
          // Initialize empty string for all keys present in data
          const initValues = {};
          Object.keys(data).forEach(k => initValues[k] = '');
          setValues(initValues);
        }
      })
      .catch(() => {});
  }, []);

  async function save() {
    const payload = Object.fromEntries(Object.entries(values).filter(([, value]) => value));
    const response = await fetch('/api/config', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    if (response.ok) {
      const data = await response.json();
      setStatus(data);
      const resetValues = {};
      Object.keys(data).forEach(k => resetValues[k] = '');
      setValues(resetValues);
    }
  }
  
  // Group configs for the card layout
  const cards = [
    { title: 'GROQ', type: 'API Key', baseKey: 'GROQ_API_KEY', desc: 'Fast LPU inference for speech and text.' },
    { title: 'GEMINI', type: 'API Key', baseKey: 'GEMINI_API_KEY', desc: 'Google AI models for text, vision, and video.' },
    { title: 'VERCEL AI', type: 'API Key', baseKey: 'AI_GATEWAY_API_KEY', single: true, desc: 'Centralized model routing via Vercel AI Gateway.' },
    { title: 'COMPOSIO', type: 'API Key', baseKey: 'COMPOSIO_API_KEY', single: true, desc: 'Managed integrations for Gmail, Calendar, etc.' },
    { title: 'OPENROUTER', type: 'API Key', baseKey: 'OPENROUTER_API_KEY', desc: 'Unified API for multiple LLM providers.' },
    { title: 'OPENCODE ZEN', type: 'API Key', baseKey: 'OPENCODE_ZEN_API_KEY', desc: 'Zen API keys for OpenCode services.' },
    { title: 'FISH AUDIO', type: 'API Key', baseKey: 'FISH_AUDIO_API_KEY', single: true, desc: 'Expressive neural speech synthesis for English and Hindi.' },
    { title: 'ELEVENLABS', type: 'API Key', baseKey: 'ELEVENLABS_API_KEY', single: true, desc: 'Multilingual neural speech synthesis for English and Hindi.' },
    { title: 'NINEROUTER', type: 'API Key', baseKey: 'NINEROUTER_API_KEY', desc: 'Alternative multi-model routing gateway.' },
    { title: 'CUSTOM MODEL', type: 'API Key', baseKey: 'MODEL_API_KEY', max: 12, desc: 'Generic keys for custom OpenAI-compatible endpoints.' },
    { title: 'SEARCH PROVIDER URL', type: 'URL', baseKey: 'SEARCH_PROVIDER_URL', single: true, desc: 'Endpoint for web search operations.' },
    { title: 'JARVIS AUTH TOKEN', type: 'Token', baseKey: 'JARVIS_AUTH_TOKEN', single: true, desc: 'Token for local client authentication.' }
  ];
  
  const getKeysForGroup = (baseKey, single, max = 4) => {
    if (single) return [baseKey];
    const keys = [baseKey];
    for (let i = 1; i <= max; i++) keys.push(`${baseKey}_${i}`);
    return keys;
  };

  const activeInputCount = (keys, groupTitle) => {
    const count = keys.filter(k => status[k]?.configured || values[k]).length;
    const expanded = expandedGroups[groupTitle] || 1;
    return Math.max(1, count, expanded);
  };

  const addInput = (groupTitle) => {
    setExpandedGroups(curr => ({ ...curr, [groupTitle]: (curr[groupTitle] || 1) + 1 }));
  };

  return (
    <section className="workspace-panel settings-section full">
      <div className="panel-label">Environment credentials</div>
      <p className="setting-help">Use the Brain Tab for model providers and any number of API keys. These other Integration values are written to the server only credentials file. Leave a field blank to keep its existing value.</p>
      
      <div className="api-cards-grid">
        {cards.map(card => {
          const keys = getKeysForGroup(card.baseKey, card.single, card.max);
          const showCount = activeInputCount(keys, card.title);
          const visibleKeys = keys.slice(0, showCount);
          const canAdd = !card.single && showCount < keys.length;

          return (
            <div key={card.title} className="api-card">
              <div className="api-card-header">
                <h3>{card.title}</h3>
                <span className="api-type">{card.type}</span>
              </div>
              {card.desc && <p className="api-desc">{card.desc}</p>}
              <div className="api-card-inputs">
                {visibleKeys.map(k => (
                  <input
                    key={k}
                    type={card.type === 'URL' ? 'text' : 'password'}
                    placeholder={status[k]?.configured ? '••••••••  (Configured)' : (card.single ? card.baseKey : k)}
                    value={values[k] || ''}
                    onChange={e => setValues(curr => ({ ...curr, [k]: e.target.value }))}
                  />
                ))}
              </div>
              {canAdd && (
                <button className="api-card-add" onClick={() => addInput(card.title)}>+</button>
              )}
            </div>
          );
        })}
      </div>
      <div className="api-save-row">
        <button className="secondary-action" onClick={save}>SAVE CREDENTIALS</button>
      </div>
    </section>
  );
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

function CascadeWorkflowPanel() {
  const [keys, setKeys] = useState({
    GROQ_API_KEY: '',
    GROQ_API_KEY_1: '',
    GROQ_API_KEY_2: '',
    GROQ_API_KEY_3: '',
    OPENROUTER_API_KEY: '',
    OPENCODE_ZEN_API_KEY: '',
    FISH_AUDIO_API_KEY: '',
    FISH_AUDIO_VOICE_ID: '',
    FISH_AUDIO_VOICE_ID_HI: '',
    ELEVENLABS_API_KEY: '',
    ELEVENLABS_VOICE_ID: '',
    ELEVENLABS_VOICE_ID_HI: '',
  });
  const [configStatus, setConfigStatus] = useState({});
  const [workflow, setWorkflow] = useState('cascade');
  const [statusMsg, setStatusMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [testingVoice, setTestingVoice] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setConfigStatus(data || {}))
      .catch(() => {});

    fetch('/api/model-routing')
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        if (data.settings?.routingWorkflow) {
          setWorkflow(data.settings.routingWorkflow);
        }
      })
      .catch(() => {});
  }, []);

  async function saveCascade() {
    setSaving(true);
    setStatusMsg('');
    try {
      const payload = {};
      Object.entries(keys).forEach(([k, v]) => {
        if (typeof v === 'string' && v.trim()) payload[k] = v.trim();
      });

      if (Object.keys(payload).length > 0) {
        const res = await fetch('/api/config', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const updated = await res.json();
          setConfigStatus(updated);
          setKeys({
            GROQ_API_KEY: '',
            GROQ_API_KEY_1: '',
            GROQ_API_KEY_2: '',
            GROQ_API_KEY_3: '',
            OPENROUTER_API_KEY: '',
            OPENCODE_ZEN_API_KEY: '',
            FISH_AUDIO_API_KEY: '',
            FISH_AUDIO_VOICE_ID: '',
            FISH_AUDIO_VOICE_ID_HI: '',
            ELEVENLABS_API_KEY: '',
            ELEVENLABS_VOICE_ID: '',
            ELEVENLABS_VOICE_ID_HI: '',
          });
        }
      }

      await fetch('/api/model-routing', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ routingWorkflow: workflow }),
      });

      setStatusMsg('✓ Cascade architecture saved & active');
      setTimeout(() => setStatusMsg(''), 4000);
    } catch (err) {
      setStatusMsg(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function testSpeech(language = 'en') {
    setTestingVoice(true);
    setStatusMsg(`Testing ${language === 'hi' ? 'Hindi' : 'English'} voice cascade...`);
    try {
      const testPhrase = language === 'hi'
        ? 'नमस्ते, जार्विस ऑनलाइन है।'
        : 'All JARVIS systems are operational.';
      const res = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: testPhrase, language })
      });
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const payload = await res.json().catch(() => ({}));
        if (payload.textOnly) {
          setStatusMsg(`[${language === 'hi' ? 'Hindi' : 'English'}] Text-only fallback active (both TTS keys missing or failed).`);
          return;
        }
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
      const providerUsed = res.headers.get('x-tts-provider') || 'speech synthesis';
      setStatusMsg(`Playing ${language === 'hi' ? 'Hindi' : 'English'} via ${providerUsed}`);
    } catch (err) {
      setStatusMsg(`Speech test error: ${err.message}`);
    } finally {
      setTestingVoice(false);
    }
  }

  const groqPoolCount = ['GROQ_API_KEY', 'GROQ_API_KEY_1', 'GROQ_API_KEY_2', 'GROQ_API_KEY_3', 'GROQ_API_KEY_4']
    .filter((k) => configStatus[k]?.configured).length;
  const groqConfigured = groqPoolCount > 0;
  const openrouterConfigured = Boolean(configStatus.OPENROUTER_API_KEY?.configured);
  const opencodeConfigured = Boolean(configStatus.OPENCODE_ZEN_API_KEY?.configured || configStatus.OPENCODE_API_KEY?.configured);
  const fishConfigured = Boolean(configStatus.FISH_AUDIO_API_KEY?.configured);
  const elevenConfigured = Boolean(configStatus.ELEVENLABS_API_KEY?.configured);

  const inputStages = [
    {
      num: 'IN-1',
      title: 'Voice Request (Groq Whisper)',
      models: 'whisper-large-v3-turbo ➔ whisper-large-v3 ➔ Ask user to type',
      description: 'Audio input transcription with auto-cycling across Groq keys on rate limit. Large v3 Turbo ➔ Large v3 ➔ Type fallback.',
      status: groqConfigured ? `Active (${groqPoolCount} key${groqPoolCount > 1 ? 's' : ''} in pool)` : 'Needs GROQ_API_KEY',
      isReady: groqConfigured,
    }
  ];

  const thinkingStages = [
    {
      num: 'TH-1',
      title: 'Groq Thinking (Top Priority Cloud)',
      models: 'openai/gpt-oss-120b ➔ meta-llama/llama-4-scout ➔ openai/gpt-oss-20b',
      description: `Fastest reasoning cascade on Groq LPUs. Automatically rotates through ${groqPoolCount || 1} recycled key slots on 429 rate limit.`,
      status: groqConfigured ? `Active (${groqPoolCount} key${groqPoolCount > 1 ? 's' : ''} recycling)` : 'Needs GROQ_API_KEY',
      isReady: groqConfigured,
    },
    {
      num: 'TH-2',
      title: 'OpenRouter (Multi-Model Cloud)',
      models: 'meta-llama/llama-3.3-70b-instruct:free ➔ deepseek/deepseek-r1:free ➔ anthropic/claude-3.5-sonnet',
      description: 'Second priority tier. Cascades best free model, then second free model, then paid Claude 3.5 Sonnet.',
      status: openrouterConfigured ? 'Active (Tier 2 Cloud)' : 'Needs OPENROUTER_API_KEY',
      isReady: openrouterConfigured,
    },
    {
      num: 'TH-3',
      title: 'OpenCode Zen (Coding & Tool Inference)',
      models: 'opencode-zen endpoints',
      description: 'Dedicated code generation and agentic tool reasoning via OpenCode services.',
      status: opencodeConfigured ? 'Active (OpenCode Zen)' : 'Optional (OPENCODE_ZEN_API_KEY)',
      isReady: opencodeConfigured,
    },
    {
      num: 'TH-4',
      title: 'Local 4-5B Model (Offline Safeguard)',
      models: 'qwen3.5:4b via Ollama (127.0.0.1:11434)',
      description: 'Offline fallback with no network dependency or quota limits.',
      status: 'Ready (Local Ollama)',
      isReady: true,
    },
    {
      num: 'TH-5',
      title: 'Headless Browser (Autonomous Web AI)',
      models: 'ChatGPT ➔ Claude ➔ Gemini',
      description: 'Headless browser automation if all API and local models are exhausted.',
      status: 'Ready (Browser Automation)',
      isReady: true,
    },
  ];

  const outputStages = [
    {
      num: 'OUT-EN',
      title: 'English Voice Out (Preferred Order)',
      models: 'Fish Audio (s2-pro: 05b36da8...) ➔ ElevenLabs (v2: bIHbv24M...) ➔ Text only',
      description: 'Detects English reply text. Calls Fish Audio first; if it fails, falls back to ElevenLabs; if both fail, stays text-only.',
      status: fishConfigured ? 'Fish Audio Ready (Top)' : elevenConfigured ? 'ElevenLabs Ready (Backup)' : 'Text Only (keys needed)',
      isReady: fishConfigured || elevenConfigured,
    },
    {
      num: 'OUT-HI',
      title: 'Hindi Voice Out (Preferred Order)',
      models: 'ElevenLabs (v2: czQ9pLzj...) ➔ Fish Audio (s2-pro: 817eba7f...) ➔ Text only',
      description: 'Detects Hindi reply text. Calls ElevenLabs first; if it fails, falls back to Fish Audio; if both fail, stays text-only.',
      status: elevenConfigured ? 'ElevenLabs Ready (Top)' : fishConfigured ? 'Fish Audio Ready (Backup)' : 'Text Only (keys needed)',
      isReady: elevenConfigured || fishConfigured,
    }
  ];

  return (
    <section className="workspace-panel settings-section full cascade-panel">
      <div className="panel-label">End-to-End Pipeline Architecture</div>
      <p className="setting-help">
        Full end-to-end fallback system: Input Audio (Groq Whisper) ➔ Thinking Multi-Tier LLMs (Groq Recycling ➔ OpenRouter ➔ OpenCode ➔ Ollama ➔ Browser) ➔ Output Speech (EN: Fish Studio ➔ ElevenLabs; HI: ElevenLabs ➔ Fish Studio). Add your API credentials below.
      </p>

      <div className="cascade-pipeline-flow">
        <div className="cascade-section-kicker">01 · INPUT (Voice Transcription)</div>
        {inputStages.map((stage) => (
          <div key={stage.num} className={`cascade-flow-card ${stage.isReady ? 'active-stage' : ''}`}>
            <div className="cascade-flow-card-left">
              <span className="cascade-stage-num">{stage.num}</span>
              <div className="cascade-stage-meta">
                <h4>{stage.title}</h4>
                <div className="cascade-stage-models">{stage.models}</div>
                <p>{stage.description}</p>
              </div>
            </div>
            <div className="cascade-flow-card-right">
              <span className={`cascade-tag ${stage.isReady ? 'ready' : 'needs-key'}`}>
                {stage.status}
              </span>
            </div>
          </div>
        ))}

        <div className="cascade-section-kicker">02 · THINKING (Cognition Cascade)</div>
        {thinkingStages.map((stage) => (
          <div key={stage.num} className={`cascade-flow-card ${stage.isReady ? 'active-stage' : ''}`}>
            <div className="cascade-flow-card-left">
              <span className="cascade-stage-num">{stage.num}</span>
              <div className="cascade-stage-meta">
                <h4>{stage.title}</h4>
                <div className="cascade-stage-models">{stage.models}</div>
                <p>{stage.description}</p>
              </div>
            </div>
            <div className="cascade-flow-card-right">
              <span className={`cascade-tag ${stage.isReady ? 'ready' : 'needs-key'}`}>
                {stage.status}
              </span>
            </div>
          </div>
        ))}

        <div className="cascade-section-kicker">03 · OUTPUT (Speech by Reply Language)</div>
        {outputStages.map((stage) => (
          <div key={stage.num} className={`cascade-flow-card output-card ${stage.isReady ? 'active-stage' : ''}`}>
            <div className="cascade-flow-card-left">
              <span className="cascade-stage-num">{stage.num}</span>
              <div className="cascade-stage-meta">
                <h4>{stage.title}</h4>
                <div className="cascade-stage-models">{stage.models}</div>
                <p>{stage.description}</p>
              </div>
            </div>
            <div className="cascade-flow-card-right">
              <span className={`cascade-tag ${stage.isReady ? 'ready' : 'needs-key'}`}>
                {stage.status}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="cascade-section-kicker">Groq Recycling Pool (Whisper STT &amp; Reasoning Cascade)</div>
      <div className="cascade-key-bar">
        <div className="cascade-key-field">
          <label>
            <span>Groq Primary Key</span>
            <span style={{ color: configStatus.GROQ_API_KEY?.configured ? 'var(--green)' : 'var(--orange-bright)' }}>
              {configStatus.GROQ_API_KEY?.configured ? '✓ Configured' : 'Key Required'}
            </span>
          </label>
          <input
            type="password"
            placeholder={configStatus.GROQ_API_KEY?.configured ? '••••••••  (Configured — enter to replace)' : 'Enter GROQ_API_KEY'}
            value={keys.GROQ_API_KEY}
            onChange={(e) => setKeys({ ...keys, GROQ_API_KEY: e.target.value })}
          />
        </div>

        <div className="cascade-key-field">
          <label>
            <span>Groq Backup Key 1</span>
            <span style={{ color: configStatus.GROQ_API_KEY_1?.configured ? 'var(--green)' : 'var(--text-muted)' }}>
              {configStatus.GROQ_API_KEY_1?.configured ? '✓ Configured' : 'Optional Backup'}
            </span>
          </label>
          <input
            type="password"
            placeholder={configStatus.GROQ_API_KEY_1?.configured ? '••••••••  (Configured — enter to replace)' : 'Enter GROQ_API_KEY_1'}
            value={keys.GROQ_API_KEY_1}
            onChange={(e) => setKeys({ ...keys, GROQ_API_KEY_1: e.target.value })}
          />
        </div>

        <div className="cascade-key-field">
          <label>
            <span>Groq Backup Key 2</span>
            <span style={{ color: configStatus.GROQ_API_KEY_2?.configured ? 'var(--green)' : 'var(--text-muted)' }}>
              {configStatus.GROQ_API_KEY_2?.configured ? '✓ Configured' : 'Optional Backup'}
            </span>
          </label>
          <input
            type="password"
            placeholder={configStatus.GROQ_API_KEY_2?.configured ? '••••••••  (Configured — enter to replace)' : 'Enter GROQ_API_KEY_2'}
            value={keys.GROQ_API_KEY_2}
            onChange={(e) => setKeys({ ...keys, GROQ_API_KEY_2: e.target.value })}
          />
        </div>

        <div className="cascade-key-field">
          <label>
            <span>Groq Backup Key 3</span>
            <span style={{ color: configStatus.GROQ_API_KEY_3?.configured ? 'var(--green)' : 'var(--text-muted)' }}>
              {configStatus.GROQ_API_KEY_3?.configured ? '✓ Configured' : 'Optional Backup'}
            </span>
          </label>
          <input
            type="password"
            placeholder={configStatus.GROQ_API_KEY_3?.configured ? '••••••••  (Configured — enter to replace)' : 'Enter GROQ_API_KEY_3'}
            value={keys.GROQ_API_KEY_3}
            onChange={(e) => setKeys({ ...keys, GROQ_API_KEY_3: e.target.value })}
          />
        </div>
      </div>

      <div className="cascade-section-kicker" style={{ marginTop: '14px' }}>Thinking Cloud Providers (OpenRouter &amp; OpenCode)</div>
      <div className="cascade-key-bar">
        <div className="cascade-key-field">
          <label>
            <span>OpenRouter API Key (Tier 2 Cloud)</span>
            <span style={{ color: openrouterConfigured ? 'var(--green)' : 'var(--orange-bright)' }}>
              {openrouterConfigured ? '✓ Configured' : 'Key Required'}
            </span>
          </label>
          <input
            type="password"
            placeholder={openrouterConfigured ? '••••••••  (Configured — enter to replace)' : 'Enter OPENROUTER_API_KEY'}
            value={keys.OPENROUTER_API_KEY}
            onChange={(e) => setKeys({ ...keys, OPENROUTER_API_KEY: e.target.value })}
          />
        </div>

        <div className="cascade-key-field">
          <label>
            <span>OpenCode Zen API Key</span>
            <span style={{ color: opencodeConfigured ? 'var(--green)' : 'var(--text-muted)' }}>
              {opencodeConfigured ? '✓ Configured' : 'Optional'}
            </span>
          </label>
          <input
            type="password"
            placeholder={opencodeConfigured ? '••••••••  (Configured — enter to replace)' : 'Enter OPENCODE_ZEN_API_KEY'}
            value={keys.OPENCODE_ZEN_API_KEY}
            onChange={(e) => setKeys({ ...keys, OPENCODE_ZEN_API_KEY: e.target.value })}
          />
        </div>
      </div>

      <div className="cascade-section-kicker" style={{ marginTop: '14px' }}>Voice Speech Synthesis (Fish Studio &amp; ElevenLabs)</div>
      <div className="cascade-key-bar">
        <div className="cascade-key-field">
          <label>
            <span>Fish Audio API Key</span>
            <span style={{ color: fishConfigured ? 'var(--green)' : 'var(--orange-bright)' }}>
              {fishConfigured ? '✓ Configured' : 'Key Required'}
            </span>
          </label>
          <input
            type="password"
            placeholder={fishConfigured ? '••••••••  (Configured)' : 'Enter FISH_AUDIO_API_KEY'}
            value={keys.FISH_AUDIO_API_KEY}
            onChange={(e) => setKeys({ ...keys, FISH_AUDIO_API_KEY: e.target.value })}
          />
        </div>

        <div className="cascade-key-field">
          <label>
            <span>Fish Studio EN Voice ID (Model: s2-pro)</span>
            <span style={{ color: 'var(--green)' }}>
              {configStatus.FISH_AUDIO_VOICE_ID?.value ? '✓ Configured' : 'Default Ready'}
            </span>
          </label>
          <input
            type="text"
            placeholder={configStatus.FISH_AUDIO_VOICE_ID?.value || '05b36da8574341d0803391491850db20'}
            value={keys.FISH_AUDIO_VOICE_ID}
            onChange={(e) => setKeys({ ...keys, FISH_AUDIO_VOICE_ID: e.target.value })}
          />
        </div>

        <div className="cascade-key-field">
          <label>
            <span>Fish Studio HI Voice ID (Model: s2-pro)</span>
            <span style={{ color: 'var(--green)' }}>
              {configStatus.FISH_AUDIO_VOICE_ID_HI?.value ? '✓ Configured' : 'Default Ready'}
            </span>
          </label>
          <input
            type="text"
            placeholder={configStatus.FISH_AUDIO_VOICE_ID_HI?.value || '817eba7f1aea469f9802326568d427b9'}
            value={keys.FISH_AUDIO_VOICE_ID_HI}
            onChange={(e) => setKeys({ ...keys, FISH_AUDIO_VOICE_ID_HI: e.target.value })}
          />
        </div>

        <div className="cascade-key-field">
          <label>
            <span>ElevenLabs API Key</span>
            <span style={{ color: elevenConfigured ? 'var(--green)' : 'var(--orange-bright)' }}>
              {elevenConfigured ? '✓ Configured' : 'Key Required'}
            </span>
          </label>
          <input
            type="password"
            placeholder={elevenConfigured ? '••••••••  (Configured)' : 'Enter ELEVENLABS_API_KEY'}
            value={keys.ELEVENLABS_API_KEY}
            onChange={(e) => setKeys({ ...keys, ELEVENLABS_API_KEY: e.target.value })}
          />
        </div>

        <div className="cascade-key-field">
          <label>
            <span>ElevenLabs EN Voice ID (multilingual_v2)</span>
            <span style={{ color: 'var(--green)' }}>
              {configStatus.ELEVENLABS_VOICE_ID?.value ? '✓ Configured' : 'Default Ready'}
            </span>
          </label>
          <input
            type="text"
            placeholder={configStatus.ELEVENLABS_VOICE_ID?.value || 'bIHbv24MWmeRgasZH58o'}
            value={keys.ELEVENLABS_VOICE_ID}
            onChange={(e) => setKeys({ ...keys, ELEVENLABS_VOICE_ID: e.target.value })}
          />
        </div>

        <div className="cascade-key-field">
          <label>
            <span>ElevenLabs HI Voice ID (multilingual_v2)</span>
            <span style={{ color: 'var(--green)' }}>
              {configStatus.ELEVENLABS_VOICE_ID_HI?.value ? '✓ Configured' : 'Default Ready'}
            </span>
          </label>
          <input
            type="text"
            placeholder={configStatus.ELEVENLABS_VOICE_ID_HI?.value || 'czQ9pLzjRaF61EAYjcPC'}
            value={keys.ELEVENLABS_VOICE_ID_HI}
            onChange={(e) => setKeys({ ...keys, ELEVENLABS_VOICE_ID_HI: e.target.value })}
          />
        </div>
      </div>

      <div className="cascade-actions-row">
        <button
          type="button"
          className="primary-action"
          disabled={saving}
          onClick={saveCascade}
        >
          {saving ? 'Saving...' : 'Save & Activate Pipeline'}
        </button>
        <div className="cascade-voice-test-btns">
          <button
            type="button"
            className="secondary-action"
            disabled={testingVoice}
            onClick={() => testSpeech('en')}
          >
            Test English (Fish Audio ➔ ElevenLabs)
          </button>
          <button
            type="button"
            className="secondary-action"
            disabled={testingVoice}
            onClick={() => testSpeech('hi')}
          >
            Test Hindi (ElevenLabs ➔ Fish Audio)
          </button>
        </div>
        {statusMsg && <span className="cascade-status-msg mono">{statusMsg}</span>}
      </div>
    </section>
  );
}

function AppearancePanel() {
  const [appearance, setAppearance] = useAppearance();
  return <section className="workspace-panel settings-section full appearance-panel"><div className="panel-label">Appearance &amp; Interface</div><p className="setting-help">Personalize the interface locally. Changes persist in this browser.</p><div className="form-grid appearance-grid"><label>Default interface<select value={appearance.defaultFrontend || 'galaxy'} onChange={(event) => setAppearance((current) => ({ ...current, defaultFrontend: event.target.value }))}><option value="galaxy">JARVIS Galaxy (3D Windowed OS)</option><option value="legacy">Legacy Console (Cyberpunk Dashboard)</option></select></label><label>Theme<select value={appearance.theme} onChange={(event) => setAppearance((current) => ({ ...current, theme: event.target.value }))}><option value="carbon">Carbon / amber</option><option value="midnight">Midnight / cyan</option><option value="light">Light / amber</option></select></label><label>Font size <span className="range-value">{appearance.fontSize}px</span><input type="range" min="13" max="20" value={appearance.fontSize} onChange={(event) => setAppearance((current) => ({ ...current, fontSize: Number(event.target.value) }))} /></label><label>Accent colour<div className="colour-control"><input type="color" value={appearance.accent} onChange={(event) => setAppearance((current) => ({ ...current, accent: event.target.value }))} /><code>{appearance.accent.toUpperCase()}</code></div></label></div></section>;
}

function SettingsWorkspace() {
  return <div className="workspace-page">
    <WorkspaceHeader view="settings" />
    <div className="settings-grid">
      <CascadeWorkflowPanel />
      <AppearancePanel />
      <CredentialsPanel />
      <VoicePanel />
    </div>
  </div>;
}

export default function WorkspaceViews({ view }) {
  const views = {
    chat: <ChatWorkspace />, brain: <BrainManager />, tasks: <TasksWorkspace />, approvals: <ApprovalsWorkspace />,
    connections: <ConnectionsWorkspace />, workflows: <WorkflowsWorkspace />, goals: <GoalsWorkspace />,
    agents: <AgentsWorkspace />, skills: <SkillsWorkspace />, settings: <div className="settings-shell"><ComposioPanel /><SettingsWorkspace /></div>,
  };
  return views[view] || null;
}
