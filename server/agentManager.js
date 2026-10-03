import crypto from 'node:crypto';

export function createGoal(state, title, description) {
  state.goals ??= [];
  const goal = { id: `goal-${crypto.randomUUID()}`, title, description, status: 'active', createdAt: new Date().toISOString() };
  state.goals.unshift(goal);
  return goal;
}

export function spawnAgent(state, role, goalId = null) {
  state.agents ??= [];
  const agent = { 
    id: `agent-${crypto.randomUUID()}`, 
    role, // 'Research', 'Coding', etc.
    goalId,
    status: 'idle',
    memoryScope: [], // Isolated memory scope
    createdAt: new Date().toISOString() 
  };
  state.agents.unshift(agent);
  return agent;
}

export function updateAgentMemory(state, agentId, data) {
  const agent = (state.agents || []).find(a => a.id === agentId);
  if (!agent) throw new Error('Agent not found');
  agent.memoryScope.push({ timestamp: new Date().toISOString(), data });
}

export function completeAgentTask(state, agentId, result) {
  const agent = (state.agents || []).find(a => a.id === agentId);
  if (!agent) throw new Error('Agent not found');
  agent.status = 'completed';
  agent.lastResult = result;
  
  if (agent.goalId) {
    const goal = (state.goals || []).find(g => g.id === agent.goalId);
    if (goal) goal.lastUpdate = new Date().toISOString();
  }
}
