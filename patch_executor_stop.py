#!/usr/bin/env python3

with open('server/toolExecutor.js', 'r') as f:
    content = f.read()

exports = """
export function emergencyStop() {
  if (osPlatform?.input?.close) osPlatform.input.close();
}

export const ALL_TOOLS = [
"""

content = content.replace("export const ALL_TOOLS = [", exports)

with open('server/toolExecutor.js', 'w') as f:
    f.write(content)
