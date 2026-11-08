#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const CWD = process.cwd();
const TMP_DIR = '/tmp/jarvis-reel';
const DIST_DIR = path.join(CWD, 'dist');
const OUTPUT_VIDEO = path.join(DIST_DIR, 'aegis-jarvis-showcase.mp4');
const BGM_PATH = path.join(CWD, 'brag-output/composition/assets/music/bgm.mp3');
const PIPER_BIN = path.join(CWD, 'bin/piper');
const PIPER_MODEL = path.join(CWD, '.cache/voice/piper-voice.onnx');
const FONT_PATH = '/usr/share/fonts/noto/NotoSans-Bold.ttf';
const MONO_FONT_PATH = '/usr/share/fonts/noto/NotoSansMono-Bold.ttf';

console.log('⚡ [Aegis-JARVIS] Initializing Instagram Reel Video Generator (1080x1920 @ 60fps)...');

// 1. Scene Durations & Script
const SCENES = [
  {
    id: 'scene1',
    duration: 5.8,
    title: 'AEGIS-JARVIS // AUTONOMOUS LINUX COMPANION',
    subtitle: 'Sovereign Desktop AI Built for Arch Linux & Hyprland',
    voText: 'Meet Aegis JARVIS. The sovereign, local first Linux desktop companion for Arch Linux and Hyprland.'
  },
  {
    id: 'scene2',
    duration: 7.2,
    title: 'TRI-MODE EXECUTION // SUB-SECOND SWITCHING',
    subtitle: 'Instant Toggle: ☁️ CLOUD  |  ⚡ CLI AGENT  |  💻 LOCAL',
    voText: 'Instant tri-mode execution. Switch sub-second between Cloud APIs, Antigravity CLI agents, and offline local AI.'
  },
  {
    id: 'scene3',
    duration: 6.8,
    title: 'OFFLINE MOONDREAM VISION & ZERO-KEY SPOTIFY D-BUS',
    subtitle: 'Multimodal Screen Perception + Linux MPRIS Desktop Control',
    voText: 'Offline Moondream vision perceives your screen, while zero-key Spotify control commands playback directly over Linux D-Bus.'
  },
  {
    id: 'scene4',
    duration: 6.7,
    title: '418/418 TESTS PASSING // 100% RELIABILITY',
    subtitle: 'Built From Scratch By Pradhuman',
    voText: 'Four hundred eighteen tests passing, zero cloud lock-in, and pure systemd stability. Built from scratch by Pradhuman.'
  }
];

// Helper to escape SVG text
function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

// Common SVG Header Elements
function renderCommonHeader(activeMode = 'cloud') {
  return `
    <!-- Top System Bar -->
    <rect x="60" y="70" width="960" height="74" rx="16" fill="#0d1522" stroke="#1f334d" stroke-width="2"/>
    <circle cx="100" cy="107" r="8" fill="#00ff88"/>
    <text x="125" y="113" font-family="Noto Sans" font-size="22" font-weight="bold" fill="#00ff88" letter-spacing="2">ONLINE</text>
    <text x="250" y="113" font-family="Noto Sans Mono" font-size="20" fill="#7a92b0">JARVIS // SYSTEM ARCHITECTURE</text>
    
    <!-- Mode Button in Header -->
    <rect x="760" y="82" width="240" height="50" rx="12" 
          fill="${activeMode === 'cli' ? '#ff9d00' : activeMode === 'local' ? '#00e5ff' : '#0077b6'}" 
          fill-opacity="0.2" 
          stroke="${activeMode === 'cli' ? '#ff9d00' : activeMode === 'local' ? '#00e5ff' : '#00b4d8'}" 
          stroke-width="2.5"/>
    <text x="880" y="114" font-family="Noto Sans" font-size="20" font-weight="bold" 
          fill="${activeMode === 'cli' ? '#ffb333' : activeMode === 'local' ? '#5ce1e6' : '#90e0ef'}" 
          text-anchor="middle">
      ${activeMode === 'cli' ? '⚡ CLI AGENT' : activeMode === 'local' ? '💻 LOCAL' : '☁️ CLOUD'}
    </text>

    <!-- Telemetry Ticker -->
    <g transform="translate(60, 165)">
      <rect width="960" height="46" rx="10" fill="#090f17" stroke="#142132" stroke-width="1.5"/>
      <text x="30" y="30" font-family="Noto Sans Mono" font-size="17" fill="#64748b">CPU: <tspan fill="#00ff88" font-weight="bold">14%</tspan></text>
      <text x="180" y="30" font-family="Noto Sans Mono" font-size="17" fill="#64748b">RAM: <tspan fill="#38bdf8" font-weight="bold">38% (6.1G)</tspan></text>
      <text x="400" y="30" font-family="Noto Sans Mono" font-size="17" fill="#64748b">OS: <tspan fill="#e2e8f0">Arch Linux (Hyprland)</tspan></text>
      <text x="760" y="30" font-family="Noto Sans Mono" font-size="17" fill="#64748b">DAEMON: <tspan fill="#00ff88">active (PID 45471)</tspan></text>
    </g>
  `;
}

// --------------------------------------------------------------------------
// Scene 1: Hook (Galaxy HUD + Dynamic Waveform)
// --------------------------------------------------------------------------
function generateScene1Svg() {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    <defs>
      <radialGradient id="bgGrad" cx="50%" cy="45%" r="70%">
        <stop offset="0%" stop-color="#0a1a2f"/>
        <stop offset="50%" stop-color="#060e1a"/>
        <stop offset="100%" stop-color="#03060a"/>
      </radialGradient>
      <radialGradient id="coreGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#00f5ff" stop-opacity="0.9"/>
        <stop offset="40%" stop-color="#0077b6" stop-opacity="0.5"/>
        <stop offset="80%" stop-color="#03045e" stop-opacity="0.2"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
      <filter id="glowCyan" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="8" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>

    <!-- Deep Space Canvas -->
    <rect width="1080" height="1920" fill="url(#bgGrad)"/>

    <!-- Subtle Tech Grid Lines -->
    <g stroke="#0f2137" stroke-width="1" opacity="0.4">
      ${Array.from({ length: 19 }, (_, i) => `<line x1="0" y1="${i * 100}" x2="1080" y2="${i * 100}"/>`).join('')}
      ${Array.from({ length: 11 }, (_, i) => `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="1920"/>`).join('')}
    </g>

    ${renderCommonHeader('cloud')}

    <!-- Central Holographic Reactor Core -->
    <g transform="translate(540, 680)">
      <circle r="360" fill="url(#coreGrad)"/>
      <circle r="280" fill="none" stroke="#00e5ff" stroke-width="2" stroke-dasharray="14 10" opacity="0.6"/>
      <circle r="220" fill="none" stroke="#ff9d00" stroke-width="3" stroke-dasharray="60 40 20 40" opacity="0.8"/>
      <circle r="160" fill="none" stroke="#00e5ff" stroke-width="4" filter="url(#glowCyan)"/>
      <circle r="90" fill="#00182b" stroke="#00f5ff" stroke-width="3"/>
      <polygon points="0,-70 60,35 -60,35" fill="none" stroke="#00e5ff" stroke-width="2" opacity="0.7"/>
      <polygon points="0,70 60,-35 -60,-35" fill="none" stroke="#ff9d00" stroke-width="2" opacity="0.7"/>
      <circle r="30" fill="#00f5ff" filter="url(#glowCyan)"/>

      <!-- Orbital Tech Markers -->
      <text x="0" y="-300" font-family="Noto Sans Mono" font-size="16" fill="#00e5ff" text-anchor="middle" letter-spacing="3">CORE FREQ // 48.0 KHz</text>
      <text x="0" y="325" font-family="Noto Sans Mono" font-size="16" fill="#38bdf8" text-anchor="middle" letter-spacing="3">NEURAL STATE // ACTIVE</text>
      <text x="-310" y="5" font-family="Noto Sans Mono" font-size="14" fill="#64748b" text-anchor="middle">270°</text>
      <text x="310" y="5" font-family="Noto Sans Mono" font-size="14" fill="#64748b" text-anchor="middle">090°</text>
    </g>

    <!-- Floating Dynamic Island Audio Card -->
    <g transform="translate(80, 1120)">
      <rect width="920" height="240" rx="24" fill="#0c1726" fill-opacity="0.85" stroke="#00e5ff" stroke-width="2.5" filter="url(#glowCyan)"/>
      
      <circle cx="50" cy="50" r="10" fill="#00ff88"/>
      <text x="75" y="57" font-family="Noto Sans" font-size="22" font-weight="bold" fill="#ffffff" letter-spacing="1">DYNAMIC ISLAND // HOST AUDIO HUD</text>
      <text x="860" y="57" font-family="Noto Sans Mono" font-size="18" fill="#38bdf8" text-anchor="end">PIPEWIRE STEREO</text>

      <!-- Live Pulsing Audio Waveform -->
      <g transform="translate(45, 110)">
        ${[18, 35, 60, 42, 85, 110, 75, 45, 95, 120, 90, 65, 130, 80, 50, 105, 125, 95, 70, 115, 60, 40, 85, 100, 75, 45, 65, 90, 55, 35, 20]
          .map((h, i) => `
            <rect x="${i * 27}" y="${70 - h / 2}" width="16" height="${h}" rx="8" 
                  fill="${i % 2 === 0 ? '#00e5ff' : '#ff9d00'}" 
                  fill-opacity="0.9" />
          `).join('')}
      </g>

      <text x="460" y="210" font-family="Noto Sans Mono" font-size="19" fill="#94a3b8" text-anchor="middle">
        🎙️ Listening for wake word • PipeWire Low-Latency Capture
      </text>
    </g>

    <!-- Hero Identity Box -->
    <g transform="translate(80, 1400)">
      <rect width="920" height="280" rx="28" fill="#070f1a" fill-opacity="0.95" stroke="#1e293b" stroke-width="2"/>
      
      <text x="460" y="80" font-family="Noto Sans" font-size="52" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="4">
        AEGIS - JARVIS
      </text>
      
      <text x="460" y="135" font-family="Noto Sans" font-size="24" font-weight="500" fill="#38bdf8" text-anchor="middle">
        Autonomous Sovereign Linux Desktop AI Companion
      </text>

      <line x1="80" y1="175" x2="840" y2="175" stroke="#1e293b" stroke-width="1.5"/>

      <!-- Feature Tags -->
      <g transform="translate(60, 205)">
        <rect x="0" y="0" width="230" height="48" rx="10" fill="#0e2338" stroke="#00e5ff" stroke-width="1.5"/>
        <text x="115" y="31" font-family="Noto Sans" font-size="17" font-weight="bold" fill="#e0f2fe" text-anchor="middle">⚡ Arch Linux Native</text>

        <rect x="260" y="0" width="250" height="48" rx="10" fill="#0e2338" stroke="#ff9d00" stroke-width="1.5"/>
        <text x="385" y="31" font-family="Noto Sans" font-size="17" font-weight="bold" fill="#ffedd5" text-anchor="middle">🌌 Hyprland (Wayland)</text>

        <rect x="540" y="0" width="250" height="48" rx="10" fill="#0e2338" stroke="#00ff88" stroke-width="1.5"/>
        <text x="665" y="31" font-family="Noto Sans" font-size="17" font-weight="bold" fill="#dcfce7" text-anchor="middle">🛡️ 31 Native MCP Tools</text>
      </g>
    </g>
  </svg>
  `;
}

// --------------------------------------------------------------------------
// Scene 2: Tri-Mode Execution (Cloud, CLI Agent, Local)
// --------------------------------------------------------------------------
function generateScene2Svg(activeStep = 'cli') {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    <defs>
      <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0b1726"/>
        <stop offset="100%" stop-color="#050a12"/>
      </linearGradient>
      <filter id="glowBlue">
        <feGaussianBlur stdDeviation="6" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="glowAmber">
        <feGaussianBlur stdDeviation="8" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="glowGreen">
        <feGaussianBlur stdDeviation="8" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>

    <rect width="1080" height="1920" fill="#040810"/>
    ${renderCommonHeader(activeStep)}

    <!-- Scene Headline -->
    <g transform="translate(540, 290)">
      <text font-family="Noto Sans" font-size="44" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="3">
        TRI-MODE EXECUTION CORE
      </text>
      <text y="45" font-family="Noto Sans" font-size="22" fill="#7dd3fc" text-anchor="middle">
        Sub-Second Dynamic Switching Across 3 Computational Backends
      </text>
    </g>

    <!-- Card 1: ☁️ CLOUD API CASCADE -->
    <g transform="translate(80, 400)">
      <rect width="920" height="340" rx="24" fill="url(#cardGrad)" 
            stroke="${activeStep === 'cloud' ? '#00b4d8' : '#1e293b'}" 
            stroke-width="${activeStep === 'cloud' ? '3.5' : '1.5'}"
            ${activeStep === 'cloud' ? 'filter="url(#glowBlue)"' : ''}/>
      
      <rect x="40" y="35" width="220" height="48" rx="12" fill="#0077b6" fill-opacity="0.3" stroke="#00b4d8" stroke-width="1.5"/>
      <text x="150" y="67" font-family="Noto Sans" font-size="22" font-weight="bold" fill="#caf0f8" text-anchor="middle">☁️ CLOUD API</text>
      <text x="870" y="68" font-family="Noto Sans Mono" font-size="20" fill="#38bdf8" text-anchor="end">&lt; 1.2s Failover</text>

      <text x="45" y="130" font-family="Noto Sans" font-size="26" font-weight="bold" fill="#ffffff">
        High-Throughput Distributed Cascade
      </text>
      <text x="45" y="175" font-family="Noto Sans Mono" font-size="20" fill="#94a3b8">
        • Groq Llama 3.3 70B Versatile (Primary Reasoning)
      </text>
      <text x="45" y="215" font-family="Noto Sans Mono" font-size="20" fill="#94a3b8">
        • DeepSeek R1 &amp; Anthropic Claude 3.5 Sonnet Fallback
      </text>
      <text x="45" y="255" font-family="Noto Sans Mono" font-size="20" fill="#00ff88">
        • Strict Zero-Spend Audit ($0.00 / mo Enforced)
      </text>

      ${activeStep === 'cloud' ? `
        <rect x="40" y="285" width="840" height="34" rx="8" fill="#00b4d8" fill-opacity="0.15"/>
        <text x="460" y="308" font-family="Noto Sans Mono" font-size="16" font-weight="bold" fill="#38bdf8" text-anchor="middle">▶ CURRENTLY ACTIVE INFERENCE ROUTE</text>
      ` : ''}
    </g>

    <!-- Card 2: ⚡ CLI AGENT (ANTIGRAVITY CLI 1.5.1) -->
    <g transform="translate(80, 780)">
      <rect width="920" height="380" rx="24" fill="url(#cardGrad)" 
            stroke="${activeStep === 'cli' ? '#ff9d00' : '#1e293b'}" 
            stroke-width="${activeStep === 'cli' ? '4' : '1.5'}"
            ${activeStep === 'cli' ? 'filter="url(#glowAmber)"' : ''}/>
      
      <rect x="40" y="35" width="250" height="48" rx="12" fill="#d97706" fill-opacity="0.3" stroke="#ff9d00" stroke-width="1.5"/>
      <text x="165" y="67" font-family="Noto Sans" font-size="22" font-weight="bold" fill="#fef3c7" text-anchor="middle">⚡ CLI AGENT</text>
      <text x="870" y="68" font-family="Noto Sans Mono" font-size="20" fill="#fbbf24" text-anchor="end">~850ms Warm Context</text>

      <text x="45" y="130" font-family="Noto Sans" font-size="26" font-weight="bold" fill="#ffffff">
        Antigravity CLI 1.5.1 (Gemini 3.8 Flash)
      </text>
      <text x="45" y="175" font-family="Noto Sans Mono" font-size="20" fill="#94a3b8">
        • Isolated Sandbox Profile (<tspan fill="#f59e0b">HOME=~/.jarvis-cli-profile</tspan>)
      </text>
      <text x="45" y="215" font-family="Noto Sans Mono" font-size="20" fill="#94a3b8">
        • Session UUID Context Reuse (<tspan fill="#38bdf8">--conversation=&lt;uuid&gt;</tspan>)
      </text>
      <text x="45" y="255" font-family="Noto Sans Mono" font-size="20" fill="#94a3b8">
        • Custom JSON-RPC stdio MCP Bridge (<tspan fill="#00ff88">31 Native Tools</tspan>)
      </text>
      <text x="45" y="295" font-family="Noto Sans Mono" font-size="20" fill="#00ff88">
        • Direct Spoken TTS Audio to Host Speakers
      </text>

      ${activeStep === 'cli' ? `
        <rect x="40" y="325" width="840" height="34" rx="8" fill="#ff9d00" fill-opacity="0.2"/>
        <text x="460" y="348" font-family="Noto Sans Mono" font-size="16" font-weight="bold" fill="#fef08a" text-anchor="middle">▶ ACTIVE CLI EXECUTION ENGINE (WARM SESSION)</text>
      ` : ''}
    </g>

    <!-- Card 3: 💻 LOCAL SOVEREIGN ENGINE (OLLAMA DUAL-ENGINE) -->
    <g transform="translate(80, 1200)">
      <rect width="920" height="360" rx="24" fill="url(#cardGrad)" 
            stroke="${activeStep === 'local' ? '#00e5ff' : '#1e293b'}" 
            stroke-width="${activeStep === 'local' ? '3.5' : '1.5'}"
            ${activeStep === 'local' ? 'filter="url(#glowGreen)"' : ''}/>
      
      <rect x="40" y="35" width="220" height="48" rx="12" fill="#0d9488" fill-opacity="0.3" stroke="#00e5ff" stroke-width="1.5"/>
      <text x="150" y="67" font-family="Noto Sans" font-size="22" font-weight="bold" fill="#ccfbf1" text-anchor="middle">💻 LOCAL AI</text>
      <text x="870" y="68" font-family="Noto Sans Mono" font-size="20" fill="#2dd4bf" text-anchor="end">100% Offline</text>

      <text x="45" y="130" font-family="Noto Sans" font-size="26" font-weight="bold" fill="#ffffff">
        Dual-Engine Sovereign Architecture (Ollama)
      </text>
      <text x="45" y="175" font-family="Noto Sans Mono" font-size="20" fill="#94a3b8">
        • Reasoning/Tools: <tspan fill="#38bdf8">maternion/spark-x2.5-heretic:4b</tspan>
      </text>
      <text x="45" y="215" font-family="Noto Sans Mono" font-size="20" fill="#94a3b8">
        • Multimodal Vision: <tspan fill="#38bdf8">moondream:latest</tspan> (Desktop &amp; Window OCR)
      </text>
      <text x="45" y="255" font-family="Noto Sans Mono" font-size="20" fill="#94a3b8">
        • Air-Gapped Privacy: <tspan fill="#00ff88">Zero packets leave localhost</tspan>
      </text>
      <text x="45" y="295" font-family="Noto Sans Mono" font-size="20" fill="#00ff88">
        • Sub-15ms Tier-0 Deterministic Routing Bypass
      </text>

      ${activeStep === 'local' ? `
        <rect x="40" y="315" width="840" height="34" rx="8" fill="#00e5ff" fill-opacity="0.15"/>
        <text x="460" y="338" font-family="Noto Sans Mono" font-size="16" font-weight="bold" fill="#5eead4" text-anchor="middle">▶ FULLY OFFLINE SOVEREIGN INTELLIGENCE</text>
      ` : ''}
    </g>

    <!-- Bottom Latency Comparison Ribbon -->
    <g transform="translate(80, 1600)">
      <rect width="920" height="90" rx="16" fill="#091422" stroke="#1f334d" stroke-width="1.5"/>
      <text x="160" y="52" font-family="Noto Sans Mono" font-size="20" fill="#94a3b8">CLOUD: <tspan fill="#38bdf8" font-weight="bold">~1200ms</tspan></text>
      <text x="460" y="52" font-family="Noto Sans Mono" font-size="20" fill="#94a3b8">CLI AGENT: <tspan fill="#ff9d00" font-weight="bold">~850ms</tspan></text>
      <text x="760" y="52" font-family="Noto Sans Mono" font-size="20" fill="#94a3b8">TIER-0 TOOLS: <tspan fill="#00ff88" font-weight="bold">&lt; 15ms</tspan></text>
    </g>
  </svg>
  `;
}

// --------------------------------------------------------------------------
// Scene 3: Multimodal Moondream Vision & Zero-Key Spotify Playback
// --------------------------------------------------------------------------
function generateScene3Svg() {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    <defs>
      <linearGradient id="chatBg" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#08101a"/>
        <stop offset="100%" stop-color="#040810"/>
      </linearGradient>
      <filter id="glowSpotify">
        <feGaussianBlur stdDeviation="7" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>

    <rect width="1080" height="1920" fill="url(#chatBg)"/>
    ${renderCommonHeader('local')}

    <!-- Section Header -->
    <g transform="translate(540, 280)">
      <text font-family="Noto Sans" font-size="42" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="2">
        LOCAL PERCEPTION &amp; D-BUS TOOLS
      </text>
      <text y="42" font-family="Noto Sans" font-size="20" fill="#38bdf8" text-anchor="middle">
        Offline Multimodal Vision + Linux Native Hardware Automation
      </text>
    </g>

    <!-- Chat Flow Container -->
    <!-- 1. User Screen Perception Request -->
    <g transform="translate(140, 370)">
      <rect width="860" height="90" rx="20" fill="#0369a1" fill-opacity="0.3" stroke="#0284c7" stroke-width="2"/>
      <circle cx="50" cy="45" r="22" fill="#0284c7"/>
      <text x="50" y="52" font-family="Noto Sans" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="middle">YOU</text>
      <text x="95" y="53" font-family="Noto Sans" font-size="24" font-weight="600" fill="#ffffff">
        What am I doing on my screen right now?
      </text>
    </g>

    <!-- 2. JARVIS Moondream Vision Response Card -->
    <g transform="translate(80, 485)">
      <rect width="920" height="490" rx="24" fill="#081422" stroke="#00e5ff" stroke-width="2.5"/>
      
      <!-- Card Head -->
      <circle cx="45" cy="45" r="14" fill="#00e5ff"/>
      <text x="75" y="52" font-family="Noto Sans" font-size="20" font-weight="bold" fill="#38bdf8">
        👁️ MOONDREAM VISION // WAYLAND GRIM DESKTOP PERCEPTION
      </text>
      <text x="880" y="52" font-family="Noto Sans Mono" font-size="16" fill="#00ff88" text-anchor="end">
        LATENCY: 1.1s (LOCAL)
      </text>

      <!-- Mini Desktop Simulation Box -->
      <g transform="translate(45, 80)">
        <rect width="830" height="230" rx="12" fill="#03070d" stroke="#1e293b" stroke-width="1.5"/>
        
        <!-- Window 1: VS Code -->
        <rect x="25" y="25" width="450" height="180" rx="8" fill="#0f172a" stroke="#38bdf8" stroke-width="1.5"/>
        <text x="45" y="55" font-family="Noto Sans Mono" font-size="15" fill="#38bdf8">📁 server/spotify.js — Aegis-JARVIS</text>
        <rect x="45" y="70" width="300" height="12" rx="4" fill="#334155"/>
        <rect x="45" y="95" width="380" height="12" rx="4" fill="#1e293b"/>
        <rect x="45" y="120" width="220" height="12" rx="4" fill="#334155"/>
        <rect x="45" y="145" width="340" height="12" rx="4" fill="#1e293b"/>

        <!-- Bounding Box Visualizer -->
        <rect x="20" y="20" width="460" height="190" fill="none" stroke="#00ff88" stroke-width="2" stroke-dasharray="8 6"/>
        <rect x="20" y="2" width="130" height="22" rx="4" fill="#00ff88"/>
        <text x="85" y="18" font-family="Noto Sans Mono" font-size="12" font-weight="bold" fill="#000000" text-anchor="middle">VS CODE [0,0]</text>

        <!-- Window 2: Terminal -->
        <rect x="500" y="25" width="305" height="180" rx="8" fill="#020617" stroke="#10b981" stroke-width="1.5"/>
        <text x="520" y="55" font-family="Noto Sans Mono" font-size="14" fill="#10b981">❯ npm test</text>
        <text x="520" y="85" font-family="Noto Sans Mono" font-size="13" fill="#cbd5e1">✔ 418 tests pass</text>
        <text x="520" y="115" font-family="Noto Sans Mono" font-size="13" fill="#00ff88">✔ 0 failures (100%)</text>
        <text x="520" y="145" font-family="Noto Sans Mono" font-size="13" fill="#64748b">PID 45471 active</text>
      </g>

      <!-- Vision Descriptive Text -->
      <g transform="translate(45, 335)">
        <text font-family="Noto Sans" font-size="22" fill="#ffffff">
          "Active Hyprland Wayland desktop inspected via Grim socket."
        </text>
        <text y="35" font-family="Noto Sans" font-size="20" fill="#94a3b8">
          • Workspace 1: VS Code editing <tspan fill="#38bdf8">server/spotify.js</tspan> with Spotify resolver.
        </text>
        <text y="70" font-family="Noto Sans" font-size="20" fill="#94a3b8">
          • Terminal running Node.js test runner: <tspan fill="#00ff88">418 tests passing cleanly</tspan>.
        </text>
        <text y="105" font-family="Noto Sans" font-size="20" fill="#94a3b8">
          • Host System Load: Nominal at <tspan fill="#38bdf8">14% CPU</tspan>, PipeWire audio online.
        </text>
      </g>
    </g>

    <!-- 3. User Music Request -->
    <g transform="translate(140, 1010)">
      <rect width="860" height="90" rx="20" fill="#0369a1" fill-opacity="0.3" stroke="#0284c7" stroke-width="2"/>
      <circle cx="50" cy="45" r="22" fill="#0284c7"/>
      <text x="50" y="52" font-family="Noto Sans" font-size="16" font-weight="bold" fill="#ffffff" text-anchor="middle">YOU</text>
      <text x="95" y="53" font-family="Noto Sans" font-size="24" font-weight="600" fill="#ffffff">
        Play Starboy on Spotify
      </text>
    </g>

    <!-- 4. JARVIS Spotify D-Bus Execution Card -->
    <g transform="translate(80, 1125)">
      <rect width="920" height="420" rx="24" fill="#081422" stroke="#1db954" stroke-width="3" filter="url(#glowSpotify)"/>
      
      <!-- Card Head -->
      <circle cx="45" cy="45" r="14" fill="#1db954"/>
      <text x="75" y="52" font-family="Noto Sans" font-size="20" font-weight="bold" fill="#1db954">
        🎵 LINUX D-BUS MPRIS // spotify.play
      </text>
      <text x="880" y="52" font-family="Noto Sans Mono" font-size="16" fill="#00ff88" text-anchor="end">
        ZERO API KEYS REQUIRED
      </text>

      <!-- Music Info Widget -->
      <g transform="translate(45, 90)">
        <!-- Album Art / Vinyl -->
        <rect width="180" height="180" rx="18" fill="#111827" stroke="#1f2937" stroke-width="2"/>
        <circle cx="90" cy="90" r="70" fill="#090d16" stroke="#1db954" stroke-width="3"/>
        <circle cx="90" cy="90" r="25" fill="#1db954"/>

        <!-- Track Metadata -->
        <g transform="translate(220, 35)">
          <text font-family="Noto Sans" font-size="36" font-weight="900" fill="#ffffff">Starboy</text>
          <text y="42" font-family="Noto Sans" font-size="24" font-weight="600" fill="#1db954">The Weeknd, Daft Punk</text>
          
          <g transform="translate(0, 75)">
            <rect width="360" height="34" rx="8" fill="#1db954" fill-opacity="0.2"/>
            <text x="180" y="24" font-family="Noto Sans Mono" font-size="15" fill="#a7f3d0" text-anchor="middle">
              URI: spotify:track:2IY7eOUDjw2ArKYxKa2jXc
            </text>
          </g>
        </g>
      </g>

      <!-- Progress / Volume Bar -->
      <g transform="translate(45, 305)">
        <rect width="830" height="8" rx="4" fill="#1e293b"/>
        <rect width="320" height="8" rx="4" fill="#1db954"/>
        <circle cx="320" cy="4" r="8" fill="#ffffff"/>
        
        <text x="0" y="32" font-family="Noto Sans Mono" font-size="16" fill="#64748b">0:45</text>
        <text x="830" y="32" font-family="Noto Sans Mono" font-size="16" fill="#64748b" text-anchor="end">3:50</text>
      </g>

      <g transform="translate(45, 375)">
        <rect width="830" height="32" rx="8" fill="#0f291e"/>
        <text x="415" y="22" font-family="Noto Sans Mono" font-size="15" fill="#34d399" text-anchor="middle">
          ⚡ Launched via xdg-open &amp; playerctl -p spotify play (D-Bus Active)
        </text>
      </g>
    </g>

    <!-- Bottom Badge -->
    <g transform="translate(80, 1585)">
      <rect width="920" height="80" rx="16" fill="#091422" stroke="#1f334d" stroke-width="1.5"/>
      <text x="460" y="47" font-family="Noto Sans Mono" font-size="19" fill="#94a3b8" text-anchor="middle">
        🛡️ ZERO SPOTIFY API KEYS • ZERO PAID ACCOUNTS • PURE LINUX MPRIS
      </text>
    </g>
  </svg>
  `;
}

// --------------------------------------------------------------------------
// Scene 4: Engineering Proof (418/418 Tests Passing + Built By Pradhuman)
// --------------------------------------------------------------------------
function generateScene4Svg() {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    <defs>
      <linearGradient id="termBg" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#070c14"/>
        <stop offset="100%" stop-color="#020408"/>
      </linearGradient>
      <filter id="glowGreenBig">
        <feGaussianBlur stdDeviation="12" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>

    <rect width="1080" height="1920" fill="url(#termBg)"/>
    ${renderCommonHeader('local')}

    <!-- Section Header -->
    <g transform="translate(540, 275)">
      <text font-family="Noto Sans" font-size="44" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="3">
        ENGINEERING VERIFICATION
      </text>
      <text y="42" font-family="Noto Sans" font-size="21" fill="#00ff88" text-anchor="middle">
        100% Test Pass Rate Across 418 Automated Engineering Tests
      </text>
    </g>

    <!-- Terminal Window -->
    <g transform="translate(80, 360)">
      <rect width="920" height="840" rx="20" fill="#050a12" stroke="#1f2d3d" stroke-width="2"/>
      
      <!-- Window Title Bar -->
      <rect width="920" height="52" rx="20" fill="#0f1926"/>
      <circle cx="35" cy="26" r="7" fill="#ef4444"/>
      <circle cx="60" cy="26" r="7" fill="#f59e0b"/>
      <circle cx="85" cy="26" r="7" fill="#10b981"/>
      <text x="460" y="32" font-family="Noto Sans Mono" font-size="16" fill="#94a3b8" text-anchor="middle">
        pradhuman@archlinux: ~/projects/aegis-jarvis (phase45-brain-mode)
      </text>

      <!-- Terminal Body -->
      <g transform="translate(45, 95)" font-family="Noto Sans Mono" font-size="19">
        <text y="0" fill="#38bdf8" font-weight="bold">❯ npm test</text>
        <text y="35" fill="#64748b">JARVIS_TEST=1 node --test tests server src</text>
        
        <text y="85" fill="#10b981">✔ direct canonical API action creates a Run (20ms)</text>
        <text y="125" fill="#10b981">✔ simple audio commands route deterministically (44ms)</text>
        <text y="165" fill="#10b981">✔ AC1: executeModelToolLoop 7-step sequence passes (57ms)</text>
        <text y="205" fill="#10b981">✔ AC3: Social media queries route to browser tools (76ms)</text>
        <text y="245" fill="#10b981">✔ local model discovery grounded in endpoint (841ms)</text>
        <text y="285" fill="#10b981">✔ Screen &amp; Window Vision Intent Routing (50ms)</text>
        <text y="325" fill="#10b981">✔ Linux Screen Wayland &amp; Active Window Grim (4ms)</text>
        <text y="365" fill="#10b981">✔ AC1: resolveSpotifyTrack resolves zero search requests (5ms)</text>
        <text y="405" fill="#10b981">✔ AC2: playSpotifyTrack launches desktop player via D-Bus (25ms)</text>
        <text y="445" fill="#10b981">✔ AC4: routeRequest routes Spotify &amp; YouTube playback (28ms)</text>
        <text y="485" fill="#10b981">✔ AC1 &amp; AC2: playYouTubeVideo navigates &amp; clicks watch page (64ms)</text>
        <text y="525" fill="#10b981">✔ AC4: executeTool("whatsapp.send") dispatches cleanly (3608ms)</text>

        <!-- Final Test Stats Block -->
        <g transform="translate(0, 580)">
          <rect width="830" height="135" rx="14" fill="#0b1726" stroke="#00ff88" stroke-width="2"/>
          <text x="30" y="45" font-size="24" font-weight="bold" fill="#00ff88">ℹ tests 418</text>
          <text x="240" y="45" font-size="24" font-weight="bold" fill="#00ff88">ℹ pass 418 (100%)</text>
          <text x="560" y="45" font-size="24" font-weight="bold" fill="#38bdf8">ℹ fail 0</text>
          <text x="30" y="95" font-size="20" fill="#94a3b8">ℹ duration_ms 14,317ms  •  0 skipped  •  0 cancelled</text>
        </g>
      </g>
    </g>

    <!-- Glowing 100% Reliability Badge -->
    <g transform="translate(80, 1240)">
      <rect width="920" height="100" rx="20" fill="#052e16" stroke="#00ff88" stroke-width="3" filter="url(#glowGreenBig)"/>
      <text x="460" y="62" font-family="Noto Sans" font-size="34" font-weight="900" fill="#00ff88" text-anchor="middle" letter-spacing="3">
        418 / 418 TESTS PASSING • 100% RELIABILITY
      </text>
    </g>

    <!-- Outro / Creator Hero Lockup -->
    <g transform="translate(80, 1380)">
      <rect width="920" height="290" rx="28" fill="#091424" stroke="#00e5ff" stroke-width="2.5"/>
      
      <text x="460" y="70" font-family="Noto Sans" font-size="22" font-weight="bold" fill="#38bdf8" text-anchor="middle" letter-spacing="4">
        PROJECT COMPLETED &amp; SHIPPED
      </text>
      
      <text x="460" y="140" font-family="Noto Sans" font-size="52" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="3">
        AEGIS - JARVIS
      </text>

      <text x="460" y="195" font-family="Noto Sans" font-size="26" font-weight="700" fill="#ff9d00" text-anchor="middle">
        Built from scratch by Pradhuman
      </text>

      <g transform="translate(210, 225)">
        <rect width="500" height="42" rx="10" fill="#040912" stroke="#1e293b" stroke-width="1.5"/>
        <text x="250" y="27" font-family="Noto Sans Mono" font-size="18" fill="#94a3b8" text-anchor="middle">
          github.com/Dev-pradhuman/aegis-jarvis
        </text>
      </g>
    </g>
  </svg>
  `;
}

// --------------------------------------------------------------------------
// Orchestration & Assembly
// --------------------------------------------------------------------------
async function main() {
  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.mkdir(DIST_DIR, { recursive: true });

  console.log('1️⃣ Generating 1080x1920 high-fidelity scene graphics...');
  const scene1Svg = path.join(TMP_DIR, 'scene1.svg');
  const scene1Png = path.join(TMP_DIR, 'scene1.png');
  await fs.writeFile(scene1Svg, generateScene1Svg());
  await exec('resvg', [scene1Svg, scene1Png, '-w', '1080', '-h', '1920']);

  // Scene 2 has 3 sub-steps for smooth dynamic cycling
  const scene2ASvg = path.join(TMP_DIR, 'scene2a.svg');
  const scene2APng = path.join(TMP_DIR, 'scene2a.png');
  await fs.writeFile(scene2ASvg, generateScene2Svg('cloud'));
  await exec('resvg', [scene2ASvg, scene2APng, '-w', '1080', '-h', '1920']);

  const scene2BSvg = path.join(TMP_DIR, 'scene2b.svg');
  const scene2BPng = path.join(TMP_DIR, 'scene2b.png');
  await fs.writeFile(scene2BSvg, generateScene2Svg('cli'));
  await exec('resvg', [scene2BSvg, scene2BPng, '-w', '1080', '-h', '1920']);

  const scene2CSvg = path.join(TMP_DIR, 'scene2c.svg');
  const scene2CPng = path.join(TMP_DIR, 'scene2c.png');
  await fs.writeFile(scene2CSvg, generateScene2Svg('local'));
  await exec('resvg', [scene2CSvg, scene2CPng, '-w', '1080', '-h', '1920']);

  const scene3Svg = path.join(TMP_DIR, 'scene3.svg');
  const scene3Png = path.join(TMP_DIR, 'scene3.png');
  await fs.writeFile(scene3Svg, generateScene3Svg());
  await exec('resvg', [scene3Svg, scene3Png, '-w', '1080', '-h', '1920']);

  const scene4Svg = path.join(TMP_DIR, 'scene4.svg');
  const scene4Png = path.join(TMP_DIR, 'scene4.png');
  await fs.writeFile(scene4Svg, generateScene4Svg());
  await exec('resvg', [scene4Svg, scene4Png, '-w', '1080', '-h', '1920']);

  console.log('✅ Graphics rendered to lossless 1080x1920 PNGs.');

  // 2. Synthesize Piper TTS Voiceover Clips
  console.log('2️⃣ Synthesizing local voiceover clips via Piper TTS...');
  const voFiles = [];
  for (let i = 0; i < SCENES.length; i++) {
    const s = SCENES[i];
    const rawWav = path.join(TMP_DIR, `vo_raw_${i + 1}.wav`);
    const fastWav = path.join(TMP_DIR, `vo_fast_${i + 1}.wav`);

    await new Promise((resolve, reject) => {
      const proc = spawn(PIPER_BIN, ['-m', PIPER_MODEL, '-f', rawWav]);
      proc.stdin.write(s.voText);
      proc.stdin.end();
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`piper exited with ${code}`))));
      proc.on('error', reject);
    });

    // Apply 1.15x tempo for high-energy Instagram reel cadence
    await exec('ffmpeg', ['-y', '-i', rawWav, '-filter:a', 'atempo=1.15', fastWav]);
    voFiles.push(fastWav);
  }
  console.log('✅ Voiceover clips synthesized.');

  // 3. Render Individual Scene Video Segments with Pan/Zoom & Glowing Subtitles
  console.log('3️⃣ Rendering video scenes with ffmpeg drawtext cyber-glow overlays...');

  // Helper to write textfile for drawtext
  const writeTf = async (name, text) => {
    const p = path.join(TMP_DIR, `${name}.txt`);
    await fs.writeFile(p, text, 'utf-8');
    return p;
  };

  const t1A = await writeTf('t1_a', 'AEGIS-JARVIS // AUTONOMOUS LINUX COMPANION');
  const t1B = await writeTf('t1_b', 'Sovereign AI Built for Arch Linux & Hyprland');

  // Scene 1: 0 - 5.8s
  const s1Mp4 = path.join(TMP_DIR, 's1.mp4');
  await exec('ffmpeg', [
    '-y',
    '-loop', '1', '-i', scene1Png,
    '-i', voFiles[0],
    '-t', '5.8',
    '-filter_complex',
    `[0:v]scale=1080:1920,fps=60,
     drawtext=expansion=none:textfile=${t1A}:fontfile=${FONT_PATH}:fontsize=36:fontcolor=white:borderw=5:bordercolor=0x00e5ff@0.9:x=(w-text_w)/2:y=1730,
     drawtext=expansion=none:textfile=${t1B}:fontfile=${FONT_PATH}:fontsize=24:fontcolor=0x90e0ef:x=(w-text_w)/2:y=1785[v];
     [1:a]volume=1.4[a]`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast',
    '-c:a', 'aac', '-b:a', '192k',
    s1Mp4
  ]);

  // Scene 2: Tri-Mode Cycling (3 Sub-Clips: Cloud 2.4s, CLI 2.4s, Local 2.4s = 7.2s total)
  const t2Title = await writeTf('t2_title', 'TRI-MODE EXECUTION // SUB-SECOND SWITCHING');
  const t2SubA = await writeTf('t2_sub_a', 'Step 1: ☁️ Cloud Distributed Cascade');
  const t2SubB = await writeTf('t2_sub_b', 'Step 2: ⚡ Antigravity CLI Agent (Gemini 3.8 Flash)');
  const t2SubC = await writeTf('t2_sub_c', 'Step 3: 💻 Local Sovereign Ollama (100% Offline)');

  const s2aMp4 = path.join(TMP_DIR, 's2a.mp4');
  await exec('ffmpeg', [
    '-y', '-loop', '1', '-i', scene2APng, '-t', '2.4',
    '-vf', `scale=1080:1920,fps=60,drawtext=expansion=none:textfile=${t2Title}:fontfile=${FONT_PATH}:fontsize=36:fontcolor=white:borderw=5:bordercolor=0x00b4d8@0.9:x=(w-text_w)/2:y=1730,drawtext=expansion=none:textfile=${t2SubA}:fontfile=${FONT_PATH}:fontsize=24:fontcolor=0x90e0ef:x=(w-text_w)/2:y=1785`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', s2aMp4
  ]);

  const s2bMp4 = path.join(TMP_DIR, 's2b.mp4');
  await exec('ffmpeg', [
    '-y', '-loop', '1', '-i', scene2BPng, '-t', '2.4',
    '-vf', `scale=1080:1920,fps=60,drawtext=expansion=none:textfile=${t2Title}:fontfile=${FONT_PATH}:fontsize=36:fontcolor=white:borderw=5:bordercolor=0xff9d00@0.9:x=(w-text_w)/2:y=1730,drawtext=expansion=none:textfile=${t2SubB}:fontfile=${FONT_PATH}:fontsize=24:fontcolor=0xfef08a:x=(w-text_w)/2:y=1785`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', s2bMp4
  ]);

  const s2cMp4 = path.join(TMP_DIR, 's2c.mp4');
  await exec('ffmpeg', [
    '-y', '-loop', '1', '-i', scene2CPng, '-t', '2.4',
    '-vf', `scale=1080:1920,fps=60,drawtext=expansion=none:textfile=${t2Title}:fontfile=${FONT_PATH}:fontsize=36:fontcolor=white:borderw=5:bordercolor=0x00ff88@0.9:x=(w-text_w)/2:y=1730,drawtext=expansion=none:textfile=${t2SubC}:fontfile=${FONT_PATH}:fontsize=24:fontcolor=0xa7f3d0:x=(w-text_w)/2:y=1785`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', s2cMp4
  ]);

  // Concat Scene 2 Video & bind vo2
  const s2ConcatList = path.join(TMP_DIR, 's2_concat.txt');
  await fs.writeFile(s2ConcatList, `file '${s2aMp4}'\nfile '${s2bMp4}'\nfile '${s2cMp4}'\n`);
  const s2Mp4 = path.join(TMP_DIR, 's2.mp4');
  await exec('ffmpeg', [
    '-y',
    '-f', 'concat', '-safe', '0', '-i', s2ConcatList,
    '-i', voFiles[1],
    '-t', '7.2',
    '-filter_complex', '[1:a]volume=1.4[a]',
    '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k',
    s2Mp4
  ]);

  // Scene 3: 0 - 6.8s
  const t3Title = await writeTf('t3_title', 'OFFLINE VISION & ZERO-KEY SPOTIFY D-BUS');
  const t3Sub = await writeTf('t3_sub', 'Moondream Desktop OCR + Linux D-Bus MPRIS');
  const s3Mp4 = path.join(TMP_DIR, 's3.mp4');
  await exec('ffmpeg', [
    '-y',
    '-loop', '1', '-i', scene3Png,
    '-i', voFiles[2],
    '-t', '6.8',
    '-filter_complex',
    `[0:v]scale=1080:1920,fps=60,
     drawtext=expansion=none:textfile=${t3Title}:fontfile=${FONT_PATH}:fontsize=34:fontcolor=white:borderw=5:bordercolor=0x1db954@0.9:x=(w-text_w)/2:y=1730,
     drawtext=expansion=none:textfile=${t3Sub}:fontfile=${FONT_PATH}:fontsize=24:fontcolor=0xa7f3d0:x=(w-text_w)/2:y=1785[v];
     [1:a]volume=1.4[a]`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast',
    '-c:a', 'aac', '-b:a', '192k',
    s3Mp4
  ]);

  // Scene 4: 0 - 6.7s
  const t4Title = await writeTf('t4_title', '418/418 TESTS PASSING // 100% RELIABILITY');
  const t4Sub = await writeTf('t4_sub', 'Built from scratch by Pradhuman');
  const s4Mp4 = path.join(TMP_DIR, 's4.mp4');
  await exec('ffmpeg', [
    '-y',
    '-loop', '1', '-i', scene4Png,
    '-i', voFiles[3],
    '-t', '6.7',
    '-filter_complex',
    `[0:v]scale=1080:1920,fps=60,
     drawtext=expansion=none:textfile=${t4Title}:fontfile=${FONT_PATH}:fontsize=34:fontcolor=white:borderw=5:bordercolor=0x00ff88@0.9:x=(w-text_w)/2:y=1730,
     drawtext=expansion=none:textfile=${t4Sub}:fontfile=${FONT_PATH}:fontsize=26:fontcolor=0xffb333:x=(w-text_w)/2:y=1785[v];
     [1:a]volume=1.4[a]`,
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast',
    '-c:a', 'aac', '-b:a', '192k',
    s4Mp4
  ]);

  console.log('✅ Scene segments generated.');

  // 4. Concatenate All 4 Scenes
  console.log('4️⃣ Concatenating video segments and mixing cyber background music...');
  const masterConcatList = path.join(TMP_DIR, 'master_concat.txt');
  await fs.writeFile(masterConcatList, `file '${s1Mp4}'\nfile '${s2Mp4}'\nfile '${s3Mp4}'\nfile '${s4Mp4}'\n`);
  
  const rawMasterMp4 = path.join(TMP_DIR, 'master_raw.mp4');
  await exec('ffmpeg', [
    '-y',
    '-f', 'concat', '-safe', '0', '-i', masterConcatList,
    '-c', 'copy',
    rawMasterMp4
  ]);

  // Get total duration of the concatenated scenes
  const { stdout: durOut } = await exec('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    rawMasterMp4
  ]);
  const totalDuration = parseFloat(durOut.trim()) || 26.5;
  console.log(`⏱️ Total Showcase Duration: ${totalDuration.toFixed(2)}s`);

  // 5. Final Master Audio Mixing & Video Polish
  // Voice is boosted to 1.35x, BGM ducked to 0.18x (-15dB), with smooth 1.5s intro & 2.0s outro fade
  await exec('ffmpeg', [
    '-y',
    '-i', rawMasterMp4,
    '-i', BGM_PATH,
    '-t', String(totalDuration),
    '-filter_complex',
    `[1:a]volume=0.18,afade=t=in:ss=0:d=1.0,afade=t=out:st=${(totalDuration - 2.0).toFixed(2)}:d=2.0[bgm];
     [0:a]volume=1.35[vo];
     [vo][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
    '-map', '0:v',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '256k',
    OUTPUT_VIDEO
  ]);

  console.log('🎉 [Success] Master Instagram Reel rendered to:');
  console.log(`👉 ${OUTPUT_VIDEO}`);

  // 6. Verify with ffprobe
  const { stdout: probeOut } = await exec('ffprobe', [
    '-v', 'error',
    '-show_entries', 'stream=width,height,codec_name,r_frame_rate:format=duration,size',
    '-of', 'json',
    OUTPUT_VIDEO
  ]);
  console.log('📊 Video Specification Verification:');
  console.log(probeOut);
}

main().catch((err) => {
  console.error('❌ Video generation failed:', err);
  process.exit(1);
});
