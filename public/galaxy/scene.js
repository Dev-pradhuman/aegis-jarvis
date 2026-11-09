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

      // Smooth Value Noise (Quintic Hermite interpolation)
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      // 4-Octave Fractional Brownian Motion for silky gas filaments
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.52;
        mat2 rot = mat2(cos(0.55), sin(0.55), -sin(0.55), cos(0.55));
        for (int i = 0; i < 4; i++) {
          v += a * vnoise(p);
          p = rot * p * 2.18 + vec2(1.3, 2.7);
          a *= 0.48;
        }
        return v;
      }

      // Rotation matrix to tilt the accretion disk plane by -22 degrees diagonally
      mat3 getDiskRotation() {
        // -22 degrees pitch around X, with slight diagonal roll around Z
        float radX = -0.384; 
        float radZ = 0.28;
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

        // Camera setup in 3D spacetime
        vec3 ro = vec3(0.0, 1.25, -6.6);
        vec3 target = vec3(0.0, -0.1, 0.0);
        vec3 forward = normalize(target - ro);
        vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
        vec3 up = cross(right, forward);
        vec3 dir = normalize(forward * 1.55 + right * uv.x + up * uv.y);

        mat3 diskRot = getDiskRotation();

        // Raymarching Geodesic Integration (64 steps)
        vec3 pos = ro;
        float stepSize = 0.135;
        vec3 accumulatedCol = vec3(0.0);
        float transmit = 1.0;
        bool hitHorizon = false;
        float minR = 1e6;

        const float RS = 1.08;      // Schwarzschild Horizon Radius
        const float R_PHOTON = 1.58; // Photon Sphere Radius

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
          // As rays pass near the black hole, curvature bends rays toward center
          vec3 gravity = -(pos / r) * (0.082 / max(r2, 0.05)) * stepSize;
          dir = normalize(dir + gravity);

          // 3. Volumetric Accretion Disk in Tilted Coordinate Frame
          vec3 pDisk = diskRot * pos;
          float dist = length(pDisk.xz);
          float h = abs(pDisk.y);

          // Accretion disk boundary: inner edge ~ 1.35, outer edge ~ 6.0, vertical half-thickness ~ 0.40
          if (dist >= 1.35 && dist <= 6.2 && h < 0.40) {
            float normR = (dist - 1.35) / (6.2 - 1.35);
            float innerRamp = smoothstep(0.0, 0.12, normR);
            float outerFade = pow(1.0 - normR, 1.6);
            float radialProfile = innerRamp * outerFade;

            // Soft Gaussian vertical dissipation (silky plasma, no hard edges)
            float verticalProfile = exp(-h * h / 0.026);

            // Keplerian differential swirl: v ~ 1 / sqrt(r)
            float angle = atan(pDisk.z, pDisk.x);
            float speed = 1.25;
            float swirl = angle + uTime * uMotion * (speed / max(dist, 0.6)) * 0.45;

            // Multi-octave smooth 3D FBM noise in polar coordinates - NO concentric stripes
            vec2 polar1 = vec2(log(dist) * 3.8 - uTime * uMotion * 0.09, swirl * 2.2);
            float f1 = fbm(polar1);
            vec2 polar2 = vec2(log(dist) * 8.6 + f1 * 1.2, swirl * 5.6 - uTime * uMotion * 0.22);
            float f2 = fbm(polar2);
            float gas = smoothstep(0.18, 0.88, f1 * 0.65 + f2 * 0.45);

            // Doppler beaming: approaching side (blueshift + boost) vs receding side (redshift + dim)
            float losVel = -sin(angle);
            float doppler = 1.0 + 0.72 * losVel;

            // Cosmic blue on approaching side, warm copper/gold on receding side
            vec3 colBlue = mix(vec3(0.12, 0.23, 0.54), vec3(0.22, 0.74, 0.97), gas);
            vec3 colGold = mix(vec3(0.85, 0.47, 0.02), vec3(0.99, 0.95, 0.78), gas);

            float dopplerT = clamp((losVel + 1.0) * 0.5, 0.0, 1.0);
            vec3 plasmaCol = mix(colGold, colBlue, dopplerT);

            // Hot inner rim flare
            float hotRim = exp(-normR * 14.0) * 1.8;
            plasmaCol += vec3(0.9, 0.95, 1.0) * hotRim;

            float density = (gas * 1.5 + hotRim * 0.8) * radialProfile * verticalProfile * pow(doppler, 2.5);
            float alpha = clamp(density * stepSize * 2.2, 0.0, 1.0);

            accumulatedCol += transmit * plasmaCol * alpha * uLight * uVoicePulse;
            transmit *= (1.0 - alpha * 0.82);

            if (transmit < 0.015) break;
          }

          pos += dir * stepSize;
        }

        // PITCH BLACK EVENT HORIZON VOID: zero light escapes, exact #000000
        if (hitHorizon) {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }

        // Razor-Thin Photon Ring at r ~ 1.58 (grazing rays that barely escape)
        float photonDist = abs(minR - R_PHOTON);
        float photonRim = exp(-photonDist * photonDist / 0.0028); // razor-thin, crisp
        float rimAngle = atan(uv.y, uv.x);
        float rimDoppler = clamp((-sin(rimAngle - 0.4) + 1.0) * 0.5, 0.0, 1.0);
        // Cool ice-blue (#7dd3fc) on upper-left arc, warm golden-amber (#fbbf24 / #f59e0b) on lower-right arc
        vec3 rimCol = mix(vec3(0.98, 0.75, 0.14), vec3(0.49, 0.83, 0.99), rimDoppler);
        accumulatedCol += rimCol * photonRim * 3.2 * uLight * uVoicePulse;

        // Distant space stars for rays that escape without hitting disk
        if (transmit > 0.05) {
          float starHash = hash(floor(dir.xy * 240.0 + dir.z * 180.0));
          float star = step(0.994, starHash) * pow((starHash - 0.994) / 0.006, 3.0);
          accumulatedCol += vec3(0.72, 0.86, 1.0) * star * transmit * 0.65;
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
