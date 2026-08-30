import { useRef } from 'react';
import useWaveform from '../hooks/useWaveform.js';
import BrainVisualization from './BrainVisualization.jsx';
import '../styles/neural-core.css';

function RadarPoints() {
  const points = Array.from({ length: 10 }, () => {
    const ang = Math.random() * Math.PI * 2;
    const r = 15 + Math.random() * 32;
    return {
      cx: 65 + Math.cos(ang) * r,
      cy: 65 + Math.sin(ang) * r,
      duration: 2 + Math.random() * 2,
      delay: Math.random() * 2,
    };
  });

  return (
    <g>
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.cx}
          cy={p.cy}
          r={1.6}
          fill="var(--cyan)"
          style={{ animation: `flicker ${p.duration}s ease-in-out infinite`, animationDelay: `${p.delay}s` }}
        />
      ))}
    </g>
  );
}

export default function NeuralCore() {
  const intelWaveRef = useRef(null);
  const thoughtWaveRef = useRef(null);
  useWaveform(intelWaveRef, { points: 40, amp: 12, baseY: 15 });
  useWaveform(thoughtWaveRef, { points: 30, amp: 10, baseY: 15 });

  return (
    <section className="core-panel hud-panel">
      <div className="core-header">
        <div>
          <div className="hud-title">Jarvis Core Intelligence</div>
          <div className="hud-subtitle">Interactive Unified Memory Topology</div>
        </div>
      </div>

      <div className="core-body">
        {/* INTEL STREAM */}
        <div className="intel-panel hud-panel">
          <div>
            <div className="hud-title" style={{ fontSize: '10.5px' }}>
              Intel Stream
            </div>
            <div className="hud-subtitle">Live Data Feed</div>
          </div>
          <div className="intel-metric">
            <span className="lbl">Neural Pathways</span>
            <span className="v cyan mono">23.4K/s</span>
          </div>
          <div className="intel-metric">
            <span className="lbl">Data Ingestion</span>
            <span className="v cyan mono">18.7K/s</span>
          </div>
          <div className="intel-metric">
            <span className="lbl">Pattern Recognition</span>
            <span className="v cyan mono">92.1%</span>
          </div>
          <div className="intel-metric">
            <span className="lbl">Threat Analysis</span>
            <span className="v green mono">LOW</span>
          </div>
          <div className="intel-metric">
            <span className="lbl">Processor Efficiency</span>
            <span className="v green mono">OPTIMAL</span>
          </div>
          <svg className="waveform" viewBox="0 0 200 30" preserveAspectRatio="none">
            <polyline ref={intelWaveRef} points="" fill="none" stroke="var(--cyan)" strokeWidth={1.2} opacity={0.8} />
          </svg>
        </div>

        {/* CENTRAL VISUAL */}
        <div className="core-visual">
          <BrainVisualization />
        </div>

        {/* THOUGHT STREAM */}
        <div className="thought-panel hud-panel" style={{ width: 150 }}>
          <div>
            <div className="hud-title" style={{ fontSize: '10px' }}>
              Thought Stream
            </div>
            <div className="hud-subtitle">Live Processing</div>
          </div>
          <svg viewBox="0 0 130 130" width="100%" height="100">
            <circle cx={65} cy={65} r={45} stroke="var(--cyan-dim)" strokeWidth={1} fill="none" />
            <circle cx={65} cy={65} r={30} stroke="var(--cyan-dim)" strokeWidth={1} fill="none" />
            <RadarPoints />
            <g style={{ transformOrigin: '65px 65px', animation: 'orbit-rot 4s linear infinite' }}>
              <line x1={65} y1={65} x2={65} y2={20} stroke="var(--cyan)" strokeWidth={1.4} opacity={0.8} />
            </g>
          </svg>
          <svg className="waveform" viewBox="0 0 200 30" preserveAspectRatio="none">
            <polyline ref={thoughtWaveRef} points="" fill="none" stroke="var(--cyan)" strokeWidth={1.2} opacity={0.8} />
          </svg>
        </div>
      </div>

      <div className="core-footer">
        <div className="item">
          Neural Synchronization <b>98.7%</b>
          <div className="sync-bar"></div>
        </div>
        <div className="item">
          Cognitive Efficiency <b style={{ color: 'var(--green)' }}>OPTIMAL</b>
        </div>
        <div className="item">
          Memory Link <b style={{ color: 'var(--green)' }}>STABLE</b>
        </div>
      </div>
    </section>
  );
}
