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

  // Particle sprites: crisp ink dots rendered at device resolution. Near particles are sharp,
  // far ones are softer (shallow depth of field). Sizes are in CSS px.
  var INK = '17,18,22';
  function dotSprite(px, soft, rgb) {
    var s = Math.ceil(px * 2 * Math.min(devicePixelRatio || 1, 2)) + 4, c = document.createElement('canvas'); c.width = c.height = s;
    var g = c.getContext('2d'), r = s / 2, gr = g.createRadialGradient(r, r, 0, r, r, r - 1);
    var edge = 1 - soft;
    gr.addColorStop(0, 'rgba(' + rgb + ',1)'); gr.addColorStop(Math.max(.05, edge * .55), 'rgba(' + rgb + ',1)');
    gr.addColorStop(Math.min(.98, edge * .55 + .04 + soft * .5), 'rgba(' + rgb + ',' + (soft > .5 ? .35 : .9) + ')');
    gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s); return c;
  }
  var SPR;
  function buildSprites() {
    SPR = { sharp: dotSprite(6, .12, INK), mid: dotSprite(6, .45, INK), soft: dotSprite(10, .9, INK), red: dotSprite(6, .15, '197,40,61') };
  }
  buildSprites();

  // 2D simplex noise (Gustavson), used for the flow field the free particles drift on
  var perm = new Uint8Array(512), grad = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  (function () { var p = []; for (var i = 0; i < 256; i++) p[i] = i; for (i = 255; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0, t = p[i]; p[i] = p[j]; p[j] = t; } for (i = 0; i < 512; i++) perm[i] = p[i & 255]; })();
  function noise2(x, y) {
    var F2 = .3660254, G2 = .2113249, s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s), t = (i + j) * G2;
    var x0 = x - (i - t), y0 = y - (j - t), i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    var x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2, ii = i & 255, jj = j & 255, n = 0;
    var t0 = .5 - x0 * x0 - y0 * y0; if (t0 > 0) { var g0 = grad[perm[ii + perm[jj]] & 7]; t0 *= t0; n += t0 * t0 * (g0[0] * x0 + g0[1] * y0); }
    var t1 = .5 - x1 * x1 - y1 * y1; if (t1 > 0) { var g1 = grad[perm[ii + i1 + perm[jj + j1]] & 7]; t1 *= t1; n += t1 * t1 * (g1[0] * x1 + g1[1] * y1); }
    var t2 = .5 - x2 * x2 - y2 * y2; if (t2 > 0) { var g2 = grad[perm[ii + 1 + perm[jj + 1]] & 7]; t2 *= t2; n += t2 * t2 * (g2[0] * x2 + g2[1] * y2); }
    return 70 * n;
  }

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
  var dark = function (r, g, b, a) { return a > 140 && r < 110; };
  var logoImg = new Image(); logoImg.src = '/assets/logo-black.svg';
  var SHAPES = {
    logo: function () {
      if (!logoImg.complete || !logoImg.naturalWidth) return null;
      var w = 900, h = Math.round(900 * 642 / 2400);
      var c = canvasFor(w, h, function (g) { g.drawImage(logoImg, 0, 0, w, h); });
      return sampleCanvas(c, w, h, dark, 3);   // the black "Kishu" only, so "Studio" stays cut out
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
      if (p.on && pts) { var q = pts[Math.floor(k * stride)]; p.nx = q[0] + rnd(-.0015, .0015); p.ny = q[1] + rnd(-.0015, .0015); }
      p.delay = now0() + (p.on ? rnd(0, 650) : 0);   // particles leave one after another, not all at once
      if (p.on && shape.dyn) { p.u = Math.random(); p.v = gauss(); }
      p.red = false;
    });
    parts[0].red = true;   // one red point, always
  }

  function now0() { return performance.now(); }
  function newPart() {
    var z = Math.random();
    return { x: rnd(0, W), y: rnd(0, H), vx: 0, vy: 0, fx: rnd(0, W), fy: rnd(0, H), z: rnd(.2, 1),
      kind: z > .93 ? 'soft' : z > .6 ? 'mid' : 'sharp', layer: Math.random() < .05 ? 1 : 0, delay: 0, ph: rnd(0, 1000),
      tw: rnd(0, 6.283), sp: rnd(.6, 1.4), on: false, nx: 0, ny: 0, u: 0, v: 0, red: false };
  }
  function resize() {
    DPR = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; buildSprites();
    [back, front].forEach(function (c) { c.width = W * DPR; c.height = H * DPR; });
    cb.setTransform(DPR, 0, 0, DPR, 0, 0); cf.setTransform(DPR, 0, 0, DPR, 0, 0);
    var want = Math.round(Math.min(2400, Math.max(800, W * H / 560)));
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
  var running = true, looping = false, last = 0, ghostA = 0;
  function start() { if (!looping && running && !reduce) { looping = true; requestAnimationFrame(frame); } }
  function target(p, now, r) {
    if (shape.dyn) return shape.name === 'ring' ? ringPos(p, now, r) : streamPos(p, now, r);
    return [r.left + p.nx * r.width, r.top + p.ny * r.height];
  }
  function frame(now) {
    if (!running) { looping = false; return; }
    var dt = Math.min(2.2, (now - last) / 16.67 || 1); last = now;
    vel = vel * .88 + (scrollY - lastScroll) * .12; lastScroll = scrollY;
    cb.clearRect(0, 0, W, H); cf.clearRect(0, 0, W, H);
    var r = shape && shape.anchor ? shape.anchor.getBoundingClientRect() : null;
    var tt = now * .00005;
    if (shape && shape.name === 'logo' && r && logoImg.naturalWidth) {   // a faint solid logo behind the particles, for legibility
      ghostA += (.075 - ghostA) * .04; cb.globalAlpha = ghostA; cb.drawImage(logoImg, r.left, r.top, r.width, r.height); cb.globalAlpha = 1;
    } else ghostA *= .9;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], ax, ay;
      if (p.on && r && now >= p.delay) {
        // spring towards the shape, then a slow breathing offset from the noise field
        var t = target(p, now, r);
        var br = shape.dyn ? 0 : 1.6;
        var tx = t[0] + noise2(p.ph, tt * 6) * br, ty = t[1] + noise2(p.ph + 50, tt * 6) * br;
        ax = (tx - p.x) * .045; ay = (ty - p.y) * .045;
        p.vx = (p.vx + ax * dt) * .84; p.vy = (p.vy + ay * dt) * .84;
      } else {
        // free: drift on a flowing current (curl of the noise field), slower for far particles
        var sc = .0018, e = .6, nx = p.x * sc, ny = p.y * sc;
        var cx = noise2(nx, ny + e + tt) - noise2(nx, ny - e + tt), cy = noise2(nx - e + tt, ny) - noise2(nx + e + tt, ny);
        var sp = .55 * (.35 + p.z);
        p.vx += (cy * sp - p.vx) * .04 * dt; p.vy += (-cx * sp - p.vy) * .04 * dt;
        p.vy -= vel * p.z * .02;   // depth parallax against the scroll
      }
      // the pointer parts the field like a hand through water
      var dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
      if (d2 < 16000) { var f = (1 - d2 / 16000), dd = Math.sqrt(d2) || 1; f = f * f * 1.6; p.vx += dx / dd * f * dt; p.vy += dy / dd * f * dt; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (!p.on) { if (p.y < -20) p.y += H + 40; else if (p.y > H + 20) p.y -= H + 40; if (p.x < -20) p.x += W + 40; else if (p.x > W + 20) p.x -= W + 40; }
      if (p.y < -30 || p.y > H + 30) continue;
      if (!p.on && !p.red && (i % 3)) continue;   // only a third of the free particles are drawn: a light, clean field

      var spr, size, a;
      if (p.red) { spr = SPR.red; size = 7; a = 1; }
      else if (p.on) {
        spr = p.kind === 'soft' ? SPR.mid : SPR.sharp;
        var lg = shape && shape.name === 'logo' ? 1.25 : 1;
        size = (p.kind === 'soft' ? 4.8 : p.kind === 'mid' ? 3.4 : 2.6) * lg;
        a = p.kind === 'soft' ? .6 : .95;
      } else {
        spr = p.kind === 'soft' ? SPR.soft : p.kind === 'mid' ? SPR.mid : SPR.sharp;
        size = p.kind === 'soft' ? 7 + 6 * p.z : 1.4 + 1.6 * p.z;
        a = p.kind === 'soft' ? .035 : .12 + .22 * p.z;
      }
      var ctx = p.layer ? cf : cb;
      ctx.globalAlpha = p.layer ? a * .6 : a;
      ctx.drawImage(spr, p.x - size / 2, p.y - size / 2, size, size);
    }
    cb.globalAlpha = cf.globalAlpha = 1;
    requestAnimationFrame(frame);
  }
  function drawStatic() {   // reduced motion: particles sit on their shape, no movement
    cb.clearRect(0, 0, W, H); cf.clearRect(0, 0, W, H);
    var r = shape && shape.anchor ? shape.anchor.getBoundingClientRect() : null;
    parts.forEach(function (p) {
      var x, y; if (p.on && r) { var t = target(p, 0, r); x = t[0]; y = t[1]; } else { x = p.fx; y = p.fy; }
      var spr = p.red ? SPR.red : p.on ? SPR.sharp : SPR.mid, size = p.red ? 7 : p.on ? 2.6 : 2;
      cb.globalAlpha = p.red ? 1 : p.on ? .9 : .2; cb.drawImage(spr, x - size / 2, y - size / 2, size, size);
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
