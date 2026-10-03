#!/usr/bin/env python3
import sys
import json
import threading
import tkinter as tk
from tkinter import font

class JarvisHUD:
    def __init__(self, root):
        self.root = root
        self.root.title("JARVIS HUD")
        # Glassmorphic setup
        self.root.attributes('-alpha', 0.85)
        self.root.overrideredirect(True) # borderless
        self.root.configure(bg='#1e1e2e')
        
        # Center it at the top
        screen_width = root.winfo_screenwidth()
        w = int(screen_width * 0.4)
        h = 60
        x = int(screen_width/2 - w/2)
        y = 40
        self.root.geometry(f'{w}x{h}+{x}+{y}')
        
        # Font
        custom_font = font.Font(family="Helvetica", size=14)
        
        # Input field
        self.entry = tk.Entry(root, font=custom_font, bg='#313244', fg='#cdd6f4', insertbackground='white', relief='flat', highlightthickness=0)
        self.entry.pack(fill='both', expand=True, padx=10, pady=10)
        
        self.entry.bind('<Return>', self.on_enter)
        self.entry.bind('<Escape>', self.on_escape)
        self.entry.bind('<Double-Button-1>', self.on_double_click)
        
        self.root.withdraw() # Start hidden

    def on_enter(self, event):
        text = self.entry.get()
        if text.strip():
            print(json.dumps({'event': 'text_input', 'text': text}), flush=True)
            self.entry.delete(0, tk.END)
        self.root.withdraw()

    def on_escape(self, event):
        self.root.withdraw()

    def on_double_click(self, event):
        print(json.dumps({'event': 'voice_listen'}), flush=True)
        self.root.withdraw()

    def show(self):
        self.root.deiconify()
        self.entry.focus_set()

    def hide(self):
        self.root.withdraw()

def stdin_listener(hud, root):
    for line in sys.stdin:
        try:
            cmd = json.loads(line)
            if cmd.get('action') == 'show':
                root.after(0, hud.show)
            elif cmd.get('action') == 'hide':
                root.after(0, hud.hide)
        except:
            pass

def main():
    root = tk.Tk()
    hud = JarvisHUD(root)
    
    t = threading.Thread(target=stdin_listener, args=(hud, root), daemon=True)
    t.start()
    
    root.mainloop()

if __name__ == '__main__':
    main()
