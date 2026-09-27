import { browserManager } from './browser/index.js';

// These adapters use only visible page controls and the existing BrowserManager.
// The sites can change their DOM at any time; an unknown UI fails without submitting.
const sites = {
  chatgpt: {
    url: 'https://chatgpt.com/',
    composer: ['#prompt-textarea', '[data-testid="prompt-textarea"]'],
    send: ['[data-testid="send-button"]', 'button[aria-label="Send prompt"]'],
    answer: '[data-message-author-role="assistant"]',
  },
  claude: {
    url: 'https://claude.ai/new',
    composer: ['[data-testid="chat-input"]', 'div.ProseMirror[contenteditable="true"]'],
    send: ['button[aria-label="Send message"]', 'button[data-testid="send-button"]'],
    answer: '[data-testid="assistant-message"]',
  },
};

const states = { chatgpt: { status: 'UNVERIFIED', checkedAt: null }, claude: { status: 'UNVERIFIED', checkedAt: null } };
let sequence = Promise.resolve();

export function webAiStatus() { return structuredClone(states); }

export async function openWebAiSession(site, manager = browserManager) {
  if (!sites[site]) throw failure('WEB_AI_PROVIDER_UNKNOWN', 'Choose ChatGPT or Claude');
  const result = await manager.openHeaded(sites[site].url);
  let status = 'UNVERIFIED';
  try {
    const view = await inspect(manager, site);
    if (view.composer && view.send) status = 'READY';
    else if (/\b(log in|sign in|continue with google|create an account)\b/i.test(view.pageText)) status = 'LOGIN_REQUIRED';
  } catch { /* The headed session is still available for manual sign-in. */ }
  setStatus(site, status);
  return { site, status, browser: result.status };
}

function setStatus(site, status) { states[site] = { status, checkedAt: new Date().toISOString() }; }
function resultOf(value) { return value?.result ?? value; }
function failure(code, message) { return Object.assign(new Error(message), { code }); }

async function inspect(manager, site) {
  const definition = sites[site];
  const script = `(() => {
    const visible = (node) => node && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
    const single = (selectors) => selectors.find((selector) => {
      const nodes = [...document.querySelectorAll(selector)].filter(visible);
      return nodes.length === 1;
    }) || null;
    return {
      composer: single(${JSON.stringify(definition.composer)}),
      send: single(${JSON.stringify(definition.send)}),
      answers: [...document.querySelectorAll(${JSON.stringify(definition.answer)})].filter(visible).map((node) => node.innerText.trim()).filter(Boolean),
      pageText: (document.body?.innerText || '').slice(0, 3000),
    };
  })()`;
  return resultOf(await manager.evaluate(script));
}

async function executeOne(site, request, { manager, timeoutMs }) {
  const definition = sites[site];
  try {
    const navigation = await manager.navigate(definition.url, { mode: 'visual' });
    if (navigation?.humanActionRequired) { setStatus(site, 'HUMAN_ACTION_REQUIRED'); return { status: 'HUMAN_ACTION_REQUIRED', site }; }
    const before = await inspect(manager, site);
    if (!before.composer || !before.send) {
      const login = /\b(log in|sign in|continue with google|create an account)\b/i.test(before.pageText);
      const status = login ? 'LOGIN_REQUIRED' : 'UNSUPPORTED';
      setStatus(site, status);
      return { status, site };
    }
    await manager.type(before.composer, request, { mode: 'visual' });
    const submission = await manager.click(before.send, { mode: 'visual' });
    if (submission?.humanActionRequired) { setStatus(site, 'HUMAN_ACTION_REQUIRED'); return { status: 'HUMAN_ACTION_REQUIRED', site }; }
    let last = '';
    let stable = 0;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const current = await inspect(manager, site);
      const answer = current.answers.at(-1) || '';
      if (current.answers.length > before.answers.length && answer.length > 2) {
        stable = answer === last ? stable + 1 : 0;
        last = answer;
        if (stable >= 2) { setStatus(site, 'READY'); return { status: 'READY', site, reply: answer, model: 'UI_SELECTED_UNVERIFIED', provider: `${site}-web`, tokens: 0, cost: 0 }; }
      }
      if (/\b(usage limit|try again later|rate limit|message limit)\b/i.test(current.pageText)) { setStatus(site, 'RATE_LIMITED'); return { status: 'RATE_LIMITED', site }; }
    }
    setStatus(site, 'UNAVAILABLE');
    return { status: 'UNAVAILABLE', site };
  } catch (error) {
    const status = error.code === 'HUMAN_ACTION_REQUIRED' ? 'HUMAN_ACTION_REQUIRED' : 'UNAVAILABLE';
    setStatus(site, status);
    return { status, site, code: error.code || 'WEB_AI_UNAVAILABLE' };
  }
}

export function runWebAi(request, { preferred = 'chatgpt', manager = browserManager, timeoutMs = 60_000 } = {}) {
  if (!String(request || '').trim()) return Promise.reject(failure('WEB_AI_REQUEST_INVALID', 'A prompt is required'));
  const order = preferred === 'claude' ? ['claude', 'chatgpt'] : ['chatgpt', 'claude'];
  const work = async () => {
    const attempts = [];
    for (const site of order) {
      const outcome = await executeOne(site, String(request), { manager, timeoutMs });
      attempts.push({ site, status: outcome.status });
      if (outcome.status === 'READY') return { ...outcome, attempts };
      if (outcome.status === 'HUMAN_ACTION_REQUIRED') return { ...outcome, attempts };
    }
    return { status: 'UNAVAILABLE', attempts };
  };
  const next = sequence.then(work, work);
  sequence = next.catch(() => {});
  return next;
}
