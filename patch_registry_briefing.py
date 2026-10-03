#!/usr/bin/env python3

with open('server/registry.js', 'r') as f:
    content = f.read()

briefing_tool = """
  { id: 'camera.describe', name: 'Describe camera view', description: 'Capture a photo from a webcam and use a vision model to describe the physical view.', module: 'computer', riskLevel: 'READ_ONLY', sideEffects: false, reversible: true, timeout: 60000, enabled: true, inputSchema: objectSchema({ devicePath: { type: 'string' }, prompt: { type: 'string' } }) },
  { id: 'routine.morning_briefing', name: 'Generate morning briefing', description: 'Synthesizes tasks, calendar, and projects into a concise morning briefing.', module: 'system', riskLevel: 'READ_ONLY', sideEffects: false, reversible: true, timeout: 60000, enabled: true, inputSchema: objectSchema() },
"""
content = content.replace("  { id: 'camera.describe', name: 'Describe camera view', description: 'Capture a photo from a webcam and use a vision model to describe the physical view.', module: 'computer', riskLevel: 'READ_ONLY', sideEffects: false, reversible: true, timeout: 60000, enabled: true, inputSchema: objectSchema({ devicePath: { type: 'string' }, prompt: { type: 'string' } }) },", briefing_tool)

with open('server/registry.js', 'w') as f:
    f.write(content)
