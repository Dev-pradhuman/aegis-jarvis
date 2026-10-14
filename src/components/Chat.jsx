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

function makeMsgId(prefix = 'msg') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeServerMessages(list) {
  if (!Array.isArray(list)) return [];
  return list.map((m, i) => ({
    ...m,
    id: m.id || `srv-${i}-${m.time || ''}`
  }));
}

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const isTypingRef = useRef(false);
  const initialLoadedRef = useRef(false);
  const [serviceOnline, setServiceOnline] = useState(false);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('jarvis_speech_enabled');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const recorderRef = useRef(null);
  const logRef = useRef(null);
  const currentAudioRef = useRef(null);

  const updateTyping = (typing) => {
    isTypingRef.current = typing;
    setIsTyping(typing);
  };

  const toggleSpeech = () => {
    setSpeechEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem('jarvis_speech_enabled', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  useEffect(() => () => {
    try { recorderRef.current?.stop(); } catch {}
    recorderRef.current = null;
    try { currentAudioRef.current?.pause(); } catch {}
    currentAudioRef.current = null;
  }, []);

  useEffect(() => {
    const handleError = (e) => {
      setMessages((prev) => [...prev, { who: 'JARVIS', time: nowTime(), lines: [`Voice Pipeline Error: ${e.detail.message}`] }]);
    };
    window.addEventListener('jarvis:voice_error', handleError);
    return () => window.removeEventListener('jarvis:voice_error', handleError);
  }, []);

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
      const serverMessages = Array.isArray(data.messages) ? data.messages : [];
      setServiceOnline(true);

      if (!initialLoadedRef.current) {
        initialLoadedRef.current = true;
        setMessages(normalizeServerMessages(serverMessages));
        return;
      }

      // During active typing or streaming, NEVER wipe out local messages with a stale server snapshot
      if (isTypingRef.current) return;

      // Only sync if server has new messages from background tasks
      setMessages((prev) => {
        if (serverMessages.length > prev.length) {
          return normalizeServerMessages(serverMessages);
        }
        return prev;
      });
    }, { connectedMs: 5000, onError: () => setServiceOnline(false) });
  }, []);

  async function speakReply(text) {
    const cleanText = String(text || '')
      .replace(/```[\s\S]*?```/g, ' Code snippet omitted. ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*_#~]/g, '')
      .trim();
    if (!cleanText) return;

    try {
      if (currentAudioRef.current) {
        try {
          currentAudioRef.current.pause();
          currentAudioRef.current.currentTime = 0;
        } catch {}
        currentAudioRef.current = null;
      }

      const response = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: cleanText })
      });
      if (response.status === 204) {
        visual('idle');
        return;
      }
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const payload = await response.json().catch(() => ({}));
        if (payload.textOnly) {
          visual('idle');
          return;
        }
      }
      if (!response.ok) {
        console.warn('[JARVIS TTS response error]', response.status);
        throw new Error(`TTS HTTP ${response.status}`);
      }
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (currentAudioRef.current === audio) currentAudioRef.current = null;
        visual('idle');
      };
      audio.onerror = (e) => {
        console.error('[JARVIS TTS audio error]', e);
        URL.revokeObjectURL(url);
        if (currentAudioRef.current === audio) currentAudioRef.current = null;
        visual('idle');
      };
      visual('speaking');
      try {
        await audio.play();
      } catch (playErr) {
        console.warn('[JARVIS TTS play blocked or failed]', playErr);
        visual('idle');
      }
    } catch (err) {
      console.warn('[JARVIS TTS speak error]', err);
      visual('idle');
    }
  }

  async function sendMessage(value = input, speak = null) {
    const val = String(value).trim();
    if (!val) return;
    const shouldSpeak = speak !== null ? speak : speechEnabled;
    const immediateUrl = /^(open|launch|go to)\s+(youtube|youtube\.com)\b/i.test(val) ? 'https://www.youtube.com' : null;
    const openedImmediately = Boolean(immediateUrl);
    if (immediateUrl) window.open(immediateUrl, '_blank', 'noopener,noreferrer');

    const userMsgId = makeMsgId('user');
    const assistantMsgId = makeMsgId('jarvis');

    setMessages((prev) => [...prev, { id: userMsgId, who: 'YOU', time: nowTime(), lines: [val] }]);
    setInput('');
    updateTyping(true);
    visual('thinking');

    try {
      const response = await fetch('/api/chat', { 
        method: 'POST', 
        headers: { 'content-type': 'application/json', 'Accept': 'text/event-stream' }, 
        body: JSON.stringify({ message: val }) 
      });

      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let reply = '';
        let placeholderAdded = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('data: ')) {
                try {
                  const data = JSON.parse(trimmed.slice(6));
                  if (data.type === 'token') {
                    reply += data.text;
                    if (!placeholderAdded) {
                      placeholderAdded = true;
                      setMessages((prev) => [...prev, { id: assistantMsgId, who: 'JARVIS', time: nowTime(), lines: [reply] }]);
                    } else {
                      setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, lines: [reply] } : m));
                    }
                  } else if (data.type === 'done') {
                    if (data.action?.action === 'open_url' && !openedImmediately) window.open(data.action.url, '_blank', 'noopener,noreferrer');
                    const finalReply = data.reply || data.error || reply || 'Request could not be completed.';
                    const routingDebug = data.routing ? { taskType: data.routing.taskType, confidence: data.routing.routingConfidence, apiRotationCount: data.routing.apiRotationCount, modelFallbackUsed: data.routing.modelFallbackUsed, totalMs: data.routing.totalMs } : null;
                    
                    if (!placeholderAdded) {
                      placeholderAdded = true;
                      setMessages((prev) => [...prev, { id: assistantMsgId, who: 'JARVIS', time: nowTime(), lines: [finalReply], modelIndicator: data.modelIndicator, routingDebug, media: data.media }]);
                    } else {
                      setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, lines: [finalReply], modelIndicator: data.modelIndicator, routingDebug, media: data.media } : m));
                    }
                    if (shouldSpeak) void speakReply(finalReply);
                  }
                } catch (e) {}
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      } else {
        const data = await response.json();
        if (data.action?.action === 'open_url' && !openedImmediately) window.open(data.action.url, '_blank', 'noopener,noreferrer');
        const reply = data.reply || data.error || 'Request could not be completed.';
        const routingDebug = data.routing ? { taskType: data.routing.taskType, confidence: data.routing.routingConfidence, apiRotationCount: data.routing.apiRotationCount, modelFallbackUsed: data.routing.modelFallbackUsed, totalMs: data.routing.totalMs } : null;
        setMessages((prev) => [...prev, { id: assistantMsgId, who: 'JARVIS', time: nowTime(), lines: [reply], modelIndicator: data.modelIndicator, routingDebug, media: data.media }]);
        if (shouldSpeak) void speakReply(reply);
      }
    } catch {
      setMessages((prev) => [...prev, { id: makeMsgId('err'), who: 'JARVIS', time: nowTime(), lines: ['Local service unavailable. I retained your request in this session.'] }]);
    } finally {
      updateTyping(false);
      if (!shouldSpeak) visual('idle');
    }
  }

  async function recordWithMediaRecorder() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000
        }
      });
      const chunks = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
            ? 'audio/ogg;codecs=opus'
            : '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        setListening(false);
        setTranscribing(true);
        visual('thinking');
        recorderRef.current = null;
        stream.getTracks().forEach((track) => track.stop());

        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 500) {
          console.info('[JARVIS Voice] Audio too short to contain speech');
          setTranscribing(false);
          visual('idle');
          return;
        }

        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64Audio = String(reader.result).split(',')[1];
            if (!base64Audio) throw new Error('Failed to read recorded audio');
            const response = await fetch('/api/voice/transcribe', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ audio: base64Audio, mimeType: blob.type, fileName: 'speech.webm' })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Transcription failed');
            if (data.noSpeech || !data.text || !data.text.trim()) {
              console.info('[JARVIS Voice] No clear speech detected');
              setTranscribing(false);
              visual('idle');
              return;
            }
            const recognized = data.text.trim();
            setInput('');
            setTranscribing(false);
            await sendMessage(recognized, true);
          } catch (error) {
            console.error('[JARVIS Voice Error]', error);
            setMessages((prev) => [...prev, { id: makeMsgId('voice-err'), who: 'JARVIS', time: nowTime(), lines: [`Voice transcription error: ${error.message}`] }]);
            setTranscribing(false);
            visual('idle');
          }
        };
        reader.readAsDataURL(blob);
      };
      recorder.start(100);
      setListening(true);
      visual('listening');
    } catch (err) {
      setListening(false);
      setTranscribing(false);
      visual('idle');
      recorderRef.current = null;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMessages((prev) => [...prev, { id: makeMsgId('perm-err'), who: 'JARVIS', time: nowTime(), lines: ['Microphone permission was denied. Please allow microphone access in your browser site permissions.'] }]);
      } else if (err.name === 'NotFoundError') {
        setMessages((prev) => [...prev, { id: makeMsgId('not-found-err'), who: 'JARVIS', time: nowTime(), lines: ['No microphone detected on this system.'] }]);
      } else {
        setMessages((prev) => [...prev, { id: makeMsgId('mic-err'), who: 'JARVIS', time: nowTime(), lines: [`Microphone error: ${err.message || 'Access unavailable'}`] }]);
      }
    }
  }

  async function toggleVoice() {
    if (recorderRef.current) {
      recorderRef.current.stop();
      return;
    }
    if (transcribing) return;
    try {
      const voiceStatus = await fetch('/api/voice/tts').then((response) => response.ok ? response.json() : ({})).catch(() => ({}));
      // Prefer MediaRecorder + Groq Whisper STT whenever available
      if (voiceStatus.sttProvider === 'groq' || voiceStatus.groq?.configured || voiceStatus.sttProvider !== 'browser') {
        await recordWithMediaRecorder();
        return;
      }

      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Recognition) {
        await recordWithMediaRecorder();
        return;
      }
      const recognition = new Recognition();
      let submitted = false;
      recognition.lang = 'en-IN';
      recognition.interimResults = false;
      recognition.onstart = () => { setListening(true); visual('listening'); };
      recognition.onend = () => { setListening(false); recorderRef.current = null; if (!submitted) visual('idle'); };
      recognition.onerror = async () => {
        try {
          await recordWithMediaRecorder();
        } catch {
          setMessages((prev) => [...prev, { id: makeMsgId('mic-err'), who: 'JARVIS', time: nowTime(), lines: ['Microphone access failed. Please ensure microphone permissions are granted.'] }]);
        }
      };
      recognition.onresult = (event) => {
        submitted = true;
        const text = event.results[0]?.[0]?.transcript?.trim();
        if (text) {
          setInput('');
          void sendMessage(text, true);
        }
      };
      recognition.start();
      recorderRef.current = { stop: () => recognition.stop() };
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMessages((prev) => [...prev, { id: makeMsgId('perm-err'), who: 'JARVIS', time: nowTime(), lines: ['Microphone permission was denied. Please allow microphone access in your browser site permissions.'] }]);
      } else if (err.name === 'NotFoundError') {
        setMessages((prev) => [...prev, { id: makeMsgId('not-found-err'), who: 'JARVIS', time: nowTime(), lines: ['No microphone detected on this system.'] }]);
      } else {
        setMessages((prev) => [...prev, { id: makeMsgId('mic-err'), who: 'JARVIS', time: nowTime(), lines: [`Microphone error: ${err.message || 'Access unavailable'}`] }]);
      }
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') sendMessage();
  }

  const lastMsg = messages[messages.length - 1];
  const lastIsStreamingJarvis = lastMsg?.who === 'JARVIS' && (lastMsg.lines?.join('').length || 0) > 0;

  return (
    <section className="chat-panel hud-panel">
      <div className="chat-head">
        <div className="hud-title">Jarvis Chat Interface</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className={`send-btn speech-toggle-btn${speechEnabled ? ' active' : ''}`}
            onClick={toggleSpeech}
            title={speechEnabled ? "Voice responses active (Click to mute)" : "Voice responses muted (Click to enable)"}
            aria-label="Toggle voice output"
          >
            <Icon name={speechEnabled ? "speaker" : "speakerOff"} />
          </button>
          <div className={`status ${serviceOnline ? 'online' : 'offline'}`}>
            {serviceOnline ? 'ONLINE' : 'OFFLINE'} <span className={`dot ${serviceOnline ? 'green' : 'red'}`}></span>
          </div>
        </div>
      </div>

      <div className="chat-log" ref={logRef}>
        {!messages.length && !isTyping && <div className="chat-empty">No conversations yet. Send a message to start a live JARVIS session.</div>}
        {messages.map((m, i) => (
          <div className={`msg ${m.who === 'JARVIS' ? 'jarvis' : 'user'}`} key={m.id || `msg-${i}`}>
            <div className="who">
              <span>{m.who}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                <span className="time">{m.time}</span>
                {m.who === 'JARVIS' && (
                  <button
                    type="button"
                    className="msg-speak-btn"
                    onClick={() => speakReply(m.lines.join(' '))}
                    title="Play audio response"
                    aria-label="Play audio"
                  >
                    <Icon name="speaker" />
                  </button>
                )}
              </span>
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
        {isTyping && !lastIsStreamingJarvis && (
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
          placeholder={listening ? "Listening to your voice..." : transcribing ? "Transcribing speech with Whisper..." : "Type your command..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={transcribing}
        />
        <button
          type="button"
          className={`send-btn speech-toggle-btn${speechEnabled ? ' active' : ''}`}
          onClick={toggleSpeech}
          title={speechEnabled ? "Voice replies active (Click to mute)" : "Voice replies muted (Click to unmute)"}
          aria-label="Toggle voice output"
        >
          <Icon name={speechEnabled ? "speaker" : "speakerOff"} />
        </button>
        <button
          type="button"
          className={`send-btn voice-btn${listening ? ' listening' : ''}${transcribing ? ' transcribing' : ''}`}
          onClick={toggleVoice}
          disabled={transcribing}
          title={listening ? "Click to stop and transcribe" : transcribing ? "Transcribing voice..." : "Click to speak"}
          aria-label={listening ? 'Stop listening' : 'Start voice input'}
        >
          <Icon name="voice" />
        </button>
        <button type="button" className="send-btn" onClick={() => sendMessage()} disabled={transcribing}>
          <Icon name="send" />
        </button>
      </div>
    </section>
  );
}
