(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const W = canvas.width;
  const H = canvas.height;
  const GROUND_Y = H - 110;

  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const startScreen = document.getElementById('start-screen');
  const gameoverScreen = document.getElementById('gameover-screen');
  const finalScoreEl = document.getElementById('final-score');
  const startBtn = document.getElementById('start-btn');
  const retryBtn = document.getElementById('retry-btn');
  const touchJumpBtn = document.getElementById('touch-jump');

  const STORAGE_KEY = 'stickman_run_best';

  // ---------- audio (tiny WebAudio beeps, no asset files) ----------
  let actx = null;
  function sfx(freq, dur, type = 'sine', gain = 0.08) {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g);
      g.connect(actx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.stop(actx.currentTime + dur);
    } catch (e) { /* audio not available, ignore */ }
  }
  const sndJump = () => sfx(520, 0.18, 'triangle', 0.09);
  const sndCoin = () => sfx(880, 0.12, 'square', 0.06);
  const sndHit = () => sfx(110, 0.4, 'sawtooth', 0.12);

  // ---------- helpers ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- parallax background ----------
  class Background {
    constructor() {
      this.clouds = Array.from({ length: 6 }, () => ({
        x: rand(0, W), y: rand(30, 160), r: rand(24, 48), speed: rand(6, 14),
      }));
      this.mountains = Array.from({ length: 5 }, (_, i) => ({
        x: i * (W / 4), w: rand(220, 340), h: rand(90, 170),
      }));
      this.groundDecor = Array.from({ length: 24 }, () => ({
        x: rand(0, W), scale: rand(0.6, 1.3),
      }));
    }

    update(dt, speed) {
      this.clouds.forEach(c => {
        c.x -= c.speed * dt;
        if (c.x < -60) c.x = W + 60;
      });
      this.mountains.forEach(m => {
        m.x -= speed * 0.15 * dt;
        if (m.x < -m.w) m.x += W + m.w;
      });
      this.groundDecor.forEach(g => {
        g.x -= speed * dt;
        if (g.x < -20) g.x = W + rand(0, 40);
      });
    }

    draw(ctx) {
      // sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
      sky.addColorStop(0, '#5fb6e8');
      sky.addColorStop(0.6, '#9fd8ef');
      sky.addColorStop(1, '#d9f1ea');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, GROUND_Y + 2);

      // sun
      const sunGrad = ctx.createRadialGradient(W - 120, 90, 4, W - 120, 90, 70);
      sunGrad.addColorStop(0, 'rgba(255,255,230,0.95)');
      sunGrad.addColorStop(1, 'rgba(255,255,230,0)');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(W - 120, 90, 70, 0, Math.PI * 2);
      ctx.fill();

      // mountains
      ctx.fillStyle = 'rgba(70,110,140,0.35)';
      this.mountains.forEach(m => {
        ctx.beginPath();
        ctx.moveTo(m.x - m.w / 2, GROUND_Y);
        ctx.lineTo(m.x, GROUND_Y - m.h);
        ctx.lineTo(m.x + m.w / 2, GROUND_Y);
        ctx.closePath();
        ctx.fill();
      });

      // clouds
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      this.clouds.forEach(c => {
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r * 0.6, 0, Math.PI * 2);
        ctx.arc(c.x + c.r * 0.6, c.y + 6, c.r * 0.45, 0, Math.PI * 2);
        ctx.arc(c.x - c.r * 0.5, c.y + 8, c.r * 0.4, 0, Math.PI * 2);
        ctx.fill();
      });

      // ground
      const groundGrad = ctx.createLinearGradient(0, GROUND_Y, 0, H);
      groundGrad.addColorStop(0, '#6fbf6a');
      groundGrad.addColorStop(0.15, '#58a34f');
      groundGrad.addColorStop(1, '#3f7a3a');
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

      // ground top highlight
      ctx.fillStyle = '#7ccf74';
      ctx.fillRect(0, GROUND_Y, W, 6);

      // grass tufts decor
      ctx.strokeStyle = 'rgba(30,70,30,0.5)';
      ctx.lineWidth = 2;
      this.groundDecor.forEach(g => {
        ctx.beginPath();
        ctx.moveTo(g.x, GROUND_Y + 2);
        ctx.lineTo(g.x - 4 * g.scale, GROUND_Y - 8 * g.scale);
        ctx.moveTo(g.x + 4, GROUND_Y + 2);
        ctx.lineTo(g.x + 4 + 4 * g.scale, GROUND_Y - 6 * g.scale);
        ctx.stroke();
      });
    }
  }

  // ---------- particle system ----------
  class Particles {
    constructor() { this.list = []; }
    emit(x, y, n, opts = {}) {
      for (let i = 0; i < n; i++) {
        this.list.push({
          x, y,
          vx: rand(opts.vxMin ?? -60, opts.vxMax ?? 60),
          vy: rand(opts.vyMin ?? -140, opts.vyMax ?? -20),
          life: rand(0.3, 0.7),
          age: 0,
          r: rand(1.5, 3.5),
          color: opts.color || '255,255,255',
        });
      }
    }
    update(dt) {
      for (const p of this.list) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 260 * dt;
      }
      this.list = this.list.filter(p => p.age < p.life);
    }
    draw(ctx) {
      for (const p of this.list) {
        const a = 1 - p.age / p.life;
        ctx.fillStyle = `rgba(${p.color},${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---------- stickman player (procedural skeletal animation) ----------
  class Stickman {
    constructor() {
      this.x = 150;
      this.baseY = GROUND_Y;
      this.y = this.baseY;
      this.vy = 0;
      this.height = 92;
      this.onGround = true;
      this.ducking = false;
      this.phase = 0;
      this.tilt = 0;
      this.jumpCount = 0;
    }

    get footY() { return this.baseY; }

    jump() {
      if (this.onGround) {
        this.vy = -620;
        this.onGround = false;
        this.jumpCount = 1;
        sndJump();
        return true;
      } else if (this.jumpCount < 2) {
        this.vy = -520;
        this.jumpCount++;
        sndJump();
        return true;
      }
      return false;
    }

    duck(state) {
      this.ducking = state && this.onGround;
    }

    update(dt, speed, particles) {
      this.phase += dt * speed * 0.02;

      if (!this.onGround) {
        this.vy += 1500 * dt;
        this.y += this.vy * dt;
        if (this.y >= this.baseY) {
          this.y = this.baseY;
          this.vy = 0;
          this.onGround = true;
          this.jumpCount = 0;
          particles.emit(this.x, this.baseY, 8, { color: '255,255,255', vyMin: -60, vyMax: -10 });
        }
      } else {
        this.y = this.baseY;
        if (Math.random() < speed * dt * 0.01) {
          particles.emit(this.x - 20, this.baseY, 1, { color: '230,220,190', vyMin: -30, vyMax: -5, vxMin: -20, vxMax: 10 });
        }
      }

      this.tilt = clamp(this.vy / 1800, -0.35, 0.5);
    }

    draw(ctx) {
      const duck = this.ducking ? 1 : 0;
      const h = this.height * (1 - duck * 0.35);
      const hipY = this.y - h * 0.55;
      const headR = 13;
      const headY = hipY - h * 0.42 - headR;
      const legPhase = this.onGround ? this.phase : 0;

      ctx.save();
      ctx.translate(this.x, 0);
      ctx.rotate(this.onGround ? 0 : this.tilt);

      // shadow
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#1a2a1a';
      const shadowScale = clamp(1 - (this.baseY - this.y) / 260, 0.35, 1);
      ctx.beginPath();
      ctx.ellipse(0, this.baseY + 6, 26 * shadowScale, 7 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1c2230';
      ctx.lineWidth = 6;

      // legs
      const stride = this.onGround ? Math.sin(legPhase) : Math.sin(0.6);
      const strideB = this.onGround ? Math.sin(legPhase + Math.PI) : -Math.sin(0.6);
      const kneeDrop = h * 0.26;
      const legLen = h * 0.42 * (1 - duck * 0.3);

      this.drawLeg(ctx, hipY, legLen, stride, kneeDrop);
      this.drawLeg(ctx, hipY, legLen, strideB, kneeDrop);

      // torso
      ctx.beginPath();
      ctx.moveTo(0, hipY);
      const chestY = hipY - h * 0.42;
      ctx.quadraticCurveTo(duck ? 10 : 0, (hipY + chestY) / 2, 0, chestY);
      ctx.stroke();

      // arms
      const armSwing = this.onGround ? Math.sin(legPhase + Math.PI) : -0.9;
      const armSwingB = this.onGround ? Math.sin(legPhase) : 1.1;
      this.drawArm(ctx, chestY, h * 0.34, armSwing);
      this.drawArm(ctx, chestY, h * 0.34, armSwingB);

      // head
      const grad = ctx.createRadialGradient(-4, headY - 4, 2, 0, headY, headR);
      grad.addColorStop(0, '#ffe9c7');
      grad.addColorStop(1, '#f2b06b');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, headY, headR, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#1c2230';
      ctx.stroke();

      // simple face
      ctx.fillStyle = '#1c2230';
      ctx.beginPath();
      ctx.arc(4, headY - 2, 1.6, 0, Math.PI * 2);
      ctx.fill();

      // headband (little character touch)
      ctx.strokeStyle = '#ff5d5d';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, headY, headR + 1, -2.6, -0.6);
      ctx.stroke();

      ctx.restore();
    }

    drawLeg(ctx, hipY, legLen, stride, kneeDrop) {
      const footX = stride * 20;
      const kneeX = stride * 8;
      const kneeY = hipY + kneeDrop;
      const footY = hipY + legLen;
      ctx.beginPath();
      ctx.moveTo(0, hipY);
      ctx.quadraticCurveTo(kneeX, kneeY, footX, footY);
      ctx.stroke();
    }

    drawArm(ctx, chestY, armLen, swing) {
      const handX = swing * 18;
      const handY = chestY + armLen * 0.9;
      const elbowX = swing * 9;
      const elbowY = chestY + armLen * 0.45;
      ctx.beginPath();
      ctx.moveTo(0, chestY + 4);
      ctx.quadraticCurveTo(elbowX, elbowY, handX, handY);
      ctx.stroke();
    }
  }

  // ---------- obstacles ----------
  const OB_SPIKE = 'spike';
  const OB_BLOCK = 'block';
  const OB_BIRD = 'bird';

  class Obstacle {
    constructor(type, x, speed) {
      this.type = type;
      this.x = x;
      this.passed = false;
      if (type === OB_SPIKE) {
        this.w = 34; this.h = 38; this.y = GROUND_Y;
      } else if (type === OB_BLOCK) {
        this.w = 30; this.h = rand(50, 72); this.y = GROUND_Y;
      } else {
        this.w = 34; this.h = 26; this.y = GROUND_Y - rand(90, 150);
        this.flap = rand(0, Math.PI * 2);
      }
    }
    update(dt, speed) {
      this.x -= speed * dt;
      if (this.type === OB_BIRD) this.flap += dt * 10;
    }
    get box() {
      if (this.type === OB_BIRD) {
        return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h };
      }
      return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
    }
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, 0);
      if (this.type === OB_SPIKE) {
        const grad = ctx.createLinearGradient(0, this.y - this.h, 0, this.y);
        grad.addColorStop(0, '#ff8a8a');
        grad.addColorStop(1, '#d64545');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-this.w / 2, this.y);
        ctx.lineTo(0, this.y - this.h);
        ctx.lineTo(this.w / 2, this.y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#7a1f1f';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (this.type === OB_BLOCK) {
        const grad = ctx.createLinearGradient(0, this.y - this.h, 0, this.y);
        grad.addColorStop(0, '#caa36a');
        grad.addColorStop(1, '#8a6a3d');
        ctx.fillStyle = grad;
        ctx.fillRect(-this.w / 2, this.y - this.h, this.w, this.h);
        ctx.strokeStyle = '#5a4524';
        ctx.lineWidth = 2;
        ctx.strokeRect(-this.w / 2, this.y - this.h, this.w, this.h);
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        for (let i = 1; i < this.h / 12; i++) {
          ctx.beginPath();
          ctx.moveTo(-this.w / 2, this.y - i * 12);
          ctx.lineTo(this.w / 2, this.y - i * 12);
          ctx.stroke();
        }
      } else {
        // bird: simple V-wing silhouette, animated flap
        const flapY = Math.sin(this.flap) * 8;
        ctx.strokeStyle = '#2b2f3a';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-this.w / 2, this.y + flapY);
        ctx.quadraticCurveTo(0, this.y - 10, this.w / 2, this.y + flapY);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, this.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#2b2f3a';
        ctx.fill();
      }
      ctx.restore();
    }
  }

  class Coin {
    constructor(x, y) {
      this.x = x; this.y = y; this.r = 10; this.spin = 0; this.collected = false;
    }
    update(dt, speed) { this.x -= speed * dt; this.spin += dt * 6; }
    get box() { return { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 }; }
    draw(ctx) {
      const squish = Math.abs(Math.cos(this.spin));
      ctx.save();
      ctx.translate(this.x, this.y);
      const grad = ctx.createLinearGradient(-this.r, 0, this.r, 0);
      grad.addColorStop(0, '#fff3b0');
      grad.addColorStop(0.5, '#ffd34d');
      grad.addColorStop(1, '#e8a200');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, this.r * squish + 2, this.r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#a66d00';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------- main game ----------
  class Game {
    constructor() {
      this.reset();
      this.state = 'start';
      this.best = Number(localStorage.getItem(STORAGE_KEY) || 0);
      bestEl.textContent = `Best: ${this.best}`;
    }

    reset() {
      this.bg = new Background();
      this.particles = new Particles();
      this.player = new Stickman();
      this.obstacles = [];
      this.coins = [];
      this.speed = 320;
      this.spawnTimer = 1.2;
      this.distance = 0;
      this.score = 0;
      this.shake = 0;
    }

    start() {
      this.reset();
      this.state = 'playing';
      startScreen.classList.add('hidden');
      gameoverScreen.classList.add('hidden');
    }

    gameOver() {
      this.state = 'dead';
      sndHit();
      this.shake = 10;
      this.best = Math.max(this.best, Math.floor(this.score));
      localStorage.setItem(STORAGE_KEY, this.best);
      bestEl.textContent = `Best: ${this.best}`;
      finalScoreEl.textContent = `Ball: ${Math.floor(this.score)}`;
      setTimeout(() => gameoverScreen.classList.remove('hidden'), 500);
    }

    spawn() {
      const roll = Math.random();
      const type = roll < 0.45 ? OB_SPIKE : roll < 0.8 ? OB_BLOCK : OB_BIRD;
      this.obstacles.push(new Obstacle(type, W + 40, this.speed));
      if (Math.random() < 0.6) {
        const cy = type === OB_BIRD ? GROUND_Y - rand(170, 220) : GROUND_Y - rand(70, 140);
        this.coins.push(new Coin(W + 40 + rand(-10, 60), cy));
      }
    }

    update(dt) {
      if (this.state !== 'playing') {
        this.particles.update(dt);
        return;
      }

      this.speed = Math.min(620, 320 + this.distance * 0.012);
      this.distance += this.speed * dt;
      this.score += dt * (this.speed / 10);
      scoreEl.textContent = Math.floor(this.score);

      this.bg.update(dt, this.speed);
      this.player.update(dt, this.speed, this.particles);
      this.particles.update(dt);

      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawn();
        this.spawnTimer = clamp(rand(0.9, 1.5) - this.distance * 0.00005, 0.55, 1.5);
      }

      const playerBox = this.player.ducking
        ? { x: this.player.x - 24, y: this.player.y - 40, w: 48, h: 40 }
        : { x: this.player.x - 16, y: this.player.y - this.player.height, w: 32, h: this.player.height };

      this.obstacles.forEach(o => o.update(dt, this.speed));
      this.obstacles = this.obstacles.filter(o => o.x > -60);
      for (const o of this.obstacles) {
        if (aabb(playerBox, o.box)) {
          this.gameOver();
          break;
        }
      }

      this.coins.forEach(c => c.update(dt, this.speed));
      this.coins = this.coins.filter(c => {
        if (c.collected) return false;
        if (aabb(playerBox, c.box)) {
          c.collected = true;
          this.score += 15;
          sndCoin();
          this.particles.emit(c.x, c.y, 10, { color: '255,210,70' });
          return false;
        }
        return c.x > -40;
      });

      if (this.shake > 0) this.shake *= 0.85;
    }

    draw() {
      ctx.save();
      if (this.shake > 0.5) {
        ctx.translate(rand(-this.shake, this.shake), rand(-this.shake, this.shake));
      }

      this.bg.draw(ctx);
      this.coins.forEach(c => c.draw(ctx));
      this.obstacles.forEach(o => o.draw(ctx));
      this.player.draw(ctx);
      this.particles.draw(ctx);

      // vignette for depth
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.85);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.18)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);

      ctx.restore();
    }
  }

  const game = new Game();

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    game.update(dt);
    game.draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ---------- input ----------
  function handleJump() {
    if (game.state === 'start') { game.start(); return; }
    if (game.state === 'dead') return;
    game.player.jump();
  }

  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); handleJump(); }
    if (e.code === 'ArrowDown') { e.preventDefault(); game.player.duck(true); }
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'ArrowDown') game.player.duck(false);
  });

  canvas.addEventListener('pointerdown', () => handleJump());
  touchJumpBtn.addEventListener('click', () => handleJump());

  startBtn.addEventListener('click', () => game.start());
  retryBtn.addEventListener('click', () => game.start());
})();
