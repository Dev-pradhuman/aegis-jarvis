import test from 'node:test';
import assert from 'node:assert/strict';

import { getTool, listTools } from '../server/registry.js';
import { unattendedTools } from '../server/toolPolicy.js';
import { toolFilterSettings } from '../server/toolFilter.js';
import { routeRequest } from '../server/router.js';
import { executeTool, implementedToolIds } from '../server/toolExecutor.js';
import { isSpotifyInstalled, resolveSpotifyTrack, playSpotifyTrack, fetchOEmbedTitle } from '../server/spotify.js';

test('AC1 & AC4: spotify.play tool registration, schema, policy, and filter', () => {
  const tool = getTool('spotify.play');
  assert.ok(tool, 'spotify.play must be registered in registry.js');
  assert.equal(tool.id, 'spotify.play');
  assert.equal(tool.module, 'media');
  assert.equal(tool.riskLevel, 'LOW_RISK_WRITE');
  assert.equal(tool.requiresApproval, false);
  assert.equal(tool.enabled, true);
  assert.deepEqual(tool.inputSchema.required, ['query']);

  const unattended = unattendedTools();
  assert.ok(unattended.some((t) => t.id === 'spotify.play'), 'spotify.play must be in unattendedTools()');

  const filterSettings = toolFilterSettings();
  assert.ok(filterSettings.coreTools.includes('spotify.play'), 'spotify.play must be in CORE_TOOLS');

  assert.ok(implementedToolIds.includes('spotify.play'), 'spotify.play must be in implementedToolIds');
});

test('AC1: resolveSpotifyTrack resolves direct URI and URL with zero search requests', async () => {
  // Direct track URI
  const r1 = await resolveSpotifyTrack('spotify:track:4cOdK2wGLETKBW3PvgPWqT', {
    fetchImpl: async (url) => {
      assert.ok(url.includes('4cOdK2wGLETKBW3PvgPWqT'));
      return { ok: true, json: async () => ({ title: 'Never Gonna Give You Up' }) };
    }
  });
  assert.equal(r1.id, '4cOdK2wGLETKBW3PvgPWqT');
  assert.equal(r1.uri, 'spotify:track:4cOdK2wGLETKBW3PvgPWqT');
  assert.equal(r1.url, 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
  assert.equal(r1.title, 'Never Gonna Give You Up');

  // Direct open.spotify.com URL
  const r2 = await resolveSpotifyTrack('https://open.spotify.com/track/3z8h0TU7ReDPLIbEnYhWZb', {
    fetchImpl: async () => ({ ok: true, json: async () => ({ title: 'Bohemian Rhapsody' }) })
  });
  assert.equal(r2.id, '3z8h0TU7ReDPLIbEnYhWZb');
  assert.equal(r2.uri, 'spotify:track:3z8h0TU7ReDPLIbEnYhWZb');
  assert.equal(r2.title, 'Bohemian Rhapsody');
});

test('AC1: resolveSpotifyTrack queries search and retrieves clean title via oEmbed', async () => {
  const fetchCalls = [];
  const mockFetch = async (url) => {
    fetchCalls.push(url);
    if (url.includes('search.yahoo.com')) {
      return {
        ok: true,
        text: async () => '<html>... open.spotify.com%2ftrack%2f6l8GvAyoUZwWDgF1e4822w ...</html>'
      };
    }
    if (url.includes('open.spotify.com/oembed')) {
      return {
        ok: true,
        json: async () => ({ title: 'Bohemian Rhapsody' })
      };
    }
    return { ok: false };
  };

  const track = await resolveSpotifyTrack('Bohemian Rhapsody', { fetchImpl: mockFetch });
  assert.equal(track.id, '6l8GvAyoUZwWDgF1e4822w');
  assert.equal(track.uri, 'spotify:track:6l8GvAyoUZwWDgF1e4822w');
  assert.equal(track.url, 'https://open.spotify.com/track/6l8GvAyoUZwWDgF1e4822w');
  assert.equal(track.title, 'Bohemian Rhapsody');
  assert.ok(fetchCalls.some((u) => u.includes('search.yahoo.com')));
  assert.ok(fetchCalls.some((u) => u.includes('/oembed?url=')));
});

test('AC2: playSpotifyTrack launches desktop player and triggers play command', async () => {
  const commandsRun = [];
  const mockRunner = async (cmd, args, opts) => {
    commandsRun.push({ cmd, args, opts });
    return { stdout: '', stderr: '' };
  };

  const mockFetch = async (url) => {
    if (url.includes('search.yahoo.com')) {
      return { ok: true, text: async () => 'open.spotify.com%2ftrack%2f40riOy7x9W7GXjyGp4pjAv' };
    }
    return { ok: true, json: async () => ({ title: 'Hotel California' }) };
  };

  const result = await playSpotifyTrack('Hotel California', {
    runExec: mockRunner,
    fetchImpl: mockFetch,
    waitMs: 10 // fast for tests
  });

  assert.equal(result.status, 'playing');
  assert.equal(result.provider, 'spotify');
  assert.equal(result.id, '40riOy7x9W7GXjyGp4pjAv');
  assert.equal(result.uri, 'spotify:track:40riOy7x9W7GXjyGp4pjAv');
  assert.equal(result.title, 'Hotel California');

  // Verify xdg-open was triggered
  assert.ok(commandsRun.some((c) => c.cmd === 'xdg-open' && c.args?.[0] === 'spotify:track:40riOy7x9W7GXjyGp4pjAv'));
  // Verify playerctl play was executed
  assert.ok(commandsRun.some((c) => c.cmd === 'sh' && c.args?.[1]?.includes('playerctl -p spotify play')));
});

test('AC4: routeRequest routes Spotify and YouTube playback queries accurately', () => {
  // Explicit Spotify queries
  const spotifyQueries = [
    { text: 'play Bohemian Rhapsody on spotify', expected: 'Bohemian Rhapsody' },
    { text: 'can you play Hum-Dum song on spotify', expected: 'Hum-Dum song' },
    { text: 'listen to Hotel California on Spotify', expected: 'Hotel California' },
    { text: 'spotify play Believer', expected: 'Believer' },
    { text: 'put on jazz on spotify', expected: 'jazz' }
  ];

  for (const q of spotifyQueries) {
    const route = routeRequest(q.text);
    assert.equal(route.route, 'TOOL_CALL', `Query "${q.text}" must route to TOOL_CALL`);
    assert.equal(route.capability, 'spotify.play', `Query "${q.text}" must route to spotify.play`);
    assert.equal(route.args.query, q.expected, `Query "${q.text}" must extract query "${q.expected}"`);
    assert.ok(route.confidence >= 0.9);
  }

  // Explicit YouTube queries
  const youtubeQueries = [
    { text: 'play Hum-Dum song on youtube', expected: 'Hum-Dum song' },
    { text: 'can you play Bohemian Rhapsody on youtube', expected: 'Bohemian Rhapsody' }
  ];

  for (const q of youtubeQueries) {
    const route = routeRequest(q.text);
    assert.equal(route.route, 'TOOL_CALL');
    assert.equal(route.capability, 'youtube.play');
    assert.equal(route.args.query, q.expected);
  }

  // Generic play query with preferSpotify
  const origPrefer = process.env.PREFER_SPOTIFY;
  try {
    process.env.PREFER_SPOTIFY = 'true';
    const genericRoute = routeRequest('play Hotel California');
    assert.equal(genericRoute.route, 'TOOL_CALL');
    assert.equal(genericRoute.capability, 'spotify.play');
    assert.equal(genericRoute.args.query, 'Hotel California');
  } finally {
    if (origPrefer !== undefined) process.env.PREFER_SPOTIFY = origPrefer;
    else delete process.env.PREFER_SPOTIFY;
  }
});

test('AC4: executeTool("spotify.play") integrates through canonical dispatcher', async () => {
  const commandsRun = [];
  const mockRunner = async (cmd, args) => {
    commandsRun.push({ cmd, args });
    return { stdout: '', stderr: '' };
  };

  const result = await executeTool(
    'spotify.play',
    { query: 'spotify:track:4cOdK2wGLETKBW3PvgPWqT' },
    {
      runExec: mockRunner,
      waitMs: 5,
      fetchImpl: async () => ({ ok: true, json: async () => ({ title: 'Never Gonna Give You Up' }) })
    }
  );

  assert.equal(result.toolId, 'spotify.play');
  assert.equal(result.ok, true);
  assert.equal(result.data.status, 'playing');
  assert.equal(result.data.uri, 'spotify:track:4cOdK2wGLETKBW3PvgPWqT');
  assert.equal(result.data.title, 'Never Gonna Give You Up');
});
