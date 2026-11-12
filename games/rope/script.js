(() => {
  'use strict';
  const { rand, clamp, damp, choice, hash, sfx, FX, Char, poses, Scenery, label, rr, $ } = SG;

  const H = 540, GRAV = 1180, MAX_SPEED = 820, REACH = 430;
  let W = 960;
  SG.initView($('game'), () => { W = SG.view.W; });
  const fx = new FX();
  let scenery = new Scenery('night', 3);
  const hero = new Char({ color: '#ff5d5d' });
  $('best').textContent = SG.best('rope_best');

  let state = 'menu', p, rope = null, anchors = [], roofs = [], mines = [], gems = [], genX = 0, camX = 0, camY = 0;
  let holding = false, startX = 0, score = 0, gemCount = 0, bonus = 0, dead = 0, trail = [], airT = 0, missT = 0;

  function start() {
    SG.audioUnlock();
    scenery = new Scenery(choice(['night', 'sunset', 'forest']), (Math.random() * 40) | 0);
    anchors = [{ x: 260, y: 110 }]; roofs = [{ x: 60, w: 260, y: 470 }]; mines = []; gems = [];
    genX = 260;
    p = { x: 150, y: 250, vx: 330, vy: 0 };
    startX = p.x; score = 0; gemCount = 0; bonus = 0; dead = 0; trail = []; airT = 0;
    generate(2400);
    rope = { a: anchors[0], L: Math.hypot(anchors[0].x - p.x, anchors[0].y - p.y) };
    holding = true;
    camX = p.x - W * 0.3; camY = 0;
    state = 'play';
    SG.show('start-screen', false); SG.show('results-screen', false);
  }

  function generate(until) {
    while (genX < until) {
      const m = (genX - startX) / 30;
      const hard = clamp(m / 400, 0, 1);
      const prev = anchors[anchors.length - 1];
      const gap = rand(230, 300 + hard * 110);
      const a = { x: prev.x + gap, y: clamp(prev.y + rand(-70, 70), 50, 190), ph: rand(0, 6), move: m > 120 && Math.random() < 0.2 + hard * 0.2 ? rand(26, 50) : 0, by: 0 };
      a.by = a.y;
      anchors.push(a);
      // gems along the natural swing arc under the gap
      if (Math.random() < 0.75) {
        const n = 3 + (Math.random() < 0.4 ? 2 : 0);
        for (let i = 0; i < n; i++) { const k = (i + 0.5) / n; gems.push({ x: prev.x + gap * k, y: Math.min(prev.y, a.y) + 190 + Math.sin(k * Math.PI) * 60 }); }
      }
      if (m > 60 && Math.random() < 0.22 + hard * 0.3) mines.push({ x: prev.x + gap * rand(0.35, 0.65), y: rand(210, 400), ph: rand(0, 6), r: 20 });
      if (Math.random() < 0.34 - hard * 0.16) roofs.push({ x: prev.x + gap * rand(0.2, 0.6), w: rand(110, 190), y: rand(440, 485) });
      genX = a.x;
    }
  }

  function pickAnchor() {
    let best = null, bs = 1e9;
    for (const a of anchors) {
      const dx = a.x - p.x, dy = a.y - p.y, d = Math.hypot(dx, dy);
      if (dx < -40 || dy > -30 || d > REACH) continue;
      const s = d - dx * 0.35;
      if (s < bs) { bs = s; best = a; }
    }
    return best;
  }

  function press() {
    if (state !== 'play' || dead) return;
    holding = true;
    if (!rope) {
      const a = pickAnchor();
      if (a) {
        rope = { a, L: Math.max(70, Math.hypot(a.x - p.x, a.y - p.y)) };
        sfx.shoot(); fx.ring(a.x, a.y, '#7df9ff', 30, 0.25, 3);
      } else { missT = 0.5; sfx.error(); }
    }
  }
  function release() {
    holding = false;
    if (rope && state === 'play') {
      rope = null; sfx.whoosh();
      p.vx *= 1.06; p.vy = p.vy * 1.04 - 40;
    }
  }

  function die(boom) {
    if (dead) return;
    dead = 0.01; rope = null;
    if (boom) { fx.burst(p.x, p.y, 40, { color: '#ffb347', speedMin: 100, speedMax: 520 }); fx.ring(p.x, p.y, '#ffffff', 140, 0.4, 8); sfx.explode(); p.vy = -380; }
    else sfx.lose();
    fx.shake(14); SG.buzz(150);
  }

  function update(dt) {
    fx.update(dt);
    if (state !== 'play') return;
    const t = SG.time.t;
    missT -= dt;
    for (const a of anchors) if (a.move) a.y = a.by + Math.sin(t * 1.6 + a.ph) * a.move;

    const steps = 3, h = dt / steps;
    for (let s = 0; s < steps; s++) {
      p.vy += GRAV * h;
      if (rope) {
        // gentle pump so swings keep (and build) momentum while the rope is held
        const sp = Math.hypot(p.vx, p.vy) || 1;
        if (sp < MAX_SPEED) { p.vx += p.vx / sp * 150 * h; p.vy += p.vy / sp * 150 * h; }
      }
      p.x += p.vx * h; p.y += p.vy * h;
      if (rope) {
        const dx = p.x - rope.a.x, dy = p.y - rope.a.y, d = Math.hypot(dx, dy) || 1;
        if (d > rope.L) {
          const nx = dx / d, ny = dy / d;
          p.x = rope.a.x + nx * rope.L; p.y = rope.a.y + ny * rope.L;
          const vr = p.vx * nx + p.vy * ny;
          if (vr > 0) { p.vx -= vr * nx; p.vy -= vr * ny; }
        }
      }
    }
    p.vx -= p.vx * 0.05 * dt;

    if (!dead) {
      airT = rope ? 0 : airT + dt;
      for (const r of roofs) {
        if (p.vy > 0 && p.x > r.x - 8 && p.x < r.x + r.w + 8 && p.y + 34 >= r.y && p.y + 34 - p.vy * dt <= r.y + 14) {
          p.y = r.y - 34; p.vy = -640; p.vx = Math.max(p.vx, 300);
          sfx.jump(); fx.dust(p.x, r.y, 8); fx.ring(p.x, r.y, '#5dff9a', 50, 0.3, 4);
          if (rope) rope = null;
        }
      }
      for (const g of gems) {
        if (!g.got && Math.hypot(g.x - p.x, g.y - (p.y + 20)) < 34) {
          g.got = true; gemCount++; bonus += 5; sfx.coin();
          fx.burst(g.x, g.y, 8, { color: '#7df9ff', speedMin: 60, speedMax: 220 });
        }
      }
      for (const m of mines) {
        const my = m.y + Math.sin(t * 2 + m.ph) * 18;
        if (Math.hypot(m.x - p.x, my - (p.y + 16)) < m.r + 16) { m.x = -9999; die(true); }
      }
      score = Math.max(score, Math.floor((p.x - startX) / 30));
      if (p.y > H + 90) die(false);
      if (Math.hypot(p.vx, p.vy) > 520 && Math.random() < 0.6) trail.push({ x: p.x, y: p.y + 20, a: 0 });
    } else {
      dead += dt;
      if (dead > 1.5 || p.y > H + 400) return finish();
    }
    for (const q of trail) q.a += dt;
    trail = trail.filter(q => q.a < 0.35);

    generate(p.x + W * 1.6);
    const cut = p.x - W;
    anchors = anchors.filter(a => a.x > cut || (rope && rope.a === a));
    roofs = roofs.filter(r => r.x + r.w > cut); mines = mines.filter(m => m.x > cut); gems = gems.filter(g => g.x > cut && !g.got);

    camX = damp(camX, p.x - W * 0.3 + clamp(p.vx * 0.12, 0, 90), 6, dt);
    camY = damp(camY, Math.min(0, p.y - 110), 5, dt);

    // pose
    let pose;
    if (dead) pose = poses.hurt();
    else if (rope) { pose = poses.jump(); pose.af1 = 3.05; pose.af2 = 0.05; pose.ab1 = 2.92; pose.ab2 = 0.1; pose.lf1 = 0.5; pose.lf2 = -0.7; pose.lb1 = -0.1; pose.lb2 = -0.5; pose.lean = 0; }
    else pose = p.vy < 0 ? poses.jump() : poses.fall();
    hero.to(pose, dt, 16);
  }

  function finish() {
    state = 'over';
    const total = score + bonus;
    const best = SG.best('rope_best', total);
    $('best').textContent = best;
    $('winner-text').textContent = total >= best && total > 0 ? '🏆 Yangi rekord!' : 'Tushib ketdingiz!';
    $('final-score').innerHTML = `Masofa: <b>${score} m</b> &nbsp; 💎 <b>${gemCount}</b> (+${bonus}) &nbsp; Jami: <b>${total}</b><br>Rekord: <b>${best}</b>`;
    SG.show('results-screen', true);
  }

  // ---------- draw ----------
  function drawRoof(ctx, r) {
    const x = r.x - camX;
    if (x + r.w < -20 || x > W + 20) return;
    const g = ctx.createLinearGradient(x, 0, x + r.w, 0);
    g.addColorStop(0, '#2a3252'); g.addColorStop(1, '#161b30');
    ctx.fillStyle = g; ctx.fillRect(x, r.y + 8, r.w, H - r.y + 80);
    ctx.fillStyle = 'rgba(255,216,107,0.7)';
    for (let c = 0; c < Math.floor(r.w / 22); c++) for (let q = 0; q < 6; q++) if (hash(r.x + c * 7.1 + q * 3.3) > 0.55) ctx.fillRect(x + 8 + c * 22, r.y + 26 + q * 20, 9, 11);
    // trampoline top
    ctx.fillStyle = '#11151f'; rr(ctx, x - 6, r.y - 2, r.w + 12, 12, 5); ctx.fill();
    ctx.fillStyle = '#5dff9a'; rr(ctx, x - 2, r.y - 5, r.w + 4, 7, 3.5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x + 4, r.y - 4, r.w - 8, 2);
  }

  function draw(ctx) {
    const t = SG.time.t;
    ctx.save();
    fx.applyShake(ctx);
    scenery.drawSky(ctx, W, H, camX, H + 30, t);
    // fog / abyss
    const fg = ctx.createLinearGradient(0, H - 120, 0, H);
    fg.addColorStop(0, 'rgba(120,60,160,0)'); fg.addColorStop(1, 'rgba(120,60,160,0.55)');
    ctx.fillStyle = fg; ctx.fillRect(0, H - 120, W, 120);

    if (state !== 'menu') {
      ctx.save(); ctx.translate(0, -camY);
      roofs.forEach(r => drawRoof(ctx, r));
      const cand = !rope && !dead ? pickAnchor() : null;
      for (const a of anchors) {
        const x = a.x - camX;
        if (x < -60 || x > W + 60) continue;
        // hanging drone-hook
        ctx.fillStyle = '#11151f'; rr(ctx, x - 22, a.y - 26, 44, 14, 6); ctx.fill();
        ctx.fillStyle = '#4a5578'; rr(ctx, x - 18, a.y - 24, 36, 6, 3); ctx.fill();
        ctx.strokeStyle = 'rgba(160,200,255,0.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x - 16, a.y - 30, 12, 3, 0, 0, Math.PI * 2); ctx.ellipse(x + 16, a.y - 30, 12, 3, 0, 0, Math.PI * 2); ctx.stroke();
        const on = (rope && rope.a === a) || cand === a;
        const gl = ctx.createRadialGradient(x, a.y, 2, x, a.y, on ? 34 : 22);
        gl.addColorStop(0, on ? 'rgba(125,249,255,0.9)' : 'rgba(255,211,77,0.7)'); gl.addColorStop(1, 'rgba(125,249,255,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, a.y, on ? 34 : 22, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = on ? '#7df9ff' : '#ffd34d';
        ctx.beginPath(); ctx.arc(x, a.y, 8, 0, Math.PI * 2); ctx.stroke();
        if (cand === a) { ctx.setLineDash([6, 8]); ctx.strokeStyle = 'rgba(125,249,255,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x - camX, p.y); ctx.lineTo(x, a.y); ctx.stroke(); ctx.setLineDash([]); }
      }
      for (const g of gems) {
        const x = g.x - camX; if (x < -20 || x > W + 20) continue;
        const y = g.y + Math.sin(t * 4 + g.x * 0.02) * 3;
        ctx.fillStyle = '#7df9ff'; ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 8, y - 2); ctx.lineTo(x, y + 10); ctx.lineTo(x - 8, y - 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x + 4, y - 2); ctx.lineTo(x, y + 1); ctx.lineTo(x - 4, y - 2); ctx.closePath(); ctx.fill();
      }
      for (const m of mines) {
        const x = m.x - camX; if (x < -40 || x > W + 40) continue;
        const y = m.y + Math.sin(t * 2 + m.ph) * 18;
        ctx.strokeStyle = '#11151f'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283 + t; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (m.r + 8), y + Math.sin(a) * (m.r + 8)); ctx.stroke(); }
        const g = ctx.createRadialGradient(x - 5, y - 6, 2, x, y, m.r);
        g.addColorStop(0, '#5a6278'); g.addColorStop(1, '#12151f');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, m.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,70,70,${0.6 + 0.4 * Math.sin(t * 8 + m.ph)})`; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
      }
      // speed trail
      for (const q of trail) { ctx.globalAlpha = (1 - q.a / 0.35) * 0.35; ctx.fillStyle = '#ff8a8a'; ctx.beginPath(); ctx.arc(q.x - camX, q.y, 12 * (1 - q.a / 0.35), 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
      // rope
      const px = p.x - camX;
      if (rope) {
        const ax = rope.a.x - camX;
        ctx.strokeStyle = '#11151f'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(px, p.y); ctx.lineTo(ax, rope.a.y); ctx.stroke();
        ctx.strokeStyle = '#e8d2a8'; ctx.lineWidth = 2.5; ctx.stroke();
      }
      // hero: hands at p, body hangs along the rope (or tilts with velocity in flight)
      ctx.save();
      ctx.translate(px, p.y);
      let th;
      if (rope) th = Math.atan2(p.x - rope.a.x, p.y - rope.a.y) * -1;
      else th = dead ? dead * 9 : clamp(Math.atan2(p.vy, Math.max(120, p.vx)) * 0.5, -0.6, 0.8);
      ctx.rotate(th);
      hero.draw(ctx, 0, rope ? 96 * 0.8 : 46, { scale: 0.8, shadow: false, tails: false, mood: dead ? 'ko' : 'normal' });
      ctx.restore();
      ctx.save(); ctx.translate(-camX, 0); fx.draw(ctx); ctx.restore();
      ctx.restore();
    }
    ctx.restore();

    if (state !== 'menu') {
      label(ctx, `${score} m`, W / 2, 62, 46, '#ffffff');
      label(ctx, `💎 ${gemCount}`, W - 20, 40, 20, '#7df9ff', 'right');
      label(ctx, `Rekord: ${SG.best('rope_best')}`, SG.hudX() + 4, 38, 14, '#cfd6e6', 'left');
      if (score < 12 && !dead) label(ctx, rope ? 'Qo\'yib yuboring — uchasiz!' : 'Bosib turing — arqon otiladi!', W / 2, 110, 18, '#ffd34d');
      if (missT > 0) label(ctx, 'Ilgak uzoq!', W / 2, 140, 16, '#ff8a8a');
      if (p.y > H - 40 && !dead) label(ctx, '⚠', p.x - camX, H - 16, 26, '#ff5d5d');
    }
  }

  SG.run(update, draw);
  const canvas = $('game');
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); press(); });
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('keydown', e => { if (e.code === 'Space' && !e.repeat) press(); });
  window.addEventListener('keyup', e => { if (e.code === 'Space') release(); });
  $('start-btn').addEventListener('click', start);
  $('retry-btn').addEventListener('click', start);
  if (/debug/.test(location.search)) window.__g = { get s() { return { state, score, x: p && p.x, y: p && p.y, vx: p && p.vx, vy: p && p.vy, rope: !!rope, ax: rope && rope.a.x, cand: !!(p && !rope && pickAnchor()), dead }; } };
})();
