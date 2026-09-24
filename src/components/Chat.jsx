import { useEffect, useRef, useState } from 'react';
import { pollWithBackoff } from '../hooks/pollWithBackoff.js';
import Icon from './Icon.jsx';
import '../styles/chat.css';

const MODEL_LABELS = { 'muse-spark-1.2': 'Muse Spark 1.2', 'deepseek-v4-flash': 'DeepSeek V4 Flash', 'glm-5.2': 'GLM-5.2', 'laguna-s-2.1': 'Laguna S 2.1', 'minimax-m3': 'MiniMax M3', 'nemotron-3-nano-omni': 'Nemotron 3 Nano Omni', 'mimo-v2.5': 'MiMo V2.5', 'nemotron-3.5-lightning': 'Nemotron 3.5 Lightning' };
const visual = (phase) => window.dispatchEvent(new CustomEvent('jarvis:visual', { detail: { phase } }));

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
  const recorderRef = useRef(null);
  const logRef = useRef(null);

  useEffect(() => () => { try { recorderRef.current?.stop(); } catch {} recorderRef.current = null; }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  useEffect(() => {
    return pollWithBackoff(async (signal) => {
      const response = await fetch('/api/chats', { signal });
      if (!response.ok) throw new Error(`Chat ${response.status}`);
      const data = await response.json();
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setServiceOnline(true);
    }, { connectedMs: 5000, onError: () => setServiceOnline(false) });
  }, []);

  async function speakReply(text) {
    try { const response = await fetch('/api/voice/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) }); if (!response.ok) throw new Error(); const url = URL.createObjectURL(await response.blob()); const audio = new Audio(url); audio.onended = () => { URL.revokeObjectURL(url); visual('idle'); }; audio.onerror = () => { URL.revokeObjectURL(url); visual('idle'); }; visual('speaking'); await audio.play(); } catch { if (window.speechSynthesis) { const utterance = new SpeechSynthesisUtterance(text); utterance.onstart = () => visual('speaking'); utterance.onend = () => visual('idle'); utterance.onerror = () => visual('idle'); window.speechSynthesis.speak(utterance); } else visual('idle'); }
  }

  async function sendMessage(value = input, speak = false) {
    const val = String(value).trim();
    if (!val) return;
    const immediateUrl = /^(open|launch|go to)\s+(youtube|youtube\.com)\b/i.test(val) ? 'https://www.youtube.com' : null;
    const openedImmediately = Boolean(immediateUrl);
    if (immediateUrl) window.open(immediateUrl, '_blank', 'noopener,noreferrer');

    setMessages((prev) => [...prev, { who: 'YOU', time: nowTime(), lines: [val] }]);
    setInput('');
    setIsTyping(true);
    visual('thinking');

    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: val }) });
      const data = await response.json();
      if (data.action?.action === 'open_url' && !openedImmediately) window.open(data.action.url, '_blank', 'noopener,noreferrer');
      const reply = data.reply || data.error || 'Request could not be completed.';
      const routingDebug = data.routing ? { taskType: data.routing.taskType, confidence: data.routing.routingConfidence, apiRotationCount: data.routing.apiRotationCount, modelFallbackUsed: data.routing.modelFallbackUsed, totalMs: data.routing.totalMs } : null;
      setMessages((prev) => [...prev, { who: 'JARVIS', time: nowTime(), lines: [reply], modelIndicator: data.modelIndicator, routingDebug, media: data.media }]);
      if (speak) void speakReply(reply);
    } catch {
      setMessages((prev) => [...prev, { who: 'JARVIS', time: nowTime(), lines: ['Local service unavailable. I retained your request in this session.'] }]);
    } finally {
      setIsTyping(false);
      if (!speak) visual('idle');
    }
  }

  async function toggleVoice() {
    if (recorderRef.current) { recorderRef.current.stop(); return; }
    try {
      const voiceStatus = await fetch('/api/voice/tts').then((response) => response.ok ? response.json() : ({})).catch(() => ({}));
      if (voiceStatus.sttProvider === 'browser') { const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition; if (!Recognition) throw new Error('Browser speech recognition is unavailable'); const recognition = new Recognition(); let submitted = false; recognition.lang = 'en-IN'; recognition.interimResults = false; recognition.onstart = () => { setListening(true); visual('listening'); }; recognition.onend = () => { setListening(false); recorderRef.current = null; if (!submitted) visual('idle'); }; recognition.onerror = () => setMessages((prev) => [...prev, { who: 'JARVIS', time: nowTime(), lines: ['Browser speech recognition failed. Check microphone permission.'] }]); recognition.onresult = (event) => { submitted = true; const text = event.results[0][0].transcript; setInput(text); void sendMessage(text, true); }; recognition.start(); recorderRef.current = { stop: () => recognition.stop() }; return; }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      const chunks = []; const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : undefined }); recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => { setListening(false); visual('thinking'); recorderRef.current = null; stream.getTracks().forEach((track) => track.stop()); const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }); const reader = new FileReader(); reader.onloadend = async () => { try { setIsTyping(true); const response = await fetch('/api/voice/transcribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ audio: String(reader.result).split(',')[1], mimeType: blob.type, fileName: 'speech.webm' }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Transcription failed'); setInput(data.text); await sendMessage(data.text, true); } catch (error) { setMessages((prev) => [...prev, { who: 'JARVIS', time: nowTime(), lines: [error.message] }]); setIsTyping(false); visual('idle'); } }; reader.readAsDataURL(blob); };
      recorder.start(); setListening(true); visual('listening');
    } catch { setMessages((prev) => [...prev, { who: 'JARVIS', time: nowTime(), lines: ['Microphone access is unavailable. Check browser permission and Groq configuration.'] }]); }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') sendMessage();
  }

  return (
    <section className="chat-panel hud-panel">
      <div className="chat-head">
        <div className="hud-title">Jarvis Chat Interface</div>
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
        {isTyping && (
          <div className="msg jarvis">
            <div className="who">JARVIS</div>
            <div className="typing">
              <span></span>
              <span></span>
              <span></span>
            </div>
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
        />
        <button type="button" className={`send-btn voice-btn${listening ? ' listening' : ''}`} onClick={toggleVoice} aria-label={listening ? 'Stop listening' : 'Start voice input'}><Icon name="voice" /></button>
        <button type="button" className="send-btn" onClick={() => sendMessage()}>
          <Icon name="send" />
        </button>
      </div>
    </section>
  );
}
