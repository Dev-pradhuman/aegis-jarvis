$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$dataRoot = if ($env:JARVIS_DATA_DIR) { $env:JARVIS_DATA_DIR } else { Join-Path $projectRoot 'server\data' }
$credentialFile = Join-Path $dataRoot 'credentials.env'
$port = 8787
$bridgeToken = ''

if (Test-Path -LiteralPath $credentialFile) {
    foreach ($line in Get-Content -LiteralPath $credentialFile) {
        if ($line -match '^JARVIS_PORT=(.*)$') { $port = [int](($Matches[1]).Trim('"')) }
        if ($line -match '^VOICE_OS_BRIDGE_TOKEN=(.*)$') { $bridgeToken = ($Matches[1]).Trim('"') }
    }
}

$pidFile = Join-Path $dataRoot 'voice-os-bridge.pid'
New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
Set-Content -LiteralPath $pidFile -Value $PID -Encoding ascii

$source = @'
using System;
using System.Diagnostics;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class JarvisVoiceHotkeys {
    private const int WH_KEYBOARD_LL = 13;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_KEYUP = 0x0101;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int WM_SYSKEYUP = 0x0105;
    private const int VK_MENU = 0x12;
    private const int VK_LMENU = 0xA4;
    private const int VK_RMENU = 0xA5;
    private const int VK_CONTROL = 0x11;
    private const int VK_LCONTROL = 0xA2;
    private const int VK_RCONTROL = 0xA3;
    private const int VK_SHIFT = 0x10;
    private const int VK_LSHIFT = 0xA0;
    private const int VK_RSHIFT = 0xA1;
    private const int VK_LWIN = 0x5B;
    private const int VK_RWIN = 0x5C;
    private const int VK_JARVIS_WIN = 0xFF;
    private static IntPtr hook = IntPtr.Zero;
    private static HookProc callback = Hook;
    private static bool[] keyDown = new bool[256];
    private static int[] pushToTalkKeys = new int[] { VK_MENU };
    private static int[] dictationKeys = new int[] { VK_CONTROL, VK_SHIFT };
    private static bool pushToTalkDown;
    private static bool dictationLatch;
    private static HttpClient client;
    private static string endpoint;
    private static string dictationEndpoint;
    private static string configEndpoint;
    private static Timer heartbeat;
    private static Timer dictationPoll;
    private static Timer configPoll;
    private static int dictationBusy;
    private static int configBusy;
    private static string configSignature = "";
    private static long lastDictationId;

    public static void Run(string baseUrl, string token) {
        endpoint = baseUrl.TrimEnd('/') + "/api/voice-os/hotkey";
        dictationEndpoint = baseUrl.TrimEnd('/') + "/api/voice-os/bridge/dictation";
        configEndpoint = baseUrl.TrimEnd('/') + "/api/voice-os/bridge/config";
        client = new HttpClient();
        if (!String.IsNullOrWhiteSpace(token)) client.DefaultRequestHeaders.Add("x-jarvis-bridge-token", token);
        heartbeat = new Timer(_ => Post("hotkey.heartbeat"), null, 0, 5000);
        dictationPoll = new Timer(_ => PollDictation(), null, 250, 150);
        configPoll = new Timer(_ => PollConfig(), null, 0, 1000);
        using (Process current = Process.GetCurrentProcess())
        using (ProcessModule module = current.MainModule) hook = SetWindowsHookEx(WH_KEYBOARD_LL, callback, GetModuleHandle(module.ModuleName), 0);
        if (hook == IntPtr.Zero) throw new InvalidOperationException("Unable to install the Windows keyboard hook.");
        MSG message;
        while (GetMessage(out message, IntPtr.Zero, 0, 0) != 0) { TranslateMessage(ref message); DispatchMessage(ref message); }
        heartbeat.Dispose();
        dictationPoll.Dispose();
        configPoll.Dispose();
        UnhookWindowsHookEx(hook);
    }

    private static IntPtr Hook(int code, IntPtr message, IntPtr data) {
        if (code >= 0) {
            int key = Marshal.ReadInt32(data);
            bool down = message == (IntPtr)WM_KEYDOWN || message == (IntPtr)WM_SYSKEYDOWN;
            bool up = message == (IntPtr)WM_KEYUP || message == (IntPtr)WM_SYSKEYUP;
            if (key >= 0 && key < keyDown.Length) keyDown[key] = down ? true : up ? false : keyDown[key];
            if (key == VK_LCONTROL || key == VK_RCONTROL) keyDown[VK_CONTROL] = down ? true : up ? (keyDown[VK_LCONTROL] || keyDown[VK_RCONTROL]) : keyDown[VK_CONTROL];
            if (key == VK_LSHIFT || key == VK_RSHIFT) keyDown[VK_SHIFT] = down ? true : up ? (keyDown[VK_LSHIFT] || keyDown[VK_RSHIFT]) : keyDown[VK_SHIFT];
            if (key == VK_LMENU || key == VK_RMENU) keyDown[VK_MENU] = down ? true : up ? (keyDown[VK_LMENU] || keyDown[VK_RMENU]) : keyDown[VK_MENU];
            if (key == VK_LWIN || key == VK_RWIN) keyDown[VK_JARVIS_WIN] = down ? true : up ? (keyDown[VK_LWIN] || keyDown[VK_RWIN]) : keyDown[VK_JARVIS_WIN];
            bool dictationActive = true; foreach (int configuredKey in dictationKeys) if (!IsDown(configuredKey)) dictationActive = false;
            if (dictationActive && !dictationLatch) { dictationLatch = true; Post("hotkey.dictation.toggle"); }
            if (!dictationActive) dictationLatch = false;
            bool pushActive = true; foreach (int configuredKey in pushToTalkKeys) if (!IsDown(configuredKey)) pushActive = false;
            if (pushActive && !pushToTalkDown) { pushToTalkDown = true; Post("hotkey.ptt.start"); }
            if (!pushActive && pushToTalkDown) { pushToTalkDown = false; Post("hotkey.ptt.stop"); }
        }
        // This hook observes key state only. Swallowing even one modifier event can
        // leave Windows and the physical keyboard with different logical states.
        return CallNextHookEx(hook, code, message, data);
    }

    private static bool IsDown(int key) { return key >= 0 && key < keyDown.Length && keyDown[key]; }
    private static bool MatchesKey(int actual, int configured) {
        if (configured == VK_MENU) return actual == VK_MENU || actual == VK_LMENU || actual == VK_RMENU;
        if (configured == VK_CONTROL) return actual == VK_CONTROL || actual == VK_LCONTROL || actual == VK_RCONTROL;
        if (configured == VK_SHIFT) return actual == VK_SHIFT || actual == VK_LSHIFT || actual == VK_RSHIFT;
        if (configured == VK_JARVIS_WIN) return actual == VK_LWIN || actual == VK_RWIN;
        return actual == configured;
    }

    private static int KeyCode(string name) {
        string normalized = (name ?? "").Trim();
        if (normalized.Length == 1 && normalized[0] >= 'A' && normalized[0] <= 'Z') return (int)normalized[0];
        if (normalized.Length == 1 && normalized[0] >= '0' && normalized[0] <= '9') return (int)normalized[0];
        if (normalized.StartsWith("F")) { int number; if (Int32.TryParse(normalized.Substring(1), out number) && number >= 1 && number <= 24) return 0x70 + number - 1; }
        switch (normalized) {
            case "Alt": return VK_MENU; case "Ctrl": return VK_CONTROL; case "Shift": return VK_SHIFT; case "Win": return VK_JARVIS_WIN;
            case "Space": return 0x20; default: return 0;
        }
    }

    private static void PollConfig() {
        if (Interlocked.Exchange(ref configBusy, 1) == 1) return;
        try {
            HttpResponseMessage response = client.GetAsync(configEndpoint).Result;
            if (!response.IsSuccessStatusCode) return;
            string[] payload = response.Content.ReadAsStringAsync().Result.Split('|');
            if (payload.Length != 2) return;
            string[] pttNames = payload[0].Split('+'); int[] mappedPtt = new int[pttNames.Length];
            for (int index = 0; index < pttNames.Length; index++) { mappedPtt[index] = KeyCode(pttNames[index]); if (mappedPtt[index] == 0) return; }
            pushToTalkKeys = mappedPtt;
            string[] names = payload[1].Split('+'); int[] mapped = new int[names.Length];
            for (int index = 0; index < names.Length; index++) { mapped[index] = KeyCode(names[index]); if (mapped[index] == 0) return; }
            dictationKeys = mapped;
            string nextSignature = payload[0] + "|" + payload[1];
            if (nextSignature != configSignature) { configSignature = nextSignature; Post("hotkey.configured"); }
        } catch { }
        finally { Interlocked.Exchange(ref configBusy, 0); }
    }

    private static void Post(string type) {
        try { client.PostAsync(endpoint, new StringContent("{\"type\":\"" + type + "\"}", Encoding.UTF8, "application/json")); } catch { }
    }

    private static void PollDictation() {
        if (Interlocked.Exchange(ref dictationBusy, 1) == 1) return;
        try {
            HttpResponseMessage response = client.GetAsync(dictationEndpoint + "?after=" + lastDictationId).Result;
            if (!response.IsSuccessStatusCode || response.StatusCode == System.Net.HttpStatusCode.NoContent) return;
            string payload = response.Content.ReadAsStringAsync().Result;
            int split = payload.IndexOf(':');
            long id;
            if (split <= 0 || !Int64.TryParse(payload.Substring(0, split), out id)) return;
            string text = Encoding.UTF8.GetString(Convert.FromBase64String(payload.Substring(split + 1)));
            lastDictationId = id;
            SendUnicode(text + " ");
        } catch { }
        finally { Interlocked.Exchange(ref dictationBusy, 0); }
    }

    private static void SendUnicode(string text) {
        foreach (char character in text) {
            INPUT down = new INPUT(); down.type = 1; down.data.keyboard.wScan = character; down.data.keyboard.dwFlags = 0x0004;
            INPUT up = down; up.data.keyboard.dwFlags = 0x0004 | 0x0002;
            INPUT[] inputs = new INPUT[] { down, up };
            if (SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT))) != inputs.Length) {
                SendInput(1, new INPUT[] { up }, Marshal.SizeOf(typeof(INPUT)));
                Post("dictation.input_failed");
                return;
            }
        }
    }

    private delegate IntPtr HookProc(int code, IntPtr message, IntPtr data);
    [StructLayout(LayoutKind.Sequential)] private struct POINT { public int x; public int y; }
    [StructLayout(LayoutKind.Sequential)] private struct MSG { public IntPtr hwnd; public uint message; public UIntPtr wParam; public IntPtr lParam; public uint time; public POINT pt; }
    [StructLayout(LayoutKind.Sequential)] private struct INPUT { public uint type; public INPUTUNION data; }
    [StructLayout(LayoutKind.Explicit)] private struct INPUTUNION { [FieldOffset(0)] public KEYBDINPUT keyboard; [FieldOffset(0)] public MOUSEINPUT mouse; }
    [StructLayout(LayoutKind.Sequential)] private struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public UIntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] private struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public UIntPtr dwExtraInfo; }
    [DllImport("user32.dll", SetLastError=true)] private static extern IntPtr SetWindowsHookEx(int id, HookProc proc, IntPtr module, uint threadId);
    [DllImport("user32.dll")] private static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll")] private static extern int GetMessage(out MSG message, IntPtr window, uint min, uint max);
    [DllImport("user32.dll")] private static extern bool TranslateMessage(ref MSG message);
    [DllImport("user32.dll")] private static extern IntPtr DispatchMessage(ref MSG message);
    [DllImport("user32.dll", SetLastError=true)] private static extern uint SendInput(uint count, INPUT[] inputs, int size);
    [DllImport("kernel32.dll", CharSet=CharSet.Auto, SetLastError=true)] private static extern IntPtr GetModuleHandle(string name);
}
'@

try {
    Add-Type -TypeDefinition $source -ReferencedAssemblies System.Net.Http
    [JarvisVoiceHotkeys]::Run("http://127.0.0.1:$port", $bridgeToken)
} finally {
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
}
