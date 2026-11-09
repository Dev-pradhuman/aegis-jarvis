import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  createAutonomousSkill,
  discoverSkills,
  discoverSkillsSync,
  findMatchingSkills,
  findMatchingSkillsSync,
  formatSkillPrompt,
  formatAllMatchingSkillsPrompt,
  parseSkillMd,
  clearSkillsCache,
  slugify,
} from '../server/skillsEngine.js';
import { routeRequest } from '../server/router.js';
import { assembleModelContext } from '../server/contextAssembler.js';

test('SkillsEngine: slugify converts titles to canonical url-friendly slugs', () => {
  assert.equal(slugify('Deploy Staging Environment'), 'deploy-staging-environment');
  assert.equal(slugify('Git Status & Branch Verification'), 'git-status-branch-verification');
  assert.equal(slugify('   Special #*& Chars   '), 'special-chars');
});

test('SkillsEngine: createAutonomousSkill packages multi-step trajectory into AgentSkills SKILL.md', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'jarvis-skills-test-'));
  try {
    const workflowName = 'Automated Git Release Verification';
    const steps = [
      'Check working tree status with git status',
      'Run unit test suite with npm test',
      'Verify clean working tree and tag release version'
    ];
    const outcome = 'Release tag verified and all tests pass with zero errors.';

    const skill = await createAutonomousSkill(workflowName, steps, outcome, {
      skillsDir: tmpDir,
      description: 'Automated release verification workflow for Aegis-JARVIS',
      tags: ['git', 'release', 'verification', 'testing'],
    });

    assert.equal(skill.name, workflowName);
    assert.equal(skill.slug, 'automated-git-release-verification');
    assert.equal(skill.stepsCount, 3);
    assert.ok(skill.path.endsWith('SKILL.md'));

    const fileContent = await fsp.readFile(skill.path, 'utf8');
    assert.ok(fileContent.startsWith('---'), 'SKILL.md must start with YAML frontmatter delimiter');
    assert.ok(fileContent.includes('name: automated-git-release-verification'));
    assert.ok(fileContent.includes('- git'));
    assert.ok(fileContent.includes('- release'));
    assert.ok(fileContent.includes('# Automated Git Release Verification'));
    assert.ok(fileContent.includes('## Trajectory / Execution Steps'));
    assert.ok(fileContent.includes('1. Check working tree status'));
    assert.ok(fileContent.includes('## Expected Outcome'));
    assert.ok(fileContent.includes(outcome));

    // Test parseSkillMd
    const parsed = parseSkillMd(fileContent);
    assert.equal(parsed.name, workflowName);
    assert.equal(parsed.slug, 'automated-git-release-verification');
    assert.equal(parsed.steps.length, 3);
    assert.ok(parsed.tags.includes('git'));
    assert.ok(parsed.tags.includes('testing'));
    assert.equal(parsed.outcome, outcome);
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('SkillsEngine: discoverSkills and discoverSkillsSync load skills from disk', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'jarvis-skills-test-'));
  try {
    await createAutonomousSkill('Database Backup Snapshot', ['Dump state.json', 'Compress snapshot'], 'Backup tarball created.', {
      skillsDir: tmpDir,
      tags: ['database', 'backup']
    });

    // Test async discover
    const discoveredAsync = await discoverSkills(tmpDir);
    assert.equal(discoveredAsync.length, 1);
    assert.equal(discoveredAsync[0].slug, 'database-backup-snapshot');

    // Test sync discover
    clearSkillsCache();
    const discoveredSync = discoverSkillsSync(tmpDir);
    assert.equal(discoveredSync.length, 1);
    assert.equal(discoveredSync[0].slug, 'database-backup-snapshot');
    assert.equal(discoveredSync[0].steps.length, 2);
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('SkillsEngine: findMatchingSkills matches queries by intent, tags, and keywords', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'jarvis-skills-test-'));
  try {
    await createAutonomousSkill('Docker Container Cleanup', ['docker ps -a', 'docker system prune -f'], 'All dangling containers removed.', {
      skillsDir: tmpDir,
      tags: ['docker', 'cleanup', 'devops']
    });

    await createAutonomousSkill('Audio Volume Normalization', ['wpctl get-volume @DEFAULT_AUDIO_SINK@', 'wpctl set-volume 60%'], 'Volume set to comfortable 60%.', {
      skillsDir: tmpDir,
      tags: ['audio', 'pipewire', 'volume']
    });

    clearSkillsCache();

    // Matching query
    const dockerMatches = findMatchingSkillsSync('how to cleanup docker containers', { skillsDir: tmpDir });
    assert.ok(dockerMatches.length >= 1, 'Should find docker cleanup skill');
    assert.equal(dockerMatches[0].slug, 'docker-container-cleanup');

    const audioMatches = findMatchingSkillsSync('normalize audio volume', { skillsDir: tmpDir });
    assert.ok(audioMatches.length >= 1, 'Should find audio normalization skill');
    assert.equal(audioMatches[0].slug, 'audio-volume-normalization');

    // Unrelated query
    const noMatches = findMatchingSkillsSync('unrelated query about astrophysics in interstellar', { skillsDir: tmpDir });
    assert.equal(noMatches.length, 0);
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('SkillsEngine: formatSkillPrompt and formatAllMatchingSkillsPrompt format context for LLM', async () => {
  const skill = {
    name: 'Spotify Playlist Shuffler',
    slug: 'spotify-playlist-shuffler',
    description: 'Autonomous Spotify queue shuffler',
    steps: ['Open Spotify player', 'Select favorite playlist', 'Enable shuffle toggle'],
    outcome: 'Music starts playing in shuffled order.'
  };

  const formatted = formatSkillPrompt(skill);
  assert.ok(formatted.includes('Spotify Playlist Shuffler'));
  assert.ok(formatted.includes('1. Open Spotify player'));
  assert.ok(formatted.includes('Expected Outcome: Music starts playing'));

  const multi = formatAllMatchingSkillsPrompt([skill]);
  assert.ok(multi.includes('RELEVANT AUTONOMOUS SKILLS'));
  assert.ok(multi.includes('Spotify Playlist Shuffler'));
});

test('SkillsEngine & Router: routeRequest detects explicit workflow execution and attaches matching skills to MODEL', async () => {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'jarvis-skills-test-'));
  const origSkillsDir = process.env.JARVIS_SKILLS_DIR;
  process.env.JARVIS_SKILLS_DIR = tmpDir;

  try {
    await createAutonomousSkill('Linux Memory Diagnostics', ['free -m', 'ps aux --sort=-%mem'], 'Memory bottlenecks identified.', {
      skillsDir: tmpDir,
      tags: ['memory', 'diagnostics', 'linux']
    });
    clearSkillsCache();

    // 1. Explicit execution route
    const explicitRoute = routeRequest('jarvis run workflow linux-memory-diagnostics');
    assert.equal(explicitRoute.route, 'SKILL');
    assert.equal(explicitRoute.capability, 'linux-memory-diagnostics');
    assert.ok(explicitRoute.skill);

    // 2. MODEL fallback attaches matchingSkill
    const modelRoute = routeRequest('can you help diagnose high memory usage on this linux server');
    assert.equal(modelRoute.route, 'MODEL');
    assert.ok(modelRoute.matchedSkill, 'Should have matchedSkill attached');
    assert.equal(modelRoute.matchedSkill.slug, 'linux-memory-diagnostics');

    // 3. assembleModelContext injects the skill into system messages
    const context = assembleModelContext({
      query: 'can you help diagnose high memory usage on this linux server',
      matchingSkills: [modelRoute.matchedSkill]
    });
    const systemSkillMsg = context.context.find((m) => m.content.includes('Autonomous Skill: Linux Memory Diagnostics'));
    assert.ok(systemSkillMsg, 'assembleModelContext should inject the skill prompt');
  } finally {
    process.env.JARVIS_SKILLS_DIR = origSkillsDir;
    clearSkillsCache();
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});
