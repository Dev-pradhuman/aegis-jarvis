const objectSchema = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

const tools = [
  { id: 'project.inspect', name: 'Project inspection', description: 'Inspect the current repository structure and project metadata.', module: 'development', riskLevel: 'READ_ONLY', sideEffects: false, reversible: true, timeout: 10000, enabled: true, inputSchema: objectSchema() },
  { id: 'files.read', name: 'Read project files', description: 'Read a UTF-8 file located inside the JARVIS project workspace.', module: 'files', riskLevel: 'READ_ONLY', sideEffects: false, reversible: true, timeout: 10000, enabled: true, inputSchema: objectSchema({ path: { type: 'string', description: 'Workspace-relative file path.' } }, ['path']) },
  { id: 'tasks.list', name: 'List tasks', description: 'List the user\'s real persisted JARVIS tasks and their current state.', module: 'productivity', riskLevel: 'READ_ONLY', sideEffects: false, reversible: true, timeout: 10000, enabled: true, inputSchema: objectSchema() },
  { id: 'tasks.manage', name: 'Manage tasks', description: 'Create or update a persisted JARVIS task.', module: 'productivity', riskLevel: 'LOW_RISK_WRITE', sideEffects: true, reversible: true, timeout: 10000, enabled: true, inputSchema: objectSchema({ title: { type: 'string' }, status: { type: 'string' } }) },
  { id: 'memory.search', name: 'Search memory', description: 'Retrieve relevant approved project and durable memory records.', module: 'memory', riskLevel: 'READ_ONLY', sideEffects: false, reversible: true, timeout: 10000, enabled: true, inputSchema: objectSchema({ query: { type: 'string' } }, ['query']) },
  { id: 'runtime.telemetry', name: 'Runtime telemetry', description: 'Read the active provider, selected model, usage, uptime, and latency.', module: 'system', riskLevel: 'READ_ONLY', sideEffects: false, reversible: true, timeout: 5000, enabled: true, inputSchema: objectSchema() },
  { id: 'diagnostics', name: 'System diagnostics', description: 'Check JARVIS service health and integration readiness.', module: 'system', riskLevel: 'READ_ONLY', sideEffects: false, reversible: true, timeout: 5000, enabled: true, inputSchema: objectSchema() },
  { id: 'browser.open', name: 'Open web page', description: 'Open a safe HTTP or HTTPS URL in the user interface.', module: 'computer', riskLevel: 'LOW_RISK_WRITE', sideEffects: true, reversible: true, timeout: 5000, enabled: true, inputSchema: objectSchema({ url: { type: 'string' } }, ['url']) },
  { id: 'gmail.latest', name: 'Read latest Gmail messages', description: 'Fetch recent inbox email through the connected Gmail account.', module: 'communication', riskLevel: 'READ_ONLY', sideEffects: false, reversible: true, timeout: 30000, enabled: false, requires: 'COMPOSIO_API_KEY', inputSchema: objectSchema({ limit: { type: 'integer', minimum: 1, maximum: 20 } }) },
  { id: 'media.generate', name: 'Generate image or video', description: 'Generate an image or video with the configured Gemini media model.', module: 'media', riskLevel: 'EXTERNAL_ACTION', sideEffects: true, reversible: true, timeout: 120000, enabled: false, requires: 'GEMINI_API_KEY', inputSchema: objectSchema({ kind: { type: 'string', enum: ['image', 'video'] }, prompt: { type: 'string' } }, ['kind', 'prompt']) },
  { id: 'command.execute', name: 'Execute a command', description: 'Execute one approved, workspace-contained command without shell operators.', module: 'computer', riskLevel: 'PROJECT_EXECUTION', sideEffects: true, reversible: false, timeout: 30000, enabled: true, requiresApproval: true, inputSchema: objectSchema({ command: { type: 'string' } }, ['command']) },
  { id: 'research.search', name: 'Research web sources', description: 'Search configured web sources and return attributed results.', module: 'research', riskLevel: 'EXTERNAL_ACTION', sideEffects: true, reversible: true, timeout: 15000, enabled: false, requires: 'SEARCH_PROVIDER_URL', inputSchema: objectSchema({ query: { type: 'string' } }, ['query']) },
  { id: 'messages.send', name: 'Send messages', description: 'Send a message through a configured provider after approval.', module: 'communication', riskLevel: 'EXTERNAL_ACTION', sideEffects: true, reversible: false, timeout: 15000, enabled: false, requires: 'MESSAGING_TOKEN', requiresApproval: true, inputSchema: objectSchema({ recipient: { type: 'string' }, message: { type: 'string' } }, ['recipient', 'message']) },
  { id: 'composio.execute', name: 'Execute Composio action', description: 'Execute an action in a connected Composio app; consequential actions require exact approval.', module: 'integrations', riskLevel: 'EXTERNAL_ACTION', sideEffects: true, reversible: false, timeout: 30000, enabled: false, requires: 'COMPOSIO_API_KEY', requiresApproval: true, inputSchema: objectSchema({ toolSlug: { type: 'string' }, arguments: { type: 'object' } }, ['toolSlug']) },
];

export function listTools() {
  return tools.map((tool) => ({
    ...tool,
    ...(tool.requires ? { enabled: Boolean(process.env[tool.requires]) } : {}),
  }));
}
export function listCapabilities() {
  const current = listTools();
  return [...new Set(current.map((tool) => tool.module))].map((module) => ({ module, tools: current.filter((tool) => tool.module === module).map((tool) => tool.id) }));
}
