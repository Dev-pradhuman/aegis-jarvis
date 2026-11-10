"""
Antigravity ACP & Aegis-JARVIS Engine Adapter for Dynamic Island HUD
Routes fast turns to the local Aegis daemon (127.0.0.1:8787) and deep/fallback turns
to the headless Google Gemini CLI (/home/pradhuman/.npm-global/bin/gemini -p).
"""

import os
import shutil
import json
import uuid
import urllib.request
import urllib.error
import subprocess
from datetime import datetime
from typing import Optional, Dict, Any


class AntigravityACPAdapter:
    def __init__(self, api_base: str = "http://127.0.0.1:8787"):
        self.api_base = api_base.rstrip("/")
        self.engine_name = "Antigravity ACP"
        self.active_session_id: Optional[str] = None
        self.is_recording = False
        self.gemini_bin = shutil.which("gemini") or "/home/pradhuman/.npm-global/bin/gemini"

    def _clean_env(self) -> dict:
        """Isolate personal OAuth session from global API key overrides (Open Duet pattern)."""
        env = os.environ.copy()
        for k in ["GOOGLE_API_KEY", "GEMINI_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS"]:
            env.pop(k, None)
        return env

    def resume_session(self, session_id: str) -> Dict[str, Any]:
        self.active_session_id = session_id
        try:
            url = f"{self.api_base}/api/session/resume"
            req = urllib.request.Request(
                url,
                data=json.dumps({"sessionId": session_id}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=2) as res:
                if res.status == 200:
                    return json.loads(res.read().decode("utf-8"))
        except Exception:
            pass
        return {"status": "resumed", "session_id": session_id}

    def _run_gemini_headless(self, prompt: str, target_session: str) -> Optional[Dict[str, Any]]:
        """Execute headless Google Gemini CLI (-p) when explicitly requested or when daemon fails."""
        if not os.path.exists(self.gemini_bin):
            return None
        try:
            proc = subprocess.run(
                [self.gemini_bin, "-p", prompt],
                capture_output=True,
                text=True,
                env=self._clean_env(),
                timeout=45
            )
            out = (proc.stdout or "").strip()
            if proc.returncode == 0 and out:
                return {
                    "text": out,
                    "antigravity_session_id": target_session,
                    "action_required": None
                }
        except Exception:
            pass
        return None

    def send_prompt(self, prompt: str, session_id: Optional[str] = None) -> Dict[str, Any]:
        target_session = session_id or self.active_session_id or str(uuid.uuid4())
        self.active_session_id = target_session
        prompt_stripped = prompt.strip()
        prompt_lower = prompt_stripped.lower()

        # 0. Explicit deep-agent trigger (/gemini or /agy prefix)
        if prompt_lower.startswith(("/gemini ", "/agy ")):
            clean_query = prompt_stripped.split(" ", 1)[1].strip()
            res = self._run_gemini_headless(clean_query, target_session)
            if res:
                return res

        # 1. Primary path: Live Aegis-JARVIS HTTP daemon (127.0.0.1:8787)
        try:
            url = f"{self.api_base}/api/chat"
            payload = {
                "message": prompt_stripped,
                "sessionId": target_session,
                "mode": "cloud",
                "client": "jarvis-hud"
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=15) as res:
                if res.status == 200:
                    data = json.loads(res.read().decode("utf-8"))
                    reply_text = data.get("response") or data.get("reply") or data.get("text") or "Command executed."
                    session_ret = data.get("sessionId") or data.get("runId") or target_session

                    action_req = None
                    plan_steps = (data.get("plan") or {}).get("steps") or []
                    needs_plan_approval = any(s.get("requiresApproval") for s in plan_steps if isinstance(s, dict))

                    if "approval" in data or "action" in data or data.get("requiresConfirmation") or needs_plan_approval:
                        act = data.get("approval") or data.get("action") or {}
                        action_req = {
                            "id": act.get("id") or data.get("runId") or str(uuid.uuid4()),
                            "title": act.get("title") or "Action Confirmation Required",
                            "command": act.get("command") or act.get("toolCall") or prompt_stripped
                        }

                    return {
                        "text": reply_text,
                        "antigravity_session_id": session_ret,
                        "action_required": action_req
                    }
        except Exception:
            pass

        # 2. Shell / Tool Approval Gate (triggers inline Action Card in HUD)
        danger_triggers = ["run ", "exec ", "sudo ", "install ", "rm ", "kill ", "systemctl ", "bash ", "deploy "]
        if any(prompt_lower.startswith(trig) or f" {trig}" in f" {prompt_lower}" for trig in danger_triggers) and not prompt_lower.startswith("what"):
            action_id = str(uuid.uuid4())
            cmd = prompt_stripped
            for prefix in ("run ", "exec "):
                if prompt_lower.startswith(prefix):
                    cmd = prompt_stripped[len(prefix):].strip()
            return {
                "text": "I prepared the execution plan for your request. Please review the command below before confirming.",
                "antigravity_session_id": target_session,
                "action_required": {
                    "id": action_id,
                    "title": "Tool Approval: Command Execution",
                    "command": cmd
                }
            }

        # 3. Real Local Hardware/OS Fast-Path
        if "volume" in prompt_lower:
            try:
                res = subprocess.check_output(["wpctl", "get-volume", "@DEFAULT_AUDIO_SINK@"], stderr=subprocess.DEVNULL)
                return {
                    "text": f"Current system volume: {res.decode('utf-8').strip()}",
                    "antigravity_session_id": target_session,
                    "action_required": None
                }
            except Exception as e:
                return {"text": f"Volume check failed: {e}", "antigravity_session_id": target_session, "action_required": None}

        if "spotify" in prompt_lower or "play" in prompt_lower or "pause" in prompt_lower:
            try:
                subprocess.run(["playerctl", "play-pause"], stderr=subprocess.DEVNULL, timeout=3)
                status = subprocess.check_output(["playerctl", "status"], stderr=subprocess.DEVNULL, timeout=3).decode().strip()
                return {
                    "text": f"Toggled media playback via MPRIS playerctl (Status: {status}).",
                    "antigravity_session_id": target_session,
                    "action_required": None
                }
            except Exception:
                pass

        if "time" in prompt_lower or "date" in prompt_lower:
            now = datetime.now().strftime("%A, %B %d, %Y %I:%M %p")
            return {"text": f"The current system time is {now}.", "antigravity_session_id": target_session, "action_required": None}

        # 4. Real Headless Gemini CLI Fallback before generic acknowledgment
        gemini_res = self._run_gemini_headless(prompt_stripped, target_session)
        if gemini_res:
            return gemini_res

        return {
            "text": f"Acknowledged: \"{prompt_stripped}\". (Daemon offline and headless CLI unavailable).",
            "antigravity_session_id": target_session,
            "action_required": None
        }

    def confirm_action(self, action_id: str, command: str) -> Dict[str, Any]:
        try:
            url = f"{self.api_base}/api/chat/action/approve"
            payload = {"actionId": action_id, "command": command}
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=5) as res:
                if res.status == 200:
                    return json.loads(res.read().decode("utf-8"))
        except Exception:
            pass

        try:
            proc = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=15)
            output = proc.stdout.strip() or proc.stderr.strip() or f"Process exited with code {proc.returncode}"
            return {"status": "success", "action_id": action_id, "output": output}
        except Exception as e:
            return {"status": "error", "action_id": action_id, "error": str(e)}

    def reject_action(self, action_id: str) -> Dict[str, Any]:
        try:
            url = f"{self.api_base}/api/chat/action/reject"
            payload = {"actionId": action_id}
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=3) as res:
                pass
        except Exception:
            pass
        return {"status": "cancelled", "action_id": action_id}

    def start_voice_recording(self) -> None:
        self.is_recording = True
        try:
            req = urllib.request.Request(f"{self.api_base}/api/voice/enable", method="POST")
            urllib.request.urlopen(req, timeout=2)
        except Exception:
            pass

    def stop_voice_recording(self) -> str:
        self.is_recording = False
        try:
            req = urllib.request.Request(f"{self.api_base}/api/voice/status", method="GET")
            with urllib.request.urlopen(req, timeout=2) as res:
                data = json.loads(res.read().decode("utf-8"))
                transcript = data.get("lastTranscript")
                if transcript:
                    return transcript
        except Exception:
            pass
        return ""
