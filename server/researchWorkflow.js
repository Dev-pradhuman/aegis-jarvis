import { researchSearch } from './systemModules.js';

export async function planGroundedResearch(input, search = researchSearch) {
  const topic = String(input.topic || '').trim();
  if (topic.length < 3 || topic.length > 500) throw Object.assign(new Error('topic must contain 3 to 500 characters'), { code: 'RESEARCH_TOPIC_INVALID' });
  const result = await search(topic);
  if (!result.configured) return { status: 'configuration_required', topic, sources: [], message: result.message || 'Search provider is unavailable' };
  const sources = (result.sources || []).filter((item) => item && typeof item.url === 'string' && /^https?:\/\//.test(item.url)).slice(0, 20).map((item) => ({ title: String(item.title || item.name || item.url).slice(0, 200), url: item.url, snippet: String(item.snippet || item.description || '').slice(0, 800) }));
  if (!sources.length) return { status: 'no_sources', topic, sources, message: 'Search returned no attributable sources; no factual outline was generated' };
  return { status: 'sources_collected', topic, sources, nextSteps: ['Verify source relevance and publication date', 'Synthesize claims with citations', 'Draft an outline', 'Prepare a media prompt only after the outline is reviewed'], mediaRequested: Boolean(input.media), message: 'Sources collected; synthesis and media generation have not been claimed as complete' };
}
