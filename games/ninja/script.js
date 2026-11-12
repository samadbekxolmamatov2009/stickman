(() => {
  'use strict';
  const { rand, randi, clamp, choice, hash, sfx, FX, Char, poses, label, rr, $ } = SG;

  const H = 540, GRAV = 880;
  let W = 960;
  SG.initView($('game'), () => { W = SG.view.W; });
  const fx = new FX();
  const ninja = new Char({ color: '#ff5d5d' });

  const FRUITS = [
    { name: 'melon', r: 40, rind: '#2f8a3c', rind2: '#1f6a2c', flesh: '#ff5d6a', juice: '#ff5d6a', seeds: true },
    { name: 'orange', r: 30, rind: '#ff9a2e', rind2: '#e07a12', flesh: '#ffc46b', juice: '#ffb347' },
    { name: 'apple', r: 28, rind: '#e23a3a', rind2: '#b82424', flesh: '#fff3d6', juice: '#ffe9b0' },
    { name: 'plum', r: 24, rind: '#8a4fd6', rind2: '#6a35b0', flesh: '#f0c2ff', juice: '#c77dff' },
    { name: 'coconut', r: 31, rind: '#7a5636', rind2: '#5a3d26', flesh: '#ffffff', juice: '#f4f7fc' },
    { name: 'lime', r: 25, rind: '#8fd43a', rind2: '#6fb022', flesh: '#e6ffb0', juice: '#c8f56a' },
  ];
  const SPECIAL = {
    gold: { name: 'gold', r: 30, rind: '#ffd34d', rind2: '#e0a400', flesh: '#fff7c2', juice: '#ffd34d' },
    ice: { name: 'ice', r: 30, rind: '#7fd8ff', rind2: '#4aa8e0', flesh: '#e9f9ff', juice: '#bfe6ff' },
  };

  let mode = 'classic';
  SG.seg('mode-seg', v => { mode = v; });
  let state = 'menu', items = [], halves = [], stains = [], trail = [], score = 0, lives = 3, timeLeft = 60, elapsed = 0;
  let waveT = 0, queue = [], comboN = 0, comboT = 0, comboX = 0, comboY = 0, slowT = 0, flash = 0, slashT = 0, cheerT = 0, misses = [];
  const bestKey = () => `ninja_best_${mode}`;

  function start() {
    SG.audioUnlock();
    state = 'play'; items = []; halves = []; stains = []; trail = []; queue = []; misses = [];
    score = 0; lives = 3; timeLeft = 60; elapsed = 0; waveT = 0.8; comboN = 0; slowT = 0; flash = 0;
    SG.time.scale = 1;
    SG.show('start-screen', false); SG.show('results-screen', false);
  }

  function launch(kind) {
    const x = rand(W * 0.14, W * 0.86);
    const def = kind === 'bomb' ? { name: 'bomb', r: 29 } : kind === 'fruit' ? choice(FRUITS) : SPECIAL[kind];
    items.push({
      def, x, y: H + 50, vx: (W / 2 - x) * rand(0.25, 0.75) + rand(-60, 60), vy: -rand(760, 910),
      rot: rand(0, 6), vr: rand(-4, 4), bomb: kind === 'bomb',
    });
    sfx.whoosh();
  }

  function planWave() {
    const lvl = Math.min(8, Math.floor(elapsed / 9));
    const n = randi(1, Math.min(6, 2 + Math.floor(lvl / 1.5)));
    const together = Math.random() < 0.45;
    for (let i = 0; i < n; i++) queue.push({ t: together ? rand(0, 0.12) : i * rand(0.18, 0.34), kind: 'fruit' });
    if (Math.random() < 0.16 + lvl * 0.035) queue.push({ t: rand(0, 0.5), kind: 'bomb' });
    if (lvl >= 5 && Math.random() < 0.3) queue.push({ t: rand(0.2, 0.6), kind: 'bomb' });
    if (Math.random() < 0.1) queue.push({ t: rand(0, 0.4), kind: Math.random() < 0.55 ? 'gold' : 'ice' });
    waveT = Math.max(0.9, 2.2 - lvl * 0.14) + (together ? 0.3 : n * 0.2);
  }

  function slice(it, ang, px, py) {
    it.dead = true;
    slashT = 0.18;
    if (it.bomb) {
      fx.burst(it.x, it.y, 46, { color: '#ffb347', speedMin: 100, speedMax: 620, lifeMin: 0.4, lifeMax: 1 });
      fx.burst(it.x, it.y, 20, { color: '#3a3f4f', speedMin: 60, speedMax: 320, rMin: 5, rMax: 11, gravity: -40, drag: 2.5 });
      fx.ring(it.x, it.y, '#ffffff', 220, 0.5, 10);
      fx.shake(22); sfx.explode(); SG.buzz(200); flash = 1;
      if (mode === 'classic') { lives--; misses.push({ x: it.x, t: 1.2 }); items.forEach(o => { if (!o.bomb) o.dead = true; }); if (lives <= 0) return end(); }
      else { score = Math.max(0, score - 10); fx.text(it.x, it.y - 40, '-10', '#ff5d5d', 30); }
      comboN = 0;
      return;
    }
    const d = it.def;
    let pts = 1;
    if (d.name === 'gold') { pts = 8; fx.text(it.x, it.y - 46, '+8 ⭐', '#ffd34d', 28); sfx.perfect(); fx.ring(it.x, it.y, '#ffd34d', 110, 0.4, 6); }
    else if (d.name === 'ice') { slowT = 3.6; fx.text(it.x, it.y - 46, 'MUZLADI!', '#bfe6ff', 24); sfx.power(); fx.ring(it.x, it.y, '#bfe6ff', 140, 0.5, 6); }
    else if (Math.random() < 0.08) { pts = 5; fx.text(it.x, it.y - 46, 'KRITIK +5', '#ff8a5d', 22); }
    score += pts;
    comboN++; comboT = 0.28; comboX = it.x; comboY = it.y;
    const nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
    for (const s of [-1, 1]) {
      halves.push({ def: d, x: it.x, y: it.y, vx: it.vx * 0.6 + nx * s * rand(90, 170), vy: it.vy * 0.5 + ny * s * rand(90, 170) - 60, rot: ang, vr: s * rand(2, 6), side: s, t: 0 });
    }
    fx.burst(it.x, it.y, 16, { color: d.juice, speedMin: 80, speedMax: 380, angle: ang, spread: 1.2, rMin: 3, rMax: 7, lifeMin: 0.3, lifeMax: 0.8 });
    fx.burst(it.x, it.y, 8, { color: '#ffffff', spark: true, speedMin: 200, speedMax: 520, angle: ang, spread: 0.3 });
    stains.push({ x: it.x, y: it.y, c: d.juice, r: d.r * rand(1.1, 1.7), t: 0, seed: Math.random() * 99 });
    if (stains.length > 14) stains.shift();
    sfx.hit(); SG.buzz(12);
  }

  function end() {
    state = 'over'; SG.time.scale = 1;
    const best = SG.best(bestKey(), score);
    $('winner-text').textContent = score >= best && score > 0 ? '🏆 Yangi rekord!' : (mode === 'arcade' ? 'Vaqt tugadi!' : 'Tamom!');
    $('final-score').innerHTML = `Ball: <b>${score}</b> &nbsp; Rekord: <b>${best}</b>`;
    score >= best && score > 0 ? sfx.win() : sfx.lose();
    setTimeout(() => SG.show('results-screen', true), 700);
  }

  function update(dt) {
    fx.update(dt);
    flash = Math.max(0, flash - dt * 2.5);
    const real = dt / (SG.time.scale || 1);
    for (const p of trail) p.age += real;
    trail = trail.filter(p => p.age < 0.22);
    slashT -= real; cheerT -= real;
    const t = SG.time.t;
    ninja.to(slashT > 0 ? poses.slash(1) : cheerT > 0 ? poses.cheer(t) : poses.guard(t), real, 20);
    for (const s of stains) s.t += real;
    stains = stains.filter(s => s.t < 5);
    for (const h of halves) { h.t += dt; h.vy += GRAV * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.vr * dt; }
    halves = halves.filter(h => h.y < H + 100);
    for (const m of misses) m.t -= real;
    misses = misses.filter(m => m.t > 0);
    if (state !== 'play') return;

    elapsed += real;
    if (slowT > 0) { slowT -= real; SG.time.scale = slowT > 0 ? 0.42 : 1; }
    if (mode === 'arcade') { timeLeft -= real; if (timeLeft <= 0) return end(); }

    waveT -= dt;
    if (waveT <= 0 && !queue.length) planWave();
    for (const q of queue) { q.t -= dt; if (q.t <= 0) { launch(q.kind); q.done = true; } }
    queue = queue.filter(q => !q.done);

    for (const it of items) {
      it.vy += GRAV * dt; it.x += it.vx * dt; it.y += it.vy * dt; it.rot += it.vr * dt;
      if (it.bomb && Math.random() < 0.5) fx.burst(it.x + Math.cos(it.rot - 1.2) * 30, it.y + Math.sin(it.rot - 1.2) * 30, 1, { color: choice(['#ffd34d', '#ff9a3d']), spark: true, speedMin: 30, speedMax: 120, lifeMin: 0.15, lifeMax: 0.3 });
      if (it.y > H + 70 && it.vy > 0 && !it.dead) {
        it.dead = true;
        if (!it.bomb && it.def.name !== 'gold' && it.def.name !== 'ice' && mode === 'classic') {
          lives--; misses.push({ x: clamp(it.x, 40, W - 40), t: 1.2 }); sfx.error(); SG.buzz(60);
          if (lives <= 0) return end();
        }
      }
    }
    items = items.filter(it => !it.dead);

    if (comboN > 0) {
      comboT -= real;
      if (comboT <= 0) {
        if (comboN >= 3) {
          score += comboN;
          fx.text(comboX, comboY - 70, `KOMBO x${comboN}  +${comboN}`, '#ffd34d', 30);
          sfx.perfect(); cheerT = 0.9; fx.shake(5);
        }
        comboN = 0;
      }
    }
  }

  // ---------- input ----------
  const canvas = $('game');
  const ptrs = new Map();
  function moveTo(id, p) {
    const last = ptrs.get(id);
    ptrs.set(id, p);
    trail.push({ x: p.x, y: p.y, age: 0, id, brk: !last });
    if (!last || state !== 'play') return;
    const dx = p.x - last.x, dy = p.y - last.y, len = Math.hypot(dx, dy);
    if (len < 3) return;
    const ang = Math.atan2(dy, dx);
    for (const it of items) {
      if (it.dead) continue;
      // distance from the item centre to this swipe segment
      const tt = clamp(((it.x - last.x) * dx + (it.y - last.y) * dy) / (len * len), 0, 1);
      const cx = last.x + dx * tt, cy = last.y + dy * tt;
      if (Math.hypot(it.x - cx, it.y - cy) < it.def.r + 6) slice(it, ang, cx, cy);
    }
  }
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); ptrs.delete(e.pointerId); moveTo(e.pointerId, SG.toLocal(e)); });
  canvas.addEventListener('pointermove', e => { if (ptrs.has(e.pointerId)) moveTo(e.pointerId, SG.toLocal(e)); });
  const up = e => ptrs.delete(e.pointerId);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  // ---------- draw ----------
  function drawDojo(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3b2a20'); g.addColorStop(1, '#22160f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < W / 78 + 1; i++) {
      ctx.fillStyle = `rgba(255,220,170,${0.02 + hash(i * 3.3) * 0.05})`;
      ctx.fillRect(i * 78, 0, 74, H);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(i * 78 + 74, 0, 4, H);
    }
    // round window with a night sky
    const cx = W / 2, cy = 215, R = 150;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    const sg = ctx.createLinearGradient(0, cy - R, 0, cy + R);
    sg.addColorStop(0, '#0d1433'); sg.addColorStop(1, '#3a4c8f');
    ctx.fillStyle = sg; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.fillStyle = '#f4f1dc'; ctx.beginPath(); ctx.arc(cx + 40, cy - 40, 44, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(180,190,215,0.5)'; ctx.beginPath(); ctx.arc(cx + 28, cy - 50, 9, 0, Math.PI * 2); ctx.arc(cx + 56, cy - 26, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0b1022'; ctx.lineCap = 'round';
    for (let k = 0; k < 5; k++) {
      const bx = cx - R + 30 + k * 34 + hash(k) * 20, sway = Math.sin(SG.time.t * 0.8 + k) * 6;
      ctx.lineWidth = 7 - k % 2 * 2;
      ctx.beginPath(); ctx.moveTo(bx, cy + R); ctx.quadraticCurveTo(bx + sway * 0.5, cy, bx + sway + (k - 2) * 10, cy - R + 30 + hash(k * 3) * 60); ctx.stroke();
    }
    ctx.restore();
    ctx.lineWidth = 12; ctx.strokeStyle = '#1a100a'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = '#6b4a30'; ctx.beginPath(); ctx.arc(cx, cy, R - 7, 0, Math.PI * 2); ctx.stroke();
    // lanterns
    [0.14, 0.86].forEach((fx0, i) => {
      const lx = W * fx0 + Math.sin(SG.time.t * 1.3 + i * 2) * 5, ly = 96;
      ctx.strokeStyle = '#1a100a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(W * fx0, 0); ctx.lineTo(lx, ly - 30); ctx.stroke();
      const gl = ctx.createRadialGradient(lx, ly, 6, lx, ly, 120);
      gl.addColorStop(0, 'rgba(255,170,80,0.45)'); gl.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(lx, ly, 120, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e2452e'; ctx.beginPath(); ctx.ellipse(lx, ly, 24, 30, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.ellipse(lx, ly, 12, 22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a100a'; ctx.fillRect(lx - 14, ly - 34, 28, 7); ctx.fillRect(lx - 14, ly + 27, 28, 7);
    });
    ctx.fillStyle = '#170f0a'; ctx.fillRect(0, H - 34, W, 34);
    ctx.fillStyle = '#4a3322'; ctx.fillRect(0, H - 38, W, 6);
  }

  function fruitBody(ctx, d, r) {
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
    g.addColorStop(0, SG.mix(d.rind, '#ffffff', 0.35)); g.addColorStop(0.6, d.rind); g.addColorStop(1, d.rind2);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(20,14,10,0.75)'; ctx.stroke();
    if (d.name === 'melon') { ctx.strokeStyle = d.rind2; ctx.lineWidth = 4; for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.ellipse(0, 0, Math.abs(k) * r * 0.42 + 1, r * 0.94, 0, 0, Math.PI * 2); ctx.stroke(); } }
    if (d.name === 'gold') label(ctx, '⭐', 0, r * 0.35, r, '#fff', 'center', false);
    if (d.name === 'ice') label(ctx, '❄', 0, r * 0.36, r, '#fff', 'center', false);
    if (d.name === 'apple' || d.name === 'plum' || d.name === 'lime') {
      ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(4, -r - 9); ctx.stroke();
      ctx.fillStyle = '#4fae4a'; ctx.beginPath(); ctx.ellipse(11, -r - 7, 8, 4, -0.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.4, r * 0.28, r * 0.16, -0.6, 0, Math.PI * 2); ctx.fill();
  }

  function drawItem(ctx, it) {
    ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.rot);
    if (it.bomb) {
      const r = it.def.r;
      const g = ctx.createRadialGradient(-8, -9, 3, 0, 0, r);
      g.addColorStop(0, '#5a6278'); g.addColorStop(1, '#12151f');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#ff5d5d'; ctx.stroke();
      ctx.fillStyle = '#2a2f3d'; ctx.fillRect(-7, -r - 8, 14, 10);
      ctx.strokeStyle = '#c9a36a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -r - 8); ctx.quadraticCurveTo(10, -r - 20, 8, -r - 2 - 26); ctx.stroke();
      label(ctx, '☠', 0, 9, 24, '#ff7a6b', 'center', false);
    } else fruitBody(ctx, it.def, it.def.r);
    ctx.restore();
  }

  function drawHalf(ctx, h) {
    const d = h.def, r = d.r;
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.rot);
    ctx.globalAlpha = clamp(1.6 - h.t, 0, 1);
    ctx.save();
    ctx.beginPath(); ctx.rect(-r - 4, h.side > 0 ? 0 : -r - 4, r * 2 + 8, r + 4); ctx.clip();
    fruitBody(ctx, d, r);
    ctx.restore();
    // flesh face along the cut
    ctx.fillStyle = d.flesh; ctx.beginPath(); ctx.ellipse(0, 0, r - 2, r * 0.26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = d.rind2; ctx.stroke();
    if (d.seeds) { ctx.fillStyle = '#2a1a12'; for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.ellipse(k * r * 0.3, 0, 2.2, 3.4, 0, 0, Math.PI * 2); ctx.fill(); } }
    ctx.restore();
  }

  function draw(ctx) {
    ctx.save();
    fx.applyShake(ctx);
    drawDojo(ctx);
    for (const s of stains) {
      ctx.globalAlpha = clamp(1 - s.t / 5, 0, 1) * 0.5;
      ctx.fillStyle = s.c;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 0.6, 0, Math.PI * 2);
      for (let k = 0; k < 7; k++) { const a = hash(s.seed + k) * 6.28, dd = s.r * (0.5 + hash(s.seed + k * 3) * 0.7); ctx.moveTo(s.x + Math.cos(a) * dd, s.y + Math.sin(a) * dd); ctx.arc(s.x + Math.cos(a) * dd, s.y + Math.sin(a) * dd + s.t * 3, s.r * (0.12 + hash(s.seed + k * 7) * 0.2), 0, Math.PI * 2); }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ninja.draw(ctx, 74, H - 36, { scale: 0.95, weapon: 'sword', mood: cheerT > 0 ? 'happy' : 'normal' });
    halves.forEach(h => drawHalf(ctx, h));
    items.forEach(it => drawItem(ctx, it));
    fx.draw(ctx);
    // blade trail
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1], b = trail[i];
        if (b.brk || a.id !== b.id) continue;
        const k = 1 - b.age / 0.22;
        ctx.strokeStyle = pass === 0 ? `rgba(120,220,255,${0.45 * k})` : `rgba(255,255,255,${0.95 * k})`;
        ctx.lineWidth = (pass === 0 ? 20 : 7) * k;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    for (const m of misses) label(ctx, '✖', m.x, H - 60 - (1.2 - m.t) * 30, 44, `rgba(255,93,93,${clamp(m.t, 0, 1)})`, 'center', false);
    ctx.restore();

    if (slowT > 0) { ctx.fillStyle = 'rgba(120,200,255,0.12)'; ctx.fillRect(0, 0, W, H); }
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.8})`; ctx.fillRect(0, 0, W, H); }
    if (state !== 'menu') {
      const hx = SG.hudX();
      label(ctx, String(score), hx + 6, 50, 44, '#ffd34d', 'left');
      label(ctx, `Rekord: ${SG.best(bestKey())}`, hx + 8, 74, 13, '#cfd6e6', 'left');
      if (mode === 'classic') for (let i = 0; i < 3; i++) label(ctx, i < lives ? '❤' : '✖', W - 34 - i * 40, 46, 30, i < lives ? '#ff5d7a' : 'rgba(255,255,255,0.3)', 'center', false);
      else label(ctx, `⏱ ${Math.max(0, Math.ceil(timeLeft))}`, W - 24, 48, 32, timeLeft < 10 ? '#ff7a6b' : '#ffffff', 'right');
      if (comboN >= 2) label(ctx, `x${comboN}`, comboX, comboY - 50, 26, '#ffffff');
      if (elapsed < 3 && state === 'play') label(ctx, 'Mevalarni kesib o\'ting!', W / 2, H - 70, 20, '#ffffff');
    }
  }

  SG.run(update, draw);
  $('start-btn').addEventListener('click', start);
  $('retry-btn').addEventListener('click', start);
  if (/debug/.test(location.search)) window.__g = { get s() { return { state, score, lives, n: items.length, items: items.map(i => [i.x, i.y, i.bomb]) }; } };
})();
