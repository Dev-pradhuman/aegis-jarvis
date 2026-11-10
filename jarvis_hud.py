#!/usr/bin/env python3
"""
Aegis-JARVIS Dynamic Island HUD
PyGObject (GTK4 + libadwaita) + Gtk4LayerShell bottom-anchored HUD for Hyprland.
Integrates with engine_adapter.py (AntigravityACPAdapter) and persists to ~/.jarvis/history.json.
"""

import os
import sys

# Ensure libgtk4-layer-shell is preloaded before libwayland (required for PyGObject Gtk4LayerShell)
if 'libgtk4-layer-shell.so' not in os.environ.get('LD_PRELOAD', ''):
    candidate = '/usr/lib/libgtk4-layer-shell.so'
    if os.path.exists(candidate):
        cur_preload = os.environ.get('LD_PRELOAD', '')
        os.environ['LD_PRELOAD'] = f"{candidate} {cur_preload}".strip()
        try:
            os.execv(sys.executable, [sys.executable] + sys.argv)
        except Exception:
            pass

import json
import uuid
import signal
import threading
from datetime import datetime
from typing import Optional, List, Dict, Any

import gi
gi.require_version('Gtk', '4.0')
gi.require_version('Adw', '1')
gi.require_version('Gdk', '4.0')
gi.require_version('Gtk4LayerShell', '1.0')
from gi.repository import Gtk, Adw, Gdk, GLib, Gtk4LayerShell

try:
    from gi.repository import GLibUnix
    signal_add = GLibUnix.signal_add
except ImportError:
    signal_add = GLib.unix_signal_add

# Import engine adapter
try:
    from engine_adapter import AntigravityACPAdapter
except ImportError:
    # Look in script directory or parent directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    if script_dir not in sys.path:
        sys.path.insert(0, script_dir)
    from engine_adapter import AntigravityACPAdapter

HISTORY_DIR = os.path.expanduser("~/.jarvis")
HISTORY_FILE = os.path.join(HISTORY_DIR, "history.json")


def load_history() -> List[Dict[str, Any]]:
    """Load session list from ~/.jarvis/history.json."""
    if not os.path.exists(HISTORY_FILE):
        return []
    try:
        with open(HISTORY_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
    except Exception as e:
        print(f"[HUD] Warning: failed to parse history.json: {e}", file=sys.stderr)
    return []


def save_history(history: List[Dict[str, Any]]) -> None:
    """Save session list to ~/.jarvis/history.json atomically."""
    os.makedirs(HISTORY_DIR, exist_ok=True)
    tmp_path = f"{HISTORY_FILE}.tmp.{os.getpid()}"
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2, ensure_ascii=False)
        os.replace(tmp_path, HISTORY_FILE)
    except Exception as e:
        print(f"[HUD] Warning: failed to save history.json: {e}", file=sys.stderr)
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


class JarvisHUDWindow(Adw.ApplicationWindow):
    """
    Bottom-anchored Wayland Layer-Shell Dynamic Island HUD.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        self.engine = AntigravityACPAdapter()
        self.is_expanded = True
        self.is_recording = False
        self.current_session: Dict[str, Any] = self._create_new_session_data()
        self.active_session_id: Optional[str] = None

        self._setup_layer_shell()
        self._load_css()
        self._build_ui()
        self._setup_event_controllers()
        self._setup_signal_handlers()

        # Display initial welcome bubble
        self._append_assistant_bubble("Good day, Pradhuman. All systems are operational. How can I assist you?")

    def _create_new_session_data(self) -> Dict[str, Any]:
        """Generate a fresh session dictionary conforming to schema."""
        return {
            "id": str(uuid.uuid4()),
            "antigravity_session_id": None,
            "title": "New Session",
            "updated_at": datetime.now().isoformat(),
            "engine": self.engine.engine_name,
            "messages": []
        }

    def _setup_layer_shell(self) -> None:
        """Initialize Wayland Layer-Shell Overlay anchored to the bottom edge."""
        Gtk4LayerShell.init_for_window(self)
        Gtk4LayerShell.set_layer(self, Gtk4LayerShell.Layer.OVERLAY)
        Gtk4LayerShell.set_namespace(self, "jarvis-hud")

        # Anchor strictly to BOTTOM
        Gtk4LayerShell.set_anchor(self, Gtk4LayerShell.Edge.BOTTOM, True)
        Gtk4LayerShell.set_anchor(self, Gtk4LayerShell.Edge.TOP, False)
        Gtk4LayerShell.set_anchor(self, Gtk4LayerShell.Edge.LEFT, False)
        Gtk4LayerShell.set_anchor(self, Gtk4LayerShell.Edge.RIGHT, False)

        # Bottom margin 14px
        Gtk4LayerShell.set_margin(self, Gtk4LayerShell.Edge.BOTTOM, 14)

        # Exclusive keyboard mode while focused
        Gtk4LayerShell.set_keyboard_mode(self, Gtk4LayerShell.KeyboardMode.EXCLUSIVE)

    def _load_css(self) -> None:
        """Load island.css stylesheet."""
        provider = Gtk.CssProvider()
        css_paths = [
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "island.css"),
            os.path.expanduser("~/.config/jarvis/island.css"),
            os.path.expanduser("~/island.css"),
            "/home/pradhuman/projects/aegis-jarvis/island.css"
        ]
        loaded = False
        for path in css_paths:
            if os.path.exists(path):
                try:
                    provider.load_from_path(path)
                    loaded = True
                    break
                except Exception as e:
                    print(f"[HUD] Error loading CSS from {path}: {e}", file=sys.stderr)

        if not loaded:
            # Inline fallback CSS matching specs
            fallback_css = """
            window { background: transparent; }
            .island-root {
                background-color: rgba(10, 12, 16, 0.94);
                border-radius: 26px;
                border: 1px solid rgba(255, 255, 255, 0.08);
                padding: 14px 18px;
                box-shadow: 0 16px 48px rgba(0, 0, 0, 0.85);
                min-width: 540px;
            }
            .status-orb { min-width: 18px; min-height: 18px; border-radius: 50%; background-color: #3b82f6; }
            .mode-label { color: rgba(255, 255, 255, 0.88); font-size: 11px; font-weight: bold; }
            .icon-btn { border-radius: 50%; min-width: 30px; min-height: 30px; background: rgba(255,255,255,0.04); }
            .action-card { background-color: #18191c; border-radius: 18px; padding: 12px; }
            .confirm-btn { background-color: #10a37f; color: white; border-radius: 12px; }
            .cancel-btn { background-color: rgba(255, 255, 255, 0.06); color: #f87171; border-radius: 12px; }
            .send-btn { background-color: #3b82f6; color: white; border-radius: 18px; }
            """
            provider.load_from_data(fallback_css.encode("utf-8"))

        display = Gdk.Display.get_default()
        if display:
            Gtk.StyleContext.add_provider_for_display(
                display, provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
            )

    def _build_ui(self) -> None:
        """Construct the GTK4 widget hierarchy."""
        # Outer container: .island-root
        self.root_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
        self.root_box.add_css_class("island-root")
        self.root_box.set_size_request(540, -1)
        self.set_content(self.root_box)

        # 1. Top Header Row
        self.header_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        self.header_box.add_css_class("header-row")

        # Left: Status Orb + Mode Label
        self.status_orb = Gtk.Box()
        self.status_orb.add_css_class("status-orb")
        self.header_box.append(self.status_orb)

        self.mode_label = Gtk.Label(label="JARVIS // ACTIVE", xalign=0)
        self.mode_label.add_css_class("mode-label")
        self.header_box.append(self.mode_label)

        # Spacer to push action buttons right
        spacer = Gtk.Box()
        spacer.set_hexpand(True)
        self.header_box.append(spacer)

        # Right: Action Buttons
        actions_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        actions_box.add_css_class("header-actions")

        # History Button (Ctrl+H)
        self.btn_history = Gtk.Button.new_from_icon_name("document-open-recent-symbolic")
        self.btn_history.add_css_class("icon-btn")
        self.btn_history.set_tooltip_text("Past Sessions (Ctrl+H)")
        self.btn_history.connect("clicked", self._on_history_clicked)
        actions_box.append(self.btn_history)

        # New Chat Button (Ctrl+N)
        self.btn_new = Gtk.Button.new_from_icon_name("list-add-symbolic")
        self.btn_new.add_css_class("icon-btn")
        self.btn_new.set_tooltip_text("New Chat (Ctrl+N)")
        self.btn_new.connect("clicked", self._on_new_chat_clicked)
        actions_box.append(self.btn_new)

        # Voice Mic Button (Ctrl+M)
        self.btn_mic = Gtk.Button.new_from_icon_name("audio-input-microphone-symbolic")
        self.btn_mic.add_css_class("icon-btn")
        self.btn_mic.set_tooltip_text("Voice Input (Ctrl+M)")
        self.btn_mic.connect("clicked", self._on_mic_clicked)
        actions_box.append(self.btn_mic)

        # Close Button (✕)
        self.btn_close = Gtk.Button.new_from_icon_name("window-close-symbolic")
        self.btn_close.add_css_class("icon-btn")
        self.btn_close.add_css_class("close-btn")
        self.btn_close.set_tooltip_text("Collapse Island (Esc)")
        self.btn_close.connect("clicked", lambda b: self.collapse())
        actions_box.append(self.btn_close)

        self.header_box.append(actions_box)
        self.root_box.append(self.header_box)

        # 2. Dynamic Middle Stack (SLIDE_UP_DOWN transition)
        self.stack = Gtk.Stack()
        self.stack.add_css_class("middle-stack")
        self.stack.set_transition_type(Gtk.StackTransitionType.SLIDE_UP_DOWN)
        self.stack.set_transition_duration(240)

        # Page 1: chat_view
        self.chat_scroll = Gtk.ScrolledWindow()
        self.chat_scroll.add_css_class("chat-scroll")
        self.chat_scroll.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        self.chat_scroll.set_min_content_height(120)
        self.chat_scroll.set_max_content_height(340)
        self.chat_listbox = Gtk.ListBox()
        self.chat_listbox.add_css_class("chat-list")
        self.chat_listbox.set_selection_mode(Gtk.SelectionMode.NONE)
        self.chat_scroll.set_child(self.chat_listbox)
        self.stack.add_named(self.chat_scroll, "chat_view")

        # Page 2: history_view
        self.history_scroll = Gtk.ScrolledWindow()
        self.history_scroll.add_css_class("history-scroll")
        self.history_scroll.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC)
        self.history_scroll.set_min_content_height(140)
        self.history_scroll.set_max_content_height(340)
        self.history_listbox = Gtk.ListBox()
        self.history_listbox.add_css_class("history-list")
        self.history_listbox.set_selection_mode(Gtk.SelectionMode.SINGLE)
        self.history_listbox.connect("row-activated", self._on_history_row_activated)
        self.history_scroll.set_child(self.history_listbox)
        self.stack.add_named(self.history_scroll, "history_view")

        self.stack.set_visible_child_name("chat_view")
        self.root_box.append(self.stack)

        # 3. Bottom Input Row
        self.input_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        self.input_box.add_css_class("input-row")

        self.input_entry = Gtk.Entry()
        self.input_entry.add_css_class("island-input")
        self.input_entry.set_hexpand(True)
        self.input_entry.set_placeholder_text("What would you like to do?")
        self.input_entry.connect("activate", self._on_send_clicked)
        self.input_box.append(self.input_entry)

        self.btn_send = Gtk.Button(label="Send")
        self.btn_send.add_css_class("send-btn")
        self.btn_send.connect("clicked", self._on_send_clicked)
        self.input_box.append(self.btn_send)

        self.root_box.append(self.input_box)

    def _setup_event_controllers(self) -> None:
        """Register global keyboard shortcuts on the window."""
        key_ctrl = Gtk.EventControllerKey()
        key_ctrl.connect("key-pressed", self._on_key_pressed)
        self.add_controller(key_ctrl)

    def _setup_signal_handlers(self) -> None:
        """Listen to SIGUSR1 and SIGUSR2 via GLib Unix signal source."""
        signal_add(GLib.PRIORITY_DEFAULT, signal.SIGUSR1, self._on_sigusr1)
        signal_add(GLib.PRIORITY_DEFAULT, signal.SIGUSR2, self._on_sigusr2)

    def _on_key_pressed(self, controller, keyval, keycode, state) -> bool:
        """Handle keyboard accelerators."""
        # Escape: collapse island
        if keyval == Gdk.KEY_Escape:
            if self.stack.get_visible_child_name() == "history_view":
                self.stack.set_visible_child_name("chat_view")
                self.input_entry.grab_focus()
                return True
            self.collapse()
            return True

        is_ctrl = bool(state & Gdk.ModifierType.CONTROL_MASK)
        if is_ctrl:
            if keyval in (Gdk.KEY_h, Gdk.KEY_H):
                self._on_history_clicked(None)
                return True
            elif keyval in (Gdk.KEY_n, Gdk.KEY_N):
                self._on_new_chat_clicked(None)
                return True
            elif keyval in (Gdk.KEY_m, Gdk.KEY_M):
                self._on_mic_clicked(None)
                return True

        return False

    def _on_sigusr1(self, *args) -> bool:
        """SIGUSR1: Toggle between collapsed/hidden and expanded state."""
        if self.is_expanded and self.get_visible():
            self.collapse()
        else:
            self.expand()
        return GLib.SOURCE_CONTINUE

    def _on_sigusr2(self, *args) -> bool:
        """SIGUSR2: Expand island and immediately trigger voice recording."""
        self.expand()
        self.start_voice_recording()
        return GLib.SOURCE_CONTINUE

    def expand(self) -> None:
        """Expand and reveal the Dynamic Island HUD."""
        self.set_visible(True)
        Gtk4LayerShell.set_keyboard_mode(self, Gtk4LayerShell.KeyboardMode.EXCLUSIVE)
        self.root_box.set_size_request(540, -1)
        self.input_entry.grab_focus()
        self.is_expanded = True

    def collapse(self) -> None:
        """Collapse and hide the Dynamic Island HUD."""
        if self.is_recording:
            self.stop_voice_recording()
        Gtk4LayerShell.set_keyboard_mode(self, Gtk4LayerShell.KeyboardMode.NONE)
        self.set_visible(False)
        self.is_expanded = False

    def _on_history_clicked(self, button) -> None:
        """Toggle between chat_view and history_view."""
        if self.stack.get_visible_child_name() == "history_view":
            self.stack.set_visible_child_name("chat_view")
            self.mode_label.set_label("JARVIS // ACTIVE")
            self.input_entry.grab_focus()
        else:
            self._populate_history_view()
            self.stack.set_visible_child_name("history_view")
            self.mode_label.set_label("JARVIS // SESSIONS")

    def _on_new_chat_clicked(self, button) -> None:
        """Create a fresh conversation session."""
        self._save_active_session_if_needed()
        self.current_session = self._create_new_session_data()
        self.active_session_id = None

        # Clear conversation list and show initial greeting
        while row := self.chat_listbox.get_first_child():
            self.chat_listbox.remove(row)

        self._append_assistant_bubble("New session initialized. What task shall we tackle next?")
        self.input_entry.set_placeholder_text("What would you like to do?")
        self.input_entry.set_text("")
        self.stack.set_visible_child_name("chat_view")
        self.mode_label.set_label("JARVIS // ACTIVE")
        self.input_entry.grab_focus()

    def _on_mic_clicked(self, button) -> None:
        """Toggle voice recording callback."""
        if self.is_recording:
            self.stop_voice_recording()
        else:
            self.start_voice_recording()

    def start_voice_recording(self) -> None:
        """Trigger voice recording pipeline and animate mic button."""
        self.is_recording = True
        self.btn_mic.add_css_class("mic-recording")
        self.mode_label.set_label("JARVIS // LISTENING...")
        self.engine.start_voice_recording()

    def stop_voice_recording(self) -> None:
        """Stop voice recording and inject transcribed speech into entry."""
        self.is_recording = False
        self.btn_mic.remove_css_class("mic-recording")
        self.mode_label.set_label("JARVIS // ACTIVE")
        transcription = self.engine.stop_voice_recording()
        if transcription:
            self.input_entry.set_text(transcription)
            self.input_entry.grab_focus()

    def _on_send_clicked(self, widget) -> None:
        """Process user message submission."""
        text = self.input_entry.get_text().strip()
        if not text:
            return

        # 1. Append user bubble
        self._append_user_bubble(text)
        self.input_entry.set_text("")
        self.input_entry.set_placeholder_text("Type another task...")

        # Record message in current session
        self.current_session["messages"].append({"role": "user", "text": text})
        if self.current_session["title"] == "New Session":
            self.current_session["title"] = text[:36] + ("..." if len(text) > 36 else "")

        # 2. Show thinking indicator
        self.mode_label.set_label("JARVIS // THINKING...")
        self.btn_send.set_sensitive(False)
        self.input_entry.set_sensitive(False)

        # 3. Dispatch to worker thread
        threading.Thread(
            target=self._worker_send_prompt,
            args=(text, self.active_session_id),
            daemon=True
        ).start()

    def _worker_send_prompt(self, prompt: str, session_id: Optional[str]) -> None:
        """Background thread worker for model inference."""
        res = self.engine.send_prompt(prompt, session_id=session_id)
        GLib.idle_add(self._on_prompt_reply, res)

    def _on_prompt_reply(self, response_data: Dict[str, Any]) -> bool:
        """Handle LLM reply on main GTK loop."""
        self.btn_send.set_sensitive(True)
        self.input_entry.set_sensitive(True)
        self.mode_label.set_label("JARVIS // ACTIVE")
        self.input_entry.grab_focus()

        reply_text = response_data.get("text", "Processed.")
        antigravity_id = response_data.get("antigravity_session_id")
        action_req = response_data.get("action_required")

        # Update session
        if antigravity_id:
            self.active_session_id = antigravity_id
            self.current_session["antigravity_session_id"] = antigravity_id

        self.current_session["updated_at"] = datetime.now().isoformat()
        self.current_session["messages"].append({"role": "assistant", "text": reply_text})

        # Append assistant bubble
        self._append_assistant_bubble(reply_text)

        # If action requires approval, append Action Card
        if action_req:
            self._append_action_card(action_req)

        # Persist session to history.json
        self._save_active_session_if_needed()
        self._scroll_chat_to_bottom()
        return False

    def _append_user_bubble(self, text: str) -> None:
        """Render a right-aligned user bubble."""
        row = Gtk.ListBoxRow()
        row.add_css_class("chat-row")

        box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL)
        box.set_halign(Gtk.Align.END)

        lbl = Gtk.Label(label=text, wrap=True, xalign=0)
        lbl.add_css_class("user-bubble")
        lbl.set_max_width_chars(42)

        box.append(lbl)
        row.set_child(box)
        self.chat_listbox.append(row)
        self._scroll_chat_to_bottom()

    def _append_assistant_bubble(self, text: str) -> None:
        """Render a left-aligned assistant bubble."""
        row = Gtk.ListBoxRow()
        row.add_css_class("chat-row")

        box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL)
        box.set_halign(Gtk.Align.START)

        lbl = Gtk.Label(label=text, wrap=True, xalign=0)
        lbl.add_css_class("assistant-bubble")
        lbl.set_max_width_chars(52)

        box.append(lbl)
        row.set_child(box)
        self.chat_listbox.append(row)
        self._scroll_chat_to_bottom()

    def _append_action_card(self, action_data: Dict[str, Any]) -> None:
        """Render an inline Action/Approval Card with command preview & confirm button."""
        action_id = action_data.get("id", str(uuid.uuid4()))
        title = action_data.get("title", "Command Execution Confirmation")
        command = action_data.get("command", "")

        row = Gtk.ListBoxRow()
        row.add_css_class("chat-row")

        card_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8)
        card_box.add_css_class("action-card")

        # Title
        title_label = Gtk.Label(label=f"⚠️  {title}", xalign=0)
        title_label.add_css_class("action-title")
        card_box.append(title_label)

        # Editable Command TextView inside monospace box
        tv = Gtk.TextView()
        tv.add_css_class("action-code-view")
        tv.set_editable(True)
        tv.set_wrap_mode(Gtk.WrapMode.CHAR)
        tv.get_buffer().set_text(command)
        card_box.append(tv)

        # Action Buttons
        btn_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)

        confirm_btn = Gtk.Button(label="Confirm")
        confirm_btn.add_css_class("confirm-btn")

        cancel_btn = Gtk.Button(label="Cancel ✕")
        cancel_btn.add_css_class("cancel-btn")

        btn_box.append(confirm_btn)
        btn_box.append(cancel_btn)
        card_box.append(btn_box)

        def on_confirm_clicked(btn):
            buf = tv.get_buffer()
            mod_cmd = buf.get_text(buf.get_start_iter(), buf.get_end_iter(), True).strip()
            confirm_btn.set_sensitive(False)
            cancel_btn.set_sensitive(False)
            title_label.set_label("⚡ Executing...")

            def worker():
                exec_res = self.engine.confirm_action(action_id, mod_cmd)
                GLib.idle_add(on_confirm_done, exec_res)

            def on_confirm_done(res):
                out = res.get("output", "Execution finished.")
                title_label.set_label(f"✓ Confirmed: {out[:60]}")
                self.current_session["messages"].append({
                    "role": "tool",
                    "text": f"Executed: {mod_cmd}\nOutput: {out}"
                })
                self._save_active_session_if_needed()
                return False

            threading.Thread(target=worker, daemon=True).start()

        def on_cancel_clicked(btn):
            confirm_btn.set_sensitive(False)
            cancel_btn.set_sensitive(False)
            title_label.set_label("✕ Action Rejected")
            self.engine.reject_action(action_id)
            self.current_session["messages"].append({
                "role": "tool",
                "text": f"Rejected execution: {command}"
            })
            self._save_active_session_if_needed()

        confirm_btn.connect("clicked", on_confirm_clicked)
        cancel_btn.connect("clicked", on_cancel_clicked)

        row.set_child(card_box)
        self.chat_listbox.append(row)
        self._scroll_chat_to_bottom()

    def _scroll_chat_to_bottom(self) -> None:
        """Scroll chat ScrolledWindow smoothly to the newest item."""
        def scroll():
            adj = self.chat_scroll.get_vadjustment()
            if adj:
                adj.set_value(adj.get_upper() - adj.get_page_size())
            return False
        GLib.timeout_add(50, scroll)

    def _populate_history_view(self) -> None:
        """Populate the history ListBox with past sessions from history.json."""
        while row := self.history_listbox.get_first_child():
            self.history_listbox.remove(row)

        sessions = load_history()
        if not sessions:
            empty_row = Gtk.ListBoxRow()
            lbl = Gtk.Label(label="No past sessions found.", xalign=0.5)
            lbl.add_css_class("history-meta")
            empty_row.set_child(lbl)
            self.history_listbox.append(empty_row)
            return

        for sess in sessions:
            row = Gtk.ListBoxRow()
            row.add_css_class("history-row")
            row.session_data = sess

            vbox = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4)

            # Title
            title_text = sess.get("title") or "Untitled Session"
            title_lbl = Gtk.Label(label=title_text, xalign=0)
            title_lbl.add_css_class("history-title")
            vbox.append(title_lbl)

            # Metadata Row: Timestamp + Engine Badge + Msg Count
            meta_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)

            raw_time = sess.get("updated_at", "")
            try:
                dt = datetime.fromisoformat(raw_time)
                fmt_time = dt.strftime("%b %d, %H:%M")
            except Exception:
                fmt_time = raw_time[:16] if raw_time else "Recent"

            time_lbl = Gtk.Label(label=fmt_time, xalign=0)
            time_lbl.add_css_class("history-meta")
            meta_box.append(time_lbl)

            engine_badge = Gtk.Label(label=sess.get("engine", "Antigravity ACP"))
            engine_badge.add_css_class("engine-badge")
            meta_box.append(engine_badge)

            msg_count = len(sess.get("messages", []))
            count_lbl = Gtk.Label(label=f"{msg_count} turns", xalign=0)
            count_lbl.add_css_class("history-meta")
            meta_box.append(count_lbl)

            vbox.append(meta_box)
            row.set_child(vbox)
            self.history_listbox.append(row)

    def _on_history_row_activated(self, listbox, row) -> None:
        """Load a selected past session into chat_view and resume session."""
        sess = getattr(row, "session_data", None)
        if not sess:
            return

        self._save_active_session_if_needed()
        self.current_session = sess
        target_sid = sess.get("antigravity_session_id") or sess.get("id")
        self.active_session_id = target_sid

        # Inform adapter of session resume
        if target_sid:
            self.engine.resume_session(target_sid)

        # Clear and load messages into chat_view
        while child := self.chat_listbox.get_first_child():
            self.chat_listbox.remove(child)

        messages = sess.get("messages", [])
        for m in messages:
            role = m.get("role")
            text = m.get("text", "")
            if role == "user":
                self._append_user_bubble(text)
            elif role == "assistant":
                self._append_assistant_bubble(text)
            elif role == "tool":
                self._append_assistant_bubble(f"⚙️ {text}")

        if messages:
            self.input_entry.set_placeholder_text("Type another task...")
        else:
            self.input_entry.set_placeholder_text("What would you like to do?")

        self.stack.set_visible_child_name("chat_view")
        self.mode_label.set_label(f"JARVIS // {sess.get('title', 'SESSION')[:16]}")
        self.input_entry.grab_focus()

    def _save_active_session_if_needed(self) -> None:
        """Persist current session if it contains messages."""
        if not self.current_session.get("messages"):
            return

        sessions = load_history()
        # Find index of existing session
        idx = -1
        for i, s in enumerate(sessions):
            if s.get("id") == self.current_session.get("id"):
                idx = i
                break

        if idx >= 0:
            sessions[idx] = self.current_session
        else:
            sessions.insert(0, self.current_session)

        save_history(sessions)


class JarvisHUDApp(Adw.Application):
    """
    Main Adwaita application container.
    """

    def __init__(self):
        super().__init__(
            application_id="org.aegis.jarvis.hud",
            flags=0
        )
        self.window: Optional[JarvisHUDWindow] = None

    def do_activate(self):
        if not self.window:
            self.window = JarvisHUDWindow(application=self)
        self.window.present()


def main():
    """Application entry point."""
    app = JarvisHUDApp()
    return app.run(sys.argv)


if __name__ == "__main__":
    sys.exit(main())
