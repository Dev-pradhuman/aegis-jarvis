#!/usr/bin/env python3

with open('server/toolExecutor.js', 'r') as f:
    content = f.read()

imports = """
import { describeCamera } from './cameraUnderstanding.js';
import { generateMorningBriefing } from './morningBriefing.js';
"""
content = content.replace("import { describeCamera } from './cameraUnderstanding.js';", imports)

tools = """
  'camera.list', 'camera.capture', 'camera.describe',
  'routine.morning_briefing',
"""
content = content.replace("  'camera.list', 'camera.capture', 'camera.describe',", tools)

handlers = """
  if (toolId === 'camera.describe') return { ok: true, toolId, data: await describeCamera(input) };
  if (toolId === 'routine.morning_briefing') return { ok: true, toolId, data: { briefing: await generateMorningBriefing(context.state || {}) } };
"""
content = content.replace("  if (toolId === 'camera.describe') return { ok: true, toolId, data: await describeCamera(input) };", handlers)

with open('server/toolExecutor.js', 'w') as f:
    f.write(content)
