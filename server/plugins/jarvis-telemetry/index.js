const events = [];
const toolCounts = {};
let totalToolExecutions = 0;

const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\s+[/~]/i,
  /:[(][{][\s]*:[|]:[&][\s]*[}][;]:/,
  /\bmkfs\b/i,
  /\bdd\s+if=.*of=\/dev\/(?:sd[a-z]|nvme[0-9]n[0-9])/i,
];

export function getTelemetryEvents() {
  return [...events];
}

export function clearTelemetry() {
  events.length = 0;
  for (const key of Object.keys(toolCounts)) {
    delete toolCounts[key];
  }
  totalToolExecutions = 0;
}

export function getMetrics() {
  return {
    totalEvents: events.length,
    toolExecutions: totalToolExecutions,
    toolCounts: { ...toolCounts },
  };
}

export async function preToolCall(ctx = {}) {
  // 1. Safety Guardrail
  if (ctx.toolId === 'command.execute') {
    const command = String(ctx.input?.command || '').trim();
    for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
      if (pattern.test(command)) {
        throw new Error(`[SafetyGuardrail] Blocked dangerous command execution matching pattern: ${command}`);
      }
    }
  }

  // 2. Telemetry Logging
  events.push({
    type: 'preToolCall',
    toolId: ctx.toolId,
    timestamp: ctx.timestamp || Date.now(),
  });
}

export async function postToolCall(ctx = {}) {
  const toolId = ctx.toolId || 'unknown';
  toolCounts[toolId] = (toolCounts[toolId] || 0) + 1;
  totalToolExecutions += 1;

  events.push({
    type: 'postToolCall',
    toolId,
    durationMs: ctx.durationMs || 0,
    ok: ctx.result?.ok ?? (ctx.error ? false : true),
    timestamp: ctx.timestamp || Date.now(),
  });
}

export async function agentStart(ctx = {}) {
  events.push({
    type: 'agentStart',
    mode: ctx.mode || 'unknown',
    text: ctx.text ? String(ctx.text).slice(0, 100) : '',
    timestamp: ctx.timestamp || Date.now(),
  });
}

export async function agentStop(ctx = {}) {
  events.push({
    type: 'agentStop',
    mode: ctx.mode || 'unknown',
    status: ctx.status || 'completed',
    timestamp: ctx.timestamp || Date.now(),
  });
}

export async function registerTools() {
  return [
    {
      id: 'telemetry.get_metrics',
      name: 'telemetry.get_metrics',
      description: 'Retrieve execution metrics and telemetry event logs',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
      outputSchema: {
        type: 'object',
        required: ['ok', 'toolId', 'data'],
        properties: {
          ok: { type: 'boolean' },
          toolId: { type: 'string' },
          data: {
            type: 'object',
            required: ['totalEvents', 'toolCounts'],
            properties: {
              totalEvents: { type: 'integer' },
              toolExecutions: { type: 'integer' },
              toolCounts: { type: 'object' },
              recentEvents: { type: 'array' },
            },
          },
        },
      },
      handler: (input = {}) => {
        const limit = Number(input.limit || 20);
        return {
          ok: true,
          toolId: 'telemetry.get_metrics',
          data: {
            totalEvents: events.length,
            toolExecutions: totalToolExecutions,
            toolCounts: { ...toolCounts },
            recentEvents: events.slice(-limit),
          },
        };
      },
    },
  ];
}

export default {
  preToolCall,
  postToolCall,
  agentStart,
  agentStop,
  registerTools,
  getTelemetryEvents,
  clearTelemetry,
  getMetrics,
};
