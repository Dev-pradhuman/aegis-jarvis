#!/usr/bin/env python3

with open('server/platform/linux/input.js', 'r') as f:
    content = f.read()

exports = """
    type: (text) => {
      if (typeof text !== 'string' || text.length > 500) throw new Error('Text must contain at most 500 characters');
      if (/[\\u0000-\\u001f\\u007f]/u.test(text)) throw new Error('Use computer.keypress for Enter, Tab, and other control keys');
      return request('type', { text });
    },
    pointerMove: (x, y) => request('pointer_move', { x, y }),
    pointerClick: (button = 1) => request('pointer_click', { button }),
    pointerScroll: (dx, dy) => request('pointer_scroll', { dx, dy }),
    close: stop,
  };
"""

content = content.replace("""
    type: (text) => {
      if (typeof text !== 'string' || text.length > 500) throw new Error('Text must contain at most 500 characters');
      if (/[\\u0000-\\u001f\\u007f]/u.test(text)) throw new Error('Use computer.keypress for Enter, Tab, and other control keys');
      return request('type', { text });
    },
    close: stop,
  };
""", exports)

with open('server/platform/linux/input.js', 'w') as f:
    f.write(content)
