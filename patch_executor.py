#!/usr/bin/env python3

with open('server/toolExecutor.js', 'r') as f:
    content = f.read()

content = content.replace("'computer.keypress', 'computer.type', 'screen.capture',",
"'computer.keypress', 'computer.type', 'pointer.move', 'pointer.click', 'pointer.scroll',\n  'screen.capture',")

content = content.replace("'computer.keypress', 'computer.type', 'screen.capture', 'screen.describe'",
"'computer.keypress', 'computer.type', 'pointer.move', 'pointer.click', 'pointer.scroll',\n  'screen.capture', 'screen.describe'")

content = content.replace("""
  'clipboard.read', 'clipboard.write', 'computer.capabilities', 'computer.keypress', 'computer.type', 'pointer.move', 'pointer.click', 'pointer.scroll',
  'screen.capture',
  'screen.describe', 'screen.locate', 'screen.read_region',
""", """
  'clipboard.read', 'clipboard.write', 'computer.capabilities', 'computer.keypress', 'computer.type', 'pointer.move', 'pointer.click', 'pointer.scroll',
  'screen.capture', 'screen.describe', 'screen.locate', 'screen.read_region',
""")

handler = """
  if (toolId === 'pointer.move') return { ok: true, toolId, data: await osPlatform.input.pointerMove(input.x, input.y) };
  if (toolId === 'pointer.click') return { ok: true, toolId, data: await osPlatform.input.pointerClick(input.button) };
  if (toolId === 'pointer.scroll') return { ok: true, toolId, data: await osPlatform.input.pointerScroll(input.dx, input.dy) };
  if (toolId === 'screen.describe')
"""

content = content.replace("  if (toolId === 'screen.describe')", handler)

with open('server/toolExecutor.js', 'w') as f:
    f.write(content)

