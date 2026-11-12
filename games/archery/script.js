(() => {
  'use strict';
  const { rand, clamp, damp, choice, sfx, FX, Char, poses, Scenery, label, bar, rr, $ } = SG;

  const H = 540, FLOOR = 470, GRAV = 620, MAX_P = 900, MIN_P = 260, WIND_K = 26, MAX_HP = 100;
  let W = 960;
  const fx = new FX();
  let scenery = new Scenery('meadow', 1);
  let mode = 'bot', diff = 1;
  SG.seg('mode-seg', v => { mode = v; $('diff-pick').classList.toggle('hidden', v !== 'bot'); });
  SG.seg('diff-seg', v => { diff = Number(v); });

  let archers = [], hill = { x: 0, w: 0, h: 0 }, arrows = [], stuck = [], balloons = [];
  let state = 'menu', turn = 0, wind = 0, settleT = 0, botT = 0, botPlan = null, turnCount = 0, bannerT = 0, banner = '';
  let drag = null; // {sx, sy, x, y}
  const aim = [{ a: 0.6, p: 600 }, { a: 0.6, p: 600 }];
  const botErr = [1, 1];

  function layout() {
    W = SG.view.W;
    if (archers.length) {
      archers[0].x = W * 0.11; archers[1].x = W * 0.89;
      hill.x = W / 2;
    }
  }
  SG.initView($('game'), layout);

  function towerTop(a) { return FLOOR - a.th; }
  function groundAt(x) {
    let g = FLOOR;
    const d = (x - hill.x) / hill.w;
    if (Math.abs(d) < 1) g = Math.min(g, FLOOR - hill.h * (1 - d * d));
    for (const a of archers) if (Math.abs(x - a.x) < 44) g = Math.min(g, towerTop(a));
    return g;
  }

  function newMatch() {
    SG.audioUnlock();
    scenery = new Scenery(choice(['meadow', 'sunset', 'snow', 'forest']), (Math.random() * 60) | 0);
    archers = [0, 1].map(i => ({
      i, f: i === 0 ? 1 : -1, x: i === 0 ? W * 0.11 : W * 0.89, th: rand(70, 200),
      hp: MAX_HP, hpShown: MAX_HP, color: i === 0 ? '#ff5d5d' : '#4da3ff',
      name: i === 0 ? 'P1' : (mode === 'bot' ? 'BOT' : 'P2'),
      char: new Char({ color: i === 0 ? '#ff5d5d' : '#4da3ff', style: i === 1 && mode === 'bot' ? 'spiky' : 'band' }),
      hurt: 0, ko: false, fall: 0, bonus: null, pull: 0,
    }));
    hill = { x: W / 2, w: rand(110, 190), h: rand(60, 230) };
    arrows = []; stuck = []; balloons = [];
    turn = 0; turnCount = 0; botErr[0] = botErr[1] = 1;
    aim[0] = { a: 0.6, p: 600 }; aim[1] = { a: 0.6, p: 600 };
    SG.show('start-screen', false); SG.show('results-screen', false);
    beginTurn();
  }

  function beginTurn() {
    state = 'aim';
    wind = rand(-1, 1) * rand(0.2, 1);
    drag = null;
    turnCount++;
    if (balloons.length < 2 && (turnCount % 2 === 0 || turnCount === 1)) {
      balloons.push({ x: rand(W * 0.3, W * 0.7), y: rand(70, 230), type: choice(['triple', 'fire', 'heal']), t: rand(0, 6), r: 20 });
    }
    banner = `${archers[turn].name} navbati`; bannerT = 1.1;
    if (mode === 'bot' && turn === 1) { botT = rand(0.9, 1.4); botPlan = planBot(); }
  }

  function origin(a) { return { x: a.x + a.f * 22, y: towerTop(a) - 68 }; }

  // shared ballistic step so preview, bot planning and real arrows always agree
  function simulate(a, ang, pow, onPoint) {
    const o = origin(a);
    let x = o.x, y = o.y, vx = Math.cos(ang) * pow * a.f, vy = -Math.sin(ang) * pow;
    const foe = archers[1 - a.i];
    const h = 1 / 60;
    for (let i = 0; i < 480; i++) {
      vy += GRAV * h; vx += wind * WIND_K * h;
      x += vx * h; y += vy * h;
      if (onPoint && onPoint(x, y, i) === false) return { x, y, hit: null };
      const z = bodyHit(foe, x, y);
      if (z) return { x, y, hit: z };
      if (x < -60 || x > W + 60 || y > H) return { x, y, hit: null };
      if (y >= groundAt(x)) return { x, y, hit: null };
    }
    return { x, y, hit: null };
  }

  function bodyHit(a, x, y) {
    if (a.ko) return null;
    const by = towerTop(a);
    if (Math.hypot(x - a.x, y - (by - 89)) < 16) return 'head';
    if (Math.abs(x - a.x) < 15 && y > by - 74 && y < by - 36) return 'body';
    if (Math.abs(x - a.x) < 13 && y >= by - 36 && y < by - 2) return 'legs';
    return null;
  }

  function planBot() {
    const me = archers[1], foe = archers[0];
    let best = null;
    for (let ang = 0.12; ang <= 1.3; ang += 0.04) {
      for (let pow = 380; pow <= MAX_P; pow += 20) {
        let minD = 1e9;
        const res = simulate(me, ang, pow, (x, y) => { const d = Math.hypot(x - foe.x, y - (towerTop(foe) - 60)); if (d < minD) minD = d; });
        const score = res.hit ? (res.hit === 'head' ? -2 : -1) : minD;
        if (!best || score < best.score) best = { ang, pow, score };
      }
    }
    const e = [0.2, 0.12, 0.05][diff] * botErr[1];
    return { ang: best.ang + rand(-e, e), pow: clamp(best.pow * (1 + rand(-e, e) * 1.2), MIN_P, MAX_P) };
  }

  function fire(a, ang, pow) {
    const o = origin(a);
    const shots = a.bonus === 'triple' ? [-0.07, 0, 0.07] : [0];
    const fireArrow = a.bonus === 'fire';
    for (const d of shots) {
      arrows.push({ x: o.x, y: o.y, vx: Math.cos(ang + d) * pow * a.f, vy: -Math.sin(ang + d) * pow, owner: a, fire: fireArrow, trail: [], t: 0 });
    }
    a.bonus = null; a.pull = 0;
    state = 'fly';
    sfx.shoot(); SG.buzz(15);
  }

  function damage(a, zone, arrow) {
    let dmg = zone === 'head' ? 45 : zone === 'body' ? 25 : 15;
    if (arrow.fire) dmg = Math.round(dmg * 1.5);
    a.hp = Math.max(0, a.hp - dmg); a.hurt = 0.5;
    const txt = zone === 'head' ? `BOSH! -${dmg}` : `-${dmg}`;
    fx.text(a.x, towerTop(a) - 130, txt, zone === 'head' ? '#ffd34d' : '#ff8a5d', zone === 'head' ? 26 : 20);
    fx.burst(arrow.x, arrow.y, zone === 'head' ? 18 : 10, { color: '#ffd98a', spark: true, speedMin: 120, speedMax: 400 });
    fx.ring(arrow.x, arrow.y, '#ffffff', 46, 0.25, 4);
    fx.shake(zone === 'head' ? 11 : 6);
    zone === 'head' ? sfx.heavy() : sfx.hit();
    SG.buzz(zone === 'head' ? 70 : 35);
    SG.time.freeze = 0.07;
    if (arrow.fire) { fx.burst(arrow.x, arrow.y, 20, { color: '#ff9a3d', speedMin: 60, speedMax: 320 }); sfx.explode(); }
    botErr[arrow.owner.i] = Math.min(1, botErr[arrow.owner.i] * 1.15);
    if (a.hp <= 0) { a.ko = true; a.fall = 0; sfx.explode(); SG.time.scale = 0.35; }
  }

  function update(dt) {
    fx.update(dt);
    if (state === 'menu' || state === 'results') return;
    const t = SG.time.t;
    bannerT -= dt;

    for (const a of archers) {
      a.hpShown = damp(a.hpShown, a.hp, 6, dt); a.hurt -= dt;
      let pose;
      if (a.ko) { a.fall += dt; pose = poses.ko(); }
      else if (a.hurt > 0) pose = poses.hurt();
      else if (state === 'aim' && a.i === turn) pose = poses.aim(aim[a.i].a, a.pull);
      else if (state === 'results2' && !a.ko) pose = poses.cheer(t);
      else pose = poses.aim(0.25, 0);
      a.char.to(pose, dt, 14);
    }
    for (const b of balloons) b.t += dt;

    if (state === 'aim') {
      const a = archers[turn], am = aim[turn];
      if (mode === 'bot' && turn === 1) {
        botT -= dt;
        am.a = damp(am.a, botPlan.ang, 5, dt); am.p = damp(am.p, botPlan.pow, 5, dt);
        a.pull = clamp(1 - botT, 0, 1);
        if (botT <= 0) fire(a, botPlan.ang, botPlan.pow);
      } else {
        if (drag) {
          const dx = drag.sx - drag.x, dy = drag.sy - drag.y;
          const len = Math.hypot(dx, dy);
          if (len > 12) {
            am.a = clamp(Math.atan2(-dy, dx * a.f), -0.35, 1.45);
            am.p = clamp(MIN_P + (len - 12) * 4.6, MIN_P, MAX_P);
            a.pull = clamp((am.p - MIN_P) / (MAX_P - MIN_P), 0.15, 1);
          }
        } else {
          if (SG.key('ArrowUp')) am.a = clamp(am.a + dt * 0.9, -0.35, 1.45);
          if (SG.key('ArrowDown')) am.a = clamp(am.a - dt * 0.9, -0.35, 1.45);
          if (SG.key('ArrowRight')) am.p = clamp(am.p + dt * 320, MIN_P, MAX_P);
          if (SG.key('ArrowLeft')) am.p = clamp(am.p - dt * 320, MIN_P, MAX_P);
          a.pull = clamp((am.p - MIN_P) / (MAX_P - MIN_P), 0.15, 1);
          if (SG.pressed('Space')) fire(a, am.a, am.p);
        }
      }
    } else if (state === 'fly') {
      for (const ar of arrows) {
        if (ar.dead) continue;
        const steps = 2, h = dt / steps;
        for (let s = 0; s < steps && !ar.dead; s++) {
          ar.vy += GRAV * h; ar.vx += wind * WIND_K * h;
          ar.x += ar.vx * h; ar.y += ar.vy * h;
          const foe = archers[1 - ar.owner.i];
          const z = bodyHit(foe, ar.x, ar.y);
          if (z) { ar.dead = true; stuck.push({ x: ar.x, y: ar.y, ang: Math.atan2(ar.vy, ar.vx), on: foe, ox: ar.x - foe.x, oy: ar.y - towerTop(foe) }); damage(foe, z, ar); break; }
          for (const b of balloons) {
            if (!b.dead && Math.hypot(ar.x - b.x, ar.y - (b.y + Math.sin(b.t * 2) * 8)) < b.r + 4) {
              b.dead = true;
              const o = ar.owner;
              if (b.type === 'heal') { o.hp = Math.min(MAX_HP, o.hp + 30); fx.text(o.x, towerTop(o) - 130, '+30 ❤', '#5dff9a'); }
              else { o.bonus = b.type; fx.text(o.x, towerTop(o) - 130, b.type === 'triple' ? 'x3 o\'q!' : 'Olovli o\'q!', '#ffd34d'); }
              fx.burst(b.x, b.y, 16, { color: b.type === 'heal' ? '#5dff9a' : b.type === 'fire' ? '#ff9a3d' : '#c77dff', speedMin: 80, speedMax: 300 });
              fx.ring(b.x, b.y, '#ffffff', 50); sfx.power();
            }
          }
          if (ar.x < -60 || ar.x > W + 60 || ar.y > H + 40) { ar.dead = true; break; }
          if (ar.y >= groundAt(ar.x)) {
            ar.dead = true;
            stuck.push({ x: ar.x, y: ar.y, ang: Math.atan2(ar.vy, ar.vx) });
            fx.dust(ar.x, ar.y, 5); sfx.thud();
            if (ar.fire) { fx.burst(ar.x, ar.y, 16, { color: '#ff9a3d', speedMin: 60, speedMax: 260 }); sfx.explode(); }
            if (ar.owner.i === 1 && mode === 'bot') botErr[1] = Math.max(0.3, botErr[1] * 0.8);
            break;
          }
        }
        ar.trail.push({ x: ar.x, y: ar.y }); if (ar.trail.length > 14) ar.trail.shift();
        if (ar.fire && !ar.dead) fx.burst(ar.x, ar.y, 1, { color: choice(['#ffb347', '#ff7a3d']), speedMin: 10, speedMax: 50, gravity: -60, lifeMin: 0.2, lifeMax: 0.4, rMin: 3, rMax: 6 });
      }
      balloons = balloons.filter(b => !b.dead);
      if (arrows.every(a => a.dead)) { arrows = []; state = 'settle'; settleT = 0.9; if (stuck.length > 26) stuck.splice(0, stuck.length - 26); }
    } else if (state === 'settle') {
      settleT -= dt / SG.time.scale;
      if (settleT < 0.3) SG.time.scale = 1;
      if (settleT <= 0) {
        const dead = archers.find(a => a.ko);
        if (dead) {
          const w = archers[1 - dead.i];
          state = 'results';
          $('winner-text').textContent = w.i === 0 ? "🏆 P1 g'olib!" : mode === 'bot' ? 'Bot yutdi...' : "🏆 P2 g'olib!";
          (w.i === 0 || mode !== 'bot') ? sfx.win() : sfx.lose();
          setTimeout(() => SG.show('results-screen', true), 900);
        } else { turn = 1 - turn; beginTurn(); }
      }
    }
  }

  // ---------- input ----------
  const canvas = $('game');
  const humanTurn = () => state === 'aim' && !(mode === 'bot' && turn === 1);
  canvas.addEventListener('pointerdown', e => {
    if (!humanTurn()) return;
    const p = SG.toLocal(e);
    drag = { sx: p.x, sy: p.y, x: p.x, y: p.y };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => { if (drag) { const p = SG.toLocal(e); drag.x = p.x; drag.y = p.y; if (Math.random() < 0.08) sfx.stretch(); } });
  const release = () => {
    if (!drag) return;
    const len = Math.hypot(drag.sx - drag.x, drag.sy - drag.y);
    drag = null;
    if (len > 24 && humanTurn()) fire(archers[turn], aim[turn].a, aim[turn].p);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', () => { drag = null; });

  // ---------- draw ----------
  function drawTower(ctx, a) {
    const top = towerTop(a), x = a.x - 44, w = 88;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#9aa5bd'); g.addColorStop(0.5, '#7d889f'); g.addColorStop(1, '#5c667d');
    ctx.fillStyle = g; ctx.fillRect(x + 6, top, w - 12, FLOOR - top + 2);
    ctx.strokeStyle = 'rgba(20,26,40,0.35)'; ctx.lineWidth = 1.5;
    for (let y = top + 22; y < FLOOR; y += 22) {
      ctx.beginPath(); ctx.moveTo(x + 6, y); ctx.lineTo(x + w - 6, y); ctx.stroke();
      const off = ((y - top) / 22) % 2 === 0 ? 0 : 19;
      for (let bx = x + 6 + off; bx < x + w - 6; bx += 38) { ctx.beginPath(); ctx.moveTo(bx, y - 22); ctx.lineTo(bx, y); ctx.stroke(); }
    }
    ctx.fillStyle = '#6a7590'; ctx.fillRect(x, top - 4, w, 12);
    ctx.fillStyle = '#8d99b8';
    for (let k = 0; k < 4; k++) ctx.fillRect(x + k * 25, top - 14, 13, 12);
    ctx.fillStyle = a.color; ctx.fillRect(x + w / 2 - 12, top + 26, 24, 30);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x + w / 2 - 12, top + 26, 24, 6);
  }

  function drawArrow(ctx, x, y, ang, fire) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.strokeStyle = '#171d2b'; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(6, 0); ctx.stroke();
    ctx.strokeStyle = '#f2e6d0'; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.fillStyle = fire ? '#ff9a3d' : '#e6edf7';
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(3, -4.5); ctx.lineTo(3, 4.5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#171d2b'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#ff5d5d';
    ctx.beginPath(); ctx.moveTo(-30, 0); ctx.lineTo(-36, -5); ctx.lineTo(-26, -5); ctx.lineTo(-22, 0); ctx.lineTo(-26, 5); ctx.lineTo(-36, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawBalloon(ctx, b) {
    const y = b.y + Math.sin(b.t * 2) * 8;
    const col = b.type === 'heal' ? '#5dff9a' : b.type === 'fire' ? '#ff9a3d' : '#c77dff';
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(b.x, y + b.r); ctx.quadraticCurveTo(b.x + 6, y + b.r + 16, b.x - 2, y + b.r + 30); ctx.stroke();
    const g = ctx.createRadialGradient(b.x - 6, y - 7, 2, b.x, y, b.r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, col); g.addColorStop(1, SG.mix(col, '#000000', 0.3));
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(b.x, y, b.r * 0.9, b.r, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(20,26,40,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    label(ctx, b.type === 'heal' ? '❤' : b.type === 'fire' ? '🔥' : 'x3', b.x, y + 6, 15, '#fff', 'center', b.type === 'triple');
  }

  function draw(ctx) {
    const t = SG.time.t;
    ctx.save();
    fx.applyShake(ctx);
    scenery.draw(ctx, W, H, 120, FLOOR, t);
    if (state !== 'menu' && archers.length) {
      // hill
      const th = scenery.theme;
      ctx.beginPath(); ctx.moveTo(hill.x - hill.w, FLOOR + 2);
      for (let x = -hill.w; x <= hill.w; x += 8) { const d = x / hill.w; ctx.lineTo(hill.x + x, FLOOR - hill.h * (1 - d * d)); }
      ctx.lineTo(hill.x + hill.w, FLOOR + 2); ctx.closePath();
      const hg = ctx.createLinearGradient(0, FLOOR - hill.h, 0, FLOOR);
      hg.addColorStop(0, th.ground[0]); hg.addColorStop(1, th.ground[1]);
      ctx.fillStyle = hg; ctx.fill();
      ctx.lineWidth = 5; ctx.strokeStyle = th.strip; ctx.stroke();

      archers.forEach(a => drawTower(ctx, a));
      for (const s of stuck) {
        const x = s.on ? s.on.x + s.ox : s.x, y = s.on ? towerTop(s.on) + s.oy + (s.on.ko ? Math.min(60, s.on.fall * 200) : 0) : s.y;
        if (!(s.on && s.on.ko && s.on.fall > 0.3)) drawArrow(ctx, x, y, s.ang, false);
      }
      balloons.forEach(b => drawBalloon(ctx, b));

      for (const a of archers) {
        const top = towerTop(a);
        const active = state === 'aim' && a.i === turn;
        const y = a.ko ? top : top;
        a.char.draw(ctx, a.x, y, {
          facing: a.f, weapon: a.ko ? null : 'bow', bowPull: active ? a.pull : 0, arrow: active,
          mood: a.ko ? 'ko' : a.hurt > 0 ? 'hurt' : 'normal', flash: a.hurt > 0.42 ? 1 : 0, groundY: top,
        });
        label(ctx, a.name, a.x, top - 124, 12, a.color);
        if (a.bonus) label(ctx, a.bonus === 'triple' ? 'x3' : '🔥', a.x + a.f * -26, top - 100, 15, '#ffd34d');
      }

      // aim preview
      if (state === 'aim' && !(mode === 'bot' && turn === 1)) {
        const a = archers[turn], am = aim[turn];
        const limit = 26 + Math.round(am.p / MAX_P * 14);
        simulate(a, am.a, am.p, (x, y, i) => {
          if (i > limit) return false;
          if (i % 3 === 0) {
            ctx.globalAlpha = 0.85 - i / limit * 0.7;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(x, y, 3.2 - i / limit * 1.6, 0, Math.PI * 2); ctx.fill();
          }
        });
        ctx.globalAlpha = 1;
        if (drag) {
          ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]);
          ctx.beginPath(); ctx.moveTo(drag.sx, drag.sy); ctx.lineTo(drag.x, drag.y); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(drag.x, drag.y, 9, 0, Math.PI * 2); ctx.fill();
        }
        const o = origin(a);
        bar(ctx, o.x - 30, towerTop(a) + 66, 60, 8, (am.p - MIN_P) / (MAX_P - MIN_P), '#37d6c4', '#ff5d5d');
      }

      for (const ar of arrows) {
        if (ar.dead) continue;
        ctx.strokeStyle = ar.fire ? 'rgba(255,154,61,0.5)' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
        ctx.beginPath(); ar.trail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
        drawArrow(ctx, ar.x, ar.y, Math.atan2(ar.vy, ar.vx), ar.fire);
      }
    }
    fx.draw(ctx);
    ctx.restore();

    if (state !== 'menu' && archers.length) {
      const bw = Math.min(280, W * 0.26 - 20);
      bar(ctx, SG.hudX(), 16, bw, 18, archers[0].hpShown / MAX_HP, '#ff5d5d', '#ffa35d');
      label(ctx, `P1  ${Math.ceil(archers[0].hp)}`, SG.hudX() + 4, 56, 13, '#ff8a8a', 'left');
      ctx.save(); ctx.translate(W - 18, 0); ctx.scale(-1, 1);
      bar(ctx, 0, 16, bw, 18, archers[1].hpShown / MAX_HP, '#4da3ff', '#37d6c4');
      ctx.restore();
      label(ctx, `${Math.ceil(archers[1].hp)}  ${archers[1].name}`, W - 22, 56, 13, '#8ac4ff', 'right');
      // wind
      const cx = W / 2;
      rr(ctx, cx - 86, 10, 172, 34, 17); ctx.fillStyle = 'rgba(8,10,18,0.55)'; ctx.fill();
      label(ctx, 'Shamol', cx - 44, 33, 13, '#cfd6e6');
      const n = Math.max(1, Math.round(Math.abs(wind) * 3));
      label(ctx, (wind >= 0 ? '▶' : '◀').repeat(n), cx + 36, 33, 14, '#37d6c4');
      if (bannerT > 0 && state === 'aim') label(ctx, banner, cx, 92, 22, archers[turn].color);
    }
  }

  SG.run(update, draw);
  $('start-btn').addEventListener('click', newMatch);
  $('retry-btn').addEventListener('click', newMatch);
  if (/debug/.test(location.search)) window.__g = { get archers() { return archers; }, get state() { return state; }, get turn() { return turn; }, aim, fire: (a, p) => fire(archers[turn], a, p), plan: () => planBot() };
})();
