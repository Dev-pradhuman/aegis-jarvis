import { browserManager } from './browser/index.js';
import { sites, BROWSER_PROVIDER_WARNING } from './browserProvidersConfig.js';

// These adapters use only visible page controls and the existing BrowserManager.
// The sites can change their DOM at any time; an unknown UI fails without submitting.

const states = { 
  chatgpt: { status: 'UNVERIFIED', checkedAt: null }, 
  claude: { status: 'UNVERIFIED', checkedAt: null }, 
  gemini: { status: 'UNVERIFIED', checkedAt: null },
  googleFlow: { status: 'UNVERIFIED', checkedAt: null }
};
let sequence = Promise.resolve();

export function webAiStatus() { return structuredClone(states); }

export async function openWebAiSession(site, manager = browserManager) {
  if (!sites[site]) throw failure('WEB_AI_PROVIDER_UNKNOWN', 'Choose ChatGPT or Claude');
  const result = await manager.openHeaded(sites[site].url);
  let status = 'UNVERIFIED';
  try {
    const view = await inspect(manager, site);
    if (view.composer && view.send) status = 'READY';
    else if (/\b(log in|sign in|continue with google|create an account|captcha|verify you are human|verify your age|are you a human)\b/i.test(view.pageText)) status = 'HUMAN_ACTION_REQUIRED';
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

function extractToolCalls(text) {
  const calls = [];
  let remaining = text;
  while (true) {
    const match = remaining.match(/<tool\s+name="([^"]+)">([\s\S]*?)<\/tool>/);
    if (!match) break;
    calls.push({ id: `call-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type: 'function', function: { name: match[1], arguments: match[2].trim() } });
    remaining = remaining.replace(match[0], '');
  }
  return { text: remaining.trim(), calls };
}

async function executeOne(site, options, { manager, timeoutMs }) {
  const definition = sites[site];
  try {
    const isContinuation = options.continuationState?.runId && manager.currentUrl?.startsWith(definition.url);
    if (!isContinuation) {
      const navigation = await manager.navigate(definition.url, { mode: 'visual' });
      if (navigation?.humanActionRequired) { setStatus(site, 'HUMAN_ACTION_REQUIRED'); return { status: 'HUMAN_ACTION_REQUIRED', site }; }
    }
    const before = await inspect(manager, site);
    if (!before.composer || !before.send) {
      const login = /\b(log in|sign in|continue with google|create an account|captcha|verify you are human|verify your age|are you a human)\b/i.test(before.pageText);
      const status = login ? 'HUMAN_ACTION_REQUIRED' : 'UNSUPPORTED';
      setStatus(site, status);
      return { status, site };
    }
    
    let prompt = options.request;
    if (options.messages && options.messages.length > 0) {
      const lastMsg = options.messages[options.messages.length - 1];
      if (lastMsg.role === 'tool') {
        prompt = `Tool ${lastMsg.function?.name || lastMsg.tool_call_id} result:\n${lastMsg.content}`;
      } else if (lastMsg.role === 'user') {
        prompt = lastMsg.content;
      }
    }
    
    if (!isContinuation && options.toolSpecs?.length) {
      prompt += `\n\nYou have access to the following tools:\n${JSON.stringify(options.toolSpecs, null, 2)}\nTo use a tool, output EXACTLY this XML format:\n<tool name="tool.name">{"arg": "value"}</tool>`;
    }

    await manager.type(before.composer, prompt, { mode: 'visual' });
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
        if (stable >= 2) { 
          setStatus(site, 'READY'); 
          const { text, calls } = extractToolCalls(answer);
          return { status: 'READY', site, reply: text, toolCalls: calls, model: 'UI_SELECTED_UNVERIFIED', provider: `${site}-web`, tokens: 0, cost: 0 }; 
        }
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

export function runWebAi(options, config = {}) {
  const preferred = config.preferred || 'chatgpt';
  const manager = config.manager || browserManager;
  const timeoutMs = config.timeoutMs || 60_000;
  
  const order = preferred === 'googleFlow' ? ['googleFlow'] : preferred === 'claude' ? ['claude', 'gemini', 'chatgpt'] : preferred === 'gemini' ? ['gemini', 'chatgpt', 'claude'] : ['chatgpt', 'gemini', 'claude'];
  const work = async () => {
    const attempts = [];
    for (const site of order) {
      const outcome = await executeOne(site, options, { manager, timeoutMs });
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
