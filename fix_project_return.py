#!/usr/bin/env python3

with open('server/projectIntelligence.js', 'r') as f:
    content = f.read()

bad = "return { name, root, status: branch === null ? 'directory' : 'available', branch, head, changedFiles: changes === null ? null : lines.length, changes: lines.slice(0, 30), truncated: lines.length > 30, package: packageInfo, ...(project.configurationError ? { configurationError: project.configurationError } : {}) };"
good = "return { name, root, status: branch === null ? 'directory' : 'available', branch, head, changedFiles: changes === null ? null : lines.length, changes: lines.slice(0, 30), truncated: lines.length > 30, package: packageInfo, ports: (ports || '').split('\\n').slice(0, 5), recentTests: (testLogs || '').slice(-500), ...(project.configurationError ? { configurationError: project.configurationError } : {}) };"

content = content.replace(bad, good)

with open('server/projectIntelligence.js', 'w') as f:
    f.write(content)
