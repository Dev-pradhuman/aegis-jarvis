#!/usr/bin/env python3

with open('server/projectIntelligence.js', 'r') as f:
    content = f.read()

bad = """      run('npm', ['test'], { cwd: root, timeout: 5000 }).then(r => r.stdout).catch(e => e.stdout || e.message)
    ]);
      readFile(path.join(root, 'package.json'), 'utf8').catch(() => null),
    ]);"""

good = """      run('npm', ['test'], { cwd: root, timeout: 5000 }).then(r => r.stdout).catch(e => e.stdout || e.message)
    ]);"""

content = content.replace(bad, good)

with open('server/projectIntelligence.js', 'w') as f:
    f.write(content)
