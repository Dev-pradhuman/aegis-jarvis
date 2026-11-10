#!/usr/bin/env python3
"""
Unit and integration tests for jarvis_hud.py and engine_adapter.py.
"""

import os
import sys
import json
import uuid
import tempfile
import unittest
from datetime import datetime

# Add project root to sys.path
repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

from engine_adapter import AntigravityACPAdapter
import jarvis_hud


class TestEngineAdapter(unittest.TestCase):
    """Test suite for AntigravityACPAdapter."""

    def setUp(self):
        self.adapter = AntigravityACPAdapter()

    def test_send_prompt_returns_valid_structure(self):
        res = self.adapter.send_prompt("What is my system volume?")
        self.assertIn("text", res)
        self.assertIn("antigravity_session_id", res)
        self.assertIsNotNone(res["antigravity_session_id"])
        self.assertTrue(len(res["text"]) > 0)

    def test_resume_session_attaches_session_id(self):
        test_sid = str(uuid.uuid4())
        res = self.adapter.resume_session(test_sid)
        self.assertEqual(self.adapter.active_session_id, test_sid)
        res_prompt = self.adapter.send_prompt("Next task", session_id=test_sid)
        self.assertEqual(res_prompt["antigravity_session_id"], test_sid)

    def test_action_required_generation_for_commands(self):
        res = self.adapter.send_prompt("run systemctl restart aegis-jarvis.service")
        self.assertIn("action_required", res)
        self.assertIsNotNone(res["action_required"])
        act = res["action_required"]
        self.assertIn("id", act)
        self.assertIn("title", act)
        self.assertIn("command", act)
        self.assertIn("systemctl restart aegis-jarvis.service", act["command"])

    def test_confirm_action(self):
        action_id = str(uuid.uuid4())
        res = self.adapter.confirm_action(action_id, "echo 'HUD_TEST_OK'")
        self.assertEqual(res.get("status"), "success")
        self.assertIn("HUD_TEST_OK", res.get("output", ""))

    def test_reject_action(self):
        action_id = str(uuid.uuid4())
        res = self.adapter.reject_action(action_id)
        self.assertEqual(res.get("status"), "cancelled")

    def test_voice_recording_toggle(self):
        self.adapter.start_voice_recording()
        self.assertTrue(self.adapter.is_recording)
        transcript = self.adapter.stop_voice_recording()
        self.assertFalse(self.adapter.is_recording)
        self.assertTrue(isinstance(transcript, str))


class TestHistoryPersistence(unittest.TestCase):
    """Test persistence to ~/.jarvis/history.json schema."""

    def setUp(self):
        self.orig_dir = jarvis_hud.HISTORY_DIR
        self.orig_file = jarvis_hud.HISTORY_FILE
        self.tmp_dir = tempfile.mkdtemp()
        jarvis_hud.HISTORY_DIR = self.tmp_dir
        jarvis_hud.HISTORY_FILE = os.path.join(self.tmp_dir, "history.json")

    def tearDown(self):
        jarvis_hud.HISTORY_DIR = self.orig_dir
        jarvis_hud.HISTORY_FILE = self.orig_file

    def test_load_empty_history(self):
        items = jarvis_hud.load_history()
        self.assertEqual(items, [])

    def test_save_and_load_history_schema(self):
        sample_history = [
            {
                "id": str(uuid.uuid4()),
                "antigravity_session_id": "session-12345",
                "title": "Check PipeWire Volume",
                "updated_at": datetime.now().isoformat(),
                "engine": "Antigravity ACP",
                "messages": [
                    {"role": "user", "text": "What is my volume?"},
                    {"role": "assistant", "text": "Volume is set to 85%."},
                    {"role": "tool", "text": "Executed: wpctl get-volume"}
                ]
            }
        ]
        jarvis_hud.save_history(sample_history)
        loaded = jarvis_hud.load_history()
        self.assertEqual(len(loaded), 1)
        item = loaded[0]

        # Verify exact required schema
        self.assertIn("id", item)
        self.assertIn("antigravity_session_id", item)
        self.assertIn("title", item)
        self.assertIn("updated_at", item)
        self.assertIn("messages", item)
        self.assertEqual(len(item["messages"]), 3)
        self.assertEqual(item["messages"][0]["role"], "user")
        self.assertEqual(item["messages"][1]["role"], "assistant")
        self.assertEqual(item["messages"][2]["role"], "tool")


class TestHUDWindowLayerShell(unittest.TestCase):
    """Test GTK4 and Gtk4LayerShell window initialization and signals."""

    def test_window_and_layer_shell_setup(self):
        import gi
        gi.require_version('Gtk', '4.0')
        gi.require_version('Adw', '1')
        gi.require_version('Gtk4LayerShell', '1.0')
        from gi.repository import Gtk, Adw, Gtk4LayerShell

        Adw.init()
        app = Adw.Application(application_id="org.test.hud")

        def activate(application):
            win = jarvis_hud.JarvisHUDWindow(application=application)

            # Check layer shell setup
            self.assertTrue(Gtk4LayerShell.is_layer_window(win))
            self.assertEqual(Gtk4LayerShell.get_layer(win), Gtk4LayerShell.Layer.OVERLAY)
            self.assertTrue(Gtk4LayerShell.get_anchor(win, Gtk4LayerShell.Edge.BOTTOM))
            self.assertFalse(Gtk4LayerShell.get_anchor(win, Gtk4LayerShell.Edge.TOP))
            self.assertFalse(Gtk4LayerShell.get_anchor(win, Gtk4LayerShell.Edge.LEFT))
            self.assertFalse(Gtk4LayerShell.get_anchor(win, Gtk4LayerShell.Edge.RIGHT))
            self.assertEqual(Gtk4LayerShell.get_margin(win, Gtk4LayerShell.Edge.BOTTOM), 14)

            # Check UI components
            self.assertEqual(win.stack.get_visible_child_name(), "chat_view")
            self.assertEqual(win.input_entry.get_placeholder_text(), "What would you like to do?")

            # Test collapse and expand
            win.collapse()
            self.assertFalse(win.is_expanded)
            self.assertFalse(win.get_visible())
            self.assertEqual(Gtk4LayerShell.get_keyboard_mode(win), Gtk4LayerShell.KeyboardMode.NONE)

            win.expand()
            self.assertTrue(win.is_expanded)
            self.assertTrue(win.get_visible())
            self.assertEqual(Gtk4LayerShell.get_keyboard_mode(win), Gtk4LayerShell.KeyboardMode.EXCLUSIVE)

            # Test SIGUSR1 toggle
            win._on_sigusr1()
            self.assertFalse(win.is_expanded)
            win._on_sigusr1()
            self.assertTrue(win.is_expanded)

            # Test SIGUSR2 expand + voice
            win.collapse()
            win._on_sigusr2()
            self.assertTrue(win.is_expanded)
            self.assertTrue(win.is_recording)

            application.quit()

        app.connect("activate", activate)
        app.run(None)


if __name__ == "__main__":
    unittest.main()
