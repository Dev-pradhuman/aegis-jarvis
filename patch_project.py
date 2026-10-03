#!/usr/bin/env python3

with open('server/projectIntelligence.js', 'r') as f:
    content = f.read()

inspection = """
export async function inspectProject(project) {
  const { name, root } = project;
  try {
    if (!(await stat(root)).isDirectory()) throw new Error('Not a directory');
    const [branch, head, changes, packageText, ports, testLogs] = await Promise.all([
      git(root, ['branch', '--show-current']), git(root, ['rev-parse', '--short', 'HEAD']), git(root, ['status', '--porcelain=v1', '--untracked-files=normal']),
      readFile(path.join(root, 'package.json'), 'utf8').catch(() => null),
      run('ss', ['-ltnp']).then(r => r.stdout).catch(() => ''),
      run('npm', ['test'], { cwd: root, timeout: 5000 }).then(r => r.stdout).catch(e => e.stdout || e.message)
    ]);
"""
content = content.replace("""
export async function inspectProject(project) {
  const { name, root } = project;
  try {
    if (!(await stat(root)).isDirectory()) throw new Error('Not a directory');
    const [branch, head, changes, packageText] = await Promise.all([
      git(root, ['branch', '--show-current']), git(root, ['rev-parse', '--short', 'HEAD']), git(root, ['status', '--porcelain=v1', '--untracked-files=normal']),
""", inspection)

result = """
    const status = {
      name, root, git: { branch, head, changes: (changes || '').split('\\n').filter(Boolean) },
      ports: (ports || '').split('\\n').slice(0, 5),
      recentTests: (testLogs || '').slice(-500)
    };
"""
content = content.replace("""
    const status = { name, root, git: { branch, head, changes: (changes || '').split('\\n').filter(Boolean) } };
""", result)

with open('server/projectIntelligence.js', 'w') as f:
    f.write(content)
