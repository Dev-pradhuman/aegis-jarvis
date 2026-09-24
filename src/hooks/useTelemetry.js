import { useEffect, useState } from 'react';
import { pollWithBackoff } from './pollWithBackoff.js';

const empty = { uptimeSeconds: null, usage: null, provider: null, online: false };

export default function useTelemetry(interval = 1000) {
  const [telemetry, setTelemetry] = useState(empty);
  useEffect(() => pollWithBackoff(async (signal) => {
    const response = await fetch('/api/telemetry', { signal });
    if (!response.ok) throw new Error(`Telemetry ${response.status}`);
    setTelemetry({ ...await response.json(), online: true });
  }, { connectedMs: interval, onError: () => setTelemetry(empty) }), [interval]);
  return telemetry;
}

export function formatUptime(totalSeconds = 0) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  return [days, hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}
