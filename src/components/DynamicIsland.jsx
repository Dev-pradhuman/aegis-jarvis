import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import '../styles/island.css';

function nowTime() {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
}

function makeMsgId(prefix = 'island') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function DynamicIsland() {
  const [theme, setTheme] = useState(null);
  const [voiceState, setVoiceState] = useState('idle');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('jarvis_speech_enabled');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const [activeApprovals, setActiveApprovals] = useState([]);
  const [resolvingApprovalId, setResolvingApprovalId] = useState(null);
  const [pendingBrowserChallenge, setPendingBrowserChallenge] = useState(null);
  const [resumingBrowser, setResumingBrowser] = useState(false);
  const [ringingReminders, setRingingReminders] = useState([]);
  const [currentTimeStr, setCurrentTimeStr] = useState(() => nowTime());

  const inputRef = useRef(null);
  const contentRef = useRef(null);
  const currentAudioRef = useRef(null);
  const ttsAbortControllerRef = useRef(null);
  const activeObjectUrlsRef = useRef(new Set());

  // Update clock display
  useEffect(() => {
    const timer = setInterval(() => setCurrentTimeStr(nowTime()), 10_000);
    return () => clearInterval(timer);
  }, []);

  // 1. Fetch & apply dynamic Caelestia Shell theme
  useEffect(() => {
    document.body.classList.add('island-body');
    const loadTheme = async () => {
      try {
        const res = await fetch('/api/theme/caelestia');
        if (res.ok) {
          const t = await res.json();
          setTheme(t);
          const root = document.documentElement;
          if (t.background) root.style.setProperty('--island-bg', t.background);
          if (t.surface) root.style.setProperty('--island-surface', t.surface);
          if (t.surfaceContainer) root.style.setProperty('--island-surface-container', t.surfaceContainer);
          if (t.surfaceContainerHigh) root.style.setProperty('--island-surface-high', t.surfaceContainerHigh);
          if (t.primary) root.style.setProperty('--island-primary', t.primary);
          if (t.primaryDim) root.style.setProperty('--island-primary-dim', t.primaryDim);
          if (t.onPrimary) root.style.setProperty('--island-on-primary', t.onPrimary);
          if (t.glow) root.style.setProperty('--island-glow', t.glow);
          if (t.text) root.style.setProperty('--island-text', t.text);
          if (t.subtext) root.style.setProperty('--island-subtext', t.subtext);
          if (t.outline) root.style.setProperty('--island-outline', t.outline);
          if (t.outlineVariant) root.style.setProperty('--island-outline-variant', t.outlineVariant);
          if (t.error) root.style.setProperty('--island-error', t.error);
          if (t.success) root.style.setProperty('--island-success', t.success);
        }
      } catch (err) {
        console.warn('[DynamicIsland] Theme fetch failed:', err);
      }
    };
    loadTheme();
    return () => {
      document.body.classList.remove('island-body');
    };
  }, []);

  // 2. Poll voice status, security approvals, browser challenges, and schedule ringing alerts
  useEffect(() => {
    let active = true;
    const pollStatus = async () => {
      try {
        const [vRes, aRes, bRes, sRes] = await Promise.all([
          fetch('/api/voice/status').catch(() => null),
          fetch('/api/approvals').catch(() => null),
          fetch('/api/browser/status').catch(() => null),
          fetch('/api/schedule/overview').catch(() => null)
        ]);

        if (active && vRes?.ok) {
          const vData = await vRes.json();
          setVoiceState(vData.state || 'idle');
        }

        if (active && aRes?.ok) {
          const aData = await aRes.json();
          const list = Array.isArray(aData.approvals) ? aData.approvals : [];
          setActiveApprovals(list);
          if (list.length > 0) setExpanded(true);
        }

        if (active && bRes?.ok) {
          const bData = await bRes.json();
          if (bData?.humanActionRequired || bData?.state === 'HUMAN_ACTION_REQUIRED') {
            setPendingBrowserChallenge({
              url: bData.url || bData.pending?.url || '',
              reason: (typeof bData.pending?.challenge === 'object' ? bData.pending.challenge?.title : bData.pending?.challenge) || 'Human verification required in Firefox'
            });
            setExpanded(true);
          } else {
            setPendingBrowserChallenge(null);
          }
        }

        if (active && sRes?.ok) {
          const sData = await sRes.json();
          const ringing = Array.isArray(sData.ringingReminders) ? sData.ringingReminders : [];
          setRingingReminders(ringing);
          if (ringing.length > 0) setExpanded(true);
        }
      } catch {}
    };

    pollStatus();
    const timer = setInterval(pollStatus, 900);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  // 3. Audio & Speech helpers
  const stopSpeaking = () => {
    if (ttsAbortControllerRef.current) {
      try { ttsAbortControllerRef.current.abort(); } catch {}
      ttsAbortControllerRef.current = null;
    }
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause();
        currentAudioRef.current.currentTime = 0;
      } catch {}
      currentAudioRef.current = null;
    }
    for (const url of activeObjectUrlsRef.current) {
      try { URL.revokeObjectURL(url); } catch {}
    }
    activeObjectUrlsRef.current.clear();
  };

  const toggleSpeech = () => {
    setSpeechEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem('jarvis_speech_enabled', JSON.stringify(next)); } catch {}
      if (!next) stopSpeaking();
      return next;
    });
  };

  function cleanSpeechText(text) {
    return String(text || '')
      .replace(/```[\s\S]*?```/g, ' Code snippet omitted. ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*_#~]/g, '')
      .trim();
  }

  function splitFirstSentence(text) {
    const match = text.match(/([.!?](\s+|$)|[\n]+)/);
    if (!match || match.index === undefined) return [text, ''];
    const boundaryEnd = match.index + match[0].length;
    const first = text.slice(0, boundaryEnd).trim();
    const rest = text.slice(boundaryEnd).trim();
    if (!first || !rest) return [text, ''];
    return [first, rest];
  }

  async function fetchTtsBlob(cleanText, signal) {
    if (!cleanText) return null;
    try {
      const response = await fetch('/api/voice/tts', {
        method: 'POST',
        signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: cleanText })
      });
      if (response.status === 204) return null;
      if (!response.ok) return null;
      return await response.blob();
    } catch {
      return null;
    }
  }

  const playBlobAsync = (blob, signal) => {
    if (!blob || signal?.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      activeObjectUrlsRef.current.add(url);
      const audio = new Audio(url);
      currentAudioRef.current = audio;

      const cleanup = () => {
        activeObjectUrlsRef.current.delete(url);
        URL.revokeObjectURL(url);
        if (currentAudioRef.current === audio) currentAudioRef.current = null;
      };

      audio.onended = () => { cleanup(); resolve(); };
      audio.onerror = () => { cleanup(); resolve(); };
      audio.play().catch(() => { cleanup(); resolve(); });
    });
  };

  async function speakReply(text) {
    stopSpeaking();
    const cleanText = cleanSpeechText(text);
    if (!cleanText) return;

    const controller = new AbortController();
    ttsAbortControllerRef.current = controller;

    try {
      if (cleanText.length > 180) {
        const [first, rest] = splitFirstSentence(cleanText);
        if (first && rest) {
          const firstBlob = await fetchTtsBlob(first, controller.signal);
          if (controller.signal.aborted) return;
          if (firstBlob) await playBlobAsync(firstBlob, controller.signal);
          if (controller.signal.aborted) return;
          const restBlob = await fetchTtsBlob(rest, controller.signal);
          if (controller.signal.aborted) return;
          if (restBlob) await playBlobAsync(restBlob, controller.signal);
          return;
        }
      }
      const blob = await fetchTtsBlob(cleanText, controller.signal);
      if (blob && !controller.signal.aborted) {
        await playBlobAsync(blob, controller.signal);
      }
    } catch {}
  }

  // 4. Voice PTT toggle
  const toggleVoice = async () => {
    try {
      await fetch('/api/voice/ptt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle' })
      });
    } catch (err) {
      console.warn('[DynamicIsland] Voice PTT failed:', err);
    }
  };

  // 5. Hide / Close Island
  const closeIsland = async () => {
    try {
      await fetch('/api/island/hide', { method: 'POST' }).catch(() => {});
    } catch {}
    window.close();
  };

  // 6. Keyboard Shortcuts inside Island
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeIsland();
      } else if (e.code === 'Space' && (e.altKey || e.ctrlKey)) {
        e.preventDefault();
        toggleVoice();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 7. Auto-scroll expanded area
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [messages, isTyping, expanded]);

  // 8. Resolve Approvals
  const handleResolveApproval = async (approval, outcome, msgId) => {
    if (!approval?.id) return;
    setResolvingApprovalId(approval.id);
    try {
      const response = await fetch(`/api/approvals/${encodeURIComponent(approval.id)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ outcome })
      });
      const data = await response.json().catch(() => ({}));
      const isApproved = outcome === 'approved';
      const toolResult = data.result;

      let outcomeText = '';
      if (isApproved) {
        if (toolResult?.ok !== false) {
          const stdout = toolResult?.data?.stdout ? `\nOutput: ${toolResult.data.stdout.trim()}` : '';
          outcomeText = `Approved and executed "${approval.toolName || approval.title}".${stdout}`;
        } else {
          outcomeText = `Approved "${approval.toolName || approval.title}", but failed: ${toolResult?.error || 'Action failed'}.`;
        }
      } else {
        outcomeText = 'Execution denied by user.';
      }

      setActiveApprovals((prev) => prev.filter((a) => a.id !== approval.id));
      setMessages((prev) => {
        const updated = prev.map((m) => m.id === msgId ? { ...m, approval: null, approvalResolved: outcome } : m);
        return [...updated, {
          id: makeMsgId('island-approval-res'),
          who: 'JARVIS',
          time: nowTime(),
          lines: [outcomeText],
          approvalResolved: outcome
        }];
      });

      if (speechEnabled) {
        void speakReply(outcomeText);
      }
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: makeMsgId('island-err'),
        who: 'JARVIS',
        time: nowTime(),
        lines: [`Approval action failed: ${err.message || 'Network error'}`]
      }]);
    } finally {
      setResolvingApprovalId(null);
    }
  };

  // 9. Resume Browser Challenge
  const handleResumeBrowser = async (challenge, msgId) => {
    setResumingBrowser(true);
    try {
      const response = await fetch('/api/browser/resume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resumedBy: 'user' })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

      setPendingBrowserChallenge(null);
      const resumeText = 'Verification verified. Headless browser session resumed.';
      setMessages((prev) => {
        const updated = prev.map((m) => m.id === msgId ? { ...m, browserChallenge: null, browserResolved: true } : m);
        return [...updated, {
          id: makeMsgId('island-browser-res'),
          who: 'JARVIS',
          time: nowTime(),
          lines: [resumeText],
          browserResolved: true
        }];
      });

      if (speechEnabled) {
        void speakReply(resumeText);
      }
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: makeMsgId('island-err'),
        who: 'JARVIS',
        time: nowTime(),
        lines: [`Failed to resume browser: ${err.message || 'Network error'}`]
      }]);
    } finally {
      setResumingBrowser(false);
    }
  };

  const handleDismissReminder = async (id) => {
    try {
      await fetch(`/api/schedule/reminders/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss' })
      });
      setRingingReminders((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Failed to dismiss reminder:', err);
    }
  };

  const handleSnoozeReminder = async (id, minutes = 10) => {
    try {
      await fetch(`/api/schedule/reminders/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'snooze', snoozeMinutes: minutes })
      });
      setRingingReminders((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error('Failed to snooze reminder:', err);
    }
  };

  // 10. Send Chat Message
  const sendMessage = async (e) => {
    if (e) e.preventDefault();
    const val = input.trim();
    if (!val || isTyping) return;

    setInput('');
    setIsTyping(true);
    setExpanded(true);
    stopSpeaking();

    const userMsg = { id: makeMsgId('user'), who: 'YOU', time: nowTime(), lines: [val] };
    const assistantId = makeMsgId('jarvis');
    setMessages((prev) => [...prev, userMsg]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Accept': 'text/event-stream' },
        body: JSON.stringify({ message: val })
      });

      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let reply = '';
        let placeholderAdded = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              try {
                const data = JSON.parse(trimmed.slice(6));
                if (data.type === 'token') {
                  reply += data.text;
                  setMessages((prev) => {
                    if (!placeholderAdded) {
                      placeholderAdded = true;
                      return [...prev, { id: assistantId, who: 'JARVIS', time: nowTime(), lines: [reply] }];
                    }
                    return prev.map((m) => m.id === assistantId ? { ...m, lines: [reply] } : m);
                  });
                } else if (data.type === 'done') {
                  const finalReply = data.reply || reply;
                  setMessages((prev) => {
                    const mapped = prev.map((m) => m.id === assistantId ? {
                      ...m,
                      lines: [finalReply],
                      approval: data.approvalRequired ? data.approval : null,
                      browserChallenge: data.code === 'HUMAN_ACTION_REQUIRED' ? data : null
                    } : m);
                    if (!placeholderAdded) {
                      return [...mapped, {
                        id: assistantId,
                        who: 'JARVIS',
                        time: nowTime(),
                        lines: [finalReply],
                        approval: data.approvalRequired ? data.approval : null,
                        browserChallenge: data.code === 'HUMAN_ACTION_REQUIRED' ? data : null
                      }];
                    }
                    return mapped;
                  });

                  if (speechEnabled && finalReply) {
                    void speakReply(finalReply);
                  }
                }
              } catch {}
            }
          }
        }
      } else {
        const data = await response.json().catch(() => ({}));
        const finalReply = data.reply || data.error || 'Done';
        setMessages((prev) => [...prev, {
          id: assistantId,
          who: 'JARVIS',
          time: nowTime(),
          lines: [finalReply],
          approval: data.approvalRequired ? data.approval : null
        }]);
        if (speechEnabled) void speakReply(finalReply);
      }
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: assistantId,
        who: 'JARVIS',
        time: nowTime(),
        lines: [`Connection error: ${err.message}`]
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="jarvis-island-page">
      <div className={`jarvis-island-container ${expanded ? 'expanded' : 'compact'}`}>
        {/* Island Top Bar */}
        <div className="island-top-bar">
          {/* Animated Voice Orb */}
          <div
            className="island-orb-wrap"
            onClick={toggleVoice}
            title={`Voice state: ${voiceState} (Click or Alt+Space to toggle)`}
          >
            <div className={`island-orb ${voiceState}`} />
            <div className="island-orb-ring" />
          </div>

          {/* Clock Pill */}
          <div className="island-clock" title="Current time">
            {currentTimeStr}
          </div>

          {/* Prompt Input Form */}
          <form className="island-input-wrap" onSubmit={sendMessage}>
            <input
              ref={inputRef}
              className="island-input"
              type="text"
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isTyping ? 'JARVIS is thinking...' : 'Ask JARVIS... (Alt+Space for mic)'}
            />
          </form>

          {/* Quick Action Icons */}
          <div className="island-actions">
            <button
              type="button"
              className={`island-icon-btn ${voiceState === 'capturing' ? 'active' : ''}`}
              onClick={toggleVoice}
              title="Push-to-Talk (Alt+Space)"
            >
              <Icon name="voice" />
            </button>

            <button
              type="button"
              className={`island-icon-btn ${!speechEnabled ? 'active' : ''}`}
              onClick={toggleSpeech}
              title={speechEnabled ? 'Mute Speech' : 'Enable Speech'}
            >
              <Icon name={speechEnabled ? 'speaker' : 'speakerOff'} />
            </button>

            <button
              type="button"
              className="island-icon-btn"
              onClick={() => setExpanded(!expanded)}
              title={expanded ? 'Collapse Island' : 'Expand Island'}
            >
              <Icon name={expanded ? 'newTask' : 'chat'} />
            </button>

            <button
              type="button"
              className="island-icon-btn"
              onClick={closeIsland}
              title="Close (Esc)"
            >
              <Icon name="x" />
            </button>
          </div>
        </div>

        {/* Expanded Conversation / Approvals / Challenges Area */}
        {expanded && (
          <div className="island-content" ref={contentRef}>
            {/* Active Ringing Reminders Alert */}
            {ringingReminders.length > 0 && (
              <div className="island-card-block island-ringing-card">
                <div className="island-ringing-header">
                  <Icon name="bell" />
                  <span>{ringingReminders[0].category ? ringingReminders[0].category.toUpperCase() : 'ALERT'} RINGING</span>
                </div>
                <div className="island-ringing-title">{ringingReminders[0].title}</div>
                <div className="island-ringing-actions">
                  <button
                    type="button"
                    className="island-btn-resume island-btn-dismiss"
                    onClick={() => handleDismissReminder(ringingReminders[0].id)}
                  >
                    <Icon name="check" /> Dismiss
                  </button>
                  <button
                    type="button"
                    className="island-btn-resume island-btn-snooze"
                    onClick={() => handleSnoozeReminder(ringingReminders[0].id, 10)}
                  >
                    <Icon name="clock" /> Snooze 10m
                  </button>
                </div>
              </div>
            )}

            {messages.length === 0 && !isTyping && activeApprovals.length === 0 && !pendingBrowserChallenge && ringingReminders.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--island-subtext)', padding: '16px 0', fontSize: '12px' }}>
                Type a prompt above or press <kbd style={{ padding: '2px 4px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px' }}>Alt+Space</kbd> to speak.
              </div>
            )}

            {messages.map((m, idx) => (
              <div key={m.id || idx} className={`island-msg ${m.who === 'YOU' ? 'user' : 'jarvis'}`}>
                <div className="island-msg-bubble">
                  {m.who === 'JARVIS' && (
                    <div className="island-msg-header">
                      <span className="island-msg-author">JARVIS</span>
                      <button
                        type="button"
                        className="island-speak-btn"
                        onClick={() => speakReply(m.lines.join(' '))}
                        title="Replay Voice"
                      >
                        <Icon name="speaker" />
                      </button>
                    </div>
                  )}
                  {m.lines.map((l, lineIdx) => (
                    <div key={lineIdx}>{l}</div>
                  ))}

                  {/* Inline Pending Browser Challenge */}
                  {(m.browserChallenge || (pendingBrowserChallenge && idx === messages.length - 1 && m.who === 'JARVIS')) && (
                    <div className="island-card-block island-challenge-card">
                      <div className="island-challenge-header">
                        <Icon name="shield" />
                        <span>Human Verification Required</span>
                      </div>
                      <div>{m.browserChallenge?.reason || pendingBrowserChallenge?.reason || 'CAPTCHA / Cloudflare in Firefox'}</div>
                      <button
                        type="button"
                        className="island-btn-resume"
                        disabled={resumingBrowser}
                        onClick={() => handleResumeBrowser(m.browserChallenge || pendingBrowserChallenge, m.id)}
                      >
                        <Icon name="check" />
                        {resumingBrowser ? 'Resuming...' : 'Challenge Solved — Resume'}
                      </button>
                    </div>
                  )}

                  {/* Inline Approval Action */}
                  {(m.approval || (activeApprovals.length > 0 && idx === messages.length - 1 && m.who === 'JARVIS' && !m.approvalResolved)) && (() => {
                    const currentApproval = m.approval || activeApprovals[0];
                    const isResolving = resolvingApprovalId === currentApproval.id;
                    return (
                      <div className="island-card-block island-approval-card">
                        <div className="island-approval-header">
                          <Icon name="shield" />
                          <span>Action Approval Required</span>
                        </div>
                        <div><strong>{currentApproval.title || `Approve ${currentApproval.toolName}`}</strong></div>
                        {currentApproval.sub && <div style={{ opacity: 0.8 }}>{currentApproval.sub}</div>}
                        <div className="island-approval-actions">
                          <button
                            type="button"
                            className="island-btn-approve"
                            disabled={isResolving}
                            onClick={() => handleResolveApproval(currentApproval, 'approved', m.id)}
                          >
                            <Icon name="check" />
                            {isResolving ? 'Executing...' : 'Approve Once'}
                          </button>
                          <button
                            type="button"
                            className="island-btn-deny"
                            disabled={isResolving}
                            onClick={() => handleResolveApproval(currentApproval, 'rejected', m.id)}
                          >
                            <Icon name="x" />
                            Deny
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {m.approvalResolved && (
                    <div className={`island-status-pill ${m.approvalResolved === 'approved' ? 'approved' : 'denied'}`}>
                      <Icon name={m.approvalResolved === 'approved' ? 'check' : 'x'} />
                      <span>{m.approvalResolved === 'approved' ? 'Approved & Executed' : 'Denied & Cancelled'}</span>
                    </div>
                  )}

                  {m.browserResolved && (
                    <div className="island-status-pill approved">
                      <Icon name="check" />
                      <span>Browser challenge resolved</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="island-msg jarvis">
                <div className="island-msg-bubble">
                  <div className="island-msg-header">
                    <span className="island-msg-author">JARVIS</span>
                  </div>
                  <div className="island-typing">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
