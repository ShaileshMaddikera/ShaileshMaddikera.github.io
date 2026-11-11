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

  /* ───────────────────────── Intro: 3D type drums ───────────────────────── */
  // Every letter is a 3D drum wrapped in typefaces. The drums spin (motion blur + RGB split) and
  // stop left to right; each landed letter punches out into a solid, extruded glyph. A slow camera
  // orbit shows off the depth, then the name faces front, flattens and glides into the hero
  // headline. The word also tilts toward the cursor.

  const FACES = [
    { family: 'Instrument Serif', style: 'italic', weight: 400, label: 'Instrument Serif Italic' },
    { family: 'Geist Mono', weight: 400, size: 0.9, label: 'Geist Mono' },
    { family: 'Bebas Neue', weight: 400, size: 1.1, label: 'Bebas Neue' },
    { family: 'UnifrakturCook', weight: 700, label: 'UnifrakturCook', accent: true },
    { family: 'Pacifico', weight: 400, size: 0.85, label: 'Pacifico' },
    { family: 'Monoton', weight: 400, size: 0.72, label: 'Monoton' },
    { family: 'Press Start 2P', weight: 400, size: 0.5, label: 'Press Start 2P' },
    { family: 'Syne', weight: 800, label: 'Syne ExtraBold', accent: true },
    { family: 'Rubik Glitch', weight: 400, size: 0.85, label: 'Rubik Glitch' },
    { family: 'Major Mono Display', weight: 400, size: 0.8, label: 'Major Mono Display' },
    { family: 'Bungee Shade', weight: 400, size: 0.66, label: 'Bungee Shade' },
    { family: 'Playfair Display', style: 'italic', weight: 900, label: 'Playfair Display Black Italic', accent: true },
    { family: 'Orbitron', weight: 800, size: 0.72, label: 'Orbitron' },
    { family: 'Silkscreen', weight: 400, size: 0.7, label: 'Silkscreen' },
    { family: 'Rubik Mono One', weight: 400, size: 0.62, label: 'Rubik Mono One' },
    { family: 'Caveat', weight: 700, size: 1.1, label: 'Caveat' },
    { family: 'Righteous', weight: 400, label: 'Righteous' },
    { family: 'Space Grotesk', weight: 300, label: 'Space Grotesk Light' },
  ];
  const HOME = { family: 'Geist', weight: 600, track: '-0.045em', label: 'Geist — home' };
  const ACCENT = '#c8f542';
  const NAME = 'Shailesh';
  const STEP = 36;                                                // degrees between glyphs on a drum
  const R = 0.46 / Math.sin((STEP / 2) * Math.PI / 180);          // drum radius (em): glyphs 0.92em apart
  const LAYERS = finePointer ? 18 : 12;                           // extrusion slices
  const DD = 0.28 / LAYERS;                                       // depth per slice (em)
  const OV = 0.14, SETTLE = 200;                                  // overshoot "clack" when a drum stops
  const BASE = 1550, STAGGER = 200, LAG = 45, SWING = 1300;       // timings (ms)

  const intro = $('#intro');
  const introName = $('#introName');
  const introFont = $('#introFont');
  const introCount = $('#introCount');
  const introLine = $('#introLine');
  const introGlow = $('#introGlow');
  const heroFirst = $('#heroFirst');
  let introRun = 0;
  let skipRequested = false;
  let skipWake = null;
  let camEl = null;
  let tiltEl = null;
  let tickerTimer = 0;

  const el = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
  const fontSpec = (f, px = 64) => `${f.style || 'normal'} ${f.weight} ${px}px "${f.family}"`;
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pause = (ms) => new Promise((r) => { const t = setTimeout(r, ms); skipWake = () => { clearTimeout(t); r(); }; });
  const outCubic = (u) => 1 - (1 - u) ** 3;
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
  const spinEase = bezier(0.32, 0, 0.2, 1);

  function styleHome(e) {
    e.style.fontFamily = `"${HOME.family}", var(--sans)`;
    e.style.fontWeight = HOME.weight;
    e.style.fontStyle = 'normal';
    e.style.letterSpacing = HOME.track;
  }

  function setFace(slot, ch, f) {
    const i = slot.firstChild;
    i.textContent = ch;
    i.style.fontFamily = `"${f.family}", var(--sans)`;
    i.style.fontWeight = f.weight;
    i.style.fontStyle = f.style || 'normal';
    i.style.fontSize = f.size ? `${f.size}em` : '';
    i.style.color = f.accent ? ACCENT : '';
  }

  // One drum per letter. Only five slots exist; as the drum turns, the slot rolling over the back
  // is reloaded with the next glyph, so a drum can carry any number of typefaces.
  function buildReels(faces) {
    styleHome(introName);
    introName.textContent = '';
    // Each drum is exactly as wide as its final letter, so the word lands with its real spacing.
    const probe = el('i');
    probe.style.cssText = 'position:absolute;visibility:hidden;font-style:normal;letter-spacing:0';
    introName.append(probe);
    const widths = [...NAME].map((ch) => { probe.textContent = ch; return probe.getBoundingClientRect().width; });
    probe.remove();

    camEl = el('span', 'cam');
    tiltEl = el('span', 'tilt');
    camEl.append(el('span', 'floor'), tiltEl);
    introName.append(camEl);
    const home = { ...HOME, track: undefined };
    return [...NAME].map((ch, i) => {
      const reel = el('span', 'reel');
      reel.style.width = `${widths[i]}px`;
      const order = [...shuffle([...faces]), ...shuffle([...faces])].slice(0, 16 + i * 2);  // later drums spin longer
      order.push(home);
      const slots = Array.from({ length: 5 }, () => { const s = el('span', 'face'); s.append(el('i')); s.j = null; reel.append(s); return s; });
      tiltEl.append(reel);
      const r = { reel, ch, order, slots, target: order.length - 1, p: 0, last: 0, locked: false, x: null };
      drawReel(r, 0);
      return r;
    });
  }

  function drawReel(r, v) {
    const base = Math.round(r.p);
    for (let j = base - 2; j <= base + 2; j++) {
      const s = r.slots[((j % 5) + 5) % 5];
      if (j < 0 || j > r.target) { s.style.opacity = '0'; continue; }
      if (s.j !== j) { setFace(s, r.ch, r.order[j]); s.j = j; }
      const a = (j - r.p) * STEP;
      const c = Math.cos(a * Math.PI / 180);
      s.style.transform = `translateZ(${-R}em) rotateX(${-a}deg) translateZ(${R}em)`;
      s.style.opacity = c > 0 ? (c * c).toFixed(3) : '0';
    }
    // Faster spin, more blur and colour split.
    const b = Math.min(0.045, v * 0.0016), sp = Math.min(0.06, v * 0.0024);
    r.reel.style.setProperty('--b', `${b.toFixed(4)}em`);
    r.reel.style.textShadow = sp > 0.004 ? `${-sp}em 0 0 rgba(255,40,100,.7), ${sp}em 0 0 rgba(40,220,255,.7)` : '';
  }

  // Side walls run from light grey at the face to near-black at the back; the last slice is a lime rim.
  const shade = (k) => { const v = Math.round(150 - ((k - 1) / Math.max(1, LAYERS - 2)) * 134); return `rgb(${v},${v},${v + 4})`; };

  // The drum stops: swap it for a solid letter, extruded in depth.
  function lock(r, quiet) {
    if (r.locked) return false;
    r.locked = true;
    const x = el('span', 'x');
    for (let k = LAYERS; k >= 0; k--) {
      const l = el('span', k ? 'xl' : 'xl front');
      l.textContent = r.ch;
      l.style.setProperty('--k', k);
      if (k) l.style.color = k === LAYERS ? 'rgba(200,245,66,.5)' : shade(k);
      x.append(l);
    }
    r.reel.style.textShadow = '';
    r.reel.replaceChildren(x);
    r.x = x;
    if (quiet) { x.style.setProperty('--d', `${DD}em`); return true; }
    x.animate([{ '--d': '0em', transform: 'translateZ(.4em)' }, { '--d': `${DD}em`, transform: 'translateZ(0)' }],
      { duration: 560, easing: 'cubic-bezier(.2,.9,.25,1.25)', fill: 'forwards' });
    x.lastChild.animate([{ color: ACCENT, textShadow: `0 0 .35em ${ACCENT}` }, { color: '#f2f2f0', textShadow: '0 0 0 transparent' }],
      { duration: 620, easing: 'cubic-bezier(.2,.7,.1,1)' });
    introGlow.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: 600, easing: 'ease-out' });
    return true;
  }

  async function loadFaces() {
    const all = [...FACES, HOME];
    await Promise.race([Promise.allSettled(all.map((f) => document.fonts.load(fontSpec(f), NAME).catch(() => []))), wait(1800)]);
    return FACES.filter((f) => document.fonts.check(fontSpec(f), NAME));
  }

  function setProgress(p) {
    introCount.textContent = String(Math.round(p * 100)).padStart(3, '0');
    introLine.style.transform = `scaleX(${p})`;
  }

  // Glitch: a few frames of slice-and-shift on the whole word.
  function glitch() {
    if (!camEl) return;
    const k = () => `${(Math.random() * 0.12 - 0.06).toFixed(3)}em`;
    introName.animate([
      { clipPath: 'inset(-50% -20% -50% -20%)', translate: '0 0' },
      { clipPath: 'inset(18% -20% 52% -20%)', translate: `${k()} 0` },
      { clipPath: 'inset(60% -20% 8% -20%)', translate: `${k()} 0` },
      { clipPath: 'inset(35% -20% 30% -20%)', translate: `${k()} 0` },
      { clipPath: 'inset(-50% -20% -50% -20%)', translate: '0 0' },
    ], { duration: 180, easing: 'steps(4, end)' });
  }

  // The cursor tilts the word in 3D while the intro runs.
  function onTilt(e) {
    if (!tiltEl || !root.classList.contains('intro-on')) return;
    const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
    tiltEl.style.setProperty('--rx', `${(-y * 18).toFixed(2)}deg`);
    tiltEl.style.setProperty('--ry', `${(x * 28).toFixed(2)}deg`);
  }
  addEventListener('pointermove', onTilt, { passive: true });

  async function playIntro() {
    const run = ++introRun;
    skipRequested = false;
    root.classList.add('intro-on');
    root.classList.remove('hero-in');
    intro.classList.remove('leaving', 'locked');
    intro.style.display = '';
    $('.intro-bg', intro).style.transform = '';
    introName.style.transform = '';
    introFont.textContent = 'Loading type';
    setProgress(0);
    window.scrollTo(0, 0);

    if (reduceMotion) {
      styleHome(introName);
      introName.textContent = NAME;
      await wait(500);
      return finishIntro(run, false);
    }

    const faces = await loadFaces();
    if (run !== introRun) return;
    const reels = buildReels(faces.length ? faces : FACES);
    const n = reels.length;

    // Ticker: the face names flicker past while the drums spin.
    clearInterval(tickerTimer);
    tickerTimer = setInterval(() => { introFont.textContent = faces[(Math.random() * faces.length) | 0]?.label || ''; }, 70);

    // Camera: starts low and to the side, drifts round while the drums spin, swings past to show the
    // other side of the letters once they're solid, then settles square-on.
    const spinEnd = LAG * (n - 1) + BASE + STAGGER * (n - 1) + SETTLE;
    const total = spinEnd + SWING;
    const ease = 'cubic-bezier(.35,0,.25,1)';
    camEl.animate([
      { transform: 'translateZ(-2.6em) rotateX(26deg) rotateY(-38deg)', easing: ease },
      { transform: 'translateZ(-.5em) rotateX(12deg) rotateY(-16deg)', offset: (spinEnd * 0.6) / total, easing: ease },
      { transform: 'translateZ(0em) rotateX(7deg) rotateY(-9deg)', offset: spinEnd / total, easing: ease },
      { transform: 'translateZ(0em) rotateX(-5deg) rotateY(15deg)', offset: (spinEnd + SWING * 0.55) / total, easing: ease },
      { transform: 'translateZ(0em) rotateX(0deg) rotateY(0deg)' },
    ], { duration: total, fill: 'forwards' });

    // A few glitches while it's at full speed.
    const t0 = performance.now();
    [380, 720, 1080].forEach((ms) => setTimeout(() => { if (run === introRun && !skipRequested) glitch(); }, ms));

    let locked = 0;
    await new Promise((resolve) => {
      skipWake = resolve;
      const tick = (now) => {
        if (run !== introRun || skipRequested) return resolve();
        let spinning = 0;
        reels.forEach((r, i) => {
          if (r.locked) return;
          const t = now - t0 - i * LAG, dur = BASE + i * STAGGER;
          let p;
          if (t <= 0) p = 0;
          else if (t < dur) p = (r.target + OV) * spinEase(t / dur);
          else if (t < dur + SETTLE) p = r.target + OV * (1 - outCubic((t - dur) / SETTLE));
          else {
            if (lock(r, false)) setProgress(++locked / n);
            return;
          }
          const v = r.last ? (Math.abs(p - r.p) / Math.max(1, now - r.last)) * 1000 : 0;
          r.p = p;
          r.last = now;
          drawReel(r, v);
          spinning++;
        });
        if (!spinning) return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    clearInterval(tickerTimer);
    if (run !== introRun) return;
    reels.forEach((r) => lock(r, true));
    introFont.textContent = HOME.label;
    setProgress(1);
    intro.classList.add('locked');   // light sweep across the name; floor fades
    tiltEl?.style.setProperty('--rx', '0deg');
    tiltEl?.style.setProperty('--ry', '0deg');
    if (!skipRequested) await pause(SWING - 100);
    // Fold the depth away while facing front, so the swap to flat text is invisible.
    if (!skipRequested && run === introRun) {
      reels.forEach((r) => r.x?.animate([{ '--d': `${DD}em` }, { '--d': '0em' }], { duration: 320, easing: 'cubic-bezier(.6,0,.4,1)', fill: 'forwards' }));
      await pause(320);
    }
    return finishIntro(run, true);
  }

  async function finishIntro(run, fly) {
    if (run !== introRun) return;
    clearInterval(tickerTimer);
    // Back to one text run so kerning matches the hero headline exactly.
    styleHome(introName);
    introName.textContent = NAME;
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
      bg.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0)' }], { duration: dur, easing: ease, fill: 'forwards', delay: 80 });
      await wait(dur + 80);
    } else {
      await intro.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).finished;
    }
    if (run !== introRun) return;

    root.classList.remove('intro-on');
    root.classList.add('hero-in');
    intro.style.display = 'none';
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
  setTimeout(() => { if (root.classList.contains('intro-on')) { skipRequested = true; finishIntro(introRun, false); } }, 12000);
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
