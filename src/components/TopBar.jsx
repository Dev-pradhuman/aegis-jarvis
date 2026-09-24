import useTelemetry, { formatUptime } from '../hooks/useTelemetry.js';
import '../styles/topbar.css';

export default function TopBar() {
  const telemetry = useTelemetry();
  const provider = telemetry.provider || {};
  const usage = telemetry.usage || {};
  const modelLabels = { 'muse-spark-1.2': 'Muse Spark 1.2', 'deepseek-v4-flash': 'DeepSeek V4 Flash', 'glm-5.2': 'GLM-5.2', 'laguna-s-2.1': 'Laguna S 2.1', 'minimax-m3': 'MiniMax M3', 'nemotron-3-nano-omni': 'Nemotron 3 Nano Omni', 'mimo-v2.5': 'MiMo V2.5', 'nemotron-3.5-lightning': 'Nemotron 3.5 Lightning' };
  const modeDefault = telemetry.modelRouting?.jarvisMode === 'coding' ? 'laguna-s-2.1' : telemetry.modelRouting?.jarvisMode === 'deepthinking' ? 'glm-5.2' : 'muse-spark-1.2';
  const routedModel = telemetry.modelRouting?.last?.finalModel || (telemetry.modelRouting?.mode === 'manual' ? telemetry.modelRouting?.manualModel : modeDefault);

  return (
    <header className="topbar hud-panel">
      <div className="tb-seg">
        <div className="eyebrow">Provider</div>
        <div className="val-lg">{provider.label || 'Not configured'}</div>
      </div>
      <div className="tb-seg">
        <div className="eyebrow">Model</div>
        <div className="val-lg">{modelLabels[routedModel] || provider.model || 'Not configured'}</div>
      </div>
      <div className="tb-seg">
        <div className="eyebrow">Active Router</div>
        <div className="val-lg">{telemetry.modelRouting?.mode === 'manual' ? 'Manual' : telemetry.modelRouting?.jarvisMode === 'deepthinking' ? 'Deep Thinking' : telemetry.modelRouting?.jarvisMode === 'coding' ? 'Coding' : 'Normal'}</div>
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
