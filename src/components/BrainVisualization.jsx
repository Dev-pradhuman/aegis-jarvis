export default function BrainVisualization() {
  return (
    <iframe
      className="knowledge-graph-frame"
      src={`${import.meta.env.BASE_URL}jarvis_knowledge_graph.html`}
      title="JARVIS unified memory graph"
      sandbox="allow-scripts"
    />
  );
}
