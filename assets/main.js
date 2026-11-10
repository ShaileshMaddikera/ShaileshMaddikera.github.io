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

  /* ───────────────────────── Intro: cinematic title ───────────────────────── */
  // Heavy 3D metal letters fall from the sky and are "built" into the name, with embers, dust,
  // camera shake and a glowing horizon; then the surname draws out underneath and the page appears.

  const TITLE = 'SHAILESH';
  const DEPTH = 22;            // layers per letter (the extrusion)
  const intro = $('#intro');
  const stage = $('#introStage');
  const camera = $('#introCamera');
  const title = $('#title3d');
  const horizon = $('#horizon');
  const subtitle = $('#subtitle');
  const glow = $('#introGlow');
  const flash = $('#introFlash');
  const fx = $('#introFx');
  const fxCtx = fx.getContext('2d');
  const heroFirst = $('#heroFirst');
  let introRun = 0;
  let skipRequested = false;
  let skipWake = null;
  let fxRaf = 0;

  // A wait that ends early when the visitor skips.
  const pause = (ms) => new Promise((r) => {
    const t = setTimeout(r, ms);
    skipWake = () => { clearTimeout(t); r(); };
  });

  function buildTitle() {
    title.classList.remove('sheen');
    title.textContent = '';
    return [...TITLE].map((ch, i) => {
      const l = document.createElement('span');
      l.className = 'l3d';
      for (let k = DEPTH; k >= 1; k--) {
        const layer = document.createElement('span');
        layer.className = 'layer';
        layer.textContent = ch;
        // Darker as it goes back: bronze edge near the face, near-black at the back.
        const t = k / DEPTH;
        layer.style.color = `rgb(${Math.round(120 - 95 * t)}, ${Math.round(84 - 70 * t)}, ${Math.round(44 - 38 * t)})`;
        layer.style.transform = `translate3d(0, ${k * 0.0032}em, ${-k * 0.9}px)`; // drops slightly: a visible bronze edge
        l.appendChild(layer);
      }
      const face = document.createElement('span');
      face.className = 'face';
      face.textContent = ch;
      face.style.setProperty('--sd', `${i * 0.07}s`);
      l.appendChild(face);
      title.appendChild(l);
      return l;
    });
  }

  /* Particles: embers drift up all the time; dust and sparks burst where a letter lands. */
  let parts = [], FW = 0, FH = 0, FDPR = 1, emberClock = 0;
  function fxResize() {
    FDPR = Math.min(2, devicePixelRatio || 1);
    FW = innerWidth; FH = innerHeight;
    fx.width = FW * FDPR; fx.height = FH * FDPR;
    fxCtx.setTransform(FDPR, 0, 0, FDPR, 0, 0);
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  function ember(x = rnd(0, FW), y = FH * rnd(0.75, 1.02), burst = false) {
    parts.push({ kind: 'ember', x, y, vx: rnd(-0.25, 0.25) + (burst ? rnd(-2.2, 2.2) : 0), vy: burst ? rnd(-4.5, -1.5) : rnd(-1.1, -0.35),
      life: 0, max: rnd(burst ? 50 : 160, burst ? 110 : 320), r: rnd(0.7, burst ? 2.2 : 1.8), flick: rnd(0, 6.28) });
  }
  function dust(x, y) {
    for (let i = 0; i < 26; i++) {
      const a = rnd(Math.PI * 1.05, Math.PI * 1.95);
      const v = rnd(1.2, 5.5);
      parts.push({ kind: 'dust', x: x + rnd(-30, 30), y, vx: Math.cos(a) * v * 1.6, vy: Math.sin(a) * v * 0.55,
        life: 0, max: rnd(45, 95), r: rnd(6, 22) });
    }
    for (let i = 0; i < 14; i++) ember(x + rnd(-24, 24), y - 4, true);
  }
  function fxLoop() {
    fxCtx.clearRect(0, 0, FW, FH);
    if (++emberClock % 3 === 0 && parts.length < 260) ember();
    fxCtx.globalCompositeOperation = 'source-over';
    for (const p of parts) {
      if (p.kind !== 'dust') continue;
      p.life++; p.x += p.vx; p.y += p.vy; p.vx *= 0.95; p.vy = p.vy * 0.95 - 0.02; p.r += 0.35;
      const a = 0.22 * (1 - p.life / p.max);
      const g = fxCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, `rgba(150, 105, 70, ${a})`); g.addColorStop(1, 'rgba(150, 105, 70, 0)');
      fxCtx.fillStyle = g; fxCtx.beginPath(); fxCtx.arc(p.x, p.y, p.r, 0, 6.283); fxCtx.fill();
    }
    fxCtx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      if (p.kind !== 'ember') continue;
      p.life++; p.x += p.vx + Math.sin((p.life + p.flick * 40) * 0.03) * 0.25; p.y += p.vy; p.vy += 0.004;
      const fade = Math.min(1, p.life / 12) * (1 - p.life / p.max);
      const tw = 0.6 + 0.4 * Math.sin(p.life * 0.25 + p.flick);
      fxCtx.fillStyle = `rgba(255, ${Math.round(150 + 70 * tw)}, ${Math.round(60 * tw)}, ${Math.max(0, fade * tw).toFixed(3)})`;
      fxCtx.beginPath(); fxCtx.arc(p.x, p.y, p.r, 0, 6.283); fxCtx.fill();
    }
    parts = parts.filter((p) => p.life < p.max && p.y > -20);
    fxRaf = requestAnimationFrame(fxLoop);
  }

  function shake(power) {
    const k = power;
    stage.animate([
      { transform: 'translate3d(0,0,0)' },
      { transform: `translate3d(${-6 * k}px, ${5 * k}px, 0)` },
      { transform: `translate3d(${5 * k}px, ${-4 * k}px, 0)` },
      { transform: `translate3d(${-3 * k}px, ${2 * k}px, 0)` },
      { transform: 'translate3d(0,0,0)' },
    ], { duration: 260, easing: 'ease-out' });
  }

  function land(letter, i, n) {
    const r = letter.getBoundingClientRect();
    dust(r.left + r.width / 2, r.bottom - r.height * 0.06);
    shake(i === n - 1 ? 1.8 : 0.9);
    glow.animate([{ opacity: 0.75 }, { opacity: 1 }, { opacity: 0.75 }], { duration: 380, easing: 'ease-out' });
    if (i === 0) {
      horizon.animate([{ width: '0px', opacity: 0.4 }, { width: '108%', opacity: 1 }],
        { duration: 1400, easing: 'cubic-bezier(.2,.7,.1,1)', fill: 'forwards' });
    }
  }

  function supportsWebGL() {
    try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
  }

  async function play3D(run) {
    intro.classList.add('mode-3d');
    let ready = false;
    // Only the loading is timed: once the scene is playing, this never fires.
    const timeout = wait(5000).then(() => (ready ? new Promise(() => {}) : Promise.reject(new Error('3D took too long to load'))));
    const mod = await Promise.race([import('./intro3d.js'), timeout]);
    const sub = $('#subtitle3d');
    return Promise.race([mod.playTitle3D({
      canvas: $('#intro3d'),
      fontUrl: 'assets/fonts/cinzel-900.typeface.json',
      word: TITLE,
      isSkipped: () => skipRequested || run !== introRun,
      onReady: () => { ready = true; intro.classList.add('ready-3d'); setTimeout(() => cancelAnimationFrame(fxRaf), 900); },
      onSubtitle: () => {
        sub.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, fill: 'forwards' });
        $$('i', sub).forEach((line) => line.animate([{ width: '0px' }, { width: 'clamp(36px, 12vw, 170px)' }],
          { duration: 1200, easing: 'cubic-bezier(.2,.7,.1,1)', fill: 'forwards' }));
        $('span', sub).animate([{ letterSpacing: '1.4em', marginRight: '-1.4em', filter: 'blur(6px)' }, { letterSpacing: '.5em', marginRight: '-.5em', filter: 'blur(0)' }],
          { duration: 1400, easing: 'cubic-bezier(.2,.7,.1,1)', fill: 'forwards' });
      },
    }), timeout]);
  }

  async function playIntro() {
    const run = ++introRun;
    skipRequested = false;
    root.classList.add('intro-on');
    root.classList.remove('hero-in');
    intro.style.display = '';
    intro.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    window.scrollTo(0, 0);
    const letters = buildTitle();
    fxResize();
    parts = [];
    cancelAnimationFrame(fxRaf);

    intro.classList.remove('mode-3d', 'ready-3d');
    if (!reduceMotion && supportsWebGL()) {
      try {
        fxLoop(); // 2D embers while the 3D scene loads
        const scene = await play3D(run);
        if (run !== introRun) { scene.dispose(); return; }
        await finishIntro(run);
        scene.dispose();
        return;
      } catch (err) {
        console.warn('3D intro unavailable, using the 2D one:', err);
        intro.classList.remove('mode-3d', 'ready-3d');
        cancelAnimationFrame(fxRaf);
        if (run !== introRun) return;
      }
    }

    if (reduceMotion) {
      letters.forEach((l) => { l.style.opacity = 1; });
      horizon.style.width = '108%';
      subtitle.style.opacity = 1;
      glow.style.opacity = 0.75;
      await wait(1100);
      return finishIntro(run);
    }

    await Promise.race([document.fonts.load('900 100px "Cinzel"', TITLE), wait(1500)]).catch(() => {});
    if (run !== introRun) return;
    fxLoop();
    glow.animate([{ opacity: 0 }, { opacity: 0.75 }], { duration: 1600, easing: 'ease-out', fill: 'forwards' });

    // Camera: starts low and close, pulls back as the name is built.
    const n = letters.length;
    const staggers = letters.map((_, i) => 360 - 190 * Math.sin((Math.PI / 2) * (i / (n - 1)))); // slows, then quickens
    const drop = 760;
    const buildTime = 500 + staggers.reduce((a, b) => a + b, 0) + drop;
    camera.animate([
      { transform: 'translateY(9%) rotateX(26deg) scale(1.6)' },
      { transform: 'translateY(3%) rotateX(12deg) scale(1.18)', offset: 0.65 },
      { transform: 'translateY(0) rotateX(4deg) scale(1.04)' },
    ], { duration: buildTime, easing: 'cubic-bezier(.33,.0,.2,1)', fill: 'forwards' });

    await pause(500);
    for (let i = 0; i < n && !skipRequested && run === introRun; i++) {
      const l = letters[i];
      const side = i < n / 2 ? -1 : 1;
      l.animate([
        { opacity: 1, transform: `translate3d(${side * rnd(10, 60)}px, -115vh, 340px) rotateX(${rnd(60, 95)}deg) rotateY(${side * rnd(10, 35)}deg) rotateZ(${rnd(-25, 25)}deg)` },
        { opacity: 1, transform: 'translate3d(0, 0, 0) rotateX(0deg) rotateY(0deg) rotateZ(0deg)', offset: 0.8, easing: 'cubic-bezier(.2,.8,.3,1)' },
        { opacity: 1, transform: 'translate3d(0, -0.035em, 0) rotateX(-4deg)', offset: 0.9, easing: 'cubic-bezier(.4,0,.6,1)' },
        { opacity: 1, transform: 'none' },
      ], { duration: drop, easing: 'cubic-bezier(.55,0,1,.45)', fill: 'forwards' });
      setTimeout(() => { if (run === introRun && !skipRequested) land(l, i, n); }, drop * 0.8);
      await pause(staggers[i]);
    }
    if (run !== introRun) return;

    if (skipRequested) return finishIntro(run);
    await pause(drop);
    if (run !== introRun) return;
    if (skipRequested) return finishIntro(run);

    // Light sweeps across the metal; the camera settles; the surname draws out between two lines.
    title.classList.add('sheen');
    camera.animate([{ transform: 'translateY(0) rotateX(4deg) scale(1.04)' }, { transform: 'translateY(-1%) rotateX(9deg) scale(1)' }],
      { duration: 1800, easing: 'cubic-bezier(.2,.7,.1,1)', fill: 'forwards' });
    await pause(350);
    subtitle.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, fill: 'forwards' });
    $$('i', subtitle).forEach((line) => line.animate([{ width: '0px' }, { width: 'clamp(36px, 12vw, 170px)' }],
      { duration: 1200, easing: 'cubic-bezier(.2,.7,.1,1)', fill: 'forwards' }));
    $('span', subtitle).animate([{ letterSpacing: '1.4em', marginRight: '-1.4em', filter: 'blur(6px)' }, { letterSpacing: '.5em', marginRight: '-.5em', filter: 'blur(0)' }],
      { duration: 1400, easing: 'cubic-bezier(.2,.7,.1,1)', fill: 'forwards' });
    await pause(1900);
    return finishIntro(run);
  }

  async function finishIntro(run) {
    if (run !== introRun) return;
    const quick = skipRequested;
    // Burn out: a warm flash, the title swells and blurs away, the page rises underneath.
    flash.animate([{ opacity: 0 }, { opacity: quick ? 0.5 : 0.95 }, { opacity: 0 }], { duration: quick ? 450 : 900, easing: 'ease-out' });
    await wait(quick ? 150 : 260);
    root.classList.remove('intro-on');
    root.classList.add('hero-in');
    await intro.animate([{ opacity: 1, filter: 'blur(0)', transform: 'scale(1)' }, { opacity: 0, filter: 'blur(10px)', transform: 'scale(1.06)' }],
      { duration: quick ? 400 : 750, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }).finished.catch(() => {});
    if (run !== introRun) return;
    intro.style.display = 'none';
    cancelAnimationFrame(fxRaf);
    parts = [];
    intro.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  }

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const skip = () => { if (!skipRequested) { skipRequested = true; skipWake?.(); } };
  intro.addEventListener('click', skip);
  addEventListener('keydown', (e) => { if (root.classList.contains('intro-on') && !e.metaKey && !e.ctrlKey) skip(); });
  addEventListener('resize', () => { if (root.classList.contains('intro-on')) fxResize(); });
  // Deep links (#work) and ?nointro go straight to the page.
  if (location.hash.length > 1 || new URLSearchParams(location.search).has('nointro')) {
    root.classList.add('hero-in');
    intro.style.display = 'none';
  } else {
    playIntro();
  }
  // Safety net: never leave someone stuck on the intro.
  setTimeout(() => { if (root.classList.contains('intro-on')) { skip(); finishIntro(introRun); } }, 22000);
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
  console.log('Built by hand: plain JS, plus Three.js for the 3D title. Say hi: https://www.linkedin.com/in/shailesh-maddikera/');
})();
