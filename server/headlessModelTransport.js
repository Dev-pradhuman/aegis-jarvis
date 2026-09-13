export class HeadlessModelTransport {
  async start() { throw new Error('Not implemented'); }
  async send() { throw new Error('Not implemented'); }
  async reset() { throw new Error('Not implemented'); }
  async health() { throw new Error('Not implemented'); }
  async cancel() { throw new Error('Not implemented'); }
  async close() { throw new Error('Not implemented'); }
}

export function emitTextDelta(previous, current, emit) {
  const before = String(previous || '');
  const next = String(current || '');
  if (!emit || !next || next === before) return next;
  // Tool envelopes are control-plane data and must never leak into visible chat.
  if ('<<<JARVIS_TOOL_CALLS>>>'.startsWith(next) || next.startsWith('<<<JARVIS_TOOL_CALLS>>>')) return next;
  if (next.startsWith(before)) emit(next.slice(before.length));
  else emit(next, { replace: true });
  return next;
}

export async function installDomStream(page, selectors) {
  await page.evaluate((patterns) => {
    window.__jarvisHeadlessStream?.observer?.disconnect();
    const state = { snapshots: [], observer: null };
    const capture = () => {
      for (const selector of patterns) {
        const nodes = document.querySelectorAll(selector); const text = nodes[nodes.length - 1]?.innerText?.trim();
        if (text && text !== state.snapshots[state.snapshots.length - 1]) { state.snapshots.push(text); if (state.snapshots.length > 50) state.snapshots.shift(); return; }
      }
    };
    state.observer = new MutationObserver(capture); state.observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    window.__jarvisHeadlessStream = state;
  }, selectors).catch(() => {});
}

export async function drainDomStream(page) {
  return page.evaluate(() => { const state = window.__jarvisHeadlessStream; if (!state) return []; return state.snapshots.splice(0, state.snapshots.length); }).catch(() => []);
}

export async function stopDomStream(page) { await page.evaluate(() => { window.__jarvisHeadlessStream?.observer?.disconnect(); delete window.__jarvisHeadlessStream; }).catch(() => {}); }
