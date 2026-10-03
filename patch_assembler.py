#!/usr/bin/env python3

with open('server/contextAssembler.js', 'r') as f:
    content = f.read()

loop_instruction = """
  if (includeTools) {
    const hasPointer = filtered.tools.some(t => t.id === 'pointer.move');
    const capabilities = capabilityMessage(filtered.tools);
    if (capabilities) {
      let content = capabilities;
      if (hasPointer) {
        content += "\\n\\nCOMPUTER-USE INSTRUCTION: You are driving the user's desktop. Implement a strict grounded loop: Observe (screen.describe / locate) -> Plan short action -> Execute (pointer / keypress) -> Observe again -> Verify.";
      }
      candidates.push({ role: 'system', content });
    }
  }
"""

content = content.replace("""
  if (includeTools) {
    const capabilities = capabilityMessage(filtered.tools);
    if (capabilities) candidates.push({ role: 'system', content: capabilities });
  }
""", loop_instruction)

with open('server/contextAssembler.js', 'w') as f:
    f.write(content)
