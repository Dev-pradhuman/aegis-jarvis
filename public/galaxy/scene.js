import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const PROFILES = {
  sleeping: { light: 0.035, motion: 0.12, stars: 0.12 },
  idle: { light: 0.82, motion: 0.42, stars: 0.95 },
  listening: { light: 1.07, motion: 0.72, stars: 0.98 },
  thinking: { light: 1.16, motion: 1.1, stars: 1.02 },
  working: { light: 1.32, motion: 1.38, stars: 1.12 },
  speaking: { light: 1.1, motion: 0.86, stars: 1.02 },
};

const CAMERA = Object.freeze({
  fov: 55, homeDistance: 9, minDistance: 2.1, maxDistance: 19,
  minPitch: -1.28, maxPitch: 1.28, orbitSensitivity: 0.0052,
  panSensitivity: 0.0015, zoomSensitivity: 0.0011, damping: 5.2,
  moveSpeed: 2.0, maxOffset: 5.5,
  autoDriftRadiansPerSecond: 0.005, autoDriftResumeMs: 3000, autoDriftEase: 1.1,
});

function randomGenerator(seed) {
  let value = seed >>> 0;
  return () => ((value = Math.imul(1664525, value) + 1013904223 >>> 0) / 4294967296);
}

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.12, 'rgba(205,241,255,.9)');
  gradient.addColorStop(0.34, 'rgba(78,155,255,.36)');
  gradient.addColorStop(1, 'rgba(18,70,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function starField(count, radius, depth, seed, options = {}) {
  const random = randomGenerator(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2;
    const distance = Math.pow(random(), options.bias || 0.62) * radius;
    positions[i * 3] = Math.cos(angle) * distance;
    positions[i * 3 + 1] = Math.sin(angle) * distance * (0.57 + random() * 0.18) + (options.y || 0);
    positions[i * 3 + 2] = (random() - 0.5) * depth + (options.z || 0);
    const tint = random();
    const color = new THREE.Color(tint > 0.93 ? '#a6e5ff' : tint > 0.55 ? '#d0e1ff' : '#7ea5eb');
    colors.set(color.toArray(), i * 3);
    const classRoll = random();
    sizes[i] = (classRoll > 0.995 ? 2.15 : classRoll > 0.93 ? 1.26 : 0.49 + random() * 0.45) * (options.size || 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: options.opacity || 0.8 }, uTime: { value: 0 }, uPixelRatio: { value: 1 } },
    vertexShader: `attribute float size; varying vec3 vColor; varying float vPulse; uniform float uTime; uniform float uPixelRatio;
      void main(){vColor=color; float rare=step(.94,fract(sin(position.x*17.31+position.y*41.7)*43758.5453)); vPulse=1.0+rare*.12*sin(uTime*.52+position.x*3.1+position.y*7.2); vec4 view=modelViewMatrix*vec4(position,1.0); gl_PointSize=clamp(size*3.2*(8.0/-view.z)*uPixelRatio,1.0,8.0*uPixelRatio); gl_Position=projectionMatrix*view;}`,
    fragmentShader: `uniform float uOpacity; varying vec3 vColor; varying float vPulse;
      void main(){float d=length(gl_PointCoord-vec2(.5)); float source=1.0-smoothstep(.11,.25,d); float light=(1.0-smoothstep(.24,.48,d))*.11; float alpha=(source+light)*uOpacity*vPulse; if(alpha<.012) discard; gl_FragColor=vec4(vColor,alpha);}`,
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geometry, material);
}

export function mountGalaxyScene(container, { reducedMotion = false, quality = 'auto' } = {}) {
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  const gl = renderer.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const softwareRenderer = /swiftshader|llvmpipe|software/i.test(rendererName || '');
  const postprocessing = !softwareRenderer && quality !== 'low';
  const pixelBudget = quality === 'high' ? 2500000 : 1900000;
  const ratio = (w, h) => Math.max(0.55, Math.min(window.devicePixelRatio || 1, 1.6, Math.sqrt(pixelBudget / Math.max(1, w * h))));
  renderer.setSize(width, height);
  renderer.setPixelRatio(ratio(width, height));
  renderer.setClearColor('#000008', 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.className = 'galaxy-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#000008', 0.009);
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, width / height, 0.1, 90);
  camera.position.set(0, 0, 9);
  const target = new THREE.Vector3(0, 0.38, 0);
  camera.lookAt(target);
  const composer = postprocessing ? new EffectComposer(renderer) : null;
  if (composer) composer.addPass(new RenderPass(scene, camera));
  const bloom = postprocessing ? new UnrealBloomPass(new THREE.Vector2(width / 2, height / 2), 0.1, 0.12, 1.12) : null;
  if (bloom) composer.addPass(bloom);

  const texture = glowTexture();
  const far = starField(500, 13, 15, 73210, { z: 0, size: 0.7, opacity: 0.4, bias: 0.9 });
  const middle = starField(1420, 5.35, 7.5, 90124, { z: 0, size: 0.98, opacity: 0.92 });
  const near = starField(460, 3.05, 5.2, 21176, { z: 0, size: 1.08, opacity: 0.95 });
  scene.add(far, middle, near);

  const brain = new THREE.Group();
  brain.position.y = 0.38;
  scene.add(brain);
  // A volumetric source: no visible glass shell or orbit geometry.
  function coreCloud(count, minRadius, radiusRange, seed, { opacity, size, depth = 1 } = {}) {
    const random = randomGenerator(seed);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const directionY = random() * 2 - 1;
      const direction = random() * Math.PI * 2;
      const radial = minRadius + Math.pow(random(), 1.32) * radiusRange;
      const irregular = 1 + Math.sin(direction * 5.3 + directionY * 8.1) * 0.09 + (random() - .5) * .15;
      const ring = Math.sqrt(1 - directionY * directionY) * radial * irregular;
      positions[i * 3] = Math.cos(direction) * ring;
      positions[i * 3 + 1] = directionY * radial * irregular * .84;
      positions[i * 3 + 2] = Math.sin(direction) * ring * depth;
      const tint = random();
      const color = new THREE.Color(tint > .94 ? '#f5fcff' : tint > .66 ? '#c6edff' : tint > .3 ? '#83c7ff' : '#4899ee');
      colors.set(color.toArray(), i * 3);
      const roll = random();
      sizes[i] = (roll < .77 ? .34 + random() * .25 : roll < .97 ? .68 + random() * .36 : 1.16 + random() * .6) * size;
      phases[i] = random() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: opacity }, uMotion: { value: 0.4 }, uPixelRatio: { value: 1 } },
      vertexShader: `attribute float size; attribute float phase; varying vec3 vColor; varying float vFlicker; uniform float uTime; uniform float uMotion; uniform float uPixelRatio;
        void main(){float t=uTime*uMotion; float angle=t*(.025+.024*sin(phase))+phase*.02; float c=cos(angle),s=sin(angle); vec3 p=position; p.xz=mat2(c,-s,s,c)*p.xz; p+=vec3(sin(t*.38+phase),cos(t*.33+phase*1.7),sin(t*.27+phase*2.1))*.016; vec4 view=modelViewMatrix*vec4(p,1.0); vColor=color; vFlicker=.92+.08*sin(t*.7+phase); gl_PointSize=clamp(size*3.4*(8.0/-view.z)*uPixelRatio,1.0,8.0*uPixelRatio); gl_Position=projectionMatrix*view;}`,
      fragmentShader: `uniform float uOpacity; varying vec3 vColor; varying float vFlicker;
        void main(){float d=length(gl_PointCoord-vec2(.5)); float source=1.0-smoothstep(.08,.21,d); float fringe=(1.0-smoothstep(.22,.47,d))*.12; float alpha=(source+fringe)*uOpacity*vFlicker; if(alpha<.015) discard; gl_FragColor=vec4(vColor*1.65,alpha);}`,
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    points.userData.baseOpacity = opacity;
    return points;
  }

  const innerCloud = coreCloud(2200, .26, .54, 29304, { opacity: .98, size: .9 });
  const middleCloud = coreCloud(2700, .48, 1.45, 43117, { opacity: .93, size: .94 });
  const outerCloud = coreCloud(1300, .86, 2.1, 80713, { opacity: .78, size: .85 });
  brain.add(innerCloud, middleCloud, outerCloud);

  const nucleusMaterial = new THREE.MeshBasicMaterial({ color: '#f8fcff', toneMapped: false });
  const nucleus = new THREE.Mesh(new THREE.IcosahedronGeometry(.27, 5), nucleusMaterial);
  brain.add(nucleus);
  const auraMaterial = new THREE.SpriteMaterial({ map: texture, color: '#297cea', transparent: true, opacity: .2, blending: THREE.AdditiveBlending, depthWrite: false });
  const aura = new THREE.Sprite(auraMaterial);
  aura.scale.set(5.4, 5.4, 1);
  brain.add(aura);
  const middleAuraMaterial = auraMaterial.clone();
  middleAuraMaterial.color.set('#338dff');
  const middleAura = new THREE.Sprite(middleAuraMaterial);
  middleAura.scale.set(2.8, 2.8, 1);
  brain.add(middleAura);
  const innerAuraMaterial = auraMaterial.clone();
  innerAuraMaterial.color.set('#79d8ff');
  const innerAura = new THREE.Sprite(innerAuraMaterial);
  innerAura.scale.set(1.05, 1.05, 1);
  brain.add(innerAura);

  let state = 'idle';
  let profile = { ...PROFILES.idle };
  const homeTarget = target.clone();
  const targetDesired = target.clone();
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
  renderer.domElement.setAttribute('aria-label', 'Galaxy navigation: drag to orbit, wheel to zoom, Shift drag to pan');
  const panBy = (dx, dy) => {
    const scale = CAMERA.panSensitivity * cameraCurrent.distance;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    targetDesired.addScaledVector(right, -dx * scale).addScaledVector(up, dy * scale);
    const offset = targetDesired.clone().sub(homeTarget);
    if (offset.length() > CAMERA.maxOffset) targetDesired.copy(homeTarget).add(offset.setLength(CAMERA.maxOffset));
  };
  const markManual = () => { lastInteraction = performance.now(); autoDriftVelocity = 0; };
  const zoomBy = (delta) => { cameraDesired.distance = THREE.MathUtils.clamp(cameraDesired.distance * Math.exp(delta * CAMERA.zoomSensitivity), CAMERA.minDistance, CAMERA.maxDistance); manualCamera = true; markManual(); };
  const onMove = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer = { x: (event.clientX - rect.left) / rect.width * 2 - 1, y: (event.clientY - rect.top) / rect.height * 2 - 1 };
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (gesture?.mode === 'touch-pair') { panBy(center.x - gesture.x, center.y - gesture.y); if (gesture.distance > 1 && distance > 1) zoomBy(Math.log(gesture.distance / distance) / CAMERA.zoomSensitivity); }
      gesture = { mode: 'touch-pair', x: center.x, y: center.y, distance };
    } else if (gesture && gesture.mode !== 'touch-pair') {
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      if (gesture.mode === 'pan') panBy(dx, dy);
      else { cameraDesired.yaw -= dx * CAMERA.orbitSensitivity; cameraDesired.pitch = THREE.MathUtils.clamp(cameraDesired.pitch + dy * CAMERA.orbitSensitivity, CAMERA.minPitch, CAMERA.maxPitch); }
      gesture.x = event.clientX; gesture.y = event.clientY;
    }
    manualCamera = true; markManual();
  };
  const onDown = (event) => {
    if (![0, 1, 2].includes(event.button)) return;
    event.preventDefault(); renderer.domElement.focus({ preventScroll: true });
    renderer.domElement.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gesture = pointers.size === 1 ? { mode: event.button === 2 || event.button === 1 || event.shiftKey ? 'pan' : 'orbit', x: event.clientX, y: event.clientY } : null;
    markManual();
  };
  const onUp = (event) => { pointers.delete(event.pointerId); gesture = null; markManual(); try { renderer.domElement.releasePointerCapture(event.pointerId); } catch {} };
  const onWheel = (event) => { event.preventDefault(); zoomBy(event.deltaY * (event.deltaMode === 1 ? 16 : 1)); };
  const onContext = (event) => event.preventDefault();
  const onKeyDown = (event) => {
    if (!immersive || document.activeElement !== renderer.domElement || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    const key = event.key.toLowerCase();
    if ('wasdqe'.includes(key) && key.length === 1) { event.preventDefault(); keys.add(key); markManual(); }
  };
  const onKeyUp = (event) => { if (keys.delete(event.key.toLowerCase())) markManual(); };
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
    const w = Math.max(1, container.clientWidth), h = Math.max(1, container.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const dpr = ratio(w, h);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h);
    composer?.setPixelRatio(dpr);
    composer?.setSize(w, h);
    for (const field of [far, middle, near, innerCloud, middleCloud, outerCloud]) field.material.uniforms.uPixelRatio.value = dpr;
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  window.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', resize);

  function animate(now) {
    if (disposed) return;
    raf = requestAnimationFrame(animate);
    const navigating = pointers.size > 0 || keys.size > 0 || now - lastInteraction < CAMERA.autoDriftResumeMs;
    const targetFps = (state === 'sleeping' || reducedMotion) && !navigating ? 20 : 60;
    if (now - last < 1000 / targetFps) return;
    const dt = Math.min((now - last) / 1000 || 0, 0.05);
    last = now;
    frames++;
    fpsFrames++;
    if (now - fpsStarted >= 1000) { fps = Math.round(fpsFrames * 1000 / (now - fpsStarted)); fpsFrames = 0; fpsStarted = now; }
    const elapsed = (now - start) * 0.001;
    const desired = PROFILES[state] || PROFILES.idle;
    for (const key of Object.keys(profile)) profile[key] = THREE.MathUtils.damp(profile[key], desired[key], state === 'sleeping' ? 1.6 : 1.1, dt);
    if (immersive && keys.size) {
      const forward = new THREE.Vector3(-Math.sin(cameraCurrent.yaw), 0, -Math.cos(cameraCurrent.yaw));
      const right = new THREE.Vector3(Math.cos(cameraCurrent.yaw), 0, -Math.sin(cameraCurrent.yaw));
      const movement = new THREE.Vector3();
      if (keys.has('w')) movement.add(forward); if (keys.has('s')) movement.sub(forward);
      if (keys.has('d')) movement.add(right); if (keys.has('a')) movement.sub(right);
      if (keys.has('e')) movement.y += 1; if (keys.has('q')) movement.y -= 1;
      if (movement.lengthSq()) { targetDesired.addScaledVector(movement.normalize(), CAMERA.moveSpeed * dt); const offset = targetDesired.clone().sub(homeTarget); if (offset.length() > CAMERA.maxOffset) targetDesired.copy(homeTarget).add(offset.setLength(CAMERA.maxOffset)); manualCamera = true; }
    }
    if (keys.size) { lastInteraction = now; autoDriftVelocity = 0; }
    const mayDrift = pointers.size === 0 && keys.size === 0 && now - lastInteraction >= CAMERA.autoDriftResumeMs;
    const driftTarget = mayDrift ? CAMERA.autoDriftRadiansPerSecond * (reducedMotion ? .15 : 1) : 0;
    autoDriftVelocity = THREE.MathUtils.damp(autoDriftVelocity, driftTarget, CAMERA.autoDriftEase, dt);
    cameraDesired.yaw += autoDriftVelocity * dt;
    const parallax = manualCamera || reducedMotion ? 0 : 1;
    cameraCurrent.yaw = THREE.MathUtils.damp(cameraCurrent.yaw, cameraDesired.yaw + pointer.x * .014 * parallax, CAMERA.damping, dt);
    cameraCurrent.pitch = THREE.MathUtils.damp(cameraCurrent.pitch, cameraDesired.pitch - pointer.y * .009 * parallax, CAMERA.damping, dt);
    cameraCurrent.distance = THREE.MathUtils.damp(cameraCurrent.distance, cameraDesired.distance, CAMERA.damping, dt);
    target.lerp(targetDesired, 1 - Math.exp(-CAMERA.damping * dt));
    const horizontal = Math.cos(cameraCurrent.pitch) * cameraCurrent.distance;
    camera.position.set(target.x + Math.sin(cameraCurrent.yaw) * horizontal, target.y + Math.sin(cameraCurrent.pitch) * cameraCurrent.distance, target.z + Math.cos(cameraCurrent.yaw) * horizontal);
    camera.lookAt(target);
    brain.rotation.y += dt * 0.016 * profile.motion;
    brain.rotation.x = Math.sin(elapsed * 0.09) * 0.016;
    const brainSize = state === 'sleeping' ? 0.27 : 1.4;
    brain.scale.setScalar(THREE.MathUtils.damp(brain.scale.x, brainSize, 1.6, dt));
    middle.rotation.z += dt * 0.0025 * profile.motion;
    near.rotation.z -= dt * 0.006 * profile.motion;
    const breath = 1 + Math.sin(elapsed * (state === 'speaking' ? 4.2 : 1.18)) * (state === 'speaking' ? 0.09 : 0.045);
    nucleus.scale.setScalar(breath * (state === 'sleeping' ? .48 : 1));
    auraMaterial.opacity = Math.min(.42, profile.light * .4) * breath;
    middleAuraMaterial.opacity = Math.min(.5, profile.light * .45) * breath;
    innerAuraMaterial.opacity = Math.min(.62, profile.light * .48) * breath;
    nucleusMaterial.color.setRGB(Math.min(1.35, profile.light * 1.45), Math.min(1.42, profile.light * 1.5), Math.min(1.45, profile.light * 1.56));
    for (const field of [far, middle, near, innerCloud, middleCloud, outerCloud]) {
      field.material.uniforms.uTime.value = elapsed * profile.motion;
      field.material.uniforms.uOpacity.value = (field.userData.baseOpacity ??= field.material.uniforms.uOpacity.value) * profile.stars;
      if (field.material.uniforms.uMotion) field.material.uniforms.uMotion.value = profile.motion;
    }
    if (bloom) bloom.strength = profile.light < 0.1 ? 0.015 : 0.06 + profile.light * 0.045;
    if (!composer) renderer.render(scene, camera);
    else composer.render();
  }
  raf = requestAnimationFrame(animate);

  return {
    canvas: renderer.domElement,
    setVisualState(next) { if (PROFILES[next]) state = next; },
    setImmersive(next) { immersive = Boolean(next); if (!immersive) keys.clear(); resize(); },
    focus() { renderer.domElement.focus({ preventScroll: true }); },
    resetView() { cameraDesired.yaw = 0; cameraDesired.pitch = 0; cameraDesired.distance = CAMERA.homeDistance; targetDesired.copy(homeTarget); manualCamera = false; keys.clear(); markManual(); },
    diagnostics() { const probe = new THREE.Vector3().fromBufferAttribute(far.geometry.getAttribute('position'), 100).project(camera); return { frames, fps, state, renderer: renderer.info.render, memory: renderer.info.memory, rendererName, webglVersion: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext ? 2 : 1, softwareRenderer, bloomEnabled: Boolean(bloom), dpr: renderer.getPixelRatio(), canvas: [renderer.domElement.width, renderer.domElement.height], camera: camera.position.toArray(), target: target.toArray(), yaw: cameraCurrent.yaw, pitch: cameraCurrent.pitch, distance: cameraCurrent.distance, probeScreenX: probe.x, autoDriftVelocity, autoDriftResumeInMs: Math.max(0, CAMERA.autoDriftResumeMs - (performance.now() - lastInteraction)), mode: targetDesired.distanceTo(homeTarget) > .1 ? 'FREE_EXPLORE' : manualCamera ? 'ORBIT' : 'HOME', immersive }; },
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
      for (const field of [far, middle, near, innerCloud, middleCloud, outerCloud]) { field.geometry.dispose(); field.material.dispose(); }
      nucleus.geometry.dispose(); nucleusMaterial.dispose();
      auraMaterial.dispose(); middleAuraMaterial.dispose(); innerAuraMaterial.dispose(); texture.dispose(); composer?.dispose(); renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
