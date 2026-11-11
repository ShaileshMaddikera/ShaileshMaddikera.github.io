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
  // A title-card build of the name, in one typeface. Letters are forged one at a time, alone on
  // screen: the camera orbits each while its outline glows, slices of depth stack in from behind
  // and the front face slams on with sparks; then it vanishes and the camera moves to the next.
  // Fade to black. Fade up behind the whole name, close between the i and the l; the camera pulls
  // back, then arcs round to the front of the shining name, which glides into the hero headline.

  const HOME = { family: 'Geist', weight: 600, track: '-0.045em' };
  const ACCENT = '#c8f542';
  const HOT = '#efffc0';
  const GLOW = '0 0 .14em rgba(255,255,255,.45), 0 0 .55em rgba(200,245,66,.22)';
  const NAME = 'Shailesh';
  const PERSP = 7;                                  // em; matches .intro-name perspective
  const LAYERS = finePointer ? 10 : 7;             // depth slices per letter (each is a GPU layer)
  const DD = 0.28 / LAYERS;                         // depth per slice (em)
  const FIRST = 900, SHOT = 700;                    // first front-face landing, then one every SHOT ms
  const STACK = 140, SLICE = 260, SLAM = 170;       // build: slices spread, slice flight, front-face slam
  const FINAL = 3300;                               // last shot: pull back behind the name, arc to the front
  // The orbit round each letter: from [distance (em), tilt, turn, roll] to [...]. Each orbit ends
  // near the angle the next one starts from, so the camera never has to whip round.
  const ORBITS = [
    [[2.8, 18, -60, -6], [3.4, 8, 25, 0]],     // S  sweeps round from the left
    [[3.1, 42, 30, 2], [3.5, 20, -25, 0]],     // h  over the top
    [[3.4, 6, -30, 0], [3.8, -6, 45, 3]],      // a  low, left to right
    [[4.0, -14, 40, 2], [3.6, -6, -35, -2]],   // i  close, from below
    [[3.2, 12, -40, -8], [3.7, 4, 30, 2]],     // l  dutch angle
    [[3.1, 30, 35, 4], [3.6, 12, -30, 0]],     // e  high
    [[3.6, -10, -35, -2], [3.4, 0, 40, 2]],    // s  low
    [[3.0, 14, 45, 3], [2.8, 8, -10, 0]],      // h  last
  ];

  const intro = $('#intro');
  const introName = $('#introName');
  const introFont = $('#introFont');
  const introCount = $('#introCount');
  const introLine = $('#introLine');
  const introGlow = $('#introGlow');
  const introFade = $('#introFade');
  const heroFirst = $('#heroFirst');
  let introRun = 0;
  let skipRequested = false;
  let skipWake = null;
  let camEl = null;
  let tiltEl = null;
  let timers = [];

  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  const fontSpec = (f, px = 64) => `${f.style || 'normal'} ${f.weight} ${px}px "${f.family}"`;
  const pause = (ms) => new Promise((r) => { const t = setTimeout(r, ms); skipWake = () => { clearTimeout(t); r(); }; });
  const lerp = (a, b, u) => a + (b - a) * u;
  const rand = (a, b) => a + Math.random() * (b - a);
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t;
    const dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
    return (x) => {
      let t = x;
      for (let i = 0; i < 8; i++) { const d = X(t) - x, s = dX(t); if (Math.abs(d) < 1e-5 || !s) break; t -= d / s; }
      return Y(Math.min(1, Math.max(0, t)));
    };
  }
  const pullEase = bezier(0.3, 0, 0.12, 1);

  function styleHome(e) {
    e.style.fontFamily = `"${HOME.family}", var(--sans)`;
    e.style.fontWeight = HOME.weight;
    e.style.fontStyle = 'normal';
    e.style.letterSpacing = HOME.track;
  }

  // Side walls run from grey at the face to near-black at the back; the last slice is a lime rim.
  const shade = (k) => { const v = Math.round(150 - ((k - 1) / Math.max(1, LAYERS - 2)) * 134); return `rgb(${v},${v},${v + 4})`; };

  // The stage: camera → embers and the word (one 3D letter per character).
  function buildStage() {
    styleHome(introName);
    introName.textContent = '';
    // Each letter is exactly as wide as its glyph, so the word lands with its real spacing.
    const probe = el('i');
    probe.style.cssText = 'position:absolute;visibility:hidden;font-style:normal;letter-spacing:0';
    introName.append(probe);
    const widths = [...NAME].map((ch) => { probe.textContent = ch; return probe.getBoundingClientRect().width; });
    probe.remove();

    camEl = el('span', 'cam');
    tiltEl = el('span', 'tilt');
    const embers = el('span', 'embers');
    for (let k = 0; k < (finePointer ? 34 : 16); k++) {
      const e = el('i', 'ember');
      e.style.transform = `translate3d(${rand(-5, 5).toFixed(2)}em, ${rand(-1.6, 0.6).toFixed(2)}em, ${rand(-3, 2.5).toFixed(2)}em)`;
      e.style.animationDuration = `${rand(4, 8).toFixed(2)}s`;
      e.style.animationDelay = `${rand(-8, 0).toFixed(2)}s`;
      embers.append(e);
    }
    camEl.append(embers, tiltEl);
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
        if (k === LAYERS) s.classList.add('back');   // the back face: lit, so the name reads from behind
        else s.style.color = shade(k);
        x.append(s);
        slices.push({ s, k });
      }
      const front = el('span', 'xl front');
      front.textContent = ch;
      front.style.setProperty('--k', 0);
      x.append(front);
      L.append(bp, x);
      tiltEl.append(L);
      return { L, bp, x, slices, front, ch };
    });
  }

  // Forge one letter so that its front face lands at time T (ms from now).
  function forge(r, T) {
    r.bp.animate([{ opacity: 0 }, { opacity: 0.95, offset: 0.25 }, { opacity: 0.7, offset: 0.7 }, { opacity: 0 }],
      { duration: 700, delay: Math.max(0, T - SLAM - SLICE - STACK), fill: 'forwards' });
    const start = T - SLAM - SLICE - STACK;
    r.slices.forEach(({ s, k }, j) => {
      const d = Math.max(0, start + (j * STACK) / LAYERS);
      const to = `translateZ(${(-k * DD).toFixed(4)}em)`;
      s.animate([
        { transform: `translate3d(${rand(-0.3, 0.3).toFixed(3)}em, ${rand(0.15, 0.5).toFixed(3)}em, ${(-k * DD - rand(1.4, 2.2)).toFixed(3)}em)`, opacity: 0 },
        { opacity: 1, offset: 0.35 },
        { transform: to, opacity: 1 },
      ], { duration: SLICE, delay: d, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'backwards' });
      // Arrives hot, cools to metal.
      s.animate([{ color: HOT }, { color: HOT, offset: 0.3 }, { color: getComputedStyle(s).color }], { duration: 1100, delay: d, fill: 'backwards' });
    });
    r.front.animate([
      { transform: 'translateZ(1.2em) scale(1.06)', opacity: 0 },
      { opacity: 1, offset: 0.4 },
      { transform: 'translateZ(.003em) scale(1)', opacity: 1 },
    ], { duration: SLAM, delay: Math.max(0, T - SLAM), easing: 'cubic-bezier(.55,0,.85,.55)', fill: 'backwards' });
    r.front.animate([{ color: ACCENT, textShadow: `0 0 .4em ${ACCENT}` }, { color: '#f2f2f0', textShadow: '0 0 0 transparent' }],
      { duration: 700, delay: T, easing: 'cubic-bezier(.2,.7,.1,1)' });
  }

  // Fade a letter's lighting (its face and every slice) between two levels.
  // Show or hide a whole letter (its face and every slice).
  function light(r, from, to, delay, duration) {
    [r.front, ...r.slices.map((x) => x.s)].forEach((e) =>
      e.animate([{ opacity: from }, { opacity: to }], { duration, delay, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }));
  }

  // Impact: sparks off the base, a small camera shake, the background glow pulses.
  function impact(r) {
    const box = el('span', 'sparks');
    r.L.append(box);
    for (let s = 0; s < 12; s++) {
      const p = el('i', 'spark');
      box.append(p);
      const a = rand(0, Math.PI * 2), sp = rand(0.45, 1.2), up = -rand(0.3, 0.9);
      const dx = Math.cos(a) * sp, dz = Math.sin(a) * sp;
      p.animate([
        { transform: 'translate3d(0,0,0) scale(1)', opacity: 1 },
        { transform: `translate3d(${(dx * 0.6).toFixed(3)}em, ${up.toFixed(3)}em, ${(dz * 0.6).toFixed(3)}em)`, opacity: 1, offset: 0.45 },
        { transform: `translate3d(${dx.toFixed(3)}em, ${(up + 0.9).toFixed(3)}em, ${dz.toFixed(3)}em) scale(.3)`, opacity: 0 },
      ], { duration: rand(600, 1000), easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' });
    }
    setTimeout(() => box.remove(), 1100);
    tiltEl?.animate([{ translate: '0 0' }, { translate: '.018em -.026em' }, { translate: '-.016em .014em' }, { translate: '.008em 0' }, { translate: '0 0' }],
      { duration: 200, easing: 'linear' });
    introGlow.animate([{ opacity: 0.5 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
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
    tiltEl.style.setProperty('--rx', `${(-y * 6).toFixed(2)}deg`);
    tiltEl.style.setProperty('--ry', `${(x * 10).toFixed(2)}deg`);
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
    intro.style.display = '';
    $('.intro-bg', intro).style.transform = '';
    introName.style.transform = '';
    introFont.textContent = 'Loading';
    setProgress(0);
    window.scrollTo(0, 0);

    if (reduceMotion) {
      styleHome(introName);
      introName.textContent = NAME;
      await wait(500);
      return finishIntro(run, false);
    }

    await Promise.race([document.fonts.load(fontSpec(HOME), NAME).catch(() => {}), wait(1500)]);
    if (run !== introRun) return;
    const letters = buildStage();
    const n = letters.length;
    const at = (ms, fn) => timers.push(setTimeout(() => { if (run === introRun && !skipRequested) fn(); }, ms));
    const land = (i) => FIRST + i * SHOT;

    // Camera. Letter centres come from layout (unaffected by transforms).
    const W = camEl.offsetWidth;
    const cx = letters.map((r) => r.L.offsetLeft + r.L.offsetWidth / 2 - W / 2);
    const lw = W / n;
    const iRight = letters[3].L.offsetLeft + letters[3].L.offsetWidth;
    const gapX = (iRight + letters[4].L.offsetLeft) / 2 - W / 2;
    const last = land(n - 1);
    const blackAt = last + 430, tFinal = last + 850, end = tFinal + FINAL;
    const keys = [{ t: 0, x: cx[0] - 1.2 * lw, z: 0.8, rx: 40, ry: -80, rz: -8 }];
    ORBITS.forEach(([[za, rxa, rya, rza], [zb, rxb, ryb, rzb]], i) => {
      keys.push({ t: land(i) - 330, x: cx[i], z: za, rx: rxa, ry: rya, rz: rza });
      keys.push({ t: land(i) + 170, x: cx[i], z: zb, rx: rxb, ry: ryb, rz: rzb });
    });
    keys.push({ t: tFinal, x: cx[n - 1], z: 2.2, rx: 6, ry: -40, rz: 0 });   // keeps drifting into the black
    const flow = spline(keys);
    // Last shot, behind the name: start close in the gap between the i and the l, pull back to a wide
    // view of the back of the word (distance eased in log space so the zoom feels even), then arc
    // round to the front.
    const d0 = 0.9, dWide = PERSP + 1;
    const smooth = (u) => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u); };
    const outCubic = (u) => 1 - (1 - Math.min(1, Math.max(0, u))) ** 3;
    const finale = (t) => {
      const u = Math.min(1, Math.max(0, (t - tFinal) / FINAL));
      const z = u < 0.5 ? PERSP - Math.exp(lerp(Math.log(d0), Math.log(dWide), outCubic(u / 0.5))) : lerp(PERSP - dWide, 0, smooth((u - 0.5) / 0.5));
      return {
        x: lerp(gapX, 0, outCubic(u / 0.6)),
        z,
        rx: lerp(-4, 0, u) + 9 * Math.sin(Math.PI * u),
        ry: 172 * (1 - smooth((u - 0.3) / 0.7)),
        rz: 0,
      };
    };
    // Driven per frame (not as one long animation) so the browser renders at the current zoom,
    // not the closest zoom of the whole flight.
    const camAt = (t) => (t < tFinal ? flow(t) : finale(t));
    camEl.style.transform = camTransform(camAt(0));
    const t0 = performance.now();

    // Fade up from black; at the end, fade to black and up again behind the name.
    introFade.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 650, easing: 'ease-out' });
    const fd = tFinal + 900 - blackAt;
    introFade.animate([
      { opacity: 0, easing: 'ease-in' },
      { opacity: 1, offset: 300 / fd },
      { opacity: 1, offset: (tFinal - blackAt) / fd, easing: 'cubic-bezier(.3,0,.2,1)' },
      { opacity: 0 },
    ], { duration: fd, delay: blackAt });

    // The build: one letter at a time, alone on screen.
    letters.forEach((r, i) => {
      forge(r, land(i));
      if (i < n - 1) light(r, 1, 0, land(i) + 120, 170);
      at(Math.max(0, land(i) - SLAM - SLICE - STACK), () => { introFont.textContent = `${r.ch} — ${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`; });
      at(land(i), () => { impact(r); setProgress((i + 1) / n); });
    });
    // In the black: every letter back, glowing (cheap to draw while it's dark).
    letters.forEach((r, i) => light(r, i < n - 1 ? 0 : 1, 1, tFinal - 90, 40));
    at(tFinal - 90, () => { intro.classList.add('shine'); introFont.textContent = 'Shailesh Maddikera'; });
    at(tFinal + 200, () => introGlow.animate([{ opacity: 0 }, { opacity: 0.45 }, { opacity: 0 }], { duration: 2200, easing: 'ease-out' }));
    at(end - 900, () => intro.classList.add('locked'));   // light sweep across the front

    await new Promise((resolve) => {
      skipWake = resolve;
      const tick = (now) => {
        if (run !== introRun || skipRequested) return resolve();
        const t = now - t0;
        camEl.style.transform = camTransform(camAt(Math.min(t, end)));
        if (t >= end) return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    if (run !== introRun) return;
    tiltEl?.style.setProperty('--rx', '0deg');
    tiltEl?.style.setProperty('--ry', '0deg');
    if (!skipRequested) {
      // Fold the depth away while facing front, so the swap to flat text is invisible.
      letters.forEach((r) => r.x.animate([{ '--d': `${DD}em` }, { '--d': '0em' }], { duration: 320, easing: 'cubic-bezier(.6,0,.4,1)', fill: 'forwards' }));
      await pause(340);
    }
    return finishIntro(run, true);
  }

  async function finishIntro(run, fly) {
    if (run !== introRun) return;
    timers.forEach(clearTimeout);
    timers = [];
    introFade.getAnimations().forEach((a) => a.cancel());
    const glow = intro.classList.contains('shine') ? GLOW : '0 0 0 transparent';
    intro.classList.remove('shine');
    // Back to one text run so kerning matches the hero headline exactly. The glow carries over
    // and fades out during the glide.
    styleHome(introName);
    introName.textContent = NAME;
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
          { transform: 'translate(-50%, -50%)', color: getComputedStyle(introName).color, textShadow: glow },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${s})`, color: getComputedStyle(heroFirst).color, textShadow: '0 0 0 transparent' },
        ],
        { duration: dur, easing: ease, fill: 'forwards' },
      );
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
  setTimeout(() => { if (root.classList.contains('intro-on')) { skipRequested = true; finishIntro(introRun, false); } }, 16000);
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
