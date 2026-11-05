import test from 'node:test';
import assert from 'node:assert/strict';

import { routeRequest } from '../server/router.js';
import { getTool } from '../server/registry.js';
import { unattendedTools } from '../server/toolPolicy.js';
import { getMcpToolDefinitions } from '../server/mcpBridge.js';
import { resolveFirstYouTubeVideo, playYouTubeVideo } from '../server/browser/youtube.js';
import { ensureMpvMprisScript, stopBackgroundMusic, MPV_IPC_SOCKET } from '../server/platform/linux/media.js';

test('Music Routing: natural music queries route cleanly to media.play_music', () => {
  const musicQueries = [
    { text: 'play Hum-Dum song', expected: 'Hum-Dum song' },
    { text: 'can you play Hum-Dum song', expected: 'Hum-Dum song' },
    { text: 'play some good music', expected: 'some good music' },
    { text: 'play Believer', expected: 'Believer' },
    { text: 'play arijit singh songs', expected: 'arijit singh songs' },
    { text: 'stream lofi hip hop', expected: 'lofi hip hop' },
    { text: 'listen to bohemian rhapsody', expected: 'bohemian rhapsody' },
    { text: 'put on jazz music', expected: 'jazz music' },
    { text: 'yo jarvis play coldplay', expected: 'coldplay' },
  ];

  for (const q of musicQueries) {
    const route = routeRequest(q.text);
    assert.equal(route.route, 'TOOL_CALL', `Query "${q.text}" must route to TOOL_CALL`);
    assert.equal(route.capability, 'media.play_music', `Query "${q.text}" must route to media.play_music`);
    assert.equal(route.args.query, q.expected, `Query "${q.text}" must extract query "${q.expected}"`);
    assert.ok(route.confidence >= 0.9, `Query "${q.text}" must have high confidence`);
  }
});

test('Music Routing: stop/pause commands route to media.pause', () => {
  const stopQueries = [
    'stop the music',
    'pause the music',
    'stop music',
    'pause music',
    'stop playing',
    'pause'
  ];

  for (const q of stopQueries) {
    const route = routeRequest(q);
    assert.equal(route.route, 'TOOL_CALL', `Query "${q}" must route to TOOL_CALL`);
    assert.equal(route.capability, 'media.pause', `Query "${q}" must route to media.pause`);
  }
});

test('Music Routing: generic play/resume routes to MPRIS media.play', () => {
  const playQueries = [
    'play',
    'play music',
    'play the music',
    'resume',
    'resume music'
  ];

  for (const q of playQueries) {
    const route = routeRequest(q);
    assert.equal(route.route, 'TOOL_CALL', `Query "${q}" must route to TOOL_CALL`);
    assert.equal(route.capability, 'media.play', `Query "${q}" must route to media.play`);
  }
});

test('YouTube Routing: queries specifying youtube route to youtube.play', () => {
  const ytQueries = [
    { text: 'Can you play Hum-Dum Song on YouTube?', expected: 'Hum-Dum Song' },
    { text: 'watch Hum-Dum on YouTube', expected: 'Hum-Dum' },
    { text: 'open Hum-Dum on YouTube', expected: 'Hum-Dum' },
    { text: 'play Bohemian Rhapsody on youtube', expected: 'Bohemian Rhapsody' },
    { text: 'stream lo-fi beats on youtube', expected: 'lo-fi beats' }
  ];

  for (const q of ytQueries) {
    const route = routeRequest(q.text);
    assert.equal(route.route, 'TOOL_CALL', `Query "${q.text}" must route to TOOL_CALL`);
    assert.equal(route.capability, 'youtube.play', `Query "${q.text}" must route to youtube.play`);
    assert.equal(route.args.query, q.expected, `Query "${q.text}" must extract query "${q.expected}"`);
  }
});

test('Tool Registry & Policies: media.play_music registration, schema, and MCP exports', () => {
  const tool = getTool('media.play_music');
  assert.ok(tool, 'media.play_music must be registered');
  assert.equal(tool.id, 'media.play_music');
  assert.equal(tool.module, 'computer');
  assert.equal(tool.riskLevel, 'LOW_RISK_WRITE');
  assert.equal(tool.enabled, true);
  assert.ok(tool.inputSchema.properties.query, 'Schema must define query property');

  const unattended = unattendedTools();
  assert.ok(unattended.some((t) => t.id === 'media.play_music'), 'media.play_music must be unattended');

  const mcpTools = getMcpToolDefinitions();
  assert.ok(mcpTools.some((t) => t.name === 'media.play_music'), 'MCP must expose media.play_music');
  assert.ok(mcpTools.some((t) => t.name === 'media_play_music'), 'MCP must expose media_play_music');
});

test('YouTube Fast Video ID Resolution: resolveFirstYouTubeVideo resolves watch URL', async () => {
  const result = await resolveFirstYouTubeVideo('Hum-Dum Song');
  assert.ok(result, 'resolveFirstYouTubeVideo must return resolved metadata');
  assert.ok(result.videoId, 'Must extract videoId');
  assert.equal(typeof result.videoId, 'string');
  assert.equal(result.videoId.length, 11, 'YouTube videoId must be 11 chars');
  assert.ok(result.watchUrl.startsWith('https://www.youtube.com/watch?v='));
  assert.ok(result.title, 'Must extract title');
});

test('Linux Media: ensureMpvMprisScript and stopBackgroundMusic succeed without error', async () => {
  const scriptLinked = ensureMpvMprisScript();
  assert.equal(typeof scriptLinked, 'boolean');

  const stopResult = await stopBackgroundMusic();
  assert.equal(stopResult.status, 'stopped');
  assert.equal(stopResult.verified, true);
});
