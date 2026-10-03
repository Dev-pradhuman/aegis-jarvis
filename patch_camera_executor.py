#!/usr/bin/env python3

with open('server/toolExecutor.js', 'r') as f:
    content = f.read()

imports = """
import { describeScreen, locateElement, readRegion } from './screenUnderstanding.js';
import { describeCamera } from './cameraUnderstanding.js';
"""
content = content.replace("import { describeScreen, locateElement, readRegion } from './screenUnderstanding.js';", imports)

tools = """
  'screen.capture', 'screen.describe', 'screen.locate', 'screen.read_region',
  'camera.list', 'camera.capture', 'camera.describe',
"""
content = content.replace("  'screen.capture', 'screen.describe', 'screen.locate', 'screen.read_region',", tools)

handlers = """
  if (toolId === 'screen.describe') return { ok: true, toolId, data: await describeScreen(input) };
  if (toolId === 'screen.locate') return { ok: true, toolId, data: await locateElement(input) };
  if (toolId === 'screen.read_region') return { ok: true, toolId, data: await readRegion(input) };
  
  if (toolId === 'camera.list') return { ok: true, toolId, data: { cameras: await osPlatform.camera.list() } };
  if (toolId === 'camera.capture') return { ok: true, toolId, data: await osPlatform.camera.capture(input.devicePath) };
  if (toolId === 'camera.describe') return { ok: true, toolId, data: await describeCamera(input) };
"""

content = content.replace("""
  if (toolId === 'screen.describe') return { ok: true, toolId, data: await describeScreen(input) };
  if (toolId === 'screen.locate') return { ok: true, toolId, data: await locateElement(input) };
  if (toolId === 'screen.read_region') return { ok: true, toolId, data: await readRegion(input) };
""", handlers)

with open('server/toolExecutor.js', 'w') as f:
    f.write(content)

