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

test('toggle-jarvis.sh: targets jarvis_hud.py and dispatches SIGUSR1 / SIGUSR2 signals', () => {
  const content = fs.readFileSync(toggleScriptPath, 'utf8');

  assert.match(content, /jarvis_hud\.py/, 'toggle-jarvis.sh must target jarvis_hud.py');
  assert.match(content, /kill\s+-USR1/, 'toggle-jarvis.sh must send SIGUSR1 to toggle HUD');
  assert.match(content, /kill\s+-USR2/, 'toggle-jarvis.sh must send SIGUSR2 for voice triggers');
  assert.match(content, /find_hud_pid/, 'toggle-jarvis.sh must contain find_hud_pid function');
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

test('hyprland.conf: defines layerrule for jarvis-island', () => {
  assert.ok(fs.existsSync(hyprlandConfPath), '~/.config/hypr/hyprland.conf should exist');
  const content = fs.readFileSync(hyprlandConfPath, 'utf8');

  assert.match(content, /layerrule\s*=\s*blur,\s*jarvis-island/, 'Must blur jarvis-island');
  assert.match(content, /layerrule\s*=\s*animation\s+slide\s+bottom,\s*jarvis-island/, 'Must slide bottom jarvis-island');
});

test('hyprland.lua: defines Lua layer rule for jarvis-island', () => {
  assert.ok(fs.existsSync(hyprlandLuaPath), '~/.config/hypr/hyprland.lua should exist');
  const content = fs.readFileSync(hyprlandLuaPath, 'utf8');

  assert.match(content, /namespace\s*=\s*"\^\(jarvis-island\)\$"/, 'Must match jarvis-island namespace in hyprland.lua');
  assert.match(content, /blur\s*=\s*true/, 'Must set blur = true in hyprland.lua');
});
