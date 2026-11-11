(() => {
  'use strict';
  const { rand, clamp, sfx, Particles, drawSideStick, drawSky } = Stk;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const GROUND_Y = H - 90;
  const GRAVITY = 520;
  const WIND_ACCEL = 16;
  const MAX_POWER = 780;
  const CHARGE_RATE = 560;
  const DEFAULT_PREVIEW_POWER = 560;

  const hud = document.getElementById('hud');
  const score1El = document.getElementById('score1');
  const score2El = document.getElementById('score2');
  const windArrowEl = document.getElementById('wind-arrow');
  const windValEl = document.getElementById('wind-val');
  const turnLabelEl = document.getElementById('turn-label');
  const powerBarEl = document.getElementById('power-bar');
  const startScreen = document.getElementById('start-screen');
  const resultsScreen = document.getElementById('results-screen');
  const winnerText = document.getElementById('winner-text');
  const startBtn = document.getElementById('start-btn');
  const retryBtn = document.getElementById('retry-btn');
  const modeSeg = document.getElementById('mode-seg');
  const touchAim = document.getElementById('touch-aim');

  let mode = 'bot';
  modeSeg.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    [...modeSeg.children].forEach(x => x.classList.toggle('active', x === b));
    mode = b.dataset.v;
  });

  const P1X = 110, P2X = W - 110;
  let state = 'start'; // start | aiming | flying | turnend | results
  let turn = 0; // 0 = P1, 1 = P2
  let angle = [0.65, 0.65];
  let power = 0;
  let charging = false;
  let wind = 0;
  let arrow = null;
  let particles;
  let scores = [0, 0];
  let botTimer = 0;
  let turnEndTimer = 0;
  let hitFlash = null;

  function archerX(i) { return i === 0 ? P1X : P2X; }
  function dir(i) { return i === 0 ? 1 : -1; }

  function newWind() { wind = rand(-1, 1) * rand(0.15, 0.55); }

  function startMatch() {
    scores = [0, 0];
    turn = 0;
    angle = [0.65, 0.65];
    particles = new Particles();
    newWind();
    arrow = null;
    power = 0; charging = false;
    state = 'aiming';
    startScreen.classList.add('hidden');
    resultsScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    if ('ontouchstart' in window) touchAim.classList.remove('hidden');
    updateHud();
  }

  function updateHud() {
    score1El.textContent = scores[0];
    score2El.textContent = scores[1];
    windArrowEl.textContent = wind >= 0 ? '→' : '←';
    windArrowEl.style.transform = wind >= 0 ? 'none' : 'scaleX(-1)';
    windValEl.textContent = Math.abs(wind).toFixed(1);
    turnLabelEl.textContent = turn === 0 ? "P1 navbati" : (mode === 'bot' ? 'BOT o\'ylamoqda…' : 'P2 navbati');
  }

  function fire(p) {
    const a = angle[turn];
    const d = dir(turn);
    const vx = Math.cos(a) * p * d;
    const vy = -Math.sin(a) * p;
    arrow = { x: archerX(turn) + d * 20, y: GROUND_Y - 60, vx, vy, trail: [] };
    state = 'flying';
    sfx(500, 0.1, 'triangle', 0.07);
  }

  function endTurn(hit) {
    state = 'turnend';
    turnEndTimer = hit ? 0.9 : 0.5;
    if (!hit) {
      turn = 1 - turn;
      newWind();
    }
  }

  function checkMatchOver() {
    if (scores[0] >= 3 || scores[1] >= 3) {
      state = 'results';
      const winner = scores[0] >= 3 ? 0 : 1;
      winnerText.textContent = winner === 0 ? "P1 g'olib bo'ldi!" : (mode === 'bot' ? "Bot g'olib bo'ldi!" : "P2 g'olib bo'ldi!");
      hud.classList.add('hidden');
      touchAim.classList.add('hidden');
      setTimeout(() => resultsScreen.classList.remove('hidden'), 400);
      return true;
    }
    return false;
  }

  function botAct(dt) {
    if (botTimer > 0) { botTimer -= dt; return; }
    const dist = Math.abs(P2X - P1X);
    const estPower = clamp(520 + dist * 0.32, 520, 740) + rand(-40, 40);
    const estAngle = clamp(0.5 + rand(-0.1, 0.1) - wind * dir(1) * 0.04, 0.25, 1.1);
    angle[1] = estAngle;
    fire(estPower);
  }

  function update(dt) {
    if (state === 'aiming') {
      if (turn === 1 && mode === 'bot') {
        botAct(dt);
      } else if (charging) {
        power = Math.min(MAX_POWER, power + CHARGE_RATE * dt);
        powerBarEl.style.width = `${(power / MAX_POWER) * 100}%`;
      }
    } else if (state === 'flying') {
      arrow.vy += GRAVITY * dt;
      arrow.vx += wind * WIND_ACCEL * dt;
      arrow.x += arrow.vx * dt;
      arrow.y += arrow.vy * dt;
      arrow.trail.push({ x: arrow.x, y: arrow.y });
      if (arrow.trail.length > 12) arrow.trail.shift();

      const targetIdx = 1 - turn;
      const tx = archerX(targetIdx);
      const headY = GROUND_Y - 84;
      const bodyY = GROUND_Y - 44;
      const headHit = Stk.circleHit(arrow.x, arrow.y, 5, tx, headY, 15);
      const bodyHit = !headHit && Stk.circleHit(arrow.x, arrow.y, 5, tx, bodyY, 30);
      if (headHit || bodyHit) {
        const pts = headHit ? 2 : 1;
        scores[turn] += pts;
        updateHud();
        hitFlash = { text: headHit ? "BOSH! +2" : '+1', x: tx, y: headHit ? headY : bodyY, t: 1 };
        particles.emit(arrow.x, arrow.y, headHit ? 22 : 14, { color: headHit ? '255,210,80' : '255,120,100', vxMin: -140, vxMax: 140, vyMin: -160, vyMax: 20 });
        sfx(headHit ? 260 : 180, 0.25, 'sawtooth', 0.12);
        arrow = null;
        if (!checkMatchOver()) { turn = 1 - turn; newWind(); endTurn(true); }
        else state = 'results';
      } else if (arrow.y >= GROUND_Y || arrow.x < -20 || arrow.x > W + 20) {
        particles.emit(clamp(arrow.x, 0, W), GROUND_Y, 6, { color: '160,140,100', vyMin: -60, vyMax: -10 });
        arrow = null;
        endTurn(false);
      }
    } else if (state === 'turnend') {
      turnEndTimer -= dt;
      if (turnEndTimer <= 0) {
        power = 0; charging = false;
        powerBarEl.style.width = '0%';
        updateHud();
        state = 'aiming';
        if (turn === 1 && mode === 'bot') botTimer = rand(0.5, 1.0);
      }
    }
    if (particles) particles.update(dt);
    if (hitFlash) { hitFlash.t -= dt * 0.6; if (hitFlash.t <= 0) hitFlash = null; }
  }

  function computeTrajectory(a, p, d) {
    const pts = [];
    let x = archerX(turn) + d * 20, y = GROUND_Y - 60;
    let vx = Math.cos(a) * p * d, vy = -Math.sin(a) * p;
    for (let i = 0; i < 70; i++) {
      vy += GRAVITY * 0.03;
      x += vx * 0.03;
      y += vy * 0.03;
      if (i % 2 === 0) pts.push({ x, y });
      if (y >= GROUND_Y || x < 0 || x > W) break;
    }
    return pts;
  }

  function drawField() {
    drawSky(ctx, W, H, '#5fb6e8', '#bfe3f0', '#e8f6ee');
    const g = ctx.createLinearGradient(0, GROUND_Y, 0, H);
    g.addColorStop(0, '#8ad46a'); g.addColorStop(1, '#4f9a3a');
    ctx.fillStyle = g;
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(0, GROUND_Y, W, 4);
  }

  function drawAimLine(i) {
    const a = angle[i];
    const d = dir(i);
    const x = archerX(i), y = GROUND_Y - 60;
    const len = 36;
    ctx.save();
    ctx.strokeStyle = i === 0 ? 'rgba(255,93,93,0.8)' : 'rgba(77,163,255,0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len * d, y - Math.sin(a) * len);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function draw() {
    drawField();
    if (state === 'start') return;

    if (state === 'aiming' || state === 'turnend') drawAimLine(turn);

    if (state === 'aiming' && canAct()) {
      const previewPower = charging ? Math.max(power, 160) : DEFAULT_PREVIEW_POWER;
      const pts = computeTrajectory(angle[turn], previewPower, dir(turn));
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill(); });
      ctx.restore();
    }

    drawSideStick(ctx, P1X, GROUND_Y, { color: '#ff5d5d', scale: 1, height: 90, legPhase: 0.3, legPhaseB: -0.3, armPhase: -0.4, armPhaseB: 0.6, weapon: 'bow', label: 'P1' });
    ctx.save(); ctx.scale(-1, 1);
    drawSideStick(ctx, -P2X, GROUND_Y, { color: '#4da3ff', scale: 1, height: 90, legPhase: 0.3, legPhaseB: -0.3, armPhase: -0.4, armPhaseB: 0.6, weapon: 'bow' });
    ctx.restore();
    ctx.save();
    ctx.font = '11px Trebuchet MS, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4da3ff';
    ctx.fillText(mode === 'bot' ? 'BOT' : 'P2', P2X, GROUND_Y - 90 - 30);
    ctx.restore();

    if (arrow) {
      ctx.save();
      ctx.strokeStyle = 'rgba(200,180,140,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      arrow.trail.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();

      const ang = Math.atan2(arrow.vy, arrow.vx);
      ctx.translate(arrow.x, arrow.y);
      ctx.rotate(ang);
      ctx.strokeStyle = '#3a2a1a';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(10, 0); ctx.stroke();
      ctx.fillStyle = '#cfd6e6';
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(4, -3); ctx.lineTo(4, 3); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    particles.draw(ctx);

    if (hitFlash) {
      ctx.save();
      ctx.globalAlpha = clamp(hitFlash.t, 0, 1);
      ctx.font = 'bold 22px Trebuchet MS, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd34d';
      ctx.fillText(hitFlash.text, hitFlash.x, hitFlash.y - 20 - (1 - hitFlash.t) * 30);
      ctx.restore();
    }
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

  function canAct() { return state === 'aiming' && !(turn === 1 && mode === 'bot'); }

  window.addEventListener('keydown', e => {
    if (state === 'start' && e.code === 'Space') { e.preventDefault(); startMatch(); return; }
    if (!canAct()) return;
    if (e.code === 'ArrowUp') { e.preventDefault(); angle[turn] = clamp(angle[turn] + 0.02, 0.15, 1.3); }
    if (e.code === 'ArrowDown') { e.preventDefault(); angle[turn] = clamp(angle[turn] - 0.02, 0.15, 1.3); }
    if (e.code === 'Space') { e.preventDefault(); if (!charging) charging = true; }
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'Space' && charging) {
      charging = false;
      fire(Math.max(140, power));
    }
  });

  let dragStartY = null;
  touchAim.addEventListener('pointerdown', e => {
    if (!canAct()) return;
    charging = true;
    dragStartY = e.clientY;
  });
  touchAim.addEventListener('pointermove', e => {
    if (!charging || dragStartY === null) return;
    const dy = dragStartY - e.clientY;
    angle[turn] = clamp(0.65 + dy * 0.004, 0.15, 1.3);
  });
  window.addEventListener('pointerup', () => {
    if (charging) { charging = false; fire(Math.max(140, power)); }
    dragStartY = null;
  });

  startBtn.addEventListener('click', startMatch);
  retryBtn.addEventListener('click', startMatch);
})();
