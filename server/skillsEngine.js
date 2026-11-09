import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export function getSkillsDir(customDir) {
  return customDir || process.env.JARVIS_SKILLS_DIR || path.join(
    process.env.HOME || '/home/pradhuman',
    '.jarvis-cli-profile/home/.gemini/skills'
  );
}

export const DEFAULT_SKILLS_DIR = getSkillsDir();

let cachedSkills = null;
let cachedSkillsDir = null;

export function slugify(text = '') {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function parseSkillMd(rawContent = '') {
  const content = String(rawContent || '');
  let frontmatterRaw = '';
  let body = content;

  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (fmMatch) {
    frontmatterRaw = fmMatch[1];
    body = fmMatch[2];
  }

  // Parse YAML frontmatter
  const meta = { tags: [] };
  if (frontmatterRaw) {
    const lines = frontmatterRaw.split(/\r?\n/);
    let currentKey = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      if (trimmed.startsWith('- ') && currentKey) {
        const itemVal = trimmed.slice(2).trim().replace(/^['"]|['"]$/g, '');
        if (Array.isArray(meta[currentKey])) {
          meta[currentKey].push(itemVal);
        }
        continue;
      }

      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        const key = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
        currentKey = key;
        if (!value) {
          if (!meta[key]) meta[key] = [];
        } else if (value.startsWith('[') && value.endsWith(']')) {
          meta[key] = value.slice(1, -1).split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, ''));
        } else {
          meta[key] = value;
        }
      }
    }
  }

  // Parse Markdown sections
  let overview = '';
  let expectedOutcome = '';
  const steps = [];

  const overviewMatch = body.match(/##\s+Overview\r?\n([\s\S]*?)(?=\r?\n##|$)/i);
  if (overviewMatch) {
    overview = overviewMatch[1].trim();
  }

  const stepsMatch = body.match(/##\s+(?:Trajectory\s*\/\s*Execution\s+Steps|Workflow\s+Steps|Steps)\r?\n([\s\S]*?)(?=\r?\n##|$)/i);
  if (stepsMatch) {
    const stepLines = stepsMatch[1].split(/\r?\n/);
    for (const sl of stepLines) {
      const st = sl.trim();
      const numMatch = st.match(/^\d+\.\s*(.+)$/);
      const dashMatch = st.match(/^-\s*(.+)$/);
      if (numMatch) {
        steps.push(numMatch[1].trim());
      } else if (dashMatch) {
        steps.push(dashMatch[1].trim());
      }
    }
  }

  const outcomeMatch = body.match(/##\s+(?:Expected\s+Outcome|Outcome)\r?\n([\s\S]*?)(?=\r?\n##|$)/i);
  if (outcomeMatch) {
    expectedOutcome = outcomeMatch[1].trim();
  }

  const titleMatch = body.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : meta.name;

  return {
    name: title || meta.name || 'unnamed-skill',
    slug: meta.name || slugify(title || 'unnamed-skill'),
    description: meta.description || overview || '',
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    created: meta.created || null,
    overview,
    steps,
    outcome: expectedOutcome,
  };
}

export async function createAutonomousSkill(workflowName, steps = [], outcome = '', options = {}) {
  if (!workflowName || typeof workflowName !== 'string') {
    throw new Error('Workflow name is required to create an autonomous skill');
  }

  const slug = options.slug || slugify(workflowName);
  const skillsDir = path.resolve(getSkillsDir(options.skillsDir));
  const skillDir = path.join(skillsDir, slug);
  await fsp.mkdir(skillDir, { recursive: true });

  const tags = Array.isArray(options.tags)
    ? options.tags
    : [slug, ...workflowName.toLowerCase().split(/\s+/).filter((w) => w.length > 3)];

  const description = options.description || `Autonomous execution trajectory for ${workflowName}.`;
  const created = new Date().toISOString();

  // Normalize steps to strings
  const normalizedSteps = (Array.isArray(steps) ? steps : [steps]).map((s, i) => {
    if (typeof s === 'string') return s;
    if (s && typeof s === 'object') {
      return s.action || s.name || s.tool || JSON.stringify(s);
    }
    return String(s);
  });

  const outcomeStr = typeof outcome === 'object' ? JSON.stringify(outcome) : String(outcome || '');

  const yamlTags = tags.map((t) => `  - ${t}`).join('\n');
  const yamlContent = `---
name: ${slug}
description: >
  ${description.replace(/\n/g, ' ')}
tags:
${yamlTags}
created: '${created}'
---

# ${workflowName}

## Overview
${description}

## Trajectory / Execution Steps
${normalizedSteps.map((step, idx) => `${idx + 1}. ${step}`).join('\n')}

## Expected Outcome
${outcomeStr}
`;

  const skillMdPath = path.join(skillDir, 'SKILL.md');
  await fsp.writeFile(skillMdPath, yamlContent, 'utf8');

  // Also write skill.json for fast structured lookup
  const metaJson = {
    name: workflowName,
    slug,
    description,
    tags,
    steps: normalizedSteps,
    outcome: outcomeStr,
    created,
    path: skillMdPath,
  };
  await fsp.writeFile(path.join(skillDir, 'skill.json'), JSON.stringify(metaJson, null, 2), 'utf8');

  // Invalidate cache
  cachedSkills = null;

  return {
    name: workflowName,
    slug,
    dir: skillDir,
    path: skillMdPath,
    stepsCount: normalizedSteps.length,
    steps: normalizedSteps,
    outcome: outcomeStr,
    description,
    tags,
    created,
  };
}

export function discoverSkillsSync(skillsDir) {
  const resolvedDir = path.resolve(getSkillsDir(skillsDir));
  if (cachedSkills && cachedSkillsDir === resolvedDir) {
    return cachedSkills;
  }

  let entries = [];
  try {
    entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
  } catch {
    cachedSkills = [];
    cachedSkillsDir = resolvedDir;
    return [];
  }

  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(resolvedDir, entry.name, 'SKILL.md');
    try {
      if (fs.existsSync(skillPath)) {
        const raw = fs.readFileSync(skillPath, 'utf8');
        const parsed = parseSkillMd(raw);
        skills.push({
          ...parsed,
          path: skillPath,
          dir: path.join(resolvedDir, entry.name),
        });
      }
    } catch (err) {
      console.warn(`[SkillsEngine] Failed to load skill at ${skillPath}: ${err.message}`);
    }
  }

  cachedSkills = skills;
  cachedSkillsDir = resolvedDir;
  return skills;
}

export async function discoverSkills(skillsDir) {
  const resolvedDir = path.resolve(getSkillsDir(skillsDir));
  let entries = [];
  try {
    entries = await fsp.readdir(resolvedDir, { withFileTypes: true });
  } catch {
    cachedSkills = [];
    cachedSkillsDir = resolvedDir;
    return [];
  }

  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(resolvedDir, entry.name, 'SKILL.md');
    try {
      const raw = await fsp.readFile(skillPath, 'utf8');
      const parsed = parseSkillMd(raw);
      skills.push({
        ...parsed,
        path: skillPath,
        dir: path.join(resolvedDir, entry.name),
      });
    } catch {
      // Ignored if skill has no SKILL.md
    }
  }

  cachedSkills = skills;
  cachedSkillsDir = resolvedDir;
  return skills;
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'to', 'for', 'in', 'on', 'at', 'by', 'from',
  'with', 'is', 'are', 'was', 'were', 'it', 'this', 'that', 'my', 'me', 'you',
  'your', 'please', 'can', 'could', 'would', 'should', 'run', 'execute', 'do',
  'how', 'what', 'jarvis', 'hey', 'start'
]);

export function findMatchingSkillsSync(query = '', options = {}) {
  const skillsDir = getSkillsDir(options.skillsDir);
  const skills = discoverSkillsSync(skillsDir);
  if (!skills.length) return [];

  const rawQuery = String(query).toLowerCase().trim();
  const queryTokens = rawQuery
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));

  const results = [];
  for (const skill of skills) {
    let score = 0;
    const skillSlug = skill.slug.toLowerCase();
    const skillName = skill.name.toLowerCase();
    const skillDesc = (skill.description || '').toLowerCase();
    const skillTags = (skill.tags || []).map((t) => String(t).toLowerCase());

    // 1. Exact or partial slug/name match
    if (rawQuery.includes(skillSlug) || rawQuery.includes(skillName)) {
      score += 1.0;
    }

    // 2. Token matches against slug and tags
    for (const token of queryTokens) {
      if (skillSlug.includes(token)) score += 0.5;
      if (skillName.includes(token)) score += 0.4;
      if (skillTags.some((tag) => tag.includes(token))) score += 0.4;
      if (skillDesc.includes(token)) score += 0.2;
    }

    if (score >= 0.3) {
      results.push({ ...skill, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

export async function findMatchingSkills(query = '', options = {}) {
  return findMatchingSkillsSync(query, options);
}

export function formatSkillPrompt(skill) {
  if (!skill) return '';
  const stepsFormatted = (skill.steps || []).map((step, idx) => `  ${idx + 1}. ${step}`).join('\n');
  return `### Autonomous Skill: ${skill.name} (${skill.slug})
Description: ${skill.description}
Trajectory Steps:
${stepsFormatted || '  (No specific steps provided)'}
Expected Outcome: ${skill.outcome || 'Success verified.'}`;
}

export function formatAllMatchingSkillsPrompt(skills = []) {
  if (!Array.isArray(skills) || !skills.length) return '';
  const blocks = skills.map((s) => formatSkillPrompt(s)).join('\n\n');
  return `RELEVANT AUTONOMOUS SKILLS (Retrieved from ~/.jarvis-cli-profile/home/.gemini/skills/):
When fulfilling this request, you may adapt and follow the trajectory steps below:

${blocks}`;
}

export function clearSkillsCache() {
  cachedSkills = null;
  cachedSkillsDir = null;
}

export default {
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
  DEFAULT_SKILLS_DIR,
};
