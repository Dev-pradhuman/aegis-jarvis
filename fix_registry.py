#!/usr/bin/env python3

with open('server/registry.js', 'r') as f:
    content = f.read()

bad_dup = """  { id: 'camera.describe', name: 'Describe camera view', description: 'Capture a photo from a webcam and use a vision model to describe the physical view.', module: 'computer', riskLevel: 'READ_ONLY', sideEffects: false, reversible: true, timeout: 60000, enabled: true, inputSchema: objectSchema({ devicePath: { type: 'string' }, prompt: { type: 'string' } }) },
  { id: 'screen.locate', name: 'Locate element on screen', description: 'Find the bounding box of a UI element matching a description.', module: 'computer', riskLevel: 'READ_ONLY', sideEffects: false, reversible: true, timeout: 60000, enabled: true, inputSchema: objectSchema({ description: { type: 'string' } }, ['description']) },
  { id: 'screen.read_region', name: 'Read text in screen region', description: 'Read text within a normalized bounding box (x, y, width, height from 0.0 to 1.0).', module: 'computer', riskLevel: 'READ_ONLY', sideEffects: false, reversible: true, timeout: 60000, enabled: true, inputSchema: objectSchema({ x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' } }, ['x', 'y', 'width', 'height']) },
"""

good = """  { id: 'camera.describe', name: 'Describe camera view', description: 'Capture a photo from a webcam and use a vision model to describe the physical view.', module: 'computer', riskLevel: 'READ_ONLY', sideEffects: false, reversible: true, timeout: 60000, enabled: true, inputSchema: objectSchema({ devicePath: { type: 'string' }, prompt: { type: 'string' } }) },
"""

content = content.replace(bad_dup, good)

with open('server/registry.js', 'w') as f:
    f.write(content)
