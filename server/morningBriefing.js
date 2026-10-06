import { calendarRequest } from './liveAdapters.js';
import { listProjectStatus } from './projectIntelligence.js';
import { executeModelPool } from './modelPool.js';

export async function generateMorningBriefing(state, { fetchImpl = fetch } = {}) {
  const tasks = state.tasks || [];
  const calendar = await calendarRequest('GET').catch(() => ({ events: [] }));
  const projects = await listProjectStatus().catch(() => []);
  
  const prompt = `Synthesize a concise Morning Intelligence Briefing. Do not dump raw text.
Tasks: ${JSON.stringify(tasks)}
Calendar: ${JSON.stringify(calendar)}
Projects: ${JSON.stringify(projects)}
Make it readable, focused on today's priorities.`;

  const response = await executeModelPool({
    logicalModel: 'muse-spark-1.2',
    request: prompt,
    attachments: [],
    requiredModality: 'text',
    fetchImpl
  });
  
  return response.reply;
}
