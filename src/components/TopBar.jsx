import useTelemetry, { formatUptime } from '../hooks/useTelemetry.js';
import '../styles/topbar.css';

export default function TopBar() {
  const telemetry = useTelemetry();
  const provider = telemetry.provider || {};
  const usage = telemetry.usage || {};
  const routedModel = telemetry.modelRouting?.last?.actualModel || provider.model || null;

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
      <div className="tb-seg tb-uptime">
        <div className="eyebrow">Uptime</div>
        <div className="tb-uptime-val mono">{formatUptime(telemetry.uptimeSeconds)}</div>
        <div className="tb-uptime-sub">DAYS &nbsp; HRS &nbsp; MINS &nbsp; SECS</div>
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
