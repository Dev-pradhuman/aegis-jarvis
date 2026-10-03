#!/usr/bin/env python3
import sys
import json
import dbus
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib

def main():
    DBusGMainLoop(set_as_default=True)
    bus = dbus.SessionBus()
    
    try:
        # Register a global shortcut using KGlobalAccel
        kglobalaccel = bus.get_object('org.kde.kglobalaccel', '/kglobalaccel')
        iface = dbus.Interface(kglobalaccel, 'org.kde.KGlobalAccel')
        
        # We need an object that kglobalaccel can call back to.
        # But a simpler way is to just listen for the signal if it exists.
        # KGlobalAccel emits globalShortcutPressed(component, action, timestamp)
        def on_shortcut_pressed(component, action, timestamp):
            if component == 'jarvis-hud' and action == 'toggle':
                print(json.dumps({'event': 'toggle_hud'}), flush=True)

        bus.add_signal_receiver(on_shortcut_pressed, dbus_interface='org.kde.KGlobalAccel', signal_name='globalShortcutPressed')
        
        print(json.dumps({'status': 'listening'}), flush=True)
        loop = GLib.MainLoop()
        loop.run()
    except Exception as e:
        print(json.dumps({'error': str(e)}), flush=True)

if __name__ == '__main__':
    main()
