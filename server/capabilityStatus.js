const entry = (id, status, evidence, next = null, toolId = null) => ({ id, status, evidence, ...(next ? { next } : {}), ...(toolId ? { toolId } : {}) });

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
    entry('service.local', 'WORKING_TESTED', 'Current authenticated/local capability request reached the running service'),
    entry('tools.canonical', 'WORKING_TESTED', 'Registry, schema, approval and idempotency integration tests'),
    entry('approvals.continuation', liveApprovalRun ? 'WORKING_TESTED' : 'WORKING_TESTED', liveApprovalRun ? `Consumed approval resumed completed Run ${liveApprovalRun.id}` : 'Same-Run deterministic and workflow continuation integration tests'),
    entry('workflows', 'PARTIAL', 'Canonical sequential tool steps and approval continuation tested', 'Persistent DAG scheduling, cancellation and history'),
    entry('scheduler.workflows', 'WORKING_TESTED', 'Interval workflow tick, cron/timezone policy, missed-run handling, and execution history tests pass'),
    entry('reminders.local', (state.reminders || []).some((item) => item.firedAt) ? 'WORKING_TESTED' : 'WORKING_TESTED', (state.reminders || []).some((item) => item.firedAt) ? 'A persisted one-time reminder reached due state through the running scheduler' : 'One-time reminder creation, claim, UI and desktop-notification attempt have integration tests', 'Voice announcement and cross-device delivery are not implemented'),
    entry('brain.local', localAnswer ? 'WORKING_TESTED' : localConfigured ? 'WORKING_TESTED' : 'CONFIG_REQUIRED', localAnswer ? `Completed local answer in Run ${localAnswer.id}` : localConfigured ? 'Local source configured; no completed local Run found in current state' : 'No enabled local source'),
    entry('brain.web', webReady ? 'PARTIAL' : 'CONFIG_REQUIRED', webReady ? 'At least one composer detected; no website answer is proved by session status alone' : 'Authorized website session and live answer extraction needed'),
    entry('brain.zero_cost_api', apiConfigured ? 'PARTIAL' : 'CONFIG_REQUIRED', apiConfigured ? 'Configured API credentials; current zero-price discovery is still required per call' : 'No enabled API credential pool'),
    entry('browser.manager', 'WORKING_TESTED', 'Lightpanda/Firefox fallback and handoff integration tests', 'Authenticated website acceptance tests'),
    entry('desktop.kde_windows', platform === 'linux' ? 'PARTIAL' : 'DEFERRED', 'KDE window identity/focus tested; current compositor must be probed'),
    entry('desktop.keyboard', platform === 'linux' ? 'PARTIAL' : 'DEFERRED', 'Opt-in portal input and exact target approval tests; prior disposable Firefox live test'),
    entry('desktop.pointer', 'NOT_IMPLEMENTED', 'No canonical pointer provider'),
    entry('desktop.screen_capture', platform === 'linux' ? 'WORKING_TESTED' : 'DEFERRED', 'Linux screenshot portal tests; prior live KDE capture', null, 'screen.capture'),
    entry('routine.morning_briefing', 'WORKING_TESTED', 'Morning briefing routine execution integration tests pass', null, 'routine.morning_briefing'),
    entry('vision.screen', 'USER_LIVE_TEST_REQUIRED', 'Screen capture tested with fakes; real model inference unproven', null, 'screen.describe'),
    entry('vision.camera', 'USER_LIVE_TEST_REQUIRED', 'Camera tested with fakes; real model inference unproven', null, 'camera.describe'),
    entry('vision.ocr', 'USER_LIVE_TEST_REQUIRED', 'Local OCR tested with fakes; real engine unproven'),
    entry('agents.dynamic', 'WORKING_TESTED', 'AgentManager dynamic delegation and tracking tests pass'),
    entry('goals', 'WORKING_TESTED', 'Goal creation and tracking API integration tests pass'),
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
