#!/usr/bin/env python3
"""Request a desktop screenshot through the user-consented XDG portal."""

import json
import sys
import uuid

import dbus
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib


def main():
    DBusGMainLoop(set_as_default=True)
    bus = dbus.SessionBus()
    desktop = bus.get_object('org.freedesktop.portal.Desktop', '/org/freedesktop/portal/desktop')
    screenshot = dbus.Interface(desktop, 'org.freedesktop.portal.Screenshot')
    loop = GLib.MainLoop()
    token = 'jarvis_' + uuid.uuid4().hex
    result = {}
    expected_path = None

    def on_response(code, details, path=None):
        if expected_path is not None and path != expected_path:
            return
        result['code'] = int(code)
        result['uri'] = str(details.get('uri', ''))
        loop.quit()

    bus.add_signal_receiver(
        on_response,
        signal_name='Response',
        dbus_interface='org.freedesktop.portal.Request',
        path_keyword='path',
    )
    try:
        expected_path = str(screenshot.Screenshot('', {
            'handle_token': dbus.String(token),
            'interactive': dbus.Boolean(False),
        }))
        GLib.timeout_add_seconds(45, lambda: (loop.quit(), False)[1])
        if not result:
            loop.run()
        if not result:
            raise RuntimeError('Screenshot portal did not respond')
        if result['code'] != 0:
            print(json.dumps({'ok': False, 'code': 'SCREEN_PERMISSION_REQUIRED', 'response': result['code']}))
            return
        if not result['uri'].startswith('file://'):
            raise RuntimeError('Screenshot portal returned no local image URI')
        print(json.dumps({'ok': True, 'uri': result['uri']}))
    finally:
        bus.remove_signal_receiver(on_response, signal_name='Response', dbus_interface='org.freedesktop.portal.Request')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({'ok': False, 'code': 'SCREEN_CAPTURE_FAILED', 'message': str(exc)}))
        sys.exit(1)
