/* ════════════════════════════════════════════════════════════
   MailPilot — Cinematic Scroll Engine v2
   Image-sequence playback on <canvas>, scroll-driven
   ════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ─── CONFIGURATION ───
  const CONFIG = {
    heroSequence: {
      folder: '3D Flow',
      totalFrames: 196,
      prefix: 'ezgif-frame-',
      ext: '.jpg',
    },
    transformSequence: {
      folder: 'icon',
      totalFrames: 224,
      prefix: 'ezgif-frame-',
      ext: '.jpg',
    },
    preloadBatchSize: 12,       // concurrent loads
    lerpFactor: 0.08,           // smoothing (lower = smoother)
    mobileSkipFrames: true,     // skip every 2nd frame on mobile
    parallaxStrength: 0.012,    // mouse parallax intensity
  };

  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 768;

  // ─── STATE ───
  const state = {
    heroFrames: [],
    transformFrames: [],
    heroLoaded: 0,
    transformLoaded: 0,
    heroCurrentFrame: 0,
    heroTargetFrame: 0,
    transformCurrentFrame: 0,
    transformTargetFrame: 0,
    mouseX: 0.5,
    mouseY: 0.5,
    preloaderDone: false,
    lastHeroFrame: -1,
    lastTransformFrame: -1,
  };

  // ─── ELEMENTS ───
  const els = {};

  // ─── UTILITY ───
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }
  function pad(n) { return String(n).padStart(3, '0'); }
  function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2; }

  // ─── FRAME PATH ───
  function framePath(seq, idx) {
    return `${seq.folder}/${seq.prefix}${pad(idx)}${seq.ext}`;
  }

  // ─── IMAGE LOADER ───
  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        // Retry once
        const r = new Image();
        r.onload = () => resolve(r);
        r.onerror = () => resolve(null);
        r.src = src;
      };
      img.src = src;
    });
  }

  async function preloadSequence(seq, framesArray, onProgress) {
    const indices = [];
    for (let i = 1; i <= seq.totalFrames; i++) {
      if (isMobile && CONFIG.mobileSkipFrames && i % 2 === 0) continue;
      indices.push(i);
    }

    let loaded = 0;
    const total = indices.length;

    for (let b = 0; b < indices.length; b += CONFIG.preloadBatchSize) {
      const batch = indices.slice(b, b + CONFIG.preloadBatchSize);
      await Promise.all(batch.map(async (idx) => {
        const img = await loadImage(framePath(seq, idx));
        if (img) framesArray[idx - 1] = img;
        loaded++;
        if (onProgress) onProgress(loaded, total);
      }));
    }

    // Fill gaps for mobile
    if (isMobile && CONFIG.mobileSkipFrames) {
      for (let i = 0; i < seq.totalFrames; i++) {
        if (!framesArray[i]) {
          framesArray[i] = framesArray[i - 1] || framesArray[i + 1] || null;
        }
      }
    }
  }

  // ─── CANVAS SETUP ───
  function initCanvas(canvas) {
    const ctx = canvas.getContext('2d', { alpha: false });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
    }

    resize();
    window.addEventListener('resize', resize);
    return ctx;
  }

  // ─── DRAW FRAME (Cover-fit with parallax) ───
  function drawFrame(canvas, ctx, img) {
    if (!img) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vw = canvas.width / dpr;
    const vh = canvas.height / dpr;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vw, vh);

    // Cover-fit calculation
    const imgR = img.naturalWidth / img.naturalHeight;
    const scrR = vw / vh;
    let dw, dh;
    if (imgR > scrR) { dh = vh; dw = vh * imgR; }
    else             { dw = vw; dh = vw / imgR; }

    let dx = (vw - dw) / 2;
    let dy = (vh - dh) / 2;

    // Subtle mouse parallax
    if (!isMobile) {
      dx += (state.mouseX - 0.5) * dw * CONFIG.parallaxStrength;
      dy += (state.mouseY - 0.5) * dh * CONFIG.parallaxStrength;
    }

    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  }

  // ─── SCROLL PROGRESS for a section ───
  function getSectionProgress(section) {
    const rect = section.getBoundingClientRect();
    const sectionH = section.offsetHeight;
    const vh = window.innerHeight;
    const scrolled = -rect.top;
    const range = sectionH - vh;
    return clamp(scrolled / Math.max(range, 1), 0, 1);
  }

  // ─── OVERLAY CONTROL ───
  function updateHeroOverlay(progress) {
    const questions = [
      document.getElementById('hq1'),
      document.getElementById('hq2'),
      document.getElementById('hq3'),
    ];
    // 3 equal windows across 0.08–0.92
    const winSize = 0.25;
    const gap     = 0.03;
    const starts  = [0.08, 0.08 + winSize + gap, 0.08 + (winSize + gap) * 2];

    questions.forEach((el, i) => {
      if (!el) return;
      const s = starts[i], e = s + winSize;
      if (progress >= s && progress < e) {
        el.classList.remove('hq-out');
        el.classList.add('hq-in');
      } else if (progress >= e) {
        el.classList.remove('hq-in');
        el.classList.add('hq-out');
      } else {
        el.classList.remove('hq-in', 'hq-out');
      }
    });

    // Scroll indicator
    if (progress < 0.03 && state.preloaderDone) {
      els.scrollIndicator.classList.add('visible');
      els.scrollIndicator.classList.remove('fade-out');
    } else if (progress > 0.03) {
      els.scrollIndicator.classList.add('fade-out');
    }
  }

  function updateTransformOverlay(progress) {
    if (progress > 0.15 && progress < 0.85) {
      els.transformOverlay.classList.add('visible');
    } else {
      els.transformOverlay.classList.remove('visible');
    }
  }

  // ─── CROSSFADE between sections ───
  function updateCrossfade(heroProgress) {
    if (heroProgress > 0.92) {
      const fade = (heroProgress - 0.92) / 0.08;
      els.heroCanvas.style.opacity = 1 - fade * 0.5;
    } else {
      els.heroCanvas.style.opacity = 1;
    }
  }

  // ─── NAVBAR ───
  function updateNavbar() {
    els.navbar.classList.toggle('scrolled', window.scrollY > 50);
  }

  // ─── MAIN SCROLL HANDLER ───
  function onScroll() {
    updateNavbar();

    // Hero
    const hp = getSectionProgress(els.heroSection);
    const heroFrame = Math.round(easeInOutCubic(hp) * (CONFIG.heroSequence.totalFrames - 1));
    state.heroTargetFrame = clamp(heroFrame, 0, CONFIG.heroSequence.totalFrames - 1);
    updateHeroOverlay(hp);
    updateCrossfade(hp);

    // Transform
    const tp = getSectionProgress(els.transformSection);
    const transFrame = Math.round(easeInOutCubic(tp) * (CONFIG.transformSequence.totalFrames - 1));
    state.transformTargetFrame = clamp(transFrame, 0, CONFIG.transformSequence.totalFrames - 1);
    updateTransformOverlay(tp);
  }

  // ─── ANIMATION LOOP ───
  function tick() {
    // Lerp hero
    state.heroCurrentFrame = lerp(state.heroCurrentFrame, state.heroTargetFrame, CONFIG.lerpFactor);
    const hi = Math.round(state.heroCurrentFrame);
    if (hi !== state.lastHeroFrame && state.heroFrames[hi]) {
      drawFrame(els.heroCanvas, els.heroCtx, state.heroFrames[hi]);
      state.lastHeroFrame = hi;
    }

    // Lerp transform — hold last frame when section not yet in view
    const tp = getSectionProgress(els.transformSection);
    if (tp > 0) {
      state.transformCurrentFrame = lerp(state.transformCurrentFrame, state.transformTargetFrame, CONFIG.lerpFactor);
    }
    const ti = Math.round(state.transformCurrentFrame);
    if (ti !== state.lastTransformFrame && state.transformFrames[ti]) {
      drawFrame(els.transformCanvas, els.transformCtx, state.transformFrames[ti]);
      state.lastTransformFrame = ti;
    }

    requestAnimationFrame(tick);
  }

  // ─── MOUSE ───
  function onMouseMove(e) {
    state.mouseX = e.clientX / window.innerWidth;
    state.mouseY = e.clientY / window.innerHeight;
  }

  // ─── SCROLL REVEAL ───
  function setupScrollReveal() {
    const PRICING_ORDER = ['planMonthly', 'planQuarterly', 'planYearly'];

    const items = document.querySelectorAll('.feature-card, .step-card, .cta-card, .pricing-card, .review-card');
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target;

          if (el.classList.contains('pricing-card')) {
            // Fire all three pricing cards together with CSS-controlled delays
            const grid = el.closest('.pricing-grid');
            grid.querySelectorAll('.pricing-card').forEach(card => {
              card.classList.add('revealed');
              obs.unobserve(card);
            });
          } else {
            const siblings = el.parentElement.children;
            let idx = 0;
            for (let i = 0; i < siblings.length; i++) {
              if (siblings[i] === el) { idx = i; break; }
            }
            setTimeout(() => el.classList.add('revealed'), idx * 120);
            obs.unobserve(el);
          }
        }
      });
    }, { threshold: 0.12 });
    items.forEach(el => obs.observe(el));
  }

  // ─── SUPPORT FORM ───
  function setupSupportForm() {
    const form = document.getElementById('supportForm');
    const list = document.getElementById('reviewsList');
    const ratingInput = document.getElementById('userRating');
    const stars = document.querySelectorAll('#starPicker span');

    // Star picker interaction
    stars.forEach((star) => {
      star.addEventListener('mouseover', () => {
        const val = +star.dataset.val;
        stars.forEach(s => s.classList.toggle('active', +s.dataset.val <= val));
      });
      star.addEventListener('mouseout', () => {
        const current = +ratingInput.value;
        stars.forEach(s => s.classList.toggle('active', +s.dataset.val <= current));
      });
      star.addEventListener('click', () => {
        ratingInput.value = star.dataset.val;
        stars.forEach(s => s.classList.toggle('active', +s.dataset.val <= +star.dataset.val));
      });
    });

    // Load saved reviews
    const saved = JSON.parse(localStorage.getItem('mailpilot_reviews') || '[]');
    saved.forEach(r => renderReview(r, list));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const rating = +ratingInput.value;
      if (rating === 0) { alert('Please select a star rating.'); return; }

      const review = {
        name: document.getElementById('userName').value.trim(),
        email: document.getElementById('userEmail').value.trim(),
        phone: document.getElementById('userPhone').value.trim(),
        rating,
        text: document.getElementById('userReview').value.trim(),
      };

      renderReview(review, list, true);

      const all = JSON.parse(localStorage.getItem('mailpilot_reviews') || '[]');
      all.unshift(review);
      localStorage.setItem('mailpilot_reviews', JSON.stringify(all));

      form.reset();
      ratingInput.value = 0;
      stars.forEach(s => s.classList.remove('active'));
    });
  }

  function renderReview(r, list, prepend = false) {
    const initials = r.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const starsHtml = Array.from({length: 5}, (_, i) =>
      `<span style="color:${i < r.rating ? '#f59e0b' : '#e5e7eb'}">&#9733;</span>`
    ).join('');

    const card = document.createElement('div');
    card.className = 'review-card';
    card.innerHTML = `
      <div class="review-stars">${starsHtml}</div>
      <p class="review-text">"${r.text}"</p>
      <div class="review-author">
        <div class="review-avatar">${initials}</div>
        <div class="review-info">
          <div class="review-name">${r.name}</div>
          <div class="review-meta">${r.email} &middot; ${r.phone}</div>
        </div>
      </div>`;

    if (prepend) list.prepend(card); else list.append(card);
  }


  function setupSmoothLinks() {
    document.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', (e) => {
        const t = document.querySelector(a.getAttribute('href'));
        if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth' }); }
      });
    });
  }

  // ─── PRELOADER ───
  async function runPreloader() {
    const bar = document.getElementById('preloaderBar');
    const pct = document.getElementById('preloaderPercent');
    const preloader = document.getElementById('preloader');

    const totalWeight = CONFIG.heroSequence.totalFrames + CONFIG.transformSequence.totalFrames;
    let heroCount = 0, transCount = 0;

    function updateBar() {
      const p = Math.round(((heroCount + transCount) / totalWeight) * 100);
      bar.style.width = p + '%';
      pct.textContent = p + '%';
    }

    // Load both in parallel
    await Promise.all([
      preloadSequence(CONFIG.heroSequence, state.heroFrames, (n) => { heroCount = n; updateBar(); }),
      preloadSequence(CONFIG.transformSequence, state.transformFrames, (n) => { transCount = n; updateBar(); }),
    ]);

    // Draw initial frames
    if (state.heroFrames[0]) drawFrame(els.heroCanvas, els.heroCtx, state.heroFrames[0]);
    if (state.transformFrames[0]) drawFrame(els.transformCanvas, els.transformCtx, state.transformFrames[0]);

    await new Promise(r => setTimeout(r, 300));
    preloader.classList.add('hidden');
    state.preloaderDone = true;

    setTimeout(() => els.scrollIndicator.classList.add('visible'), 600);
  }

  // ─── INIT ───
  function init() {
    els.heroSection = document.getElementById('heroSection');
    els.transformSection = document.getElementById('transformSection');
    els.heroCanvas = document.getElementById('heroCanvas');
    els.transformCanvas = document.getElementById('transformCanvas');
    els.heroOverlay = document.getElementById('heroOverlay');
    els.transformOverlay = document.getElementById('transformOverlay');
    els.scrollIndicator = document.getElementById('scrollIndicator');
    els.navbar = document.getElementById('navbar');

    els.heroCtx = initCanvas(els.heroCanvas);
    els.transformCtx = initCanvas(els.transformCanvas);

    window.addEventListener('scroll', onScroll, { passive: true });
    if (!isMobile) window.addEventListener('mousemove', onMouseMove, { passive: true });

    requestAnimationFrame(tick);
    setupScrollReveal();
    setupSmoothLinks();
    setupSupportForm();
    runPreloader();
    onScroll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
