(() => {
  'use strict';
  const { rand, clamp, sfx, Particles, drawSideStick, drawSky } = Stk;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PATH_Y = H * 0.56;
  const GATE_X = W - 20;
  const TOTAL_WAVES = 8;

  const hud = document.getElementById('hud');
  const buildBar = document.getElementById('build-bar');
  const goldEl = document.getElementById('gold');
  const livesEl = document.getElementById('lives');
  const waveEl = document.getElementById('wave');
  const startScreen = document.getElementById('start-screen');
  const resultsScreen = document.getElementById('results-screen');
  const resultTitle = document.getElementById('result-title');
  const startBtn = document.getElementById('start-btn');
  const retryBtn = document.getElementById('retry-btn');

  const TOWER_TYPES = {
    archer: { cost: 40, range: 150, dmg: 13, rate: 1.1, color: '#ff5d5d', label: 'bow' },
    spear: { cost: 25, range: 58, dmg: 24, rate: 1.4, color: '#4da3ff', label: null },
  };

  let selectedType = 'archer';
  document.querySelectorAll('.build-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.build-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedType = btn.dataset.t;
    });
  });

  const SLOTS = [];
  for (let i = 0; i < 6; i++) {
    SLOTS.push({ x: 150 + i * 130, y: PATH_Y + (i % 2 === 0 ? -70 : 70), tower: null });
  }

  let state = 'start';
  let gold, lives, wave, waveTimer, spawnQueue, spawnTimer, enemies, towers, projectiles, particles;

  function startGame() {
    gold = 80; lives = 10; wave = 0;
    enemies = []; towers = []; projectiles = [];
    particles = new Particles();
    nextWaveTimer = 0;
    SLOTS.forEach(s => s.tower = null);
    state = 'playing';
    startScreen.classList.add('hidden');
    resultsScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    buildBar.classList.remove('hidden');
    updateHud();
    nextWave();
  }

  function updateHud() {
    goldEl.textContent = gold;
    livesEl.textContent = lives;
    waveEl.textContent = Math.min(wave, TOTAL_WAVES);
  }

  function nextWave() {
    wave++;
    if (wave > TOTAL_WAVES) { victory(); return; }
    const count = 4 + wave;
    spawnQueue = count;
    spawnTimer = 0.2;
    updateHud();
  }

  function spawnEnemy() {
    const hp = 26 + wave * 9;
    enemies.push({
      x: -20, y: PATH_Y, hp, maxHp: hp,
      speed: 46 + wave * 2.2 + rand(-4, 4),
      phase: rand(0, 6), scale: 0.85,
    });
  }

  function defeat() {
    state = 'results';
    resultTitle.textContent = 'Mag\'lubiyat...';
    hud.classList.add('hidden');
    buildBar.classList.add('hidden');
    setTimeout(() => resultsScreen.classList.remove('hidden'), 400);
  }

  function victory() {
    state = 'results';
    resultTitle.textContent = "G'alaba! Barcha to'lqinlar qaytarildi!";
    hud.classList.add('hidden');
    buildBar.classList.add('hidden');
    setTimeout(() => resultsScreen.classList.remove('hidden'), 400);
  }

  function placeTower(slot) {
    const def = TOWER_TYPES[selectedType];
    if (slot.tower || gold < def.cost) { sfx(140, 0.1, 'square', 0.08); return; }
    gold -= def.cost;
    slot.tower = { type: selectedType, x: slot.x, y: slot.y, cooldown: 0 };
    towers.push(slot.tower);
    sfx(520, 0.1, 'triangle', 0.08);
    updateHud();
  }

  function update(dt) {
    if (state !== 'playing') { if (particles) particles.update(dt); return; }

    if (spawnQueue > 0) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) { spawnEnemy(); spawnQueue--; spawnTimer = 0.85; }
    } else if (enemies.length === 0) {
      if (!nextWaveTimer) nextWaveTimer = 2.5;
    }
    if (nextWaveTimer) {
      nextWaveTimer -= dt;
      if (nextWaveTimer <= 0) { nextWaveTimer = 0; nextWave(); }
    }

    enemies.forEach(e => {
      e.x += e.speed * dt;
      e.phase += dt * 8;
    });
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].x >= GATE_X) {
        enemies.splice(i, 1);
        lives--;
        sfx(100, 0.3, 'sawtooth', 0.1);
        updateHud();
        if (lives <= 0) { defeat(); return; }
      }
    }

    towers.forEach(t => {
      const def = TOWER_TYPES[t.type];
      if (t.cooldown > 0) t.cooldown -= dt;
      let target = null, bestD = def.range;
      for (const e of enemies) {
        const d = Math.hypot(e.x - t.x, e.y - t.y);
        if (d < bestD) { bestD = d; target = e; }
      }
      if (target && t.cooldown <= 0) {
        t.cooldown = def.rate;
        if (t.type === 'archer') {
          projectiles.push({ x: t.x, y: t.y - 30, target, dmg: def.dmg, speed: 420 });
          sfx(600, 0.06, 'triangle', 0.05);
        } else {
          target.hp -= def.dmg;
          particles.emit(target.x, target.y - 30, 6, { color: '120,180,255' });
          sfx(220, 0.07, 'square', 0.06);
        }
      }
    });

    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      if (!enemies.includes(p.target)) { projectiles.splice(i, 1); continue; }
      const dx = p.target.x - p.x, dy = (p.target.y - 30) - p.y;
      const d = Math.hypot(dx, dy) || 1;
      p.x += (dx / d) * p.speed * dt;
      p.y += (dy / d) * p.speed * dt;
      if (d < 10) {
        p.target.hp -= p.dmg;
        particles.emit(p.x, p.y, 6, { color: '255,200,120' });
        projectiles.splice(i, 1);
      }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].hp <= 0) {
        particles.emit(enemies[i].x, enemies[i].y - 30, 10, { color: '255,120,100' });
        sfx(180, 0.1, 'sawtooth', 0.08);
        gold += 8;
        enemies.splice(i, 1);
        updateHud();
      }
    }

    particles.update(dt);
  }

  let nextWaveTimer = 0;

  function drawPath() {
    drawSky(ctx, W, H, '#8fd0f0', '#bfe3f0', '#cfe8d8');
    const g = ctx.createLinearGradient(0, PATH_Y - 34, 0, PATH_Y + 34);
    g.addColorStop(0, '#caa36a'); g.addColorStop(1, '#8a6a3d');
    ctx.fillStyle = g;
    ctx.fillRect(0, PATH_Y - 34, W, 68);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    for (let x = 0; x < W; x += 36) ctx.fillRect(x, PATH_Y - 2, 20, 4);

    ctx.fillStyle = '#5a4524';
    ctx.fillRect(GATE_X - 6, PATH_Y - 40, 10, 80);

    const grassG = ctx.createLinearGradient(0, 0, 0, H);
    grassG.addColorStop(0, 'rgba(111,191,106,0.0)');
    ctx.fillStyle = 'rgba(111,191,106,0.5)';
    ctx.fillRect(0, 0, W, PATH_Y - 34);
    ctx.fillRect(0, PATH_Y + 34, W, H - (PATH_Y + 34));
  }

  function draw() {
    drawPath();
    if (!towers) return;

    SLOTS.forEach(s => {
      if (!s.tower) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(s.x, s.y, 20, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    });

    towers.forEach(t => {
      const def = TOWER_TYPES[t.type];
      drawSideStick(ctx, t.x, t.y + 34, { color: def.color, scale: 0.95, height: 80, legPhase: 0.2, legPhaseB: -0.2, armPhase: -0.3, armPhaseB: 0.5, weapon: t.type === 'archer' ? 'bow' : 'sword' });
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath(); ctx.arc(t.x, t.y, def.range, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    });

    enemies.forEach(e => {
      drawSideStick(ctx, e.x, e.y, { color: '#8a3fc2', scale: e.scale, height: 82, legPhase: Math.sin(e.phase), legPhaseB: Math.sin(e.phase + Math.PI), armPhase: Math.sin(e.phase + Math.PI), armPhaseB: Math.sin(e.phase) });
      const bw = 34;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(e.x - bw / 2, e.y - 95, bw, 5);
      ctx.fillStyle = '#ff5d5d';
      ctx.fillRect(e.x - bw / 2, e.y - 95, bw * clamp(e.hp / e.maxHp, 0, 1), 5);
    });

    projectiles.forEach(p => {
      ctx.fillStyle = '#3a2a1a';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
    });

    particles.draw(ctx);

    if (nextWaveTimer > 0 && state === 'playing') {
      ctx.save();
      ctx.font = 'bold 20px Trebuchet MS, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd34d';
      ctx.fillText(`Keyingi to'lqin: ${Math.ceil(nextWaveTimer)}`, W / 2, 40);
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

  function canvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width / r.width, scaleY = canvas.height / r.height;
    const cx = (e.clientX ?? e.touches?.[0]?.clientX) - r.left;
    const cy = (e.clientY ?? e.touches?.[0]?.clientY) - r.top;
    return { x: cx * scaleX, y: cy * scaleY };
  }

  canvas.addEventListener('pointerdown', e => {
    if (state !== 'playing') return;
    const p = canvasPoint(e);
    for (const s of SLOTS) {
      if (Math.hypot(p.x - s.x, p.y - s.y) < 24) { placeTower(s); break; }
    }
  });

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', startGame);
})();
