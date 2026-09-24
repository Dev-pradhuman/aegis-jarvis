import { useEffect, useState } from 'react';
import { Activity, Database, Workflow, CircleHelp } from 'lucide-react';
import { pollWithBackoff } from '../hooks/pollWithBackoff.js';

const SOURCES = {
  tasks: ['/api/tasks', 'tasks'], approvals: ['/api/approvals', 'approvals'],
  runs: ['/api/runs', 'runs'], workflows: ['/api/workflows', 'workflows'],
  memory: ['/api/memory', 'memories'], integrations: ['/api/integrations', 'integrations'],
  mcp: ['/api/mcp/servers', 'servers'], projects: ['/api/projects', 'projects'],
  phone: ['/api/device/status', 'devices'], media: ['/api/media/jobs', 'jobs'],
  agents: ['/api/agents', 'agents'],
  research: ['/api/research/status', null], messaging: ['/api/messaging/status', null],
  system: ['/api/diagnostics', null],
};
const NAMES = { agents: 'Agent orchestration', research: 'Research workspace', projects: 'Project intelligence', media: 'Media studio', phone: 'Phone companion', messaging: 'Messaging channels' };

function itemTitle(item) { return item.title || item.name || item.label || item.id || item.type || 'Entry'; }
function itemDetail(item) { return item.status || item.description || item.summary || item.trigger || item.createdAt || item.state || ''; }

export default function LiveModule({ id }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    const source = SOURCES[id];
    if (!source) return;
    return pollWithBackoff(async (signal) => {
      const response = await fetch(source[0], { signal });
      if (!response.ok) throw new Error(`Service returned ${response.status}`);
      const value = await response.json();
      setData(source[1] ? value[source[1]] : value); setError(null);
    }, { connectedMs: 5000, onError: (cause) => { setData(null); setError(cause.message); } });
  }, [id]);

  if (!SOURCES[id]) return <div className="module-empty"><CircleHelp size={24} /><h2>{NAMES[id] || id}</h2><p>This workspace is prepared for a future JARVIS integration. No live service is connected yet.</p></div>;
  if (error) return <div className="module-empty"><Activity size={24} /><h2>Service unavailable</h2><p>{error}</p></div>;
  if (data === null) return <div className="module-empty"><Activity size={24} /><h2>Connecting</h2><p>Reading live JARVIS state…</p></div>;
  if (['system', 'research', 'messaging'].includes(id)) return <div className="module-list"><div className="module-intro"><Activity size={17} /> Live {id} status</div><pre className="module-json">{JSON.stringify(data, null, 2)}</pre></div>;
  const items = Array.isArray(data) ? data : [];
  return <div className="module-list">
    <div className="module-intro">{id === 'memory' ? <Database size={17} /> : <Workflow size={17} />} {items.length} {id} {items.length === 1 ? 'entry' : 'entries'} · live service</div>
    {items.length ? items.map((item, index) => <div className="module-row" key={item.id || index}><div><strong>{itemTitle(item)}</strong><span>{itemDetail(item)}</span></div>{item.status && <small>{item.status}</small>}</div>) : <div className="module-empty"><p>No {id} entries yet.</p></div>}
  </div>;
}
