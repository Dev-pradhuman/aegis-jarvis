import { useCallback, useEffect, useRef, useState } from 'react';
import '../styles/voice-island.css';

const initialSettings = { enabled: true, topIsland: true, globalHotkeys: false, pushToTalkKey: 'Alt', dictationKey: 'Ctrl+Shift', notifications: { enabled: false, allApps: true, apps: [] } };

function shortcutMatches(event, shortcut) {
  const parts = String(shortcut || '').split('+').filter(Boolean);
  const eventKey = event.key === 'Control' ? 'Ctrl' : event.key === 'Meta' ? 'Win' : event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  const primary = parts.find((part) => !['Ctrl', 'Shift', 'Alt', 'Win'].includes(part));
  return parts.includes(eventKey)
    && (!primary || eventKey === primary)
    && (!parts.includes('Ctrl') || event.ctrlKey)
    && (!parts.includes('Shift') || event.shiftKey)
    && (!parts.includes('Alt') || event.altKey)
    && (!parts.includes('Win') || event.metaKey);
}

function shortcutReleased(event, shortcut) {
  const eventKey = event.key === 'Control' ? 'Ctrl' : event.key === 'Meta' ? 'Win' : event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return String(shortcut || '').split('+').includes(eventKey);
}

export default function VoiceIsland({ desktopOverlay = false }) {
  const [settings, setSettings] = useState(initialSettings);
  const [mode, setMode] = useState('idle');
  const [transcript, setTranscript] = useState('');
  const [status, setStatus] = useState('Ready');
  const [incomingCall, setIncomingCall] = useState(null);
  const captureRef = useRef(null);
  const finalTextRef = useRef('');
  const lastEventRef = useRef(0);
  const hotkeyLatchRef = useRef(false);
  const settleTimerRef = useRef(null);
  const playbackRef = useRef(null);
  const speechSequenceRef = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const settle = useCallback((nextStatus, text = '', delay = 2600) => {
    clearTimeout(settleTimerRef.current);
    setTranscript(text); setStatus(nextStatus); setMode('result');
    settleTimerRef.current = setTimeout(() => setMode('idle'), delay);
  }, []);

  const stopSpeaking = useCallback(() => {
    const playback = playbackRef.current; playbackRef.current = null; playback?.cancel?.();
    window.speechSynthesis?.cancel();
  }, []);

  const interruptReply = useCallback(() => {
    speechSequenceRef.current += 1; clearTimeout(settleTimerRef.current); stopSpeaking();
  }, [stopSpeaking]);

  const speak = useCallback(async (text) => {
    stopSpeaking();
    await new Promise((resolve) => {
      const playback = { cancel: null }; let finished = false; let cancelled = false;
      const finish = () => { if (finished) return; finished = true; if (playbackRef.current === playback) playbackRef.current = null; resolve(); };
      playback.cancel = () => { cancelled = true; finish(); }; playbackRef.current = playback;
      const browserVoice = () => {
        if (cancelled || !window.speechSynthesis) { finish(); return; }
        const utterance = new SpeechSynthesisUtterance(text); utterance.onend = finish; utterance.onerror = finish;
        playback.cancel = () => { window.speechSynthesis.cancel(); finish(); }; window.speechSynthesis.speak(utterance);
      };
      fetch('/api/voice/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) })
        .then(async (response) => { if (!response.ok) throw new Error(); const url = URL.createObjectURL(await response.blob()); if (cancelled) { URL.revokeObjectURL(url); return; } const audio = new Audio(url); playback.cancel = () => { cancelled = true; audio.pause(); URL.revokeObjectURL(url); finish(); }; audio.onended = () => { URL.revokeObjectURL(url); finish(); }; audio.onerror = () => { URL.revokeObjectURL(url); finish(); }; await audio.play(); })
        .catch(browserVoice);
    });
  }, [stopSpeaking]);

  const sendCommand = useCallback(async (text) => {
    const value = String(text || '').trim();
    if (!value) { settle('No speech detected', '', 1500); return; }
    setMode('thinking'); setTranscript(value); setStatus('Thinking');
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: value, source: 'voice' }) });
      const data = await response.json(); const reply = data.reply || data.error || 'The request could not be completed.';
      window.dispatchEvent(new CustomEvent('jarvis:messages-refresh'));
      if (!response.ok) { settle('Needs attention', reply, 5000); return; }
      const speechId = ++speechSequenceRef.current; setTranscript(reply); setStatus('JARVIS is replying'); setMode('replying');
      await speak(reply);
      if (speechSequenceRef.current === speechId && !captureRef.current) { setStatus('Ready'); setMode('idle'); }
    } catch { settle('Local service unavailable', '', 4000); }
  }, [settle, speak]);

  const deliverDictation = useCallback((text) => {
    const value = String(text || '').trim(); if (!value) return;
    settle('Dictated', value, 1800);
    if (!document.hasFocus() || desktopOverlay) { void fetch('/api/voice-os/dictation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: value }) }); return; }
    const target = document.activeElement;
    if (target?.matches?.('[data-jarvis-dictation]')) window.dispatchEvent(new CustomEvent('jarvis:dictation', { detail: { text: value } }));
    else if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      const start = target.selectionStart ?? target.value.length; const end = target.selectionEnd ?? start;
      target.setRangeText(`${start ? ' ' : ''}${value}`, start, end, 'end'); target.dispatchEvent(new Event('input', { bubbles: true }));
    } else window.dispatchEvent(new CustomEvent('jarvis:dictation', { detail: { text: value } }));
  }, [desktopOverlay, settle]);

  const finishCapturedAudio = useCallback(async (blob, kind) => {
    if (!blob?.size) { settle('No audio captured', '', 1800); return; }
    try {
      setMode('thinking'); setStatus('Transcribing');
      const dataUrl = await new Promise((resolve) => { const reader = new FileReader(); reader.onloadend = () => resolve(reader.result); reader.readAsDataURL(blob); });
      const response = await fetch('/api/voice/transcribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ audio: String(dataUrl).split(',')[1], mimeType: blob.type, fileName: 'voice-os.webm' }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Transcription failed');
      if (kind === 'dictation') deliverDictation(data.text); else await sendCommand(data.text);
    } catch (error) { settle(error.message || 'Transcription failed', '', 5000); }
  }, [deliverDictation, sendCommand, settle]);

  const startCapture = useCallback(async (kind) => {
    if (!settingsRef.current.enabled || captureRef.current) return;
    const capture = { kind, stopRequested: false, stopImpl: null, stop() { this.stopRequested = true; this.stopImpl?.(); } };
    captureRef.current = capture; clearTimeout(settleTimerRef.current); finalTextRef.current = '';
    setTranscript(''); setMode(kind === 'dictation' ? 'dictating' : 'listening'); setStatus(kind === 'dictation' ? 'Dictating' : 'Listening');
    try {
      const voice = await fetch('/api/voice/tts').then((response) => response.ok ? response.json() : ({}));
      if (voice.sttProvider === 'browser') {
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Recognition) throw new Error('Browser speech recognition is unavailable. Configure Groq STT to use Whisper.');
        const recognition = new Recognition(); recognition.lang = 'en-IN'; recognition.continuous = kind === 'dictation'; recognition.interimResults = true;
        recognition.onresult = (event) => { let interim = ''; for (let index = event.resultIndex; index < event.results.length; index += 1) { const value = event.results[index][0].transcript; if (event.results[index].isFinal) { finalTextRef.current = `${finalTextRef.current} ${value}`.trim(); if (kind === 'dictation') deliverDictation(value); } else interim += value; } setTranscript(interim || finalTextRef.current); };
        recognition.onerror = (event) => { if (captureRef.current === capture) captureRef.current = null; settle(`Speech recognition: ${event.error}`, '', 3000); };
        recognition.onend = () => { const wasActive = captureRef.current === capture; if (wasActive) captureRef.current = null; if (kind === 'ptt' && wasActive) void sendCommand(finalTextRef.current); else if (kind === 'dictation' && wasActive) settle('Dictation stopped', finalTextRef.current, 1500); };
        capture.stopImpl = () => { try { recognition.stop(); } catch { /* still starting */ } };
        recognition.start(); if (capture.stopRequested) setTimeout(() => capture.stopImpl?.(), 160); return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      if (captureRef.current !== capture) { stream.getTracks().forEach((track) => track.stop()); return; }
      const chunks = []; const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : undefined });
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => { stream.getTracks().forEach((track) => track.stop()); if (captureRef.current === capture) captureRef.current = null; void finishCapturedAudio(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }), kind); };
      capture.stopImpl = () => { if (recorder.state !== 'inactive') recorder.stop(); };
      recorder.start(100); if (capture.stopRequested) setTimeout(() => capture.stopImpl?.(), 160);
    } catch (error) { if (captureRef.current === capture) captureRef.current = null; settle(error.message || 'Microphone unavailable', '', 4000); }
  }, [deliverDictation, finishCapturedAudio, sendCommand, settle]);

  const stopCapture = useCallback((kind) => { if (captureRef.current?.kind === kind) captureRef.current.stop(); }, []);
  const toggleDictation = useCallback(() => { if (captureRef.current?.kind === 'dictation') stopCapture('dictation'); else void startCapture('dictation'); }, [startCapture, stopCapture]);

  const showNotification = useCallback((event) => {
    const options = settingsRef.current.notifications;
    if (!options?.enabled || (!options.allApps && !options.apps?.includes(event.app))) return;
    if ('Notification' in window && Notification.permission === 'granted') new Notification(event.title || `JARVIS · ${event.app || 'system'}`, { body: event.message || (event.type === 'incoming_call' ? `Incoming call from ${event.contact || 'Unknown'}` : event.type), tag: event.callId || `jarvis-${event.id}` });
  }, []);

  const handleVoiceEvent = useCallback((event) => {
    if (event.type === 'hotkey.ptt.start') { interruptReply(); void startCapture('ptt'); }
    else if (event.type === 'hotkey.ptt.stop') stopCapture('ptt');
    else if (event.type === 'hotkey.dictation.toggle') toggleDictation();
    else if (event.type === 'incoming_call') { setIncomingCall(event); setStatus(`Incoming ${event.app || ''} call`); showNotification(event); }
    else if (event.type === 'notification') { settle(event.title || event.message || 'New notification', event.message, 4000); showNotification(event); }
  }, [interruptReply, settle, showNotification, startCapture, stopCapture, toggleDictation]);

  useEffect(() => { fetch('/api/voice-os/settings').then((response) => response.ok ? response.json() : null).then((data) => data?.settings && setSettings(data.settings)).catch(() => {}); }, []);
  useEffect(() => { if (!settings.enabled) return undefined; const poll = async () => { try { const response = await fetch(`/api/voice-os/events?after=${lastEventRef.current}`); if (!response.ok) return; const data = await response.json(); for (const event of data.events || []) { lastEventRef.current = Math.max(lastEventRef.current, event.id); handleVoiceEvent(event); } } catch { /* optional bridge */ } }; void poll(); const timer = setInterval(poll, 150); return () => clearInterval(timer); }, [handleVoiceEvent, settings.enabled]);
  useEffect(() => {
    if (!settings.enabled || desktopOverlay) return undefined;
    const down = (event) => { if (document.documentElement.dataset.shortcutRecording === 'true') return; if (shortcutMatches(event, settings.pushToTalkKey) && !event.repeat) { event.preventDefault(); interruptReply(); void startCapture('ptt'); } if (shortcutMatches(event, settings.dictationKey) && !hotkeyLatchRef.current) { hotkeyLatchRef.current = true; event.preventDefault(); toggleDictation(); } };
    const up = (event) => { if (document.documentElement.dataset.shortcutRecording === 'true') return; if (shortcutReleased(event, settings.pushToTalkKey)) { event.preventDefault(); stopCapture('ptt'); } if (shortcutReleased(event, settings.dictationKey)) hotkeyLatchRef.current = false; };
    window.addEventListener('keydown', down, true); window.addEventListener('keyup', up, true); return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); };
  }, [desktopOverlay, interruptReply, settings.dictationKey, settings.enabled, settings.pushToTalkKey, startCapture, stopCapture, toggleDictation]);
  useEffect(() => { const refresh = () => fetch('/api/voice-os/settings').then((response) => response.ok ? response.json() : null).then((data) => data?.settings && setSettings(data.settings)).catch(() => {}); window.addEventListener('jarvis:voice-settings', refresh); return () => window.removeEventListener('jarvis:voice-settings', refresh); }, []);
  useEffect(() => { if (!desktopOverlay) return undefined; document.documentElement.classList.add('jarvis-island-document'); return () => document.documentElement.classList.remove('jarvis-island-document'); }, [desktopOverlay]);
  useEffect(() => { if (desktopOverlay && window.jarvisDesktop) window.jarvisDesktop.setIslandState({ mode, status, transcript, incomingCall: Boolean(incomingCall), keepVisible: mode === 'result', hideAfterMs: mode === 'result' ? 2800 : 180 }); }, [desktopOverlay, incomingCall, mode, status, transcript]);
  useEffect(() => () => { clearTimeout(settleTimerRef.current); stopSpeaking(); }, [stopSpeaking]);

  async function callAction(type) { if (!incomingCall) return; setMode('thinking'); try { const response = await fetch('/api/voice-os/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, app: incomingCall.app, target: incomingCall.contact, callId: incomingCall.callId }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Call action failed'); setIncomingCall(null); settle(type === 'call.answer' ? 'Call answered' : 'Call declined', '', 1800); } catch (error) { settle(error.message, '', 4000); } }

  if (!settings.enabled || !settings.topIsland) return null;
  const hint = mode === 'idle' ? `${settings.pushToTalkKey} to talk · ${settings.dictationKey} to dictate` : transcript || status;
  return <aside className={`voice-island ${mode}${desktopOverlay ? ' desktop-overlay' : ''}`} aria-live="polite">
    <div className="voice-island-signal"><i /><i /><i /><i /><i /></div>
    <div className="voice-island-copy"><strong>{incomingCall ? incomingCall.contact || 'Incoming call' : status}</strong><span>{hint}</span></div>
    {incomingCall ? <div className="island-actions"><button className="answer" onClick={() => callAction('call.answer')}>Answer</button><button className="decline" onClick={() => callAction('call.reject')}>Decline</button></div> : !desktopOverlay && <div className="island-actions"><button className={mode === 'dictating' ? 'active' : ''} onClick={toggleDictation}>Dictate</button><button className={mode === 'listening' ? 'active' : ''} onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); interruptReply(); void startCapture('ptt'); }} onPointerUp={() => stopCapture('ptt')} onPointerCancel={() => stopCapture('ptt')} onLostPointerCapture={() => stopCapture('ptt')}>Talk</button></div>}
  </aside>;
}
