(() => {
  'use strict';
  const { rand, clamp, damp, choice, sfx, FX, Char, poses, Scenery, label, rr, $ } = SG;

  const H = 540, FLOOR = 458, NET_H = 150, BALL_R = 17, GRAV = 1750, BALL_G = 880, SPEED = 300, WIN = 7;
  let W = 960;
  SG.initView($('game'), () => { W = SG.view.W; });
  const fx = new FX();
  const scenery = new Scenery('sunset', 9);
  let mode = 'bot', diff = 1;
  SG.seg('mode-seg', v => { mode = v; $('diff-pick').classList.toggle('hidden', v !== 'bot'); });
  SG.seg('diff-seg', v => { diff = Number(v); });
  const blank = () => ({ mx: 0, jump: false, hit: false });

  class Player {
    constructor(idx, color, name, style) {
      this.idx = idx; this.f = idx === 0 ? 1 : -1; this.color = color; this.name = name;
      this.char = new Char({ color, style });
      this.reset();
    }
    reset() { this.x = this.idx === 0 ? W * 0.25 : W * 0.75; this.y = FLOOR; this.vx = 0; this.vy = 0; this.onGround = true; this.hitT = -1; this.cd = 0; this.runPh = 0; this.mood = 'normal'; this.cel = 0; }
    update(dt, inp) {
      this.vx = damp(this.vx, inp.mx * SPEED, this.onGround ? 15 : 9, dt);
      if (inp.jump && this.onGround) { this.vy = -690; this.onGround = false; sfx.jump(); fx.dust(this.x, this.y, 4, '#f0d9a8'); }
      if (inp.hit && this.hitT < 0) { this.hitT = 0; sfx.whoosh(); }
      if (this.hitT >= 0) { this.hitT += dt; if (this.hitT > 0.28) this.hitT = -1; }
      this.cd -= dt; this.cel -= dt;
      this.vy += GRAV * dt; this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.y >= FLOOR) { this.y = FLOOR; this.vy = 0; this.onGround = true; }
      const lo = this.idx === 0 ? 26 : W / 2 + 26, hi = this.idx === 0 ? W / 2 - 26 : W - 26;
      this.x = clamp(this.x, lo, hi);
      const P = poses, t = SG.time.t;
      let pose, rate = 18;
      if (this.cel > 0) pose = this.mood === 'happy' ? P.cheer(t) : P.sad(t);
      else if (this.hitT >= 0) { pose = this.onGround ? P.upper() : P.slash(clamp(this.hitT / 0.12, 0, 1)); rate = 34; }
      else if (!this.onGround) pose = this.vy < 0 ? P.jump() : P.fall();
      else if (Math.abs(this.vx) > 40) { this.runPh += dt * 13 * Math.sign(this.vx * this.f || 1); pose = P.run(this.runPh); rate = 24; }
      else pose = P.guard(t + this.idx * 2);
      this.char.to(pose, dt, rate);
    }
    draw(ctx) {
      this.char.draw(ctx, this.x, this.y, { facing: this.f, groundY: FLOOR, mood: this.mood });
      label(ctx, this.name, this.x, this.y - 122, 12, this.color);
    }
  }

  let p1, p2, ball, score = [0, 0], state = 'menu', pauseT = 0, serveT = 0, touches = [0, 0], lastSide = -1, touch = null, banner = '', bannerT = 0, rally = 0;

  function serve(side) {
    const x = side === 0 ? W * 0.25 : W * 0.75;
    ball = { x: x + (side === 0 ? 30 : -30), y: FLOOR - 330, vx: 0, vy: 0, rot: 0, trail: [], hot: 0 };
    touches = [0, 0]; lastSide = -1; serveT = 0.7; rally = 0;
  }

  function startMatch() {
    SG.audioUnlock();
    p1 = new Player(0, '#ff5d5d', 'P1', 'band');
    p2 = new Player(1, '#4da3ff', mode === 'bot' ? 'BOT' : 'P2', mode === 'bot' ? 'spiky' : 'band');
    score = [0, 0]; state = 'play'; serve(0);
    banner = 'BOSHLADIK!'; bannerT = 1.1;
    SG.show('start-screen', false); SG.show('results-screen', false);
    SG.clearTouch();
    if (SG.isTouch) {
      touch = { stick: SG.makeStick(), hit: SG.makeBtn('🏐', { right: 24, bottom: 24, size: 90, color: '#ff5d5d' }), jump: SG.makeBtn('⤊', { right: 126, bottom: 24, size: 72, color: '#37d6c4' }) };
      SG.showTouch(true);
    }
  }

  let latch = false;
  function humanInput(i) {
    const inp = blank();
    if (i === 0) {
      inp.mx = (SG.key('KeyD') ? 1 : 0) - (SG.key('KeyA') ? 1 : 0);
      inp.jump = SG.pressed('KeyW') || SG.pressed('Space'); inp.hit = SG.pressed('KeyF');
      if (touch) {
        const s = touch.stick;
        if (Math.abs(s.x) > 0.25) inp.mx = Math.sign(s.x);
        const up = s.y < -0.6; if (up && !latch) inp.jump = true; latch = up;
        if (touch.jump.hit()) inp.jump = true;
        if (touch.hit.hit()) inp.hit = true;
      }
    } else {
      inp.mx = (SG.key('ArrowRight') ? 1 : 0) - (SG.key('ArrowLeft') ? 1 : 0);
      inp.jump = SG.pressed('ArrowUp'); inp.hit = SG.pressed('KeyK');
    }
    return inp;
  }

  const AI_LV = [{ speed: 0.7, err: 70, react: 0.3, spike: 0.25 }, { speed: 0.88, err: 30, react: 0.16, spike: 0.6 }, { speed: 1, err: 8, react: 0.07, spike: 0.9 }];
  const ai = { t: 0, tx: 0 };
  function landingX() {
    let x = ball.x, y = ball.y, vx = ball.vx, vy = ball.vy;
    for (let i = 0; i < 200; i++) {
      vy += BALL_G * 0.02; x += vx * 0.02; y += vy * 0.02;
      if (x < BALL_R) { x = BALL_R; vx = -vx * 0.8; } if (x > W - BALL_R) { x = W - BALL_R; vx = -vx * 0.8; }
      if (y > FLOOR - 96) break;
    }
    return x;
  }
  function botInput(me, dt) {
    const lv = AI_LV[diff], inp = blank();
    ai.t -= dt;
    if (ai.t <= 0) {
      ai.t = lv.react;
      const lx = landingX();
      ai.tx = (lx > W / 2 - 10 || ball.x > W / 2 ? lx + 16 : W * 0.74) + rand(-lv.err, lv.err);
    }
    const dx = ai.tx - me.x;
    inp.mx = Math.abs(dx) > 9 ? Math.sign(dx) * lv.speed : 0;
    const bx = ball.x - me.x, by = ball.y - me.y;
    if (ball.x > W / 2) {
      if (me.onGround && Math.abs(bx) < 70 && by < -150 && by > -330 && ball.vy > -120 && Math.random() < lv.spike * dt * 9) inp.jump = true;
      if (Math.hypot(bx, by + 70) < 78 && me.cd <= 0 && (!me.onGround || by > -150)) inp.hit = Math.random() < 0.4 + lv.spike * 0.5;
    }
    return inp;
  }

  function contact(p) {
    if (p.cd > 0) return;
    const hx = p.x + p.f * 4, hy = p.y - 84;
    const d = Math.hypot(ball.x - hx, ball.y - hy);
    const hitting = p.hitT >= 0 && p.hitT < 0.2;
    if (d > (hitting ? 62 : 46) + BALL_R && !(Math.abs(ball.x - p.x) < 26 && ball.y > p.y - 70 && ball.y < p.y)) return;
    const side = p.idx;
    if (lastSide !== side) { touches[side] = 0; lastSide = side; }
    touches[side]++;
    p.cd = 0.22; rally++;
    if (touches[side] > 3) { point(1 - side, '4 marta tegish!'); return; }
    if (hitting && !p.onGround) {
      ball.vx = p.f * rand(700, 800); ball.vy = rand(180, 320); ball.hot = 0.8;
      fx.burst(ball.x, ball.y, 14, { color: '#ffd98a', spark: true, speedMin: 150, speedMax: 480 });
      fx.ring(ball.x, ball.y, '#ffffff', 60, 0.25, 5); fx.shake(8); sfx.heavy(); SG.buzz(40); SG.time.freeze = 0.06;
      fx.text(p.x, p.y - 150, 'SMESH!', '#ffd34d', 24);
    } else if (hitting) {
      ball.vx = p.f * rand(170, 250) + p.vx * 0.3; ball.vy = -rand(640, 700);
      fx.burst(ball.x, ball.y, 6, { color: '#ffffff', spark: true, speedMin: 80, speedMax: 240 }); sfx.kick();
    } else {
      ball.vx = clamp((ball.x - p.x) * 7.5 + p.vx * 0.45 + p.f * 120, -520, 520);
      ball.vy = -clamp(450 + Math.abs(p.vy) * 0.25, 450, 600);
      sfx.bounce(); fx.burst(ball.x, ball.y, 4, { color: '#ffffff', speedMin: 40, speedMax: 140 });
    }
  }

  function point(winner, why) {
    if (state !== 'play') return;
    score[winner]++;
    const s = winner === 0 ? p1 : p2, o = winner === 0 ? p2 : p1;
    s.mood = 'happy'; o.mood = 'calm'; s.cel = o.cel = 1.7;
    state = 'point'; pauseT = 1.7;
    banner = why || (rally >= 8 ? 'ZO\'R O\'YIN!' : 'OCHKO!'); bannerT = 1.5;
    sfx.coin(); fx.shake(6); SG.buzz(50);
    for (let i = 0; i < 3; i++) fx.burst(s.x + rand(-30, 30), s.y - rand(100, 180), 10, { color: choice(['#ffd34d', '#ff5d5d', '#4da3ff', '#5dff9a']), speedMin: 80, speedMax: 320, up: 120, lifeMin: 0.6, lifeMax: 1.2 });
    point.server = winner;
  }

  function update(dt) {
    fx.update(dt);
    if (state === 'menu' || state === 'results') return;
    bannerT -= dt;
    const live = state === 'play';
    p1.update(dt, live ? humanInput(0) : blank());
    p2.update(dt, live ? (mode === 'bot' ? botInput(p2, dt) : humanInput(1)) : blank());

    if (state === 'point') {
      pauseT -= dt;
      if (pauseT <= 0) {
        if (score[0] >= WIN || score[1] >= WIN) {
          state = 'results';
          const w = score[0] > score[1] ? 0 : 1;
          $('winner-text').textContent = w === 0 ? "🏆 P1 g'olib!" : mode === 'bot' ? 'Bot yutdi...' : "🏆 P2 g'olib!";
          $('final-score').innerHTML = `Hisob: <b>${score[0]} : ${score[1]}</b>`;
          (w === 0 || mode !== 'bot') ? sfx.win() : sfx.lose();
          SG.showTouch(false); SG.show('results-screen', true);
          return;
        }
        p1.reset(); p2.reset(); state = 'play'; serve(point.server);
      }
    }
    if (serveT > 0) { serveT -= dt; return; }

    const steps = 3, h = dt / steps;
    for (let s = 0; s < steps; s++) {
      ball.vy += BALL_G * h; ball.x += ball.vx * h; ball.y += ball.vy * h;
      if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx) * 0.8; }
      if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx) * 0.8; }
      if (ball.y < BALL_R - 200) { ball.vy = Math.abs(ball.vy) * 0.5; }
      // net: a vertical post with a rounded top
      const nx = W / 2, ny = FLOOR - NET_H;
      if (ball.y > ny) {
        if (Math.abs(ball.x - nx) < BALL_R + 5) { const dir = ball.x < nx ? -1 : 1; ball.x = nx + dir * (BALL_R + 5); ball.vx = dir * Math.abs(ball.vx) * 0.55; }
      } else {
        const dx = ball.x - nx, dy = ball.y - ny, d = Math.hypot(dx, dy) || 0.01;
        if (d < BALL_R + 6) { const ux = dx / d, uy = dy / d; ball.x = nx + ux * (BALL_R + 6); ball.y = ny + uy * (BALL_R + 6); const vn = ball.vx * ux + ball.vy * uy; if (vn < 0) { ball.vx -= 1.6 * vn * ux; ball.vy -= 1.6 * vn * uy; } }
      }
      if (state === 'play') { contact(p1); contact(p2); }
      if (ball.y > FLOOR - BALL_R) {
        ball.y = FLOOR - BALL_R;
        if (state === 'play') { fx.dust(ball.x, FLOOR, 10, '#f0d9a8'); sfx.thud(); point(ball.x < W / 2 ? 1 : 0); }
        ball.vy *= -0.5; ball.vx *= 0.7;
      }
    }
    ball.rot += ball.vx * dt * 0.05; ball.hot -= dt;
    ball.trail.push({ x: ball.x, y: ball.y }); if (ball.trail.length > 8) ball.trail.shift();
  }

  function draw(ctx) {
    const t = SG.time.t;
    ctx.save();
    fx.applyShake(ctx);
    scenery.drawSky(ctx, W, H, 60, FLOOR - 36, t);
    // sea + sand
    const sea = ctx.createLinearGradient(0, FLOOR - 40, 0, FLOOR);
    sea.addColorStop(0, '#c2568a'); sea.addColorStop(1, '#5a3d8f');
    ctx.fillStyle = sea; ctx.fillRect(0, FLOOR - 40, W, 44);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 9; i++) { const x = ((i * 173 + t * 22) % (W + 80)) - 40; ctx.fillRect(x, FLOOR - 34 + (i % 4) * 8, 46, 2); }
    const sg = ctx.createLinearGradient(0, FLOOR, 0, H);
    sg.addColorStop(0, '#f2d59a'); sg.addColorStop(1, '#c99a5c');
    ctx.fillStyle = sg; ctx.fillRect(0, FLOOR, W, H - FLOOR);
    ctx.fillStyle = '#fbe8bd'; ctx.fillRect(0, FLOOR, W, 4);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = 'rgba(120,84,44,0.18)'; ctx.beginPath(); ctx.ellipse(SG.hash(i * 3.1) * W, FLOOR + 12 + SG.hash(i * 7.7) * 60, 10, 2.5, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(20, FLOOR + 30, W - 40, 3);
    // net
    const nx = W / 2, ny = FLOOR - NET_H;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1;
    for (let y = ny + 6; y < FLOOR - 40; y += 11) { ctx.beginPath(); ctx.moveTo(nx - 5, y); ctx.lineTo(nx + 5, y); ctx.stroke(); }
    ctx.fillStyle = '#171d2b'; rr(ctx, nx - 6, ny - 4, 12, NET_H + 8, 5); ctx.fill();
    ctx.fillStyle = '#f4f7fc'; rr(ctx, nx - 3.5, ny - 1, 7, NET_H + 2, 3); ctx.fill();
    ctx.fillStyle = '#ff5d5d'; rr(ctx, nx - 7, ny - 8, 14, 12, 5); ctx.fill();

    if (state !== 'menu' && p1) {
      p2.draw(ctx); p1.draw(ctx);
      const hs = clamp(1 - (FLOOR - ball.y) / 420, 0.3, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(ball.x, FLOOR + 3, 17 * hs, 5 * hs, 0, 0, Math.PI * 2); ctx.fill();
      if (Math.hypot(ball.vx, ball.vy) > 560) ball.trail.forEach((q, i) => { ctx.globalAlpha = i / 8 * 0.25; ctx.fillStyle = ball.hot > 0 ? '#ffb347' : '#fff'; ctx.beginPath(); ctx.arc(q.x, q.y, BALL_R * (0.5 + i / 16), 0, Math.PI * 2); ctx.fill(); });
      ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(ball.x, ball.y); ctx.rotate(ball.rot);
      const g2 = ctx.createRadialGradient(-5, -6, 2, 0, 0, BALL_R);
      g2.addColorStop(0, '#ffffff'); g2.addColorStop(1, '#f2e2b0');
      ctx.beginPath(); ctx.arc(0, 0, BALL_R, 0, Math.PI * 2); ctx.fillStyle = g2; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = '#4da3ff'; ctx.beginPath(); ctx.ellipse(-BALL_R * 0.9, 0, BALL_R * 0.7, BALL_R * 1.3, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.ellipse(BALL_R * 0.9, 0, BALL_R * 0.7, BALL_R * 1.3, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.lineWidth = 2.2; ctx.strokeStyle = '#171d2b'; ctx.beginPath(); ctx.arc(0, 0, BALL_R, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      if (ball.y < -BALL_R) label(ctx, '▲', ball.x, 22, 18, '#ffffff');
    }
    fx.draw(ctx);
    ctx.restore();

    if (state !== 'menu' && p1) {
      const cx = W / 2;
      rr(ctx, cx - 120, 10, 240, 46, 23); ctx.fillStyle = 'rgba(8,10,18,0.6)'; ctx.fill();
      label(ctx, 'P1', cx - 92, 40, 15, '#ff8a8a');
      label(ctx, `${score[0]}  :  ${score[1]}`, cx, 44, 28, '#ffffff');
      label(ctx, p2.name, cx + 90, 40, 15, '#8ac4ff');
      for (let s = 0; s < 2; s++) for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(cx + (s === 0 ? -150 - i * 16 : 150 + i * 16), 34, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = lastSide === s && i < touches[s] ? '#ffd34d' : 'rgba(255,255,255,0.25)'; ctx.fill();
      }
      if (bannerT > 0) label(ctx, banner, cx, H * 0.36, 54, '#ffd34d');
    }
  }

  SG.run(update, draw);
  $('start-btn').addEventListener('click', startMatch);
  $('retry-btn').addEventListener('click', startMatch);
  if (/debug/.test(location.search)) window.__g = { get s() { return { state, score, bx: ball && Math.round(ball.x), by: ball && Math.round(ball.y), p1x: p1 && p1.x }; } };
})();
