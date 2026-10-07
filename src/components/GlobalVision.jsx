import { useEffect, useState } from 'react';
import '../styles/vision.css';

export default function GlobalVision() {
  const [status, setStatus] = useState({
    enabled: true,
    looking: false,
    watching: false,
    lastCapture: null,
    settings: {
      enabled: true,
      blocklist: ['1password', 'bitwarden', 'keepass', 'bank', 'auth'],
      maxDimension: 1024
    }
  });

  const [showSettings, setShowSettings] = useState(false);
  const [settingsForm, setSettingsForm] = useState({
    enabled: true,
    blocklist: '1password, bitwarden, keepass, bank, auth',
    maxDimension: 1024
  });

  const [consentDialog, setConsentDialog] = useState(null); // { target: 'screen'|'camera', rememberSession: false, onResolve: fn, onReject: fn }

  // Poll vision status every 1.5s
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/vision/status');
        if (!res.ok) return;
        const data = await res.json();
        if (active) {
          setStatus(data);
          if (data.settings) {
            setSettingsForm(prev => ({
              ...prev,
              enabled: data.settings.enabled ?? true,
              blocklist: Array.isArray(data.settings.blocklist) ? data.settings.blocklist.join(', ') : prev.blocklist,
              maxDimension: data.settings.maxDimension ?? 1024
            }));
          }
        }
      } catch {}
    };

    poll();
    const interval = setInterval(poll, 1500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Listen for consent requests from other UI actions
  useEffect(() => {
    const handleConsentRequest = (event) => {
      const { target = 'screen', onAllow, onDeny } = event.detail || {};
      setConsentDialog({
        target,
        rememberSession: false,
        onResolve: (remember) => {
          if (onAllow) onAllow(remember);
          setConsentDialog(null);
        },
        onReject: () => {
          if (onDeny) onDeny();
          setConsentDialog(null);
        }
      });
    };

    window.addEventListener('jarvis:request_capture_consent', handleConsentRequest);
    return () => window.removeEventListener('jarvis:request_capture_consent', handleConsentRequest);
  }, []);

  const handleClearLastCapture = async () => {
    try {
      await fetch('/api/vision/clear', { method: 'POST' });
      setStatus(prev => ({ ...prev, lastCapture: null }));
    } catch {}
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      const blocklistArray = settingsForm.blocklist
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const res = await fetch('/api/vision/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: Boolean(settingsForm.enabled),
          blocklist: blocklistArray,
          maxDimension: Number(settingsForm.maxDimension)
        })
      });

      if (res.ok) {
        const updated = await res.json();
        setStatus(prev => ({ ...prev, settings: updated }));
        setShowSettings(false);
      }
    } catch {}
  };

  const handleConsentResponse = async (approved) => {
    if (!consentDialog) return;
    if (approved) {
      try {
        await fetch('/api/vision/consent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target: consentDialog.target,
            rememberSession: consentDialog.target === 'screen' ? consentDialog.rememberSession : false
          })
        });
      } catch {}
      consentDialog.onResolve(consentDialog.rememberSession);
    } else {
      consentDialog.onReject();
    }
  };

  const formatAge = (ageMs) => {
    if (!ageMs || ageMs < 2000) return 'Just now';
    const sec = Math.round(ageMs / 1000);
    return `${sec}s ago`;
  };

  return (
    <>
      <div className="vision-overlay-container" data-testid="vision-overlay">
        <div className="vision-indicators">
          {status.looking && (
            <div className="vision-badge looking" data-testid="vision-looking-badge">
              <span className="vision-pulse-dot"></span>
              <span>LOOKING</span>
            </div>
          )}
          {status.watching && (
            <div className="vision-badge watching" data-testid="vision-watching-badge">
              <span className="vision-pulse-dot"></span>
              <span>WATCHING</span>
            </div>
          )}
          <button
            className="vision-btn-gear"
            onClick={() => setShowSettings(true)}
            title="Vision Settings"
            data-testid="vision-settings-btn"
          >
            👁 VISION
          </button>
        </div>

        {status.lastCapture && (
          <div className="vision-thumbnail-card" data-testid="vision-thumbnail-card">
            <button
              className="vision-thumbnail-close"
              onClick={handleClearLastCapture}
              title="Clear preview"
              data-testid="vision-clear-btn"
            >
              ×
            </button>
            <img
              src={status.lastCapture.dataUrl}
              alt="Jarvis visual input"
              className="vision-thumbnail-img"
              data-testid="vision-thumbnail-img"
            />
            <div className="vision-thumbnail-meta">
              <span style={{ textTransform: 'capitalize' }}>{status.lastCapture.source}</span>
              <span>{formatAge(status.lastCapture.ageMs)}</span>
            </div>
          </div>
        )}
      </div>

      {showSettings && (
        <div className="vision-modal-backdrop" data-testid="vision-settings-modal">
          <div className="vision-modal-card">
            <h2 className="vision-modal-title">Vision Perception Settings</h2>
            <form onSubmit={handleSaveSettings}>
              <div className="vision-modal-field">
                <label className="vision-modal-checkbox">
                  <input
                    type="checkbox"
                    checked={settingsForm.enabled}
                    onChange={(e) => setSettingsForm(prev => ({ ...prev, enabled: e.target.checked }))}
                    data-testid="vision-toggle-enabled"
                  />
                  <span>Enable Local Vision Perception</span>
                </label>
              </div>

              <div className="vision-modal-field">
                <label htmlFor="vision-blocklist-input">Sensitive Window Blocklist</label>
                <textarea
                  id="vision-blocklist-input"
                  rows={3}
                  value={settingsForm.blocklist}
                  onChange={(e) => setSettingsForm(prev => ({ ...prev, blocklist: e.target.value }))}
                  placeholder="e.g. 1password, bitwarden, bank, auth"
                  data-testid="vision-blocklist-input"
                />
              </div>

              <div className="vision-modal-field">
                <label htmlFor="vision-max-dimension">Max Image Dimension</label>
                <select
                  id="vision-max-dimension"
                  value={settingsForm.maxDimension}
                  onChange={(e) => setSettingsForm(prev => ({ ...prev, maxDimension: Number(e.target.value) }))}
                  data-testid="vision-dimension-select"
                >
                  <option value={512}>512 px (Fast / Low RAM)</option>
                  <option value={1024}>1024 px (Balanced standard)</option>
                  <option value={1536}>1536 px (High detail)</option>
                  <option value={2048}>2048 px (Full detail)</option>
                </select>
              </div>

              <div className="vision-modal-actions">
                <button
                  type="button"
                  className="vision-btn secondary"
                  onClick={() => setShowSettings(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="vision-btn primary"
                  data-testid="vision-save-settings-btn"
                >
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {consentDialog && (
        <div className="vision-modal-backdrop" data-testid="vision-consent-modal">
          <div className="vision-modal-card">
            <h2 className="vision-modal-title">
              Allow Jarvis to capture {consentDialog.target === 'screen' ? 'Screen' : 'Camera'}?
            </h2>
            <div className="vision-modal-body">
              Jarvis is requesting permission to capture your {consentDialog.target === 'screen' ? 'screen' : 'camera view'} for local perception analysis.
              Images are processed strictly on this machine and never sent off-device or stored to disk.
            </div>

            {consentDialog.target === 'screen' ? (
              <label className="vision-modal-checkbox">
                <input
                  type="checkbox"
                  checked={consentDialog.rememberSession}
                  onChange={(e) => setConsentDialog(prev => ({ ...prev, rememberSession: e.target.checked }))}
                  data-testid="vision-remember-session"
                />
                <span>Remember for this session</span>
              </label>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--orange, #f97316)', marginTop: 8 }}>
                Camera access requires explicit authorization every time.
              </div>
            )}

            <div className="vision-modal-actions">
              <button
                type="button"
                className="vision-btn secondary"
                onClick={() => handleConsentResponse(false)}
                data-testid="vision-consent-deny"
              >
                Deny
              </button>
              <button
                type="button"
                className="vision-btn primary"
                onClick={() => handleConsentResponse(true)}
                data-testid="vision-consent-allow"
              >
                Allow
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
