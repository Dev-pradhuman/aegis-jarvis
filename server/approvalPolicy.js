import crypto from 'node:crypto';
import { getTool } from './registry.js';

export const DEFAULT_APPROVAL_POLICY = { mode: 'SAFE', fullActivatedAt: null, rules: [] };
const effects = new Set(['always_allow', 'always_ask', 'deny', 'allow_once', 'allow_run']);

export function publicApprovalPolicy(state = {}) {
  const value = state.approvalPolicy || DEFAULT_APPROVAL_POLICY;
  return { mode: ['SAFE', 'CUSTOM', 'FULL'].includes(value.mode) ? value.mode : 'SAFE', fullActivatedAt: value.fullActivatedAt || null, rules: Array.isArray(value.rules) ? value.rules : [], warning: 'Full mode auto-approves JARVIS dialogs only. OS consent, account login, verification, target checks and idempotency still apply.' };
}

export function validateApprovalRules(rules) {
  if (!Array.isArray(rules) || rules.length > 100) throw Object.assign(new Error('Rules must be an array of at most 100 entries'), { code: 'APPROVAL_POLICY_INVALID' });
  return rules.map((rule) => {
    if (!rule || !getTool(rule.toolId) || !effects.has(rule.effect)) throw Object.assign(new Error('Each rule needs a registered tool and supported effect'), { code: 'APPROVAL_POLICY_INVALID' });
    if (rule.effect === 'allow_run' && !rule.runId) throw Object.assign(new Error('Run-scoped rules require a Run ID'), { code: 'APPROVAL_POLICY_INVALID' });
    return { id: rule.id || crypto.randomUUID(), toolId: rule.toolId, effect: rule.effect,
      ...(rule.appId ? { appId: String(rule.appId).slice(0, 120) } : {}),
      ...(rule.deviceId ? { deviceId: String(rule.deviceId).slice(0, 120) } : {}),
      ...(rule.destination ? { destination: String(rule.destination).slice(0, 200) } : {}),
      ...(rule.runId ? { runId: String(rule.runId).slice(0, 120) } : {}),
      ...(rule.riskLevel ? { riskLevel: String(rule.riskLevel).slice(0, 80) } : {}),
    };
  });
}

function matches(rule, tool, args, request) {
  return rule.toolId === tool.id && (!rule.riskLevel || rule.riskLevel === tool.riskLevel) &&
    (!rule.appId || rule.appId === args.target?.appId) &&
    (!rule.deviceId || rule.deviceId === (args.target?.deviceId || args.deviceId)) &&
    (!rule.destination || rule.destination === (args.recipient || args.destination)) &&
    (!rule.runId || rule.runId === request.runId);
}

export function approvalDecision(state, tool, args, request = {}, env = process.env) {
  const policy = publicApprovalPolicy(state);
  if (policy.mode === 'FULL' && policy.fullActivatedAt && env.JARVIS_AUTH_TOKEN) return { action: 'AUTO', reason: 'FULL', ruleId: null };
  if (policy.mode === 'CUSTOM') {
    const rule = policy.rules.find((item) => matches(item, tool, args, request));
    if (rule) return { action: rule.effect === 'deny' ? 'DENY' : rule.effect === 'always_ask' ? 'ASK' : 'AUTO', reason: rule.effect, ruleId: rule.id };
  }
  return { action: tool.requiresApproval ? 'ASK' : 'ALLOW', reason: 'SAFE', ruleId: null };
}
