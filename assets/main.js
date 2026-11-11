/* Shailesh Maddikera — site script. No libraries. */
(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

  /* ───────────────────────── Intro: the build ───────────────────────── */
  // A dark title card in a gothic face. Smoke drifts through a dim world that gets darker with every
  // letter; letters are forged one at a time, alone on screen, while the camera circles each: a
  // crimson trace, slices of depth gathering out of the dark, then a black face glitching into
  // place. Total black for a long beat (the name flickers once, like a bad signal). Fade up behind
  // the name, close between the i and the l, and pull back to the whole word (reading the right
  // way round), black against a cold halo. It glitches into the site's type and glides into the
  // hero headline.

  const HOME = { family: 'Geist', weight: 600, track: '-0.045em' };
  const FACE = { family: 'Pirata One', weight: 400, track: '0em' };
  const GLOW = '0 0 .28em rgba(186,196,220,.2)';
  const RGB = (a, b) => `${a}em 0 rgba(214,28,48,.75), ${b}em 0 rgba(80,206,250,.5), 0 0 .28em rgba(186,196,220,.2)`;
  const NAME = 'Shailesh';
  const PERSP = 7;                                  // em; matches .intro-name perspective
  const LAYERS = finePointer ? 10 : 7;              // depth slices per letter (each is a GPU layer)
  const DD = 0.28 / LAYERS;                         // depth per slice (em)
  const FIRST = 1500;                               // first letter settles at FIRST; the rhythm then tightens
  const SHOT_A = 860, SHOT_B = 620;                 // gap after the first letter … before the last
  const DARK_IN = 600, HOLD = 1500;                 // fade to black, then total black before the last shot
  const STACK = 110, SLICE = 300, SETTLE = 240;     // build: slices spread, slice travel, face settling
  const FINAL = 3000;                               // last shot: pull back from behind the name
  // The orbit round each letter: from [distance (em), tilt, turn, roll] to [...]. Each orbit ends
  // near the angle the next one starts from, so the camera never has to whip round.
  const ORBITS = [
    [[2.8, 18, -55, -5], [3.4, 8, 22, 0]],     // S  round from the left
    [[3.1, 38, 28, 2], [3.5, 18, -22, 0]],     // h  over the top
    [[3.4, 6, -28, 0], [3.8, -6, 40, 3]],      // a  low, left to right
    [[4.0, -14, 36, 2], [3.6, -6, -32, -2]],   // i  close, from below
    [[3.2, 12, -36, -7], [3.7, 4, 28, 2]],     // l  dutch angle
    [[3.1, 28, 32, 4], [3.6, 12, -28, 0]],     // e  high
    [[3.6, -10, -32, -2], [3.4, 0, 36, 2]],    // s  low
    [[3.0, 14, 40, 3], [2.8, 8, -10, 0]],      // h  last
  ];

  const intro = $('#intro');
  const introName = $('#introName');
  const introFont = $('#introFont');
  const introCount = $('#introCount');
  const introLine = $('#introLine');
  const introFade = $('#introFade');
  const introDark = $('#introDark');
  const introGhost = $('#introGhost');
  const heroFirst = $('#heroFirst');
  let introRun = 0;
  let skipRequested = false;
  let skipWake = null;
  let camEl = null;
  let tiltEl = null;
  let timers = [];
  let camPose = { x: 0, z: 0, rx: 0, ry: 0, rz: 0 };
  let smokeLight = 1;

  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  const fontSpec = (f, px = 64) => `${f.style || 'normal'} ${f.weight} ${px}px "${f.family}"`;
  const pause = (ms) => new Promise((r) => { const t = setTimeout(r, ms); skipWake = () => { clearTimeout(t); r(); }; });
  const lerp = (a, b, u) => a + (b - a) * u;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp01 = (u) => Math.min(1, Math.max(0, u));
  const smooth = (u) => { u = clamp01(u); return u * u * (3 - 2 * u); };
  const outCubic = (u) => 1 - (1 - clamp01(u)) ** 3;

  function styleType(e, f, fallback) {
    e.style.fontFamily = `"${f.family}", ${fallback}`;
    e.style.fontWeight = f.weight;
    e.style.fontStyle = 'normal';
    e.style.letterSpacing = f.track;
  }
  const styleHome = (e) => styleType(e, HOME, 'var(--sans)');

  // Side walls: graphite at the front edge sinking into black.
  const shade = (k) => { const v = Math.round(44 - ((k - 1) / Math.max(1, LAYERS - 2)) * 36); return `rgb(${v},${v},${v + 3})`; };

  // Restart a glitch burst on one letter.
  function glitch(r, strong = true) {
    r.L.classList.remove('gl', 'gl2');
    void r.L.offsetWidth;
    r.L.classList.add(strong ? 'gl' : 'gl2');
  }

  // Corner text decodes through noise.
  const NOISE = '#%&$@§¥∆/\\|<>01▓▒░';
  function decode(node, text, ms = 420) {
    const id = (node._sc = (node._sc || 0) + 1), t0 = performance.now();
    const step = (now) => {
      if (node._sc !== id) return;
      const u = Math.min(1, (now - t0) / ms), keep = Math.floor(u * text.length);
      node.textContent = [...text].map((c, i) => (i < keep || c === ' ' ? c : NOISE[(Math.random() * NOISE.length) | 0])).join('');
      if (u < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* Smoke: soft puffs drawn on two low-resolution canvases (one behind the word, one in front),
     drifting slowly, lit a little more near the middle of the frame, and shifted with the camera
     so they read as depth. */
  function makePuff(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    for (let i = 0; i < 16; i++) {
      const r = size * rand(0.1, 0.3), x = size * rand(0.3, 0.7), y = size * rand(0.32, 0.68);
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(205,208,214,.09)');
      grd.addColorStop(1, 'rgba(205,208,214,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, size, size);
    }
    return c;
  }
  const PUFFS = [];
  function smokeLayer(canvas, count, alpha, depth) {
    if (!PUFFS.length) for (let i = 0; i < 4; i++) PUFFS.push(makePuff(160));
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0;
    const resize = () => { W = canvas.width = Math.ceil(innerWidth * 0.4); H = canvas.height = Math.ceil(innerHeight * 0.4); };
    resize();
    const ps = Array.from({ length: count }, () => ({
      x: Math.random() * 1.4 - 0.2, y: rand(0.2, 1.15), s: rand(0.45, 1.05), r: rand(0, 6.3), vr: rand(-0.06, 0.06),
      vx: rand(0.006, 0.02) * (Math.random() < 0.5 ? -1 : 1), vy: -rand(0.004, 0.012), a: rand(0.55, 1), img: PUFFS[(Math.random() * 4) | 0],
    }));
    const wrap = (v) => ((((v + 0.3) % 1.6) + 1.6) % 1.6) - 0.3;
    return {
      resize,
      draw(dt, cam) {
        ctx.clearRect(0, 0, W, H);
        const px = (-cam.ry / 300) * depth, py = (cam.rx / 300) * depth * 0.6;
        for (const p of ps) {
          p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
          const x = wrap(p.x + px), y = wrap(p.y + py), size = p.s * H;
          const dx = x - 0.5, dy = y - 0.55;
          const lit = 0.3 + 0.7 * Math.exp(-(dx * dx * 2.2 + dy * dy * 3) / 0.16);
          ctx.globalAlpha = Math.min(1, p.a * alpha * lit * smokeLight);
          ctx.setTransform(1, 0, 0, 1, x * W, y * H);
          ctx.rotate(p.r);
          ctx.drawImage(p.img, -size / 2, -size / 2, size, size);
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      },
    };
  }
  const smokeBack = smokeLayer($('#smokeBack'), finePointer ? 22 : 14, 0.75, 0.7);
  const smokeFront = smokeLayer($('#smokeFront'), finePointer ? 7 : 4, 0.4, 1.6);
  function runSmoke(run) {
    let last = performance.now();
    const tick = (now) => {
      if (run !== introRun || !root.classList.contains('intro-on')) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      smokeBack.draw(dt, camPose);
      smokeFront.draw(dt, camPose);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // The stage: camera → dust and the word (one 3D letter per character).
  function buildStage() {
    styleType(introName, FACE, 'var(--serif)');
    introName.textContent = '';
    // Each letter is exactly as wide as its glyph, so the word lands with its real spacing.
    const probe = el('i');
    probe.style.cssText = 'position:absolute;visibility:hidden;font-style:normal;letter-spacing:0';
    introName.append(probe);
    const widths = [...NAME].map((ch) => { probe.textContent = ch; return probe.getBoundingClientRect().width; });
    probe.remove();

    camEl = el('span', 'cam');
    tiltEl = el('span', 'tilt');
    const dust = el('span', 'embers');
    for (let k = 0; k < (finePointer ? 30 : 14); k++) {
      const e = el('i', 'ember');
      e.style.transform = `translate3d(${rand(-5, 5).toFixed(2)}em, ${rand(-1.6, 0.8).toFixed(2)}em, ${rand(-3, 2.5).toFixed(2)}em)`;
      e.style.animationDuration = `${rand(7, 12).toFixed(2)}s`;
      e.style.animationDelay = `${rand(-12, 0).toFixed(2)}s`;
      dust.append(e);
    }
    camEl.append(dust, tiltEl);
    introName.append(camEl);

    return [...NAME].map((ch, i) => {
      const L = el('span', 'letter');
      L.style.width = `${widths[i]}px`;
      const bp = el('span', 'bp');
      bp.textContent = ch;
      const x = el('span', 'x');
      x.style.setProperty('--d', `${DD}em`);
      const slices = [];
      for (let k = LAYERS; k >= 1; k--) {
        const s = el('span', 'xl');
        s.textContent = ch;
        s.style.setProperty('--k', k);
        if (k === LAYERS) s.classList.add('back');   // the back face, lit like the front
        else s.style.color = shade(k);
        x.append(s);
        slices.push({ s, k });
      }
      const front = el('span', 'xl front');
      front.textContent = ch;
      front.dataset.ch = ch;
      front.style.setProperty('--k', 0);
      x.append(front);
      L.append(bp, x);
      tiltEl.append(L);
      return { L, bp, x, slices, front, ch };
    });
  }

  // Forge one letter so that its face settles at time T (ms from now). Quiet: no flashes, it
  // gathers out of the dark.
  function forge(r, T) {
    const start = T - SETTLE - SLICE - STACK;
    r.bp.animate([{ opacity: 0 }, { opacity: 0.7, offset: 0.35 }, { opacity: 0.4, offset: 0.7 }, { opacity: 0 }],
      { duration: 900, delay: Math.max(0, start), fill: 'forwards' });
    r.slices.forEach(({ s, k }, j) => {
      const d = Math.max(0, start + (j * STACK) / LAYERS);
      s.animate([
        { transform: `translate3d(${rand(-0.06, 0.06).toFixed(3)}em, ${rand(0.04, 0.14).toFixed(3)}em, ${(-k * DD - rand(0.7, 1.1)).toFixed(3)}em)`, opacity: 0 },
        { transform: `translateZ(${(-k * DD).toFixed(4)}em)`, opacity: 1 },
      ], { duration: SLICE, delay: d, easing: 'cubic-bezier(.25,.6,.2,1)', fill: 'backwards' });
    });
    r.front.animate([
      { transform: 'translateZ(.4em)', opacity: 0 },
      { transform: 'translateZ(.003em)', opacity: 1 },
    ], { duration: SETTLE + 160, delay: Math.max(0, T - SETTLE), easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
  }

  // Show or hide a whole letter (its face and every slice).
  function light(r, from, to, delay, duration) {
    [r.front, ...r.slices.map((x) => x.s)].forEach((e) =>
      e.animate([{ opacity: from }, { opacity: to }], { duration, delay, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }));
  }

  // Smooth path through camera keyframes (cubic Hermite with Catmull-Rom tangents; still at both ends).
  function spline(K) {
    const P = ['x', 'z', 'rx', 'ry', 'rz'];
    const tan = K.map((k, i) => {
      const a = K[i - 1], b = K[i + 1], o = {};
      P.forEach((p) => { o[p] = a && b ? (b[p] - a[p]) / (b.t - a.t) : 0; });
      return o;
    });
    return (t) => {
      if (t <= K[0].t) return K[0];
      if (t >= K[K.length - 1].t) return K[K.length - 1];
      let i = 0;
      while (K[i + 1].t < t) i++;
      const a = K[i], b = K[i + 1], h = b.t - a.t, u = (t - a.t) / h, u2 = u * u, u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2, o = {};
      P.forEach((p) => { o[p] = h00 * a[p] + h10 * h * tan[i][p] + h01 * b[p] + h11 * h * tan[i + 1][p]; });
      return o;
    };
  }
  const camTransform = (c) =>
    `translateZ(${c.z.toFixed(4)}em) rotateZ(${c.rz.toFixed(3)}deg) rotateX(${c.rx.toFixed(3)}deg) rotateY(${c.ry.toFixed(3)}deg) translateX(${(-c.x).toFixed(2)}px)`;

  function setProgress(p) {
    introCount.textContent = String(Math.round(p * 100)).padStart(3, '0');
    introLine.style.transform = `scaleX(${p})`;
  }

  // The cursor tilts the word a little while the intro runs.
  function onTilt(e) {
    if (!tiltEl || !root.classList.contains('intro-on')) return;
    const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
    tiltEl.style.setProperty('--rx', `${(-y * 5).toFixed(2)}deg`);
    tiltEl.style.setProperty('--ry', `${(x * 8).toFixed(2)}deg`);
  }
  addEventListener('pointermove', onTilt, { passive: true });

  async function playIntro() {
    const run = ++introRun;
    skipRequested = false;
    timers.forEach(clearTimeout);
    timers = [];
    root.classList.add('intro-on');
    root.classList.remove('hero-in');
    intro.classList.remove('leaving', 'locked', 'shine');
    introName.style.color = '';
    smokeLight = 1;
    intro.style.display = '';
    $('.intro-bg', intro).style.transform = '';
    introName.style.transform = '';
    introFont.textContent = 'Connecting';
    setProgress(0);
    window.scrollTo(0, 0);

    if (reduceMotion) {
      styleHome(introName);
      introName.textContent = NAME;
      await wait(500);
      return finishIntro(run, false);
    }

    smokeBack.resize();
    smokeFront.resize();
    camPose = { x: 0, z: 0, rx: 0, ry: 0, rz: 0 };
    runSmoke(run);
    await Promise.race([Promise.all([document.fonts.load(fontSpec(FACE), NAME), document.fonts.load(fontSpec(HOME), NAME)]).catch(() => {}), wait(1500)]);
    if (run !== introRun) return;
    const letters = buildStage();
    const n = letters.length;
    const at = (ms, fn) => timers.push(setTimeout(() => { if (run === introRun && !skipRequested) fn(); }, ms));
    // The rhythm tightens as the dark closes in.
    const lands = [FIRST];
    for (let i = 1; i < n; i++) lands.push(lands[i - 1] + Math.round(lerp(SHOT_A, SHOT_B, (i - 1) / Math.max(1, n - 2))));
    const land = (i) => lands[i];

    // Letter centres come from layout (unaffected by transforms).
    const W = camEl.offsetWidth;
    const cx = letters.map((r) => r.L.offsetLeft + r.L.offsetWidth / 2 - W / 2);
    const lw = W / n;
    const iRight = letters[3].L.offsetLeft + letters[3].L.offsetWidth;
    const gapX = (iRight + letters[4].L.offsetLeft) / 2 - W / 2;
    const last = land(n - 1);
    const blackAt = last + 260, tFinal = blackAt + DARK_IN + HOLD, end = tFinal + FINAL;

    const keys = [{ t: 0, x: cx[0] - 1.2 * lw, z: 0.8, rx: 34, ry: -75, rz: -6 }];
    ORBITS.forEach(([[za, rxa, rya, rza], [zb, rxb, ryb, rzb]], i) => {
      keys.push({ t: land(i) - 340, x: cx[i], z: za, rx: rxa, ry: rya, rz: rza });
      keys.push({ t: land(i) + 180, x: cx[i], z: zb, rx: rxb, ry: ryb, rz: rzb });
    });
    keys.push({ t: tFinal, x: cx[n - 1], z: 2.2, rx: 6, ry: -36, rz: 0 });   // keeps drifting into the black
    const flow = spline(keys);
    // Last shot: behind the name. The word is mirrored for it, so seen from the back it reads the
    // right way round. Start close in the gap between the i and the l (mirrored, it sits at -gapX)
    // and pull back to a wide view, distance eased in log space so the zoom feels even. It ends
    // square-on, where mirrored-from-behind and plain-from-the-front look identical once flat.
    const d0 = 0.9, dWide = PERSP + 0.8;
    const finale = (t) => {
      const u = clamp01((t - tFinal) / FINAL);
      const z = u < 0.62 ? PERSP - Math.exp(lerp(Math.log(d0), Math.log(dWide), outCubic(u / 0.62))) : lerp(PERSP - dWide, 0, smooth((u - 0.62) / 0.38));
      return {
        x: lerp(-gapX, 0, outCubic(u / 0.7)),
        z,
        rx: lerp(-5, 0, smooth(u)) + 7 * Math.sin(Math.PI * u),
        ry: 180 - 14 * (1 - smooth(u)),
        rz: 0,
      };
    };
    // Driven per frame (not as one long animation) so the browser renders at the current zoom.
    const camAt = (t) => (t < tFinal ? flow(t) : finale(t));
    // The smoke loses its light as the word is built, and gets some back for the last shot.
    const lightAt = (t) => (t < tFinal ? lerp(1, 0.4, smooth(t / blackAt)) : 0.85);
    camPose = camAt(0);
    camEl.style.transform = camTransform(camPose);
    const t0 = performance.now();

    // Slowly up from black; at the end, down into total black, a long beat, and up behind the name.
    introFade.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1700, easing: 'cubic-bezier(.5,0,.5,1)' });
    const fd = tFinal + 1300 - blackAt;
    introFade.animate([
      { opacity: 0, easing: 'cubic-bezier(.5,0,.9,.6)' },
      { opacity: 1, offset: DARK_IN / fd },
      { opacity: 1, offset: (tFinal - blackAt) / fd, easing: 'cubic-bezier(.4,0,.2,1)' },
      { opacity: 0 },
    ], { duration: fd, delay: blackAt });
    // The dark closes in letter by letter, then lifts a little for the last shot.
    introDark.animate([
      { opacity: 0, easing: 'cubic-bezier(.4,0,.8,.7)' },
      { opacity: 0.92, offset: blackAt / end },
      { opacity: 0.92, offset: (tFinal - 100) / end },
      { opacity: 0.5, offset: (tFinal - 60) / end },
      { opacity: 0.5 },
    ], { duration: end, fill: 'forwards' });
    // In the middle of the black, the name flickers once, like a bad signal.
    introGhost.animate([
      { opacity: 0, easing: 'steps(1, end)' }, { opacity: 0.8, offset: 0.06, easing: 'steps(1, end)' },
      { opacity: 0, offset: 0.2, easing: 'steps(1, end)' }, { opacity: 0.45, offset: 0.62, easing: 'steps(1, end)' },
      { opacity: 0, offset: 0.7 }, { opacity: 0 },
    ], { duration: 360, delay: blackAt + DARK_IN + HOLD * 0.42 });

    // The build: one letter at a time, alone on screen.
    letters.forEach((r, i) => {
      forge(r, land(i));
      if (i < n - 1) light(r, 1, 0, land(i) + 60, 200);
      at(Math.max(0, land(i) - SETTLE - 30), () => glitch(r));            // glitches into place
      if (i < n - 1) at(land(i) + 50, () => glitch(r, false));             // and out
      at(Math.max(0, land(i) - SETTLE - SLICE - STACK), () => decode(introFont, `${r.ch} — ${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`, 300));
      at(land(i), () => setProgress((i + 1) / n));
    });
    // In the black: every letter back, the word mirrored for the view from behind, faces lit.
    letters.forEach((r, i) => light(r, i < n - 1 ? 0 : 1, 1, tFinal - 90, 40));
    at(tFinal - 90, () => {
      tiltEl.style.transition = 'none';
      tiltEl.style.setProperty('--sx', '-1');
      intro.classList.add('shine');
      introFont.textContent = '';
    });
    at(tFinal + 900, () => decode(introFont, 'Shailesh Maddikera', 700));
    // Now and then the signal breaks up.
    [[1300, [3, 5]], [2150, [0, 6]], [2700, [2]]].forEach(([dt, ids]) => at(tFinal + dt, () => ids.forEach((i) => glitch(letters[i], false))));
    at(end - 900, () => intro.classList.add('locked'));   // a faint light passes across the name

    await new Promise((resolve) => {
      skipWake = resolve;
      const tick = (now) => {
        if (run !== introRun || skipRequested) return resolve();
        const t = now - t0;
        camPose = camAt(Math.min(t, end));
        smokeLight = lightAt(t);
        camEl.style.transform = camTransform(camPose);
        if (t >= end) return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    if (run !== introRun) return;
    tiltEl?.style.setProperty('--rx', '0deg');
    tiltEl?.style.setProperty('--ry', '0deg');
    if (!skipRequested) {
      // One last break-up, then fold the depth away.
      letters.forEach((r) => glitch(r));
      await pause(140);
      letters.forEach((r) => r.x.animate([{ '--d': `${DD}em` }, { '--d': '0em' }], { duration: 360, easing: 'cubic-bezier(.6,0,.4,1)', fill: 'forwards' }));
      await pause(380);
    }
    return finishIntro(run, true);
  }

  async function finishIntro(run, fly) {
    if (run !== introRun) return;
    timers.forEach(clearTimeout);
    timers = [];
    introFade.getAnimations().forEach((a) => a.cancel());
    introGhost.getAnimations().forEach((a) => a.cancel());
    const shone = intro.classList.contains('shine');
    const glow = shone ? GLOW : '0 0 0 transparent';
    intro.classList.remove('shine');
    const dark = getComputedStyle(introDark).opacity;
    introDark.getAnimations().forEach((a) => a.cancel());
    introDark.animate([{ opacity: dark }, { opacity: 0 }], { duration: 500, fill: 'forwards' });
    // Back to one text run in the site's type so kerning matches the hero headline exactly. The
    // swap happens inside a glitch; the halo carries over and fades during the glide.
    styleHome(introName);
    introName.textContent = NAME;
    if (shone) introName.style.color = '#0b0b0d';
    introName.style.textShadow = glow;
    tiltEl = null;
    camEl = null;
    await document.fonts.load(fontSpec(HOME), NAME).catch(() => {});
    await frame();
    intro.classList.add('leaving');

    const bg = $('.intro-bg', intro);
    const dur = skipRequested ? 700 : 1150;
    const ease = 'cubic-bezier(.76,0,.24,1)';

    if (fly && heroFirst) {
      // FLIP: glide the word exactly onto the hero's first name while the curtain lifts.
      const from = introName.getBoundingClientRect();
      const to = heroFirst.getBoundingClientRect();
      const s = to.width / from.width;
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      introName.animate(
        [
          { transform: 'translate(-50%, -50%)', color: getComputedStyle(introName).color },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${s})`, color: getComputedStyle(heroFirst).color },
        ],
        { duration: dur, easing: ease, fill: 'forwards' },
      );
      const st = { easing: 'steps(1, end)' };
      introName.animate([
        { textShadow: RGB(-0.05, 0.04), translate: '.03em 0', ...st },
        { textShadow: RGB(0.06, -0.03), translate: '-.04em 0', offset: 0.05, ...st },
        { textShadow: RGB(-0.02, 0.05), translate: '.015em 0', offset: 0.1, ...st },
        { textShadow: RGB(0.03, -0.02), translate: '0 0', offset: 0.15, ...st },
        { textShadow: glow, translate: '0 0', offset: 0.2 },
        { textShadow: '0 0 0 transparent', translate: '0 0' },
      ], { duration: dur, fill: 'forwards' });
      bg.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0)' }], { duration: dur, easing: ease, fill: 'forwards', delay: 80 });
      await wait(dur + 80);
    } else {
      await intro.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).finished;
    }
    if (run !== introRun) return;

    root.classList.remove('intro-on');
    root.classList.add('hero-in');
    intro.style.display = 'none';
    introName.style.textShadow = '';
    introName.style.color = '';
    introDark.getAnimations().forEach((a) => a.cancel());
    introName.getAnimations().forEach((a) => a.cancel());
    bg.getAnimations().forEach((a) => a.cancel());
    intro.getAnimations().forEach((a) => a.cancel());
  }

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const skip = () => { if (!skipRequested) { skipRequested = true; skipWake?.(); } };
  intro.addEventListener('click', skip);
  addEventListener('keydown', (e) => { if (root.classList.contains('intro-on') && !e.metaKey && !e.ctrlKey) skip(); });
  // Deep links (#work) and ?nointro go straight to the page.
  if (location.hash.length > 1 || new URLSearchParams(location.search).has('nointro')) {
    root.classList.add('hero-in');
    intro.style.display = 'none';
  } else {
    playIntro();
  }
  // Safety net: never leave someone stuck on the intro.
  setTimeout(() => { if (root.classList.contains('intro-on')) { skipRequested = true; finishIntro(introRun, false); } }, 20000);
  $('#logo').addEventListener('click', () => { if (!root.classList.contains('intro-on')) playIntro(); });

  /* ───────────────────────── Nav, progress, active link ───────────────────────── */

  const nav = $('#nav');
  const progress = $('#progress');
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = scrollY;
      nav.classList.toggle('scrolled', y > 8);
      const max = document.documentElement.scrollHeight - innerHeight;
      progress.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
      ticking = false;
    });
  }
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const links = new Map($$('.nav-links a').map((a) => [a.getAttribute('href').slice(1), a]));
  const sectionSpy = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) links.forEach((a, id) => a.classList.toggle('active', id === e.target.id));
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  links.forEach((_, id) => { const s = document.getElementById(id); if (s) sectionSpy.observe(s); });

  /* ───────────────────────── Reveal + scramble ───────────────────────── */

  const revealer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      if (e.target.classList.contains('scramble')) scramble(e.target);
      revealer.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  // Stagger siblings a little.
  $$('.bento, .timeline, .principles, .focus').forEach((group) => {
    $$('.reveal', group).forEach((el, i) => el.style.setProperty('--d', `${Math.min(i, 8) * 0.06}s`));
  });
  $$('.reveal, .scramble').forEach((el) => revealer.observe(el));

  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/—#*+';
  function scramble(el) {
    if (reduceMotion) return;
    const final = el.dataset.text || el.textContent;
    el.dataset.text = final;
    const start = performance.now();
    const dur = 700;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const settled = Math.floor(p * final.length);
      el.textContent = final.split('').map((ch, i) =>
        i < settled || ch === ' ' ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0]).join('');
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ───────────────────────── Hero dot field ───────────────────────── */

  const hero = $('#hero');
  const canvas = $('#dots');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1, dots = [], dotRGB = '237,237,238';
  const pointer = { x: -9999, y: -9999, active: false };
  let heroVisible = true, raf = 0;

  function readDotColor() { dotRGB = getComputedStyle(root).getPropertyValue('--dot').trim() || dotRGB; }
  function resize() {
    const r = hero.getBoundingClientRect();
    DPR = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const gap = W < 600 ? 22 : 28;
    dots = [];
    for (let y = gap / 2; y < H; y += gap) for (let x = gap / 2; x < W; x += gap) dots.push(x, y);
    if (reduceMotion) draw(0);
  }
  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    const R = 150;
    for (let i = 0; i < dots.length; i += 2) {
      const x = dots[i], y = dots[i + 1];
      let a = 0.1 + 0.06 * Math.sin(x * 0.012 + y * 0.008 + t * 0.0009);
      let ox = 0, oy = 0, r = 1;
      if (pointer.active) {
        const dx = x - pointer.x, dy = y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < R) {
          const f = 1 - d / R;
          a += f * 0.65; r += f * 1.2;
          ox = (dx / (d || 1)) * f * 8; oy = (dy / (d || 1)) * f * 8;
        }
      }
      ctx.fillStyle = `rgba(${dotRGB},${a.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x + ox, y + oy, r, 0, 6.283); ctx.fill();
    }
  }
  function loop(t) { draw(t); raf = heroVisible && !document.hidden ? requestAnimationFrame(loop) : 0; }
  function start() { if (!raf && !reduceMotion) raf = requestAnimationFrame(loop); }
  new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; if (heroVisible) start(); }).observe(hero);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
  addEventListener('resize', resize);
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; pointer.active = true;
    hero.style.setProperty('--gx', `${(pointer.x / r.width) * 100}%`);
    hero.style.setProperty('--gy', `${(pointer.y / r.height) * 100}%`);
  });
  hero.addEventListener('pointerleave', () => { pointer.active = false; });
  readDotColor(); resize(); start();

  /* ───────────────────────── Cards, magnets, helix ───────────────────────── */

  $$('[data-spot]').forEach((card) => card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  }));

  if (finePointer && !reduceMotion) {
    $$('.magnetic').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width / 2) * 0.18;
        const y = (e.clientY - r.top - r.height / 2) * 0.3;
        el.style.transform = `translate(${x}px, ${y}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  const helix = $('#helix');
  if (helix) {
    const rungs = 16;
    helix.innerHTML = Array.from({ length: rungs }, (_, i) =>
      `<span class="rung" style="--delay:${(-i * 0.22).toFixed(2)}s"><b></b><i></i><b></b></span>`).join('');
  }

  /* ───────────────────────── Theme ───────────────────────── */

  const systemDark = matchMedia('(prefers-color-scheme: dark)');
  const currentTheme = () => root.getAttribute('data-theme') || (systemDark.matches ? 'dark' : 'light');
  function setTheme(t) {
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('theme', t); } catch (e) {}
    readDotColor();
  }
  $('#themeBtn').addEventListener('click', () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
  systemDark.addEventListener('change', readDotColor);

  /* ───────────────────────── Quick menu (⌘K) ───────────────────────── */

  const palette = $('#palette');
  const pInput = $('#paletteInput');
  const pList = $('#paletteList');
  const go = (id) => () => document.getElementById(id).scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  const open = (url) => () => window.open(url, '_blank', 'noopener');
  const ACTIONS = [
    { name: 'Work', hint: 'Section', run: go('work') },
    { name: 'Journey', hint: 'Section', run: go('journey') },
    { name: 'About', hint: 'Section', run: go('about') },
    { name: 'Contact', hint: 'Section', run: go('contact') },
    { name: 'GitHub', hint: 'Link', run: open('https://github.com/ShaileshMaddikera') },
    { name: 'LinkedIn', hint: 'Link', run: open('https://www.linkedin.com/in/shailesh-maddikera/') },
    { name: 'Résumé', hint: 'Link', run: open('https://shaileshmaddikera.wixsite.com/shailesh-maddikera-o/resume-1') },
    { name: 'Toggle theme', hint: 'Action', run: () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark') },
    { name: 'Replay intro', hint: 'Action', run: () => playIntro() },
    { name: 'Copy link to this site', hint: 'Action', run: () => navigator.clipboard?.writeText(location.origin + location.pathname).catch(() => {}) },
  ];
  let shown = ACTIONS, sel = 0;
  function renderPalette() {
    const q = pInput.value.trim().toLowerCase();
    shown = ACTIONS.filter((a) => a.name.toLowerCase().includes(q));
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    pList.innerHTML = '';
    shown.forEach((a, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === sel));
      li.innerHTML = `<span></span><span></span>`;
      li.firstChild.textContent = a.name;
      li.lastChild.textContent = a.hint;
      li.addEventListener('click', () => runAction(i));
      li.addEventListener('pointermove', () => { if (sel !== i) { sel = i; renderPalette(); } });
      pList.appendChild(li);
    });
  }
  function runAction(i) { const a = shown[i]; if (!a) return; palette.close(); a.run(); }
  function openPalette() {
    if (palette.open) return;
    pInput.value = ''; sel = 0; renderPalette();
    palette.showModal(); pInput.focus();
  }
  pInput.addEventListener('input', () => { sel = 0; renderPalette(); });
  pInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, shown.length); renderPalette(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + shown.length) % Math.max(1, shown.length); renderPalette(); }
    else if (e.key === 'Enter') { e.preventDefault(); runAction(sel); }
  });
  palette.addEventListener('click', (e) => { if (e.target === palette) palette.close(); });
  $('#paletteBtn').addEventListener('click', openPalette);
  addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette.open ? palette.close() : openPalette(); }
    else if (e.key === '/' && !palette.open && !/input|textarea/i.test(document.activeElement?.tagName || '')) { e.preventDefault(); openPalette(); }
  });
  if (!/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) $('#paletteBtn .kbd').textContent = 'Ctrl K';

  /* ───────────────────────── Hello, source reader ───────────────────────── */
  console.log('%cHey — you read source. 👋', 'font: 600 16px system-ui; color: #c8f542; background:#0b0b0c; padding:6px 10px; border-radius:6px');
  console.log('Built by hand, no frameworks. Say hi: https://www.linkedin.com/in/shailesh-maddikera/');
})();
