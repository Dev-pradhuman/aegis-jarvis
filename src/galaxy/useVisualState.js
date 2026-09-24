import { useEffect, useState } from 'react';
import { pollWithBackoff } from '../hooks/pollWithBackoff.js';

const STATES = new Set(['sleeping', 'idle', 'listening', 'thinking', 'working', 'speaking']);

export default function useVisualState() {
  const [phase, setPhase] = useState('idle');
  const [manualSleep, setManualSleep] = useState(false);
  const [backendOnline, setBackendOnline] = useState(null);
  const [serviceStatus, setServiceStatus] = useState('CONNECTING');
  const [activeRun, setActiveRun] = useState(null);
  const [browserStatus, setBrowserStatus] = useState(null);
  const [chatPhase, setChatPhase] = useState(null);
  const [preview, setPreview] = useState(null);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const previewEnabled = import.meta.env.DEV && new URLSearchParams(window.location.search).has('visualPreview');

  useEffect(() => {
    const onActivity = () => setLastActivity(Date.now());
    const onVisual = (event) => {
      const next = event.detail?.phase;
      if (STATES.has(next)) {
        setChatPhase(next === 'idle' ? null : next);
        setManualSleep(false);
        onActivity();
      }
    };
    window.addEventListener('pointerdown', onActivity);
    window.addEventListener('keydown', onActivity);
    window.addEventListener('jarvis:visual', onVisual);
    return () => { window.removeEventListener('pointerdown', onActivity); window.removeEventListener('keydown', onActivity); window.removeEventListener('jarvis:visual', onVisual); };
  }, []);

  useEffect(() => pollWithBackoff(async (signal, failures) => {
    if (failures) setServiceStatus('RECONNECTING');
    const health = await fetch('/api/health', { signal });
    if (!health.ok) throw new Error(`Health ${health.status}`);
    const [runsResponse, browserResponse] = await Promise.all([
      fetch('/api/runs', { signal }), fetch('/api/browser/status', { signal }),
    ]);
    if (!runsResponse.ok || !browserResponse.ok) throw new Error('JARVIS service is degraded');
    const [runs, browser] = await Promise.all([runsResponse.json(), browserResponse.json()]);
    setBackendOnline(true); setServiceStatus('ONLINE');
    setActiveRun((runs.runs || []).find((run) => ['running', 'executing', 'pending_approval'].includes(run.status)) || null);
    setBrowserStatus(browser);
  }, { connectedMs: 3500, onError: (_error, failures) => {
    setBackendOnline(false); setServiceStatus(failures === 1 ? 'DEGRADED' : 'OFFLINE');
    setActiveRun(null); setBrowserStatus(null);
  } }), []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (preview) { setPhase(preview); return; }
      if (manualSleep || (Date.now() - lastActivity > 5 * 60_000 && !chatPhase && !activeRun && !browserStatus?.engine)) { setPhase('sleeping'); return; }
      setPhase(chatPhase || (activeRun || browserStatus?.active ? 'working' : 'idle'));
    }, 120);
    return () => clearInterval(timer);
  }, [activeRun, browserStatus?.active, chatPhase, lastActivity, manualSleep, preview]);

  return {
    phase, backendOnline, serviceStatus, activeRun, browserStatus, previewEnabled, preview,
    setPreview: (next) => setPreview(STATES.has(next) ? next : null),
    sleep: () => { setManualSleep(true); setChatPhase(null); },
    wake: () => { setManualSleep(false); setLastActivity(Date.now()); },
  };
}
