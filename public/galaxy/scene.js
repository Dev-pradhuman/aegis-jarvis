import * as THREE from 'three';

const PROFILES = {
  sleeping: { light: 0.15, motion: 0.2, stars: 0.3 },
  idle: { light: 1.0, motion: 0.6, stars: 1.0 },
  listening: { light: 1.25, motion: 0.85, stars: 1.1 },
  thinking: { light: 1.45, motion: 1.35, stars: 1.2 },
  working: { light: 1.3, motion: 1.15, stars: 1.15 },
  speaking: { light: 1.3, motion: 0.95, stars: 1.1 },
};

export function mountGalaxyScene(container, { reducedMotion = false, quality = 'auto' } = {}) {
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);

  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
    depth: false,
    stencil: false,
  });

  const gl = renderer.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

  const pixelBudget = quality === 'high' ? 2400000 : 1800000;
  const ratio = (w, h) =>
    Math.max(0.65, Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(pixelBudget / Math.max(1, w * h))));

  renderer.setSize(width, height);
  renderer.setPixelRatio(ratio(width, height));
  renderer.domElement.className = 'galaxy-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const quadGeometry = new THREE.PlaneGeometry(2, 2);

  let state = 'idle';
  let profile = { ...PROFILES.idle };
  let drawerOpen = false;
  let targetCenterOffsetX = 0.0;
  let currentCenterOffsetX = 0.0;
  let mouse = { x: 0, y: 0 };
  let targetMouse = { x: 0, y: 0 };

  const shaderMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uResolution: { value: new THREE.Vector2(width * ratio(width, height), height * ratio(width, height)) },
      uTime: { value: 0.0 },
      uCenterOffsetX: { value: 0.0 },
      uMotion: { value: 0.6 },
      uLight: { value: 1.0 },
      uVoicePulse: { value: 1.0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;

      uniform vec2 uResolution;
      uniform float uTime;
      uniform float uCenterOffsetX;
      uniform float uMotion;
      uniform float uLight;
      uniform float uVoicePulse;
      uniform vec2 uMouse;

      // 2D Pseudo Random
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      // Continuous 2D Unit Gradient Hash
      vec2 hashGrad(vec2 p) {
        float n = sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123;
        float a = fract(n) * 6.283185307;
        return vec2(cos(a), sin(a));
      }

      // Perlin Gradient Noise with Quintic (C2 continuous) Hermite interpolation
      // u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0) -> ZERO square/blocky grid artifacts
      float gnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

        vec2 g00 = hashGrad(i + vec2(0.0, 0.0));
        vec2 g10 = hashGrad(i + vec2(1.0, 0.0));
        vec2 g01 = hashGrad(i + vec2(0.0, 1.0));
        vec2 g11 = hashGrad(i + vec2(1.0, 1.0));

        float d00 = dot(g00, f - vec2(0.0, 0.0));
        float d10 = dot(g10, f - vec2(1.0, 0.0));
        float d01 = dot(g01, f - vec2(0.0, 1.0));
        float d11 = dot(g11, f - vec2(1.0, 1.0));

        return mix(
          mix(d00, d10, u.x),
          mix(d01, d11, u.x),
          u.y
        );
      }

      // 4-Octave Fractional Brownian Motion for silky gas filaments
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.52;
        mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
        for (int i = 0; i < 4; i++) {
          v += a * gnoise(p);
          p = rot * p * 2.14 + vec2(1.7, 9.2);
          a *= 0.48;
        }
        return v * 0.5 + 0.5;
      }

      // Rotation matrix to tilt the accretion disk plane by -24 degrees diagonally
      mat3 getDiskRotation() {
        float radX = -0.419; // -24 deg pitch
        float radZ = 0.32;   // diagonal sweep from bottom-left to top-right
        float cx = cos(radX), sx = sin(radX);
        float cz = cos(radZ), sz = sin(radZ);
        mat3 rx = mat3(
          1.0, 0.0, 0.0,
          0.0, cx, -sx,
          0.0, sx, cx
        );
        mat3 rz = mat3(
          cz, -sz, 0.0,
          sz, cz, 0.0,
          0.0, 0.0, 1.0
        );
        return rz * rx;
      }

      void main() {
        vec2 fragCoord = gl_FragCoord.xy;
        vec2 uv = (fragCoord - 0.5 * uResolution) / uResolution.y;

        // Smooth horizontal focal shift (State 1 = 0.0, State 2 = +0.22)
        uv.x -= uCenterOffsetX;

        // Subtle mouse parallax
        uv.x += uMouse.x * 0.035;
        uv.y += uMouse.y * 0.025;

        // Camera setup in 3D spacetime centered dead-on the black hole
        vec3 ro = vec3(0.0, 0.6, -5.8);
        vec3 target = vec3(0.0, 0.0, 0.0);
        vec3 forward = normalize(target - ro);
        vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
        vec3 up = cross(right, forward);
        vec3 dir = normalize(forward * 1.6 + right * uv.x + up * uv.y);

        mat3 diskRot = getDiskRotation();

        // Raymarching Geodesic Integration (64 steps)
        vec3 pos = ro;
        float stepSize = 0.135;
        vec3 accumulatedCol = vec3(0.0);
        float transmit = 1.0;
        bool hitHorizon = false;
        float minR = 1e6;

        const float RS = 1.15; // Schwarzschild Horizon Radius

        for (int i = 0; i < 64; i++) {
          float r2 = dot(pos, pos);
          float r = sqrt(r2);
          if (r < minR) minR = r;

          // 1. PITCH-BLACK EVENT HORIZON VOID (#000000)
          // Any ray that crosses Rs falls into singularity with zero escape
          if (r < RS) {
            hitHorizon = true;
            break;
          }

          // Ray escaped into deep space
          if (r > 13.5) break;

          // 2. Geodesic Relativistic Deflection (Gravitational Bending)
          vec3 gravity = -(pos / r) * (0.088 / max(r2, 0.04)) * stepSize;
          dir = normalize(dir + gravity);

          // 3. Volumetric Accretion Disk in Tilted Coordinate Frame
          vec3 pDisk = diskRot * pos;
          float dist = length(pDisk.xz);
          float h = abs(pDisk.y);

          // Accretion disk boundary: inner edge ~ 1.42, outer edge ~ 6.8, vertical half-thickness ~ 0.36
          if (dist >= 1.42 && dist <= 6.8 && h < 0.36) {
            float normR = (dist - 1.42) / (6.8 - 1.42);
            float innerRamp = smoothstep(0.0, 0.15, normR);
            float outerFade = pow(1.0 - normR, 1.8);
            float radialProfile = innerRamp * outerFade;

            // Soft Gaussian vertical dissipation (silky plasma, no hard edges)
            float verticalProfile = exp(-h * h / 0.018);

            // Keplerian differential swirl: v ~ 1 / sqrt(r)
            float angle = atan(pDisk.z, pDisk.x);
            float speed = 1.35;
            float swirl = angle + uTime * uMotion * (speed / sqrt(max(dist, 0.8))) * 0.42;

            // Multi-octave fine logarithmic spiral Perlin noise
            vec2 polar1 = vec2(log(dist) * 4.2 - uTime * uMotion * 0.08, swirl * 2.4);
            float f1 = fbm(polar1);
            vec2 polar2 = vec2(log(dist) * 9.5 + f1 * 1.1, swirl * 6.2 - uTime * uMotion * 0.18);
            float f2 = fbm(polar2);
            float gas = smoothstep(0.22, 0.82, f1 * 0.65 + f2 * 0.45);

            // Doppler beaming: approaching side (blueshift + boost) vs receding side (redshift + dim)
            float losVel = -sin(angle);
            float doppler = 1.0 + 0.78 * losVel;

            // Cosmic blue on approaching side, warm copper/gold on receding side
            vec3 colBlue = mix(vec3(0.14, 0.28, 0.62), vec3(0.55, 0.85, 1.0), gas);
            vec3 colGold = mix(vec3(0.85, 0.42, 0.04), vec3(0.99, 0.88, 0.65), gas);

            float dopplerT = clamp((losVel + 1.0) * 0.5, 0.0, 1.0);
            vec3 plasmaCol = mix(colGold, colBlue, dopplerT);

            // Hot inner rim flare
            float hotRim = exp(-normR * 12.0) * 1.5;
            plasmaCol += vec3(0.85, 0.95, 1.0) * hotRim;

            float density = (gas * 1.6 + hotRim * 0.7) * radialProfile * verticalProfile * pow(max(0.1, doppler), 2.2);
            float alpha = clamp(density * stepSize * 2.4, 0.0, 1.0);

            accumulatedCol += transmit * plasmaCol * alpha * uLight * uVoicePulse;
            transmit *= (1.0 - alpha * 0.85);

            if (transmit < 0.012) break;
          }

          pos += dir * stepSize;
        }

        // PITCH BLACK EVENT HORIZON VOID: zero light escapes, exact #000000
        if (hitHorizon) {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }

        // ASYMMETRICAL PHOTON CRESCENT ARCS (ZERO uniform 360 circle ring)
        float rimAngle = atan(uv.y, uv.x);

        // 1. Upper-Left Razor-Thin Cool Ice-Blue/White Crescent (#93c5fd -> #e0f2fe)
        // Peaks in upper-left (rimAngle ~ 2.35 rad), smoothly fades to 0 in lower-right
        float blueArcFactor = clamp(sin(rimAngle - 0.78), 0.0, 1.0);
        float blueDist = abs(minR - 1.48);
        float blueRim = exp(-pow(blueDist / 0.035, 2.0)) * pow(blueArcFactor, 1.8);
        vec3 colIceBlue = mix(vec3(0.58, 0.83, 0.99), vec3(0.92, 0.96, 1.0), blueRim);
        accumulatedCol += colIceBlue * blueRim * 2.6 * uLight * uVoicePulse;

        // 2. Upper-Right & Lower-Left Warm Golden-Amber Inner Rim (#fbbf24 -> #ea580c)
        // Where tilted disk crosses in front of horizon
        float amberArcFactor = clamp(-sin(rimAngle - 0.78), 0.0, 1.0);
        float amberDist = abs(minR - 1.50);
        float amberRim = exp(-pow(amberDist / 0.045, 2.0)) * pow(amberArcFactor, 1.8);
        vec3 colAmber = mix(vec3(0.92, 0.35, 0.05), vec3(0.98, 0.75, 0.14), amberRim);
        accumulatedCol += colAmber * amberRim * 2.2 * uLight * uVoicePulse;

        // 3. Relativistic Beaming Flare on the Right Equator where disk meets shadow
        float rightEquator = exp(-pow(rimAngle / 0.38, 2.0));
        float flareDist = abs(minR - 1.52);
        float equatorFlare = exp(-pow(flareDist / 0.075, 2.0)) * rightEquator;
        vec3 flareCol = vec3(1.0, 0.94, 0.80);
        accumulatedCol += flareCol * equatorFlare * 2.2 * uLight * uVoicePulse;

        // 4. Crisp 3D Drifting Starfield with Sub-Pixel Twinkle
        if (transmit > 0.05) {
          vec3 sDir = dir + vec3(uTime * 0.003, uTime * 0.002, 0.0);
          float s1 = hash(floor(sDir.xy * 280.0 + sDir.z * 160.0));
          float star1 = step(0.995, s1) * pow((s1 - 0.995) / 0.005, 3.0);

          vec3 sDir2 = dir * 2.4 + vec3(-uTime * 0.005, uTime * 0.003, 0.5);
          float s2 = hash(floor(sDir2.xy * 380.0 + sDir2.z * 220.0));
          float star2 = step(0.997, s2) * pow((s2 - 0.997) / 0.003, 2.0);

          float twinkle = 0.8 + 0.2 * sin(uTime * 2.5 + s1 * 120.0);
          accumulatedCol += (vec3(0.75, 0.88, 1.0) * star1 + vec3(1.0, 0.95, 0.85) * star2) * twinkle * transmit * 0.8;
        }

        // Analytic ACES Filmic Tone Mapping (prevents blown-out whiteout glare)
        vec3 mapped = (accumulatedCol * (2.51 * accumulatedCol + 0.03)) /
                      (accumulatedCol * (2.43 * accumulatedCol + 0.59) + 0.14);
        mapped = clamp(mapped, 0.0, 1.0);

        gl_FragColor = vec4(mapped, 1.0);
      }
    `,
    depthWrite: false,
    depthTest: false,
  });

  const quad = new THREE.Mesh(quadGeometry, shaderMaterial);
  scene.add(quad);

  let raf = 0;
  let last = 0;
  let frames = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsStarted = performance.now();
  let start = performance.now();
  let disposed = false;
  let immersive = false;

  const onPointerMove = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    targetMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    targetMouse.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  const resize = () => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    const dpr = ratio(w, h);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h);
    shaderMaterial.uniforms.uResolution.value.set(w * dpr, h * dpr);
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  window.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', resize);

  function animate(now) {
    if (disposed) return;
    raf = requestAnimationFrame(animate);

    const targetFps = state === 'sleeping' || reducedMotion ? 24 : 60;
    if (now - last < 1000 / targetFps) return;

    const dt = Math.min((now - last) / 1000 || 0, 0.05);
    last = now;
    frames++;
    fpsFrames++;

    if (now - fpsStarted >= 1000) {
      fps = Math.round((fpsFrames * 1000) / (now - fpsStarted));
      fpsFrames = 0;
      fpsStarted = now;
    }

    const elapsed = (now - start) * 0.001;
    const desired = PROFILES[state] || PROFILES.idle;
    for (const key of Object.keys(profile)) {
      profile[key] = THREE.MathUtils.damp(profile[key], desired[key], state === 'sleeping' ? 1.6 : 1.1, dt);
    }

    // Smooth focal offset transition: 0.0 for centered State 1, +0.22 for right-shifted State 2
    targetCenterOffsetX = drawerOpen ? 0.22 : 0.0;
    currentCenterOffsetX = THREE.MathUtils.damp(currentCenterOffsetX, targetCenterOffsetX, 4.2, dt);

    mouse.x = THREE.MathUtils.damp(mouse.x, targetMouse.x, 3.5, dt);
    mouse.y = THREE.MathUtils.damp(mouse.y, targetMouse.y, 3.5, dt);

    // Audio / Voice pulse
    const voicePulse =
      state === 'speaking'
        ? 1.0 + Math.sin(elapsed * 7.5) * 0.12
        : state === 'listening'
        ? 1.0 + Math.sin(elapsed * 3.8) * 0.07
        : 1.0 + Math.sin(elapsed * 1.2) * 0.03;

    shaderMaterial.uniforms.uTime.value = elapsed;
    shaderMaterial.uniforms.uCenterOffsetX.value = currentCenterOffsetX;
    shaderMaterial.uniforms.uMotion.value = profile.motion;
    shaderMaterial.uniforms.uLight.value = profile.light;
    shaderMaterial.uniforms.uVoicePulse.value = voicePulse;
    shaderMaterial.uniforms.uMouse.value.set(mouse.x, mouse.y);

    renderer.render(scene, camera);
  }

  raf = requestAnimationFrame(animate);

  return {
    canvas: renderer.domElement,
    setVisualState(next) {
      if (PROFILES[next]) state = next;
    },
    setImmersive(next) {
      immersive = Boolean(next);
      resize();
    },
    setDrawerOpen(next) {
      drawerOpen = Boolean(next);
    },
    focus() {
      renderer.domElement.focus({ preventScroll: true });
    },
    resetView() {
      targetMouse.x = 0;
      targetMouse.y = 0;
    },
    diagnostics() {
      return {
        frames,
        fps,
        state,
        drawerOpen,
        centerOffsetX: currentCenterOffsetX,
        renderer: renderer.info.render,
        memory: renderer.info.memory,
        rendererName,
        dpr: renderer.getPixelRatio(),
        canvas: [renderer.domElement.width, renderer.domElement.height],
        mode: drawerOpen ? 'SPLIT_RIGHT' : 'HOME_CENTER',
        immersive,
      };
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', resize);
      document.removeEventListener('fullscreenchange', resize);

      quadGeometry.dispose();
      shaderMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
