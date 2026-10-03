#!/usr/bin/env python3
import sys

with open('src/components/WorkspaceViews.jsx', 'r') as f:
    content = f.read()

# We need to replace `function CredentialsPanel() { ... }` with a new version.
# First, locate the function start and end.
start_idx = content.find("function CredentialsPanel() {")
if start_idx == -1:
    print("CredentialsPanel not found")
    sys.exit(1)

# Find the end of the function. The next top-level function is ComposioPanel.
end_idx = content.find("function ComposioPanel() {")
if end_idx == -1:
    print("ComposioPanel not found")
    sys.exit(1)

old_component = content[start_idx:end_idx]

new_component = """function CredentialsPanel() {
  const fields = ['GROQ_STT_MODEL', 'GROQ_TTS_MODEL', 'GROQ_TTS_VOICE', 'GEMINI_IMAGE_MODEL', 'GEMINI_VIDEO_MODEL', 'TTS_PROVIDER', 'COMPOSIO_API_KEY', 'COMPOSIO_USER_ID', 'COMPOSIO_AUTH_CONFIGS', 'SLACK_BOT_TOKEN', 'SLACK_CHANNEL_ID', 'SLACK_WEBHOOK_URL', 'SEARCH_PROVIDER_URL', 'CALENDAR_API_URL', 'MESSAGING_API_URL', 'HARDWARE_ENDPOINT', 'JARVIS_AUTH_TOKEN'];
  const providerPrefixes = ['GROQ', 'GEMINI', 'OPENROUTER', 'OPENCODE_ZEN', 'NINEROUTER', 'CUSTOM', 'MODEL'];
  
  // Create an extensive list of all possible fields including dynamic API key slots
  const allFields = [...fields];
  providerPrefixes.forEach(prefix => {
    allFields.push(`${prefix}_API_KEY`);
    for (let i = 1; i <= 12; i++) allFields.push(`${prefix}_API_KEY_${i}`);
  });

  const [values, setValues] = useState({});
  const [status, setStatus] = useState({});
  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => {
    fetch('/api/config')
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (data) {
          setStatus(data);
          // Initialize empty string for all keys present in data
          const initValues = {};
          Object.keys(data).forEach(k => initValues[k] = '');
          setValues(initValues);
        }
      })
      .catch(() => {});
  }, []);

  async function save() {
    const payload = Object.fromEntries(Object.entries(values).filter(([, value]) => value));
    const response = await fetch('/api/config', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    if (response.ok) {
      const data = await response.json();
      setStatus(data);
      const resetValues = {};
      Object.keys(data).forEach(k => resetValues[k] = '');
      setValues(resetValues);
    }
  }
  
  // Group configs for the card layout
  const cards = [
    { title: 'GROQ', type: 'API Key', baseKey: 'GROQ_API_KEY' },
    { title: 'GEMINI', type: 'API Key', baseKey: 'GEMINI_API_KEY' },
    { title: 'COMPOSIO', type: 'API Key', baseKey: 'COMPOSIO_API_KEY', single: true },
    { title: 'SEARCH PROVIDER URL', type: 'URL', baseKey: 'SEARCH_PROVIDER_URL', single: true },
    { title: 'JARVIS AUTH TOKEN', type: 'Token', baseKey: 'JARVIS_AUTH_TOKEN', single: true },
    { title: 'OPENROUTER', type: 'API Key', baseKey: 'OPENROUTER_API_KEY' },
    { title: 'OPENCODE ZEN', type: 'API Key', baseKey: 'OPENCODE_ZEN_API_KEY' },
    { title: 'NINEROUTER', type: 'API Key', baseKey: 'NINEROUTER_API_KEY' },
    { title: 'CUSTOM MODEL', type: 'API Key', baseKey: 'MODEL_API_KEY', max: 12 },
  ];
  
  const getKeysForGroup = (baseKey, single, max = 4) => {
    if (single) return [baseKey];
    const keys = [baseKey];
    for (let i = 1; i <= max; i++) keys.push(`${baseKey}_${i}`);
    return keys;
  };

  const activeInputCount = (keys, groupTitle) => {
    const count = keys.filter(k => status[k]?.configured || values[k]).length;
    const expanded = expandedGroups[groupTitle] || 1;
    return Math.max(1, count, expanded);
  };

  const addInput = (groupTitle) => {
    setExpandedGroups(curr => ({ ...curr, [groupTitle]: (curr[groupTitle] || 1) + 1 }));
  };

  return (
    <section className="workspace-panel settings-section full">
      <div className="panel-label">Environment credentials</div>
      <p className="setting-help">Use the Brain Tab for model providers and any number of API keys. These other Integration values are written to the server only credentials file. Leave a field blank to keep its existing value.</p>
      
      <div className="api-cards-grid">
        {cards.map(card => {
          const keys = getKeysForGroup(card.baseKey, card.single, card.max);
          const showCount = activeInputCount(keys, card.title);
          const visibleKeys = keys.slice(0, showCount);
          const canAdd = !card.single && showCount < keys.length;

          return (
            <div key={card.title} className="api-card">
              <div className="api-card-header">
                <h3>{card.title}</h3>
                <span className="api-type">{card.type}</span>
              </div>
              <div className="api-card-inputs">
                {visibleKeys.map(key => (
                  <input
                    key={key}
                    type={key.includes('KEY') || key.includes('TOKEN') ? 'password' : 'text'}
                    value={values[key] || ''}
                    onChange={(event) => setValues(curr => ({ ...curr, [key]: event.target.value }))}
                    placeholder={status[key]?.configured ? 'Configured · enter to replace' : 'Not configured'}
                  />
                ))}
              </div>
              {canAdd && (
                <button className="api-card-add" onClick={() => addInput(card.title)}>+</button>
              )}
            </div>
          );
        })}
      </div>
      <div className="api-save-row">
        <button className="secondary-action" onClick={save}>SAVE CREDENTIALS</button>
      </div>
    </section>
  );
}
"""

content = content.replace(old_component, new_component)

with open('src/components/WorkspaceViews.jsx', 'w') as f:
    f.write(content)

