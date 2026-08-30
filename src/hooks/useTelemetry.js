import { useEffect, useState } from 'react';

const empty = { uptimeSeconds: 0, usage: { requests: 0, tokens: 0, cost: 0 }, provider: { label: 'Local model', model: 'Not configured' } };

export default function useTelemetry(interval = 1000) {
  const [telemetry, setTelemetry] = useState(empty);
  useEffect(() => {
    let mounted = true;
    const refresh = () => fetch('/api/telemetry').then((response) => response.ok ? response.json() : null).then((data) => { if (mounted && data) setTelemetry(data); }).catch(() => {});
    refresh();
    const timer = setInterval(refresh, interval);
    return () => { mounted = false; clearInterval(timer); };
  }, [interval]);
  return telemetry;
}

export function formatUptime(totalSeconds = 0) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = totalSeconds % 60;
  return [days, hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}
