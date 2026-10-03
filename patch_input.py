#!/usr/bin/env python3
import sys

with open('server/platform/linux/portal_input.py', 'r') as f:
    content = f.read()

content = content.replace("options['types'] = dbus.UInt32(1)", "options['types'] = dbus.UInt32(7)") # Keyboard | Pointer | Touchscreen

methods = """
    def type_text(self, value):
        if not self.devices & 1:
            raise PermissionError('Keyboard access was not granted')
        if any(ord(char) < 32 or ord(char) == 127 for char in value):
            raise ValueError('Control keys must use the keypress action')
        for char in value:
            codepoint = ord(char)
            symbol = codepoint if codepoint < 256 else 0x01000000 | codepoint
            self.keypress([symbol])

    def pointer_motion_absolute(self, x, y):
        if not self.devices & 2:
            raise PermissionError('Pointer access was not granted')
        self.remote.NotifyPointerMotionAbsolute(dbus.ObjectPath(self.session), {}, dbus.UInt32(0), dbus.Double(x), dbus.Double(y))

    def pointer_button(self, button, state):
        if not self.devices & 2:
            raise PermissionError('Pointer access was not granted')
        # button: 1=left, 2=middle, 3=right
        # Linux standard is BTN_LEFT (0x110) which is 272.
        # So button=1 is 272, 2 is 274, 3 is 273.
        # But wait, XDG Remote Desktop says button is linux evdev code.
        # BTN_LEFT = 272, BTN_RIGHT = 273, BTN_MIDDLE = 274.
        evdev_btn = 272 if button == 1 else 273 if button == 3 else 274
        self.remote.NotifyPointerButton(dbus.ObjectPath(self.session), {}, dbus.Int32(evdev_btn), dbus.UInt32(state))

    def pointer_axis(self, dx, dy):
        if not self.devices & 2:
            raise PermissionError('Pointer access was not granted')
        # NotifyPointerAxis(object_path session_handle, a{sv} options, d dx, d dy)
        self.remote.NotifyPointerAxisDiscrete(dbus.ObjectPath(self.session), {}, dbus.UInt32(0), dbus.Int32(dx))
        self.remote.NotifyPointerAxisDiscrete(dbus.ObjectPath(self.session), {}, dbus.UInt32(1), dbus.Int32(dy))
"""
content = content.replace("""
    def type_text(self, value):
        if not self.devices & 1:
            raise PermissionError('Keyboard access was not granted')
        if any(ord(char) < 32 or ord(char) == 127 for char in value):
            raise ValueError('Control keys must use the keypress action')
        for char in value:
            codepoint = ord(char)
            symbol = codepoint if codepoint < 256 else 0x01000000 | codepoint
            self.keypress([symbol])
""", methods)


main_loop = """
                    value = request.get('text')
                    if not isinstance(value, str) or not value or len(value) > 500:
                        raise ValueError('Text must contain 1 to 500 characters')
                    portal.type_text(value)
                    emit({'id': request.get('id'), 'ok': True, 'devices': devices, 'sent': len(value)})
            elif action in ('pointer_move', 'pointer_click', 'pointer_scroll'):
                devices = portal.start()
                if action == 'pointer_move':
                    x = request.get('x')
                    y = request.get('y')
                    portal.pointer_motion_absolute(x, y)
                    emit({'id': request.get('id'), 'ok': True, 'devices': devices, 'sent': 1})
                elif action == 'pointer_click':
                    button = request.get('button', 1)
                    portal.pointer_button(button, 1) # press
                    portal.pointer_button(button, 0) # release
                    emit({'id': request.get('id'), 'ok': True, 'devices': devices, 'sent': 1})
                elif action == 'pointer_scroll':
                    dx = request.get('dx', 0)
                    dy = request.get('dy', 0)
                    if dx != 0: portal.remote.NotifyPointerAxisDiscrete(dbus.ObjectPath(portal.session), {}, dbus.UInt32(1), dbus.Int32(dx))
                    if dy != 0: portal.remote.NotifyPointerAxisDiscrete(dbus.ObjectPath(portal.session), {}, dbus.UInt32(0), dbus.Int32(dy))
                    emit({'id': request.get('id'), 'ok': True, 'devices': devices, 'sent': 1})
"""

content = content.replace("""
                    value = request.get('text')
                    if not isinstance(value, str) or not value or len(value) > 500:
                        raise ValueError('Text must contain 1 to 500 characters')
                    portal.type_text(value)
                    emit({'id': request.get('id'), 'ok': True, 'devices': devices, 'sent': len(value)})
""", main_loop)

with open('server/platform/linux/portal_input.py', 'w') as f:
    f.write(content)
