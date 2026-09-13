import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import '../styles/chat.css';

const MODEL_LABELS = { 'chatgpt-web': 'ChatGPT Headless', 'gemini-web': 'Gemini Headless', 'muse-spark-1.2': 'Muse Spark 1.2', 'deepseek-v4-flash': 'DeepSeek V4 Flash', 'glm-5.2': 'GLM-5.2', 'laguna-s-2.1': 'Laguna S 2.1', 'minimax-m3': 'MiniMax M3', 'nemotron-3-nano-omni': 'Nemotron 3 Nano Omni', 'mimo-v2.5': 'MiMo V2.5', 'nemotron-3.5-lightning': 'Nemotron 3.5 Lightning' };

function nowTime() {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
}

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [serviceOnline, setServiceOnline] = useState(false);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [streamed, setStreamed] = useState({ text: '', activities: [], backend: null });
  const recorderRef = useRef(null);
  const logRef = useRef(null);
  const streamSequenceRef = useRef(0);
  const streamReadyRef = useRef(false);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  useEffect(() => {
    let mounted = true;
    const refresh = (requestedId = null) => Promise.all([fetch('/api/chats' + ((requestedId || conversationId) ? `?sessionId=${encodeURIComponent(requestedId || conversationId)}` : '')), fetch('/api/sessions')]).then(async ([response, sessionsResponse]) => {
      setServiceOnline(response.ok);
      const data = response.ok ? await response.json() : null; const sessionData = sessionsResponse.ok ? await sessionsResponse.json() : null; return { data, sessionData };
    }).then(({ data, sessionData }) => { if (mounted) { setMessages(Array.isArray(data?.messages) ? data.messages : []); setConversationId(data?.conversationId || requestedId || null); setSessions(sessionData?.sessions || []); } }).catch(() => { if (mounted) setServiceOnline(false); });
    refresh();
    const timer = setInterval(refresh, 5000);
    const dictated = (event) => setInput((current) => `${current}${current ? ' ' : ''}${event.detail?.text || ''}`);
    const changed = (event) => refresh(event.detail?.sessionId || null);
    const messagesRefresh = () => refresh();
    window.addEventListener('jarvis:dictation', dictated); window.addEventListener('jarvis:messages-refresh', messagesRefresh); window.addEventListener('jarvis:session-change', changed);
    return () => { mounted = false; clearInterval(timer); window.removeEventListener('jarvis:dictation', dictated); window.removeEventListener('jarvis:messages-refresh', messagesRefresh); window.removeEventListener('jarvis:session-change', changed); };
  }, [conversationId]);

  useEffect(() => {
    if (!isTyping || !conversationId) return undefined;
    let active = true;
    const poll = async () => {
      if (!streamReadyRef.current) return;
      try {
        const response = await fetch(`/api/generation/events?sessionId=${encodeURIComponent(conversationId)}&after=${streamSequenceRef.current}`);
        const data = response.ok ? await response.json() : { events: [] };
        for (const event of data.events || []) {
          streamSequenceRef.current = Math.max(streamSequenceRef.current, Number(event.sequence || 0));
          if (event.type === 'generation.delta') setStreamed((current) => ({ ...current, backend: event.backend || current.backend, text: event.replace ? event.delta : current.text + (event.delta || '') }));
          if (event.type === 'tool.start') setStreamed((current) => ({ ...current, activities: [...current.activities.filter((item) => item.id !== event.toolCallId), { id: event.toolCallId, tool: event.tool, state: 'running' }] }));
          if (event.type === 'tool.result') setStreamed((current) => ({ ...current, activities: current.activities.map((item) => item.id === event.toolCallId ? { ...item, state: event.status, verified: event.verified, error: event.error } : item) }));
        }
      } catch {}
    };
    void poll(); const timer = window.setInterval(() => { if (active) void poll(); }, 80);
    return () => { active = false; window.clearInterval(timer); };
  }, [isTyping, conversationId]);

  async function speakReply(text) {
    try { const response = await fetch('/api/voice/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }); if (!response.ok) throw new Error(); const url = URL.createObjectURL(await response.blob()); const audio = new Audio(url); audio.onended = () => URL.revokeObjectURL(url); await audio.play(); } catch { window.speechSynthesis?.speak(new SpeechSynthesisUtterance(text)); }
  }

  async function sendMessage(value = input, speak = false, source = 'chat') {
    const val = String(value).trim();
    if (!val) return;
    setMessages((prev) => [...prev, { who: 'YOU', time: nowTime(), lines: [val] }]);
    setInput('');
    streamReadyRef.current = false;
    setIsTyping(true);
    setStreamed({ text: '', activities: [], backend: null });

    try {
      const baseline = await fetch(`/api/generation/events?sessionId=${encodeURIComponent(conversationId || '')}&after=0`).then((response) => response.ok ? response.json() : ({ events: [] })).catch(() => ({ events: [] }));
      streamSequenceRef.current = Math.max(0, ...(baseline.events || []).map((event) => Number(event.sequence || 0)));
      streamReadyRef.current = true;
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: val, source, conversationId }) });
      const data = await response.json();
      const reply = data.reply || data.error || 'Request could not be completed.';
      const routingDebug = data.routing ? { taskType: data.routing.taskType, confidence: data.routing.routingConfidence, apiRotationCount: data.routing.apiRotationCount, modelFallbackUsed: data.routing.modelFallbackUsed, totalMs: data.routing.totalMs } : null;
      setMessages((prev) => [...prev, { who: 'JARVIS', time: nowTime(), lines: [reply], modelIndicator: data.modelIndicator, routingDebug, media: data.media }]);
      if (speak) void speakReply(reply);
    } catch {
      setMessages((prev) => [...prev, { who: 'JARVIS', time: nowTime(), lines: ['Local service unavailable. I retained your request in this session.'] }]);
    } finally {
      setIsTyping(false);
      streamReadyRef.current = false;
      setStreamed({ text: '', activities: [], backend: null });
    }
  }

  async function stopGeneration() { await fetch('/api/generation/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: conversationId }) }).catch(() => {}); }

  async function toggleVoice() {
    if (recorderRef.current) { recorderRef.current.stop(); return; }
    try {
      const voiceStatus = await fetch('/api/voice/tts').then((response) => response.ok ? response.json() : ({})).catch(() => ({}));
      if (voiceStatus.sttProvider === 'browser') { const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition; if (!Recognition) throw new Error('Browser speech recognition is unavailable'); const recognition = new Recognition(); recognition.lang = 'en-IN'; recognition.interimResults = false; recognition.onstart = () => setListening(true); recognition.onend = () => { setListening(false); recorderRef.current = null; }; recognition.onerror = () => setMessages((prev) => [...prev, { who: 'JARVIS', time: nowTime(), lines: ['Browser speech recognition failed. Check microphone permission.'] }]); recognition.onresult = (event) => { const text = event.results[0][0].transcript; setInput(text); void sendMessage(text, true, 'voice'); }; recognition.start(); recorderRef.current = { stop: () => recognition.stop() }; return; }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      const chunks = []; const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : undefined }); recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => { setListening(false); recorderRef.current = null; stream.getTracks().forEach((track) => track.stop()); const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }); const reader = new FileReader(); reader.onloadend = async () => { try { setIsTyping(true); const response = await fetch('/api/voice/transcribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ audio: String(reader.result).split(',')[1], mimeType: blob.type, fileName: 'speech.webm' }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Transcription failed'); setInput(data.text); await sendMessage(data.text, true, 'voice'); } catch (error) { setMessages((prev) => [...prev, { who: 'JARVIS', time: nowTime(), lines: [error.message] }]); setIsTyping(false); } }; reader.readAsDataURL(blob); };
      recorder.start(); setListening(true);
    } catch { setMessages((prev) => [...prev, { who: 'JARVIS', time: nowTime(), lines: ['Microphone access is unavailable. Check browser permission and Groq configuration.'] }]); }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') sendMessage();
  }
  async function chooseSession(id) { await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' }); window.dispatchEvent(new CustomEvent('jarvis:session-change', { detail: { sessionId: id } })); }

  return (
    <section className="chat-panel hud-panel">
      <div className="chat-head">
        <div className="hud-title">Jarvis Chat Interface</div>
        <select className="session-select" aria-label="Conversation session" value={conversationId || ''} onChange={(event) => chooseSession(event.target.value)}>{sessions.map((session) => <option value={session.id} key={session.id}>{session.title}</option>)}</select>
        <div className={`status ${serviceOnline ? 'online' : 'offline'}`}>
          {serviceOnline ? 'ONLINE' : 'OFFLINE'} <span className={`dot ${serviceOnline ? 'green' : 'red'}`}></span>
        </div>
      </div>

      <div className="chat-log" ref={logRef}>
        {!messages.length && !isTyping && <div className="chat-empty">No conversations yet. Send a message to start a live JARVIS session.</div>}
        {messages.map((m, i) => (
          <div className={`msg ${m.who === 'JARVIS' ? 'jarvis' : 'user'}`} key={i}>
            <div className="who">
              {m.who}
              <span className="time">{m.time}</span>
            </div>
            <div className="body">
              {m.lines.map((line, j) => (
                <span key={j}>
                  {line}
                  {j < m.lines.length - 1 && <br />}
                </span>
              ))}
            </div>
            {m.media?.kind === 'image' && m.media.url && <img className="generated-media" src={m.media.url} alt="Generated by JARVIS" />}
            {m.media?.kind === 'video' && <div className="media-job">Video job {m.media.id}: {m.media.status}</div>}
            {m.who === 'JARVIS' && m.modelIndicator?.handledBy && <div className="model-indicator">Handled by {MODEL_LABELS[m.modelIndicator.handledBy] || m.modelIndicator.handledBy}{m.modelIndicator.fallbackFrom ? ` · ${MODEL_LABELS[m.modelIndicator.fallbackFrom] || m.modelIndicator.fallbackFrom} unavailable` : ''}</div>}
            {m.who === 'JARVIS' && m.routingDebug && <div className="routing-debug">Route: {m.routingDebug.taskType} · Confidence: {Math.round(Number(m.routingDebug.confidence || 0) * 100)}% · Rotations: {m.routingDebug.apiRotationCount || 0} · Fallback: {m.routingDebug.modelFallbackUsed ? 'used' : 'not used'} · {m.routingDebug.totalMs || 0}ms</div>}
          </div>
        ))}
        {isTyping && (streamed.text || streamed.activities.length) && <div className="msg jarvis streaming-message"><div className="who">JARVIS <span className="stream-live">LIVE</span></div>{streamed.text && <div className="body streaming-body">{streamed.text}</div>}{streamed.activities.length > 0 && <div className="tool-activity-list">{streamed.activities.map((item) => <div key={item.id} className={`tool-activity ${item.state}`}><span>{item.state === 'running' ? '▸' : item.verified ? '✓' : '×'}</span>{item.state === 'running' ? `Running ${item.tool}…` : `${item.tool} · ${item.verified ? 'verified' : item.error?.code || item.state}`}</div>)}</div>}<button type="button" className="stream-stop" onClick={stopGeneration}>Stop</button></div>}
        {isTyping && !streamed.text && !streamed.activities.length && (
          <div className="msg jarvis">
            <div className="who">JARVIS</div>
            <div className="typing">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <button type="button" className="stream-stop" onClick={stopGeneration}>Stop</button>
          </div>
        )}
      </div>

      <div className="chat-input">
        <input
          type="text"
          placeholder="Type your command..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          data-jarvis-dictation
        />
        <button type="button" className={`send-btn voice-btn${listening ? ' listening' : ''}`} onClick={toggleVoice} aria-label={listening ? 'Stop listening' : 'Start voice input'}><Icon name="voice" /></button>
        <button type="button" className="send-btn" onClick={() => sendMessage()}>
          <Icon name="send" />
        </button>
      </div>
    </section>
  );
}
