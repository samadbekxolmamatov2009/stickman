(() => {
  'use strict';
  const { rand, clamp, damp, choice, sfx, FX, Char, poses, Scenery, label, bar, $ } = SG;

  const H = 540, FLOOR = 456, GOAL_W = 78, BAR_Y = FLOOR - 158;
  const BALL_R = 15, GRAV = 1750, BALL_G = 1150, SPEED = 285, MATCH_TIME = 60;
  let W = 960;
  SG.initView($('game'), () => { W = SG.view.W; });

  const fx = new FX();
  const scenery = new Scenery('stadium', 4);
  let mode = 'bot', diff = 1;
  SG.seg('mode-seg', v => { mode = v; $('diff-pick').classList.toggle('hidden', v !== 'bot'); });
  SG.seg('diff-seg', v => { diff = Number(v); });

  const blank = () => ({ mx: 0, jump: false, kick: false, sup: false });

  class Player {
    constructor(idx, color, name, style) {
      this.idx = idx; this.f = idx === 0 ? 1 : -1;
      this.color = color; this.name = name;
      this.char = new Char({ color, style });
      this.reset();
      this.energy = 0;
    }
    reset() {
      this.x = this.idx === 0 ? W * 0.26 : W * 0.74; this.y = FLOOR;
      this.vx = 0; this.vy = 0; this.onGround = true;
      this.kickT = -1; this.kicked = false; this.superKick = false;
      this.stun = 0; this.runPh = 0; this.mood = 'normal'; this.cel = 0;
    }
    update(dt, inp) {
      if (this.stun > 0) { this.stun -= dt; inp = blank(); }
      this.vx = damp(this.vx, inp.mx * SPEED, this.onGround ? 14 : 8, dt);
      if (inp.jump && this.onGround) { this.vy = -660; this.onGround = false; sfx.jump(); fx.dust(this.x, this.y, 4); }
      if (this.kickT < 0) {
        if (inp.sup && this.energy >= 100) { this.kickT = 0; this.kicked = false; this.superKick = true; sfx.power(); }
        else if (inp.kick) { this.kickT = 0; this.kicked = false; this.superKick = false; sfx.whoosh(); }
      } else {
        this.kickT += dt;
        if (this.kickT > 0.3) this.kickT = -1;
      }
      this.vy += GRAV * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.y >= FLOOR) { if (!this.onGround) { fx.dust(this.x, FLOOR, 3); } this.y = FLOOR; this.vy = 0; this.onGround = true; }
      this.x = clamp(this.x, GOAL_W - 26, W - GOAL_W + 26);
      this.energy = Math.min(100, this.energy + dt * 4.5);

      const P = poses, t = SG.time.t;
      let pose, rate = 18;
      if (this.cel > 0) pose = this.mood === 'happy' ? P.cheer(t) : P.sad(t);
      else if (this.stun > 0) { pose = P.hurt(); rate = 26; }
      else if (this.kickT >= 0) { pose = this.kickT < 0.05 ? P.kickBack() : (this.onGround ? P.kick() : P.kickUp()); rate = 36; }
      else if (!this.onGround) pose = this.vy < 0 ? P.jump() : P.fall();
      else if (Math.abs(this.vx) > 40) {
        this.runPh += dt * 13 * Math.sign(this.vx * this.f || 1);
        pose = P.run(this.runPh); rate = 24;
      } else pose = P.stand(t + this.idx * 2);
      this.char.to(pose, dt, rate);
    }
    kickActive() { return this.kickT >= 0.04 && this.kickT <= 0.22 && !this.kicked; }
    draw(ctx) {
      this.char.draw(ctx, this.x, this.y, { facing: this.f, groundY: FLOOR, mood: this.stun > 0 ? 'hurt' : this.mood, scale: 1 });
      if (this.energy >= 100) {
        ctx.save();
        ctx.globalAlpha = 0.4 + 0.3 * Math.sin(SG.time.t * 10);
        ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(this.x, FLOOR - 1, 30, 8, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      label(ctx, this.name, this.x, this.y - 122, 12, this.color);
    }
  }

  let p1, p2, ball, score = [0, 0], timeLeft = MATCH_TIME, golden = false;
  let state = 'menu', pauseT = 0, kickoffT = 0, touch = null, stuckT = 0, bannerT = 0, banner = '';

  function resetBall(dir = 0) {
    ball = { x: W / 2, y: FLOOR - 260, vx: dir * 60, vy: 0, rot: 0, fire: 0, lastTouch: -1, trail: [] };
  }

  function startMatch() {
    SG.audioUnlock();
    p1 = new Player(0, '#ff5d5d', 'P1', 'band');
    p2 = new Player(1, '#4da3ff', mode === 'bot' ? 'BOT' : 'P2', mode === 'bot' ? 'spiky' : 'band');
    score = [0, 0]; timeLeft = MATCH_TIME; golden = false;
    resetBall(); kickoffT = 1.2; state = 'play'; banner = 'BOSHLADIK!'; bannerT = 1.2;
    SG.show('start-screen', false); SG.show('results-screen', false);
    SG.clearTouch(); pads = [null, null];
    if (SG.isTouch) {
      if (mode === 'human') {
        const mk = side => {
          const o = (x, b, size, color) => Object.assign({ bottom: b, size, color }, side === 0 ? { left: x } : { right: x });
          return { stick: SG.makeStick({ right: side === 1, scale: 0.82 }), kick: SG.makeBtn('⚽', o(150, 14, 70, side === 0 ? '#ff5d5d' : '#4da3ff')), jump: SG.makeBtn('⤊', o(228, 14, 58, '#37d6c4')), sup: SG.makeBtn('⚡', o(160, 92, 50, '#ffd34d')) };
        };
        pads[0] = mk(0); pads[1] = mk(1);
      } else {
        pads[0] = {
          stick: SG.makeStick(),
          kick: SG.makeBtn('⚽', { right: 24, bottom: 24, size: 86, color: '#ff5d5d' }),
          jump: SG.makeBtn('⤊', { right: 122, bottom: 24, size: 68, color: '#37d6c4' }),
          sup: SG.makeBtn('⚡', { right: 40, bottom: 122, size: 60, color: '#ffd34d' }),
        };
      }
      SG.showTouch(true);
    }
  }

  let pads = [null, null];
  const latch = [false, false];
  function humanInput(i) {
    const inp = blank();
    if (i === 0) {
      inp.mx = (SG.key('KeyD') ? 1 : 0) - (SG.key('KeyA') ? 1 : 0);
      inp.jump = SG.pressed('KeyW') || SG.pressed('Space');
      inp.kick = SG.pressed('KeyF'); inp.sup = SG.pressed('KeyG');
    } else {
      inp.mx = (SG.key('ArrowRight') ? 1 : 0) - (SG.key('ArrowLeft') ? 1 : 0);
      inp.jump = SG.pressed('ArrowUp'); inp.kick = SG.pressed('KeyK'); inp.sup = SG.pressed('KeyL');
    }
    const pad = pads[i];
    if (pad) {
      const st = pad.stick;
      if (Math.abs(st.x) > 0.25) inp.mx = Math.sign(st.x);
      const up = st.y < -0.6;
      if (up && !latch[i]) inp.jump = true;
      latch[i] = up;
      if (pad.jump.hit()) inp.jump = true;
      if (pad.kick.hit()) inp.kick = true;
      if (pad.sup.hit()) inp.sup = true;
    }
    return inp;
  }

  const AI_LV = [
    { speed: 0.62, react: 0.3, jump: 0.35, err: 60 },
    { speed: 0.82, react: 0.16, jump: 0.65, err: 26 },
    { speed: 1.0, react: 0.07, jump: 0.92, err: 8 },
  ];
  const ai = { t: 0, tx: 0, err: 0 };
  function botInput(me, dt) {
    const lv = AI_LV[diff];
    const inp = blank();
    ai.t -= dt;
    if (ai.t <= 0) {
      ai.t = lv.react;
      ai.err = rand(-lv.err, lv.err);
      // predict where the ball will be shortly
      const px = ball.x + ball.vx * 0.25;
      const home = W - GOAL_W - 110;
      if (ball.x > me.x + 10) ai.tx = Math.min(W - GOAL_W, px + 46);          // ball got behind: get goal-side of it
      else if (ball.x < W * 0.38 && ball.vx < 60) ai.tx = Math.max(px + 30, W * 0.52); // far away: hold midfield
      else ai.tx = px + 30;
      if (ball.x < W * 0.3 && ball.vx <= 0) ai.tx = Math.max(ai.tx, home - 160);
      ai.tx += ai.err;
    }
    const dx = ai.tx - me.x;
    inp.mx = Math.abs(dx) > 10 ? Math.sign(dx) * lv.speed : 0;
    const bx = ball.x - me.x, by = ball.y - me.y;
    // header / jump
    if (me.onGround && Math.abs(bx + ball.vx * 0.2) < 70 && by < -100 && by > -280 && ball.vy > -260 && Math.random() < lv.jump * dt * 14) inp.jump = true;
    // kick when the ball is in front (bot faces left)
    if (bx < 6 && bx > -74 && by > -92 && by < 20) {
      if (me.energy >= 100 && Math.random() < 0.5) inp.sup = true; else if (Math.random() < 0.3 + lv.jump * 0.6) inp.kick = true;
    }
    return inp;
  }

  function collideCircle(cx, cy, r, cvx, cvy, e, owner) {
    const dx = ball.x - cx, dy = ball.y - cy;
    const d = Math.hypot(dx, dy) || 0.001;
    const min = r + BALL_R;
    if (d >= min) return false;
    const nx = dx / d, ny = dy / d;
    ball.x = cx + nx * min; ball.y = cy + ny * min;
    const rvx = ball.vx - cvx, rvy = ball.vy - cvy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      ball.vx -= (1 + e) * vn * nx; ball.vy -= (1 + e) * vn * ny;
      if (-vn > 160) { sfx.bounce(); }
    }
    if (owner) ball.lastTouch = owner.idx;
    return true;
  }

  function playerVsBall(p, foe) {
    if (ball.fire > 0 && ball.lastTouch !== p.idx) {
      // a fiery super shot blasts the defender away instead of bouncing off
      if (Math.hypot(ball.x - p.x, ball.y - (p.y - 55)) < 46) {
        p.stun = 0.7; p.vx = Math.sign(ball.vx) * 420; p.vy = -380; p.onGround = false;
        fx.burst(p.x, p.y - 60, 14, { color: '#ffb347', spark: true, speedMin: 120, speedMax: 380 });
        fx.shake(8); sfx.heavy(); SG.buzz(40);
        ball.vx *= 0.82;
      }
      return;
    }
    const headHit = collideCircle(p.x + p.f * 2, p.y - 92, 17, p.vx, p.vy, 0.78, p);
    if (headHit && p.vy < -100) { ball.vy -= 120; ball.vx += p.f * 90; }
    collideCircle(p.x, p.y - 52, 15, p.vx, p.vy, 0.35, p);
    collideCircle(p.x, p.y - 20, 13, p.vx, p.vy, 0.3, p);

    if (p.kickActive()) {
      const fxp = p.x + p.f * 34, fyp = p.y - (p.onGround ? 24 : 40);
      if (Math.hypot(ball.x - fxp, ball.y - fyp) < 30 + BALL_R) {
        p.kicked = true; ball.lastTouch = p.idx;
        if (p.superKick) {
          ball.vx = p.f * 1050; ball.vy = -160; ball.fire = 1.3; p.energy = 0;
          fx.ring(ball.x, ball.y, '#ffd34d', 80, 0.4, 6); fx.shake(10); sfx.explode(); SG.buzz(60);
          SG.time.freeze = 0.08;
          fx.text(p.x, p.y - 140, 'SUPER!', '#ffd34d', 26);
        } else {
          const high = ball.y < p.y - 62;
          ball.vx = p.f * rand(470, 560) + p.vx * 0.35;
          ball.vy = high ? -rand(110, 200) : -rand(330, 440);
          fx.burst(ball.x, ball.y, 7, { color: '#ffffff', spark: true, speedMin: 100, speedMax: 300 });
          sfx.kick(); SG.time.freeze = 0.03;
        }
        p.energy = Math.min(100, p.energy + 9);
      }
    }
  }

  function goal(scorer) {
    score[scorer]++;
    const s = scorer === 0 ? p1 : p2, o = scorer === 0 ? p2 : p1;
    s.mood = 'happy'; o.mood = 'calm'; s.cel = o.cel = 2.2;
    state = 'goal'; pauseT = 2.2;
    banner = 'GOOOL!'; bannerT = 2.0;
    const gx = scorer === 0 ? W - 40 : 40;
    for (let i = 0; i < 5; i++) fx.burst(gx + rand(-30, 30), BAR_Y + rand(0, 120), 14, { color: choice(['#ffd34d', '#ff5d5d', '#4da3ff', '#5dff9a', '#ffffff']), speedMin: 120, speedMax: 520, up: 200, gravity: 600, lifeMin: 0.8, lifeMax: 1.6 });
    fx.shake(12); sfx.goal(); SG.buzz(150);
    SG.time.scale = 0.4;
  }

  function endMatch() {
    state = 'results';
    const w = score[0] === score[1] ? -1 : score[0] > score[1] ? 0 : 1;
    $('winner-text').textContent = w === 0 ? "🏆 P1 g'olib!" : mode === 'bot' ? 'Bot yutdi...' : "🏆 P2 g'olib!";
    $('final-score').innerHTML = `Hisob: <b>${score[0]} : ${score[1]}</b>`;
    (w === 0 || mode !== 'bot') ? sfx.win() : sfx.lose();
    SG.showTouch(false);
    SG.show('results-screen', true);
  }

  function update(dt) {
    fx.update(dt);
    if (state === 'menu' || state === 'results') return;
    bannerT -= dt;

    const live = state === 'play' && kickoffT <= 0;
    const i1 = live ? humanInput(0) : blank();
    const i2 = live ? (mode === 'bot' ? botInput(p2, dt) : humanInput(1)) : blank();
    p1.update(dt, i1); p2.update(dt, i2);
    p1.cel -= dt; p2.cel -= dt;
    const gap = p2.x - p1.x;
    if (Math.abs(gap) < 36 && Math.abs(p1.y - p2.y) < 70) {
      const push = (36 - Math.abs(gap)) / 2, d = gap >= 0 ? 1 : -1;
      p1.x -= push * d; p2.x += push * d;
    }

    if (state === 'goal') {
      pauseT -= dt / SG.time.scale * 1;
      if (pauseT < 1.4) SG.time.scale = 1;
      if (pauseT <= 0) {
        if (golden || false) { endMatch(); return; }
        p1.reset(); p2.reset(); p1.mood = p2.mood = 'normal';
        resetBall(); kickoffT = 0.9; state = 'play';
      }
    }
    if (kickoffT > 0) { kickoffT -= dt; if (kickoffT > 0) return; }

    // ball physics (sub-stepped for stability at high speed)
    const steps = 3, h = dt / steps;
    for (let s = 0; s < steps; s++) {
      const prevY = ball.y;
      ball.vy += BALL_G * h * (ball.fire > 0 ? 0.25 : 1);
      ball.x += ball.vx * h; ball.y += ball.vy * h;
      ball.vx -= ball.vx * 0.25 * h;
      if (ball.y > FLOOR - BALL_R) {
        ball.y = FLOOR - BALL_R;
        if (ball.vy > 150) { sfx.bounce(); fx.dust(ball.x, FLOOR, 2); }
        ball.vy *= -0.68; ball.vx *= 0.985;
        if (Math.abs(ball.vy) < 40) ball.vy = 0;
      }
      if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy) * 0.6; }
      for (const side of [0, 1]) {
        const inX = side === 0 ? ball.x < GOAL_W : ball.x > W - GOAL_W;
        const postX = side === 0 ? GOAL_W : W - GOAL_W;
        if (inX) {
          if (prevY + BALL_R <= BAR_Y && ball.y + BALL_R > BAR_Y && ball.vy > 0) { ball.y = BAR_Y - BALL_R; ball.vy *= -0.6; ball.vx += (side === 0 ? 1 : -1) * 90; sfx.bounce(); }
          else if (prevY - BALL_R >= BAR_Y + 6 && ball.y - BALL_R < BAR_Y + 6 && ball.vy < 0) { ball.y = BAR_Y + 6 + BALL_R; ball.vy *= -0.5; }
        }
        collideCircle(postX, BAR_Y + 3, 4, 0, 0, 0.7, null);
        // back wall above the bar
        if (ball.y < BAR_Y) {
          if (side === 0 && ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx) * 0.75; }
          if (side === 1 && ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx) * 0.75; }
        }
      }
      if (state === 'play') { playerVsBall(p1, p2); playerVsBall(p2, p1); }
    }
    ball.rot += ball.vx * dt * 0.06;
    if (ball.fire > 0) {
      ball.fire -= dt;
      fx.burst(ball.x, ball.y, 2, { color: choice(['#ffb347', '#ff7a3d', '#ffe08a']), speedMin: 10, speedMax: 80, gravity: -100, lifeMin: 0.2, lifeMax: 0.5, rMin: 4, rMax: 9 });
    }
    ball.trail.push({ x: ball.x, y: ball.y }); if (ball.trail.length > 8) ball.trail.shift();

    if (state === 'play') {
      if (ball.y > BAR_Y + 6 && ball.x < GOAL_W - 16) { goal(1); return; }
      if (ball.y > BAR_Y + 6 && ball.x > W - GOAL_W + 16) { goal(0); return; }
      // un-stick: ball resting on a crossbar or idle in a corner
      const slow = Math.hypot(ball.vx, ball.vy) < 30;
      stuckT = slow && (ball.x < GOAL_W + 20 || ball.x > W - GOAL_W - 20) ? stuckT + dt : 0;
      if (stuckT > 1.2) { ball.vx = (ball.x < W / 2 ? 1 : -1) * 260; ball.vy = -320; stuckT = 0; }

      if (!golden) {
        timeLeft -= dt;
        if (timeLeft <= 0) {
          if (score[0] === score[1]) { golden = true; banner = 'OLTIN GOL!'; bannerT = 2; sfx.power(); }
          else endMatch();
        }
      }
    }
    if (state === 'goal' && golden && pauseT <= 0.05) endMatch();
  }

  function drawGoal(ctx, side) {
    ctx.save();
    if (side === 1) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    for (let x = 0; x <= GOAL_W; x += 13) { ctx.beginPath(); ctx.moveTo(x, BAR_Y + 6); ctx.lineTo(x * 0.55, FLOOR); ctx.stroke(); }
    for (let y = BAR_Y + 6; y <= FLOOR; y += 13) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(GOAL_W - (y - BAR_Y) * 0.0, y); ctx.stroke(); }
    ctx.strokeStyle = '#1a2233'; ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, BAR_Y + 3); ctx.lineTo(GOAL_W, BAR_Y + 3); ctx.lineTo(GOAL_W, FLOOR); ctx.stroke();
    ctx.strokeStyle = '#f4f7fc'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(0, BAR_Y + 3); ctx.lineTo(GOAL_W, BAR_Y + 3); ctx.lineTo(GOAL_W, FLOOR); ctx.stroke();
    ctx.restore();
  }

  function drawBall(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    const hs = clamp(1 - (FLOOR - ball.y) / 400, 0.3, 1);
    ctx.beginPath(); ctx.ellipse(ball.x, FLOOR + 3, 15 * hs, 4.5 * hs, 0, 0, Math.PI * 2); ctx.fill();
    if (Math.hypot(ball.vx, ball.vy) > 500) {
      ball.trail.forEach((p, i) => {
        ctx.globalAlpha = i / ball.trail.length * 0.25;
        ctx.fillStyle = ball.fire > 0 ? '#ffb347' : '#ffffff';
        ctx.beginPath(); ctx.arc(p.x, p.y, BALL_R * (0.5 + i / ball.trail.length * 0.5), 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(ball.x, ball.y); ctx.rotate(ball.rot);
    if (ball.fire > 0) {
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 34);
      g.addColorStop(0, 'rgba(255,220,120,0.9)'); g.addColorStop(1, 'rgba(255,90,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(0, 0, BALL_R, 0, Math.PI * 2);
    const g2 = ctx.createRadialGradient(-5, -5, 2, 0, 0, BALL_R);
    g2.addColorStop(0, '#ffffff'); g2.addColorStop(1, '#cfd6e6');
    ctx.fillStyle = g2; ctx.fill();
    ctx.lineWidth = 2.2; ctx.strokeStyle = '#171d2b'; ctx.stroke();
    ctx.fillStyle = '#171d2b';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5 - Math.PI / 2; ctx.lineTo(Math.cos(a) * 5.5, Math.sin(a) * 5.5); }
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 - Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 5.5, Math.sin(a) * 5.5); ctx.lineTo(Math.cos(a) * BALL_R, Math.sin(a) * BALL_R); ctx.stroke();
    }
    ctx.restore();
  }

  function draw(ctx) {
    const t = SG.time.t;
    ctx.save();
    fx.applyShake(ctx);
    scenery.drawSky(ctx, W, H, 0, FLOOR, t);
    // pitch
    const g = ctx.createLinearGradient(0, FLOOR, 0, H);
    g.addColorStop(0, '#58b94f'); g.addColorStop(1, '#2f7a33');
    ctx.fillStyle = g; ctx.fillRect(0, FLOOR, W, H - FLOOR);
    for (let i = 0; i < W / 90 + 1; i++) { if (i % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(i * 90, FLOOR, 90, H - FLOOR); } }
    ctx.fillStyle = '#eaf7e6'; ctx.fillRect(0, FLOOR, W, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(W / 2 - 2, FLOOR, 4, H - FLOOR);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(W / 2, FLOOR + 44, 90, 26, 0, 0, Math.PI * 2); ctx.stroke();

    drawGoal(ctx, 0); drawGoal(ctx, 1);
    if (state !== 'menu' && p1) {
      p2.draw(ctx); p1.draw(ctx);
      drawBall(ctx);
    }
    fx.draw(ctx);
    ctx.restore();

    if (state !== 'menu' && p1) {
      const cx = W / 2;
      SG.rr(ctx, cx - 120, 10, 240, 46, 23); ctx.fillStyle = 'rgba(8,10,18,0.6)'; ctx.fill();
      label(ctx, 'P1', cx - 92, 40, 15, '#ff8a8a');
      label(ctx, `${score[0]}  :  ${score[1]}`, cx, 44, 28, '#ffffff');
      label(ctx, p2.name, cx + 90, 40, 15, '#8ac4ff');
      label(ctx, golden ? 'OLTIN GOL' : `⏱ ${Math.max(0, Math.ceil(timeLeft))}`, cx, 76, 15, timeLeft < 10 && !golden ? '#ff7a6b' : '#ffd34d');
      bar(ctx, SG.hudX() + 20, 24, 110, 10, p1.energy / 100, '#ffd34d', '#ff9a3d');
      bar(ctx, W - 132, 22, 120, 10, p2.energy / 100, '#ffd34d', '#ff9a3d');
      label(ctx, '⚡', SG.hudX() + 14, 35, 13, '#ffd34d', 'right', false);
      if (bannerT > 0) label(ctx, banner, cx, H * 0.4, 66, '#ffd34d');
    }
  }

  SG.run(update, draw);
  $('start-btn').addEventListener('click', startMatch);
  $('retry-btn').addEventListener('click', startMatch);
  if (/debug/.test(location.search)) window.__g = { get ball() { return ball; }, get p1() { return p1; }, get p2() { return p2; }, get score() { return score; }, get state() { return state; }, set time(v) { timeLeft = v; } };
})();
