import { useEffect, useState } from 'react';

export default function GlobalVoice() {
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (error) {
      window.dispatchEvent(new CustomEvent('jarvis:voice_error', { detail: { message: error } }));
    }
  }, [error]);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch('/api/voice/status');
        if (!response.ok) throw new Error('Voice status unavailable');
        const data = await response.json();
        if (active) setState(data.state || 'idle');
        if (active) setError(null);
      } catch (err) {
        if (active) setError(err.message);
      }
    };
    poll();
    const timer = setInterval(poll, 1000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    let isShiftDown = false;
    const handleKeyDown = async (e) => {
      if (e.key === 'Shift' && !e.repeat && !isShiftDown) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        isShiftDown = true;
        try {
          await fetch('/api/voice/ptt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'start' })
          });
        } catch (err) {
          setError(err.message);
        }
      }
    };
    const handleKeyUp = async (e) => {
      if (e.key === 'Shift') {
        isShiftDown = false;
        try {
          await fetch('/api/voice/ptt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'stop' })
          });
        } catch (err) {
          setError(err.message);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  let indicatorClass = 'global-voice-indicator';
  if (state === 'capturing') indicatorClass += ' capturing';
  if (state === 'speaking') indicatorClass += ' speaking';

  const styles = {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    width: '50px',
    height: '50px',
    borderRadius: '50%',
    backgroundColor: state === 'capturing' ? 'red' : (state === 'speaking' ? '#4caf50' : '#444'),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
    animation: state === 'speaking' ? 'pulse 1.5s infinite' : 'none',
    zIndex: 9999,
    fontSize: '24px'
  };

  return (
    <>
      <div className={indicatorClass} style={styles}>
        {state === 'capturing' ? '🎤' : '🎙️'}
        {error && (
          <div style={{
            position: 'absolute',
            bottom: '60px',
            right: 0,
            backgroundColor: 'red',
            color: 'white',
            padding: '4px 8px',
            fontSize: '12px',
            borderRadius: '4px',
            whiteSpace: 'nowrap'
          }}>
            Voice Error: {error}
          </div>
        )}
      </div>
      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7); }
          70% { transform: scale(1.1); box-shadow: 0 0 0 10px rgba(76, 175, 80, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
        }
      `}</style>
    </>
  );
}
