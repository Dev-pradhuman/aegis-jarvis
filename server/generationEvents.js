const events = [];
const controllers = new Map();
let sequence = 0;

export function publishGenerationEvent(event = {}) {
  const item = { sequence: ++sequence, at: new Date().toISOString(), ...event };
  events.push(item);
  if (events.length > 1500) events.splice(0, events.length - 1500);
  return item;
}

export function generationEvents({ after = 0, sessionId = null } = {}) {
  return events.filter((event) => event.sequence > Number(after || 0) && (!sessionId || event.sessionId === sessionId)).slice(0, 250);
}

export function beginGeneration(sessionId, metadata = {}) {
  const prior = controllers.get(sessionId);
  if (prior) prior.abort('superseded');
  const controller = new AbortController();
  controllers.set(sessionId, controller);
  publishGenerationEvent({ type: 'generation.start', sessionId, ...metadata });
  return controller;
}

export function finishGeneration(sessionId, metadata = {}) {
  controllers.delete(sessionId);
  return publishGenerationEvent({ type: 'generation.complete', sessionId, ...metadata });
}

export function releaseGeneration(sessionId) { controllers.delete(sessionId); }

export function failGeneration(sessionId, error, metadata = {}) {
  controllers.delete(sessionId);
  return publishGenerationEvent({ type: 'generation.error', sessionId, error: { code: error?.code || 'EXECUTION_FAILED', message: error?.message || 'Generation failed.' }, ...metadata });
}

export function cancelGeneration(sessionId) {
  const controller = controllers.get(sessionId);
  if (!controller) return false;
  controller.abort('user_cancelled');
  publishGenerationEvent({ type: 'generation.cancelled', sessionId });
  return true;
}
