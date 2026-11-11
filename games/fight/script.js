(() => {
  'use strict';
  const { rand, clamp, sfx, Particles, drawSideStick, drawSky } = Stk;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const GROUND_Y = H - 90;

  const hud = document.getElementById('hud');
  const hp1El = document.getElementById('hp1');
  const hp2El = document.getElementById('hp2');
  const roundsEl = document.getElementById('rounds');
  const p2nameEl = document.getElementById('p2name');
  const startScreen = document.getElementById('start-screen');
  const resultsScreen = document.getElementById('results-screen');
  const winnerText = document.getElementById('winner-text');
  const startBtn = document.getElementById('start-btn');
  const retryBtn = document.getElementById('retry-btn');
  const modeSeg = document.getElementById('mode-seg');
  const touchControls = document.getElementById('touch-controls');

  let mode = 'bot';
  modeSeg.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    [...modeSeg.children].forEach(x => x.classList.toggle('active', x === b));
    mode = b.dataset.v;
    p2nameEl.textContent = mode === 'bot' ? 'BOT' : 'P2';
  });

  const MAX_HP = 100;
  const ATTACK_RANGE = 56;
  const MOVE_SPEED = 220;

  class Fighter {
    constructor(x, color, facing) {
      this.x = x; this.color = color; this.facing = facing;
      this.y = GROUND_Y; this.vy = 0; this.onGround = true;
      this.hp = MAX_HP;
      this.phase = 0;
      this.attackCd = 0;
      this.attackActive = 0;
      this.hitstun = 0;
      this.iframes = 0;
      this.vx = 0;
      this.moveDir = 0;
      this.dead = false;
    }
    takeHit(dmg, fromX) {
      if (this.iframes > 0 || this.dead) return;
      this.hp = Math.max(0, this.hp - dmg);
      this.iframes = 0.35;
      this.hitstun = 0.18;
      const dir = this.x > fromX ? 1 : -1;
      this.vx = dir * 260;
      this.vy = -220;
      this.onGround = false;
      if (this.hp <= 0) this.dead = true;
    }
    attack() {
      if (this.attackCd > 0 || this.hitstun > 0 || this.dead) return;
      this.attackCd = 0.5;
      this.attackActive = 0.14;
      sfx(300, 0.08, 'square', 0.07);
    }
    update(dt, particles) {
      if (this.attackCd > 0) this.attackCd -= dt;
      if (this.iframes > 0) this.iframes -= dt;
      if (this.hitstun > 0) this.hitstun -= dt;
      if (this.attackActive > 0) this.attackActive -= dt;

      if (this.hitstun <= 0 && !this.dead) {
        this.x += this.moveDir * MOVE_SPEED * dt;
      } else {
        this.x += this.vx * dt;
        this.vx *= 0.9;
      }
      this.x = clamp(this.x, 40, W - 40);

      if (!this.onGround) {
        this.vy += 1500 * dt;
        this.y += this.vy * dt;
        if (this.y >= GROUND_Y) { this.y = GROUND_Y; this.vy = 0; this.onGround = true; }
      }

      if (this.moveDir !== 0 && this.onGround && this.hitstun <= 0) this.phase += dt * 9;
    }
    jump() { if (this.onGround && this.hitstun <= 0) { this.vy = -520; this.onGround = false; sfx(420, 0.1, 'triangle', 0.06); } }
    draw(ctx, label) {
      const legPhase = this.moveDir !== 0 && this.onGround ? Math.sin(this.phase) : 0;
      drawSideStick(ctx, this.x, this.y, {
        color: this.color, scale: 1, height: 96,
        legPhase, legPhaseB: legPhase + Math.PI,
        armPhase: this.attackActive > 0 ? -1.6 * this.facing : Math.sin(this.phase + Math.PI),
        armPhaseB: this.attackActive > 0 ? 1.6 * this.facing : Math.sin(this.phase),
        dead: this.dead, label,
      });
    }
  }

  let p1, p2, particles, roundWins, roundNum, state = 'start', shake = 0;

  function resetRound() {
    p1 = new Fighter(W * 0.3, '#ff5d5d', 1);
    p2 = new Fighter(W * 0.7, '#4da3ff', -1);
    particles = new Particles();
  }

  function startMatch() {
    roundWins = [0, 0];
    roundNum = 1;
    resetRound();
    state = 'playing';
    startScreen.classList.add('hidden');
    resultsScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    if ('ontouchstart' in window) touchControls.classList.remove('hidden');
    renderRounds();
  }

  function renderRounds() {
    roundsEl.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const d = document.createElement('div');
      d.className = 'pip';
      if (i < roundWins[0]) d.className = 'pip p1';
      else if (i < roundWins[0] + roundWins[1]) d.className = 'pip p2';
      roundsEl.appendChild(d);
    }
  }

  function endRound(winnerIdx) {
    roundWins[winnerIdx]++;
    renderRounds();
    if (roundWins[winnerIdx] >= 2) {
      state = 'results';
      winnerText.textContent = winnerIdx === 0 ? "P1 g'olib bo'ldi!" : (mode === 'bot' ? "Bot g'olib bo'ldi!" : "P2 g'olib bo'ldi!");
      hud.classList.add('hidden');
      touchControls.classList.add('hidden');
      setTimeout(() => resultsScreen.classList.remove('hidden'), 500);
    } else {
      state = 'intermission';
      setTimeout(() => { resetRound(); state = 'playing'; }, 1200);
    }
  }

  function aiThink(dt) {
    const dist = p1.x - p2.x;
    const absDist = Math.abs(dist);
    p2.moveDir = 0;
    if (absDist > ATTACK_RANGE + 10) p2.moveDir = dist > 0 ? 1 : -1;
    else if (Math.random() < 0.02) p2.jump();
    if (absDist < ATTACK_RANGE && p2.attackCd <= 0 && Math.random() < 0.035) p2.attack();
  }

  function checkHit(attacker, defender) {
    if (attacker.attackActive > 0 && attacker.attackActive > 0.08) {
      const reach = attacker.x + attacker.facing * ATTACK_RANGE;
      if (Math.abs(reach - defender.x) < 34 && Math.abs(attacker.x - defender.x) < ATTACK_RANGE + 20) {
        defender.takeHit(12, attacker.x);
        attacker.attackActive = 0;
        particles.emit(defender.x, defender.y - 60, 10, { color: '255,200,120' });
        sfx(150, 0.12, 'sawtooth', 0.1);
        shake = 6;
      }
    }
  }

  function update(dt) {
    if (state !== 'playing') { if (particles) particles.update(dt); return; }
    if (mode === 'bot') aiThink(dt);
    p1.update(dt, particles);
    p2.update(dt, particles);
    particles.update(dt);

    // always face each other; keep a minimum separation so attacks can't whiff by passing through
    p1.facing = p2.x >= p1.x ? 1 : -1;
    p2.facing = p1.x >= p2.x ? 1 : -1;
    const minSep = 46;
    const gap = p2.x - p1.x;
    if (Math.abs(gap) < minSep && p1.hitstun <= 0 && p2.hitstun <= 0) {
      const push = (minSep - Math.abs(gap)) / 2;
      const dir = gap >= 0 ? 1 : -1;
      p1.x = clamp(p1.x - push * dir, 40, W - 40);
      p2.x = clamp(p2.x + push * dir, 40, W - 40);
    }

    checkHit(p1, p2);
    checkHit(p2, p1);
    if (shake > 0) shake *= 0.85;

    hp1El.style.width = `${(p1.hp / MAX_HP) * 100}%`;
    hp2El.style.width = `${(p2.hp / MAX_HP) * 100}%`;

    if (p1.dead) endRound(1);
    else if (p2.dead) endRound(0);
  }

  function draw() {
    drawSky(ctx, W, H, '#3a4a7a', '#55658f', '#6f7aa5');
    ctx.save();
    if (shake > 0.5) ctx.translate(rand(-shake, shake), rand(-shake, shake));

    const g = ctx.createLinearGradient(0, GROUND_Y, 0, H);
    g.addColorStop(0, '#3a2f4a'); g.addColorStop(1, '#241c30');
    ctx.fillStyle = g;
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, GROUND_Y, W, 3);

    if (p1 && p2) {
      p1.draw(ctx, 'P1');
      p2.draw(ctx, mode === 'bot' ? 'BOT' : 'P2');
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
    if (e.code === 'KeyW') p1.jump();
    if (e.code === 'KeyF') p1.attack();
    if (mode === 'human') {
      if (e.code === 'ArrowUp') p2.jump();
      if (e.code === 'KeyL') p2.attack();
    }
  });
  window.addEventListener('keyup', e => keys.delete(e.code));

  function applyHeldKeys() {
    if (state !== 'playing') return;
    p1.moveDir = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    if (mode === 'human') {
      p2.moveDir = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
    }
  }
  setInterval(applyHeldKeys, 16);

  // touch
  function bindHold(el, onDown, onUp) {
    el.addEventListener('pointerdown', e => { e.preventDefault(); onDown(); });
    el.addEventListener('pointerup', e => { e.preventDefault(); onUp && onUp(); });
    el.addEventListener('pointerleave', e => { onUp && onUp(); });
  }
  bindHold(document.getElementById('tc-left'), () => { if (p1) p1.moveDir = -1; }, () => { if (p1 && p1.moveDir === -1) p1.moveDir = 0; });
  bindHold(document.getElementById('tc-right'), () => { if (p1) p1.moveDir = 1; }, () => { if (p1 && p1.moveDir === 1) p1.moveDir = 0; });
  bindHold(document.getElementById('tc-jump'), () => { if (p1) p1.jump(); });
  bindHold(document.getElementById('tc-atk'), () => { if (p1) p1.attack(); });

  startBtn.addEventListener('click', startMatch);
  retryBtn.addEventListener('click', startMatch);
})();
