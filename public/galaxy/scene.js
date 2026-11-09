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
  renderer.autoClear = false;

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

  // Scene 1: Full-Screen Raymarched Relativistic Gargantua Black Hole Quad
  const quadScene = new THREE.Scene();
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
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

      // 2D Hash
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      // Continuous 2D Unit Gradient Hash
      vec2 hashGrad(vec2 p) {
        float n = sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123;
        float a = fract(n) * 6.283185307;
        return vec2(cos(a), sin(a));
      }

      // C2 Quintic Hermite Perlin Noise (ZERO square/blocky artifacts)
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

        return mix(mix(d00, d10, u.x), mix(d01, d11, u.x), u.y);
      }

      // 6-Octave High-Frequency Ridged Multifractal Noise for Razor Filaments
      float ridgedFbm(vec2 p) {
        float sum = 0.0;
        float amp = 0.52;
        float freq = 1.0;
        mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
        for (int i = 0; i < 6; i++) {
          float n = gnoise(p * freq);
          // High-contrast inverted absolute ridges: pow(1.0 - abs(n * 2.0 - 1.0), 4.0)
          float r = pow(1.0 - abs(n * 1.8), 3.8);
          sum += amp * r;
          p = rot * p * 2.15 + vec2(1.7, 9.2);
          amp *= 0.48;
          freq *= 1.05;
        }
        return sum;
      }

      // Disk tilt matrix (-24 deg pitch, diagonal bottom-left to top-right sweep)
      mat3 getDiskRotation() {
        float radX = -0.419; // -24 deg pitch
        float radZ = 0.32;   // diagonal sweep
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
        uv.x += uMouse.x * 0.025;
        uv.y += uMouse.y * 0.018;

        // Calibrated Camera: Distance = 6.8, Focal = 1.7 -> Schwarzschild Shadow Radius ~32% of viewport height
        vec3 ro = vec3(0.0, 0.5, -6.8);
        vec3 target = vec3(0.0, 0.0, 0.0);
        vec3 forward = normalize(target - ro);
        vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
        vec3 up = cross(right, forward);
        vec3 dir = normalize(forward * 1.7 + right * uv.x + up * uv.y);

        mat3 diskRot = getDiskRotation();

        vec3 pos = ro;
        float stepSize = 0.125;
        vec3 accumulatedCol = vec3(0.0);
        float transmit = 1.0;
        bool hitHorizon = false;
        float minR = 1e6;

        // Schwarzschild Horizon Radius (scaled for exact 32% screen footprint)
        const float RS = 1.06;

        // Geodesic raymarching integration (64 steps)
        for (int i = 0; i < 64; i++) {
          float r2 = dot(pos, pos);
          float r = sqrt(r2);
          if (r < minR) minR = r;

          // 1. PITCH-BLACK EVENT HORIZON VOID: zero light escapes, exact #000000
          if (r < RS) {
            hitHorizon = true;
            break;
          }

          // Escape into deep cosmic space
          if (r > 12.0) break;

          // 2. Relativistic Geodesic Deflection
          vec3 gravity = -(pos / r) * (0.085 / max(r2, 0.04)) * stepSize;
          dir = normalize(dir + gravity);

          // 3. Volumetric Accretion Disk in Tilted Coordinate Frame
          vec3 pDisk = diskRot * pos;
          float dist = length(pDisk.xz);
          float h = abs(pDisk.y);

          // Tight boundaries to completely eliminate outer grey fog: inner 1.35, outer 4.6, half-thickness 0.16
          if (dist >= 1.35 && dist <= 4.6 && h < 0.16) {
            float normR = (dist - 1.35) / (4.6 - 1.35);
            float innerRamp = smoothstep(0.0, 0.12, normR);
            float outerFade = pow(1.0 - normR, 2.2);
            float radialProfile = innerRamp * outerFade;

            // Razor-thin vertical exponential falloff
            float verticalProfile = exp(-h * h / 0.0075);

            // Keplerian orbital swirl: v ~ 1 / sqrt(r)
            float angle = atan(pDisk.z, pDisk.x);
            float speed = 1.45;
            float swirl = angle + uTime * uMotion * (speed / sqrt(max(dist, 0.7))) * 0.45;

            // Domain-warped ridged multifractal filaments
            vec2 polar1 = vec2(log(dist) * 4.6 - uTime * uMotion * 0.09, swirl * 2.8);
            float f1 = ridgedFbm(polar1);
            vec2 polar2 = vec2(log(dist) * 11.0 + f1 * 1.2, swirl * 7.5 - uTime * uMotion * 0.22);
            float f2 = ridgedFbm(polar2);

            // High contrast gas density: crisp filament ridges, zero diffuse fog
            float gas = smoothstep(0.28, 0.88, f1 * 0.65 + f2 * 0.45);

            if (gas > 0.01) {
              // Relativistic Doppler beaming
              float losVel = -sin(angle);
              float doppler = 1.0 + 0.85 * losVel;

              // Color Palette:
              // Incandescent Gold, Copper & Amber
              vec3 cCoreGold = vec3(1.0, 0.98, 0.92); // #fffbeb
              vec3 cAmber    = vec3(0.96, 0.62, 0.04); // #f59e0b
              vec3 cCopper   = vec3(0.71, 0.33, 0.04); // #b45309
              vec3 cDarkFire = vec3(0.27, 0.10, 0.01); // #451a03

              // Electric Sapphire & Ice-Blue
              vec3 cIceBlue  = vec3(0.88, 0.95, 1.00); // #e0f2fe
              vec3 cSapphire = vec3(0.22, 0.74, 0.97); // #38bdf8
              vec3 cDeepNavy = vec3(0.12, 0.23, 0.54); // #1e3a8a

              vec3 colWarm = mix(cDarkFire, mix(cCopper, mix(cAmber, cCoreGold, gas), gas), gas);
              vec3 colCool = mix(cDeepNavy, mix(cSapphire, cIceBlue, gas), gas);

              float dopplerT = clamp((losVel + 0.9) * 0.55, 0.0, 1.0);
              vec3 plasmaCol = mix(colWarm, colCool, dopplerT);

              // Hot inner rim flare
              float hotRim = exp(-normR * 14.0) * 1.8;
              plasmaCol += cCoreGold * hotRim;

              float density = (gas * 2.2 + hotRim * 0.8) * radialProfile * verticalProfile * pow(max(0.08, doppler), 2.2);
              float alpha = clamp(density * stepSize * 2.8, 0.0, 1.0);

              accumulatedCol += transmit * plasmaCol * alpha * uLight * uVoicePulse;
              transmit *= (1.0 - alpha * 0.90);

              if (transmit < 0.008) break;
            }
          }

          pos += dir * stepSize;
        }

        // EVENT HORIZON VOID: exact #000000 pitch black
        if (hitHorizon) {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }

        // PHOTON RING: Razor-thin 2px-4px glowing ring (exp(-abs(r - Rs) * 95.0))
        float rimAngle = atan(uv.y, uv.x);
        float ringDist = abs(minR - 1.34);
        float photonRingIntensity = exp(-ringDist * 95.0);

        if (photonRingIntensity > 0.005) {
          // Upper-left Ice-Blue Crescent
          float blueArcFactor = clamp(sin(rimAngle - 0.75), 0.0, 1.0);
          vec3 colRingBlue = mix(vec3(0.22, 0.74, 0.97), vec3(0.92, 0.97, 1.0), photonRingIntensity);

          // Lower-left & Right Golden-Amber Crescent
          float amberArcFactor = clamp(-sin(rimAngle - 0.75), 0.0, 1.0);
          vec3 colRingAmber = mix(vec3(0.96, 0.55, 0.04), vec3(1.0, 0.95, 0.85), photonRingIntensity);

          vec3 ringCol = mix(colRingAmber, colRingBlue, blueArcFactor);
          accumulatedCol += ringCol * photonRingIntensity * 3.4 * uLight * uVoicePulse;
        }

        // Equatorial Relativistic Flare on the right side
        float rightEquator = exp(-pow(rimAngle / 0.32, 2.0));
        float flareDist = abs(minR - 1.38);
        float equatorFlare = exp(-pow(flareDist / 0.065, 2.0)) * rightEquator;
        accumulatedCol += vec3(1.0, 0.96, 0.88) * equatorFlare * 2.6 * uLight * uVoicePulse;

        // PURE DEEP BLACK SPACE BACKGROUND (#020205) + Sharp Pinpoint Stars
        if (transmit > 0.001) {
          vec3 deepSpace = vec3(0.008, 0.008, 0.02); // #020205
          accumulatedCol += deepSpace * transmit;

          // Crisp Pinpoint Starfield (no diffuse blur)
          vec3 sDir = dir + vec3(uTime * 0.002, uTime * 0.0015, 0.0);
          float s1 = hash(floor(sDir.xy * 340.0 + sDir.z * 180.0));
          float star1 = step(0.996, s1) * pow((s1 - 0.996) / 0.004, 2.5);

          vec3 sDir2 = dir * 2.2 + vec3(-uTime * 0.003, uTime * 0.002, 0.4);
          float s2 = hash(floor(sDir2.xy * 460.0 + sDir2.z * 260.0));
          float star2 = step(0.9975, s2) * pow((s2 - 0.9975) / 0.0025, 2.0);

          float twinkle = 0.85 + 0.15 * sin(uTime * 3.0 + s1 * 150.0);
          accumulatedCol += (vec3(0.85, 0.92, 1.0) * star1 + vec3(1.0, 0.95, 0.88) * star2) * twinkle * transmit * 0.9;
        }

        // ACES Filmic Tone Mapping (prevents whiteout glare, preserves rich golden contrast)
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
  quadScene.add(quad);

  // Scene 2: 25,000 GPU Keplerian Micro-Particles
  const particleScene = new THREE.Scene();
  const particleCamera = new THREE.PerspectiveCamera(32.8, width / height, 0.1, 50.0);
  particleCamera.position.set(0.0, 0.5, -6.8);
  particleCamera.lookAt(0.0, 0.0, 0.0);

  const PARTICLE_COUNT = 25000;
  const particleGeometry = new THREE.BufferGeometry();
  const aRadius = new Float32Array(PARTICLE_COUNT);
  const aAngle0 = new Float32Array(PARTICLE_COUNT);
  const aSpeed = new Float32Array(PARTICLE_COUNT);
  const aYOffset = new Float32Array(PARTICLE_COUNT);
  const aColor = new Float32Array(PARTICLE_COUNT * 3);
  const aSize = new Float32Array(PARTICLE_COUNT);

  // Seed Keplerian micro-particles orbiting along the inclined disk
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Radius distribution concentrated between inner edge 1.38 and outer edge 4.4
    const u = Math.random();
    const r = 1.38 + Math.pow(u, 1.5) * (4.4 - 1.38);
    aRadius[i] = r;

    // Initial random angle around the accretion disk
    aAngle0[i] = Math.random() * Math.PI * 2.0;

    // Keplerian orbital velocity: v ~ 1 / sqrt(r)
    aSpeed[i] = (1.45 / Math.sqrt(r)) * 0.45 * (0.92 + Math.random() * 0.16);

    // Subtle Gaussian vertical fluttering
    aYOffset[i] = (Math.random() - 0.5) * (Math.random() - 0.5) * 0.08;

    // Local color matching temperature:
    // Inner particles (r < 2.2): Incandescent gold / sapphire blue
    // Outer particles (r >= 2.2): Warm amber / copper
    const norm = (r - 1.38) / (4.4 - 1.38);
    let cr, cg, cb;
    if (Math.random() < 0.28 && norm < 0.5) {
      // Sapphire / ice-blue highlight
      cr = 0.25 + Math.random() * 0.3;
      cg = 0.75 + Math.random() * 0.25;
      cb = 1.0;
    } else {
      // Gold -> Amber -> Copper
      cr = 1.0;
      cg = 0.95 - norm * 0.55;
      cb = 0.75 - norm * 0.65;
    }
    aColor[i * 3 + 0] = cr;
    aColor[i * 3 + 1] = Math.max(0.1, cg);
    aColor[i * 3 + 2] = Math.max(0.02, cb);

    // Particle size
    aSize[i] = (1.2 + Math.random() * 2.2) * (1.0 - norm * 0.45);
  }

  particleGeometry.setAttribute('aRadius', new THREE.BufferAttribute(aRadius, 1));
  particleGeometry.setAttribute('aAngle0', new THREE.BufferAttribute(aAngle0, 1));
  particleGeometry.setAttribute('aSpeed', new THREE.BufferAttribute(aSpeed, 1));
  particleGeometry.setAttribute('aYOffset', new THREE.BufferAttribute(aYOffset, 1));
  particleGeometry.setAttribute('aColor', new THREE.BufferAttribute(aColor, 3));
  particleGeometry.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
  // Dummy positions for Three.js bounding box
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3));

  const particleMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 },
      uMotion: { value: 0.6 },
      uLight: { value: 1.0 },
      uCenterOffsetX: { value: 0.0 },
      uPixelRatio: { value: ratio(width, height) },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uMotion;
      uniform float uLight;
      uniform float uCenterOffsetX;
      uniform float uPixelRatio;

      attribute float aRadius;
      attribute float aAngle0;
      attribute float aSpeed;
      attribute float aYOffset;
      attribute vec3 aColor;
      attribute float aSize;

      varying vec3 vColor;
      varying float vAlpha;

      mat3 getDiskRotation() {
        float radX = -0.419;
        float radZ = 0.32;
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
        vColor = aColor;
        float currentAngle = aAngle0 + uTime * uMotion * aSpeed;

        // Position in disk plane
        vec3 pDisk = vec3(cos(currentAngle) * aRadius, aYOffset, sin(currentAngle) * aRadius);

        // Transform from disk coordinate frame to world frame (inverse rotation)
        mat3 diskRot = getDiskRotation();
        mat3 diskRotInv = mat3(
          diskRot[0][0], diskRot[1][0], diskRot[2][0],
          diskRot[0][1], diskRot[1][1], diskRot[2][1],
          diskRot[0][2], diskRot[1][2], diskRot[2][2]
        );
        vec3 worldPos = diskRotInv * pDisk;

        // View matrix projection
        vec4 mvPosition = modelViewMatrix * vec4(worldPos, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        // Size with distance attenuation
        gl_PointSize = (aSize * uPixelRatio * 7.5) / max(0.5, -mvPosition.z);

        // Alpha fade near horizon and outer edge
        float rFade = smoothstep(1.35, 1.55, aRadius) * (1.0 - smoothstep(4.0, 4.4, aRadius));
        vAlpha = rFade * 0.75 * uLight;
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vec2 coord = gl_PointCoord - vec2(0.5);
        float dist = length(coord);
        if (dist > 0.5) discard;

        // Soft circular glow point
        float alpha = exp(-dist * 5.0) * vAlpha;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });

  const particlePoints = new THREE.Points(particleGeometry, particleMaterial);
  particleScene.add(particlePoints);

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

    particleCamera.aspect = w / h;
    particleCamera.updateProjectionMatrix();
    particleMaterial.uniforms.uPixelRatio.value = dpr;
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

    // Update Quad Shader Uniforms
    shaderMaterial.uniforms.uTime.value = elapsed;
    shaderMaterial.uniforms.uCenterOffsetX.value = currentCenterOffsetX;
    shaderMaterial.uniforms.uMotion.value = profile.motion;
    shaderMaterial.uniforms.uLight.value = profile.light;
    shaderMaterial.uniforms.uVoicePulse.value = voicePulse;
    shaderMaterial.uniforms.uMouse.value.set(mouse.x, mouse.y);

    // Update Particle Uniforms & Camera Offset to match Shader
    particleMaterial.uniforms.uTime.value = elapsed;
    particleMaterial.uniforms.uMotion.value = profile.motion;
    particleMaterial.uniforms.uLight.value = profile.light;
    particleMaterial.uniforms.uCenterOffsetX.value = currentCenterOffsetX;

    // Camera shift aligns with shader's focal offset: (6.8 / 1.7) = 4.0
    const camOffsetX = -currentCenterOffsetX * 4.0;
    particleCamera.position.set(camOffsetX, 0.5, -6.8);
    particleCamera.lookAt(camOffsetX, 0.0, 0.0);

    // Pass 1: Render Relativistic Raymarched Quad
    renderer.clear();
    renderer.render(quadScene, quadCamera);

    // Pass 2: Render 25,000 Keplerian Micro-Particles (additive blend)
    renderer.render(particleScene, particleCamera);
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
      particleGeometry.dispose();
      particleMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
