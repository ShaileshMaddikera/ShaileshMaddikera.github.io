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

  /* ───────────────────────── Intro ───────────────────────── */

  // Each face the name passes through. `size` (em) keeps wide faces on screen.
  const FACES = [
    { family: 'Instrument Serif', style: 'italic', weight: 400, track: '-0.02em', label: 'Instrument Serif Italic' },
    { family: 'Geist Mono', weight: 400, track: '-0.04em', label: 'Geist Mono' },
    { family: 'Bebas Neue', weight: 400, track: '0.01em', size: 1.1, label: 'Bebas Neue' },
    { family: 'UnifrakturCook', weight: 700, track: '0', label: 'UnifrakturCook', color: 'accent' },
    { family: 'Pacifico', weight: 400, track: '0', size: 0.9, label: 'Pacifico' },
    { family: 'Monoton', weight: 400, track: '0', size: 0.72, label: 'Monoton' },
    { family: 'Press Start 2P', weight: 400, track: '-0.02em', size: 0.5, label: 'Press Start 2P' },
    { family: 'Syne', weight: 800, track: '-0.04em', label: 'Syne ExtraBold', color: 'accent' },
    { family: 'Rubik Glitch', weight: 400, track: '0', size: 0.85, label: 'Rubik Glitch' },
    { family: 'Major Mono Display', weight: 400, track: '-0.04em', size: 0.8, label: 'Major Mono Display' },
    { family: 'Bungee Shade', weight: 400, track: '0', size: 0.66, label: 'Bungee Shade' },
    { family: 'Playfair Display', style: 'italic', weight: 900, track: '-0.03em', label: 'Playfair Display Black Italic', color: 'accent' },
    { family: 'Orbitron', weight: 800, track: '0', size: 0.72, label: 'Orbitron' },
    { family: 'Silkscreen', weight: 400, track: '0', size: 0.7, label: 'Silkscreen' },
    { family: 'Rubik Mono One', weight: 400, track: '-0.02em', size: 0.62, label: 'Rubik Mono One' },
    { family: 'Caveat', weight: 700, track: '0', size: 1.15, label: 'Caveat' },
    { family: 'Righteous', weight: 400, track: '0', label: 'Righteous' },
    { family: 'Space Grotesk', weight: 300, track: '-0.05em', label: 'Space Grotesk Light' },
  ];
  const HOME = { family: 'Geist', weight: 600, track: '-0.045em', label: 'Geist — home' };
  const ACCENT = '#c8f542';
  const NAME = 'Shailesh';
  const EASE_OUT = 'cubic-bezier(.2,.7,.1,1)';

  const intro = $('#intro');
  const introName = $('#introName');
  const introFont = $('#introFont');
  const introCount = $('#introCount');
  const introLine = $('#introLine');
  const heroFirst = $('#heroFirst');
  let introRun = 0; // bumps on every (re)start so a stale run stops itself
  let skipRequested = false;
  let letters = [];

  const fontSpec = (f, px = 64) => `${f.style || 'normal'} ${f.weight} ${px}px "${f.family}"`;

  function styleEl(el, f) {
    el.style.fontFamily = `"${f.family}", var(--sans)`;
    el.style.fontWeight = f.weight;
    el.style.fontStyle = f.style || 'normal';
    el.style.letterSpacing = f.track;
  }

  function buildLetters() {
    styleEl(introName, HOME);
    introName.style.color = '';
    introName.textContent = '';
    letters = [...NAME].map((ch) => {
      const span = document.createElement('span');
      span.className = 'ch';
      span.textContent = ch;
      introName.appendChild(span);
      return span;
    });
  }

  // One face rolls through the word letter by letter: each glyph slides and un-blurs into the new face.
  function morphTo(f, { stagger = 26, reverse = false, up = true, duration = 360 } = {}) {
    introFont.textContent = f.label;
    letters.forEach((span, i) => {
      const order = reverse ? letters.length - 1 - i : i;
      setTimeout(() => {
        styleEl(span, f);
        span.style.fontSize = f.size ? `${f.size}em` : '1em';
        span.style.color = f.color === 'accent' ? ACCENT : '';
        span.animate(
          [
            { transform: `translateY(${up ? 22 : -22}%) scale(.94)`, filter: 'blur(7px)', opacity: 0.25 },
            { transform: 'none', filter: 'blur(0px)', opacity: 1 },
          ],
          { duration, easing: EASE_OUT },
        );
      }, order * stagger);
    });
  }

  async function loadFaces() {
    const all = [...FACES, HOME];
    const loads = all.map((f) => document.fonts.load(fontSpec(f), NAME).catch(() => []));
    await Promise.race([Promise.allSettled(loads), wait(1800)]);
    return FACES.filter((f) => document.fonts.check(fontSpec(f), NAME));
  }

  // Slow → fast → slow. In the fast middle the waves overlap, so letters briefly mix faces.
  const stepDelay = (i, n) => 85 + 175 * (1 - Math.sin(Math.PI * (i / Math.max(1, n - 1))));
  const setProgress = (p) => {
    introCount.textContent = String(Math.round(p * 100)).padStart(3, '0');
    introLine.style.transform = `scaleX(${p})`;
  };

  async function playIntro() {
    const run = ++introRun;
    skipRequested = false;
    root.classList.add('intro-on');
    root.classList.remove('hero-in');
    intro.classList.remove('leaving');
    intro.style.display = '';
    $('.intro-bg', intro).style.transform = '';
    introName.style.transform = '';
    introFont.textContent = 'Loading type';
    setProgress(0);
    buildLetters();
    window.scrollTo(0, 0);

    if (reduceMotion) {
      await wait(500);
      return finishIntro(run, false);
    }

    const faces = await loadFaces();
    if (run !== introRun) return;
    const n = faces.length;
    for (let i = 0; i < n; i++) {
      if (skipRequested || run !== introRun) break;
      morphTo(faces[i], { reverse: i % 4 === 3, up: i % 2 === 0 });
      setProgress((i + 1) / (n + 1));
      await wait(stepDelay(i, n));
    }
    if (run !== introRun) return;
    // Settle: a slower, wider wave into the home face.
    morphTo(HOME, skipRequested ? { stagger: 0, duration: 200 } : { stagger: 48, duration: 620 });
    setProgress(1);
    await wait(skipRequested ? 220 : 48 * NAME.length + 620);
    return finishIntro(run, true);
  }

  async function finishIntro(run, fly) {
    if (run !== introRun) return;
    // Back to one text run so kerning matches the hero headline exactly.
    letters.forEach((s) => s.getAnimations().forEach((a) => a.finish()));
    styleEl(introName, HOME);
    introName.textContent = NAME;
    letters = [];
    introFont.textContent = HOME.label;
    await document.fonts.load(fontSpec(HOME), NAME).catch(() => {});
    await frame();
    intro.classList.add('leaving');

    const bg = $('.intro-bg', intro);
    const dur = skipRequested ? 700 : 1150;
    const ease = 'cubic-bezier(.76,0,.24,1)';

    if (fly && heroFirst) {
      // FLIP: glide the intro word exactly onto the hero's first name while the curtain lifts.
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
  const skip = () => { skipRequested = true; };
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
  setTimeout(() => { if (root.classList.contains('intro-on')) { skipRequested = true; finishIntro(introRun, false); } }, 9000);
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
