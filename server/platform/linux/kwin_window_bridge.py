#!/usr/bin/env python3
"""One-shot, bounded KWin script request over the current user's session bus."""

import json
import os
import sys
import uuid

import dbus
import dbus.service
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib


SERVICE = 'org.aegis.Jarvis.WindowBridge'
PATH = '/org/aegis/Jarvis/WindowBridge'
IFACE = 'org.aegis.Jarvis.WindowBridge'


class Bridge(dbus.service.Object):
    def __init__(self, bus, command, loop):
        super().__init__(bus, PATH)
        self.command = command
        self.loop = loop
        self.result = None

    @dbus.service.method(IFACE, in_signature='', out_signature='s')
    def GetCommand(self):
        return json.dumps(self.command)

    @dbus.service.method(IFACE, in_signature='s', out_signature='')
    def Report(self, value):
        try:
            result = json.loads(value)
            if isinstance(result, dict) and result.get('requestId') == self.command['requestId']:
                self.result = result
                self.loop.quit()
        except ValueError:
            pass


def main():
    command = json.loads(sys.argv[1])
    if command.get('action') not in ('list', 'active', 'focus', 'minimize', 'maximize', 'restore', 'close'):
        raise ValueError('Unsupported window action')
    if command['action'] not in ('list', 'active') and not isinstance(command.get('windowId'), str):
        raise ValueError('Window ID is required')
    command['requestId'] = uuid.uuid4().hex
    DBusGMainLoop(set_as_default=True)
    bus = dbus.SessionBus()
    name = dbus.service.BusName(SERVICE, bus=bus, do_not_queue=True)
    loop = GLib.MainLoop()
    bridge = Bridge(bus, command, loop)
    scripting = dbus.Interface(bus.get_object('org.kde.KWin', '/Scripting'), 'org.kde.kwin.Scripting')
    script_path = os.path.join(os.path.dirname(__file__), 'kwin_window_action.js')
    plugin = 'jarvis_window_' + command['requestId']
    script_id = None
    timeout_id = None
    try:
        script_id = int(scripting.loadScript(script_path, plugin, signature='ss'))
        script = dbus.Interface(bus.get_object('org.kde.KWin', '/Scripting/Script' + str(script_id)), 'org.kde.kwin.Script')
        script.run()
        def timed_out():
            nonlocal timeout_id
            timeout_id = None
            loop.quit()
            return False

        timeout_id = GLib.timeout_add_seconds(3, timed_out)
        loop.run()
        print(json.dumps(bridge.result or {'ok': False, 'code': 'WINDOW_BACKEND_TIMEOUT', 'message': 'KWin script did not respond'}))
    finally:
        if timeout_id is not None:
            try:
                GLib.source_remove(timeout_id)
            except ValueError:
                pass
        if script_id is not None:
            scripting.unloadScript(plugin)
        bridge.remove_from_connection()
        del name


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'ok': False, 'code': 'WINDOW_BACKEND_UNAVAILABLE', 'message': str(error)}))
        sys.exit(1)
