#!/usr/bin/env python3
import sys
import os
import json
import dbus
import dbus.service
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib

class OverlayTrigger(dbus.service.Object):
    def __init__(self):
        DBusGMainLoop(set_as_default=True)
        self.bus = dbus.SessionBus()
        bus_name = dbus.service.BusName('org.aegis.jarvis.HUD', self.bus)
        super().__init__(bus_name, '/HUD')
        
        # Register global shortcut in KDE
        try:
            self.kglobalaccel = self.bus.get_object('org.kde.kglobalaccel', '/kglobalaccel')
            self.kglobalaccel_iface = dbus.Interface(self.kglobalaccel, 'org.kde.KGlobalAccel')
            
            # component, action, text, default shortcut
            component = ['jarvis-hud', 'JARVIS HUD', 'jarvis', 'jarvis']
            self.kglobalaccel_iface.invoke(
                ['jarvis-hud', 'JARVIS', 'jarvis', 'jarvis'],
                'toggleHUD',
                'Toggle JARVIS HUD',
                ['Meta+J'],
                ['Meta+J']
            )
            # Wait, kglobalaccel usage is a bit complex in dbus python, but we can also just use a local listener.
        except Exception as e:
            pass

def main():
    print("Overlay trigger started", flush=True)
    loop = GLib.MainLoop()
    loop.run()

if __name__ == '__main__':
    main()
