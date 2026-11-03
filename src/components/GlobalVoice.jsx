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

  const [pttKeyCombo, setPttKeyCombo] = useState(() => {
    try {
      return localStorage.getItem('jarvis_ptt_key') || 'Ctrl+Space';
    } catch {
      return 'Ctrl+Space';
    }
  });

  useEffect(() => {
    let isPttDown = false;

    const matchesCombo = (e, comboStr) => {
      const parts = comboStr.toLowerCase().split('+').map(p => p.trim());
      const needCtrl = parts.includes('ctrl') || parts.includes('control');
      const needAlt = parts.includes('alt');
      const needShift = parts.includes('shift');
      const needMeta = parts.includes('meta') || parts.includes('cmd');
      const baseKey = parts[parts.length - 1];

      if (Boolean(e.ctrlKey) !== needCtrl) return false;
      if (Boolean(e.altKey) !== needAlt) return false;
      if (Boolean(e.shiftKey) !== needShift) return false;
      if (Boolean(e.metaKey) !== needMeta) return false;

      if (baseKey === 'space' && (e.code === 'Space' || e.key === ' ')) return true;
      return e.key.toLowerCase() === baseKey || e.code.toLowerCase() === baseKey;
    };

    const isBaseKeyRelease = (e, comboStr) => {
      const parts = comboStr.toLowerCase().split('+').map(p => p.trim());
      const baseKey = parts[parts.length - 1];
      if (baseKey === 'space' && (e.code === 'Space' || e.key === ' ')) return true;
      return e.key.toLowerCase() === baseKey || e.code.toLowerCase() === baseKey;
    };

    const handleKeyDown = async (e) => {
      if (matchesCombo(e, pttKeyCombo) && !e.repeat && !isPttDown) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
        isPttDown = true;
        e.preventDefault(); // Prevent page scroll / IME conflict
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
      if (isBaseKeyRelease(e, pttKeyCombo) && isPttDown) {
        isPttDown = false;
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
  }, [pttKeyCombo]);

  // Floating bottom-right mic circle removed per AC3; PTT listeners remain active
  return null;
}
