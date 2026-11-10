/* The 3D title: each letter of the name gets its own shot, and the camera films it arriving.
   Three.js (WebGL), hosted in assets/vendor. main.js loads this module and falls back to the
   CSS intro if WebGL or the module isn't available. */
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeIn = (t) => t * t;
const easeInCubic = (t) => t * t * t;
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOutBack = (t) => { const c = 1.6; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const rnd = (a, b) => a + Math.random() * (b - a);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function radialTexture(stops, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => grad.addColorStop(o, col));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Plays the title. Resolves when it's done or skipped.
 * @param {{canvas: HTMLCanvasElement, fontUrl: string, word: string, isSkipped: () => boolean,
 *          onSubtitle: () => void, onReady: () => void}} o
 */
export async function playTitle3D(o) {
  const { canvas, fontUrl, word, isSkipped, onSubtitle, onReady } = o;
  const font = await new FontLoader().loadAsync(fontUrl);

  // ── Renderer, scene, camera ──
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const small = Math.min(innerWidth, innerHeight) < 600;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const FOG = 0x0c0605;
  scene.background = new THREE.Color(FOG);
  scene.fog = new THREE.FogExp2(FOG, 0.03);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = camera.aspect < 1 ? 58 : 40;
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', resize);

  // ── Light: cool key from above, fire from below-front, warm rim from behind ──
  scene.add(new THREE.HemisphereLight(0x6a4630, 0x0a0505, 0.9));
  const key = new THREE.DirectionalLight(0xffe2bd, 2.4);
  key.position.set(-7, 14, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -14, right: 14, top: 10, bottom: -6, near: 1, far: 50 });
  key.shadow.bias = -0.0004;
  scene.add(key);
  const fire = new THREE.PointLight(0xff6a1c, 55, 0, 2);
  fire.position.set(0, 0.5, 4.5);
  scene.add(fire);
  const rim = new THREE.DirectionalLight(0xff8a3c, 1.6);
  rim.position.set(0, 5, -12);
  scene.add(rim);
  const camFill = new THREE.PointLight(0xffcf9a, 14, 0, 2);
  camera.add(camFill);
  camFill.position.set(0.6, 0.8, 0);
  scene.add(camera);
  const sheen = new THREE.SpotLight(0xfff4e0, 0, 30, 0.35, 0.6, 1.2);
  sheen.position.set(-12, 6, 8);
  scene.add(sheen, sheen.target);

  // ── Ground, distant fire glow, horizon ──
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000),
    new THREE.MeshStandardMaterial({ color: 0x150d09, roughness: 0.9, metalness: 0.15 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const glowTex = radialTexture([[0, 'rgba(255,140,50,1)'], [0.35, 'rgba(255,90,20,.45)'], [1, 'rgba(255,60,10,0)']]);
  const backGlow = new THREE.Mesh(new THREE.PlaneGeometry(160, 50),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.85 }));
  backGlow.position.set(0, 2, -60);
  scene.add(backGlow);
  const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(30, 14),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.2 }));
  floorGlow.rotation.x = -Math.PI / 2;
  floorGlow.position.set(0, 0.01, 1.5);
  scene.add(floorGlow);

  const lineTex = radialTexture([[0, 'rgba(255,240,215,1)'], [0.25, 'rgba(255,160,70,.9)'], [1, 'rgba(255,90,20,0)']], 128);
  const horizon = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.22),
    new THREE.MeshBasicMaterial({ map: lineTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  horizon.position.set(0, 0.02, 1.15);
  horizon.rotation.x = -Math.PI / 2;
  horizon.scale.x = 0.001;
  scene.add(horizon);

  // ── Letters: extruded, bevelled metal ──
  const SIZE = 1.6, DEPTH = 0.42, GAP = 0.1;
  const faceMat = new THREE.MeshStandardMaterial({ color: 0xeadbbd, metalness: 1, roughness: 0.24, envMapIntensity: 1.1 });
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x8a6438, metalness: 1, roughness: 0.4, envMapIntensity: 0.9 });
  const scale = SIZE / font.data.resolution;
  let cursor = 0;
  const letters = [...word].map((ch) => {
    const geo = new TextGeometry(ch, { font, size: SIZE, height: DEPTH, curveSegments: small ? 6 : 10,
      bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.035, bevelSegments: small ? 2 : 4 });
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -DEPTH / 2); // pivot: bottom centre
    const width = bb.max.x - bb.min.x;
    const adv = font.data.glyphs[ch].ha * scale;
    const mesh = new THREE.Mesh(geo, [faceMat, sideMat]);
    mesh.castShadow = true;
    mesh.visible = false;
    const centre = cursor + adv / 2;
    cursor += adv + GAP;
    scene.add(mesh);
    return { ch, mesh, x: centre, width };
  });
  const total = cursor - GAP;
  letters.forEach((l) => { l.x -= total / 2; });
  const wordWidth = total;

  // ── Particles: embers always, dust + sparks + shockwave on impact ──
  const dotTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,255,255,.7)'], [1, 'rgba(255,255,255,0)']], 64);
  const EMBERS = small ? 260 : 520;
  const ePos = new Float32Array(EMBERS * 3), eVel = new Float32Array(EMBERS);
  const resetEmber = (i, anywhere) => {
    ePos[i * 3] = rnd(-16, 16); ePos[i * 3 + 1] = anywhere ? rnd(0, 12) : rnd(-0.5, 0.5); ePos[i * 3 + 2] = rnd(-14, 7);
    eVel[i] = rnd(0.35, 1.3);
  };
  for (let i = 0; i < EMBERS; i++) resetEmber(i, true);
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
  const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({ map: dotTex, color: 0xff9a40, size: 0.075, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(embers);

  const bursts = [];
  function burst(pos, { count = 90, speed = 3.2, size = 0.7, color = 0x8c6a52, opacity = 0.5, additive = false, up = 1.4, life = 1.6, gravity = 0.4, ring = false } = {}) {
    const p = new Float32Array(count * 3), v = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = rnd(0, Math.PI * 2), s = rnd(0.3, 1) * speed;
      p[i * 3] = pos.x + rnd(-0.4, 0.4); p[i * 3 + 1] = pos.y + rnd(0, 0.15); p[i * 3 + 2] = pos.z + rnd(-0.3, 0.3);
      v[i * 3] = Math.cos(a) * s; v[i * 3 + 1] = rnd(0.2, 1) * up; v[i * 3 + 2] = Math.sin(a) * s * 0.7;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.PointsMaterial({ map: dotTex, color, size, transparent: true, opacity, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    const pts = new THREE.Points(g, m);
    scene.add(pts);
    bursts.push({ pts, v, age: 0, life, opacity, gravity });
    if (ring) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 96),
        new THREE.MeshBasicMaterial({ color: 0xffa860, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      r.rotation.x = -Math.PI / 2;
      r.position.set(pos.x, 0.03, pos.z);
      scene.add(r);
      bursts.push({ ring: r, age: 0, life: 0.9 });
    }
  }
  function stepBursts(dt) {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.age += dt;
      const k = b.age / b.life;
      if (b.ring) {
        const s = 0.5 + easeOut(clamp(k)) * 9;
        b.ring.scale.set(s, s, s);
        b.ring.material.opacity = 0.8 * (1 - k);
      } else {
        const a = b.pts.geometry.attributes.position.array;
        for (let j = 0; j < a.length; j += 3) {
          b.v[j] *= 0.94; b.v[j + 2] *= 0.94; b.v[j + 1] -= b.gravity * dt * 4;
          a[j] += b.v[j] * dt; a[j + 1] = Math.max(0.02, a[j + 1] + b.v[j + 1] * dt); a[j + 2] += b.v[j + 2] * dt;
        }
        b.pts.geometry.attributes.position.needsUpdate = true;
        b.pts.material.opacity = b.opacity * (1 - k);
        b.pts.material.size *= 1 + dt * 0.6;
      }
      if (k >= 1) {
        const obj = b.ring || b.pts;
        scene.remove(obj); obj.geometry.dispose(); obj.material.dispose();
        bursts.splice(i, 1);
      }
    }
  }

  // ── Impacts ──
  let shakeAmp = 0, horizonOn = false, horizonT = 0;
  function impact(l, power = 1, ring = false) {
    const p = V(l.x, 0, 0);
    burst(p, { count: Math.round(90 * power), speed: 3.4 * power, size: 0.75, ring });
    burst(V(l.x, 0.1, 0.2), { count: Math.round(36 * power), speed: 4.5 * power, size: 0.07, color: 0xffb060, opacity: 1, additive: true, up: 4, life: 1.1, gravity: 1.6 });
    shakeAmp = Math.max(shakeAmp, 0.09 * power);
    fire.intensity = 55 + 90 * power;
    if (!horizonOn) { horizonOn = true; horizonT = 0; }
  }

  // ── The shots. Each letter: a duration, where the letter is at t (0..1), and where the camera wants to be. ──
  const Y0 = SIZE * 0.5; // look a little above the base
  const shots = [
    { // S — falls from the sky; the camera rides down with it
      dur: 1.3, cut: true, hit: 0.82, k: 22,
      pose(t, x) {
        const u = clamp(t / 0.82);
        const y = t < 0.82 ? 26 * (1 - easeIn(u)) : 0.12 * Math.sin(Math.PI * clamp((t - 0.82) / 0.14)) * (t < 0.96 ? 1 : 0);
        return { p: V(x, y, 0), r: V((1 - u) * 1.4, (1 - u) * 0.6, (1 - u) * 0.35) };
      },
      cam(t, l) { const y = l.p.y; return { pos: V(l.x + 2.9, Math.max(0.8, y + 1.1), 5.2), at: V(l.x, y + Y0 * 0.8, 0) }; },
    },
    { // H — erupts out of the ground; low dolly
      dur: 0.9, cut: true, hit: 0.0, power: 0.7,
      pose(t, x) { const e = easeOutBack(clamp(t / 0.62)); return { p: V(x, lerp(-SIZE * 1.4, 0, e), 0), r: V(0, (1 - clamp(t / 0.62)) * -0.5, 0) }; },
      cam(t, l) { return { pos: V(lerp(l.x - 3.4, l.x - 2.2, t), lerp(0.3, 0.85, t), lerp(2.9, 4.2, t)), at: V(l.x, 0.75, 0) }; },
    },
    { // A — swings in from the side, spinning, and lands; the camera orbits
      dur: 0.95, cut: false, hit: 0.78,
      pose(t, x) {
        const e = easeOut(clamp(t / 0.78));
        const s = V(x + 9, 6, -6), c = V(x + 4.5, 6.5, 2.5), f = V(x, 0, 0);
        const p = s.clone().multiplyScalar((1 - e) ** 2).add(c.clone().multiplyScalar(2 * (1 - e) * e)).add(f.clone().multiplyScalar(e * e));
        return { p, r: V(0, (1 - e) * Math.PI * 3, (1 - e) * 0.6) };
      },
      cam(t, l) { const a = lerp(1.15, 0.32, easeInOut(t)); return { pos: V(l.x + Math.sin(a) * 5.4, lerp(1.9, 1.05, t), Math.cos(a) * 5.4), at: V(l.p.x, l.p.y + Y0, l.p.z) }; },
    },
    { // I — drills down like a spear; top-down, then the camera cranes to the ground
      dur: 0.9, cut: true, hit: 0.62, power: 1.1, ring: true, k: 10,
      pose(t, x) { const u = clamp(t / 0.62); return { p: V(x, 11 * (1 - easeInCubic(u)), 0), r: V(0, (1 - u) * Math.PI * 8, 0) }; },
      cam(t, l) {
        const k = easeInOut(clamp((t - 0.5) / 0.5));
        return { pos: V(lerp(l.x + 0.02, l.x + 1.7, k), lerp(14.5, 1.1, k), lerp(1.2, 3.8, k)), at: V(l.x, lerp(0, Y0, k), 0) };
      },
    },
    { // L — slides out of the fog, throwing sparks; tracking shot at ground level
      dur: 0.95, cut: true, hit: 0.8, power: 0.6, trail: true, k: 14,
      pose(t, x) { const e = easeOut(clamp(t / 0.8)); return { p: V(x, 0, lerp(-30, 0, e)), r: V(-0.12 * (1 - e), 0, 0) }; },
      cam(t, l) { return { pos: V(l.x + 3.2, 0.5, l.p.z + lerp(2.2, 3.4, t)), at: V(l.p.x, 0.65, l.p.z) }; },
    },
    { // E — tossed up from in front of the lens, flips once, lands; front close-up pulls back
      dur: 0.95, cut: false, hit: 0.8,
      pose(t, x) {
        const u = clamp(t / 0.8);
        const y = 4.4 * Math.sin(Math.PI * u) * (1 - u * 0.15);
        return { p: V(x, Math.max(0, y), lerp(4.5, 0, easeOut(u))), r: V(easeInOut(u) * Math.PI * 2, 0, 0) };
      },
      cam(t, l) { return { pos: V(l.x + 0.5, lerp(1.3, 1.6, t), lerp(7.8, 6.2, t)), at: V(l.p.x, Math.max(Y0, l.p.y + Y0 * 0.6), l.p.z) }; },
    },
    { // S — vertigo: straight down from above as it falls away from the lens
      dur: 1.0, cut: true, hit: 0.72, k: 16,
      pose(t, x) { const u = clamp(t / 0.72); return { p: V(x, 13 * (1 - easeIn(u)), 0), r: V(0, (1 - u) * 1.6, 0) }; },
      cam(t, l) {
        const k = easeInOut(clamp((t - 0.72) / 0.28));
        return { pos: V(lerp(l.x, l.x - 1.6, k), lerp(15.5, 3.2, k), lerp(0.35, 4.6, k)), at: V(l.x, lerp(0, Y0, k), 0) };
      },
    },
    { // H — the last one slams into the gap; wide, and the whole name shakes
      dur: 1.15, cut: false, hit: 0.55, power: 1.9, ring: true,
      pose(t, x) { const u = clamp(t / 0.55); return { p: V(x, 30 * (1 - easeIn(u)), 0), r: V((1 - u) * 0.8, 0, (1 - u) * -0.5) }; },
      cam(t, l, wide) { return { pos: V(lerp(wide.x + 2, wide.x, t), lerp(3.4, wide.y, t), lerp(wide.z * 0.8, wide.z, t)), at: V(lerp(l.x * 0.6, 0, t), lerp(2.6, Y0, easeOut(t)), 0) }; },
    },
  ].slice(0, letters.length);

  // Distance for the final wide shot so the whole word fits, on any screen shape.
  const wideDist = () => {
    const half = (wordWidth * 1.18) / 2;
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    return Math.max(10.5, half / Math.tan(hfov / 2) + DEPTH);
  };

  // ── Camera rig: cuts snap; otherwise the camera glides after its target (critically damped). ──
  const camPos = V(0, 20, 12), camAt = V(0, 10, 0);
  let shakeT = 0;
  function aim(target, dt, snap, k = 7) {
    if (snap) { camPos.copy(target.pos); camAt.copy(target.at); return; }
    const f = 1 - Math.exp(-k * dt);
    camPos.lerp(target.pos, f);
    camAt.lerp(target.at, f);
  }
  function applyCamera(dt) {
    shakeT += dt;
    shakeAmp *= Math.exp(-dt * 5.5);
    const s = shakeAmp;
    camera.position.set(camPos.x + Math.sin(shakeT * 61) * s, camPos.y + Math.sin(shakeT * 47 + 1) * s, camPos.z + Math.sin(shakeT * 53 + 2) * s * 0.5);
    camera.lookAt(camAt);
  }

  // ── Timeline ──
  const timeline = [];
  let t0 = 0.35;
  shots.forEach((s, i) => { timeline.push({ i, start: t0, end: t0 + s.dur }); t0 += s.dur - (i < shots.length - 1 ? 0.06 : 0); });
  const FINALE = t0, END = FINALE + 3.1;

  onReady?.();
  let last = performance.now(), T = 0, active = -1, hit = new Set(), subtitleShown = false;
  const fireBase = 42;

  return new Promise((resolve) => {
    function done() {
      removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
      resolve({
        dispose() {
          scene.traverse((obj) => { obj.geometry?.dispose(); (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => { m?.map?.dispose(); m?.dispose(); }); });
          scene.environment?.dispose(); pmrem.dispose(); renderer.dispose(); renderer.forceContextLoss?.();
        },
      });
    }
    let raf = 0;
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      T += dt;
      if (isSkipped()) return done();

      // Embers drift up and sway.
      for (let i = 0; i < EMBERS; i++) {
        ePos[i * 3 + 1] += eVel[i] * dt;
        ePos[i * 3] += Math.sin(T * 1.3 + i) * 0.004;
        if (ePos[i * 3 + 1] > 13) resetEmber(i, false);
      }
      eGeo.attributes.position.needsUpdate = true;
      stepBursts(dt);
      fire.intensity = lerp(fire.intensity, fireBase, 1 - Math.exp(-dt * 3));
      if (horizonOn) { horizonT += dt; horizon.scale.x = Math.max(0.001, easeOut(clamp(horizonT / 1.6)) * wordWidth * 1.25); }

      // Letters.
      const wide = V(0, 1.25, wideDist());
      for (const seg of timeline) {
        const l = letters[seg.i], s = shots[seg.i];
        if (T < seg.start) continue;
        const t = clamp((T - seg.start) / s.dur);
        const pose = s.pose(t, l.x);
        l.mesh.visible = true;
        l.mesh.position.copy(pose.p);
        l.mesh.rotation.set(pose.r.x, pose.r.y, pose.r.z);
        l.p = pose.p;
        if (!hit.has(seg.i) && t >= s.hit) {
          hit.add(seg.i);
          impact(l, s.power ?? 1, !!s.ring);
        }
        if (s.trail && t < s.hit && Math.random() < 0.7) {
          burst(V(l.p.x, 0.05, l.p.z - 0.3), { count: 6, speed: 1.4, size: 0.06, color: 0xffb060, opacity: 1, additive: true, up: 2.2, life: 0.6, gravity: 1.2 });
        }
      }

      // Camera: follow the newest shot; after the last letter, the wide shot pushes in slowly.
      const current = timeline.filter((seg) => T >= seg.start).pop();
      if (T < FINALE && current) {
        const s = shots[current.i], l = letters[current.i];
        const t = clamp((T - current.start) / s.dur);
        const target = s.cam(t, l, wide);
        const isNew = current.i !== active;
        active = current.i;
        aim(target, dt, isNew && s.cut, s.k ?? 7);
      } else if (T < FINALE) {
        aim({ pos: V(letters[0].x + 2.7, 27, 4.8), at: V(letters[0].x, 26, 0) }, dt, true);
      } else {
        const k = easeInOut(clamp((T - FINALE) / (END - FINALE)));
        aim({ pos: V(0, lerp(wide.y, 1.05, k), lerp(wide.z, wide.z * 0.9, k)), at: V(0, Y0 * 0.95, 0) }, dt, false, 3);
        // A light sweeps across the metal.
        const sk = clamp((T - FINALE - 0.2) / 1.8);
        sheen.intensity = 220 * Math.sin(Math.PI * sk);
        sheen.position.set(lerp(-14, 14, easeInOut(sk)), 6, 9);
        sheen.target.position.set(lerp(-wordWidth / 2, wordWidth / 2, easeInOut(sk)), Y0, 0);
        if (!subtitleShown && T > FINALE + 0.5) { subtitleShown = true; onSubtitle?.(); }
      }
      // Thinner fog when the camera is far back (tall phone screens), so the name stays crisp.
      scene.fog.density = 0.03 * Math.min(1, 13 / Math.max(13, camPos.length()));
      applyCamera(dt);
      renderer.render(scene, camera);
      if (T >= END) return done();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame((n) => { last = n; frame(n); });
  });
}
