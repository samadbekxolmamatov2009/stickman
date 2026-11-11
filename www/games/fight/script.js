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
  const MOVE_SPEED = 220;
  const MOVES = {
    punch: { range: 54, dmg: 10, cd: 0.38, active: 0.1, startup: 0.04 },
    kick: { range: 72, dmg: 16, cd: 0.62, active: 0.16, startup: 0.09 },
  };

  class Fighter {
    constructor(x, color, facing) {
      this.x = x; this.color = color; this.facing = facing;
      this.y = GROUND_Y; this.vy = 0; this.onGround = true;
      this.hp = MAX_HP;
      this.phase = 0;
      this.attackCd = 0;
      this.attackActive = 0;
      this.attackStartup = 0;
      this.attackType = null;
      this.hitstun = 0;
      this.iframes = 0;
      this.vx = 0;
      this.moveDir = 0;
      this.blocking = false;
      this.weaponTime = 0;
      this.dead = false;
    }
    takeHit(dmg, fromX) {
      if (this.iframes > 0 || this.dead) return;
      const blocked = this.blocking;
      const realDmg = blocked ? dmg * 0.25 : dmg;
      this.hp = Math.max(0, this.hp - realDmg);
      this.iframes = blocked ? 0.2 : 0.35;
      this.hitstun = blocked ? 0.08 : 0.18;
      const dir = this.x > fromX ? 1 : -1;
      this.vx = dir * (blocked ? 90 : 260);
      this.vy = blocked ? 0 : -220;
      if (!blocked) this.onGround = false;
      if (this.hp <= 0) this.dead = true;
      return blocked;
    }
    attack(type) {
      if (this.attackCd > 0 || this.hitstun > 0 || this.dead || this.blocking) return;
      const m = MOVES[type];
      this.attackCd = m.cd;
      this.attackStartup = m.startup;
      this.attackActive = m.active;
      this.attackType = type;
      sfx(type === 'kick' ? 220 : 320, 0.08, 'square', 0.07);
    }
    block(state) { this.blocking = state && this.onGround && this.hitstun <= 0; }
    pickupWeapon() { this.weaponTime = 10; }
    update(dt, particles) {
      if (this.attackCd > 0) this.attackCd -= dt;
      if (this.iframes > 0) this.iframes -= dt;
      if (this.hitstun > 0) this.hitstun -= dt;
      if (this.attackStartup > 0) this.attackStartup -= dt;
      else if (this.attackActive > 0) this.attackActive -= dt;
      if (this.weaponTime > 0) this.weaponTime -= dt;

      const canMove = this.hitstun <= 0 && !this.dead && !this.blocking;
      if (canMove) {
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

      if (this.moveDir !== 0 && this.onGround && canMove) this.phase += dt * 9;
    }
    jump() { if (this.onGround && this.hitstun <= 0 && !this.blocking) { this.vy = -520; this.onGround = false; sfx(420, 0.1, 'triangle', 0.06); } }
    get isActive() { return this.attackStartup <= 0 && this.attackActive > 0; }
    draw(ctx, label) {
      const legPhase = this.moveDir !== 0 && this.onGround ? Math.sin(this.phase) : 0;
      const attacking = this.attackStartup > 0 || this.attackActive > 0;
      drawSideStick(ctx, this.x, this.y, {
        color: this.color, scale: 1, height: 96,
        legPhase: this.blocking ? 0 : legPhase, legPhaseB: this.blocking ? 0 : legPhase + Math.PI,
        armPhase: attacking ? -1.6 * this.facing : (this.blocking ? -0.3 : Math.sin(this.phase + Math.PI)),
        armPhaseB: attacking ? 1.6 * this.facing : (this.blocking ? 0.3 : Math.sin(this.phase)),
        duck: this.blocking ? 0.18 : 0,
        dead: this.dead, label,
        weapon: this.weaponTime > 0 ? 'sword' : null,
      });
      if (this.blocking) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#cfd6e6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y - 55, 30, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  let p1, p2, particles, roundWins, bat, batTimer, state = 'start', shake = 0;

  function resetRound() {
    p1 = new Fighter(W * 0.3, '#ff5d5d', 1);
    p2 = new Fighter(W * 0.7, '#4da3ff', -1);
    particles = new Particles();
    bat = null;
    batTimer = rand(4, 7);
  }

  function startMatch() {
    roundWins = [0, 0];
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

  let botBlockTimer = 0;
  function aiThink(dt) {
    const dist = p1.x - p2.x;
    const absDist = Math.abs(dist);

    if (botBlockTimer > 0) {
      botBlockTimer -= dt;
      p2.block(true);
      p2.moveDir = 0;
      return;
    }
    p2.block(false);

    if (p1.isActive && absDist < 90 && Math.random() < 0.045) { botBlockTimer = 0.35; return; }

    p2.moveDir = 0;
    const kickRange = MOVES.kick.range, punchRange = MOVES.punch.range;
    if (absDist > kickRange - 6) p2.moveDir = dist > 0 ? 1 : -1;
    else if (Math.random() < 0.015) p2.jump();

    if (p2.attackCd <= 0) {
      if (absDist < punchRange && Math.random() < 0.03) p2.attack('punch');
      else if (absDist < kickRange && absDist > punchRange - 10 && Math.random() < 0.03) p2.attack('kick');
    }
    if (bat && Math.abs(bat.x - p2.x) < 90 && !bat.taken) p2.moveDir = bat.x > p2.x ? 1 : -1;
  }

  function checkHit(attacker, defender) {
    if (attacker.isActive) {
      const m = MOVES[attacker.attackType];
      const reach = attacker.x + attacker.facing * m.range;
      if (Math.abs(reach - defender.x) < 34 && Math.abs(attacker.x - defender.x) < m.range + 20) {
        const dmg = attacker.attackType === 'punch' && attacker.weaponTime > 0 ? m.dmg + 10 : m.dmg;
        const blocked = defender.takeHit(dmg, attacker.x);
        attacker.attackActive = 0;
        if (blocked) {
          particles.emit(defender.x, defender.y - 60, 6, { color: '200,210,230' });
          sfx(500, 0.06, 'square', 0.05);
        } else {
          particles.emit(defender.x, defender.y - 60, 10, { color: '255,200,120' });
          sfx(150, 0.12, 'sawtooth', 0.1);
          shake = 6;
        }
      }
    }
  }

  function updateBat(dt) {
    if (bat) {
      if (!bat.taken) {
        [p1, p2].forEach(f => {
          if (!bat.taken && f.onGround && Math.abs(f.x - bat.x) < 26) {
            bat.taken = true;
            f.pickupWeapon();
            particles.emit(bat.x, GROUND_Y - 20, 12, { color: '255,220,120' });
            sfx(700, 0.15, 'triangle', 0.08);
          }
        });
      }
      if (bat.taken) bat = null;
    } else {
      batTimer -= dt;
      if (batTimer <= 0) {
        bat = { x: rand(W * 0.35, W * 0.65), taken: false };
        batTimer = rand(7, 10);
      }
    }
  }

  function update(dt) {
    if (state !== 'playing') { if (particles) particles.update(dt); return; }
    if (mode === 'bot') aiThink(dt);
    p1.update(dt, particles);
    p2.update(dt, particles);
    particles.update(dt);
    updateBat(dt);

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

    if (bat && !bat.taken) {
      ctx.save();
      ctx.translate(bat.x, GROUND_Y - 14);
      ctx.rotate(-0.5);
      ctx.strokeStyle = '#8a6a3d';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(12, 0); ctx.stroke();
      ctx.restore();
    }

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
    if (e.code === 'KeyF') p1.attack('punch');
    if (e.code === 'KeyG') p1.attack('kick');
    if (mode === 'human') {
      if (e.code === 'ArrowUp') p2.jump();
      if (e.code === 'KeyL') p2.attack('punch');
      if (e.code === 'KeyK') p2.attack('kick');
    }
  });
  window.addEventListener('keyup', e => keys.delete(e.code));

  function applyHeldKeys() {
    if (state !== 'playing') return;
    p1.block(keys.has('KeyS'));
    p1.moveDir = p1.blocking ? 0 : (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    if (mode === 'human') {
      p2.block(keys.has('ArrowDown'));
      p2.moveDir = p2.blocking ? 0 : (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
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
  bindHold(document.getElementById('tc-atk'), () => { if (p1) p1.attack('punch'); });
  bindHold(document.getElementById('tc-kick'), () => { if (p1) p1.attack('kick'); }, () => {});
  bindHold(document.getElementById('tc-block'), () => { if (p1) p1.block(true); }, () => { if (p1) p1.block(false); });

  startBtn.addEventListener('click', startMatch);
  retryBtn.addEventListener('click', startMatch);
})();
