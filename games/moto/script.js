(() => {
  'use strict';
  const { rand, clamp, damp, choice, hash, sfx, FX, Char, poses, Scenery, label, bar, rr, $ } = SG;

  const H = 540, GRAV = 900, WR = 14, INERTIA = 1500, SPRING = 2600, DAMP = 70;
  const REAR = { x: -30, y: 16 }, FRONT = { x: 30, y: 16 }, HEAD = { x: -6, y: -44 };
  let W = 960;
  SG.initView($('game'), () => { W = SG.view.W; });
  const fx = new FX();
  let scenery = new Scenery('meadow', 4);
  const rider = new Char({ color: '#ff5d5d' });
  $('best').textContent = SG.best('moto_best');

  // endless terrain: rolling hills that grow with distance, plus launch ramps
  function gy(x) {
    const A = clamp((x - 250) / 2600, 0.12, 1.2);
    let y = 410 - A * (Math.sin(x * 0.0042) * 62 + Math.sin(x * 0.0097 + 1.3) * 36 + Math.sin(x * 0.023 + 2) * 9);
    const c = Math.floor(x / 1100);
    for (let k = c - 1; k <= c + 1; k++) {
      if (k < 1 || hash(k * 7.7) < 0.3) continue;
      const x0 = k * 1100 + 550 + (hash(k * 3.3) - 0.5) * 300, hgt = 55 + hash(k * 1.9) * 60, w = 150 + hash(k * 5.1) * 70;
      y -= hgt * Math.exp(-(((x - x0) / w) ** 2));
    }
    return y;
  }
  const slope = x => (gy(x + 2) - gy(x - 2)) / 4;

  let state = 'menu', b, gas = false, brake = false, cam = { x: 0, y: 0 }, fuel, items, genX, dist, tricks, coinsN, airT, spin, wheelRot, crashT, stallT, touch = null, comboT = 0;

  function start() {
    SG.audioUnlock();
    scenery = new Scenery(choice(['meadow', 'sunset', 'forest', 'snow']), (Math.random() * 50) | 0);
    b = { x: 120, y: gy(120) - 32, vx: 0, vy: 0, a: 0, w: 0, g1: false, g2: false };
    fuel = 100; items = []; genX = 500; dist = 0; tricks = 0; coinsN = 0; airT = 0; spin = 0; wheelRot = 0; crashT = 0; stallT = 0;
    cam.x = b.x - W * 0.32; cam.y = b.y - 300;
    state = 'play';
    SG.show('start-screen', false); SG.show('results-screen', false);
    SG.clearTouch();
    if (SG.isTouch) {
      touch = { gas: SG.makeBtn('GAZ', { right: 26, bottom: 26, size: 104, color: '#5dff9a' }), brake: SG.makeBtn('TORMOZ', { left: 26, bottom: 26, size: 104, color: '#ff5d5d' }) };
      touch.gas.el.style.fontSize = touch.brake.el.style.fontSize = '15px';
      SG.showTouch(true);
    }
  }

  function generate(until) {
    while (genX < until) {
      const r = hash(genX * 0.37);
      if (r < 0.22) items.push({ type: 'fuel', x: genX, h: 34 });
      else { const n = 3 + ((r * 10) | 0) % 3, air = r > 0.7; for (let i = 0; i < n; i++) items.push({ type: 'coin', x: genX + i * 44, h: air ? 110 + Math.sin(i / (n - 1) * Math.PI) * 50 : 30 }); }
      genX += 420 + hash(genX * 0.11) * 380;
    }
  }

  function wheel(off, h, drive) {
    const ca = Math.cos(b.a), sa = Math.sin(b.a);
    const rx = off.x * ca - off.y * sa, ry = off.x * sa + off.y * ca;
    const px = b.x + rx, py = b.y + ry;
    const pen = py + WR - gy(px);
    if (pen <= 0) return false;
    const s = slope(px), inv = 1 / Math.hypot(1, s);
    const nx = s * inv, ny = -inv, tx = inv, ty = s * inv;
    const vpx = b.vx - b.w * ry, vpy = b.vy + b.w * rx;
    const vn = vpx * nx + vpy * ny, vt = vpx * tx + vpy * ty;
    let F = Math.max(0, SPRING * Math.min(pen, 26) - DAMP * vn);
    let Ft = -0.5 * vt * 0.2;
    if (state === 'play') {
      if (drive && gas && fuel > 0) Ft += 640 * clamp(1 - vt / 660, 0, 1);
      if (brake) Ft -= clamp(vt * 6, -620, 620);
    } else Ft -= clamp(vt * 5, -600, 600);
    const fxn = nx * F + tx * Ft, fyn = ny * F + ty * Ft;
    b.vx += fxn * h; b.vy += fyn * h;
    b.w += (rx * fyn - ry * fxn) / INERTIA * h;
    return true;
  }

  function crash() {
    if (state !== 'play') return;
    state = 'crash'; crashT = 0;
    fx.burst(b.x, b.y - 20, 30, { color: '#ffd98a', spark: true, speedMin: 120, speedMax: 520 });
    fx.burst(b.x, b.y, 14, { color: '#a87b4d', speedMin: 60, speedMax: 260 });
    fx.shake(16); sfx.explode(); SG.buzz(180);
  }

  function update(dt) {
    fx.update(dt);
    if (state === 'menu' || state === 'over') return;
    comboT -= dt;
    gas = state === 'play' && (SG.anyKey('KeyD', 'ArrowRight', 'ArrowUp', 'KeyW') || (touch && touch.gas.down));
    brake = state === 'play' && (SG.anyKey('KeyA', 'ArrowLeft', 'ArrowDown', 'KeyS') || (touch && touch.brake.down));

    const steps = 8, h = dt / steps;
    let g1 = false, g2 = false;
    const a0 = b.a;
    for (let i = 0; i < steps; i++) {
      b.vy += GRAV * h;
      g1 = wheel(REAR, h, true) || g1;
      g2 = wheel(FRONT, h, false) || g2;
      const grounded = g1 || g2;
      const ctrl = grounded ? 2.2 : 5.2;
      if (gas) b.w -= ctrl * h;
      if (brake) b.w += ctrl * h;
      b.w -= b.w * (g1 && g2 ? 4.5 : grounded ? 1.6 : 0.9) * h;
      b.vx -= b.vx * 0.06 * h;
      b.x += b.vx * h; b.y += b.vy * h; b.a += b.w * h;
    }
    b.g1 = g1; b.g2 = g2;
    if (b.x < 40) { b.x = 40; b.vx = Math.max(0, b.vx); }
    wheelRot += Math.hypot(b.vx, b.vy) * Math.sign(b.vx || 1) / WR * dt;

    const grounded = g1 || g2;
    if (state === 'play') {
      // tricks: count full rotations made while airborne, pay out on a clean landing
      if (!grounded) { airT += dt; spin += b.a - a0; }
      else {
        if (airT > 0.25) {
          const flips = Math.floor(Math.abs(spin) / (Math.PI * 2) + 0.22);
          if (flips > 0) {
            const pts = 100 * flips * flips;
            tricks += pts; comboT = 1.6;
            fx.text(b.x, b.y - 90, `${spin < 0 ? 'ORQAGA' : 'OLDINGA'} SALTO${flips > 1 ? ' x' + flips : ''}! +${pts}`, '#ffd34d', 26);
            fx.ring(b.x, b.y, '#ffd34d', 110, 0.4, 7); sfx.perfect(); SG.buzz(40);
          } else if (airT > 0.9) { const pts = Math.round(airT * 20); tricks += pts; fx.text(b.x, b.y - 80, `Uchish +${pts}`, '#7df9ff', 18); }
          fx.dust(b.x, gy(b.x), 8); sfx.land();
        }
        airT = 0; spin = 0;
      }
      // crash when the rider's head (or the frame) hits the ground
      const ca = Math.cos(b.a), sa = Math.sin(b.a);
      const hx = b.x + HEAD.x * ca - HEAD.y * sa, hy = b.y + HEAD.x * sa + HEAD.y * ca;
      if (hy > gy(hx) - 5 || b.y > gy(b.x) + 6) crash();

      fuel = Math.max(0, fuel - dt * (gas ? 3.4 : 1.1));
      dist = Math.max(dist, Math.floor((b.x - 120) / 20));
      if (gas && g1 && fuel > 0 && Math.random() < 0.6) fx.burst(b.x - 34 * ca, gy(b.x - 30) - 2, 1, { color: '#c9b38a', speedMin: 40, speedMax: 160, angle: Math.PI * 1.15, spread: 0.5, lifeMin: 0.2, lifeMax: 0.5, rMin: 3, rMax: 6 });
      for (const it of items) {
        if (it.got) continue;
        const iy = gy(it.x) - it.h;
        if (Math.hypot(it.x - b.x, iy - (b.y - 10)) < 42) {
          it.got = true;
          if (it.type === 'fuel') { fuel = Math.min(100, fuel + 45); sfx.power(); fx.text(it.x, iy - 20, '+⛽', '#5dff9a', 20); }
          else { coinsN++; sfx.coin(); fx.burst(it.x, iy, 5, { color: '#ffd34d', speedMin: 40, speedMax: 160 }); }
        }
      }
      if (fuel <= 0 && Math.hypot(b.vx, b.vy) < 14) { stallT += dt; if (stallT > 1.4) return finish("Yoqilg'i tugadi!"); } else stallT = 0;
      generate(b.x + W * 1.5);
      items = items.filter(it => it.x > b.x - W && !it.got);
    } else if (state === 'crash') {
      crashT += dt;
      if (crashT > 1.5) return finish('Yiqildingiz!');
    }

    cam.x = damp(cam.x, b.x - W * 0.32 + clamp(b.vx * 0.18, 0, 120), 6, dt);
    cam.y = damp(cam.y, Math.min(b.y - 300, gy(b.x) - 400), 4, dt);

    // rider pose: tucked on the bike, leaning with input
    const p = poses.duck();
    p.hy = 20; p.hx = 0; p.lean = 0.5 + (gas ? -0.22 : 0) + (brake ? 0.2 : 0); p.head = -0.3;
    p.af1 = 1.25; p.af2 = 0.25; p.ab1 = 1.15; p.ab2 = 0.3;
    p.lf1 = 1.05; p.lf2 = -1.75; p.lb1 = 0.95; p.lb2 = -1.7;
    rider.to(state === 'crash' ? poses.hurt() : p, dt, 14);
  }

  function finish(msg) {
    state = 'over';
    const total = dist + tricks + coinsN * 5;
    const best = SG.best('moto_best', total);
    $('best').textContent = best;
    $('winner-text').textContent = total >= best && total > 0 ? '🏆 Yangi rekord!' : msg;
    $('final-score').innerHTML = `Masofa: <b>${dist} m</b> &nbsp; Tryuklar: <b>${tricks}</b> &nbsp; 🪙 <b>${coinsN}</b><br>Jami: <b>${total}</b> &nbsp; Rekord: <b>${best}</b>`;
    SG.showTouch(false); SG.show('results-screen', true);
  }

  // ---------- draw ----------
  function drawWheel(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath(); ctx.arc(0, 0, WR, 0, 6.283); ctx.fillStyle = '#11151f'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, WR - 4.5, 0, 6.283); ctx.fillStyle = '#8d99b8'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, WR - 6.5, 0, 6.283); ctx.fillStyle = '#1c2233'; ctx.fill();
    ctx.rotate(wheelRot); ctx.strokeStyle = '#cfd6e6'; ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(-WR + 6, 0); ctx.lineTo(WR - 6, 0); ctx.stroke(); }
    ctx.restore();
  }

  function drawBike(ctx) {
    ctx.save();
    ctx.translate(b.x, b.y); ctx.rotate(b.a);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // swingarm, fork
    ctx.strokeStyle = '#11151f'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(REAR.x, REAR.y); ctx.lineTo(-4, 4); ctx.moveTo(FRONT.x, FRONT.y); ctx.lineTo(20, -18); ctx.stroke();
    ctx.strokeStyle = '#9aa7bd'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(REAR.x, REAR.y); ctx.lineTo(-4, 4); ctx.moveTo(FRONT.x, FRONT.y); ctx.lineTo(20, -18); ctx.stroke();
    drawWheel(ctx, REAR.x, REAR.y); drawWheel(ctx, FRONT.x, FRONT.y);
    // engine + exhaust
    ctx.fillStyle = '#3a4258'; rr(ctx, -12, -4, 24, 16, 5); ctx.fill();
    ctx.strokeStyle = '#11151f'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = '#cfd6e6'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-8, 10); ctx.lineTo(-34, 4); ctx.stroke();
    // tank + seat + fender
    ctx.fillStyle = '#ff5d5d'; ctx.beginPath(); ctx.moveTo(-4, -8); ctx.quadraticCurveTo(8, -22, 22, -12); ctx.lineTo(14, -2); ctx.lineTo(-6, -2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#11151f'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(8, -12, 7, 2.5, -0.3, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#11151f'; rr(ctx, -30, -10, 28, 7, 3.5); ctx.fill();
    ctx.strokeStyle = '#ff5d5d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(REAR.x, REAR.y, WR + 4, Math.PI * 1.15, Math.PI * 1.7); ctx.stroke();
    // handlebar
    ctx.strokeStyle = '#11151f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(20, -18); ctx.lineTo(15, -27); ctx.stroke();
    // rider (drawn in the bike's frame)
    if (state !== 'crash') rider.draw(ctx, -13, 8, { scale: 0.6, shadow: false, tails: false });
    ctx.restore();
    if (state === 'crash') rider.draw(ctx, b.x - 10 - crashT * 30, Math.min(gy(b.x - 10), b.y + 10 - 90 * crashT + 200 * crashT * crashT), { scale: 0.6, shadow: false, tails: false, mood: 'ko' });
  }

  function draw(ctx) {
    const t = SG.time.t;
    ctx.save();
    fx.applyShake(ctx);
    scenery.drawSky(ctx, W, H, cam.x * 0.5, H + 20 - clamp(cam.y * 0.15, -40, 40), t);
    if (state !== 'menu') {
      ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
      const th = scenery.theme, x0 = Math.floor(cam.x / 12) * 12 - 12, x1 = cam.x + W + 24, bot = cam.y + H + 40;
      ctx.beginPath(); ctx.moveTo(x0, bot);
      for (let x = x0; x <= x1; x += 12) ctx.lineTo(x, gy(x));
      ctx.lineTo(x1, bot); ctx.closePath();
      const g = ctx.createLinearGradient(0, cam.y + 200, 0, bot);
      g.addColorStop(0, '#8a6238'); g.addColorStop(1, '#4a321c');
      ctx.fillStyle = g; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let x = Math.floor(cam.x / 90) * 90 - 90; x < x1; x += 90) { const y = gy(x) + 30 + hash(x) * 80; ctx.beginPath(); ctx.ellipse(x + hash(x * 3) * 50, y, 22, 7, 0, 0, 6.283); ctx.fill(); }
      ctx.restore();
      ctx.beginPath(); for (let x = x0; x <= x1; x += 12) (x === x0 ? ctx.moveTo(x, gy(x)) : ctx.lineTo(x, gy(x)));
      ctx.lineWidth = 12; ctx.strokeStyle = th.ground[1]; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.lineWidth = 6; ctx.strokeStyle = th.strip; ctx.stroke();
      // distance posts
      for (let m = Math.ceil((cam.x - 120) / 2000) * 100; m * 20 + 120 < x1; m += 100) {
        if (m <= 0) continue; const px = m * 20 + 120, py = gy(px);
        ctx.fillStyle = '#11151f'; ctx.fillRect(px - 2, py - 46, 4, 46);
        rr(ctx, px - 24, py - 66, 48, 22, 5); ctx.fillStyle = '#ffd34d'; ctx.fill();
        label(ctx, `${m} m`, px, py - 50, 12, '#11151f', 'center', false);
      }
      for (const it of items) {
        if (it.got) continue; const iy = gy(it.x) - it.h + Math.sin(t * 4 + it.x) * 3;
        if (it.type === 'fuel') {
          const gl = ctx.createRadialGradient(it.x, iy, 2, it.x, iy, 30); gl.addColorStop(0, 'rgba(93,255,154,0.6)'); gl.addColorStop(1, 'rgba(93,255,154,0)');
          ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(it.x, iy, 30, 0, 6.283); ctx.fill();
          rr(ctx, it.x - 12, iy - 14, 24, 28, 5); ctx.fillStyle = '#e2452e'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#11151f'; ctx.stroke();
          ctx.fillStyle = '#11151f'; ctx.fillRect(it.x - 4, iy - 19, 10, 6);
          label(ctx, '⛽', it.x, iy + 7, 13, '#fff', 'center', false);
        } else {
          const sq = Math.abs(Math.cos(t * 5 + it.x * 0.01));
          ctx.fillStyle = '#a66d00'; ctx.beginPath(); ctx.ellipse(it.x, iy, 8 * sq + 3, 10.5, 0, 0, 6.283); ctx.fill();
          ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.ellipse(it.x, iy, 7 * sq + 2, 9, 0, 0, 6.283); ctx.fill();
        }
      }
      drawBike(ctx);
      fx.draw(ctx);
    }
    ctx.restore();

    if (state !== 'menu') {
      const hx = SG.hudX();
      bar(ctx, hx + 26, 16, 170, 16, fuel / 100, fuel < 25 ? '#ff5d5d' : '#5dff9a', fuel < 25 ? '#ff9a3d' : '#ffd34d');
      label(ctx, '⛽', hx + 18, 31, 16, '#fff', 'center', false);
      if (fuel < 25 && Math.sin(t * 10) > 0) label(ctx, "Yoqilg'i kam!", hx + 110, 54, 13, '#ff7a6b');
      label(ctx, `${dist} m`, W / 2, 46, 36, '#ffffff');
      label(ctx, `Tryuk: ${tricks}`, W / 2, 70, 15, comboT > 0 ? '#ffd34d' : '#cfd6e6');
      label(ctx, `🪙 ${coinsN}`, W - 20, 40, 20, '#ffd34d', 'right');
      if (dist < 15 && state === 'play') label(ctx, 'GAZ bosing! Havoda aylanib salto qiling', W / 2, 110, 17, '#ffd34d');
    }
  }

  SG.run(update, draw);
  $('start-btn').addEventListener('click', start);
  $('retry-btn').addEventListener('click', start);
  if (/debug/.test(location.search)) window.__g = { get s() { return { state, x: b && Math.round(b.x), y: b && Math.round(b.y), gy: b && Math.round(gy(b.x)), vx: b && Math.round(b.vx), a: b && +b.a.toFixed(2), w: b && +b.w.toFixed(2), g1: b && b.g1, g2: b && b.g2, fuel: Math.round(fuel), dist, tricks }; } };
})();
