import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const toggleScriptPath = path.join(repoRoot, 'scripts/toggle-jarvis.sh');
const hyprlandConfPath = path.join(process.env.HOME || '/home/pradhuman', '.config/hypr/hyprland.conf');
const hyprlandLuaPath = path.join(process.env.HOME || '/home/pradhuman', '.config/hypr/hyprland.lua');

test('toggle-jarvis.sh: file exists, is executable, and passes bash syntax validation', () => {
  assert.ok(fs.existsSync(toggleScriptPath), 'scripts/toggle-jarvis.sh must exist');
  const stat = fs.statSync(toggleScriptPath);
  assert.ok((stat.mode & 0o111) !== 0, 'scripts/toggle-jarvis.sh must be executable');

  // Verify bash syntax
  const result = execFileSync('bash', ['-n', toggleScriptPath], { encoding: 'utf8' });
  assert.equal(result, '', 'bash -n should produce no syntax errors');
});

test('toggle-jarvis.sh: correctly identifies jarvis-mini window address and PID via jq pattern', () => {
  const sampleClients = JSON.stringify([
    {
      address: '0x557a1006bce0',
      pid: 12345,
      title: 'JARVIS // Galaxy — Zen Browser',
      class: 'zen',
      workspace: { id: 1, name: '1' },
    },
    {
      address: '0x557a102f2180',
      pid: 23456,
      title: 'Aegis-JARVIS Brain Mode Upgrade Prompts - Google Gemini — Zen Browser',
      class: 'zen',
      workspace: { id: 1, name: '1' },
    },
    {
      address: '0x557a10413180',
      pid: 34567,
      title: 'JARVIS-MINI',
      class: 'jarvis-mini',
      initialClass: 'jarvis-mini',
      workspace: { id: 1, name: '1' },
    },
    {
      address: '0x557a10555555',
      pid: 45678,
      title: 'terminal',
      class: 'kitty',
      workspace: { id: 2, name: '2' },
    },
  ]);

  const jqQueryAddr = `
    .[] | select(
      ((.class // "") == "jarvis-mini") or
      ((.initialClass // "") == "jarvis-mini") or
      (((.title // "") | test("JARVIS-MINI"; "i"))) or
      (((.title // "") | test("127\\\\.0\\\\.0\\\\.1:8787/\\\\?mode=mini"; "i")))
    ) | .address
  `;

  const jqQueryPid = `
    .[] | select(
      ((.class // "") == "jarvis-mini") or
      ((.initialClass // "") == "jarvis-mini") or
      (((.title // "") | test("JARVIS-MINI"; "i"))) or
      (((.title // "") | test("127\\\\.0\\\\.0\\\\.1:8787/\\\\?mode=mini"; "i")))
    ) | .pid
  `;

  const outputAddr = execFileSync('jq', ['-r', jqQueryAddr], {
    input: sampleClients,
    encoding: 'utf8',
  }).trim();

  const outputPid = execFileSync('jq', ['-r', jqQueryPid], {
    input: sampleClients,
    encoding: 'utf8',
  }).trim();

  assert.equal(outputAddr, '0x557a10413180', 'Should extract the jarvis-mini window address');
  assert.equal(outputPid, '34567', 'Should extract the jarvis-mini PID');
});

test('hyprland.conf: contains SUPER, J binding to toggle-jarvis.sh without conflicts', () => {
  assert.ok(fs.existsSync(hyprlandConfPath), '~/.config/hypr/hyprland.conf should exist');
  const content = fs.readFileSync(hyprlandConfPath, 'utf8');

  assert.match(
    content,
    /bind\s*=\s*SUPER,\s*J,\s*exec,\s*\/home\/pradhuman\/projects\/aegis-jarvis\/scripts\/toggle-jarvis\.sh/,
    'hyprland.conf must bind SUPER, J to toggle-jarvis.sh'
  );

  // Ensure no un-commented movefocus, d conflict remains on SUPER, J
  const lines = content.split('\n');
  const conflictingLine = lines.find((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) return false;
    return /SUPER.*J.*movefocus/i.test(trimmed);
  });
  assert.equal(conflictingLine, undefined, 'No conflicting SUPER, J movefocus binding should exist');
});

test('hyprland.conf: defines windowrulev2 rules for jarvis-mini', () => {
  assert.ok(fs.existsSync(hyprlandConfPath), '~/.config/hypr/hyprland.conf should exist');
  const content = fs.readFileSync(hyprlandConfPath, 'utf8');

  assert.match(content, /windowrulev2\s*=\s*float,\s*class:\^\(jarvis-mini\)\$/, 'Must float jarvis-mini');
  assert.match(content, /windowrulev2\s*=\s*size\s+800\s+76,\s*class:\^\(jarvis-mini\)\$/, 'Must set size 800 76');
  assert.match(content, /windowrulev2\s*=\s*center,\s*class:\^\(jarvis-mini\)\$/, 'Must center jarvis-mini');
  assert.match(content, /windowrulev2\s*=\s*noborder,\s*class:\^\(jarvis-mini\)\$/, 'Must remove border');
  assert.match(content, /windowrulev2\s*=\s*pin,\s*class:\^\(jarvis-mini\)\$/, 'Must pin jarvis-mini');
  assert.match(content, /windowrulev2\s*=\s*stayfocused,\s*class:\^\(jarvis-mini\)\$/, 'Must keep focus');
});

test('hyprland.lua: defines Lua window rules for jarvis-mini', () => {
  assert.ok(fs.existsSync(hyprlandLuaPath), '~/.config/hypr/hyprland.lua should exist');
  const content = fs.readFileSync(hyprlandLuaPath, 'utf8');

  assert.match(content, /class\s*=\s*"\^\(jarvis-mini\)\$"/, 'Must match jarvis-mini class in hyprland.lua');
  assert.match(content, /float\s*=\s*true/, 'Must set float = true in hyprland.lua');
  assert.match(content, /border_size\s*=\s*0/, 'Must set border_size = 0 in hyprland.lua');
  assert.match(content, /stay_focused\s*=\s*true/, 'Must set stay_focused = true in hyprland.lua');
});
