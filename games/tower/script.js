(() => {
  'use strict';
  const { rand, clamp, damp, choice, hash, sfx, FX, Char, poses, label, rr, $ } = SG;

  const H = 540, GRAV = 1550, JUMP = 665, SPRING = 1090, STEER = 365, HS = 0.66;
  let W = 960, FW = 700, X0 = 130;
  SG.initView($('game'), () => { W = SG.view.W; FW = Math.min(W - 60, 720); X0 = (W - FW) / 2; });
  const fx = new FX();
  const hero = new Char({ color: '#ff5d5d' });
  $('best').textContent = SG.best('tower_best');

  let state = 'menu', p, plats = [], coins = [], items = [], bats = [], genY = 0, lastX = 0, camY = 0, lavaY = 0, startY = 0;
  let height = 0, coinCount = 0, rocketT = 0, shield = false, dead = 0, facing = 1, dir = 0;
  const ptrs = new Map();

  function start() {
    SG.audioUnlock();
    plats = []; coins = []; items = []; bats = [];
    const fx0 = X0 + FW / 2;
    p = { x: fx0, y: 440, vx: 0, vy: -JUMP };
    startY = 440; camY = 0; lavaY = 440 + 380; height = 0; coinCount = 0; rocketT = 0; shield = false; dead = 0;
    plats.push({ x: fx0, y: 460, w: FW - 40, type: 'n' });
    genY = 460; lastX = fx0;
    generate(-800);
    state = 'play';
    SG.show('start-screen', false); SG.show('results-screen', false);
  }

  function generate(until) {
    while (genY > until) {
      const m = (startY - genY) / 20;
      const hard = clamp(m / 350, 0, 1);
      genY -= rand(64, 88 + hard * 26);
      const w = rand(84 - hard * 22, 124 - hard * 34);
      const x = clamp(lastX + rand(-290, 290), X0 + w / 2 + 14, X0 + FW - w / 2 - 14);
      const r = Math.random();
      let type = 'n';
      if (m > 8) { if (r < 0.12 + hard * 0.16) type = 'move'; else if (r < 0.26 + hard * 0.3) type = 'break'; else if (r < 0.34 + hard * 0.3) type = 'spring'; }
      const pl = { x, y: genY, w, type, vx: type === 'move' ? choice([-1, 1]) * rand(60, 110 + hard * 60) : 0, t: 0 };
      plats.push(pl);
      lastX = x;
      const q = Math.random();
      if (type !== 'break' && q < 0.3) coins.push({ pl, dx: 0, y: genY - 30 });
      else if (type === 'n' && q < 0.325 && m > 15) items.push({ pl, y: genY - 30, type: 'rocket' });
      else if (type === 'n' && q < 0.35 && m > 25) items.push({ pl, y: genY - 30, type: 'shield' });
      if (m > 40 && Math.random() < 0.07 + hard * 0.1) bats.push({ x: rand(X0 + 60, X0 + FW - 60), y: genY - 42, vx: choice([-1, 1]) * rand(70, 130), ph: rand(0, 6) });
    }
  }

  function die(why) {
    if (dead) return;
    dead = 0.01;
    fx.shake(14); SG.buzz(150);
    if (why === 'lava') { fx.burst(p.x, lavaY, 36, { color: '#ffb347', speedMin: 100, speedMax: 520, up: 200 }); sfx.explode(); p.vy = -520; }
    else { sfx.heavy(); p.vy = -380; }
  }

  function update(dt) {
    fx.update(dt);
    if (state !== 'play') return;
    const t = SG.time.t;

    // input
    let d = (SG.anyKey('KeyD', 'ArrowRight') ? 1 : 0) - (SG.anyKey('KeyA', 'ArrowLeft') ? 1 : 0);
    if (ptrs.size) { let last = 0; for (const v of ptrs.values()) last = v; d = last; }
    dir = dead ? 0 : d;
    if (dir) facing = dir;

    p.vx = damp(p.vx, dir * STEER, 11, dt);
    const prevY = p.y;
    if (rocketT > 0 && !dead) {
      rocketT -= dt; p.vy = -920;
      fx.burst(p.x, p.y, 2, { color: choice(['#ffb347', '#ff7a3d', '#ffe08a']), speedMin: 60, speedMax: 220, angle: Math.PI / 2, spread: 0.5, gravity: 0, lifeMin: 0.2, lifeMax: 0.5, rMin: 4, rMax: 9 });
    } else p.vy += GRAV * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.x < X0 + 16) { p.x = X0 + 16; p.vx = Math.abs(p.vx) * 0.4; }
    if (p.x > X0 + FW - 16) { p.x = X0 + FW - 16; p.vx = -Math.abs(p.vx) * 0.4; }

    for (const pl of plats) {
      if (pl.type === 'move') { pl.x += pl.vx * dt; if (pl.x < X0 + pl.w / 2 + 8 || pl.x > X0 + FW - pl.w / 2 - 8) pl.vx *= -1; }
      if (pl.broken) { pl.t += dt; pl.y += 420 * pl.t * dt; }
      if (pl.bounce > 0) pl.bounce -= dt;
    }

    if (!dead) {
      if (p.vy > 0) {
        for (const pl of plats) {
          if (pl.broken || prevY > pl.y + 2 || p.y < pl.y || Math.abs(p.x - pl.x) > pl.w / 2 + 12) continue;
          p.y = pl.y; pl.bounce = 0.15;
          if (pl.type === 'spring') { p.vy = -SPRING; sfx.power(); fx.ring(p.x, pl.y, '#5dff9a', 60, 0.3, 5); fx.text(p.x, pl.y - 40, 'BOING!', '#5dff9a', 16); }
          else { p.vy = -JUMP; sfx.jump(); }
          fx.dust(p.x, pl.y, 4);
          if (pl.type === 'break') { pl.broken = true; pl.t = 0; sfx.thud(); fx.burst(pl.x, pl.y + 6, 10, { color: '#a87b4d', speedMin: 40, speedMax: 200 }); }
          break;
        }
      }
      for (const c of coins) {
        if (!c.got && Math.hypot(c.pl.x - p.x, c.y - (p.y - 34)) < 34) { c.got = true; coinCount++; sfx.coin(); fx.burst(c.pl.x, c.y, 6, { color: '#ffd34d', speedMin: 40, speedMax: 180 }); }
      }
      for (const it of items) {
        if (!it.got && Math.hypot(it.pl.x - p.x, it.y - (p.y - 34)) < 36) {
          it.got = true; sfx.power();
          if (it.type === 'rocket') { rocketT = 2.2; fx.text(p.x, p.y - 90, 'RAKETA!', '#ffb347', 20); }
          else { shield = true; fx.text(p.x, p.y - 90, 'QALQON!', '#7dc8ff', 20); }
        }
      }
      for (const b of bats) {
        b.x += b.vx * dt; if (b.x < X0 + 30 || b.x > X0 + FW - 30) b.vx *= -1;
        if (b.dead) continue;
        const by = b.y + Math.sin(t * 3 + b.ph) * 10;
        if (Math.abs(b.x - p.x) < 30 && Math.abs(by - (p.y - 30)) < 40) {
          if (rocketT > 0 || (p.vy > 100 && p.y - 20 < by)) { b.dead = true; if (rocketT <= 0) p.vy = -JUMP * 1.05; coinCount += 2; sfx.hit(); fx.burst(b.x, by, 14, { color: '#c77dff', speedMin: 60, speedMax: 280 }); fx.text(b.x, by - 20, '+2', '#ffd34d', 16); }
          else if (shield) { shield = false; b.dead = true; sfx.block(); fx.ring(p.x, p.y - 30, '#7dc8ff', 70); }
          else die('bat');
        }
      }
      height = Math.max(height, Math.floor((startY - p.y) / 20));
    } else {
      dead += dt;
      if (dead > 1.4) return finish();
    }

    camY = Math.min(camY, p.y - H * 0.46);
    const rise = Math.min(165, 44 + height * 0.2);
    lavaY -= rise * dt;
    lavaY = Math.min(lavaY, camY + H + 230);
    if (!dead && (p.y - 6 > lavaY || p.y > camY + H + 70)) die('lava');
    if (Math.random() < 0.5) fx.burst(rand(X0, X0 + FW), lavaY, 1, { color: choice(['#ffb347', '#ff7a3d', '#ffd34d']), speedMin: 30, speedMax: 150, angle: -Math.PI / 2, spread: 0.5, gravity: -20, lifeMin: 0.5, lifeMax: 1.2, rMin: 2, rMax: 4 });

    generate(camY - 300);
    const cut = camY + H + 300;
    plats = plats.filter(pl => pl.y < cut); coins = coins.filter(c => c.y < cut && !c.got); items = items.filter(i => i.y < cut && !i.got); bats = bats.filter(b => b.y < cut && !b.dead);

    const pose = dead ? poses.hurt() : rocketT > 0 ? poses.upper() : p.vy < 0 ? poses.jump() : poses.fall();
    hero.to(pose, dt, 16);
  }

  function finish() {
    state = 'over';
    const total = height + coinCount * 3;
    const best = SG.best('tower_best', total);
    $('best').textContent = best;
    $('winner-text').textContent = total >= best && total > 0 ? '🏆 Yangi rekord!' : 'Lava yetib oldi!';
    $('final-score').innerHTML = `Balandlik: <b>${height} m</b> &nbsp; 🪙 <b>${coinCount}</b> (+${coinCount * 3}) &nbsp; Jami: <b>${total}</b><br>Rekord: <b>${best}</b>`;
    SG.show('results-screen', true);
  }

  // ---------- draw ----------
  function drawWall(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#232a45'); g.addColorStop(1, '#181d33');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const par = camY * 0.6, bh = 34, bw = 78;
    const r0 = Math.floor(par / bh) - 1;
    for (let r = r0; r < r0 + H / bh + 3; r++) {
      const y = r * bh - par;
      for (let c = -1; c < W / bw + 1; c++) {
        const x = c * bw + (r % 2 ? bw / 2 : 0);
        const h1 = hash(r * 31.7 + c * 7.3);
        ctx.fillStyle = `rgba(${h1 > 0.5 ? '255,255,255' : '0,0,0'},${0.02 + h1 * 0.05})`;
        ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      }
    }
    // arched windows with sky
    const w0 = Math.floor(par / 520) - 1;
    for (let k = w0; k < w0 + 3; k++) {
      const wy = k * 520 - par + 120, wx = W / 2 + (hash(k * 5.1) - 0.5) * FW * 0.6;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(wx - 34, wy + 60); ctx.lineTo(wx - 34, wy); ctx.arc(wx, wy, 34, Math.PI, 0); ctx.lineTo(wx + 34, wy + 60); ctx.closePath(); ctx.clip();
      const sg = ctx.createLinearGradient(0, wy - 34, 0, wy + 60); sg.addColorStop(0, '#0d1433'); sg.addColorStop(1, '#4a5fa8');
      ctx.fillStyle = sg; ctx.fillRect(wx - 34, wy - 34, 68, 94);
      ctx.fillStyle = '#f4f1dc'; ctx.beginPath(); ctx.arc(wx + 10, wy + 4, 11, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.lineWidth = 5; ctx.strokeStyle = '#0f1322';
      ctx.beginPath(); ctx.moveTo(wx - 34, wy + 60); ctx.lineTo(wx - 34, wy); ctx.arc(wx, wy, 34, Math.PI, 0); ctx.lineTo(wx + 34, wy + 60); ctx.closePath(); ctx.stroke();
    }
    // side pillars + torches
    for (const side of [0, 1]) {
      const x = side === 0 ? 0 : X0 + FW, w = side === 0 ? X0 : W - X0 - FW;
      const pg = ctx.createLinearGradient(x, 0, x + w, 0);
      pg.addColorStop(side === 0 ? 0 : 1, '#0b0e1a'); pg.addColorStop(side === 0 ? 1 : 0, '#2f3757');
      ctx.fillStyle = pg; ctx.fillRect(x, 0, w, H);
      ctx.fillStyle = '#454f7a'; ctx.fillRect(side === 0 ? X0 - 6 : X0 + FW, 0, 6, H);
      const t0 = Math.floor(camY / 380) - 1;
      for (let k = t0; k < t0 + 4; k++) {
        const ty = k * 380 + (side ? 190 : 0) - camY, tx = side === 0 ? X0 - 18 : X0 + FW + 18;
        const gl = ctx.createRadialGradient(tx, ty, 4, tx, ty, 110);
        gl.addColorStop(0, 'rgba(255,170,80,0.5)'); gl.addColorStop(1, 'rgba(255,170,80,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(tx, ty, 110, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3b2a1a'; ctx.fillRect(tx - 3, ty, 6, 22);
        ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.ellipse(tx, ty - 4 + Math.sin(SG.time.t * 14 + k) * 1.5, 6, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff2b0'; ctx.beginPath(); ctx.ellipse(tx, ty - 2, 3, 5, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawPlat(ctx, pl) {
    const y = pl.y - camY + (pl.bounce > 0 ? Math.sin(pl.bounce / 0.15 * Math.PI) * 4 : 0);
    if (y < -30 || y > H + 30) return;
    const x = pl.x - pl.w / 2;
    ctx.globalAlpha = pl.broken ? clamp(1 - pl.t * 2, 0, 1) : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rr(ctx, x + 3, y + 5, pl.w, 15, 7); ctx.fill();
    const cols = { n: ['#9aa5c0', '#5b6583', '#7fe07a'], move: ['#7db8ff', '#3a6fc0', '#cfe6ff'], break: ['#c99a66', '#7d5a36', '#e8c08a'], spring: ['#9aa5c0', '#5b6583', '#5dff9a'] }[pl.type];
    const g = ctx.createLinearGradient(0, y, 0, y + 15); g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]);
    ctx.fillStyle = g; rr(ctx, x, y, pl.w, 15, 7); ctx.fill();
    ctx.fillStyle = cols[2]; rr(ctx, x, y - 2, pl.w, 6, 3); ctx.fill();
    if (pl.type === 'break') { ctx.strokeStyle = '#4a321c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pl.x - 8, y - 2); ctx.lineTo(pl.x - 2, y + 6); ctx.lineTo(pl.x - 9, y + 13); ctx.moveTo(pl.x + 14, y - 2); ctx.lineTo(pl.x + 9, y + 8); ctx.stroke(); }
    if (pl.type === 'move') label(ctx, '◀ ▶', pl.x, y + 12, 9, '#0f2a55', 'center', false);
    if (pl.type === 'spring') {
      ctx.strokeStyle = '#1b8a50'; ctx.lineWidth = 3;
      const sh = pl.bounce > 0 ? 4 : 10;
      ctx.beginPath(); for (let k = 0; k < 4; k++) { ctx.moveTo(pl.x - 12, y - 2 - k * sh / 4); ctx.lineTo(pl.x + 12, y - 2 - (k + 0.5) * sh / 4); } ctx.stroke();
      ctx.fillStyle = '#5dff9a'; rr(ctx, pl.x - 16, y - sh - 7, 32, 6, 3); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function draw(ctx) {
    const t = SG.time.t;
    ctx.save();
    fx.applyShake(ctx);
    drawWall(ctx);
    if (state !== 'menu') {
      plats.forEach(pl => drawPlat(ctx, pl));
      for (const c of coins) {
        const y = c.y - camY + Math.sin(t * 4 + c.pl.x) * 3, sq = Math.abs(Math.cos(t * 5 + c.pl.x * 0.01));
        ctx.fillStyle = '#a66d00'; ctx.beginPath(); ctx.ellipse(c.pl.x, y, 8 * sq + 3, 10.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.ellipse(c.pl.x, y, 7 * sq + 2, 9, 0, 0, Math.PI * 2); ctx.fill();
      }
      for (const it of items) {
        const y = it.y - camY + Math.sin(t * 3) * 4, col = it.type === 'rocket' ? '#ffb347' : '#7dc8ff';
        const gl = ctx.createRadialGradient(it.pl.x, y, 2, it.pl.x, y, 28); gl.addColorStop(0, SG.rgba(col, 0.6)); gl.addColorStop(1, SG.rgba(col, 0));
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(it.pl.x, y, 28, 0, Math.PI * 2); ctx.fill();
        label(ctx, it.type === 'rocket' ? '🚀' : '🛡', it.pl.x, y + 8, 24, '#fff', 'center', false);
      }
      for (const b of bats) {
        const y = b.y - camY + Math.sin(t * 3 + b.ph) * 10, fl = Math.sin(t * 16 + b.ph) * 10;
        ctx.fillStyle = '#2a1a44'; ctx.strokeStyle = '#c77dff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(b.x, y); ctx.quadraticCurveTo(b.x - 16, y - 16 - fl, b.x - 30, y - fl * 0.6); ctx.quadraticCurveTo(b.x - 18, y + 2, b.x, y + 6);
        ctx.quadraticCurveTo(b.x + 18, y + 2, b.x + 30, y - fl * 0.6); ctx.quadraticCurveTo(b.x + 16, y - 16 - fl, b.x, y); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(b.x, y + 1, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff5d5d'; ctx.beginPath(); ctx.arc(b.x - 4, y, 2.2, 0, Math.PI * 2); ctx.arc(b.x + 4, y, 2.2, 0, Math.PI * 2); ctx.fill();
      }
      // hero
      const sy = p.y - camY;
      ctx.save(); ctx.translate(p.x, sy); if (dead) ctx.rotate(dead * 8);
      const stretch = clamp(1 + Math.abs(p.vy) / 3200, 1, 1.18);
      ctx.scale(1 / Math.sqrt(stretch), stretch);
      hero.draw(ctx, 0, 0, { scale: HS, facing, shadow: false, tails: false, mood: dead ? 'ko' : 'normal' });
      ctx.restore();
      if (shield) { ctx.strokeStyle = `rgba(125,200,255,${0.6 + 0.3 * Math.sin(t * 8)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, sy - 34, 42, 0, Math.PI * 2); ctx.stroke(); }
      ctx.save(); ctx.translate(0, -camY); fx.draw(ctx); ctx.restore();
      // lava
      const ly = lavaY - camY;
      if (ly < H + 20) {
        const gl = ctx.createLinearGradient(0, ly - 140, 0, ly);
        gl.addColorStop(0, 'rgba(255,120,40,0)'); gl.addColorStop(1, 'rgba(255,120,40,0.4)');
        ctx.fillStyle = gl; ctx.fillRect(0, ly - 140, W, 140);
        ctx.beginPath(); ctx.moveTo(0, H + 10);
        for (let x = 0; x <= W + 20; x += 20) ctx.lineTo(x, ly + Math.sin(x * 0.03 + t * 3) * 6 + Math.sin(x * 0.011 - t * 2) * 5);
        ctx.lineTo(W, H + 10); ctx.closePath();
        const lg = ctx.createLinearGradient(0, ly, 0, ly + 160);
        lg.addColorStop(0, '#ffe08a'); lg.addColorStop(0.12, '#ff9a3d'); lg.addColorStop(0.5, '#e2452e'); lg.addColorStop(1, '#7a1a12');
        ctx.fillStyle = lg; ctx.fill();
      }
    }
    ctx.restore();

    if (state !== 'menu') {
      label(ctx, `${height} m`, W / 2, 58, 44, '#ffffff');
      label(ctx, `🪙 ${coinCount}`, W - 20, 40, 20, '#ffd34d', 'right');
      label(ctx, `Rekord: ${SG.best('tower_best')}`, SG.hudX() + 4, 38, 14, '#cfd6e6', 'left');
      const gap = lavaY - p.y;
      if (gap < 210 && !dead && Math.sin(t * 12) > 0) label(ctx, '🔥 LAVA YAQIN!', W / 2, 96, 18, '#ff7a3d');
      if (height < 6 && SG.isTouch) {
        ctx.globalAlpha = 0.5;
        label(ctx, '◀', 60, H - 50, 60, dir < 0 ? '#ffd34d' : '#ffffff', 'center', false);
        label(ctx, '▶', W - 60, H - 50, 60, dir > 0 ? '#ffd34d' : '#ffffff', 'center', false);
        ctx.globalAlpha = 1;
      }
    }
  }

  SG.run(update, draw);
  const canvas = $('game');
  const side = e => (SG.toLocal(e).x < W / 2 ? -1 : 1);
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); if (e.pointerType === 'mouse' && !SG.isTouch) return; canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, side(e)); });
  canvas.addEventListener('pointermove', e => { if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, side(e)); });
  const up = e => ptrs.delete(e.pointerId);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  $('start-btn').addEventListener('click', start);
  $('retry-btn').addEventListener('click', start);
  if (/debug/.test(location.search)) window.__g = { get s() { return { state, height, x: p && p.x, y: p && p.y, vy: p && p.vy, dead, lava: lavaY, plats: plats.filter(q => !q.broken && q.y < p.y - 10 && q.y > p.y - 150).map(q => [q.x, q.y, q.type]) }; } };
})();
