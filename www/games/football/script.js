(() => {
  'use strict';
  const { rand, clamp, sfx, Particles, drawTopDownStick } = Stk;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const GOAL_H = 170;
  const GOAL_Y0 = H / 2 - GOAL_H / 2;
  const GOAL_Y1 = H / 2 + GOAL_H / 2;
  const ROUND_TIME = 60;

  const hud = document.getElementById('hud');
  const score1El = document.getElementById('score1');
  const score2El = document.getElementById('score2');
  const p2nameEl = document.getElementById('p2name');
  const timerBar = document.getElementById('timer-bar');
  const startScreen = document.getElementById('start-screen');
  const resultsScreen = document.getElementById('results-screen');
  const winnerText = document.getElementById('winner-text');
  const startBtn = document.getElementById('start-btn');
  const retryBtn = document.getElementById('retry-btn');
  const modeSeg = document.getElementById('mode-seg');
  const touchControls = document.getElementById('touch-controls');
  const tcStick = document.getElementById('tc-stick');
  const tcKnob = document.getElementById('tc-knob');
  const tcShoot = document.getElementById('tc-shoot');

  let mode = 'bot';
  modeSeg.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    [...modeSeg.children].forEach(x => x.classList.toggle('active', x === b));
    mode = b.dataset.v;
    p2nameEl.textContent = mode === 'bot' ? 'BOT' : 'P2';
  });

  const PLAYER_R = 13, BALL_R = 8, MAX_SPEED = 230, ACCEL = 900, FRICTION = 6;

  class Player {
    constructor(x, y, color) {
      this.x = x; this.y = y; this.vx = 0; this.vy = 0;
      this.color = color; this.angle = 0; this.walk = 0;
      this.moveX = 0; this.moveY = 0;
      this.shootCd = 0;
    }
    update(dt) {
      const len = Math.hypot(this.moveX, this.moveY) || 1;
      const nx = this.moveX / len, ny = this.moveY / len;
      const moving = Math.hypot(this.moveX, this.moveY) > 0.1;
      if (moving) {
        this.vx += nx * ACCEL * dt;
        this.vy += ny * ACCEL * dt;
        this.angle = Math.atan2(ny, nx);
        this.walk += dt * 9;
      } else {
        this.vx -= this.vx * FRICTION * dt;
        this.vy -= this.vy * FRICTION * dt;
      }
      const sp = Math.hypot(this.vx, this.vy);
      if (sp > MAX_SPEED) { this.vx = (this.vx / sp) * MAX_SPEED; this.vy = (this.vy / sp) * MAX_SPEED; }
      this.x = clamp(this.x + this.vx * dt, PLAYER_R + 4, W - PLAYER_R - 4);
      this.y = clamp(this.y + this.vy * dt, PLAYER_R + 4, H - PLAYER_R - 4);
      if (this.shootCd > 0) this.shootCd -= dt;
    }
  }

  let ball, p1, p2, particles, scores, elapsed, state = 'start', shake = 0;

  function resetPositions(kickoffTo) {
    p1 = new Player(W * 0.28, H / 2, '#ff5d5d');
    p2 = new Player(W * 0.72, H / 2, '#4da3ff');
    ball = { x: W / 2, y: H / 2, vx: (kickoffTo === 1 ? -1 : 1) * 60, vy: rand(-30, 30), r: BALL_R };
  }

  function startMatch() {
    scores = [0, 0];
    elapsed = 0;
    particles = new Particles();
    resetPositions(0);
    state = 'playing';
    startScreen.classList.add('hidden');
    resultsScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    if ('ontouchstart' in window) touchControls.classList.remove('hidden');
    updateHud();
  }

  function updateHud() {
    score1El.textContent = scores[0];
    score2El.textContent = scores[1];
  }

  function endMatch() {
    state = 'results';
    const winner = scores[0] === scores[1] ? -1 : (scores[0] > scores[1] ? 0 : 1);
    winnerText.textContent = winner === -1 ? "Durrang!" : winner === 0 ? "P1 g'olib bo'ldi!" : (mode === 'bot' ? "Bot g'olib bo'ldi!" : "P2 g'olib bo'ldi!");
    hud.classList.add('hidden');
    touchControls.classList.add('hidden');
    setTimeout(() => resultsScreen.classList.remove('hidden'), 400);
  }

  function goal(scorer) {
    scores[scorer]++;
    updateHud();
    particles.emit(ball.x, ball.y, 20, { color: scorer === 0 ? '255,93,93' : '77,163,255' });
    sfx(scorer === 0 ? 523 : 392, 0.3, 'triangle', 0.1);
    shake = 10;
    if (scores[0] >= 3 || scores[1] >= 3) { endMatch(); return; }
    resetPositions(1 - scorer);
  }

  function kick(player, otherGoalX, strong) {
    const dx = ball.x - player.x, dy = ball.y - player.y;
    const d = Math.hypot(dx, dy) || 1;
    const aimX = otherGoalX - player.x, aimY = (H / 2) - player.y;
    const aimLen = Math.hypot(aimX, aimY) || 1;
    const dirX = strong ? aimX / aimLen : dx / d;
    const dirY = strong ? aimY / aimLen : dy / d;
    const power = strong ? 560 : 200 + Math.hypot(player.vx, player.vy) * 0.6;
    ball.vx = dirX * power + player.vx * 0.25;
    ball.vy = dirY * power + player.vy * 0.25;
    sfx(300, 0.08, 'triangle', 0.06);
  }

  function tryKick(player, idx) {
    const d = Math.hypot(ball.x - player.x, ball.y - player.y);
    if (d < PLAYER_R + BALL_R + 10) {
      const otherGoalX = idx === 0 ? W : 0;
      const strong = player.shootCd <= 0 && player.wantsShoot;
      if (strong) player.shootCd = 0.25;
      kick(player, otherGoalX, strong);
      player.wantsShoot = false;
    }
  }

  function aiThink(dt) {
    const toBallX = ball.x - p2.x, toBallY = ball.y - p2.y;
    const dBall = Math.hypot(toBallX, toBallY);
    const defend = ball.x > W * 0.55;
    if (dBall > 1) { p2.moveX = toBallX / dBall; p2.moveY = toBallY / dBall; }
    if (dBall < PLAYER_R + BALL_R + 14 && p2.shootCd <= 0 && Math.random() < 0.6) {
      p2.wantsShoot = true;
    }
    if (!defend && Math.random() < 0.01) { p2.moveX *= 0.3; p2.moveY *= 0.3; }
  }

  function update(dt) {
    if (state !== 'playing') { if (particles) particles.update(dt); return; }
    elapsed += dt;
    if (mode === 'bot') aiThink(dt);

    p1.update(dt);
    p2.update(dt);
    particles.update(dt);

    tryKick(p1, 0);
    tryKick(p2, 1);

    // player-player separation
    const pdx = p2.x - p1.x, pdy = p2.y - p1.y;
    const pd = Math.hypot(pdx, pdy) || 1;
    const minPSep = PLAYER_R * 2;
    if (pd < minPSep) {
      const push = (minPSep - pd) / 2;
      p1.x -= (pdx / pd) * push; p1.y -= (pdy / pd) * push;
      p2.x += (pdx / pd) * push; p2.y += (pdy / pd) * push;
    }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.vx -= ball.vx * 0.6 * dt;
    ball.vy -= ball.vy * 0.6 * dt;

    if (ball.y < ball.r) { ball.y = ball.r; ball.vy *= -0.6; }
    if (ball.y > H - ball.r) { ball.y = H - ball.r; ball.vy *= -0.6; }

    if (ball.x < -ball.r - 2) { if (ball.y > GOAL_Y0 && ball.y < GOAL_Y1) goal(1); else { ball.x = ball.r; ball.vx *= -0.6; } }
    else if (ball.x < ball.r && !(ball.y > GOAL_Y0 && ball.y < GOAL_Y1)) { ball.x = ball.r; ball.vx *= -0.6; }
    if (ball.x > W + ball.r + 2) { if (ball.y > GOAL_Y0 && ball.y < GOAL_Y1) goal(0); else { ball.x = W - ball.r; ball.vx *= -0.6; } }
    else if (ball.x > W - ball.r && !(ball.y > GOAL_Y0 && ball.y < GOAL_Y1)) { ball.x = W - ball.r; ball.vx *= -0.6; }

    if (shake > 0) shake *= 0.85;

    const pct = clamp(1 - elapsed / ROUND_TIME, 0, 1);
    timerBar.style.width = `${pct * 100}%`;
    if (elapsed >= ROUND_TIME) endMatch();
  }

  function drawPitch() {
    ctx.fillStyle = '#3f7a3a';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.03)';
      ctx.fillRect((W / 10) * i, 0, W / 10, H);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeRect(14, 14, W - 28, H - 28);
    ctx.beginPath(); ctx.moveTo(W / 2, 14); ctx.lineTo(W / 2, H - 14); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 60, 0, Math.PI * 2); ctx.stroke();

    // goal mouths
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, GOAL_Y0, 6, GOAL_H);
    ctx.strokeRect(W - 6, GOAL_Y0, 6, GOAL_H);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, GOAL_Y0, 26, GOAL_H);
    ctx.fillRect(W - 26, GOAL_Y0, 26, GOAL_H);
  }

  function draw() {
    ctx.save();
    if (shake > 0.5) ctx.translate(rand(-shake, shake), rand(-shake, shake));
    drawPitch();
    if (p1) {
      drawTopDownStick(ctx, p1.x, p1.y, p1.angle, p1.color, 1.3, { walk: p1.walk, label: 'P1' });
      drawTopDownStick(ctx, p2.x, p2.y, p2.angle, p2.color, 1.3, { walk: p2.walk, label: mode === 'bot' ? 'BOT' : 'P2' });

      ctx.save();
      ctx.translate(ball.x, ball.y);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath(); ctx.ellipse(0, 3, ball.r * 0.9, ball.r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, ball.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(0, 0, ball.r * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      particles.draw(ctx);
    }
    ctx.restore();
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ---------- input ----------
  const keys = new Set();
  window.addEventListener('keydown', e => {
    keys.add(e.code);
    if (state === 'start' && e.code === 'Space') startMatch();
    if (state !== 'playing') return;
    if (e.code === 'KeyF') p1.wantsShoot = true;
    if (mode === 'human' && e.code === 'KeyL') p2.wantsShoot = true;
  });
  window.addEventListener('keyup', e => keys.delete(e.code));

  function applyHeldKeys() {
    if (state !== 'playing') return;
    p1.moveX = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    p1.moveY = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0);
    if (mode === 'human') {
      p2.moveX = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
      p2.moveY = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
    }
  }
  setInterval(applyHeldKeys, 16);

  // touch stick
  let stickActive = false, stickCenter = { x: 0, y: 0 };
  tcStick.addEventListener('pointerdown', e => {
    stickActive = true;
    const r = tcStick.getBoundingClientRect();
    stickCenter = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  window.addEventListener('pointermove', e => {
    if (!stickActive || !p1) return;
    let dx = e.clientX - stickCenter.x, dy = e.clientY - stickCenter.y;
    const d = Math.hypot(dx, dy) || 1;
    const clampD = Math.min(35, d);
    tcKnob.style.transform = `translate(${(dx / d) * clampD}px, ${(dy / d) * clampD}px)`;
    p1.moveX = clamp(dx / 30, -1, 1);
    p1.moveY = clamp(dy / 30, -1, 1);
  });
  window.addEventListener('pointerup', () => {
    if (!stickActive) return;
    stickActive = false;
    tcKnob.style.transform = 'translate(0,0)';
    if (p1) { p1.moveX = 0; p1.moveY = 0; }
  });
  tcShoot.addEventListener('pointerdown', e => { e.preventDefault(); if (p1) p1.wantsShoot = true; });

  startBtn.addEventListener('click', startMatch);
  retryBtn.addEventListener('click', startMatch);
})();
