import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const PROFILES = {
  sleeping: { light: 0.08, motion: 0.15, stars: 0.25, bloom: 0.08 },
  idle: { light: 1.0, motion: 0.55, stars: 1.0, bloom: 0.32 },
  listening: { light: 1.25, motion: 0.85, stars: 1.08, bloom: 0.45 },
  thinking: { light: 1.42, motion: 1.35, stars: 1.18, bloom: 0.58 },
  working: { light: 1.35, motion: 1.2, stars: 1.12, bloom: 0.5 },
  speaking: { light: 1.28, motion: 0.95, stars: 1.1, bloom: 0.48 },
};

const CAMERA = Object.freeze({
  fov: 52,
  homeDistance: 9.2,
  minDistance: 3.2,
  maxDistance: 18,
  minPitch: -1.25,
  maxPitch: 1.25,
  orbitSensitivity: 0.0048,
  panSensitivity: 0.0014,
  zoomSensitivity: 0.0011,
  damping: 4.8,
  moveSpeed: 2.2,
  maxOffset: 5.5,
  autoDriftRadiansPerSecond: 0.0055,
  autoDriftResumeMs: 3200,
  autoDriftEase: 1.1,
});

function randomGenerator(seed) {
  let value = seed >>> 0;
  return () => ((value = Math.imul(1664525, value) + 1013904223 >>> 0) / 4294967296);
}

// Background Deep-Space Starfield
function buildBackgroundStarfield(count, radius, seed) {
  const random = randomGenerator(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(random() * 2 - 1);
    const dist = radius * (0.65 + random() * 0.35);

    positions[i * 3] = dist * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = dist * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = dist * Math.cos(phi);

    const tint = random();
    let col;
    if (tint > 0.85) col = new THREE.Color('#93c5fd'); // soft blue
    else if (tint > 0.65) col = new THREE.Color('#fef08a'); // warm amber star
    else if (tint > 0.45) col = new THREE.Color('#fed7aa'); // peach/amber
    else col = new THREE.Color('#ffffff'); // pure diamond white

    colors.set(col.toArray(), i * 3);
    sizes[i] = (random() > 0.96 ? 2.2 : random() > 0.75 ? 1.4 : 0.65 + random() * 0.45);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.85 },
      uPixelRatio: { value: 1.0 },
    },
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      varying float vPulse;
      uniform float uTime;
      uniform float uPixelRatio;

      void main() {
        vColor = color;
        float twinkle = sin(uTime * 1.5 + position.x * 0.05 + position.y * 0.08);
        vPulse = 0.85 + 0.15 * twinkle;
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(size * (7.0 / -view.z) * uPixelRatio, 1.0, 7.0 * uPixelRatio);
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying vec3 vColor;
      varying float vPulse;

      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float core = 1.0 - smoothstep(0.08, 0.28, d);
        float glow = (1.0 - smoothstep(0.25, 0.5, d)) * 0.25;
        float alpha = (core + glow) * uOpacity * vPulse;
        if (alpha < 0.015) discard;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Points(geometry, material);
}

// Custom GLSL Shader for Relativistic Accretion Disk & Lensed Halo
function createAccretionDiskMaterial({ isLensedHalo = false } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMotion: { value: 0.55 },
      uLight: { value: 1.0 },
      uInnerRadius: { value: 1.38 },
      uOuterRadius: { value: 5.4 },
      uIsLensed: { value: isLensedHalo ? 1.0 : 0.0 },
      uPhasePulse: { value: 1.0 },
      uDopplerStrength: { value: 0.72 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewDir = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uMotion;
      uniform float uLight;
      uniform float uInnerRadius;
      uniform float uOuterRadius;
      uniform float uIsLensed;
      uniform float uPhasePulse;
      uniform float uDopplerStrength;

      varying vec3 vWorldPosition;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      // 2D Pseudo Random
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      // Smooth Value Noise
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

      // 4-Octave Fractional Brownian Motion (FBM)
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.52;
        mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
        for (int i = 0; i < 4; i++) {
          v += a * vnoise(p);
          p = rot * p * 2.18 + vec2(1.3, 2.7);
          a *= 0.48;
        }
        return v;
      }

      void main() {
        // Distance from black hole center in local/disk space
        float r = length(vWorldPosition.xz);
        if (uIsLensed > 0.5) {
          // For lensed halo, project radial distance from origin
          r = length(vWorldPosition.xyz);
        }

        // Clamp & normalize radius across accretion boundary
        float normR = clamp((r - uInnerRadius) / (uOuterRadius - uInnerRadius), 0.0, 1.0);

        // Keplerian differential speed: inner plasma spins much faster than outer plasma (v ~ r^-1.5)
        float keplerSpeed = 1.35 / pow(max(normR + 0.18, 0.15), 0.75);
        float t = uTime * uMotion * 0.42;

        // Azimuthal angle around black hole
        float angle = atan(vWorldPosition.z, vWorldPosition.x);
        float swirlAngle = angle + t * keplerSpeed;

        // Multi-octave plasma turbulence
        vec2 p1 = vec2(normR * 7.5 - t * 0.25, swirlAngle * 3.8);
        float n1 = fbm(p1);

        vec2 p2 = vec2(normR * 16.0 + n1 * 1.8, swirlAngle * 9.5 - t * 0.6);
        float n2 = fbm(p2);

        float density = smoothstep(0.24, 0.88, n1 * 0.65 + n2 * 0.45);

        // Radial falloff: razor-thin hot inner boundary ramp-up, long graceful exponential tail
        float innerFade = smoothstep(0.0, 0.08, normR);
        float outerFade = pow(1.0 - normR, 1.7);
        float radialEnvelope = innerFade * outerFade;

        // Hot inner photon ring edge flare
        float innerEdgeFlare = exp(-normR * 14.0) * 2.8;

        // Doppler Beaming & Relativistic Shift:
        // Disk spins counterclockwise. Left side moves toward camera (blueshift + beaming),
        // right side recedes away from camera (redshift + dimming).
        float orbitalVelocityDir = -sin(angle); // projected line-of-sight velocity factor
        float dopplerFactor = 1.0 + uDopplerStrength * orbitalVelocityDir * (1.0 - normR * 0.5);

        // Approaching colors: brilliant blue-white and cyan
        vec3 colApproaching = mix(
          vec3(0.55, 0.82, 1.0), // cyan
          vec3(1.0, 1.0, 1.0),   // pure diamond white
          smoothstep(0.3, 0.9, density + innerEdgeFlare * 0.4)
        );

        // Receding colors: deep golden amber, burnt orange, and ruby embers
        vec3 colReceding = mix(
          vec3(0.95, 0.28, 0.06), // burnt orange-red
          vec3(1.0, 0.72, 0.18),  // radiant golden amber
          smoothstep(0.2, 0.85, density)
        );

        // Blend Doppler colors across the disk
        float dopplerMix = clamp((orbitalVelocityDir + 1.0) * 0.5, 0.0, 1.0);
        vec3 plasmaColor = mix(colReceding, colApproaching, dopplerMix);

        // Relativistic intensification on approaching side
        float intensity = (density * 1.5 + innerEdgeFlare) * radialEnvelope;
        intensity *= pow(dopplerFactor, 2.8);
        intensity *= uLight * uPhasePulse;

        // Final alpha & color with bloom boost
        float alpha = clamp(intensity * 1.35, 0.0, 0.98);
        if (alpha < 0.012) discard;

        // Ultra-hot inner boundary glowing white
        if (normR < 0.07) {
          plasmaColor = mix(plasmaColor, vec3(1.2, 1.3, 1.5), (0.07 - normR) / 0.07);
        }

        gl_FragColor = vec4(plasmaColor * (1.2 + innerEdgeFlare * 0.8), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

// 12,000+ Accretion Plasma & Dust Particles
function buildAccretionDustParticles(count, innerRadius, outerRadius, seed) {
  const random = randomGenerator(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const orbitalParams = new Float32Array(count * 3); // [radius, baseAngle, speed]

  for (let i = 0; i < count; i++) {
    const normR = Math.pow(random(), 1.6);
    const r = innerRadius + normR * (outerRadius - innerRadius);
    const angle = random() * Math.PI * 2;
    const speed = (1.45 / Math.pow(r, 0.75)) * (0.85 + random() * 0.3);

    positions[i * 3] = Math.cos(angle) * r;
    positions[i * 3 + 1] = (random() - 0.5) * 0.12 * (1.0 + normR * 1.4);
    positions[i * 3 + 2] = Math.sin(angle) * r;

    orbitalParams[i * 3] = r;
    orbitalParams[i * 3 + 1] = angle;
    orbitalParams[i * 3 + 2] = speed;

    // Tint based on radius & angle (Doppler)
    const tint = random();
    let col;
    if (tint > 0.8) col = new THREE.Color('#e0f2fe'); // ice blue
    else if (tint > 0.5) col = new THREE.Color('#38bdf8'); // cyan
    else if (tint > 0.25) col = new THREE.Color('#f59e0b'); // amber
    else col = new THREE.Color('#ef4444'); // crimson

    colors.set(col.toArray(), i * 3);
    sizes[i] = (random() > 0.98 ? 3.0 : random() > 0.8 ? 1.8 : 0.75 + random() * 0.6);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('orbital', new THREE.BufferAttribute(orbitalParams, 3));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMotion: { value: 0.55 },
      uOpacity: { value: 0.85 },
      uPixelRatio: { value: 1.0 },
    },
    vertexShader: `
      attribute float size;
      attribute vec3 orbital; // [radius, baseAngle, speed]
      varying vec3 vColor;
      varying float vDoppler;
      uniform float uTime;
      uniform float uMotion;
      uniform float uPixelRatio;

      void main() {
        float r = orbital.x;
        float baseAngle = orbital.y;
        float speed = orbital.z;

        float angle = baseAngle + uTime * uMotion * speed * 0.45;
        vec3 p = vec3(
          cos(angle) * r,
          position.y + sin(r * 8.0 + uTime * 2.0) * 0.04 * (r * 0.3),
          sin(angle) * r
        );

        // Doppler shift along line-of-sight
        float los = -sin(angle);
        vDoppler = clamp((los + 1.0) * 0.5, 0.0, 1.0);

        vColor = mix(
          color,
          vec3(0.85, 0.95, 1.0),
          vDoppler * 0.65
        );

        vec4 view = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(size * (7.5 / -view.z) * uPixelRatio, 1.0, 9.0 * uPixelRatio);
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      varying vec3 vColor;
      varying float vDoppler;

      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float core = 1.0 - smoothstep(0.08, 0.28, d);
        float glow = (1.0 - smoothstep(0.25, 0.5, d)) * 0.32;
        float alpha = (core + glow) * uOpacity * (0.65 + vDoppler * 0.65);
        if (alpha < 0.015) discard;
        gl_FragColor = vec4(vColor * (1.1 + vDoppler * 0.5), alpha);
      }
    `,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Points(geometry, material);
}

export function mountGalaxyScene(container, { reducedMotion = false, quality = 'auto' } = {}) {
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });

  const gl = renderer.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const softwareRenderer = /swiftshader|llvmpipe|software/i.test(rendererName || '');
  const postprocessing = !softwareRenderer && quality !== 'low';
  const pixelBudget = quality === 'high' ? 2600000 : 1900000;
  const ratio = (w, h) =>
    Math.max(0.65, Math.min(window.devicePixelRatio || 1, 1.6, Math.sqrt(pixelBudget / Math.max(1, w * h))));

  renderer.setSize(width, height);
  renderer.setPixelRatio(ratio(width, height));
  renderer.setClearColor('#000005', 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'galaxy-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#000005', 0.0075);

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, width / height, 0.1, 100);
  camera.position.set(0, 0.25, CAMERA.homeDistance);

  // Targets: Centered for State 1, Shifted right when Chat Drawer is open in State 2
  const homeTarget = new THREE.Vector3(0, 0.18, 0);
  const shiftedTarget = new THREE.Vector3(-1.75, 0.18, 0); // moves black hole to right ~60% of viewport
  const targetDesired = homeTarget.clone();
  const target = homeTarget.clone();
  camera.lookAt(target);

  const composer = postprocessing ? new EffectComposer(renderer) : null;
  if (composer) composer.addPass(new RenderPass(scene, camera));
  const bloom = postprocessing
    ? new UnrealBloomPass(new THREE.Vector2(width / 2, height / 2), 0.35, 0.22, 0.88)
    : null;
  if (bloom) composer.addPass(bloom);

  // 1. Distant deep-space background stars (2,200 stars)
  const starfield = buildBackgroundStarfield(2200, 32, 58491);
  scene.add(starfield);

  // 2. Gargantua Black Hole Group (tilted at ~18 degrees)
  const blackHoleGroup = new THREE.Group();
  // Tilt matching the diagonal sweep from bottom-left to top-right (~18 degrees)
  blackHoleGroup.rotation.x = 0.28;  // ~16 deg pitch
  blackHoleGroup.rotation.z = -0.32; // ~18 deg roll sweep
  scene.add(blackHoleGroup);

  // 2A. Schwarzschild Event Horizon: Pitch-black sphere that blocks everything behind it
  const horizonGeo = new THREE.SphereGeometry(1.24, 64, 64);
  const horizonMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const eventHorizon = new THREE.Mesh(horizonGeo, horizonMat);
  eventHorizon.renderOrder = 5;
  blackHoleGroup.add(eventHorizon);

  // 2B. Relativistic Photon Ring: Razor-thin, intensely glowing shell just outside horizon
  const photonRingGeo = new THREE.TorusGeometry(1.36, 0.045, 32, 128);
  const photonRingMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uLight: { value: 1.0 },
      uPulse: { value: 1.0 },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uLight;
      uniform float uPulse;
      varying vec3 vWorldPos;

      void main() {
        float doppler = clamp((-sin(atan(vWorldPos.z, vWorldPos.x)) + 1.0) * 0.5, 0.0, 1.0);
        vec3 col = mix(
          vec3(1.0, 0.65, 0.2),  // golden amber
          vec3(0.7, 0.92, 1.0),  // electric blue-white
          doppler
        );
        vec3 core = vec3(1.3, 1.35, 1.4); // white hot core
        col = mix(col, core, 0.45);
        gl_FragColor = vec4(col * uLight * uPulse * 2.2, 0.95);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const photonRing = new THREE.Mesh(photonRingGeo, photonRingMat);
  photonRing.rotation.x = Math.PI / 2;
  blackHoleGroup.add(photonRing);

  // 2C. Primary Equatorial Accretion Disk (flat ring with differential Keplerian GLSL noise)
  const diskGeo = new THREE.RingGeometry(1.38, 5.4, 128, 36);
  // Re-orient ring so it lies flat on XZ plane
  diskGeo.rotateX(-Math.PI / 2);
  const diskMat = createAccretionDiskMaterial({ isLensedHalo: false });
  const accretionDisk = new THREE.Mesh(diskGeo, diskMat);
  accretionDisk.renderOrder = 2;
  blackHoleGroup.add(accretionDisk);

  // 2D. Gravitational Lensing Halos (Upper & Lower bent arcs wrapping over and under the black hole)
  // Real gravitational lensing bends the back of the accretion disk into upper and lower halos.
  // We model this using a curved torus / arched vertical geometry surrounding the event horizon.
  const upperLensedGeo = new THREE.TorusGeometry(1.68, 0.28, 36, 128, Math.PI);
  const upperLensedMat = createAccretionDiskMaterial({ isLensedHalo: true });
  const upperLensedHalo = new THREE.Mesh(upperLensedGeo, upperLensedMat);
  upperLensedHalo.rotation.y = 0;
  upperLensedHalo.renderOrder = 3;
  blackHoleGroup.add(upperLensedHalo);

  const lowerLensedGeo = new THREE.TorusGeometry(1.68, 0.28, 36, 128, Math.PI);
  const lowerLensedMat = createAccretionDiskMaterial({ isLensedHalo: true });
  const lowerLensedHalo = new THREE.Mesh(lowerLensedGeo, lowerLensedMat);
  lowerLensedHalo.rotation.z = Math.PI; // flips upside down for lower bent arc
  lowerLensedHalo.renderOrder = 3;
  blackHoleGroup.add(lowerLensedHalo);

  // 2E. 12,000+ Spiraling Keplerian Accretion Dust & Star Particles
  const accretionParticles = buildAccretionDustParticles(12000, 1.42, 5.8, 93847);
  blackHoleGroup.add(accretionParticles);

  // Runtime State & Camera Controls
  let state = 'idle';
  let profile = { ...PROFILES.idle };
  let drawerOpen = false;

  const cameraDesired = { yaw: 0, pitch: 0, distance: CAMERA.homeDistance };
  const cameraCurrent = { ...cameraDesired };
  const pointers = new Map();
  const keys = new Set();
  let gesture = null;
  let immersive = false;
  let manualCamera = false;
  let pointer = { x: 0, y: 0 };
  let lastInteraction = 0;
  let autoDriftVelocity = 0;
  let raf = 0;
  let last = 0;
  let disposed = false;
  let frames = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsStarted = performance.now();
  let start = performance.now();

  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute(
    'aria-label',
    'Gargantua Black Hole navigation: drag to orbit, wheel to zoom, Shift drag to pan'
  );

  const panBy = (dx, dy) => {
    const scale = CAMERA.panSensitivity * cameraCurrent.distance;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    targetDesired.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
  };

  const markManual = () => {
    lastInteraction = performance.now();
    autoDriftVelocity = 0;
  };

  const zoomBy = (delta) => {
    cameraDesired.distance = THREE.MathUtils.clamp(
      cameraDesired.distance * Math.exp(delta * CAMERA.zoomSensitivity),
      CAMERA.minDistance,
      CAMERA.maxDistance
    );
    manualCamera = true;
    markManual();
  };

  const onMove = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer = {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: ((event.clientY - rect.top) / rect.height) * 2 - 1,
    };
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (gesture?.mode === 'touch-pair') {
        panBy(center.x - gesture.x, center.y - gesture.y);
        if (gesture.distance > 1 && distance > 1) {
          zoomBy(Math.log(gesture.distance / distance) / CAMERA.zoomSensitivity);
        }
      }
      gesture = { mode: 'touch-pair', x: center.x, y: center.y, distance };
    } else if (gesture && gesture.mode !== 'touch-pair') {
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (gesture.mode === 'pan') {
        panBy(dx, dy);
      } else {
        cameraDesired.yaw -= dx * CAMERA.orbitSensitivity;
        cameraDesired.pitch = THREE.MathUtils.clamp(
          cameraDesired.pitch + dy * CAMERA.orbitSensitivity,
          CAMERA.minPitch,
          CAMERA.maxPitch
        );
      }
      gesture.x = event.clientX;
      gesture.y = event.clientY;
    }
    manualCamera = true;
    markManual();
  };

  const onDown = (event) => {
    if (![0, 1, 2].includes(event.button)) return;
    event.preventDefault();
    renderer.domElement.focus({ preventScroll: true });
    renderer.domElement.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gesture =
      pointers.size === 1
        ? {
            mode: event.button === 2 || event.button === 1 || event.shiftKey ? 'pan' : 'orbit',
            x: event.clientX,
            y: event.clientY,
          }
        : null;
    markManual();
  };

  const onUp = (event) => {
    pointers.delete(event.pointerId);
    gesture = null;
    markManual();
    try {
      renderer.domElement.releasePointerCapture(event.pointerId);
    } catch {}
  };

  const onWheel = (event) => {
    event.preventDefault();
    zoomBy(event.deltaY * (event.deltaMode === 1 ? 16 : 1));
  };

  const onContext = (event) => event.preventDefault();

  const onKeyDown = (event) => {
    if (
      !immersive ||
      document.activeElement !== renderer.domElement ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.isComposing
    )
      return;
    const key = event.key.toLowerCase();
    if ('wasdqe'.includes(key) && key.length === 1) {
      event.preventDefault();
      keys.add(key);
      markManual();
    }
  };

  const onKeyUp = (event) => {
    if (keys.delete(event.key.toLowerCase())) markManual();
  };

  const onBlur = () => keys.clear();

  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointercancel', onUp);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
  renderer.domElement.addEventListener('contextmenu', onContext);
  renderer.domElement.addEventListener('blur', onBlur);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  const resize = () => {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const dpr = ratio(w, h);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h);
    composer?.setPixelRatio(dpr);
    composer?.setSize(w, h);
    starfield.material.uniforms.uPixelRatio.value = dpr;
    accretionParticles.material.uniforms.uPixelRatio.value = dpr;
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  window.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', resize);

  function animate(now) {
    if (disposed) return;
    raf = requestAnimationFrame(animate);

    const navigating = pointers.size > 0 || keys.size > 0 || now - lastInteraction < CAMERA.autoDriftResumeMs;
    const targetFps = (state === 'sleeping' || reducedMotion) && !navigating ? 24 : 60;
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

    // WASD Fly-through when in Immersive Mode
    if (immersive && keys.size) {
      const forward = new THREE.Vector3(-Math.sin(cameraCurrent.yaw), 0, -Math.cos(cameraCurrent.yaw));
      const right = new THREE.Vector3(Math.cos(cameraCurrent.yaw), 0, -Math.sin(cameraCurrent.yaw));
      const movement = new THREE.Vector3();
      if (keys.has('w')) movement.add(forward);
      if (keys.has('s')) movement.sub(forward);
      if (keys.has('d')) movement.add(right);
      if (keys.has('a')) movement.sub(right);
      if (keys.has('e')) movement.y += 1;
      if (keys.has('q')) movement.y -= 1;
      if (movement.lengthSq()) {
        targetDesired.addScaledVector(movement.normalize(), CAMERA.moveSpeed * dt);
        manualCamera = true;
      }
    }

    if (keys.size) {
      lastInteraction = now;
      autoDriftVelocity = 0;
    }

    // Auto camera drift when idle
    const mayDrift = pointers.size === 0 && keys.size === 0 && now - lastInteraction >= CAMERA.autoDriftResumeMs;
    const driftTarget = mayDrift ? CAMERA.autoDriftRadiansPerSecond * (reducedMotion ? 0.15 : 1) : 0;
    autoDriftVelocity = THREE.MathUtils.damp(autoDriftVelocity, driftTarget, CAMERA.autoDriftEase, dt);
    cameraDesired.yaw += autoDriftVelocity * dt;

    // Subtle breathing mouse parallax
    const parallax = manualCamera || reducedMotion ? 0 : 1;
    cameraCurrent.yaw = THREE.MathUtils.damp(
      cameraCurrent.yaw,
      cameraDesired.yaw + pointer.x * 0.016 * parallax,
      CAMERA.damping,
      dt
    );
    cameraCurrent.pitch = THREE.MathUtils.damp(
      cameraCurrent.pitch,
      cameraDesired.pitch - pointer.y * 0.011 * parallax,
      CAMERA.damping,
      dt
    );
    cameraCurrent.distance = THREE.MathUtils.damp(
      cameraCurrent.distance,
      cameraDesired.distance,
      CAMERA.damping,
      dt
    );

    // Target shift: lerp to desired target (shifted right in State 2, centered in State 1)
    const baseTarget = drawerOpen ? shiftedTarget : homeTarget;
    if (!manualCamera) {
      targetDesired.lerp(baseTarget, 0.08);
    }
    target.lerp(targetDesired, 1 - Math.exp(-CAMERA.damping * dt));

    const horizontal = Math.cos(cameraCurrent.pitch) * cameraCurrent.distance;
    camera.position.set(
      target.x + Math.sin(cameraCurrent.yaw) * horizontal,
      target.y + Math.sin(cameraCurrent.pitch) * cameraCurrent.distance,
      target.z + Math.cos(cameraCurrent.yaw) * horizontal
    );
    camera.lookAt(target);

    // Dynamic rotation of black hole system and background
    blackHoleGroup.rotation.y = elapsed * 0.02 * profile.motion;
    starfield.rotation.y = elapsed * 0.0025;

    // Audio / Voice reactivity pulse
    const speechPulse =
      state === 'speaking'
        ? 1.0 + Math.sin(elapsed * 7.5) * 0.14
        : state === 'listening'
        ? 1.0 + Math.sin(elapsed * 3.8) * 0.08
        : 1.0 + Math.sin(elapsed * 1.2) * 0.035;

    // Update shaders
    diskMat.uniforms.uTime.value = elapsed;
    diskMat.uniforms.uMotion.value = profile.motion;
    diskMat.uniforms.uLight.value = profile.light;
    diskMat.uniforms.uPhasePulse.value = speechPulse;

    upperLensedMat.uniforms.uTime.value = elapsed;
    upperLensedMat.uniforms.uMotion.value = profile.motion;
    upperLensedMat.uniforms.uLight.value = profile.light;
    upperLensedMat.uniforms.uPhasePulse.value = speechPulse;

    lowerLensedMat.uniforms.uTime.value = elapsed;
    lowerLensedMat.uniforms.uMotion.value = profile.motion;
    lowerLensedMat.uniforms.uLight.value = profile.light;
    lowerLensedMat.uniforms.uPhasePulse.value = speechPulse;

    photonRingMat.uniforms.uTime.value = elapsed;
    photonRingMat.uniforms.uLight.value = profile.light;
    photonRingMat.uniforms.uPulse.value = speechPulse;

    accretionParticles.material.uniforms.uTime.value = elapsed;
    accretionParticles.material.uniforms.uMotion.value = profile.motion;
    accretionParticles.material.uniforms.uOpacity.value = 0.85 * profile.stars;

    starfield.material.uniforms.uTime.value = elapsed;
    starfield.material.uniforms.uOpacity.value = 0.85 * profile.stars;

    if (bloom) {
      bloom.strength = profile.light < 0.1 ? 0.05 : 0.22 + profile.light * profile.bloom;
    }

    if (!composer) renderer.render(scene, camera);
    else composer.render();
  }

  raf = requestAnimationFrame(animate);

  return {
    canvas: renderer.domElement,
    setVisualState(next) {
      if (PROFILES[next]) state = next;
    },
    setImmersive(next) {
      immersive = Boolean(next);
      if (!immersive) keys.clear();
      resize();
    },
    setDrawerOpen(next) {
      drawerOpen = Boolean(next);
    },
    focus() {
      renderer.domElement.focus({ preventScroll: true });
    },
    resetView() {
      cameraDesired.yaw = 0;
      cameraDesired.pitch = 0;
      cameraDesired.distance = CAMERA.homeDistance;
      targetDesired.copy(drawerOpen ? shiftedTarget : homeTarget);
      manualCamera = false;
      keys.clear();
      markManual();
    },
    diagnostics() {
      const probe = new THREE.Vector3().project(camera);
      return {
        frames,
        fps,
        state,
        drawerOpen,
        renderer: renderer.info.render,
        memory: renderer.info.memory,
        rendererName,
        webglVersion: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? 2 : 1,
        softwareRenderer,
        bloomEnabled: Boolean(bloom),
        dpr: renderer.getPixelRatio(),
        canvas: [renderer.domElement.width, renderer.domElement.height],
        camera: camera.position.toArray(),
        target: target.toArray(),
        yaw: cameraCurrent.yaw,
        pitch: cameraCurrent.pitch,
        distance: cameraCurrent.distance,
        probeScreenX: probe.x,
        autoDriftVelocity,
        autoDriftResumeInMs: Math.max(0, CAMERA.autoDriftResumeMs - (performance.now() - lastInteraction)),
        mode: manualCamera ? 'MANUAL' : drawerOpen ? 'SPLIT_RIGHT' : 'HOME_CENTER',
        immersive,
      };
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointercancel', onUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('contextmenu', onContext);
      renderer.domElement.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', resize);
      document.removeEventListener('fullscreenchange', resize);

      starfield.geometry.dispose();
      starfield.material.dispose();
      horizonGeo.dispose();
      horizonMat.dispose();
      photonRingGeo.dispose();
      photonRingMat.dispose();
      diskGeo.dispose();
      diskMat.dispose();
      upperLensedGeo.dispose();
      upperLensedMat.dispose();
      lowerLensedGeo.dispose();
      lowerLensedMat.dispose();
      accretionParticles.geometry.dispose();
      accretionParticles.material.dispose();

      composer?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
