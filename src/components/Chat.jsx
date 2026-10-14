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
  const [resumingBrowser, setResumingBrowser] = useState(false);
  const [pendingBrowserChallenge, setPendingBrowserChallenge] = useState(null);
  const recorderRef = useRef(null);
  const logRef = useRef(null);
  const currentAudioRef = useRef(null);
  const ttsAbortControllerRef = useRef(null);
  const activeObjectUrlsRef = useRef(new Set());

  const stopSpeaking = () => {
    if (ttsAbortControllerRef.current) {
      try { ttsAbortControllerRef.current.abort(); } catch {}
      ttsAbortControllerRef.current = null;
    }
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
      } catch {}
      currentAudioRef.current = null;
    }
    for (const url of activeObjectUrlsRef.current) {
      try { URL.revokeObjectURL(url); } catch {}
    }
    activeObjectUrlsRef.current.clear();
    visual('idle');
  };

  const updateTyping = (typing) => {
    isTypingRef.current = typing;
    setIsTyping(typing);
  };

  const toggleSpeech = () => {
    setSpeechEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem('jarvis_speech_enabled', JSON.stringify(next)); } catch {}
      if (!next) {
        stopSpeaking();
      }
      return next;
    });
  };

  useEffect(() => () => {
    try { recorderRef.current?.stop(); } catch {}
    recorderRef.current = null;
    stopSpeaking();
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

      try {
        const bRes = await fetch('/api/browser/status', { signal });
        if (bRes.ok) {
          const bStatus = await bRes.json();
          if (bStatus?.humanActionRequired || bStatus?.state === 'HUMAN_ACTION_REQUIRED') {
            setPendingBrowserChallenge({
              url: bStatus.url || bStatus.pending?.url || '',
              reason: (typeof bStatus.pending?.challenge === 'object' ? bStatus.pending.challenge?.title : bStatus.pending?.challenge) || 'Human verification required in Firefox',
            });
          } else {
            setPendingBrowserChallenge(null);
          }
        }
      } catch {}

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

  function cleanSpeechText(text) {
    return String(text || '')
      .replace(/```[\s\S]*?```/g, ' Code snippet omitted. ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*_#~]/g, '')
      .trim();
  }

  function splitFirstSentence(text) {
    const match = text.match(/([.!?](\s+|$)|[\n]+)/);
    if (!match || match.index === undefined) {
      return [text, ''];
    }
    const boundaryEnd = match.index + match[0].length;
    const first = text.slice(0, boundaryEnd).trim();
    const rest = text.slice(boundaryEnd).trim();
    if (!first || !rest) {
      return [text, ''];
    }
    return [first, rest];
  }

  async function fetchTtsBlob(cleanText, signal) {
    if (!cleanText) return null;
    try {
      const response = await fetch('/api/voice/tts', {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: cleanText })
      });
      if (response.status === 204) return null;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const payload = await response.json().catch(() => ({}));
        if (payload.textOnly) return null;
      }
      if (!response.ok) {
        console.warn('[JARVIS TTS response error]', response.status);
        return null;
      }
      return await response.blob();
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('[JARVIS TTS fetch error]', err);
      }
      return null;
    }
  }

  const playBlobAsync = (blob, signal) => {
    if (!blob || signal?.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      activeObjectUrlsRef.current.add(url);
      const audio = new Audio(url);
      currentAudioRef.current = audio;

      const cleanup = () => {
        activeObjectUrlsRef.current.delete(url);
        URL.revokeObjectURL(url);
        if (currentAudioRef.current === audio) currentAudioRef.current = null;
      };

      audio.onended = () => {
        cleanup();
        resolve();
      };
      audio.onerror = () => {
        cleanup();
        resolve();
      };

      visual('speaking');
      audio.play().catch((err) => {
        console.warn('[JARVIS Audio play blocked]', err);
        cleanup();
        resolve();
      });
    });
  };

  async function speakReply(text) {
    stopSpeaking();
    const cleanText = cleanSpeechText(text);
    if (!cleanText) return;

    const controller = new AbortController();
    ttsAbortControllerRef.current = controller;

    try {
      if (cleanText.length > 180) {
        const [first, rest] = splitFirstSentence(cleanText);
        if (first && rest) {
          // Fetch sentence 1 immediately while pre-fetching the remainder in the background
          const firstPromise = fetchTtsBlob(first, controller.signal);
          const restPromise = fetchTtsBlob(rest, controller.signal);

          const firstBlob = await firstPromise;
          if (controller.signal.aborted) return;
          if (firstBlob) {
            await playBlobAsync(firstBlob, controller.signal);
          }

          if (controller.signal.aborted) return;
          const restBlob = await restPromise;
          if (controller.signal.aborted) return;
          if (restBlob) {
            await playBlobAsync(restBlob, controller.signal);
          }
          if (!controller.signal.aborted) visual('idle');
          return;
        }
      }

      // Single sentence or <= 180 characters
      const blob = await fetchTtsBlob(cleanText, controller.signal);
      if (controller.signal.aborted) return;
      if (blob) {
        await playBlobAsync(blob, controller.signal);
      }
      if (!controller.signal.aborted) visual('idle');
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('[JARVIS TTS speak error]', err);
      }
      visual('idle');
    }
  }

  async function handleResumeBrowser(challenge, msgId) {
    setResumingBrowser(true);
    visual('thinking');
    try {
      const response = await fetch('/api/browser/resume', { method: 'POST', headers: { 'content-type': 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.code === 'HUMAN_ACTION_REQUIRED' || data.humanActionRequired) {
        setMessages((prev) => [...prev, {
          id: makeMsgId('jarvis-alert'),
          who: 'JARVIS',
          time: nowTime(),
          lines: ['Verification is still active in Firefox. Please complete the captcha or login challenge in the browser window before resuming.']
        }]);
        visual('idle');
        return;
      }
      setPendingBrowserChallenge(null);
      const resumedText = data.page?.title
        ? `Challenge cleared. Resumed on "${data.page.title}" (${data.page.url || challenge?.url || ''}).`
        : 'Challenge cleared and browser task resumed successfully.';
      setMessages((prev) => {
        const updated = prev.map((m) => m.id === msgId ? { ...m, browserChallenge: null, browserResolved: true } : m);
        return [...updated, {
          id: makeMsgId('jarvis-resumed'),
          who: 'JARVIS',
          time: nowTime(),
          lines: [resumedText]
        }];
      });
      if (speechEnabled) {
        void speakReply(resumedText);
      } else {
        visual('idle');
      }
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: makeMsgId('jarvis-err'),
        who: 'JARVIS',
        time: nowTime(),
        lines: [`Failed to resume browser: ${err.message || 'Network error'}`]
      }]);
      visual('idle');
    } finally {
      setResumingBrowser(false);
    }
  }

  async function sendMessage(value = input, speak = null) {
    const val = String(value).trim();
    if (!val) return;
    const shouldSpeak = speak !== null ? speak : speechEnabled;
    stopSpeaking();

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

        let streamedFirstSentence = '';
        let sseTtsController = null;
        let sseFirstSentencePromise = null;
        if (shouldSpeak) {
          sseTtsController = new AbortController();
          ttsAbortControllerRef.current = sseTtsController;
        }

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

                    // Stream first sentence immediately as soon as a complete sentence boundary arrives!
                    if (shouldSpeak && sseTtsController && !streamedFirstSentence && reply.length >= 25) {
                      const cleanSoFar = cleanSpeechText(reply);
                      const [first, rest] = splitFirstSentence(cleanSoFar);
                      if (first && rest) {
                        streamedFirstSentence = first;
                        sseFirstSentencePromise = (async () => {
                          const firstBlob = await fetchTtsBlob(first, sseTtsController.signal);
                          if (sseTtsController.signal.aborted || !firstBlob) return;
                          await playBlobAsync(firstBlob, sseTtsController.signal);
                        })();
                      }
                    }
                  } else if (data.type === 'done') {
                    if (data.action?.action === 'open_url' && !openedImmediately) window.open(data.action.url, '_blank', 'noopener,noreferrer');
                    const finalReply = data.reply || data.error || reply || 'Request could not be completed.';
                    const routingDebug = data.routing ? { taskType: data.routing.taskType, confidence: data.routing.routingConfidence, apiRotationCount: data.routing.apiRotationCount, modelFallbackUsed: data.routing.modelFallbackUsed, totalMs: data.routing.totalMs } : null;
                    
                    const isChallenge = data.code === 'HUMAN_ACTION_REQUIRED' ||
                      data.action?.code === 'HUMAN_ACTION_REQUIRED' ||
                      Boolean(data.humanActionRequired) ||
                      Boolean(data.action?.humanActionRequired) ||
                      /verification in (the browser|Firefox)/i.test(finalReply);
                    const browserChallenge = isChallenge ? {
                      url: data.url || data.action?.url || data.pending?.url || '',
                      reason: (typeof (data.challenge || data.action?.challenge) === 'object' ? (data.challenge?.title || data.action?.challenge?.title) : (data.challenge || data.action?.challenge)) || 'Verification challenge (CAPTCHA / Cloudflare / Login)',
                    } : null;
                    if (isChallenge) setPendingBrowserChallenge(browserChallenge);

                    if (!placeholderAdded) {
                      placeholderAdded = true;
                      setMessages((prev) => [...prev, { id: assistantMsgId, who: 'JARVIS', time: nowTime(), lines: [finalReply], modelIndicator: data.modelIndicator, routingDebug, media: data.media, browserChallenge }]);
                    } else {
                      setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, lines: [finalReply], modelIndicator: data.modelIndicator, routingDebug, media: data.media, browserChallenge } : m));
                    }

                    if (shouldSpeak) {
                      const finalClean = cleanSpeechText(finalReply);
                      if (streamedFirstSentence && sseFirstSentencePromise && sseTtsController) {
                        const remainder = finalClean.slice(streamedFirstSentence.length).trim();
                        if (remainder) {
                          (async () => {
                            // Pre-fetch remainder while sentence 1 is playing
                            const restPromise = fetchTtsBlob(remainder, sseTtsController.signal);
                            await sseFirstSentencePromise;
                            if (sseTtsController.signal.aborted) return;
                            const restBlob = await restPromise;
                            if (sseTtsController.signal.aborted || !restBlob) {
                              visual('idle');
                              return;
                            }
                            await playBlobAsync(restBlob, sseTtsController.signal);
                            if (!sseTtsController.signal.aborted) visual('idle');
                          })();
                        } else {
                          sseFirstSentencePromise.then(() => {
                            if (!sseTtsController?.signal.aborted) visual('idle');
                          });
                        }
                      } else {
                        void speakReply(finalReply);
                      }
                    }
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
        
        const isChallenge = data.code === 'HUMAN_ACTION_REQUIRED' ||
          data.action?.code === 'HUMAN_ACTION_REQUIRED' ||
          Boolean(data.humanActionRequired) ||
          Boolean(data.action?.humanActionRequired) ||
          /verification in (the browser|Firefox)/i.test(reply);
        const browserChallenge = isChallenge ? {
          url: data.url || data.action?.url || data.pending?.url || '',
          reason: (typeof (data.challenge || data.action?.challenge) === 'object' ? (data.challenge?.title || data.action?.challenge?.title) : (data.challenge || data.action?.challenge)) || 'Verification challenge (CAPTCHA / Cloudflare / Login)',
        } : null;
        if (isChallenge) setPendingBrowserChallenge(browserChallenge);

        setMessages((prev) => [...prev, { id: assistantMsgId, who: 'JARVIS', time: nowTime(), lines: [reply], modelIndicator: data.modelIndicator, routingDebug, media: data.media, browserChallenge }]);
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
            {m.who === 'JARVIS' && m.routingDebug && <div className="routing-debug">Route: {m.routingDebug.taskType} · Confidence: {Math.round(Number(m.routingDebug.confidence || 0) * 100)}% · Rotations: {m.routingDebug.apiRotationCount || 0} · Fallback: {m.routingDebug.modelFallbackUsed ? 'used' : 'not used'} · {m.routingDebug.totalMs || 0}ms</div>}
            {(m.browserChallenge || (pendingBrowserChallenge && i === messages.length - 1 && m.who === 'JARVIS')) && (
              <div className="browser-challenge-card">
                <div className="browser-challenge-header">
                  <Icon name="shield" />
                  <span>Human Verification Required</span>
                </div>
                <div className="browser-challenge-body">
                  <div>Verification challenge detected: <strong>{m.browserChallenge?.reason || pendingBrowserChallenge?.reason || 'CAPTCHA / Cloudflare / Login'}</strong>.</div>
                  {(m.browserChallenge?.url || pendingBrowserChallenge?.url) && (
                    <div className="browser-challenge-url">
                      URL: {m.browserChallenge?.url || pendingBrowserChallenge?.url}
                    </div>
                  )}
                  <div>Headed Firefox has been launched. Complete the verification in the browser window, then click below to continue.</div>
                </div>
                <button
                  type="button"
                  className="resume-jarvis-btn"
                  disabled={resumingBrowser}
                  onClick={() => handleResumeBrowser(m.browserChallenge || pendingBrowserChallenge, m.id)}
                >
                  <Icon name="check" />
                  {resumingBrowser ? 'Resuming JARVIS...' : 'Challenge Solved — Resume JARVIS'}
                </button>
              </div>
            )}
            {m.browserResolved && (
              <div className="browser-challenge-resolved">
                <Icon name="check" />
                <span>Challenge verified & browser session resumed.</span>
              </div>
            )}
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
