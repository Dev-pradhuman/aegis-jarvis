const entry = (id, status, evidence, next = null) => ({ id, status, evidence, ...(next ? { next } : {}) });

// Status describes verified acceptance evidence, not whether a class or UI card exists.
// Tests and live observations are deliberately different states.
export function capabilityStatus(state = {}, { brainSources = [], web = {}, platform = process.platform } = {}) {
  const runs = state.runs || [];
  const localAnswer = runs.find((run) => run.status === 'completed' && run.routing?.executionTier === 'LOCAL_MODEL');
  const localConfigured = brainSources.some((source) => source.type === 'LOCAL' && source.enabled);
  const apiConfigured = brainSources.some((source) => source.type === 'API' && source.enabled && source.credentials?.some((key) => key.enabled));
  const webReady = Object.values(web).some((site) => site.status === 'READY');
  const liveApprovalRun = runs.find((run) => run.status === 'completed' && run.approvals?.some((id) =>
    (state.approvals || []).some((approval) => approval.id === id && approval.status === 'consumed' && approval.runId === run.id)));
  return [
    entry('service.local', 'WORKING_LIVE', 'Current authenticated/local capability request reached the running service'),
    entry('tools.canonical', 'WORKING_TESTED', 'Registry, schema, approval and idempotency integration tests'),
    entry('approvals.continuation', liveApprovalRun ? 'WORKING_LIVE' : 'WORKING_TESTED', liveApprovalRun ? `Consumed approval resumed completed Run ${liveApprovalRun.id}` : 'Same-Run deterministic and workflow continuation integration tests'),
    entry('workflows', 'PARTIAL', 'Canonical sequential tool steps and approval continuation tested', 'Persistent DAG scheduling, cancellation and history'),
    entry('scheduler.reminders', 'NOT_IMPLEMENTED', 'Interval workflow scheduler exists; native reminders do not', 'Persistent one-time reminder jobs and delivery'),
    entry('brain.local', localAnswer ? 'WORKING_LIVE' : localConfigured ? 'WORKING_TESTED' : 'CONFIG_REQUIRED', localAnswer ? `Completed local answer in Run ${localAnswer.id}` : localConfigured ? 'Local source configured; no completed local Run found in current state' : 'No enabled local source'),
    entry('brain.web', webReady ? 'PARTIAL' : 'CONFIG_REQUIRED', webReady ? 'At least one composer detected; no website answer is proved by session status alone' : 'Authorized website session and live answer extraction needed'),
    entry('brain.zero_cost_api', apiConfigured ? 'PARTIAL' : 'CONFIG_REQUIRED', apiConfigured ? 'Configured API credentials; current zero-price discovery is still required per call' : 'No enabled API credential pool'),
    entry('browser.manager', 'WORKING_TESTED', 'Lightpanda/Firefox fallback and handoff integration tests', 'Authenticated website acceptance tests'),
    entry('desktop.kde_windows', platform === 'linux' ? 'PARTIAL' : 'DEFERRED', 'KDE window identity/focus tested; current compositor must be probed'),
    entry('desktop.keyboard', platform === 'linux' ? 'PARTIAL' : 'DEFERRED', 'Opt-in portal input and exact target approval tests; prior disposable Firefox live test'),
    entry('desktop.pointer', 'NOT_IMPLEMENTED', 'No canonical pointer provider'),
    entry('desktop.screen_capture', platform === 'linux' ? 'WORKING_TESTED' : 'DEFERRED', 'Linux screenshot portal tests; prior live KDE capture'),
    entry('vision.screen', 'NOT_IMPLEMENTED', 'No image understanding adapter'),
    entry('vision.camera', 'NOT_IMPLEMENTED', 'No camera perception provider'),
    entry('agents.dynamic', 'NOT_IMPLEMENTED', 'Model delegation history exists; no AgentManager'),
    entry('goals', 'NOT_IMPLEMENTED', 'No persisted Goal entity'),
    entry('mcp', 'PARTIAL', 'Inbound HTTP/stdio and outbound HTTP integration tests', 'Outbound stdio and reconnect'),
    entry('research', 'PARTIAL', 'Source planning exists; attributed synthesis is incomplete'),
    entry('projects', 'PARTIAL', 'Repository status collection exists; tests/logs are not aggregated'),
    entry('integrations.slack_remote', 'NOT_IMPLEMENTED', 'Outbound Slack adapter is not an authenticated inbound remote channel'),
    entry('integrations.whatsapp', 'NOT_IMPLEMENTED', 'No connected WhatsApp Web message or call path'),
    entry('desktop.remote_host', 'NOT_IMPLEMENTED', 'Device events do not constitute a paired desktop host'),
    entry('voice.wake_word', 'NOT_IMPLEMENTED', 'Browser push-to-talk exists; no local wake detector'),
    entry('desktop.global_overlay', 'NOT_IMPLEMENTED', 'No KDE global shortcut/overlay'),
    entry('phone.android', 'DEFERRED', 'Android application deferred by current Linux scope'),
    entry('hardware.smart_room', 'DEFERRED', 'Physical hardware integration deferred by current scope'),
    entry('windows.platform', 'DEFERRED', 'Windows validation deferred by current Linux scope'),
  ];
}
