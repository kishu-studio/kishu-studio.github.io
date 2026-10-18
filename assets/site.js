// Kishu Studio · smooth scrolling, header, reveals, and a particle field that draws a shape
// for each section. Shapes are tied to anchor elements in the page, so they scroll with the content.
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ── Contact details and placeholders ──
  var wa = (window.WHATSAPP || '').replace(/\D/g, '');
  $$('[data-wa]').forEach(function (a) {
    if (wa.length >= 8) { a.href = 'https://wa.me/' + wa + '?text=' + encodeURIComponent('Hi Yash, I found Kishu Studio and would like a fixed price for: '); a.target = '_blank'; a.rel = 'noopener'; }
    else a.hidden = true;
  });
  $$('[data-ph]').forEach(function (el) { if (/FI-BUSINESS-ID|UDYAM-NO/.test(el.textContent)) el.hidden = true; });

  // ── Price view: India visitors see INR first ──
  var btns = $$('.switch button'), panels = $$('[data-panel]');
  function showCur(cur) {
    btns.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-cur') === cur ? 'true' : 'false'); });
    panels.forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== cur; });
  }
  btns.forEach(function (b) { b.addEventListener('click', function () { showCur(b.getAttribute('data-cur')); }); });
  try { if (/Asia\/(Kolkata|Calcutta)/.test(Intl.DateTimeFormat().resolvedOptions().timeZone)) showCur('in'); } catch (e) {}

  // ── Company details toggle ──
  var hc = $('.hc-toggle'), company = $('#company');
  if (hc) hc.addEventListener('click', function () { var open = company.hidden; company.hidden = !open; hc.setAttribute('aria-expanded', String(open)); });

  // ── Smooth scrolling ──
  var lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ duration: 1.25, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); } });
    (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(0);
  }
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href'); if (id.length < 2) return;
      var el = id === '#main' ? null : $(id);
      if (id !== '#main' && !el) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(el || 0, { offset: -20 });
      else window.scrollTo({ top: el ? el.getBoundingClientRect().top + scrollY - 20 : 0, behavior: reduce ? 'auto' : 'smooth' });
    });
  });

  // ── Reveal on scroll ──
  var rv = $$('.rv');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -8% 0px' });
    rv.forEach(function (el) { io.observe(el); });
  } else rv.forEach(function (el) { el.classList.add('in'); });

  // ── Header: solid after the top, hidden while scrolling down ──
  var header = $('#site-header'), lastY = scrollY;
  function headerCheck() {
    var y = scrollY;
    header.classList.toggle('is-scrolled', y > 30);
    if (y > 200 && y > lastY + 4) header.classList.add('site-header--hidden');
    else if (y < lastY - 4 || y < 200) header.classList.remove('site-header--hidden');
    lastY = y;
  }

  // ════════════════════════ particle field ════════════════════════
  var back = $('.field-back'), front = $('.field-front');
  var cb = back.getContext('2d'), cf = front.getContext('2d');
  var W, H, DPR, parts = [];
  var mouse = { x: -9999, y: -9999 };
  var scene = 'hero', icon = 'sheet', shape = null;   // shape: { name, anchor, pts, dyn }
  var vel = 0, lastScroll = scrollY;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }

  // glow sprites, warm ivory like the text
  function sprite(px, core, rgb) {
    var c = document.createElement('canvas'); c.width = c.height = px;
    var g = c.getContext('2d'), r = px / 2, gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, 'rgba(' + rgb + ',1)'); gr.addColorStop(core, 'rgba(' + rgb + ',.95)');
    gr.addColorStop(Math.min(.95, core * 2.6), 'rgba(' + rgb + ',.22)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, px, px); return c;
  }
  var SPR = { dust: sprite(16, .22, '245,238,220'), mid: sprite(32, .16, '250,240,218'), bokeh: sprite(64, .1, '255,236,206'), red: sprite(32, .3, '214,46,66') };

  // ── shape sources: each returns points normalised to its anchor box (0..1) ──
  var cache = {};
  function sampleCanvas(c, w, h, test, step) {
    var d = c.getContext('2d').getImageData(0, 0, w, h).data, pts = [];
    for (var y = 0; y < h; y += step) for (var x = 0; x < w; x += step) {
      var i = (y * w + x) * 4; if (test(d[i], d[i + 1], d[i + 2], d[i + 3])) pts.push([x / w, y / h]);
    }
    return pts;
  }
  function canvasFor(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d'); g.fillStyle = g.strokeStyle = '#fff'; g.lineCap = g.lineJoin = 'round';
    draw(g, w, h); return c;
  }
  var white = function (r, g, b, a) { return a > 140 && r > 150; };
  var logoImg = new Image(); logoImg.src = '/assets/logo-white.svg';
  var SHAPES = {
    logo: function () {
      if (!logoImg.complete || !logoImg.naturalWidth) return null;
      var w = 900, h = Math.round(900 * 642 / 2400);
      var c = canvasFor(w, h, function (g) { g.drawImage(logoImg, 0, 0, w, h); });
      return sampleCanvas(c, w, h, white, 3);   // white "Kishu" only, so "Studio" stays cut out
    },
    sheet: function () {
      return sampleCanvas(canvasFor(436, 400, function (g) {
        g.lineWidth = 7; var x = 26, y = 60, gw = 384, gh = 280, rh = gh / 7, cw = gw / 4;
        g.strokeRect(x, y, gw, gh); g.fillRect(x, y, gw, rh);
        for (var i = 2; i < 7; i++) { g.beginPath(); g.moveTo(x, y + rh * i); g.lineTo(x + gw, y + rh * i); g.stroke(); }
        for (var j = 1; j < 4; j++) { g.beginPath(); g.moveTo(x + cw * j, y + rh); g.lineTo(x + cw * j, y + gh); g.stroke(); }
        [[0, 2], [2, 3], [1, 4], [3, 5], [0, 6]].forEach(function (p) { g.fillRect(x + cw * p[0] + 14, y + rh * p[1] + 13, cw * .55, 9); });
      }), 436, 400, white, 5);
    },
    flow: function () {
      return sampleCanvas(canvasFor(436, 400, function (g) {
        g.lineWidth = 7; g.beginPath();
        [80, 200, 320].forEach(function (ny) { g.moveTo(60, ny); g.bezierCurveTo(150, ny, 140, 200, 218, 200); });
        g.moveTo(218, 200); g.lineTo(380, 200); g.stroke();
        [[60, 80], [60, 200], [60, 320]].forEach(function (n) { g.beginPath(); g.arc(n[0], n[1], 20, 0, 6.283); g.fill(); });
        g.beginPath(); g.arc(218, 200, 44, 0, 6.283); g.stroke(); g.beginPath(); g.arc(218, 200, 18, 0, 6.283); g.fill();
        g.beginPath(); g.moveTo(380, 172); g.lineTo(410, 200); g.lineTo(380, 228); g.stroke();
      }), 436, 400, white, 5);
    },
    gauge: function () {
      return sampleCanvas(canvasFor(436, 400, function (g) {
        var cx = 218, cy = 250, r = 170; g.lineWidth = 9;
        g.beginPath(); g.arc(cx, cy, r, Math.PI * .82, Math.PI * 2.18); g.stroke(); g.lineWidth = 6;
        for (var t = 0; t <= 20; t++) { var a = Math.PI * (.82 + 1.36 * t / 20), r1 = r * (t % 5 ? .86 : .74), r2 = r * .94; g.beginPath(); g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); g.stroke(); }
        var na = Math.PI * 1.9; g.lineWidth = 8; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(na) * r * .7, cy + Math.sin(na) * r * .7); g.stroke();
        g.beginPath(); g.arc(cx, cy, 18, 0, 6.283); g.fill();
      }), 436, 400, white, 5);
    },
    window: function () {
      return sampleCanvas(canvasFor(436, 400, function (g) {
        g.lineWidth = 7; var x = 26, y = 70, w = 384, h = 262;
        g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, 14); else g.rect(x, y, w, h); g.stroke();
        g.beginPath(); g.moveTo(x, y + 40); g.lineTo(x + w, y + 40); g.stroke();
        [0, 1, 2].forEach(function (i) { g.beginPath(); g.arc(x + 24 + i * 22, y + 20, 6, 0, 6.283); g.fill(); });
        g.strokeRect(x + 26, y + 66, 140, 110);
        for (var k = 0; k < 6; k++) g.fillRect(x + 196, y + 72 + k * 20, k % 2 ? 120 : 160, 7);
        g.fillRect(x + 26, y + 200, 100, 30);
      }), 436, 400, white, 5);
    },
    sign: function () {
      return sampleCanvas(canvasFor(600, 470, function (g) {
        g.font = '300px "Mrs Saint Delafield", cursive'; g.textBaseline = 'alphabetic';
        g.fillText('Yash', 40, 330);
        g.lineWidth = 5; g.beginPath(); g.moveTo(90, 360); g.bezierCurveTo(220, 330, 420, 345, 560, 300); g.stroke();
      }), 600, 470, white, 4);
    },
    cursor: function () {
      return sampleCanvas(canvasFor(260, 290, function (g) {
        g.beginPath(); g.moveTo(20, 10); g.lineTo(20, 230); g.lineTo(75, 182); g.lineTo(118, 270); g.lineTo(150, 255); g.lineTo(108, 170); g.lineTo(180, 165); g.closePath(); g.fill();
      }), 260, 290, white, 5);
    }
  };
  function getShapePoints(name) {
    if (!cache[name]) { var p = SHAPES[name] && SHAPES[name](); if (!p) return null; cache[name] = p; }
    return cache[name];
  }

  // dynamic scenes: points move along a path every frame
  function ringPos(p, now, r) {
    var a = p.u * 6.283 + now * 0.00006 * (p.layer ? 1.4 : 1);
    var rx = r.width * .52 * (1 + p.v * .16), ry = r.height * .44 * (1 + p.v * .2);
    return [r.left + r.width / 2 + Math.cos(a) * rx, r.top + r.height / 2 + Math.sin(a) * ry * (0.9 + 0.1 * Math.sin(a * 3 + now * .0004))];
  }
  function streamPos(p, now, r) {
    var s = (p.u + now * 0.000035) % 1;                       // flows downwards through the grid
    var y = r.top + s * r.height;
    var x = r.left + r.width * (0.5 + 0.08 * Math.sin(s * 14 + 1.2) + 0.04 * Math.sin(s * 37)) + p.v * 26 * (0.5 + 0.5 * Math.sin(s * 9));
    return [x, y];
  }

  // ── which shape belongs to the current scene, and where its anchor is ──
  var anchors = {}; $$('[data-anchor]').forEach(function (el) { anchors[el.getAttribute('data-anchor')] = el; });
  function setScene(next, nextIcon) {
    var name = next === 'hero' ? 'logo' : next === 'crafts' ? nextIcon : next;
    var anchorKey = next === 'hero' ? 'logo' : next;
    if (shape && shape.name === name) return;
    var dyn = name === 'ring' || name === 'stream';
    var pts = dyn ? null : name === 'drift' ? [] : getShapePoints(name);
    if (!dyn && (!pts || !pts.length)) { shape = { name: name, anchor: null, pts: [], dyn: false }; assign(0); return; }
    shape = { name: name, anchor: anchors[anchorKey], pts: pts, dyn: dyn };
    var use = dyn ? Math.round(parts.length * (name === 'stream' ? .42 : .55)) : Math.min(pts.length, Math.round(parts.length * (name === 'logo' ? .9 : .78)));
    assign(use);
  }
  function assign(use) {
    // shuffle so every shape is drawn by particles coming from all over the screen
    for (var i = parts.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0, t = parts[i]; parts[i] = parts[j]; parts[j] = t; }
    var pts = shape && shape.pts && shape.pts.length ? shape.pts : null, stride = pts ? pts.length / Math.max(use, 1) : 0;
    parts.forEach(function (p, k) {
      p.on = k < use;
      if (p.on && pts) { var q = pts[Math.floor(k * stride)]; p.nx = q[0] + rnd(-.002, .002); p.ny = q[1] + rnd(-.002, .002); }
      if (p.on && shape.dyn) { p.u = Math.random(); p.v = gauss(); }
      p.red = false;
    });
    parts[0].red = true;   // one red point, always
  }

  function newPart() {
    var z = Math.random();
    return { x: rnd(0, W), y: rnd(0, H), vx: 0, vy: 0, fx: rnd(0, W), fy: rnd(0, H), z: rnd(.2, 1),
      kind: z > .965 ? 'bokeh' : z > .72 ? 'mid' : 'dust', layer: Math.random() < .14 ? 1 : 0,
      tw: rnd(0, 6.283), sp: rnd(.6, 1.4), on: false, nx: 0, ny: 0, u: 0, v: 0, red: false };
  }
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    [back, front].forEach(function (c) { c.width = W * DPR; c.height = H * DPR; });
    cb.setTransform(DPR, 0, 0, DPR, 0, 0); cf.setTransform(DPR, 0, 0, DPR, 0, 0);
    var want = Math.round(Math.min(2200, Math.max(700, W * H / 620)));
    while (parts.length < want) parts.push(newPart());
    parts.length = want;
    var s = shape; shape = null; if (s) setScene(scene, icon);
  }

  // ── scene tracking ──
  var scenes = $$('[data-scene]'), navLinks = $$('[data-nav]'), metiers = $('.metiers'), metierItems = $$('.metiers-list li');
  function sceneCheck() {
    headerCheck();
    var mid = innerHeight * .5, cur = scene;
    scenes.forEach(function (s) { var r = s.getBoundingClientRect(); if (r.top <= mid && r.bottom > mid) cur = s.getAttribute('data-scene'); });
    if (scrollY < 40) cur = 'hero';
    // crafts: step through the four icons while the section is pinned
    var ic = icon;
    if (metiers) {
      var r = metiers.getBoundingClientRect(), span = r.height - innerHeight;
      var prog = span > 0 ? Math.min(.999, Math.max(0, -r.top / span)) : 0;
      var idx = innerWidth <= 860 ? 0 : Math.floor(prog * metierItems.length);
      metierItems.forEach(function (li, k) { li.classList.toggle('is-active', k === idx); });
      ic = metierItems[idx] ? metierItems[idx].getAttribute('data-icon') : 'sheet';
    }
    navLinks.forEach(function (a) {
      var s = $(a.getAttribute('href')); if (!s) return; var rr = s.getBoundingClientRect();
      a.classList.toggle('is-active', rr.top <= mid && rr.bottom > mid);
    });
    if (cur !== scene || ic !== icon) { scene = cur; icon = ic; setScene(scene, icon); }
    if (reduce) drawStatic();
  }

  // ── render ──
  var running = true, looping = false, last = 0;
  function start() { if (!looping && running && !reduce) { looping = true; requestAnimationFrame(frame); } }
  function target(p, now, r) {
    if (shape.dyn) return shape.name === 'ring' ? ringPos(p, now, r) : streamPos(p, now, r);
    return [r.left + p.nx * r.width, r.top + p.ny * r.height];
  }
  function frame(now) {
    if (!running) { looping = false; return; }
    var dt = Math.min(2, (now - last) / 16.67 || 1); last = now;
    vel = vel * .85 + (scrollY - lastScroll) * .15; lastScroll = scrollY;
    cb.clearRect(0, 0, W, H); cf.clearRect(0, 0, W, H);
    var r = shape && shape.anchor ? shape.anchor.getBoundingClientRect() : null;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], tx, ty;
      if (p.on && r) { var t = target(p, now, r); tx = t[0]; ty = t[1]; }
      else {
        p.fx += Math.sin(now / 5000 * p.sp + i) * .07; p.fy += Math.cos(now / 5600 * p.sp + i) * .07 - vel * p.z * .14;
        if (p.fy < -30) { p.fy += H + 60; p.y += H + 60; } else if (p.fy > H + 30) { p.fy -= H + 60; p.y -= H + 60; }
        if (p.fx < -30) p.fx += W + 60; else if (p.fx > W + 30) p.fx -= W + 60;
        tx = p.fx; ty = p.fy;
      }
      var k = p.on ? (shape && shape.dyn ? .07 : .055) : .03;
      var ax = (tx - p.x) * k, ay = (ty - p.y) * k;
      var dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
      if (d2 < 14000) { var f = (14000 - d2) / 14000 * 2.6, dd = Math.sqrt(d2) || 1; ax += dx / dd * f; ay += dy / dd * f; }
      p.vx = (p.vx + ax * dt) * .82; p.vy = (p.vy + ay * dt) * .82;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y < -40 || p.y > H + 40) continue;
      var tw = .62 + .38 * Math.sin(now / 1000 * p.sp + p.tw), spr, size, a;
      var big = p.on && shape && shape.name === 'logo' ? 1.35 : 1;
      if (p.red) { spr = SPR.red; size = 18; a = 1; }
      else if (p.kind === 'bokeh') { spr = SPR.bokeh; size = p.on ? 22 * big : 10 + 10 * p.z; a = (p.on ? .7 : .2) * tw; }
      else if (p.kind === 'mid') { spr = SPR.mid; size = p.on ? 10 * big : 4 + 3 * p.z; a = (p.on ? .95 : .4) * tw; }
      else { spr = SPR.dust; size = p.on ? 5.5 * big : 2.6 + 2 * p.z; a = (p.on ? 1 : .32 + .3 * p.z) * tw; }
      var ctx = p.layer ? cf : cb;
      ctx.globalAlpha = a; ctx.drawImage(spr, p.x - size / 2, p.y - size / 2, size, size);
    }
    cb.globalAlpha = cf.globalAlpha = 1;
    requestAnimationFrame(frame);
  }
  function drawStatic() {   // reduced motion: particles sit on their shape, no movement
    cb.clearRect(0, 0, W, H); cf.clearRect(0, 0, W, H);
    var r = shape && shape.anchor ? shape.anchor.getBoundingClientRect() : null;
    parts.forEach(function (p) {
      var x, y; if (p.on && r) { var t = target(p, 0, r); x = t[0]; y = t[1]; } else { x = p.fx; y = p.fy; }
      var spr = p.red ? SPR.red : SPR[p.kind], size = p.red ? 18 : p.on ? (p.kind === 'bokeh' ? 20 : p.kind === 'mid' ? 9 : 5) : 3;
      cb.globalAlpha = p.red ? 1 : p.on ? .9 : .3; cb.drawImage(spr, x - size / 2, y - size / 2, size, size);
    });
    cb.globalAlpha = 1;
  }

  window.addEventListener('mousemove', function (e) { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  document.addEventListener('mouseleave', function () { mouse.x = mouse.y = -9999; });
  window.addEventListener('scroll', sceneCheck, { passive: true });
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { resize(); sceneCheck(); }, 150); });
  document.addEventListener('visibilitychange', function () { running = !document.hidden; start(); });

  resize();
  function refreshShapes() { cache = {}; var s = scene; shape = null; setScene(s, icon); if (reduce) drawStatic(); }
  logoImg.onload = refreshShapes;
  if (document.fonts && document.fonts.load) document.fonts.load('300px "Mrs Saint Delafield"').then(function () { delete cache.sign; if (shape && shape.name === 'sign') refreshShapes(); });
  sceneCheck(); setScene(scene, icon);
  start();
})();
