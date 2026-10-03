#!/usr/bin/env python3
import sys

with open('src/components/WorkspaceViews.jsx', 'r') as f:
    content = f.read()

# Locate the card rendering block
start_str = "return (\n            <div key={card.title} className=\"api-card\">"
end_str = "</div>\n              {canAdd && ("

start_idx = content.find(start_str)
end_idx = content.find(end_str)

if start_idx == -1 or end_idx == -1:
    print("Render block not found")
    sys.exit(1)

new_render = """return (
            <div key={card.title} className="api-card">
              <div className="api-card-header">
                <h3>{card.title}</h3>
                <span className="api-type">{card.type}</span>
              </div>
              {card.desc && <p className="api-desc">{card.desc}</p>}
              <div className="api-card-inputs">"""

content = content[:start_idx] + new_render + content[end_idx:]

with open('src/components/WorkspaceViews.jsx', 'w') as f:
    f.write(content)

print("Patch applied")
