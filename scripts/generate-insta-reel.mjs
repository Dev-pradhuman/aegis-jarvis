#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const exec = promisify(execFile);
const CWD = process.cwd();
const TMP_DIR = '/tmp/jarvis-insta-reel';
const DIST_DIR = path.join(CWD, 'dist');
const OUTPUT_VIDEO = path.join(DIST_DIR, 'aegis-jarvis-insta-reel.mp4');
const DESKTOP_VIDEO = '/home/pradhuman/Desktop/aegis-jarvis-insta-reel.mp4';
const BG_VIDEO = path.join(CWD, 'public/galaxy/blackhole.mp4');
const PIPER_BIN = path.join(CWD, 'bin/piper');
const PIPER_MODEL = path.join(CWD, '.cache/voice/piper-voice.onnx');
const FONT_PATH = '/usr/share/fonts/noto/NotoSans-Bold.ttf';
const MONO_FONT_PATH = '/usr/share/fonts/noto/NotoSansMono-Bold.ttf';

console.log('⚡ [Aegis-JARVIS] Initializing Instagram Reel Video Generator (1080x1920 @ 60fps)...');

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

// --------------------------------------------------------------------------
// 1. High-Contrast Bold Hook Badges
// --------------------------------------------------------------------------
function generateBadgeSvg(text, glowColor = '#00e5ff', yOffset = 230) {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    <defs>
      <filter id="badgeGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="8" result="blur"/>
        <feMerge>
          <feMergeNode in="blur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <g transform="translate(60, ${yOffset})">
      <rect width="960" height="96" rx="24" 
            fill="#080a10" fill-opacity="0.92" 
            stroke="${glowColor}" stroke-width="3" 
            filter="url(#badgeGlow)"/>
      <text x="480" y="60" 
            font-family="Noto Sans" font-size="30" font-weight="900" 
            fill="#ffffff" text-anchor="middle" letter-spacing="1.8">
        ${escapeXml(text)}
      </text>
    </g>
  </svg>
  `;
}

// Scene 4 Terminal Benchmark Overlay
function generateScene4ProofSvg() {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
    <defs>
      <filter id="glowGreenBig" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="12" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="glowCyanBig" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="12" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>

    <!-- TopBar Frame -->
    <g transform="translate(60, 60)">
      <rect width="960" height="64" rx="16" fill="#080a10" fill-opacity="0.85" stroke="rgba(255,255,255,0.14)" stroke-width="1.5"/>
      <circle cx="36" cy="32" r="7" fill="#10b981"/>
      <text x="60" y="38" font-family="Noto Sans Mono" font-size="16" font-weight="bold" fill="#ffffff" letter-spacing="2">J A R V I S</text>
      <text x="210" y="38" font-family="Noto Sans Mono" font-size="14" fill="#64748b">PERSONAL EXECUTION LAYER</text>
      <rect x="740" y="14" width="190" height="36" rx="10" fill="rgba(16,185,129,0.15)" stroke="#10b981" stroke-width="1.5"/>
      <text x="835" y="38" font-family="Noto Sans" font-size="14" font-weight="bold" fill="#34d399" text-anchor="middle">VERIFIED 100%</text>
    </g>

    <!-- Terminal Window Card -->
    <g transform="translate(60, 360)">
      <rect width="960" height="920" rx="24" fill="#050a12" fill-opacity="0.95" stroke="rgba(255,255,255,0.16)" stroke-width="2"/>
      
      <!-- Window Title Bar -->
      <rect width="960" height="54" rx="24" fill="#0f1926" fill-opacity="0.9"/>
      <circle cx="35" cy="27" r="7" fill="#ef4444"/>
      <circle cx="60" cy="27" r="7" fill="#f59e0b"/>
      <circle cx="85" cy="27" r="7" fill="#10b981"/>
      <text x="480" y="33" font-family="Noto Sans Mono" font-size="15" fill="#94a3b8" text-anchor="middle">
        pradhuman@archlinux: ~/projects/aegis-jarvis (phase45-brain-mode)
      </text>

      <!-- Terminal Body -->
      <g transform="translate(45, 95)" font-family="Noto Sans Mono" font-size="18">
        <text y="0" fill="#38bdf8" font-weight="bold">❯ npm test</text>
        <text y="35" fill="#64748b">JARVIS_TEST=1 node --test tests server src</text>
        
        <text y="85" fill="#10b981">✔ direct canonical API action creates a Run (20ms)</text>
        <text y="125" fill="#10b981">✔ simple audio commands route deterministically (44ms)</text>
        <text y="165" fill="#10b981">✔ AC1: executeModelToolLoop 7-step sequence passes (41ms)</text>
        <text y="205" fill="#10b981">✔ AC3: Social media queries route to browser tools (72ms)</text>
        <text y="245" fill="#10b981">✔ local model discovery grounded in endpoint (637ms)</text>
        <text y="285" fill="#10b981">✔ Screen &amp; Window Vision Intent Routing (37ms)</text>
        <text y="325" fill="#10b981">✔ Linux Screen Wayland &amp; Active Window Grim (5ms)</text>
        <text y="365" fill="#10b981">✔ AC1: resolveSpotifyTrack resolves zero search requests (4ms)</text>
        <text y="405" fill="#10b981">✔ AC2: playSpotifyTrack launches desktop player via D-Bus (18ms)</text>
        <text y="445" fill="#10b981">✔ AC4: routeRequest routes Spotify &amp; YouTube playback (34ms)</text>
        <text y="485" fill="#10b981">✔ AC1 &amp; AC2: playYouTubeVideo navigates &amp; clicks watch page (100ms)</text>
        <text y="525" fill="#10b981">✔ AC4: executeTool("whatsapp.send") dispatches cleanly (3609ms)</text>
        <text y="565" fill="#10b981">✔ serveStatic serves .mp4 with video/mp4 MIME &amp; range streams (2ms)</text>

        <!-- Final Test Stats Block -->
        <g transform="translate(0, 610)">
          <rect width="870" height="150" rx="16" fill="#081422" stroke="#10b981" stroke-width="2.5" filter="url(#glowGreenBig)"/>
          <text x="35" y="50" font-size="28" font-weight="900" fill="#10b981">ℹ tests 419</text>
          <text x="260" y="50" font-size="28" font-weight="900" fill="#10b981">ℹ pass 419 (100%)</text>
          <text x="610" y="50" font-size="28" font-weight="900" fill="#38bdf8">ℹ fail 0</text>
          <text x="35" y="105" font-size="20" fill="#94a3b8">ℹ duration_ms 20,282ms  •  0 skipped  •  0 cancelled</text>
        </g>
      </g>
    </g>

    <!-- Outro / Creator Hero Lockup -->
    <g transform="translate(60, 1340)">
      <rect width="960" height="310" rx="28" fill="#080e18" fill-opacity="0.95" stroke="#00e5ff" stroke-width="2.5" filter="url(#glowCyanBig)"/>
      
      <text x="480" y="70" font-family="Noto Sans" font-size="22" font-weight="bold" fill="#38bdf8" text-anchor="middle" letter-spacing="4">
        PROJECT COMPLETED &amp; VERIFIED
      </text>
      
      <text x="480" y="145" font-family="Noto Sans" font-size="54" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="3">
        AEGIS - JARVIS
      </text>

      <text x="480" y="205" font-family="Noto Sans" font-size="26" font-weight="700" fill="#ffb703" text-anchor="middle">
        Built from scratch by Pradhuman
      </text>

      <g transform="translate(230, 235)">
        <rect width="500" height="46" rx="12" fill="#040912" stroke="rgba(255,255,255,0.16)" stroke-width="1.5"/>
        <text x="250" y="30" font-family="Noto Sans Mono" font-size="18" fill="#94a3b8" text-anchor="middle">
          github.com/Dev-pradhuman/aegis-jarvis
        </text>
      </g>
    </g>
  </svg>
  `;
}

// --------------------------------------------------------------------------
// 2. Playwright Live UI Extraction
// --------------------------------------------------------------------------
async function captureLiveUiLayers() {
  console.log('1️⃣ Launching headless Chromium to capture live UI layers from http://127.0.0.1:8787...');
  
  const browser = await chromium.launch({
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.goto('http://127.0.0.1:8787', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.galaxy-home');
  await page.waitForTimeout(1000);

  // Helper to make body transparent and hide native HTML video
  const setTransparentBg = async () => {
    await page.evaluate(() => {
      document.body.style.background = 'transparent';
      document.documentElement.style.background = 'transparent';
      const gh = document.querySelector('.galaxy-home');
      if (gh) gh.style.background = 'transparent';
      const vid = document.querySelector('.galaxy-bg-video');
      if (vid) vid.style.display = 'none';
    });
  };

  await setTransparentBg();

  // Layer 1: State 1 Idle Home
  const scene1UiPng = path.join(TMP_DIR, 'scene1_ui.png');
  await page.screenshot({ path: scene1UiPng, omitBackground: true });
  console.log('   ✔ Captured Scene 1 Idle Home UI');

  // Layer 2A: State 1 with typed command
  const inputEl = await page.$('.command-card-input');
  if (inputEl) {
    await inputEl.fill("What's my system volume and play Starboy on Spotify");
  }
  await page.waitForTimeout(300);
  const scene2TypedPng = path.join(TMP_DIR, 'scene2_typed.png');
  await page.screenshot({ path: scene2TypedPng, omitBackground: true });

  // Layer 2B: State 2 Drawer Open with CLOUD
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('jarvis:toggle-chat'));
  });
  await page.waitForTimeout(600);
  const scene2CloudPng = path.join(TMP_DIR, 'scene2_cloud.png');
  await page.screenshot({ path: scene2CloudPng, omitBackground: true });

  // Layer 2C: State 2 Drawer Open with CLI AGENT
  const modeBtn = await page.$('[data-testid="execution-mode-toggle"]');
  if (modeBtn) {
    await modeBtn.click();
    await page.waitForTimeout(350);
  }
  const scene2CliPng = path.join(TMP_DIR, 'scene2_cli.png');
  await page.screenshot({ path: scene2CliPng, omitBackground: true });

  // Layer 2D: State 2 Drawer Open with LOCAL
  if (modeBtn) {
    await modeBtn.click();
    await page.waitForTimeout(350);
  }
  const scene2LocalPng = path.join(TMP_DIR, 'scene2_local.png');
  await page.screenshot({ path: scene2LocalPng, omitBackground: true });
  console.log('   ✔ Captured Scene 2 Split-Drawer & Tri-Mode Switch UI');

  // Layer 3: State 2 Chat Drawer with 31 Native Desktop Tools Execution
  await page.evaluate(() => {
    const log = document.querySelector('.chat-log');
    if (!log) return;
    log.innerHTML = `
      <div class="msg user">
        <div class="who"><span>Pradhuman</span><span class="time">10:42 PM</span></div>
        <div class="body">What's my system volume and play Starboy on Spotify</div>
      </div>
      <div class="msg jarvis">
        <div class="who"><span><span class="jarvis-avatar-circle">⭕</span>JARVIS</span><span class="time">10:42 PM</span></div>
        <div class="body">
          <div style="margin-bottom:8px; font-weight:600; color:#38bdf8;">⚡ Autonomous Desktop Execution:</div>
          <div style="font-family:'Share Tech Mono', monospace; font-size:12px; line-height:1.7; color:#93c5fd; background:rgba(0,0,0,0.38); padding:10px 12px; border-radius:10px; border:1px solid rgba(56,189,248,0.25); margin-bottom:8px;">
            <div><span style="color:#10b981;">✔</span> <strong>audio.get_volume</strong>: 65% [PipeWire wpctl]</div>
            <div><span style="color:#10b981;">✔</span> <strong>spotify.play</strong>: 'Starboy' [xdg-open + playerctl]</div>
            <div><span style="color:#10b981;">✔</span> <strong>screen.describe</strong>: Moondream 4B Vision Active</div>
          </div>
          <div style="color:#e2e8f0; font-size:13px; line-height:1.4;">System volume is 65%. Started Spotify playback for Starboy via keyless D-Bus. Display analyzed via Moondream local vision.</div>
        </div>
        <div class="active-run-progress" style="display:block; margin-top:10px;">
          <div class="active-run-label">
            <span style="color:#38bdf8;">Tool Sequence Complete</span>
            <span class="mono" style="color:#10b981;">100%</span>
          </div>
          <div class="active-run-bar">
            <div class="active-run-fill" style="width: 100%; background: linear-gradient(90deg, #10b981, #38bdf8);"></div>
          </div>
        </div>
      </div>
    `;
  });
  await page.waitForTimeout(300);
  const scene3ToolsPng = path.join(TMP_DIR, 'scene3_tools.png');
  await page.screenshot({ path: scene3ToolsPng, omitBackground: true });
  console.log('   ✔ Captured Scene 3 31 Native Desktop Tools UI');

  await browser.close();

  // Reset execution mode back to cloud on server
  try {
    await fetch('http://127.0.0.1:8787/api/models/execution-mode', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'cloud' }),
    });
  } catch {}

  return {
    scene1UiPng,
    scene2TypedPng,
    scene2CloudPng,
    scene2CliPng,
    scene2LocalPng,
    scene3ToolsPng
  };
}

// --------------------------------------------------------------------------
// 3. Synthesize Voiceover & Cyber Synth Bass Bed
// --------------------------------------------------------------------------
async function generateAudioTracks() {
  console.log('2️⃣ Generating JARVIS Voiceover via Piper TTS and Cyber Synth Bass Bed...');

  // Voiceover scripts corresponding to the 4 visual scenes
  const voScripts = [
    { text: 'Good evening, Pradhuman.', speed: 1.05 },
    { text: 'Running zero-spend across Cloud, isolated CLI Agent, and local Ollama vision.', speed: 1.12 },
    { text: 'All thirty-one desktop systems are online.', speed: 1.08 },
    { text: 'Four hundred nineteen automated tests verified.', speed: 1.05 }
  ];

  const voClips = [];
  for (let i = 0; i < voScripts.length; i++) {
    const rawWav = path.join(TMP_DIR, `vo_raw_${i + 1}.wav`);
    const finalWav = path.join(TMP_DIR, `vo_${i + 1}.wav`);
    
    await new Promise((resolve, reject) => {
      const proc = spawn(PIPER_BIN, ['-m', PIPER_MODEL, '-f', rawWav]);
      proc.stdin.write(voScripts[i].text);
      proc.stdin.end();
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`piper exited with ${code}`))));
      proc.on('error', reject);
    });

    await exec('ffmpeg', [
      '-y',
      '-i', rawWav,
      '-filter:a', `atempo=${voScripts[i].speed},volume=1.45`,
      finalWav
    ]);
    voClips.push(finalWav);
  }
  console.log('   ✔ Synthesized 4 JARVIS voiceover clips');

  // Cyberpunk analog bassline + pulse drone bed (24.0s duration) ducked at -14dB
  const synthBedAac = path.join(TMP_DIR, 'cyber_synth_bed.aac');
  await exec('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', "aevalsrc=exprs='0.32*sin(2*PI*(55 + 27.5*floor(mod(t*4\,4)))*t) + 0.22*sin(2*PI*45*t) + 0.25*sin(2*PI*110*t)*exp(-8*mod(t\,0.5)) + 0.15*sin(2*PI*880*t)*exp(-30*mod(t\,0.25))':s=48000:d=24",
    '-filter_complex', 'volume=-14dB,afade=t=in:ss=0:d=1.0,afade=t=out:st=22.5:d=1.5[a]',
    '-map', '[a]',
    '-c:a', 'aac',
    '-b:a', '192k',
    synthBedAac
  ]);
  console.log('   ✔ Synthesized 24.0s Cyberpunk Synth Bass Bed (-14dB)');

  return { voClips, synthBedAac };
}

// --------------------------------------------------------------------------
// 4. Render High-Retention Scene Badges
// --------------------------------------------------------------------------
async function generateSceneBadges() {
  console.log('3️⃣ Rendering High-Retention On-Screen Badges with resvg...');

  const badges = [
    { name: 'badge1', text: 'I BUILT A REAL LOCAL JARVIS ON ARCH LINUX', color: '#00e5ff' },
    { name: 'badge2', text: '3 EXECUTION MODES • $0.00 API COST', color: '#ff9d00' },
    { name: 'badge3', text: '31 LINUX DESKTOP TOOLS • KEYLESS SPOTIFY & VISION', color: '#10b981' },
    { name: 'badge4', text: '419/419 TESTS PASSING • BUILT BY PRADHUMAN', color: '#38bdf8' }
  ];

  const badgeFiles = [];
  for (const b of badges) {
    const svgPath = path.join(TMP_DIR, `${b.name}.svg`);
    const pngPath = path.join(TMP_DIR, `${b.name}.png`);
    await fs.writeFile(svgPath, generateBadgeSvg(b.text, b.color, 240));
    await exec('resvg', [svgPath, pngPath, '-w', '1080', '-h', '1920']);
    badgeFiles.push(pngPath);
  }

  // Scene 4 Proof Terminal Overlay
  const scene4Svg = path.join(TMP_DIR, 'scene4_proof.svg');
  const scene4Png = path.join(TMP_DIR, 'scene4_proof.png');
  await fs.writeFile(scene4Svg, generateScene4ProofSvg());
  await exec('resvg', [scene4Svg, scene4Png, '-w', '1080', '-h', '1920']);

  console.log('   ✔ Rendered lossless 1080x1920 badges and terminal proof layer');
  return { badgeFiles, scene4Png };
}

// --------------------------------------------------------------------------
// 5. Video Scene Rendering (60fps H.264)
// --------------------------------------------------------------------------
async function renderVideoScenes(uiLayers, badges, voClips, scene4Png) {
  console.log('4️⃣ Compositing 60fps video scenes over 4K Event Horizon black hole backdrop...');

  // ------------------------------------------------------------------------
  // Scene 1: The Hook (0s - 5s, duration: 5.0s)
  // Centered black hole video + State 1 Idle Home UI + Badge 1
  // ------------------------------------------------------------------------
  console.log('   • Rendering Scene 1 (The Hook: State 1 Idle Home)...');
  const s1Mp4 = path.join(TMP_DIR, 's1.mp4');
  await exec('ffmpeg', [
    '-y',
    '-ss', '0', '-t', '5.0', '-i', BG_VIDEO,
    '-loop', '1', '-i', uiLayers.scene1UiPng,
    '-loop', '1', '-i', badges[0],
    '-i', voClips[0],
    '-filter_complex',
    `[0:v]scale=3413:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-1080)/2:(in_h-1920)/2,fps=60[bg];
     [bg][1:v]overlay=0:0[v1];
     [v1][2:v]overlay=0:0[vout];
     [3:a]adelay=400|400,volume=1.4[aout]`,
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-r', '60',
    '-c:a', 'aac', '-b:a', '192k',
    '-t', '5.0',
    s1Mp4
  ]);

  // ------------------------------------------------------------------------
  // Scene 2: State 2 Split-Drawer + Tri-Mode Switching (5s - 11s, duration: 6.0s)
  // Black hole glides 10% right, Command pill types -> Drawer opens -> Cycles Cloud/CLI/Local
  // ------------------------------------------------------------------------
  console.log('   • Rendering Scene 2 (Split-Drawer + Tri-Mode Switching)...');
  const s2Mp4 = path.join(TMP_DIR, 's2.mp4');
  await exec('ffmpeg', [
    '-y',
    '-ss', '5.0', '-t', '6.0', '-i', BG_VIDEO,
    '-loop', '1', '-i', uiLayers.scene2TypedPng,
    '-loop', '1', '-i', uiLayers.scene2CloudPng,
    '-loop', '1', '-i', uiLayers.scene2CliPng,
    '-loop', '1', '-i', uiLayers.scene2LocalPng,
    '-loop', '1', '-i', badges[1],
    '-i', voClips[1],
    '-filter_complex',
    `[0:v]scale=3413:1920:force_original_aspect_ratio=increase,
          crop=1080:1920:'(in_w-1080)/2 - min(108, t*180)':(in_h-1920)/2,fps=60[bg];
     [bg][1:v]overlay=0:0:enable='between(t,0,1.4)'[v1];
     [v1][2:v]overlay=0:0:enable='between(t,1.4,3.0)'[v2];
     [v2][3:v]overlay=0:0:enable='between(t,3.0,4.5)'[v3];
     [v3][4:v]overlay=0:0:enable='gte(t,4.5)'[v4];
     [v4][5:v]overlay=0:0[vout];
     [6:a]adelay=300|300,volume=1.4[aout]`,
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-r', '60',
    '-c:a', 'aac', '-b:a', '192k',
    '-t', '6.0',
    s2Mp4
  ]);

  // ------------------------------------------------------------------------
  // Scene 3: 31 Native Desktop Tools Execution (11s - 18s, duration: 7.0s)
  // Shifted black hole + Frosted glass chat drawer with 3 tools + 100% progress
  // ------------------------------------------------------------------------
  console.log('   • Rendering Scene 3 (31 Native Desktop Tools Execution)...');
  const s3Mp4 = path.join(TMP_DIR, 's3.mp4');
  await exec('ffmpeg', [
    '-y',
    '-ss', '10.0', '-t', '7.0', '-i', BG_VIDEO,
    '-loop', '1', '-i', uiLayers.scene3ToolsPng,
    '-loop', '1', '-i', badges[2],
    '-i', voClips[2],
    '-filter_complex',
    `[0:v]scale=3413:1920:force_original_aspect_ratio=increase,
          crop=1080:1920:'(in_w-1080)/2 - 108':(in_h-1920)/2,fps=60[bg];
     [bg][1:v]overlay=0:0[v1];
     [v1][2:v]overlay=0:0[vout];
     [3:a]adelay=400|400,volume=1.4[aout]`,
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-r', '60',
    '-c:a', 'aac', '-b:a', '192k',
    '-t', '7.0',
    s3Mp4
  ]);

  // ------------------------------------------------------------------------
  // Scene 4: Engineering Proof & Sign-Off (18s - 24s, duration: 6.0s)
  // Slow cinematic zoom + 419/419 test suite + Built by Pradhuman watermark
  // ------------------------------------------------------------------------
  console.log('   • Rendering Scene 4 (Engineering Proof: 419/419 Tests Passing)...');
  const s4Mp4 = path.join(TMP_DIR, 's4.mp4');
  await exec('ffmpeg', [
    '-y',
    '-ss', '0', '-t', '6.0', '-i', BG_VIDEO,
    '-loop', '1', '-i', scene4Png,
    '-loop', '1', '-i', badges[3],
    '-i', voClips[3],
    '-filter_complex',
    `[0:v]scale=3413:1920:force_original_aspect_ratio=increase,
          crop=1080:1920:(in_w-1080)/2:(in_h-1920)/2,fps=60[bg];
     [bg][1:v]overlay=0:0[v1];
     [v1][2:v]overlay=0:0[vout];
     [3:a]adelay=400|400,volume=1.4[aout]`,
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-r', '60',
    '-c:a', 'aac', '-b:a', '192k',
    '-t', '6.0',
    s4Mp4
  ]);

  console.log('   ✔ All 4 video scenes rendered at 1080x1920 @ 60fps');
  return [s1Mp4, s2Mp4, s3Mp4, s4Mp4];
}

// --------------------------------------------------------------------------
// 6. Final Concatenation & Master Audio Mix (AC3)
// --------------------------------------------------------------------------
async function assembleMasterReel(sceneClips, synthBedAac) {
  console.log('5️⃣ Assembling master reel with slow preset, CRF 18, and cyber synth pulse mix...');

  const concatList = path.join(TMP_DIR, 'concat_list.txt');
  await fs.writeFile(
    concatList,
    sceneClips.map((c) => `file '${c}'`).join('\n') + '\n'
  );

  const concatenatedVideo = path.join(TMP_DIR, 'concatenated_scenes.mp4');
  await exec('ffmpeg', [
    '-y',
    '-f', 'concat', '-safe', '0', '-i', concatList,
    '-c', 'copy',
    concatenatedVideo
  ]);

  // Master Encoding: High-fidelity libx264 CRF 18, 60fps, 1080x1920, with audio mix
  await exec('ffmpeg', [
    '-y',
    '-i', concatenatedVideo,
    '-i', synthBedAac,
    '-t', '24.0',
    '-filter_complex',
    `[0:a]volume=1.2[vo];
     [1:a]volume=1.0[synth];
     [vo][synth]amix=inputs=2:duration=first:dropout_transition=2[aout]`,
    '-map', '0:v',
    '-map', '[aout]',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-r', '60',
    '-s', '1080x1920',
    '-c:a', 'aac',
    '-b:a', '192k',
    OUTPUT_VIDEO
  ]);

  console.log(`   ✔ Master Instagram Reel rendered to: ${OUTPUT_VIDEO}`);

  // Copy convenience copy to Desktop
  await fs.copyFile(OUTPUT_VIDEO, DESKTOP_VIDEO);
  console.log(`   ✔ Convenience copy saved to: ${DESKTOP_VIDEO}`);

  // Verification with ffprobe
  console.log('6️⃣ Verifying output with ffprobe...');
  const { stdout: probeOut } = await exec('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration,size',
    '-show_entries', 'stream=width,height,codec_name,r_frame_rate',
    '-of', 'json',
    OUTPUT_VIDEO
  ]);

  const probe = JSON.parse(probeOut);
  const videoStream = probe.streams?.find((s) => s.codec_name === 'h264');
  const audioStream = probe.streams?.find((s) => s.codec_name === 'aac');
  const duration = parseFloat(probe.format?.duration || 0);
  const sizeBytes = parseInt(probe.format?.size || 0, 10);
  const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);

  console.log('\n📊 Reel Verification Specifications:');
  console.log(`   • Resolution : ${videoStream?.width}x${videoStream?.height} (9:16 vertical)`);
  console.log(`   • Framerate  : ${videoStream?.r_frame_rate} (60fps)`);
  console.log(`   • Video Codec: ${videoStream?.codec_name}`);
  console.log(`   • Audio Codec: ${audioStream?.codec_name} (192kbps AAC)`);
  console.log(`   • Duration   : ${duration.toFixed(2)}s (Target: 20–26s)`);
  console.log(`   • File Size  : ${sizeMB} MB (Target: > 2MB)`);

  if (
    videoStream?.width === 1080 &&
    videoStream?.height === 1920 &&
    videoStream?.codec_name === 'h264' &&
    audioStream?.codec_name === 'aac' &&
    duration >= 20 &&
    duration <= 26 &&
    sizeBytes > 2 * 1024 * 1024
  ) {
    console.log('\n🚀 ALL ACCEPTANCE CRITERIA VERIFIED 100%!');
  } else {
    throw new Error('Verification failed against acceptance criteria constraints.');
  }
}

// --------------------------------------------------------------------------
// Main Pipeline
// --------------------------------------------------------------------------
async function main() {
  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.mkdir(DIST_DIR, { recursive: true });

  const uiLayers = await captureLiveUiLayers();
  const { voClips, synthBedAac } = await generateAudioTracks();
  const { badgeFiles, scene4Png } = await generateSceneBadges();
  const sceneClips = await renderVideoScenes(uiLayers, badgeFiles, voClips, scene4Png);
  await assembleMasterReel(sceneClips, synthBedAac);
}

main().catch((err) => {
  console.error('❌ Video generation failed:', err);
  process.exit(1);
});
