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

test('toggle-jarvis.sh: file exists, is executable, and passes bash syntax validation', () => {
  assert.ok(fs.existsSync(toggleScriptPath), 'scripts/toggle-jarvis.sh must exist');
  const stat = fs.statSync(toggleScriptPath);
  assert.ok((stat.mode & 0o111) !== 0, 'scripts/toggle-jarvis.sh must be executable');

  // Verify bash syntax
  const result = execFileSync('bash', ['-n', toggleScriptPath], { encoding: 'utf8' });
  assert.equal(result, '', 'bash -n should produce no syntax errors');
});

test('toggle-jarvis.sh: correctly identifies active JARVIS window address via jq pattern', () => {
  const sampleClients = JSON.stringify([
    {
      address: '0x557a1006bce0',
      title: 'JARVIS // Galaxy — Zen Browser',
      class: 'zen',
      workspace: { id: 1, name: '1' },
    },
    {
      address: '0x557a102f2180',
      title: 'Aegis-JARVIS Brain Mode Upgrade Prompts - Google Gemini — Zen Browser',
      class: 'zen',
      workspace: { id: 1, name: '1' },
    },
    {
      address: '0x557a10413180',
      title: 'JARVIS-ISLAND',
      class: 'jarvis-island',
      workspace: { id: 3, name: '3' },
    },
    {
      address: '0x557a10555555',
      title: 'terminal',
      class: 'kitty',
      workspace: { id: 2, name: '2' },
    },
  ]);

  const jqQuery = `
    .[] | select(
      (
        ((.title // "") | test("(^|[[:space:]])JARVIS[[:space:]]*(//|$)|127\\\\.0\\\\.0\\\\.1:8787|localhost:8787"; "i")) or
        ((.initialTitle // "") | test("(^|[[:space:]])JARVIS[[:space:]]*(//|$)|127\\\\.0\\\\.0\\\\.1:8787"; "i"))
      ) and
      (((.title // "") | test("JARVIS-ISLAND"; "i")) | not) and
      (((.class // "") | test("jarvis-island"; "i")) | not)
    ) | .address
  `;

  const output = execFileSync('jq', ['-r', jqQuery], {
    input: sampleClients,
    encoding: 'utf8',
  }).trim();

  assert.equal(output, '0x557a1006bce0', 'Should extract the JARVIS window address and exclude island & search tabs');
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
