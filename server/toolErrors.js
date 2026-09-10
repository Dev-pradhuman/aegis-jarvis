export const TOOL_ERROR_CODES = new Set([
  'APP_NOT_FOUND', 'APP_AMBIGUOUS', 'APP_LAUNCH_FAILED', 'WINDOW_NOT_FOUND', 'WINDOW_AMBIGUOUS', 'UI_TARGET_NOT_FOUND', 'UI_TARGET_AMBIGUOUS', 'LOW_CONFIDENCE_TARGET', 'CONNECTION_UNAVAILABLE',
  'CONTACT_NOT_FOUND', 'CONTACT_AMBIGUOUS', 'PLATFORM_REQUIRED', 'CONTACT_DESTINATION_MISSING',
  'WHATSAPP_AUTH_REQUIRED', 'WHATSAPP_SEARCH_FAILED', 'WHATSAPP_RECIPIENT_NOT_FOUND', 'WHATSAPP_RECIPIENT_AMBIGUOUS', 'WHATSAPP_COMPOSER_NOT_FOUND', 'WHATSAPP_SEND_FAILED', 'WHATSAPP_SEND_UNVERIFIED',
  'INSTAGRAM_AUTH_REQUIRED', 'INSTAGRAM_SEARCH_FAILED', 'INSTAGRAM_RECIPIENT_NOT_FOUND', 'INSTAGRAM_RECIPIENT_AMBIGUOUS', 'INSTAGRAM_SEND_FAILED', 'INSTAGRAM_SEND_UNVERIFIED', 'INSTAGRAM_UNREAD_UNAVAILABLE',
  'YOUTUBE_NAVIGATION_FAILED', 'YOUTUBE_SEARCH_FAILED', 'YOUTUBE_RESULT_NOT_FOUND', 'YOUTUBE_PLAYBACK_BLOCKED', 'YOUTUBE_PLAYBACK_UNVERIFIED',
  'WINDOW_NOT_FOCUSED', 'INPUT_REJECTED', 'INPUT_BUSY', 'KEYBOARD_BUSY', 'KEYBOARD_STATE_CHANGED',
  'NO_MEDIA_SESSION',
  'TOOL_NOT_FOUND', 'TOOL_DISABLED', 'INVALID_ARGUMENTS', 'CONFIGURATION_MISSING',
  'AUTHENTICATION_REQUIRED', 'PERMISSION_DENIED', 'APPROVAL_REQUIRED',
  'APPROVAL_EXPIRED', 'APPROVAL_MISMATCH', 'APPROVAL_REPLAY', 'EXECUTION_FAILED', 'EXECUTION_CANCELLED',
  'TIMEOUT', 'RATE_LIMITED', 'VERIFICATION_FAILED', 'PROVIDER_ERROR',
  'CAPABILITY_UNAVAILABLE', 'IDEMPOTENCY_CONFLICT', 'TOOL_LOOP_LIMIT', 'INVALID_CONTINUATION', 'MODEL_SYNTHESIS_FAILED',
  'CHATGPT_WEB_UNAVAILABLE', 'CHATGPT_LOGIN_REQUIRED', 'CHATGPT_RATE_LIMITED', 'CHATGPT_UI_CHANGED', 'CHATGPT_TIMEOUT', 'CHATGPT_RESPONSE_INVALID', 'CHATGPT_SESSION_BUSY', 'CHATGPT_PROJECT_NOT_FOUND',
  'GEMINI_WEB_UNAVAILABLE', 'GEMINI_LOGIN_REQUIRED', 'GEMINI_RATE_LIMITED', 'GEMINI_UI_CHANGED', 'GEMINI_TIMEOUT', 'GEMINI_SESSION_BUSY',
]);

export class ToolRuntimeError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'ToolRuntimeError';
    this.code = TOOL_ERROR_CODES.has(code) ? code : 'EXECUTION_FAILED';
    this.retryable = Boolean(options.retryable);
    this.details = options.details || null;
  }
}

export function normalizeToolError(error, fallback = 'EXECUTION_FAILED') {
  if (error instanceof ToolRuntimeError) return error;
  const sourceCode = String(error?.code || '').toUpperCase();
  const mapping = {
    REQUEST_ERROR: 'INVALID_ARGUMENTS', CONFIG_REQUIRED: 'CONFIGURATION_MISSING',
    MODEL_CAPACITY_EXHAUSTED: 'PROVIDER_ERROR', TEMPORARILY_UNAVAILABLE: 'PROVIDER_ERROR',
    NETWORK_ERROR: 'PROVIDER_ERROR', INVALID_RESPONSE: 'PROVIDER_ERROR',
  };
  let code = TOOL_ERROR_CODES.has(sourceCode) ? sourceCode : mapping[sourceCode] || fallback;
  if (error?.name === 'AbortError' || /timed?\s*out|timeout/i.test(String(error?.message || ''))) code = 'TIMEOUT';
  if (/rate.?limit|http 429/i.test(String(error?.message || ''))) code = 'RATE_LIMITED';
  return new ToolRuntimeError(code, String(error?.message || error || 'Tool execution failed'), { cause: error, retryable: ['TIMEOUT', 'RATE_LIMITED', 'PROVIDER_ERROR'].includes(code), details: error?.details || null });
}

export function publicToolError(error) {
  const normalized = normalizeToolError(error);
  return { code: normalized.code, message: normalized.message, retryable: normalized.retryable, details: normalized.details };
}
