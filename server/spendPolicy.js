// Paid APIs are opt-in. A consumer web subscription does not authorize API billing.
export function paidApiUsageEnabled(env = process.env) {
  return env.ZERO_SPEND_MODE === 'false' && env.ALLOW_PAID_API_USAGE === 'true';
}

export function pricingClass(model = {}) {
  const price = model.pricing;
  if (!price || typeof price !== 'object') return 'UNKNOWN_PRICING_DISABLED';
  const input = price.input ?? price.prompt;
  const output = price.output ?? price.completion;
  if (input === undefined || output === undefined) return 'UNKNOWN_PRICING_DISABLED';
  const values = Object.values(price).filter((value) => value !== null && value !== undefined);
  if (!values.length || values.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) return 'UNKNOWN_PRICING_DISABLED';
  return values.every((value) => Number(value) === 0) ? 'FREE_MODEL' : 'PAID_DISABLED';
}

export function assertPaidApiAllowed(kind, env = process.env) {
  if (paidApiUsageEnabled(env)) return;
  const error = new Error(`${kind} has no verified zero-cost route under ZERO_SPEND_MODE`);
  error.code = 'NO_ZERO_COST_MODEL_AVAILABLE';
  throw error;
}

const catalogCache = new Map();

export async function discoverPricedModels(provider, { fetchImpl = fetch, now = Date.now(), ttlMs = 60_000, secret = '' } = {}) {
  const baseUrl = String(provider.baseUrl || '').replace(/\/$/, '');
  if (!baseUrl || !['openrouter', 'vercel'].includes(provider.presetId || provider.provider)) return [];
  const key = `${baseUrl}:${provider.credentialId || provider.credentialRef || ''}`;
  const cached = catalogCache.get(key);
  if (cached && now - cached.at < ttlMs) return cached.models;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchImpl(`${baseUrl}/models`, { signal: controller.signal, headers: { accept: 'application/json', ...(secret ? { authorization: `Bearer ${secret}` } : {}) } });
    if (!response.ok) return [];
    const payload = await response.json();
    const models = (Array.isArray(payload.data) ? payload.data : []).filter((item) => item?.id).map((item) => ({ id: item.id, pricingType: pricingClass(item), capabilities: item.capabilities || null, modalities: item.modalities || item.architecture || null }));
    catalogCache.set(key, { at: now, models });
    return models;
  } catch { return []; }
  finally { clearTimeout(timer); }
}

export async function zeroSpendEligible(provider, options = {}) {
  if (provider.type === 'LOCAL') return true;
  // CLI sources are reachable only through an explicit manual source lock;
  // automatic local/web/free-API routing excludes them by tier.
  if (provider.type === 'CLI') return true;
  if (paidApiUsageEnabled(options.env)) return true;
  const models = await discoverPricedModels(provider, options);
  return models.some((model) => model.id === provider.modelId && model.pricingType === 'FREE_MODEL');
}
