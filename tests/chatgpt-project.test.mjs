import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyChatGPTPage, matchesConfiguredProjectUrl, projectNamePattern, DEFAULT_JARVIS_CHATGPT_URL } from '../server/chatgptWebTransport.js';

test('ChatGPT project discovery matches jarvis-chat by exact name, not pinned position', () => { const matcher = projectNamePattern('jarvis-chat'); assert.equal(matcher.test('jarvis-chat'), true); assert.equal(matcher.test('Viralyst'), false); assert.equal(matcher.test('jarvis-chat backup'), false); });
test('project name matching safely escapes selector-like characters', () => { const matcher = projectNamePattern('jarvis-chat (main)'); assert.equal(matcher.test('jarvis-chat (main)'), true); assert.equal(matcher.test('jarvis-chat main'), false); });
test('stable ChatGPT project URL verifies only the configured project and safe origin', () => {
  const project = 'https://chatgpt.com/g/g-p-6a9ed38ea1c8819182eb991a96e4fc1c-jarvis-chat/project';
  assert.equal(matchesConfiguredProjectUrl(project, project, 'jarvis-chat'), true);
  assert.equal(matchesConfiguredProjectUrl('https://chatgpt.com/g/g-p-other-jarvis-yurei/project', project, 'jarvis-chat'), false);
  assert.equal(matchesConfiguredProjectUrl('https://example.com/g/g-p-6a9ed38ea1c8819182eb991a96e4fc1c-jarvis-chat/project', project, 'jarvis-chat'), false);
});
test('generic Try again shell is a retryable availability failure, not a UI-selector failure', () => {
  assert.equal(classifyChatGPTPage('Try again').code, 'CHATGPT_WEB_UNAVAILABLE');
  assert.equal(classifyChatGPTPage('Try again later').code, 'CHATGPT_RATE_LIMITED');
  assert.equal(classifyChatGPTPage('Log in to ChatGPT').code, 'CHATGPT_LOGIN_REQUIRED');
  assert.equal(classifyChatGPTPage('Normal project content'), null);
});
test('the default headless target is the exact persistent JARVIS conversation', () => { assert.equal(DEFAULT_JARVIS_CHATGPT_URL, 'https://chatgpt.com/g/g-p-6a9ed38ea1c8819182eb991a96e4fc1c-jarvis-chat/c/6aa171a5-72fc-83e8-ac5f-1a3b70424a6a'); assert.equal(matchesConfiguredProjectUrl(DEFAULT_JARVIS_CHATGPT_URL, DEFAULT_JARVIS_CHATGPT_URL, 'jarvis-chat'), true); });
