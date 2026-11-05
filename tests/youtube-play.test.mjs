import test from 'node:test';
import assert from 'node:assert/strict';

import { routeRequest } from '../server/router.js';
import { getTool, listTools } from '../server/registry.js';
import { unattendedTools } from '../server/toolPolicy.js';
import { getMcpToolDefinitions } from '../server/mcpBridge.js';
import { executeTool } from '../server/toolExecutor.js';
import { playYouTubeVideo } from '../server/browser/youtube.js';
import { STATEFUL_WEB_DOMAINS } from '../server/browser/BrowserManager.js';

test('AC1: routeRequest routes YouTube song and video playback requests to youtube.play', () => {
  const songQueries = [
    { text: 'Can you play Hum-Dum Song on YouTube?', expected: 'Hum-Dum Song' },
    { text: 'can you play Hum-Dum Song on Youtube', expected: 'Hum-Dum Song' },
    { text: 'play Hum-Dum Song on YouTube', expected: 'Hum-Dum Song' },
    { text: 'play Bohemian Rhapsody on youtube', expected: 'Bohemian Rhapsody' },
    { text: 'can you play Bohemian Rhapsody on youtube?', expected: 'Bohemian Rhapsody' },
    { text: 'search and play despacito on youtube', expected: 'despacito' },
    { text: 'listen to lofi hip hop on youtube', expected: 'lofi hip hop' },
    { text: 'play some jazz on youtube', expected: 'some jazz' },
    { text: 'play Taylor Swift on yt', expected: 'Taylor Swift' },
    { text: 'on youtube play shape of you', expected: 'shape of you' },
    { text: 'youtube play Tum Hi Ho', expected: 'Tum Hi Ho' },
    { text: 'play the song Hotel California on YouTube', expected: 'Hotel California' },
    { text: 'watch SpaceX Starship launch on youtube', expected: 'SpaceX Starship launch' }
  ];

  for (const q of songQueries) {
    const route = routeRequest(q.text);
    assert.equal(route.route, 'TOOL_CALL', `Query "${q.text}" must route to TOOL_CALL`);
    assert.equal(route.capability, 'youtube.play', `Query "${q.text}" must route to youtube.play`);
    assert.equal(route.args.query, q.expected, `Query "${q.text}" must extract query "${q.expected}"`);
    assert.ok(route.confidence >= 0.9, `Query "${q.text}" must have high confidence`);
  }
});

test('AC1: General YouTube opening requests route to browser.open, NOT youtube.play', () => {
  const browserQueries = [
    { text: 'open youtube', cap: 'browser.open' },
    { text: 'can you open youtube.com', cap: 'browser.open' },
    { text: 'go to youtube.com', cap: 'browser.open' },
    { text: 'open youtube on brave browser', cap: 'apps.open' },
    { text: 'open youtube on my default browser', cap: 'browser.open' },
    { text: 'play music', cap: 'media.play' },
    { text: 'pause', cap: 'media.pause' }
  ];

  for (const q of browserQueries) {
    const route = routeRequest(q.text);
    assert.equal(route.capability, q.cap, `Query "${q.text}" must route to ${q.cap}, not youtube.play`);
  }
});

test('AC1: youtube.play tool registration, unattended policy, and MCP definitions', () => {
  const tool = getTool('youtube.play');
  assert.ok(tool, 'youtube.play must be registered in registry.js');
  assert.equal(tool.id, 'youtube.play');
  assert.equal(tool.module, 'computer');
  assert.equal(tool.riskLevel, 'LOW_RISK_WRITE');
  assert.ok(tool.inputSchema.properties.query, 'Schema must define query property');

  // Must be in unattended tools
  const unattended = unattendedTools();
  assert.ok(unattended.some((t) => t.id === 'youtube.play'), 'youtube.play must be in unattended tools');

  // Must be in MCP tools
  const mcpTools = getMcpToolDefinitions();
  assert.ok(mcpTools.some((t) => t.name === 'youtube.play'), 'MCP must expose youtube.play');
  assert.ok(mcpTools.some((t) => t.name === 'youtube_play'), 'MCP must expose youtube_play');

  // youtube.com must be in STATEFUL_WEB_DOMAINS
  assert.ok(STATEFUL_WEB_DOMAINS.includes('youtube.com'), 'youtube.com must be a stateful domain');
});

test('AC1 & AC2: playYouTubeVideo navigates to search, selects video result via snapshot ref, and clicks to watch page', async () => {
  const actionsCalled = [];
  let currentUrl = 'about:blank';
  let desktopOpenedUrl = null;

  const mockBrowserManager = {
    getStatus: () => ({ url: currentUrl, state: 'FIREFOX_ACTIVE' }),
    navigate: async (url) => {
      actionsCalled.push({ action: 'navigate', url });
      currentUrl = url;
      return { result: { url }, status: { url } };
    },
    waitFor: async (selector, timeout) => {
      actionsCalled.push({ action: 'waitFor', selector, timeout });
      return { selector, found: true };
    },
    snapshot: async () => {
      actionsCalled.push({ action: 'snapshot' });
      return {
        items: [
          { ref: 'e1', role: 'link', name: 'Hum-Dum Full Video Song', href: '/watch?v=dQw4w9WgXcQ', selector: '[data-jarvis-ref="e1"]' },
          { ref: 'e2', role: 'button', name: 'Filters', selector: '[data-jarvis-ref="e2"]' }
        ]
      };
    },
    click: async (selector, options) => {
      actionsCalled.push({ action: 'click', selector, options });
      // Clicking video navigates to watch page
      currentUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      return { url: currentUrl, selector };
    },
    evaluate: async (code) => {
      actionsCalled.push({ action: 'evaluate', code });
      return true;
    }
  };

  const mockOpenDesktopUrl = async (url) => {
    desktopOpenedUrl = url;
    return { status: 'opened', url, verified: true };
  };

  const result = await playYouTubeVideo('Hum-Dum Song', {
    browserManager: mockBrowserManager,
    openDesktopUrl: mockOpenDesktopUrl
  });

  // Verify full sequence
  assert.equal(result.status, 'playing');
  assert.equal(result.query, 'Hum-Dum Song');
  assert.equal(result.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(result.title, 'Hum-Dum Full Video Song');
  assert.equal(result.selector, '@e1', 'Should use snapshot ref @e1 from search results');

  // Verify actions executed in order
  assert.equal(actionsCalled[0].action, 'navigate');
  assert.ok(actionsCalled[0].url.includes('search_query=Hum-Dum%20Song'));
  assert.equal(actionsCalled[1].action, 'waitFor');
  assert.equal(actionsCalled[2].action, 'snapshot');
  assert.equal(actionsCalled[3].action, 'click');
  assert.equal(actionsCalled[3].selector, '@e1');
  assert.equal(actionsCalled[4].action, 'evaluate');
  assert.ok(actionsCalled[4].code.includes('video.play'));

  // Verify host desktop browser opened watch URL
  assert.equal(desktopOpenedUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
});

test('AC1 & AC2: playYouTubeVideo falls back to direct selectors when snapshot ref is unavailable', async () => {
  const actionsCalled = [];
  let currentUrl = 'about:blank';

  const mockBrowserManager = {
    getStatus: () => ({ url: currentUrl }),
    navigate: async (url) => {
      actionsCalled.push({ action: 'navigate', url });
      currentUrl = url;
      return { result: { url }, status: { url } };
    },
    waitFor: async () => ({ found: true }),
    snapshot: async () => ({ items: [] }), // Empty snapshot
    click: async (selector, options) => {
      actionsCalled.push({ action: 'click', selector, options });
      currentUrl = 'https://www.youtube.com/watch?v=abc987';
      return { url: currentUrl, selector };
    },
    evaluate: async () => true
  };

  const result = await playYouTubeVideo('Bohemian Rhapsody', {
    browserManager: mockBrowserManager,
    openDesktopUrl: async () => {}
  });

  assert.equal(result.status, 'playing');
  assert.equal(result.url, 'https://www.youtube.com/watch?v=abc987');
  const clickAction = actionsCalled.find((a) => a.action === 'click');
  assert.ok(clickAction, 'Must execute browser.click');
  assert.ok(clickAction.selector.includes('ytd-video-renderer'), 'Must target video-renderer when snapshot ref missing');
});

test('AC1 & AC2: executeTool("youtube.play") integrates through canonical dispatcher', async () => {
  let currentUrl = 'about:blank';
  const mockBrowserManager = {
    getStatus: () => ({ url: currentUrl }),
    navigate: async (url) => { currentUrl = url; },
    waitFor: async () => ({ found: true }),
    snapshot: async () => ({
      items: [{ ref: 'e1', role: 'link', name: 'Tum Hi Ho Official Video', href: '/watch?v=tHiHo123' }]
    }),
    click: async () => { currentUrl = 'https://www.youtube.com/watch?v=tHiHo123'; },
    evaluate: async () => true
  };

  const output = await executeTool('youtube.play', { query: 'Tum Hi Ho' }, {
    browserManager: mockBrowserManager,
    openDesktopUrl: async () => {}
  });

  assert.equal(output.ok, true);
  assert.equal(output.toolId, 'youtube.play');
  assert.equal(output.data.status, 'playing');
  assert.equal(output.data.url, 'https://www.youtube.com/watch?v=tHiHo123');
  assert.equal(output.data.title, 'Tum Hi Ho Official Video');
});
