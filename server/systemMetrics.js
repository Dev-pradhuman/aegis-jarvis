import os from 'node:os';

let previous = null;

export function systemMetrics() {
  const ticks = os.cpus().map(({ times }) => ({ idle: times.idle, total: Object.values(times).reduce((sum, value) => sum + value, 0) }));
  let cpuPercent = null;
  if (previous?.length === ticks.length) {
    const idle = ticks.reduce((sum, tick, i) => sum + tick.idle - previous[i].idle, 0);
    const total = ticks.reduce((sum, tick, i) => sum + tick.total - previous[i].total, 0);
    if (total > 0) cpuPercent = Math.max(0, Math.min(100, Math.round((1 - idle / total) * 100)));
  }
  previous = ticks;
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  return { cpuPercent, memoryPercent: totalMemory ? Math.round((1 - freeMemory / totalMemory) * 100) : null, totalMemory, freeMemory, gpuPercent: null, sampledAt: new Date().toISOString() };
}
