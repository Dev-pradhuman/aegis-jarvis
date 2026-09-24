export function pollWithBackoff(task, { connectedMs = 5000, firstRetryMs = 1000, maxRetryMs = 30000, onError = () => {} } = {}) {
  let stopped = false;
  let timer = null;
  let failures = 0;
  let controller = null;
  const tick = async () => {
    controller = new AbortController();
    try {
      await task(controller.signal, failures);
      failures = 0;
    } catch (error) {
      if (!stopped && error.name !== 'AbortError') onError(error, ++failures);
    }
    if (!stopped) {
      const delay = failures ? Math.min(maxRetryMs, firstRetryMs * 2 ** Math.min(failures - 1, 8)) : connectedMs;
      timer = setTimeout(tick, delay);
    }
  };
  void tick();
  return () => { stopped = true; clearTimeout(timer); controller?.abort(); };
}
