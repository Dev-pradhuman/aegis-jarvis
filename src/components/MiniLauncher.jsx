import { useState, useEffect, useRef } from 'react';
import { RotateCcw, MessageSquare, Send, Copy, Check, X, Volume2 } from 'lucide-react';
import '../styles/mini-launcher.css';

const DEFAULT_JARVIS_URL = 'http://127.0.0.1:8787';

export default function MiniLauncher() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState(() => {
    try {
      const stored = localStorage.getItem('jarvis_mini_history');
      return stored ? JSON.parse(stored) : [
        "What's my system volume?",
        "Play Starboy on Spotify",
        "Check system diagnostics",
        "What are my scheduled tasks?"
      ];
    } catch {
      return [];
    }
  });
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const inputRef = useRef(null);
  const audioRef = useRef(null);

  // Auto-focus on mount and when window gains focus
  useEffect(() => {
    inputRef.current?.focus();
    const handleFocus = () => inputRef.current?.focus();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Keyboard shortcut listener (Escape to close or hide)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (response || error) {
          setResponse('');
          setError('');
          stopAudio();
        } else if (showHistory) {
          setShowHistory(false);
        } else {
          closeMiniWindow();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [response, error, showHistory]);

  const closeMiniWindow = () => {
    stopAudio();
    // Notify daemon to close window or hide via hyprctl
    fetch('/api/island/hide', { method: 'POST' }).catch(() => {});
    try {
      window.close();
    } catch {}
  };

  const stopAudio = () => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {}
      audioRef.current = null;
    }
    setSpeaking(false);
  };

  const playTTS = async (text) => {
    if (!text) return;
    stopAudio();
    try {
      const cleanText = text
        .replace(/```[\s\S]*?```/g, ' code block omitted ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[*_#]/g, '')
        .trim();

      const res = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText })
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        setSpeaking(true);
        audio.onended = () => {
          setSpeaking(false);
          URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
          setSpeaking(false);
          URL.revokeObjectURL(url);
        };
        await audio.play().catch(() => setSpeaking(false));
      }
    } catch {
      setSpeaking(false);
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const query = input.trim();
    if (!query || loading) return;

    setLoading(true);
    setResponse('');
    setError('');
    stopAudio();

    // Add to history
    const updatedHistory = [query, ...history.filter((h) => h !== query)].slice(0, 15);
    setHistory(updatedHistory);
    try {
      localStorage.setItem('jarvis_mini_history', JSON.stringify(updatedHistory));
    } catch {}

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.reply || errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const reply = data.reply || data.response || 'Action completed.';
      setResponse(reply);
      void playTTS(reply);
    } catch (err) {
      setError(err.message || 'Failed to communicate with JARVIS service');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!response) return;
    navigator.clipboard?.writeText(response);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExpandToFullChat = () => {
    // Open or focus main UI
    window.open(DEFAULT_JARVIS_URL, '_blank');
    closeMiniWindow();
  };

  const isBusy = loading || speaking;

  return (
    <div className="mini-launcher-viewport" data-testid="mini-launcher">
      <div className={`mini-launcher-pill ${isBusy ? 'is-busy' : ''}`}>
        {/* Left 46x46px Circular Gargantua Emblem Badge */}
        <div
          className="mini-gargantua-badge"
          onClick={() => {
            if (response) playTTS(response);
            else inputRef.current?.focus();
          }}
          title={isBusy ? 'JARVIS is active' : 'Aegis-JARVIS Event Horizon'}
          aria-label="JARVIS Emblem"
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 100 100"
            className={`mini-gargantua-svg ${isBusy ? 'pulsing' : ''}`}
          >
            <defs>
              <radialGradient id="miniBlackHoleGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#000000" />
                <stop offset="68%" stopColor="#000000" />
                <stop offset="88%" stopColor="#d97706" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.45" />
              </radialGradient>
              <linearGradient id="miniRingAmber" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fbbf24" />
                <stop offset="50%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
            </defs>
            {/* Gravitational lensing upper arc */}
            <path
              d="M 18 50 C 18 24 82 24 82 50 C 82 28 18 28 18 50 Z"
              fill="url(#miniRingAmber)"
              opacity="0.85"
            />
            {/* Tilted Accretion Disk */}
            <ellipse
              cx="50"
              cy="50"
              rx="44"
              ry="14"
              fill="none"
              stroke="url(#miniRingAmber)"
              strokeWidth="3.6"
              transform="rotate(-14 50 50)"
            />
            {/* Event Horizon Core */}
            <circle cx="50" cy="50" r="17" fill="url(#miniBlackHoleGlow)" />
            <circle cx="50" cy="50" r="17" fill="#000000" />
            {/* Photon Ring */}
            <circle
              cx="50"
              cy="50"
              r="17.5"
              fill="none"
              stroke="rgba(251, 191, 36, 0.95)"
              strokeWidth="1.2"
            />
          </svg>
        </div>

        {/* Vertical Divider Line */}
        <div className="mini-divider" />

        {/* Center Auto-Focused Input Form */}
        <form className="mini-input-form" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="mini-input"
            placeholder={loading ? 'JARVIS is thinking...' : 'Ask JARVIS anything...'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            autoFocus
          />
        </form>

        {/* Right Action Cluster */}
        <div className="mini-action-cluster">
          {/* History Button (Counter-clockwise history clock icon ↺) */}
          <button
            type="button"
            className="mini-icon-btn"
            onClick={() => setShowHistory((prev) => !prev)}
            title="Command history"
            aria-label="Command history"
          >
            <RotateCcw size={18} />
          </button>

          {/* Expand to Full Chat Button (Speech bubble with text lines 💬) */}
          <button
            type="button"
            className="mini-icon-btn"
            onClick={handleExpandToFullChat}
            title="Open full JARVIS console"
            aria-label="Open full JARVIS console"
          >
            <MessageSquare size={18} />
          </button>

          {/* Far Right Circular Glowing Send Button */}
          <button
            type="button"
            className="mini-send-btn"
            onClick={handleSubmit}
            disabled={!input.trim() || loading}
            title="Send query (Enter)"
            aria-label="Send query"
          >
            <Send size={18} color="#ffffff" style={{ transform: 'translateX(1px)' }} />
          </button>
        </div>

        {/* History Dropdown Overlay */}
        {showHistory && (
          <div className="mini-history-dropdown">
            <div className="mini-history-header">
              <span>RECENT COMMANDS</span>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                onClick={() => setShowHistory(false)}
              >
                ✕
              </button>
            </div>
            {history.length > 0 ? (
              history.map((item, idx) => (
                <div
                  key={idx}
                  className="mini-history-item"
                  onClick={() => {
                    setInput(item);
                    setShowHistory(false);
                    inputRef.current?.focus();
                  }}
                >
                  {item}
                </div>
              ))
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.4)', padding: '6px 10px', fontSize: '13px' }}>
                No recent commands
              </div>
            )}
          </div>
        )}

        {/* Inline Compact Response Bar */}
        {(response || error || loading) && (
          <div className="mini-response-strip">
            <div className="mini-response-header">
              <div className="mini-response-author">
                <span>JARVIS</span>
                {speaking && <Volume2 size={13} style={{ color: '#60a5fa' }} />}
                {loading && (
                  <span className="mini-loading-dots">
                    <span /><span /><span />
                  </span>
                )}
              </div>
              <div className="mini-response-actions">
                {response && (
                  <button
                    type="button"
                    className="mini-icon-btn"
                    style={{ width: '28px', height: '28px' }}
                    onClick={handleCopy}
                    title="Copy response"
                  >
                    {copied ? <Check size={13} color="#4ade80" /> : <Copy size={13} />}
                  </button>
                )}
                <button
                  type="button"
                  className="mini-icon-btn"
                  style={{ width: '28px', height: '28px' }}
                  onClick={() => {
                    setResponse('');
                    setError('');
                    stopAudio();
                  }}
                  title="Dismiss (Escape)"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
            <div className="mini-response-body">
              {loading && !response && (
                <span style={{ color: 'rgba(255,255,255,0.5)', fontStyle: 'italic' }}>
                  Processing request...
                </span>
              )}
              {error && (
                <span style={{ color: '#f87171' }}>
                  Error: {error}
                </span>
              )}
              {response && (
                <div>
                  {response}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
