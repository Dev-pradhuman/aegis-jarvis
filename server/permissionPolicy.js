export const PERMISSION_MODES = Object.freeze({
  NORMAL: 'normal',
  SKIP_PERMISSIONS: 'skip_permissions',
  FULL_PERMISSIONS: 'full_permissions',
});

const routineIntentionalTools = new Set([
  'communication.send',
  'messages.send',
  'gmail.draft',
  'gmail.send',
  'gmail.reply',
  'instagram.send',
  'instagram.reply',
  'slack.send',
  'slack.reply',
  'slack.react',
  'discord.send',
  'discord.reply',
  'discord.react',
  'calendar.create',
  'tasks.create',
  'tasks.update',
  'system.app.open',
  'browser.external.open',
  'browser.open',
  'youtube.play',
  'media.play',
  'media.pause',
  'media.toggle',
  'media.next',
  'media.previous',
]);

const alwaysGuardedRisks = new Set(['DESTRUCTIVE', 'CRITICAL', 'SECURITY', 'PRIVILEGED']);

export function normalizePermissionMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return Object.values(PERMISSION_MODES).includes(mode) ? mode : PERMISSION_MODES.NORMAL;
}

export function permissionDecision(definition, args = {}, context = {}) {
  const mode = normalizePermissionMode(context.permissionMode);
  const risk = String(context.risk || definition.riskLevel || 'READ_ONLY').toUpperCase();
  const normallyRequiresApproval = context.requiresApproval === true;
  let requiresApproval = normallyRequiresApproval;
  let reason = normallyRequiresApproval ? 'tool_policy' : 'not_required';

  if (mode === PERMISSION_MODES.SKIP_PERMISSIONS && routineIntentionalTools.has(definition.id) && !alwaysGuardedRisks.has(risk)) {
    requiresApproval = false;
    reason = 'routine_intentional_action';
  } else if (mode === PERMISSION_MODES.FULL_PERMISSIONS && !alwaysGuardedRisks.has(risk)) {
    requiresApproval = false;
    reason = 'full_permissions_policy';
  }

  return { mode, risk, requiresApproval, reason, validationRequired: true, authenticationRequired: true, verificationRequired: true };
}
