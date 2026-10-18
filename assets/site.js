// Kishu Studio: smooth scrolling, reveals, live clocks, cursor, and the particle field
// that draws the logo and each service as you scroll.
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var header = document.getElementById('top');

  // ── Smooth scrolling (Lenis); native scrolling if the CDN is unavailable ──
  var lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ duration: 1.2, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); } });
    (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(0);
  }
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href'), el = id === '#main' ? null : document.querySelector(id);
      if (id !== '#main' && !el) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(el || 0, { offset: -72 });
      else window.scrollTo({ top: el ? el.getBoundingClientRect().top + window.scrollY - 72 : 0, behavior: reduce ? 'auto' : 'smooth' });
    });
  });

  // ── Headings rise word by word ──
  document.querySelectorAll('[data-split]').forEach(function (h) {
    var parts = h.innerHTML.split(/(<br>|<em>|<\/em>|\s+)/), out = '', i = 0;
    parts.forEach(function (part) {
      if (!part) return;
      if (/^\s+$/.test(part)) { out += ' '; return; }
      if (part === '<br>' || part === '<em>' || part === '</em>') { out += part; return; }
      out += '<span class="w"><span style="transition-delay:' + (i++ * 55) + 'ms">' + part + '</span></span>';
    });
    h.innerHTML = out;
  });

  // ── Reveal on scroll ──
  var rv = document.querySelectorAll('.rv,[data-split]');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    rv.forEach(function (el) { io.observe(el); });
  } else rv.forEach(function (el) { el.classList.add('in'); });

  // ── Live clocks: the studio works on Helsinki and India time ──
  function clock(tz) {
    try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); }
    catch (e) { return ''; }
  }
  function tick() { document.querySelectorAll('[data-tz]').forEach(function (el) { el.textContent = clock(el.getAttribute('data-tz')); }); }
  tick(); setInterval(tick, 15000);

  // ── Custom cursor (mouse and trackpad only) ──
  var cur = document.getElementById('cursor');
  var mx = -100, my = -100, cx = -100, cy = -100;
  if (cur && finePointer && !reduce) {
    document.documentElement.classList.add('has-cursor');
    window.addEventListener('mousemove', function (e) { mx = e.clientX; my = e.clientY; }, { passive: true });
    document.addEventListener('mouseover', function (e) { cur.classList.toggle('is-link', !!e.target.closest('a,button,label,input,textarea')); });
    (function loop() {
      cx += (mx - cx) * 0.22; cy += (my - cy) * 0.22;
      cur.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0)';
      requestAnimationFrame(loop);
    })();
  }

  // ── Particle field ─────────────────────────────────────────────────
  var canvas = document.getElementById('field');
  var ctx = canvas.getContext('2d');
  var W = window.innerWidth, H = window.innerHeight, DPR = 1, N = 0, parts = [];
  var logoImg = new Image(), logoReady = false;
  var ghost = { img: null, x: 0, y: 0, a: 0, target: 0 };   // faint filled shape behind the particles
  var mouse = { x: -9999, y: -9999 };
  var lastScroll = window.scrollY, scrollVel = 0;
  var currentShape = 'logo';

  function rnd(a, b) { return a + Math.random() * (b - a); }

  // Pre-rendered glow sprites: warm white with a soft edge. Drawing images is much cheaper than gradients per frame.
  function sprite(r, core, rgb) {
    var c = document.createElement('canvas'), s = Math.ceil(r * 4);
    c.width = c.height = s;
    var g = c.getContext('2d'), grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(' + rgb + ',1)');
    grd.addColorStop(core, 'rgba(' + rgb + ',0.9)');
    grd.addColorStop(Math.min(core * 2.4, 0.9), 'rgba(' + rgb + ',0.16)');
    grd.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    return c;
  }
  var SPR = {
    dust: sprite(1.4, 0.38, '236,234,228'),
    mid: sprite(3.2, 0.18, '246,238,220'),
    bokeh: sprite(7, 0.08, '255,236,205'),
    red: sprite(5, 0.3, '255,68,51')
  };

  // Draw a shape on an offscreen canvas; return the canvas and its sampled points
  function drawShape(name, bw, bh) {
    var off = document.createElement('canvas'); off.width = bw; off.height = bh;
    var c = off.getContext('2d');
    c.strokeStyle = c.fillStyle = '#fff'; c.lineCap = c.lineJoin = 'round';
    var u = Math.min(bw, bh), lw = Math.max(3, u * 0.02);
    c.lineWidth = lw;
    var cx = bw / 2, cy = bh / 2;
    if (name === 'logo') {
      if (!logoReady) return null;
      var s = Math.min(bw / logoImg.width, bh / logoImg.height), lw2 = logoImg.width * s, lh2 = logoImg.height * s;
      c.drawImage(logoImg, (bw - lw2) / 2, (bh - lh2) / 2, lw2, lh2);
    } else if (name === 'scrape') {            // a spreadsheet: frame, filled header row, grid, a few filled cells
      var x0 = bw * 0.1, y0 = bh * 0.16, gw = bw * 0.8, gh = bh * 0.68, rh = gh / 7, cw = gw / 4;
      c.strokeRect(x0, y0, gw, gh);
      c.fillRect(x0, y0, gw, rh);
      for (var i = 2; i < 7; i++) { c.beginPath(); c.moveTo(x0, y0 + rh * i); c.lineTo(x0 + gw, y0 + rh * i); c.stroke(); }
      for (var j = 1; j < 4; j++) { c.beginPath(); c.moveTo(x0 + cw * j, y0); c.lineTo(x0 + cw * j, y0 + gh); c.stroke(); }
      [[0, 2], [1, 3], [2, 1], [3, 4], [1, 5], [0, 6]].forEach(function (p) { c.fillRect(x0 + cw * p[0] + cw * 0.18, y0 + rh * p[1] + rh * 0.35, cw * 0.5, rh * 0.3); });
    } else if (name === 'automate') {          // three sources wired into one step, then out
      c.beginPath();
      [0.2, 0.5, 0.8].forEach(function (ny) { c.moveTo(bw * 0.16, bh * ny); c.bezierCurveTo(bw * 0.34, bh * ny, bw * 0.32, bh * 0.5, bw * 0.5, bh * 0.5); });
      c.moveTo(bw * 0.5, bh * 0.5); c.lineTo(bw * 0.84, bh * 0.5); c.stroke();
      [[0.16, 0.2, 0.05], [0.16, 0.5, 0.05], [0.16, 0.8, 0.05], [0.84, 0.5, 0.06]].forEach(function (n) { c.beginPath(); c.arc(bw * n[0], bh * n[1], u * n[2], 0, 6.283); c.fill(); });
      c.beginPath(); c.arc(bw * 0.5, bh * 0.5, u * 0.11, 0, 6.283); c.stroke();
      c.beginPath(); c.arc(bw * 0.5, bh * 0.5, u * 0.05, 0, 6.283); c.fill();
    } else if (name === 'speed') {             // a gauge with the needle near the top of the scale
      var r = u * 0.38, gy = cy + r * 0.28;
      c.lineWidth = lw * 1.5;
      c.beginPath(); c.arc(cx, gy, r, Math.PI * 0.82, Math.PI * 2.18); c.stroke();
      c.lineWidth = lw;
      for (var t = 0; t <= 20; t++) {
        var a = Math.PI * (0.82 + 1.36 * t / 20), r1 = r * (t % 5 ? 0.86 : 0.76), r2 = r * 0.93;
        c.beginPath(); c.moveTo(cx + Math.cos(a) * r1, gy + Math.sin(a) * r1); c.lineTo(cx + Math.cos(a) * r2, gy + Math.sin(a) * r2); c.stroke();
      }
      var na = Math.PI * 1.92;
      c.lineWidth = lw * 1.3;
      c.beginPath(); c.moveTo(cx, gy); c.lineTo(cx + Math.cos(na) * r * 0.7, gy + Math.sin(na) * r * 0.7); c.stroke();
      c.beginPath(); c.arc(cx, gy, u * 0.045, 0, 6.283); c.fill();
    } else if (name === 'build') {             // stacked layers
      for (var L = 0; L < 3; L++) {
        var y = bh * (0.3 + L * 0.18), w = bw * 0.36, h = bh * 0.14;
        c.beginPath(); c.moveTo(cx, y - h); c.lineTo(cx + w, y); c.lineTo(cx, y + h); c.lineTo(cx - w, y); c.closePath(); c.stroke();
      }
    } else if (name === 'steps') {             // four points on a line: the method
      c.beginPath(); c.moveTo(bw * 0.1, cy); c.lineTo(bw * 0.9, cy); c.stroke();
      for (var q = 0; q < 4; q++) {
        c.beginPath(); c.arc(bw * (0.1 + q * 0.8 / 3), cy, u * 0.075, 0, 6.283); c.stroke();
        c.beginPath(); c.arc(bw * (0.1 + q * 0.8 / 3), cy, u * 0.03, 0, 6.283); c.fill();
      }
    } else if (name === 'talk') {              // a speech bubble
      var bx = bw * 0.16, by = bh * 0.16, bW = bw * 0.68, bH = bh * 0.5, rr = u * 0.1;
      c.beginPath(); c.moveTo(bx + rr, by); c.arcTo(bx + bW, by, bx + bW, by + bH, rr); c.arcTo(bx + bW, by + bH, bx, by + bH, rr);
      c.lineTo(bx + bW * 0.34, by + bH); c.lineTo(bx + bW * 0.18, by + bH + bh * 0.18); c.lineTo(bx + bW * 0.2, by + bH);
      c.arcTo(bx, by + bH, bx, by, rr); c.arcTo(bx, by, bx + bW, by, rr); c.closePath(); c.stroke();
      for (var d = 0; d < 3; d++) { c.beginPath(); c.arc(bx + bW * (0.3 + d * 0.2), by + bH * 0.5, u * 0.035, 0, 6.283); c.fill(); }
    } else return null;
    var data = c.getImageData(0, 0, bw, bh).data, pts = [], step = Math.max(2, Math.round(u / (name === 'logo' ? 210 : 170)));
    for (var py = 0; py < bh; py += step) for (var px = 0; px < bw; px += step) if (data[(py * bw + px) * 4 + 3] > 110) pts.push([px, py]);
    return { canvas: off, pts: pts };
  }

  // Where a shape sits: the logo between header and hero text; section shapes on the right (desktop) or at the top (mobile)
  function box(name) {
    var wide = W > 960;
    if (name === 'logo') {
      var label = document.querySelector('.hero__label');
      var bottom = label ? label.getBoundingClientRect().top + window.scrollY - 36 : H * 0.5;
      var topY = 104, h = Math.max(90, Math.min(bottom - topY, H * 0.5));
      return { x: W * (wide ? 0.07 : 0.06), y: topY, w: W * (wide ? 0.86 : 0.88), h: h };
    }
    return wide ? { x: W * 0.55, y: H * 0.2, w: W * 0.36, h: H * 0.54 } : { x: W * 0.16, y: H * 0.09, w: W * 0.68, h: H * 0.24 };
  }

  function newPart() {
    var z = Math.random(), kind = z > 0.97 ? 'bokeh' : z > 0.72 ? 'mid' : 'dust';
    var x = rnd(0, W), y = rnd(0, H);
    return { x: x, y: y, tx: x, ty: y, vx: 0, vy: 0, z: rnd(0.2, 1), kind: kind, tw: rnd(0, 6.283), sp: rnd(0.6, 1.4), free: true, red: false };
  }
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var want = Math.round(Math.min(2000, Math.max(700, W * H / 700)));
    while (parts.length < want) parts.push(newPart());
    parts.length = want; N = want;
    morph(currentShape, true);
  }

  function morph(name, instant) {
    instant = instant || reduce;
    if (W <= 960 && name !== 'logo') name = 'scatter';   // narrow screens: text needs the room, only the logo is drawn
    var b = box(name), shape = name === 'scatter' ? null : drawShape(name, Math.round(b.w), Math.round(b.h));
    var pts = shape ? shape.pts : [];
    ghost.target = shape ? (name === 'logo' ? 0.07 : 0.045) : 0;
    if (shape) { ghost.img = shape.canvas; ghost.x = b.x; ghost.y = b.y; if (instant) ghost.a = ghost.target; }
    for (var i = parts.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0, t = parts[i]; parts[i] = parts[j]; parts[j] = t; }
    var use = Math.min(pts.length, Math.round(N * 0.8)), stride = pts.length / Math.max(use, 1);
    // keep the background sparse: only a few hundred free particles are visible, the rest rest unseen
    var freeMax = Math.round(W * H / (W > 960 ? 3600 : 2600)), freeSeen = 0;
    parts.forEach(function (p, k) {
      if (k < use) { var q = pts[Math.floor(k * stride)]; p.tx = b.x + q[0] + rnd(-0.8, 0.8); p.ty = b.y + q[1] + rnd(-0.8, 0.8); p.free = false; p.off = false; }
      else { p.tx = rnd(0, W); p.ty = rnd(0, H); p.free = true; p.off = ++freeSeen > freeMax; }
      p.red = false;
      if (instant) { p.x = p.tx; p.y = p.ty; }
    });
    parts[0].red = true; // one red point, always
    if (reduce) drawStatic();
  }

  var running = true, looping = false, last = 0;
  function start() { if (!looping && running && !reduce) { looping = true; requestAnimationFrame(frame); } }
  function frame(now) {
    if (!running) { looping = false; return; }
    var dt = Math.min(2, (now - last) / 16.67 || 1); last = now;
    var sy = window.scrollY; scrollVel = scrollVel * 0.85 + (sy - lastScroll) * 0.15; lastScroll = sy;
    ctx.clearRect(0, 0, W, H);

    ghost.a += (ghost.target - ghost.a) * 0.05;
    if (ghost.img && ghost.a > 0.003) { ctx.globalAlpha = ghost.a; ctx.drawImage(ghost.img, ghost.x, ghost.y); }

    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.free) {
        // slow drift, plus depth parallax against the scroll
        p.tx += Math.sin(now / 4000 * p.sp + i) * 0.06; p.ty += Math.cos(now / 4600 * p.sp + i) * 0.06 - scrollVel * p.z * 0.12;
        if (p.ty < -20) { p.ty += H + 40; p.y += H + 40; } else if (p.ty > H + 20) { p.ty -= H + 40; p.y -= H + 40; }
      }
      var k = p.free ? 0.03 : 0.05;
      var ax = (p.tx - p.x) * k, ay = (p.ty - p.y) * k;
      var dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
      if (d2 < 12000) { var f = (12000 - d2) / 12000 * 2.4, dd = Math.sqrt(d2) || 1; ax += dx / dd * f; ay += dy / dd * f; }
      p.vx = (p.vx + ax * dt) * 0.83; p.vy = (p.vy + ay * dt) * 0.83;
      p.x += p.vx * dt; p.y += p.vy * dt;

      if (p.off) continue;
      var tw = 0.6 + 0.4 * Math.sin(now / 1100 * p.sp + p.tw), spr, size, a;
      if (p.red) { spr = SPR.red; size = 12; a = 1; }
      else if (p.kind === 'bokeh') { spr = SPR.bokeh; size = p.free ? 10 * p.z + 6 : 13; a = (p.free ? 0.22 : 0.5) * tw; }
      else if (p.kind === 'mid') { spr = SPR.mid; size = p.free ? 4 + 2 * p.z : 6.5; a = (p.free ? 0.35 : 0.85) * tw; }
      else { spr = SPR.dust; size = p.free ? 1.6 + 1.2 * p.z : 3; a = (p.free ? 0.3 + 0.3 * p.z : 0.9) * tw; }
      ctx.globalAlpha = a;
      ctx.drawImage(spr, p.x - size / 2, p.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }
  function drawStatic() {  // reduced motion: one still frame per shape
    ctx.clearRect(0, 0, W, H);
    if (ghost.img) { ctx.globalAlpha = ghost.target; ctx.drawImage(ghost.img, ghost.x, ghost.y); }
    parts.forEach(function (p) {
      if (p.off) return;
      var spr = p.red ? SPR.red : SPR[p.kind], size = p.red ? 12 : p.kind === 'bokeh' ? 12 : p.kind === 'mid' ? 6 : 3;
      ctx.globalAlpha = p.red ? 1 : p.free ? 0.3 : 0.85; ctx.drawImage(spr, p.x - size / 2, p.y - size / 2, size, size);
    });
    ctx.globalAlpha = 1;
  }

  // ── Header, nav, services caption and shapes follow what sits in the middle of the screen ──
  var navLinks = document.querySelectorAll('[data-nav]');
  var svcItems = document.querySelectorAll('.svc__item');
  var svcCap = document.getElementById('svc-cap');
  var shapeEls = document.querySelectorAll('[data-shape]');
  function middleCheck() {
    header.classList.toggle('is-solid', window.scrollY > 40);
    var mid = window.innerHeight * 0.5, shape = null, best = Infinity;
    shapeEls.forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid && r.height < best) { best = r.height; shape = el.getAttribute('data-shape'); }
    });
    svcItems.forEach(function (el, k) {
      var r = el.getBoundingClientRect(), on = r.top <= mid && r.bottom >= mid;
      el.classList.toggle('is-on', on);
      if (on && svcCap) svcCap.innerHTML = '<b>' + String(k + 1).padStart(2, '0') + '</b> / ' + String(svcItems.length).padStart(2, '0') + '&nbsp;&nbsp;' + el.getAttribute('data-name');
    });
    navLinks.forEach(function (a) {
      var s = document.querySelector(a.getAttribute('href')); if (!s) return;
      var r = s.getBoundingClientRect();
      a.classList.toggle('is-on', r.top <= mid && r.bottom >= mid);
    });
    if (shape && shape !== currentShape) { currentShape = shape; morph(shape); }
  }

  window.addEventListener('mousemove', function (e) { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  document.addEventListener('mouseleave', function () { mouse.x = mouse.y = -9999; });
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { resize(); middleCheck(); }, 150); });
  document.addEventListener('visibilitychange', function () { running = !document.hidden; start(); });
  window.addEventListener('scroll', middleCheck, { passive: true });

  logoImg.onload = function () { logoReady = true; if (currentShape === 'logo') morph('logo'); };
  logoImg.src = '/assets/logo-light.webp';
  resize();
  if (!reduce) { parts.forEach(function (p) { p.x = rnd(0, W); p.y = rnd(0, H); }); start(); }
  // fonts change the hero layout; place the logo again once they are in
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (currentShape === 'logo') morph('logo'); });
  middleCheck();
})();
