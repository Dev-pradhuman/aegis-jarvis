import { useEffect, useState } from 'react';
import useTelemetry, { formatUptime } from '../hooks/useTelemetry.js';
import { pollWithBackoff } from '../hooks/pollWithBackoff.js';
import '../styles/topbar.css';

function formatClockTime(date) {
  return date.toTimeString().slice(0, 8);
}

function formatClockDate(date) {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function computeNextEvent(overview) {
  if (!overview) return null;
  const now = Date.now();

  if (Array.isArray(overview.ringingReminders) && overview.ringingReminders.length > 0) {
    const first = overview.ringingReminders[0];
    return {
      label: `🔔 Ringing: ${first.title}`,
      isRinging: true
    };
  }

  const items = [];
  if (Array.isArray(overview.reminders)) {
    for (const r of overview.reminders) {
      if (r.status === 'scheduled') {
        const t = new Date(r.dueAt).getTime();
        if (t >= now - 60_000) {
          items.push({ title: r.title, time: t, type: r.category || 'reminder' });
        }
      }
    }
  }

  if (Array.isArray(overview.calendarEvents)) {
    for (const e of overview.calendarEvents) {
      const start = e.start?.dateTime || e.start?.date || e.startTime;
      if (start) {
        const t = new Date(start).getTime();
        if (t >= now - 60_000) {
          items.push({ title: e.summary || e.title || 'Event', time: t, type: 'calendar' });
        }
      }
    }
  }

  if (items.length === 0) return null;
  items.sort((a, b) => a.time - b.time);
  const next = items[0];
  const diffSec = Math.floor((next.time - now) / 1000);
  let timeLabel = '';
  if (diffSec <= 0) {
    timeLabel = 'Due now';
  } else if (diffSec < 60) {
    timeLabel = `In ${diffSec}s`;
  } else if (diffSec < 3600) {
    timeLabel = `In ${Math.floor(diffSec / 60)}m`;
  } else {
    const hr = Math.floor(diffSec / 3600);
    const min = Math.floor((diffSec % 3600) / 60);
    timeLabel = `In ${hr}h ${min}m`;
  }

  const icon = next.type === 'calendar' ? '📅' : next.type === 'alarm' ? '⏰' : next.type === 'timer' ? '⏳' : '📌';
  return {
    label: `${icon} ${timeLabel}: ${next.title}`,
    isRinging: false
  };
}

export default function TopBar() {
  const telemetry = useTelemetry();
  const provider = telemetry.provider || {};
  const usage = telemetry.usage || {};
  const routedModel = telemetry.modelRouting?.last?.actualModel || provider.model || null;
  const currentMode = telemetry.modelRouting?.executionMode || 'cloud';

  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [schedule, setSchedule] = useState(null);
  const [localMode, setLocalMode] = useState(null);
  const activeMode = localMode ?? currentMode;

  useEffect(() => {
    if (telemetry.modelRouting?.executionMode) {
      setLocalMode(telemetry.modelRouting.executionMode);
    }
  }, [telemetry.modelRouting?.executionMode]);

  const handleToggleMode = async () => {
    const cycle = { cloud: 'cli', cli: 'local', local: 'cloud' };
    const nextMode = cycle[activeMode] || 'cloud';
    setLocalMode(nextMode);
    try {
      const res = await fetch('/api/models/execution-mode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: nextMode })
      });
      if (res.ok) {
        const data = await res.json();
        setLocalMode(data.executionMode || nextMode);
      }
    } catch (err) {
      console.error('Failed to toggle execution mode:', err);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return pollWithBackoff(
      async (signal) => {
        const res = await fetch('/api/schedule/overview', { signal });
        if (res.ok) {
          setSchedule(await res.json());
        }
      },
      { connectedMs: 5000, errorMs: 15000 }
    );
  }, []);

  const nextEvent = computeNextEvent(schedule);

  return (
    <header className="topbar hud-panel">
      <div className="tb-seg">
        <div className="eyebrow">Provider</div>
        <div className="val-lg">{provider.label || 'Not configured'}</div>
      </div>
      <div className="tb-seg">
        <div className="eyebrow">Model</div>
        <div className="val-lg">{routedModel || 'Not configured'}</div>
      </div>
      <div className="tb-seg">
        <div className="eyebrow">Active Router</div>
        <div className="val-lg">{telemetry.modelRouting?.mode === 'manual' ? 'Manual source' : telemetry.modelRouting?.last?.executionTier?.replaceAll('_', ' ') || 'Local → Web → Free API'}</div>
      </div>
      <div className="tb-seg">
        <div className="eyebrow">Usage Today</div>
        <div className="tb-usage">
          <span>
            {usage.requests || 0}<span className="lbl">Requests</span>
          </span>
          <span>
            {usage.tokens || 0}<span className="lbl">Tokens</span>
          </span>
          <span>
            ${Number(usage.cost || 0).toFixed(2)}<span className="lbl">Cost</span>
          </span>
        </div>
      </div>
      <div className="tb-seg tb-clock">
        <div className="eyebrow">Clock</div>
        <div className="tb-clock-row">
          <span className="tb-clock-val">{formatClockTime(currentTime)}</span>
          <span className="tb-clock-date">{formatClockDate(currentTime)}</span>
        </div>
        {nextEvent && (
          <button
            type="button"
            className="tb-countdown-pill"
            onClick={() => window.dispatchEvent(new CustomEvent('jarvis:open-window', { detail: { id: 'reminders' } }))}
            title="Open Reminders & Calendar Hub"
          >
            {nextEvent.label}
          </button>
        )}
      </div>
      <div className="tb-seg tb-uptime">
        <div className="eyebrow">Uptime</div>
        <div className="tb-uptime-val mono">{formatUptime(telemetry.uptimeSeconds)}</div>
        <div className="tb-uptime-sub">DAYS &nbsp; HRS &nbsp; MINS &nbsp; SECS</div>
      </div>
      <div className="tb-seg tb-execution-mode topbar-right">
        <div className="eyebrow">Execution Mode</div>
        <button
          type="button"
          className={`execution-mode-btn ${activeMode === 'cli' ? 'cli' : activeMode === 'local' ? 'local' : 'cloud'}`}
          onClick={handleToggleMode}
          title="Toggle execution mode: Cloud API → CLI Agent (OpenCode/MCP) → Local Ollama"
          data-testid="execution-mode-toggle"
        >
          {activeMode === 'cli' ? '⚡ CLI AGENT' : activeMode === 'local' ? '💻 LOCAL' : '☁️ CLOUD'}
        </button>
      </div>
      <div className="tb-seg tb-core">
        <div className="eyebrow" style={{ textAlign: 'right' }}>
          Jarvis Core
        </div>
        <div className={`hud-status ${telemetry.online ? 'green' : ''}`}>
          {telemetry.online ? 'ACTIVE' : 'OFFLINE'} <span className={`dot ${telemetry.online ? 'green' : ''}`}></span>
        </div>
      </div>
    </header>
  );
}
