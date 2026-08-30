import { useEffect } from 'react';

/**
 * Animates the `points` attribute of an SVG <polyline> ref into a soft,
 * ever-shifting waveform — used for the intel-stream / thought-stream sparklines.
 */
export default function useWaveform(ref, { points = 40, amp = 10, baseY = 15 } = {}) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let phase = Math.random() * 10;
    let raf;

    function draw() {
      const pts = [];
      for (let i = 0; i < points; i++) {
        const x = (i / (points - 1)) * 200;
        const y = baseY + Math.sin(i * 0.5 + phase) * amp * 0.5 + Math.sin(i * 0.2 + phase * 1.7) * amp * 0.3;
        pts.push(`${x},${y}`);
      }
      node.setAttribute('points', pts.join(' '));
      phase += 0.15;
    }

    draw();
    const id = setInterval(draw, 100);
    return () => {
      clearInterval(id);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref, points, amp, baseY]);
}
