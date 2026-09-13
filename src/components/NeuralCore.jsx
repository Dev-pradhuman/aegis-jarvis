import LiveMemoryGraph from './LiveMemoryGraph.jsx';
import '../styles/neural-core.css';

export default function NeuralCore({ onNewChat }) {
  return <section className="core-panel hud-panel">
    <div className="core-header"><div><div className="hud-title">Jarvis Memory Brain</div><div className="hud-subtitle">Live Obsidian topology · notes become nodes, wiki links become connections</div></div></div>
    <LiveMemoryGraph onNewChat={onNewChat} />
  </section>;
}
