#!/usr/bin/env python3

with open('server/registry.js', 'r') as f:
    content = f.read()

content = content.replace(" || tool.id.startsWith('screen.')", " || tool.id.startsWith('screen.') || tool.id.startsWith('camera.')")

with open('server/registry.js', 'w') as f:
    f.write(content)
