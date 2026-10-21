import test from 'node:test';
import assert from 'node:assert/strict';
import { routeRequest, KNOWN_SITES, resolveKnownSiteOrDomain } from '../server/router.js';
import { unattendedTools, modelCallableTools } from '../server/toolPolicy.js';
import { selectRelevantTools, toolFilterSettings } from '../server/toolFilter.js';
import { executeTool } from '../server/toolExecutor.js';
import { browserManager } from '../server/browser/index.js';

test('AC1: Natural language website and browser opening routes deterministically with polite prefixes', () => {
  // Test polite prefixes with known sites
  const queries = [
    { text: 'can you open instagram', url: 'https://www.instagram.com', cap: 'browser.handoff' },
    { text: 'open instagram', url: 'https://www.instagram.com', cap: 'browser.handoff' },
    { text: 'jarvis, could you please open instagram?', url: 'https://www.instagram.com', cap: 'browser.handoff' },
    { text: 'go to github.com', url: 'https://github.com', cap: 'browser.handoff' },
    { text: 'can you go to github.com', url: 'https://github.com', cap: 'browser.handoff' },
    { text: 'launch whatsapp', url: 'https://web.whatsapp.com', cap: 'browser.handoff' },
    { text: 'please open chatgpt', url: 'https://chatgpt.com', cap: 'browser.handoff' },
    { text: 'open claude', url: 'https://claude.ai', cap: 'browser.handoff' },
    { text: 'open gemini', url: 'https://gemini.google.com', cap: 'browser.handoff' },
    { text: 'go to reddit.com', url: 'https://www.reddit.com', cap: 'browser.handoff' },
    { text: 'open netflix', url: 'https://www.netflix.com', cap: 'browser.handoff' },
    { text: 'open linkedin', url: 'https://www.linkedin.com', cap: 'browser.handoff' },
    { text: 'open x', url: 'https://x.com', cap: 'browser.handoff' },
    { text: 'open twitter', url: 'https://x.com', cap: 'browser.handoff' },
    { text: 'open youtube', url: 'https://www.youtube.com', cap: 'browser.open' },
    { text: 'can you open youtube.com', url: 'https://www.youtube.com', cap: 'browser.open' },
    { text: 'visit https://huggingface.co/models', url: 'https://huggingface.co/models', cap: 'browser.handoff' },
    { text: 'go to news.ycombinator.com', url: 'https://news.ycombinator.com', cap: 'browser.handoff' },
  ];

  for (const q of queries) {
    const route = routeRequest(q.text);
    assert.equal(route.route, 'TOOL_CALL', `Query "${q.text}" should route to TOOL_CALL`);
    assert.equal(route.capability, q.cap, `Query "${q.text}" should map to capability ${q.cap}`);
    assert.equal(route.args.url, q.url, `Query "${q.text}" should have URL ${q.url}`);
    assert.ok(route.confidence >= 0.99, `Query "${q.text}" should have high confidence`);
  }

  // Verify resolveKnownSiteOrDomain helper directly
  assert.equal(resolveKnownSiteOrDomain('instagram').url, 'https://www.instagram.com');
  assert.equal(resolveKnownSiteOrDomain('github.com').url, 'https://github.com');
  assert.equal(resolveKnownSiteOrDomain('sub.domain.dev').url, 'https://sub.domain.dev');
  assert.equal(resolveKnownSiteOrDomain('unknown-desktop-app'), null);
});

test('AC2: toolPolicy.js includes safe browser tools in unattendedAllowedIds', () => {
  const unattended = unattendedTools();
  const ids = new Set(unattended.map((t) => t.id));

  const expectedBrowserTools = [
    'browser.open',
    'browser.click',
    'browser.type',
    'browser.wait',
    'browser.content',
    'browser.accessibility',
    'browser.resume',
    'browser.close',
    'browser.navigate',
    'browser.read',
    'browser.screenshot',
    'browser.handoff'
  ];

  for (const toolId of expectedBrowserTools) {
    assert.ok(ids.has(toolId), `Tool ${toolId} must be allowed in unattended tools`);
  }

  const callable = modelCallableTools();
  const callableIds = new Set(callable.map((t) => t.id));
  for (const toolId of expectedBrowserTools) {
    assert.ok(callableIds.has(toolId), `Tool ${toolId} must be in modelCallableTools`);
  }
});

test('AC2: toolFilter.js retains browser navigation tools in CORE_TOOLS and selectRelevantTools', () => {
  const settings = toolFilterSettings();
  const coreSet = new Set(settings.coreTools);

  assert.ok(coreSet.has('browser.navigate'), 'browser.navigate must be in CORE_TOOLS');
  assert.ok(coreSet.has('browser.open'), 'browser.open must be in CORE_TOOLS');
  assert.ok(coreSet.has('browser.handoff'), 'browser.handoff must be in CORE_TOOLS');
  assert.ok(coreSet.has('apps.open'), 'apps.open must be in CORE_TOOLS');

  // Verify selectRelevantTools preserves them even on arbitrary queries with topK=1
  const mockTools = [
    { id: 'browser.navigate', name: 'browser.navigate', description: 'Navigate web', module: 'browser', inputSchema: {} },
    { id: 'browser.open', name: 'browser.open', description: 'Open page', module: 'browser', inputSchema: {} },
    { id: 'browser.handoff', name: 'browser.handoff', description: 'Handoff browser', module: 'browser', inputSchema: {} },
    { id: 'apps.open', name: 'apps.open', description: 'Open desktop app', module: 'computer', inputSchema: {} },
    { id: 'tasks.list', name: 'tasks.list', description: 'List tasks', module: 'productivity', inputSchema: {} },
    ...Array.from({ length: 25 }, (_, i) => ({ id: `extra.tool.${i}`, name: `tool ${i}`, description: `tool desc ${i}`, module: 'test', inputSchema: {} }))
  ];

  const filtered = selectRelevantTools('what is the weather today', mockTools, [], { enabled: true, topK: 1 });
  const filteredIds = new Set(filtered.tools.map((t) => t.id));

  assert.ok(filteredIds.has('browser.navigate'), 'Filtered tools must retain browser.navigate');
  assert.ok(filteredIds.has('browser.open'), 'Filtered tools must retain browser.open');
  assert.ok(filteredIds.has('browser.handoff'), 'Filtered tools must retain browser.handoff');
  assert.ok(filteredIds.has('apps.open'), 'Filtered tools must retain apps.open');
});

test('AC2: apps.open falls back to visible browser handoff when target is a known website or domain', async () => {
  let handoffCalledWith = null;
  const originalHandoff = browserManager.handoff;

  browserManager.handoff = async (url) => {
    handoffCalledWith = url;
    return { status: 'mock_handoff_success' };
  };

  try {
    // 1. Unknown app that is a known site name ("instagram")
    const mockPlatform = {
      windows: {
        supported: true,
        list: async () => []
      },
      apps: {
        list: async () => [
          { name: 'Calculator', id: 'org.gnome.Calculator' },
          { name: 'Terminal', id: 'org.gnome.Terminal' }
        ]
      }
    };

    const resInstagram = await executeTool('apps.open', { name: 'instagram' }, { platform: mockPlatform });
    assert.equal(resInstagram.ok, true);
    assert.equal(resInstagram.toolId, 'apps.open');
    assert.equal(resInstagram.data.status, 'opened_in_browser');
    assert.equal(resInstagram.data.url, 'https://www.instagram.com');
    assert.equal(resInstagram.data.verified, true);
    assert.equal(handoffCalledWith, 'https://www.instagram.com');

    // 2. Domain name passed to apps.open ("github.com")
    handoffCalledWith = null;
    const resGithub = await executeTool('apps.open', { name: 'github.com' }, { platform: mockPlatform });
    assert.equal(resGithub.ok, true);
    assert.equal(resGithub.data.status, 'opened_in_browser');
    assert.equal(resGithub.data.url, 'https://github.com');
    assert.equal(handoffCalledWith, 'https://github.com');

    // 3. Unknown app that is NOT a website ("some_completely_fake_desktop_app")
    handoffCalledWith = null;
    const resUnknown = await executeTool('apps.open', { name: 'some_completely_fake_desktop_app' }, { platform: mockPlatform });
    assert.equal(resUnknown.ok, false);
    assert.equal(resUnknown.data.status, 'not_found');
    assert.equal(handoffCalledWith, null);
  } finally {
    browserManager.handoff = originalHandoff;
  }
});
