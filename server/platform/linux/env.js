import fs from 'node:fs';
import path from 'node:path';

export function ensureLinuxDesktopEnv(env = process.env) {
  if (process.platform !== 'linux') return false;

  const uid = typeof process.getuid === 'function' ? process.getuid() : 1000;
  const runtimeDir = env.XDG_RUNTIME_DIR || `/run/user/${uid}`;
  if (!env.XDG_RUNTIME_DIR && fs.existsSync(runtimeDir)) {
    env.XDG_RUNTIME_DIR = runtimeDir;
    if (env !== process.env) process.env.XDG_RUNTIME_DIR = runtimeDir;
  }

  // 1. Detect WAYLAND_DISPLAY if missing (e.g. wayland-1, wayland-0)
  if (!env.WAYLAND_DISPLAY && fs.existsSync(runtimeDir)) {
    try {
      const files = fs.readdirSync(runtimeDir);
      const waylandSockets = files.filter((f) => /^wayland-\d+$/.test(f)).sort((a, b) => b.localeCompare(a));
      if (waylandSockets.length > 0) {
        env.WAYLAND_DISPLAY = waylandSockets[0];
        if (env !== process.env) process.env.WAYLAND_DISPLAY = waylandSockets[0];
      }
    } catch {}
  }

  // 2. Detect DISPLAY if missing (/tmp/.X11-unix/X*)
  if (!env.DISPLAY) {
    const x11Dir = '/tmp/.X11-unix';
    if (fs.existsSync(x11Dir)) {
      try {
        const xFiles = fs.readdirSync(x11Dir);
        const xSockets = xFiles.filter((f) => /^X\d+$/.test(f)).sort();
        if (xSockets.length > 0) {
          const displayNum = xSockets[0].slice(1);
          env.DISPLAY = `:${displayNum}`;
          if (env !== process.env) process.env.DISPLAY = `:${displayNum}`;
        }
      } catch {}
    }
  }

  // 3. Detect HYPRLAND_INSTANCE_SIGNATURE if missing
  if (!env.HYPRLAND_INSTANCE_SIGNATURE) {
    const candidateDirs = [
      path.join(runtimeDir, 'hypr'),
      '/tmp/hypr',
    ];
    for (const hyprDir of candidateDirs) {
      if (fs.existsSync(hyprDir)) {
        try {
          const entries = fs.readdirSync(hyprDir);
          const sigs = entries.filter((e) => !e.startsWith('.'));
          if (sigs.length > 0) {
            env.HYPRLAND_INSTANCE_SIGNATURE = sigs[0];
            if (env !== process.env) process.env.HYPRLAND_INSTANCE_SIGNATURE = sigs[0];
            break;
          }
        } catch {}
      }
    }
  }

  if (env.HYPRLAND_INSTANCE_SIGNATURE) {
    if (!env.XDG_CURRENT_DESKTOP || env.XDG_CURRENT_DESKTOP === 'unknown') {
      env.XDG_CURRENT_DESKTOP = 'Hyprland';
      if (env !== process.env) process.env.XDG_CURRENT_DESKTOP = 'Hyprland';
    }
    if (!env.XDG_SESSION_TYPE || env.XDG_SESSION_TYPE === 'unknown' || env.XDG_SESSION_TYPE === 'unspecified') {
      env.XDG_SESSION_TYPE = 'wayland';
      if (env !== process.env) process.env.XDG_SESSION_TYPE = 'wayland';
    }
  }

  return Boolean(env.HYPRLAND_INSTANCE_SIGNATURE || /hyprland/i.test(env.XDG_CURRENT_DESKTOP || '') || env.WAYLAND_DISPLAY || env.DISPLAY);
}

export function ensureHyprlandEnv(env = process.env) {
  ensureLinuxDesktopEnv(env);
  return Boolean(env.HYPRLAND_INSTANCE_SIGNATURE || /hyprland/i.test(env.XDG_CURRENT_DESKTOP || ''));
}
