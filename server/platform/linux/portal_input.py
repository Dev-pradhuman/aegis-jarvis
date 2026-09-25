#!/usr/bin/env python3
"""Consent-based desktop input over one XDG RemoteDesktop portal session."""

import json
import sys
import uuid

import dbus
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib


class PortalInput:
    def __init__(self):
        DBusGMainLoop(set_as_default=True)
        self.bus = dbus.SessionBus()
        desktop = self.bus.get_object('org.freedesktop.portal.Desktop', '/org/freedesktop/portal/desktop')
        self.remote = dbus.Interface(desktop, 'org.freedesktop.portal.RemoteDesktop')
        self.session = None
        self.devices = 0

    def request(self, method, *args):
        token = 'jarvis_' + uuid.uuid4().hex
        response = {}
        loop = GLib.MainLoop()

        def received(code, details, path=None):
            if not str(path or '').endswith('/' + token):
                return
            response['code'] = int(code)
            response['details'] = details
            loop.quit()

        self.bus.add_signal_receiver(received, signal_name='Response', dbus_interface='org.freedesktop.portal.Request', path_keyword='path')
        timeout_source = None

        def timed_out():
            nonlocal timeout_source
            timeout_source = None
            loop.quit()
            return False

        try:
            options = {'handle_token': dbus.String(token)}
            if method == 'CreateSession':
                options['session_handle_token'] = dbus.String('jarvis_' + uuid.uuid4().hex)
                getattr(self.remote, method)(options)
            elif method == 'SelectDevices':
                options['types'] = dbus.UInt32(1)
                getattr(self.remote, method)(dbus.ObjectPath(self.session), options)
            else:
                getattr(self.remote, method)(dbus.ObjectPath(self.session), '', options)
            if not response:
                timeout_source = GLib.timeout_add_seconds(45, timed_out)
                loop.run()
            if not response:
                raise RuntimeError('Desktop input portal did not respond')
            if response['code'] != 0:
                raise PermissionError('Desktop input permission was denied or cancelled')
            return response['details']
        finally:
            if timeout_source is not None:
                GLib.source_remove(timeout_source)
            self.bus.remove_signal_receiver(received, signal_name='Response', dbus_interface='org.freedesktop.portal.Request')

    def start(self):
        if self.session:
            return self.devices
        created = self.request('CreateSession')
        self.session = str(created['session_handle'])
        try:
            self.request('SelectDevices')
            started = self.request('Start')
            self.devices = int(started.get('devices', 0))
            if not self.devices:
                raise PermissionError('No desktop input devices were granted')
            return self.devices
        except Exception:
            self.close()
            raise

    def close(self):
        if self.session:
            try:
                session = self.bus.get_object('org.freedesktop.portal.Desktop', self.session)
                dbus.Interface(session, 'org.freedesktop.portal.Session').Close()
            except dbus.DBusException:
                pass
        self.session = None
        self.devices = 0

    def notify_key(self, keysym, pressed):
        self.remote.NotifyKeyboardKeysym(dbus.ObjectPath(self.session), {}, dbus.Int32(keysym), dbus.UInt32(1 if pressed else 0))

    def keypress(self, symbols):
        if not self.devices & 1:
            raise PermissionError('Keyboard access was not granted')
        pressed = []
        try:
            for symbol in symbols:
                self.notify_key(symbol, True)
                pressed.append(symbol)
        finally:
            for symbol in reversed(pressed):
                try:
                    self.notify_key(symbol, False)
                except dbus.DBusException:
                    pass

    def type_text(self, value):
        if not self.devices & 1:
            raise PermissionError('Keyboard access was not granted')
        if any(ord(char) < 32 or ord(char) == 127 for char in value):
            raise ValueError('Control keys must use the keypress action')
        for char in value:
            codepoint = ord(char)
            symbol = codepoint if codepoint < 256 else 0x01000000 | codepoint
            self.keypress([symbol])


def emit(value):
    print(json.dumps(value), flush=True)


def main():
    portal = PortalInput()
    loop = GLib.MainLoop()

    def on_stdin(_source, condition):
        if condition & GLib.IO_HUP:
            portal.close()
            loop.quit()
            return False
        line = sys.stdin.readline()
        if not line:
            portal.close()
            loop.quit()
            return False
        request = {}
        try:
            request = json.loads(line)
            action = request.get('action')
            if action == 'close':
                portal.close()
                emit({'id': request.get('id'), 'ok': True, 'devices': 0})
            elif action in ('keypress', 'type'):
                devices = portal.start()
                if action == 'keypress':
                    symbols = request.get('symbols')
                    if not isinstance(symbols, list) or not symbols or len(symbols) > 5 or any(type(item) is not int or item < 0 or item > 0x0110ffff for item in symbols):
                        raise ValueError('Invalid keyboard symbol sequence')
                    portal.keypress(symbols)
                    emit({'id': request.get('id'), 'ok': True, 'devices': devices, 'sent': len(symbols)})
                else:
                    value = request.get('text')
                    if not isinstance(value, str) or not value or len(value) > 500:
                        raise ValueError('Text must contain 1 to 500 characters')
                    portal.type_text(value)
                    emit({'id': request.get('id'), 'ok': True, 'devices': devices, 'sent': len(value)})
            else:
                raise ValueError('Unsupported input action')
        except PermissionError as exc:
            emit({'id': request.get('id'), 'ok': False, 'code': 'INPUT_PERMISSION_REQUIRED', 'message': str(exc)})
        except dbus.DBusException as exc:
            portal.close()
            emit({'id': request.get('id'), 'ok': False, 'code': 'INPUT_UNAVAILABLE', 'message': str(exc)})
        except Exception as exc:
            emit({'id': request.get('id'), 'ok': False, 'code': 'INPUT_FAILED', 'message': str(exc)})
        return True

    GLib.io_add_watch(sys.stdin, GLib.IO_IN | GLib.IO_HUP, on_stdin)
    try:
        loop.run()
    finally:
        portal.close()


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        emit({'id': None, 'ok': False, 'code': 'INPUT_UNAVAILABLE', 'message': str(exc)})
        sys.exit(1)
