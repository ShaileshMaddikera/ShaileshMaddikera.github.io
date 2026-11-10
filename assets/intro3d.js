/* The 3D title — one filmed shot per letter, rendered like a film title.
   Three.js r160 (assets/vendor). main.js loads this module and falls back to the 2D intro
   if WebGL or the module isn't available.

   Look: HDR render → depth of field → anamorphic streaks → bloom → ACES tone map → grade
   (teal/orange split, contrast, vignette, grain, chromatic aberration).
   World: sky dome, mountain silhouettes, stone ground, smoke, light shafts, embers, ash.
   Letters: forged metal (hammered surface, studio strip-light reflections) that lands red-hot and cools.
   Impacts: rock debris, spark streaks, dust clouds, shockwaves, slow motion on the big hits. */
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ───────────────────────── Helpers ───────────────────────── */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeIn = (t) => t * t;
const easeInCubic = (t) => t * t * t;
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOutBack = (t) => { const c = 1.5; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const rnd = (a, b) => a + Math.random() * (b - a);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const linear = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
const FX = 1; // render layer for particles/billboards (kept out of the depth-of-field depth pass)

/** Tileable value-noise fBm as a Float32Array in [0,1]. */
function fbm(size, { cells = 8, octaves = 5, ridged = false, seed = 1 } = {}) {
  let s = seed * 9301 + 49297;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const out = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = cells << o;
    const grid = new Float32Array(n * n).map(rand);
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * n, y0 = Math.floor(gy), fy = gy - y0, sy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * n, x0 = Math.floor(gx), fx = gx - x0, sx = fx * fx * (3 - 2 * fx);
        const a = grid[(y0 % n) * n + (x0 % n)], b = grid[(y0 % n) * n + ((x0 + 1) % n)];
        const c = grid[((y0 + 1) % n) * n + (x0 % n)], d = grid[((y0 + 1) % n) * n + ((x0 + 1) % n)];
        let v = lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
        if (ridged) v = 1 - Math.abs(v * 2 - 1);
        out[y * size + x] += v * amp;
      }
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function dataTexture(size, fn, { srgb = false, repeat = 1 } = {}) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const [r, g, b, a = 1] = fn(i);
    data[i * 4] = clamp(r) * 255; data[i * 4 + 1] = clamp(g) * 255; data[i * 4 + 2] = clamp(b) * 255; data[i * 4 + 3] = clamp(a) * 255;
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

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

/* ───────────────────────── Post-processing shaders ───────────────────────── */

const QUAD_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

const DofShader = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, focus: { value: 6 }, aperture: { value: 0.02 },
    maxblur: { value: 0.0065 }, near: { value: 0.1 }, far: { value: 600 }, aspect: { value: 1 } },
  vertexShader: QUAD_VS,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform sampler2D tDepth;
    uniform float focus, aperture, maxblur, near, far, aspect;
    varying vec2 vUv;
    float dist(vec2 uv){ float d = texture2D(tDepth, uv).x; return (near * far) / (far - d * (far - near)); }
    void main(){
      float z = dist(vUv);
      float coc = clamp(abs(z - focus) / max(z, 0.001) * aperture, 0.0, maxblur);
      vec4 sum = texture2D(tDiffuse, vUv); float tot = 1.0;
      if (coc > 0.0006) {
        float rot = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
        for (int i = 0; i < 20; i++) {
          float r = sqrt((float(i) + 0.5) / 20.0); float a = float(i) * 2.39996 + rot;
          vec2 o = vec2(cos(a), sin(a) * aspect) * r * coc;
          vec4 s = texture2D(tDiffuse, vUv + o);
          float w = 1.0 + min(dot(s.rgb, vec3(0.3)), 2.0) * 0.8; // bright samples bloom into soft bokeh discs
          sum += s * w; tot += w;
        }
      }
      gl_FragColor = sum / tot;
    }`,
};

const StreakShader = {
  uniforms: { tDiffuse: { value: null }, texel: { value: new THREE.Vector2() }, strength: { value: 0.012 }, threshold: { value: 2.0 } },
  vertexShader: QUAD_VS,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 texel; uniform float strength, threshold; varying vec2 vUv;
    void main(){
      vec4 base = texture2D(tDiffuse, vUv); vec3 acc = vec3(0.0);
      for (int i = 1; i <= 10; i++) {
        float o = float(i * i) * 3.0; float w = exp(-float(i) * 0.2);
        vec3 a = texture2D(tDiffuse, vUv + vec2(o * texel.x, 0.0)).rgb;
        vec3 b = texture2D(tDiffuse, vUv - vec2(o * texel.x, 0.0)).rgb;
        acc += (max(a - threshold, 0.0) + max(b - threshold, 0.0)) * w;
      }
      gl_FragColor = vec4(base.rgb + acc * strength * vec3(0.55, 0.8, 1.3), base.a); // anamorphic: blue-ish horizontal flares
    }`,
};

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, res: { value: new THREE.Vector2(1, 1) }, fade: { value: 0 }, ca: { value: 1 } },
  vertexShader: QUAD_VS,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float time, fade, ca; uniform vec2 res; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5; float r2 = dot(d, d);
      vec3 c;
      c.r = texture2D(tDiffuse, vUv + d * r2 * 0.018 * ca).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - d * r2 * 0.018 * ca).b;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(c, c * vec3(0.86, 1.0, 1.14), (1.0 - smoothstep(0.0, 0.35, l)) * 0.55);   // teal in the shadows
      c = mix(c, c * vec3(1.1, 1.0, 0.86), smoothstep(0.45, 1.0, l) * 0.35);            // amber in the highlights
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.35);                                        // filmic contrast
      c = mix(vec3(l), c, 1.08);                                                        // a touch more saturation
      float v = smoothstep(1.0, 0.28, length(d * vec2(1.0, 0.9)));
      c *= mix(0.42, 1.0, v);                                                           // vignette
      float g = hash(vUv * res + fract(time * 13.7) * 91.0) - 0.5;
      c += g * 0.05 * (1.0 - l * 0.6);                                                  // film grain
      gl_FragColor = vec4(c * fade, 1.0);
    }`,
};

/* ───────────────────────── The title ───────────────────────── */

/**
 * Plays the title. Resolves (with a dispose()) when it's done or skipped.
 * @param {{canvas: HTMLCanvasElement, fontUrl: string, word: string, isSkipped: () => boolean,
 *          onSubtitle: () => void, onReady: () => void}} o
 */
export async function playTitle3D(o) {
  const { canvas, fontUrl, word, isSkipped, onSubtitle, onReady } = o;
  const font = await new FontLoader().loadAsync(fontUrl);

  const phone = Math.min(innerWidth, innerHeight) < 600 || matchMedia('(pointer: coarse)').matches;
  let quality = phone ? 'low' : 'high';
  const TIERS = { high: { dpr: 1.5, dof: true, streak: true }, medium: { dpr: 1.25, dof: true, streak: false }, low: { dpr: 1, dof: false, streak: false } };

  /* ── Renderer & camera ── */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;

  const scene = new THREE.Scene();
  const FOG = linear(0.07, 0.026, 0.01);
  scene.fog = new THREE.FogExp2(FOG, 0.02);
  scene.background = FOG;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 600);
  camera.layers.enable(FX);
  scene.add(camera);

  /* ── Reflections: a small "studio" of strip lights, baked into an environment map ── */
  {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(40, 24, 40), new THREE.MeshBasicMaterial({ color: linear(0.012, 0.008, 0.006), side: THREE.BackSide })));
    const panel = (w, h, pos, rot, col) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }));
      m.position.copy(pos); m.rotation.set(rot.x, rot.y, rot.z); env.add(m);
    };
    panel(14, 4, V(0, 11, 2), V(Math.PI / 2, 0, 0), linear(3.4, 3.0, 2.5));        // top softbox
    panel(1.4, 18, V(-14, 2, 0), V(0, Math.PI / 2, 0), linear(6, 2.6, 0.8));       // warm strip, left
    panel(1.4, 18, V(14, 2, 0), V(0, -Math.PI / 2, 0), linear(1.2, 2.0, 3.4));     // cool strip, right
    panel(30, 2.5, V(0, -3, 14), V(0, Math.PI, 0), linear(4, 1.4, 0.35));          // fire, low and in front
    panel(30, 4, V(0, 2, -14), V(0, 0, 0), linear(5, 1.8, 0.45));                  // fire, behind
    scene.environment = pmrem.fromScene(env, 0.03).texture;
    pmrem.dispose();
  }

  /* ── Light ── */
  scene.add(new THREE.HemisphereLight(linear(0.5, 0.32, 0.22), linear(0.02, 0.01, 0.01), 0.35));
  const key = new THREE.DirectionalLight(linear(1, 0.88, 0.72), 2.2);
  key.position.set(-7, 14, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048);
  Object.assign(key.shadow.camera, { left: -13, right: 13, top: 10, bottom: -8, near: 1, far: 50 });
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(linear(1, 0.42, 0.12), 4.2);
  rim.position.set(2, 5, -14);
  scene.add(rim);
  const fires = [V(-5, 0.4, 4.2), V(5.5, 0.4, 3.6)].map((p) => {
    const l = new THREE.PointLight(linear(1, 0.38, 0.08), 40, 0, 2);
    l.position.copy(p); scene.add(l); return l;
  });
  const camFill = new THREE.PointLight(linear(1, 0.78, 0.55), 6, 0, 2);
  camFill.position.set(0.5, 0.6, 0);
  camera.add(camFill);
  const sheen = new THREE.SpotLight(linear(1, 0.95, 0.85), 0, 40, 0.3, 0.7, 1.2);
  scene.add(sheen, sheen.target);

  /* ── Sky dome with a burning horizon behind the title ── */
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { horizon: { value: FOG } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 horizon; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float h = d.y; float back = max(0.0, -d.z);
        vec3 top = vec3(0.004, 0.003, 0.004);
        vec3 col = mix(horizon, top, smoothstep(-0.02, 0.5, h));
        float burn = pow(back, 5.0) * exp(-abs(h - 0.02) * 9.0);
        col += vec3(1.1, 0.36, 0.08) * burn;                       // the glow behind the mountains
        col += vec3(0.22, 0.06, 0.018) * pow(back, 2.0) * exp(-abs(h) * 3.0);
        if (h < -0.01) col = horizon;
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  scene.add(sky);

  /* ── Mountains: two jagged ridgelines against the glow (near is darker), for scale and depth ── */
  function ridge(R, base, height, seed, col) {
    const seg = 720, pos = [], idx = [];
    const n1 = fbm(512, { cells: 10, octaves: 5, ridged: true, seed }), n2 = fbm(512, { cells: 48, octaves: 3, seed: seed + 1 });
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, j = 256 * 512 + Math.min(511, Math.floor((i / seg) * 512));
      const back = Math.max(0, -Math.cos(a));
      const h = base + height * (Math.pow(n1[j], 1.8) * (0.5 + back * 0.6)) + n2[j] * height * 0.06;
      pos.push(Math.sin(a) * R, -3, -Math.cos(a) * R, Math.sin(a) * R, h, -Math.cos(a) * R);
      if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, fog: false, side: THREE.DoubleSide })));
  }
  ridge(170, 2, 34, 7, linear(0.05, 0.02, 0.01));     // far range: hazy
  ridge(110, 0, 16, 13, linear(0.008, 0.005, 0.004)); // near range: near-black

  /* ── Ground: dark cracked stone ── */
  {
    const S = 256, base = fbm(S, { cells: 8, octaves: 6, seed: 3 }), cracks = fbm(S, { cells: 6, octaves: 3, ridged: true, seed: 11 });
    const h = base.map((v, i) => clamp(v * 0.7 + Math.pow(cracks[i], 12) * -0.55 + 0.25));
    const map = dataTexture(S, (i) => { const v = 0.18 + h[i] * 0.22; return [v * 1.0, v * 0.78, v * 0.66]; }, { srgb: true, repeat: 60 });
    const bump = dataTexture(S, (i) => [h[i], h[i], h[i]], { repeat: 60 });
    const rough = dataTexture(S, (i) => { const v = 0.62 + base[i] * 0.35; return [v, v, v]; }, { repeat: 60 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600),
      new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 2.2, roughnessMap: rough, roughness: 1, metalness: 0.05, envMapIntensity: 0.35 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
  }

  /* ── Atmosphere: back glow, light shafts, smoke banks ── */
  const glowTex = radialTexture([[0, 'rgba(255,170,90,1)'], [0.3, 'rgba(255,100,25,.5)'], [1, 'rgba(255,60,10,0)']]);
  const smokeTex = (() => {
    const S = 128, n = fbm(S, { cells: 4, octaves: 5, seed: 5 });
    return dataTexture(S, (i) => {
      const x = (i % S) / S - 0.5, y = Math.floor(i / S) / S - 0.5, r = Math.sqrt(x * x + y * y) * 2;
      const a = clamp(1 - r) ** 1.6 * (0.35 + n[i] * 0.9);
      return [1, 1, 1, a];
    }, { srgb: true });
  })();
  const shaftTex = (() => {
    const S = 128;
    return dataTexture(S, (i) => {
      const x = (i % S) / S, y = Math.floor(i / S) / S;
      const a = Math.exp(-Math.pow((x - 0.5) * 4.2, 2)) * Math.pow(y, 1.4) * (1 - y * 0.15);
      return [1, 1, 1, a];
    }, { srgb: true });
  })();

  const fxMat = (opts) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, ...opts });
  const backGlow = new THREE.Mesh(new THREE.PlaneGeometry(220, 70), fxMat({ map: glowTex, blending: THREE.AdditiveBlending, fog: false, opacity: 0.3 }));
  backGlow.position.set(0, 4, -120);
  backGlow.layers.set(FX);
  scene.add(backGlow);

  const shafts = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 40), fxMat({ map: shaftTex, blending: THREE.AdditiveBlending, color: linear(1, 0.5, 0.18), opacity: 0.07, side: THREE.DoubleSide, fog: false }));
    m.position.set(rnd(-18, 18), 12, rnd(-30, -16));
    m.rotation.set(0, rnd(-0.3, 0.3), rnd(-0.35, 0.35));
    m.layers.set(FX);
    scene.add(m);
    shafts.push({ m, phase: rnd(0, 6.28) });
  }

  const smokeBank = [];
  for (let i = 0; i < (phone ? 10 : 18); i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: linear(0.32, 0.17, 0.1), opacity: rnd(0.25, 0.5), depthWrite: false, fog: true }));
    const s = rnd(14, 30);
    sp.scale.set(s, s * 0.55, 1);
    sp.position.set(rnd(-30, 30), rnd(1.5, 6), rnd(-34, -10));
    sp.material.rotation = rnd(0, 6.28);
    sp.layers.set(FX);
    scene.add(sp);
    smokeBank.push({ sp, vx: rnd(-0.25, 0.25), vr: rnd(-0.04, 0.04) });
  }

  const dotTex = radialTexture([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.8)'], [1, 'rgba(255,255,255,0)']], 64);

  /* ── Embers (rising) and ash (falling) ── */
  const EMBERS = phone ? 280 : 650;
  const ePos = new Float32Array(EMBERS * 3), eVel = new Float32Array(EMBERS), eCol = new Float32Array(EMBERS * 3);
  const resetEmber = (i, anywhere) => {
    ePos[i * 3] = rnd(-18, 18); ePos[i * 3 + 1] = anywhere ? rnd(0, 14) : rnd(-0.5, 0.3); ePos[i * 3 + 2] = rnd(-16, 8);
    eVel[i] = rnd(0.3, 1.4);
    const hot = rnd(1.5, 5);
    eCol[i * 3] = hot; eCol[i * 3 + 1] = hot * rnd(0.3, 0.55); eCol[i * 3 + 2] = hot * 0.08;
  };
  for (let i = 0; i < EMBERS; i++) resetEmber(i, true);
  const eGeo = new THREE.BufferGeometry();
  eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
  eGeo.setAttribute('color', new THREE.BufferAttribute(eCol, 3));
  const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({ map: dotTex, vertexColors: true, size: 0.06, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  embers.layers.set(FX);
  scene.add(embers);

  const ASH = phone ? 120 : 260;
  const aPos = new Float32Array(ASH * 3);
  for (let i = 0; i < ASH; i++) { aPos[i * 3] = rnd(-16, 16); aPos[i * 3 + 1] = rnd(0, 14); aPos[i * 3 + 2] = rnd(-12, 8); }
  const aGeo = new THREE.BufferGeometry();
  aGeo.setAttribute('position', new THREE.BufferAttribute(aPos, 3));
  const ash = new THREE.Points(aGeo, new THREE.PointsMaterial({ map: dotTex, color: linear(0.22, 0.2, 0.19), size: 0.045, transparent: true, opacity: 0.7, depthWrite: false }));
  ash.layers.set(FX);
  scene.add(ash);

  /* ── Letters: forged metal ── */
  const SIZE = 1.6, DEPTH = 0.44, GAP = 0.1;
  const metalNoise = fbm(256, { cells: 16, octaves: 4, seed: 21 });
  const hammer = dataTexture(256, (i) => [metalNoise[i], metalNoise[i], metalNoise[i]], { repeat: 1.4 });
  const roughMap = dataTexture(256, (i) => { const v = 0.55 + metalNoise[i] * 0.45; return [v, v, v]; }, { repeat: 1.4 });
  const heatMap = dataTexture(256, (i) => { const v = Math.pow(metalNoise[i], 2.2); return [v, v * 0.9, v * 0.8]; }, { repeat: 1.1 });
  const scale = SIZE / font.data.resolution;
  let cursor = 0;
  const letters = [...word].map((ch) => {
    const geo = new TextGeometry(ch, { font, size: SIZE, height: DEPTH, curveSegments: phone ? 8 : 14,
      bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.042, bevelSegments: phone ? 3 : 6 });
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -DEPTH / 2);
    geo.computeVertexNormals();
    const face = new THREE.MeshStandardMaterial({
      color: linear(0.78, 0.55, 0.3), metalness: 1, roughness: 0.34, roughnessMap: roughMap, bumpMap: hammer, bumpScale: 0.6,
      envMapIntensity: 1.6,
      emissive: linear(1, 0.2, 0.025), emissiveMap: heatMap, emissiveIntensity: 0,
    });
    const side = face.clone();
    side.color = linear(0.42, 0.26, 0.13);
    side.roughness = 0.42;
    const mesh = new THREE.Mesh(geo, [face, side]);
    mesh.castShadow = true;
    mesh.visible = false;
    const adv = font.data.glyphs[ch].ha * scale;
    const centre = cursor + adv / 2;
    cursor += adv + GAP;
    scene.add(mesh);
    return { ch, mesh, face, side, x: centre, heat: 0, p: V() };
  });
  const wordWidth = cursor - GAP;
  letters.forEach((l) => { l.x -= wordWidth / 2; });
  const setHeat = (l, h) => { l.heat = h; l.face.emissiveIntensity = h; l.side.emissiveIntensity = h * 1.3; };

  /* ── Impact effects: rock debris, spark streaks, dust clouds, shockwave rings, hot spots ── */
  const ROCKS = phone ? 160 : 360;
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.035, 0),
    new THREE.MeshStandardMaterial({ color: linear(0.13, 0.095, 0.07), roughness: 0.9, flatShading: true }), ROCKS);
  rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rocks.castShadow = true;
  rocks.frustumCulled = false;
  const rockState = Array.from({ length: ROCKS }, () => ({ alive: false, p: V(), v: V(), r: V(), w: V(), s: 1 }));
  const dummy = new THREE.Object3D();
  let rockNext = 0;
  scene.add(rocks);

  const SPARKS = phone ? 220 : 520;
  const sPos = new Float32Array(SPARKS * 6), sCol = new Float32Array(SPARKS * 6);
  const sparkState = Array.from({ length: SPARKS }, () => ({ alive: false, p: V(), v: V(), life: 0, max: 1 }));
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  const sparks = new THREE.LineSegments(sGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sparks.layers.set(FX);
  sparks.frustumCulled = false;
  scene.add(sparks);
  let sparkNext = 0;

  const PUFFS = phone ? 50 : 90;
  const puffs = Array.from({ length: PUFFS }, () => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: linear(0.4, 0.28, 0.2), opacity: 0, depthWrite: false }));
    sp.layers.set(FX); sp.visible = false; scene.add(sp);
    return { sp, alive: false, v: V(), age: 0, life: 1, s0: 1, s1: 3, op: 0.5, spin: 0 };
  });
  let puffNext = 0;

  const rings = [];
  const spots = [];
  const spotTex = radialTexture([[0, 'rgba(255,190,110,1)'], [0.3, 'rgba(255,110,30,.6)'], [1, 'rgba(255,60,10,0)']], 128);

  function spawnRocks(at, n, power, upward = 1) {
    for (let k = 0; k < n; k++) {
      const st = rockState[rockNext]; rockNext = (rockNext + 1) % ROCKS;
      const a = rnd(0, Math.PI * 2), sp = rnd(1.5, 6.5) * power;
      st.alive = true;
      st.p.set(at.x + rnd(-0.5, 0.5), 0.08, at.z + rnd(-0.25, 0.25));
      st.v.set(Math.cos(a) * sp, rnd(2, 7) * power * upward, Math.sin(a) * sp * 0.6);
      st.r.set(rnd(0, 6), rnd(0, 6), rnd(0, 6));
      st.w.set(rnd(-14, 14), rnd(-14, 14), rnd(-14, 14));
      st.s = rnd(0.35, 1.5);
    }
  }
  function spawnSparks(at, n, power, spread = 1) {
    for (let k = 0; k < n; k++) {
      const st = sparkState[sparkNext]; sparkNext = (sparkNext + 1) % SPARKS;
      const a = rnd(0, Math.PI * 2), sp = rnd(3, 11) * power;
      st.alive = true; st.life = 0; st.max = rnd(0.5, 1.4);
      st.p.set(at.x + rnd(-0.3, 0.3) * spread, at.y + 0.05, at.z + rnd(-0.2, 0.2) * spread);
      st.v.set(Math.cos(a) * sp, rnd(2, 9) * power, Math.sin(a) * sp * 0.7);
    }
  }
  function spawnPuffs(at, n, power, { rise = 1, op = 0.55 } = {}) {
    for (let k = 0; k < n; k++) {
      const pf = puffs[puffNext]; puffNext = (puffNext + 1) % PUFFS;
      const a = rnd(0, Math.PI * 2), sp = rnd(0.8, 3.2) * power;
      pf.alive = true; pf.age = 0; pf.life = rnd(1.6, 3.2); pf.op = op * rnd(0.6, 1);
      pf.s0 = rnd(0.6, 1.4) * power; pf.s1 = pf.s0 * rnd(3, 6); pf.spin = rnd(-0.6, 0.6);
      pf.sp.position.set(at.x + rnd(-0.6, 0.6), rnd(0.2, 0.7), at.z + rnd(-0.4, 0.4));
      pf.v.set(Math.cos(a) * sp, rnd(0.2, 1.1) * rise, Math.sin(a) * sp * 0.6);
      pf.sp.material.rotation = rnd(0, 6.28);
      pf.sp.visible = true;
    }
  }
  const ringGeo = new THREE.RingGeometry(0.96, 1, 128), spotGeo = new THREE.PlaneGeometry(2.6, 1.5);
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(ringGeo, fxMat({ color: linear(3, 1.3, 0.45), blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.layers.set(FX); m.visible = false; scene.add(m);
    rings.push({ m, age: 0, life: 1.1, power: 1, alive: false });
  }
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(spotGeo, fxMat({ map: spotTex, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.layers.set(FX); m.visible = false; scene.add(m);
    spots.push({ m, age: 0, alive: false });
  }
  let ringNext = 0, spotNext = 0;
  function spawnRing(at, power) {
    const r = rings[ringNext]; ringNext = (ringNext + 1) % rings.length;
    r.m.position.set(at.x, 0.04, at.z); r.age = 0; r.power = power; r.alive = true; r.m.visible = true;
  }
  function spawnSpot(at) {
    const sp = spots[spotNext]; spotNext = (spotNext + 1) % spots.length;
    sp.m.position.set(at.x, 0.02, at.z + 0.3); sp.age = 0; sp.alive = true; sp.m.visible = true;
  }

  function stepEffects(dt) {
    for (let i = 0; i < ROCKS; i++) {
      const st = rockState[i];
      if (st.alive) {
        st.v.y -= 16 * dt;
        st.p.addScaledVector(st.v, dt);
        if (st.p.y < 0.05) { st.p.y = 0.05; st.v.y *= -0.32; st.v.x *= 0.6; st.v.z *= 0.6; st.w.multiplyScalar(0.6); }
        st.r.addScaledVector(st.w, dt);
        dummy.position.copy(st.p); dummy.rotation.set(st.r.x, st.r.y, st.r.z); dummy.scale.setScalar(st.p.distanceToSquared(camera.position) < 1.2 ? 0.0001 : st.s);
      } else { dummy.position.set(0, -50, 0); dummy.scale.setScalar(0.0001); }
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    }
    rocks.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < SPARKS; i++) {
      const st = sparkState[i], j = i * 6;
      if (st.alive) {
        st.life += dt;
        st.v.y -= 9.8 * dt;
        st.p.addScaledVector(st.v, dt);
        if (st.p.y < 0.03) { st.p.y = 0.03; st.v.y *= -0.35; st.v.x *= 0.7; st.v.z *= 0.7; }
        if (st.life > st.max) st.alive = false;
        const k = 1 - st.life / st.max, len = 0.03;
        sPos[j] = st.p.x; sPos[j + 1] = st.p.y; sPos[j + 2] = st.p.z;
        sPos[j + 3] = st.p.x - st.v.x * len; sPos[j + 4] = st.p.y - st.v.y * len; sPos[j + 5] = st.p.z - st.v.z * len;
        const hot = 3.4 * k;
        sCol[j] = hot; sCol[j + 1] = hot * (0.25 + 0.5 * k); sCol[j + 2] = hot * 0.12 * k;
        sCol[j + 3] = hot * 0.3; sCol[j + 4] = hot * 0.08; sCol[j + 5] = 0;
      } else {
        for (let q = 0; q < 6; q++) sCol[j + q] = 0;
      }
    }
    sGeo.attributes.position.needsUpdate = true;
    sGeo.attributes.color.needsUpdate = true;

    for (const pf of puffs) {
      if (!pf.alive) continue;
      pf.age += dt;
      const k = pf.age / pf.life;
      pf.v.multiplyScalar(Math.exp(-dt * 1.6));
      pf.sp.position.addScaledVector(pf.v, dt);
      const s = lerp(pf.s0, pf.s1, easeOut(clamp(k)));
      pf.sp.scale.set(s, s * 0.8, 1);
      pf.sp.material.rotation += pf.spin * dt;
      pf.sp.material.opacity = pf.op * Math.min(1, k * 8) * (1 - k);
      if (k >= 1) { pf.alive = false; pf.sp.visible = false; }
    }
    for (const r of rings) {
      if (!r.alive) continue;
      r.age += dt;
      const k = r.age / r.life, s = 0.4 + easeOut(clamp(k)) * 11 * r.power;
      r.m.scale.set(s, s, s);
      r.m.material.opacity = (1 - clamp(k)) ** 1.5;
      if (k >= 1) { r.alive = false; r.m.visible = false; }
    }
    for (const sp of spots) {
      if (!sp.alive) continue;
      sp.age += dt;
      sp.m.material.opacity = 0.45 * Math.exp(-sp.age * 1.2);
      if (sp.age > 5) { sp.alive = false; sp.m.visible = false; }
    }
  }

  /* ── Impacts ── */
  let shake = 0, flash = 0;
  function impact(l, power = 1, { ring = false, upward = 1 } = {}) {
    const at = V(l.x, 0, l.p.z);
    spawnRocks(at, Math.round(22 * power), power, upward);
    spawnSparks(V(at.x, 0.1, at.z + 0.25), Math.round(60 * power), power);
    spawnPuffs(at, Math.round(9 * power), power);
    spawnSpot(at);
    if (ring) spawnRing(at, power);
    setHeat(l, 0.45 + 0.25 * power);
    shake = Math.max(shake, 0.07 * power);
    flash = Math.max(flash, 0.35 * power);
  }

  /* ── Shots: duration, where the letter is at t (0..1), and where the camera wants to be (and its lens) ── */
  const Y0 = SIZE * 0.5;
  const shots = [
    { // S — a meteor from the sky; the camera rides down with it
      dur: 1.35, cut: true, hit: 0.8, power: 1.2, slow: true, lock: true, meteor: true,
      pose(t, x) {
        const u = clamp(t / 0.8);
        const y = t < 0.8 ? 30 * (1 - easeIn(u)) : 0.1 * Math.sin(Math.PI * clamp((t - 0.8) / 0.12)) * (t < 0.92 ? 1 : 0);
        return { p: V(x, y, 0), r: V((1 - u) * 1.5, (1 - u) * 0.7, (1 - u) * 0.4) };
      },
      cam(t, l) { const y = l.p.y; return { pos: V(l.x + 3.0, Math.max(0.7, y + 0.55), 5.4), at: V(l.x, y + Y0, 0), fov: lerp(30, 34, t) }; },
    },
    { // H — erupts out of the ground; telephoto at ground level
      dur: 1.0, cut: true, hit: 0.0, power: 0.9, upward: 1.6, k: 9,
      pose(t, x) { const e = easeOutBack(clamp(t / 0.6)); return { p: V(x, lerp(-SIZE * 1.4, 0, e), 0), r: V(0, (1 - clamp(t / 0.6)) * -0.4, 0) }; },
      cam(t, l) { return { pos: V(lerp(l.x - 5.2, l.x - 4.2, t), lerp(0.25, 0.7, t), lerp(4.4, 5.6, t)), at: V(l.x, 0.8, 0), fov: 22 }; },
    },
    { // A — swings in from the side, spinning; the camera orbits
      dur: 1.0, cut: true, hit: 0.78, power: 0.9, k: 8,
      pose(t, x) {
        const e = easeOut(clamp(t / 0.78));
        const s = V(x + 7, 5, -4), c = V(x + 4, 5.5, 2.5), f = V(x, 0, 0);
        const p = s.clone().multiplyScalar((1 - e) ** 2).add(c.clone().multiplyScalar(2 * (1 - e) * e)).add(f.clone().multiplyScalar(e * e));
        return { p, r: V(0, (1 - e) * Math.PI * 3, (1 - e) * 0.6) };
      },
      cam(t, l) { const a = lerp(1.2, 0.3, easeInOut(t)); return { pos: V(l.x + Math.sin(a) * 6.2, lerp(2.2, 1.0, t), Math.cos(a) * 6.2), at: V(l.p.x, l.p.y + Y0, l.p.z), fov: 30 }; },
    },
    { // I — drills down like a spear; top-down, then a crane to the ground
      dur: 1.0, cut: true, hit: 0.6, power: 1.3, ring: true, slow: true, k: 10, meteor: true,
      pose(t, x) { const u = clamp(t / 0.6); return { p: V(x, 11 * (1 - easeInCubic(u)), 0), r: V(0, (1 - u) * Math.PI * 8, 0) }; },
      cam(t, l) {
        const k = easeInOut(clamp((t - 0.55) / 0.45));
        return { pos: V(lerp(l.x + 1.2, l.x + 2.0, k), lerp(9.5, 1.0, k), lerp(7.5, 4.2, k)), at: V(l.x, lerp(Math.max(0, l.p.y * 0.6), Y0, k), 0), fov: lerp(30, 30, k) };
      },
    },
    { // L — slides out of the fog throwing sparks; tracking shot at ground level
      dur: 1.0, cut: true, hit: 0.8, power: 0.7, trail: true, k: 14,
      pose(t, x) { const e = easeOut(clamp(t / 0.8)); return { p: V(x, 0, lerp(-32, 0, e)), r: V(-0.1 * (1 - e), 0, 0) }; },
      cam(t, l) { return { pos: V(l.x + 3.4, 0.45, l.p.z + lerp(2.4, 3.6, t)), at: V(l.p.x, 0.7, l.p.z), fov: 26 }; },
    },
    { // E — flips over the lens and lands; front close-up pulls back
      dur: 1.0, cut: true, hit: 0.8, power: 0.9, k: 9,
      pose(t, x) {
        const u = clamp(t / 0.8);
        const y = 3.2 * Math.sin(Math.PI * u) * (1 - u * 0.15);
        return { p: V(x, Math.max(0, y), lerp(3, 0, easeOut(u))), r: V(easeInOut(u) * Math.PI * 2, 0, 0) };
      },
      cam(t, l) { return { pos: V(l.x + 1.2, lerp(2.6, 1.6, t), lerp(9.5, 7.2, t)), at: V(l.p.x, Math.max(Y0, l.p.y + Y0 * 0.6), l.p.z), fov: 28 }; },
    },
    { // S — vertigo: straight down from above while the lens dolly-zooms
      dur: 1.1, cut: true, hit: 0.68, power: 1.0, lock: true, k: 16,
      pose(t, x) { const u = clamp(t / 0.68); return { p: V(x, 13 * (1 - easeIn(u)), 0), r: V(0, (1 - u) * 1.6, 0) }; },
      cam(t, l) {
        const k = easeInOut(clamp((t - 0.6) / 0.4));
        return { pos: V(lerp(l.x + 0.4, l.x - 1.8, k), lerp(15, 3.4, k), lerp(5.5, 5, k)), at: V(l.x, lerp(l.p.y + Y0 * 0.5, Y0, k), 0), fov: lerp(16, 44, easeInOut(clamp(t / 0.7))) };
      },
    },
    { // H — the last one slams into the gap; the whole name shakes
      dur: 1.25, cut: false, hit: 0.5, power: 2.0, ring: true, slow: true, k: 6, meteor: true,
      pose(t, x) { const u = clamp(t / 0.5); return { p: V(x, 32 * (1 - easeIn(u)), 0), r: V((1 - u) * 0.8, 0, (1 - u) * -0.5) }; },
      cam(t, l, wide) { return { pos: V(lerp(wide.pos.x + 3, wide.pos.x, t), lerp(3.6, wide.pos.y, t), lerp(wide.pos.z * 0.75, wide.pos.z, t)), at: V(lerp(l.x * 0.6, 0, t), lerp(2.8, Y0, easeOut(t)), 0), fov: wide.fov }; },
    },
  ].slice(0, letters.length);
  shots.forEach((s) => { s.dur *= 0.8; });

  // Final framing: the whole word fits on any screen shape.
  function wideShot() {
    const fov = camera.aspect < 1 ? 46 : 30;
    const vf = THREE.MathUtils.degToRad(fov), hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    const z = Math.max(11, (wordWidth * 1.22) / 2 / Math.tan(hf / 2) + DEPTH);
    return { pos: V(0, 1.3, z), fov };
  }

  /* ── Post-processing ── */
  const composer = new EffectComposer(renderer);
  let depthRT = null;
  function makeDepthTarget(w, h) {
    depthRT?.dispose();
    depthRT = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true });
    depthRT.depthTexture = new THREE.DepthTexture(w, h);
    dof.uniforms.tDepth.value = depthRT.depthTexture;
  }
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
  const dof = new ShaderPass(DofShader);
  const streak = new ShaderPass(StreakShader);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.55, 1.15);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(dof);
  composer.addPass(streak);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(grade);

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    const dpr = renderer.getPixelRatio();
    makeDepthTarget(Math.max(1, Math.round(w * dpr * 0.5)), Math.max(1, Math.round(h * dpr * 0.5)));
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dof.uniforms.aspect.value = camera.aspect;
    streak.uniforms.texel.value.set(1 / (w * dpr), 1 / (h * dpr));
    grade.uniforms.res.value.set(w * dpr, h * dpr);
  }
  function applyQuality() {
    const tier = TIERS[quality];
    const dpr = Math.min(devicePixelRatio || 1, tier.dpr);
    renderer.setPixelRatio(dpr);
    composer.setPixelRatio(dpr);
    dof.enabled = tier.dof;
    streak.enabled = tier.streak;
    resize();
  }
  applyQuality();
  addEventListener('resize', resize);

  /* ── Camera rig: cuts snap; otherwise the camera glides after its mark. Handheld drift on top. ── */
  const camPos = V(0, 30, 12), camAt = V(0, 29, 0);
  let fov = 32, shakeT = 0;
  function aim(target, dt, snap, k = 7) {
    if (snap) { camPos.copy(target.pos); camAt.copy(target.at); fov = target.fov ?? fov; return; }
    const f = 1 - Math.exp(-k * dt);
    camPos.lerp(target.pos, f);
    camAt.lerp(target.at, f);
    if (target.fov) fov = lerp(fov, target.fov, 1 - Math.exp(-6 * dt));
  }
  function applyCamera(dt, T) {
    shakeT += dt;
    shake *= Math.exp(-dt * 4.5);
    const s = shake, hh = 0.012; // handheld
    camera.position.set(
      camPos.x + Math.sin(shakeT * 61) * s + Math.sin(T * 0.9) * hh * 2,
      camPos.y + Math.sin(shakeT * 47 + 1) * s + Math.sin(T * 1.3 + 2) * hh,
      camPos.z + Math.sin(shakeT * 53 + 2) * s * 0.5,
    );
    camera.lookAt(camAt.x + Math.sin(T * 0.7) * hh * 3, camAt.y + Math.sin(T * 1.1 + 1) * hh * 2, camAt.z);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }

  /* ── Timeline (scene time; slow motion stretches it around the big hits) ── */
  const timeline = [];
  let t0 = 0.5;
  shots.forEach((s, i) => { timeline.push({ i, start: t0, hitAt: t0 + s.hit * s.dur }); t0 += s.dur - (i < shots.length - 1 ? 0.05 : 0); });
  const FINALE = t0, END = FINALE + 2.5;

  // Warm up shaders so the first frames don't stutter.
  const pooled = [...letters.map((l) => l.mesh), ...rings.map((r) => r.m), ...spots.map((sp) => sp.m), ...puffs.map((pf) => pf.sp)];
  pooled.forEach((o) => { o.visible = true; });
  letters.forEach((l) => l.mesh.position.set(l.x, -50, 0));
  renderer.compile(scene, camera);
  composer.render(0.016); // also compiles the post-processing passes
  pooled.forEach((o) => { o.visible = false; });

  onReady?.();

  return new Promise((resolve) => {
    let raf = 0, last = performance.now(), T = 0, timeScale = 1, active = -1, subtitleShown = false;
    const hit = new Set();
    const frameTimes = [];

    function done() {
      removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
      resolve({
        dispose() {
          scene.traverse((obj) => {
            obj.geometry?.dispose();
            (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => { if (!m) return; for (const k in m) if (m[k]?.isTexture) m[k].dispose(); m.dispose(); });
          });
          scene.environment?.dispose();
          depthRT?.dispose(); composer.dispose?.(); renderer.dispose(); renderer.forceContextLoss?.();
        },
      });
    }

    function frame(now) {
      const real = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (isSkipped()) return done();

      // Adaptive quality: if the first ~1.5 s runs slow, drop to the light pipeline.
      if (quality !== 'low') {
        if (!document.hidden && real < 0.09) frameTimes.push(real);
        if (frameTimes.length === 45) {
          const sorted = [...frameTimes].sort((a, b) => a - b), median = sorted[22];
          if (median > 1 / 45) { quality = quality === 'high' ? 'medium' : 'low'; applyQuality(); }
          frameTimes.length = 0;
        }
      }

      // Slow motion around the big impacts.
      const want = timeline.some((seg) => shots[seg.i].slow && T > seg.hitAt - 0.1 && T < seg.hitAt + 0.08) ? 0.35 : 1;
      timeScale = lerp(timeScale, want, 1 - Math.exp(-real * 14));
      const dt = real * timeScale;
      T += dt;

      // World motion.
      for (let i = 0; i < EMBERS; i++) {
        ePos[i * 3 + 1] += eVel[i] * dt;
        ePos[i * 3] += Math.sin(T * 1.3 + i) * 0.005;
        if (ePos[i * 3 + 1] > 15) resetEmber(i, false);
      }
      eGeo.attributes.position.needsUpdate = true;
      eGeo.attributes.color.needsUpdate = true;
      for (let i = 0; i < ASH; i++) {
        aPos[i * 3 + 1] -= 0.22 * dt; aPos[i * 3] += Math.sin(T * 0.8 + i) * 0.004;
        if (aPos[i * 3 + 1] < 0) aPos[i * 3 + 1] = 14;
      }
      aGeo.attributes.position.needsUpdate = true;
      for (const s of smokeBank) { s.sp.position.x += s.vx * dt; s.sp.material.rotation += s.vr * dt; }
      for (const s of shafts) s.m.material.opacity = 0.05 + 0.035 * Math.sin(T * 0.6 + s.phase);
      fires.forEach((f, i) => { f.intensity = 34 + 10 * Math.sin(T * 9 + i * 2) + 6 * Math.sin(T * 23 + i) + flash * 55; });
      flash *= Math.exp(-dt * 6);
      stepEffects(dt);

      // Letters.
      const wide = wideShot();
      for (const seg of timeline) {
        const l = letters[seg.i], s = shots[seg.i];
        if (T < seg.start) continue;
        const t = clamp((T - seg.start) / s.dur);
        const pose = s.pose(t, l.x);
        l.mesh.visible = true;
        l.mesh.position.copy(pose.p);
        l.mesh.rotation.set(pose.r.x, pose.r.y, pose.r.z);
        l.p.copy(pose.p);
        if (!hit.has(seg.i) && t >= s.hit) {
          hit.add(seg.i);
          impact(l, s.power ?? 1, { ring: !!s.ring, upward: s.upward ?? 1 });
        }
        if (!hit.has(seg.i)) {
          if (s.meteor) { setHeat(l, 0.55); if (Math.random() < 0.9) spawnSparks(V(l.p.x, l.p.y + Y0, l.p.z), 2, 0.25, 2); }
          if (s.trail) spawnSparks(V(l.p.x, 0.05, l.p.z - 0.2), 3, 0.35);
        } else if (l.heat > 0.001) {
          setHeat(l, l.heat * Math.exp(-dt * (T > FINALE ? 2.6 : 1.1))); // cooling metal
        }
      }

      // Camera: follow the newest shot; after the last letter, the wide shot pushes in.
      const current = timeline.filter((seg) => T >= seg.start).pop();
      let focusAt;
      if (T < FINALE && current) {
        const s = shots[current.i], l = letters[current.i];
        const t = clamp((T - current.start) / s.dur);
        const target = s.cam(t, l, wide);
        const isNew = current.i !== active;
        active = current.i;
        aim(target, dt, (isNew && s.cut) || (s.lock && t < s.hit), s.k ?? 7);
        focusAt = V(l.p.x, l.p.y + Y0, l.p.z);
      } else if (T < FINALE) {
        aim({ pos: V(letters[0].x + 3.1, 31, 5.6), at: V(letters[0].x, 30.5, 0), fov: 30 }, dt, true);
        focusAt = V(letters[0].x, 30.5, 0);
      } else {
        const k = easeInOut(clamp((T - FINALE) / (END - FINALE)));
        aim({ pos: V(0, lerp(wide.pos.y, 1.05, k), lerp(wide.pos.z, wide.pos.z * 0.88, k)), at: V(0, Y0 * 0.95, 0), fov: wide.fov }, dt, false, 3);
        focusAt = V(0, Y0, 0);
        const sk = clamp((T - FINALE - 0.15) / 1.6);
        sheen.intensity = 240 * Math.sin(Math.PI * sk);
        sheen.position.set(lerp(-16, 16, easeInOut(sk)), 7, 10);
        sheen.target.position.set(lerp(-wordWidth / 2, wordWidth / 2, easeInOut(sk)), Y0, 0);
        if (!subtitleShown && T > FINALE + 0.45) { subtitleShown = true; onSubtitle?.(); }
      }
      applyCamera(dt, T);

      // Lens: focus on the subject; deeper focus in the wide shot.
      const fd = camera.position.distanceTo(focusAt);
      dof.uniforms.focus.value = lerp(dof.uniforms.focus.value, fd, 1 - Math.exp(-real * 10));
      dof.uniforms.aperture.value = T < FINALE ? 0.02 : 0.008;
      dof.uniforms.near.value = camera.near; dof.uniforms.far.value = camera.far;
      // Thinner fog when the camera is far back, so the name stays crisp on tall screens.
      scene.fog.density = 0.02 * Math.min(1, 14 / Math.max(14, camPos.length()));
      grade.uniforms.time.value = T;
      grade.uniforms.fade.value = Math.min(1, T / 0.8);
      bloom.strength = 0.4 + flash * 0.35;

      // Depth pre-pass (solid geometry only) for depth of field, then the full chain.
      if (dof.enabled) {
        camera.layers.set(0);
        scene.overrideMaterial = depthOnly;
        renderer.setRenderTarget(depthRT);
        renderer.render(scene, camera);
        scene.overrideMaterial = null;
        renderer.setRenderTarget(null);
        camera.layers.enable(FX);
      }
      renderer.shadowMap.needsUpdate = true;
      composer.render(real);

      if (T >= END) return done();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame((n) => { last = n; frame(n); });
  });
}
