#!/usr/bin/env python3

with open('server/platform/linux/index.js', 'r') as f:
    content = f.read()

content = content.replace("    input: createLinuxInput(options.inputOptions),", "    input: createLinuxInput(options.inputOptions),\n    camera: { list: listCameras, capture: captureCamera },")

with open('server/platform/linux/index.js', 'w') as f:
    f.write(content)
