import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const hash = (value) => [...String(value)].reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 2166136261);

function positions(nodes) {
  const count = Math.max(nodes.length, 1);
  return new Map(nodes.map((node, index) => {
    const seed = hash(node.id); const angle = (index / count) * Math.PI * 2 + (seed % 100) / 120;
    const ring = 90 + Math.sqrt(index + 1) * 32 + (seed % 53);
    return [node.id, { x: Math.cos(angle) * ring, y: Math.sin(angle) * ring }];
  }));
}

export default function LiveMemoryGraph({ onNewChat }) {
  const canvasRef = useRef(null); const viewportRef = useRef({ x: 0, y: 0, scale: 1 }); const dragRef = useRef(null);
  const [graph, setGraph] = useState({ status: 'loading', nodes: [], edges: [], revision: 0 });
  const [query, setQuery] = useState(''); const [folder, setFolder] = useState(''); const [tag, setTag] = useState(''); const [recentOnly, setRecentOnly] = useState(false); const [selected, setSelected] = useState(null); const [note, setNote] = useState(null);
  const refresh = useCallback(async (force = false) => {
    try { const endpoint = force ? '/api/memory-graph/refresh' : `/api/memory-graph?revision=${graph.revision || 0}`; const response = await fetch(endpoint, { method: force ? 'POST' : 'GET' }); if (!response.ok) throw new Error('Memory graph service unavailable'); const next = await response.json(); setGraph((current) => next.unchanged ? { ...current, activeMemoryIds: next.activeMemoryIds, activeMemoryAt: next.activeMemoryAt } : next); }
    catch (error) { setGraph((current) => ({ ...current, status: 'error', error: error.message })); }
  }, [graph.revision]);
  useEffect(() => { refresh(); const timer = setInterval(refresh, 2500); return () => clearInterval(timer); }, [refresh]);

  const folders = useMemo(() => [...new Set(graph.nodes.map((node) => node.folder).filter(Boolean))].sort(), [graph.nodes]);
  const tags = useMemo(() => [...new Set(graph.nodes.flatMap((node) => node.tags || []))].sort(), [graph.nodes]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase(); const recentCutoff = Date.now() - 30 * 86400000;
    return graph.nodes.filter((node) => (!needle || node.title.toLowerCase().includes(needle) || node.path.toLowerCase().includes(needle) || node.preview.toLowerCase().includes(needle)) && (!folder || node.folder === folder) && (!tag || node.tags?.includes(tag)) && (!recentOnly || Date.parse(node.modifiedAt) >= recentCutoff));
  }, [graph.nodes, query, folder, tag, recentOnly]);
  const layout = useMemo(() => positions(visible), [visible]); const visibleIds = useMemo(() => new Set(visible.map((node) => node.id)), [visible]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return; const rect = canvas.getBoundingClientRect(); const ratio = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(rect.width * ratio) || canvas.height !== Math.round(rect.height * ratio)) { canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio); }
    const context = canvas.getContext('2d'); context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, rect.width, rect.height);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim() || '#ff9d00'; const view = viewportRef.current;
    const point = (position) => ({ x: rect.width / 2 + view.x + position.x * view.scale, y: rect.height / 2 + view.y + position.y * view.scale });
    context.lineWidth = .7; context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent-graph').trim() || 'rgba(255,157,0,.26)';
    for (const edge of graph.edges) { if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue; const from = point(layout.get(edge.source)), to = point(layout.get(edge.target)); if (!from || !to) continue; context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke(); }
    for (const node of visible) {
      const p = point(layout.get(node.id)); if (p.x < -30 || p.y < -30 || p.x > rect.width + 30 || p.y > rect.height + 30) continue;
      const active = graph.activeMemoryIds?.includes(node.id); const chosen = selected?.id === node.id; const radius = Math.min(13, 4.5 + Math.sqrt(node.connections || 0) * 1.7);
      context.shadowBlur = active || chosen ? 22 : 8; context.shadowColor = accent; context.globalAlpha = active || chosen ? 1 : .62; context.fillStyle = accent; context.beginPath(); context.arc(p.x, p.y, radius, 0, Math.PI * 2); context.fill(); context.globalAlpha = 1; context.shadowBlur = 0;
      if (view.scale > .72 && (chosen || active || node.connections > 2 || visible.length < 120)) { context.fillStyle = '#d8d8d3'; context.font = '11px var(--font-mono)'; context.fillText(node.title.slice(0, 34), p.x + radius + 6, p.y + 4); }
    }
  }, [graph, layout, selected, visible, visibleIds]);
  useEffect(() => { draw(); const resize = new ResizeObserver(draw); if (canvasRef.current) resize.observe(canvasRef.current); return () => resize.disconnect(); }, [draw]);

  function nodeAt(event) { const canvas = canvasRef.current, rect = canvas.getBoundingClientRect(), view = viewportRef.current; let best = null; for (const node of visible) { const pos = layout.get(node.id); const x = rect.width / 2 + view.x + pos.x * view.scale, y = rect.height / 2 + view.y + pos.y * view.scale, distance = Math.hypot(event.clientX - rect.left - x, event.clientY - rect.top - y); if (distance < 16 && (!best || distance < best.distance)) best = { node, distance }; } return best?.node || null; }
  async function selectNode(node) { setSelected(node); setNote(null); if (!node) return; try { const response = await fetch(`/api/memory-graph/note?path=${encodeURIComponent(node.path)}`); setNote(response.ok ? await response.json() : { error: 'Note could not be loaded.' }); } catch { setNote({ error: 'Note could not be loaded.' }); } }
  function onWheel(event) { event.preventDefault(); viewportRef.current.scale = Math.max(.25, Math.min(3, viewportRef.current.scale * (event.deltaY > 0 ? .9 : 1.1))); draw(); }
  function onPointerDown(event) { dragRef.current = { x: event.clientX, y: event.clientY, moved: false }; event.currentTarget.setPointerCapture(event.pointerId); }
  function onPointerMove(event) { if (!dragRef.current) return; const dx = event.clientX - dragRef.current.x, dy = event.clientY - dragRef.current.y; if (Math.abs(dx) + Math.abs(dy) > 2) dragRef.current.moved = true; viewportRef.current.x += dx; viewportRef.current.y += dy; dragRef.current.x = event.clientX; dragRef.current.y = event.clientY; draw(); }
  function onPointerUp(event) { const dragged = dragRef.current; dragRef.current = null; if (!dragged?.moved) void selectNode(nodeAt(event)); }

  return <div className="memory-brain">
    <div className="brain-toolbar">
      <div className="brain-status"><span className={`status-dot ${graph.status}`} />{graph.status === 'ready' ? `${graph.nodes.length} memories · ${graph.edges.length} links` : graph.status?.replaceAll('_', ' ')}</div>
      <div className="brain-filters">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search memory" aria-label="Search memory graph" />
        <select value={folder} onChange={(event) => setFolder(event.target.value)} aria-label="Filter folder"><option value="">All folders</option>{folders.map((value) => <option key={value}>{value}</option>)}</select>
        <select value={tag} onChange={(event) => setTag(event.target.value)} aria-label="Filter tag"><option value="">All tags</option>{tags.map((value) => <option key={value}>{value}</option>)}</select>
        <button className={recentOnly ? 'active' : ''} onClick={() => setRecentOnly((value) => !value)}>Recent</button>
        <button onClick={() => refresh(true)}>Refresh</button>
      </div>
      <button className="new-chat-control" onClick={onNewChat}>+ New Chat</button>
    </div>
    <div className="brain-stage">
      {['not_configured', 'missing', 'empty', 'permission_denied', 'parser_failure', 'watcher_disconnected', 'error'].includes(graph.status) && <div className="brain-empty"><strong>{graph.status === 'not_configured' ? 'Preparing JARVIS memory vault' : graph.status === 'empty' ? 'The vault has no Markdown notes yet' : 'Memory graph unavailable'}</strong><span>{graph.error || (graph.status === 'not_configured' ? 'JARVIS uses Documents/JARVIS-Vault unless OBSIDIAN_VAULT_PATH is configured.' : 'No demonstration memories are shown.')}</span></div>}
      <canvas ref={canvasRef} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} />
      {selected && <aside className="memory-detail"><button className="detail-close" onClick={() => selectNode(null)}>×</button><div className="eyebrow">Memory source</div><h3>{selected.title}</h3><div className="memory-meta">{selected.folder || 'Vault root'} · {new Date(selected.modifiedAt).toLocaleString()} · {selected.connections} links</div>{selected.tags?.length > 0 && <div className="memory-tags">{selected.tags.map((item) => <span key={item}>#{item}</span>)}</div>}<p>{note?.error || note?.content?.slice(0, 1600) || selected.preview}</p><a href={`obsidian://open?path=${encodeURIComponent(graph.vaultPath + '/' + selected.path)}`}>Open in Obsidian</a></aside>}
    </div>
  </div>;
}
