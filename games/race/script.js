(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const TRACK_W = 960;
  const LANE_H = 170;

  const hud = document.getElementById('hud');
  const timerBar = document.getElementById('timer-bar');
  const startScreen = document.getElementById('start-screen');
  const resultsScreen = document.getElementById('results-screen');
  const resultsList = document.getElementById('results-list');
  const bestEl = document.getElementById('best');
  const startBtn = document.getElementById('start-btn');
  const retryBtn = document.getElementById('retry-btn');
  const totalSeg = document.getElementById('total-seg');
  const humanSeg = document.getElementById('human-seg');
  const keysHint = document.getElementById('keys-hint');
  const touchZonesEl = document.getElementById('touch-zones');
  const gameWrap = document.getElementById('game-wrap');

  const STORAGE_KEY = 'stickman_run_best_v2';
  const ROUND_TIME = 60;

  const PLAYER_COLORS = ['#ff5d5d', '#4da3ff', '#4ddd8f', '#c77dff'];
  const PLAYER_NAMES = ['P1', 'P2', 'P3', 'P4'];
  const KEYMAP = [
    { jump: ['Space', 'KeyW'], duck: ['KeyS'] },
    { jump: ['ArrowUp'], duck: ['ArrowDown'] },
    { jump: ['KeyL'], duck: ['KeyK'] },
    { jump: ['Slash'], duck: ['Period'] },
  ];
  const KEY_LABEL = ['SPACE', '↑', 'L', '/'];
  const DUCK_LABEL = ['S', '↓', 'K', '.'];

  // ---------- audio ----------
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
    } catch (e) { /* ignore */ }
  }
  const sndJump = () => sfx(520, 0.16, 'triangle', 0.08);
  const sndCoin = () => sfx(880, 0.1, 'square', 0.05);
  const sndHit = () => sfx(110, 0.35, 'sawtooth', 0.11);
  const sndPower = () => sfx(660, 0.22, 'sine', 0.09);
  const sndWin = () => sfx(990, 0.3, 'triangle', 0.08);

  // ---------- helpers ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const choice = arr => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function lerpColor(a, b, t) {
    const ca = hexToRgb(a), cb = hexToRgb(b);
    const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
    const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
    const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
    return `rgb(${r},${g},${bl})`;
  }
  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------- biomes (cycled by distance, colors blended smoothly) ----------
  const BIOME_DIST = 1700;
  const BIOMES = [
    { name: 'meadow', sky: ['#5fb6e8', '#9fd8ef', '#d9f1ea'], ground: ['#6fbf6a', '#3f7a3a'], mood: 'day' },
    { name: 'desert', sky: ['#ff9a5a', '#ffc27a', '#ffe9c4'], ground: ['#d9a85f', '#a8743a'], mood: 'sunset' },
    { name: 'night', sky: ['#0b1230', '#1b2550', '#30407a'], ground: ['#3a4066', '#20223d'], mood: 'night' },
    { name: 'snow', sky: ['#bcd9ea', '#d8eaf2', '#f3f8fb'], ground: ['#e7f1f6', '#b9ced9'], mood: 'snow' },
  ];

  function biomeState(distance) {
    const seg = Math.floor(distance / BIOME_DIST) % BIOMES.length;
    const next = (seg + 1) % BIOMES.length;
    const t = (distance % BIOME_DIST) / BIOME_DIST;
    return { a: BIOMES[seg], b: BIOMES[next], t };
  }

  // ---------- shared sky (drawn once per frame, full canvas) ----------
  class SharedSky {
    constructor() {
      this.clouds = Array.from({ length: 7 }, () => ({
        x: rand(0, TRACK_W), y: rand(10, 90), r: rand(18, 38), speed: rand(5, 12),
      }));
      this.stars = Array.from({ length: 40 }, () => ({
        x: rand(0, TRACK_W), y: rand(0, 200), tw: rand(0, 6),
      }));
      this.snow = Array.from({ length: 50 }, () => ({
        x: rand(0, TRACK_W), y: rand(0, 500), speed: rand(20, 60), drift: rand(-20, 20), r: rand(1.5, 3),
      }));
    }

    update(dt, mood, H) {
      this.clouds.forEach(c => { c.x -= c.speed * dt; if (c.x < -50) c.x = TRACK_W + 50; });
      this.stars.forEach(s => { s.tw += dt * 2; });
      if (mood === 'snow') {
        this.snow.forEach(s => {
          s.y += s.speed * dt;
          s.x += s.drift * dt;
          if (s.y > H) { s.y = -5; s.x = rand(0, TRACK_W); }
        });
      }
    }

    draw(ctx, W, H, distance) {
      const { a, b, t } = biomeState(distance);
      const top = lerpColor(a.sky[0], b.sky[0], t);
      const mid = lerpColor(a.sky[1], b.sky[1], t);
      const bot = lerpColor(a.sky[2], b.sky[2], t);
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, top);
      grad.addColorStop(0.55, mid);
      grad.addColorStop(1, bot);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      const mood = a.mood;

      // sun / moon glow
      const glowColor = mood === 'night' ? 'rgba(220,230,255,0.9)' : 'rgba(255,255,230,0.95)';
      const sunGrad = ctx.createRadialGradient(W - 110, 70, 4, W - 110, 70, 65);
      sunGrad.addColorStop(0, glowColor);
      sunGrad.addColorStop(1, 'rgba(255,255,230,0)');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(W - 110, 70, 65, 0, Math.PI * 2);
      ctx.fill();

      // stars at night
      if (mood === 'night') {
        ctx.fillStyle = '#fff';
        this.stars.forEach(s => {
          const a2 = 0.4 + Math.sin(s.tw) * 0.4;
          ctx.globalAlpha = clamp(a2, 0.05, 0.9);
          ctx.beginPath();
          ctx.arc(s.x, s.y, 1.4, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      }

      // clouds
      ctx.fillStyle = mood === 'night' ? 'rgba(180,190,220,0.5)' : 'rgba(255,255,255,0.88)';
      this.clouds.forEach(c => {
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r * 0.6, 0, Math.PI * 2);
        ctx.arc(c.x + c.r * 0.6, c.y + 5, c.r * 0.45, 0, Math.PI * 2);
        ctx.arc(c.x - c.r * 0.5, c.y + 6, c.r * 0.4, 0, Math.PI * 2);
        ctx.fill();
      });

      // falling snow
      if (mood === 'snow') {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        this.snow.forEach(s => {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    }
  }

  // ---------- particles ----------
  class Particles {
    constructor() { this.list = []; }
    emit(x, y, n, opts = {}) {
      for (let i = 0; i < n; i++) {
        this.list.push({
          x, y,
          vx: rand(opts.vxMin ?? -55, opts.vxMax ?? 55),
          vy: rand(opts.vyMin ?? -120, opts.vyMax ?? -15),
          life: rand(0.25, 0.6),
          age: 0,
          r: rand(1.3, 3.2),
          color: opts.color || '255,255,255',
        });
      }
    }
    update(dt) {
      for (const p of this.list) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 240 * dt;
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

  // ---------- stickman ----------
  const PLAYER_X = 130;

  class Stickman {
    constructor(color, scale) {
      this.color = color;
      this.scale = scale;
      this.height = 92 * scale;
      this.baseY = 0;
      this.y = 0;
      this.vy = 0;
      this.onGround = true;
      this.ducking = false;
      this.phase = Math.random() * 10;
      this.tilt = 0;
      this.jumpCount = 0;
      this.dead = false;
      this.deadRot = 0;
    }

    setGround(y) { this.baseY = y; if (this.onGround) this.y = y; }

    jump() {
      if (this.dead) return false;
      if (this.onGround) {
        this.vy = -600 * Math.sqrt(this.scale);
        this.onGround = false;
        this.jumpCount = 1;
        sndJump();
        return true;
      } else if (this.jumpCount < 2) {
        this.vy = -500 * Math.sqrt(this.scale);
        this.jumpCount++;
        sndJump();
        return true;
      }
      return false;
    }

    duck(state) { this.ducking = state && this.onGround && !this.dead; }

    kill() {
      if (this.dead) return;
      this.dead = true;
      sndHit();
    }

    update(dt, speed, particles) {
      if (this.dead) {
        this.deadRot = clamp(this.deadRot + dt * 6, 0, Math.PI / 2);
        return;
      }
      this.phase += dt * speed * 0.02;
      if (!this.onGround) {
        this.vy += 1500 * dt;
        this.y += this.vy * dt;
        if (this.y >= this.baseY) {
          this.y = this.baseY;
          this.vy = 0;
          this.onGround = true;
          this.jumpCount = 0;
          particles.emit(PLAYER_X, this.baseY, 6, { color: '255,255,255', vyMin: -50, vyMax: -10 });
        }
      } else {
        this.y = this.baseY;
      }
      this.tilt = clamp(this.vy / 1800, -0.35, 0.5);
    }

    draw(ctx, label, isHuman, shield, boost) {
      const s = this.scale;
      const duck = this.ducking ? 1 : 0;
      const h = this.height * (1 - duck * 0.35);
      const yOff = this.y - this.baseY;
      const hipY = yOff - h * 0.55;
      const headR = 12 * s;
      const headY = hipY - h * 0.42 - headR;

      ctx.save();
      ctx.translate(PLAYER_X, this.baseY);
      if (this.dead) ctx.rotate(Math.PI / 2 * (this.deadRot / (Math.PI / 2)) * 0.9 + 0.0);
      else ctx.rotate(this.onGround ? 0 : this.tilt);

      // shadow
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#1a2a1a';
      const shadowScale = clamp(1 - (-yOff) / (260 * s), 0.3, 1);
      ctx.beginPath();
      ctx.ellipse(0, 5 * s, 24 * s * shadowScale, 6 * s * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // boost fire trail
      if (boost && !this.dead) {
        for (let i = 1; i <= 3; i++) {
          ctx.globalAlpha = 0.25 / i;
          ctx.fillStyle = '#ff8a3d';
          ctx.beginPath();
          ctx.ellipse(-16 * s * i, hipY - h * 0.3, 10 * s, 6 * s, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = this.dead ? '#555' : '#1c2230';
      ctx.lineWidth = Math.max(2.2, 6 * s);

      const legPhase = this.onGround && !this.dead ? Math.sin(this.phase) : 0.6;
      const legPhaseB = this.onGround && !this.dead ? Math.sin(this.phase + Math.PI) : -0.6;
      const kneeDrop = h * 0.26;
      const legLen = h * 0.42 * (1 - duck * 0.3);

      this.drawLeg(ctx, hipY, legLen, legPhase, kneeDrop, s);
      this.drawLeg(ctx, hipY, legLen, legPhaseB, kneeDrop, s);

      const chestY = hipY - h * 0.42;
      ctx.beginPath();
      ctx.moveTo(0, hipY);
      ctx.quadraticCurveTo(duck ? 8 * s : 0, (hipY + chestY) / 2, 0, chestY);
      ctx.stroke();

      const armSwing = this.onGround && !this.dead ? Math.sin(this.phase + Math.PI) : -0.9;
      const armSwingB = this.onGround && !this.dead ? Math.sin(this.phase) : 1.1;
      this.drawArm(ctx, chestY, h * 0.34, armSwing, s);
      this.drawArm(ctx, chestY, h * 0.34, armSwingB, s);

      // head
      const grad = ctx.createRadialGradient(-3 * s, headY - 3 * s, 2, 0, headY, headR);
      grad.addColorStop(0, this.dead ? '#cfcfcf' : '#ffe9c7');
      grad.addColorStop(1, this.dead ? '#9a9a9a' : '#f2b06b');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, headY, headR, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, 3 * s);
      ctx.strokeStyle = this.dead ? '#555' : '#1c2230';
      ctx.stroke();

      ctx.fillStyle = '#1c2230';
      if (this.dead) {
        ctx.beginPath();
        ctx.moveTo(2 * s, headY - 3 * s); ctx.lineTo(6 * s, headY + 1 * s);
        ctx.moveTo(6 * s, headY - 3 * s); ctx.lineTo(2 * s, headY + 1 * s);
        ctx.strokeStyle = '#1c2230';
        ctx.lineWidth = Math.max(1, 1.6 * s);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(3.5 * s, headY - 2 * s, Math.max(1, 1.5 * s), 0, Math.PI * 2);
        ctx.fill();
      }

      // headband in player color
      ctx.strokeStyle = this.color;
      ctx.lineWidth = Math.max(2, 4 * s);
      ctx.beginPath();
      ctx.arc(0, headY, headR + 1, -2.6, -0.6);
      ctx.stroke();

      // shield bubble
      if (shield && !this.dead) {
        ctx.save();
        ctx.globalAlpha = 0.35 + Math.sin(performance.now() / 150) * 0.08;
        ctx.strokeStyle = '#37d6c4';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, (headY + hipY) / 2, headR + h * 0.42, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();

      // label tag above head (screen space, not rotated)
      const tagY = this.baseY - this.height - headR * 2 - 6;
      ctx.save();
      ctx.font = `${Math.max(9, 11 * s)}px Trebuchet MS, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = this.color;
      ctx.globalAlpha = this.dead ? 0.5 : 1;
      ctx.fillText(isHuman ? label : `${label}·BOT`, PLAYER_X, tagY);
      ctx.restore();
    }

    drawLeg(ctx, hipY, legLen, stride, kneeDrop, s) {
      const footX = stride * 20 * s;
      const kneeX = stride * 8 * s;
      const kneeY = hipY + kneeDrop;
      const footY = hipY + legLen;
      ctx.beginPath();
      ctx.moveTo(0, hipY);
      ctx.quadraticCurveTo(kneeX, kneeY, footX, footY);
      ctx.stroke();
    }

    drawArm(ctx, chestY, armLen, swing, s) {
      const handX = swing * 18 * s;
      const handY = chestY + armLen * 0.9;
      const elbowX = swing * 9 * s;
      const elbowY = chestY + armLen * 0.45;
      ctx.beginPath();
      ctx.moveTo(0, chestY + 4 * s);
      ctx.quadraticCurveTo(elbowX, elbowY, handX, handY);
      ctx.stroke();
    }
  }

  // ---------- obstacles / coins / power-ups ----------
  const OB_SPIKE = 'spike';
  const OB_BLOCK = 'block';
  const OB_LOWBAR = 'lowbar';
  const OB_BIRD = 'bird';
  const NEEDS_JUMP = new Set([OB_SPIKE, OB_BLOCK]);
  const NEEDS_DUCK = new Set([OB_LOWBAR, OB_BIRD]);

  class Obstacle {
    constructor(type, x, groundY, scale) {
      this.type = type;
      this.x = x;
      this.scale = scale;
      this.botDecided = false;
      if (type === OB_SPIKE) { this.w = 30 * scale; this.h = 36 * scale; this.y = groundY; }
      else if (type === OB_BLOCK) { this.w = 28 * scale; this.h = rand(44, 64) * scale; this.y = groundY; }
      else if (type === OB_LOWBAR) { this.w = 46 * scale; this.h = 14 * scale; this.y = groundY - 58 * scale; }
      else { this.w = 32 * scale; this.h = 24 * scale; this.y = groundY - rand(70, 110) * scale; this.flap = rand(0, 7); }
    }
    update(dt, speed) { this.x -= speed * dt; if (this.type === OB_BIRD) this.flap += dt * 10; }
    get box() {
      if (this.type === OB_LOWBAR || this.type === OB_BIRD) return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h };
      return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
    }
    draw(ctx) {
      const s = this.scale;
      ctx.save();
      ctx.translate(this.x, 0);
      if (this.type === OB_SPIKE) {
        const grad = ctx.createLinearGradient(0, this.y - this.h, 0, this.y);
        grad.addColorStop(0, '#ff8a8a'); grad.addColorStop(1, '#d64545');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-this.w / 2, this.y); ctx.lineTo(0, this.y - this.h); ctx.lineTo(this.w / 2, this.y);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#7a1f1f'; ctx.lineWidth = Math.max(1, 2 * s); ctx.stroke();
      } else if (this.type === OB_BLOCK) {
        const grad = ctx.createLinearGradient(0, this.y - this.h, 0, this.y);
        grad.addColorStop(0, '#caa36a'); grad.addColorStop(1, '#8a6a3d');
        ctx.fillStyle = grad;
        ctx.fillRect(-this.w / 2, this.y - this.h, this.w, this.h);
        ctx.strokeStyle = '#5a4524'; ctx.lineWidth = Math.max(1, 2 * s);
        ctx.strokeRect(-this.w / 2, this.y - this.h, this.w, this.h);
      } else if (this.type === OB_LOWBAR) {
        const grad = ctx.createLinearGradient(-this.w / 2, 0, this.w / 2, 0);
        grad.addColorStop(0, '#9fb6cc'); grad.addColorStop(1, '#6d85a3');
        ctx.fillStyle = grad;
        ctx.fillRect(-this.w / 2, this.y - this.h / 2, this.w, this.h);
        ctx.strokeStyle = '#3f4f63'; ctx.lineWidth = Math.max(1, 2 * s);
        ctx.strokeRect(-this.w / 2, this.y - this.h / 2, this.w, this.h);
        [-1, 1].forEach(sideSign => {
          ctx.fillStyle = '#556377';
          ctx.fillRect(sideSign * this.w / 2 - 2 * s, this.y - this.h / 2 - 2 * s, 4 * s, this.h + 4 * s);
        });
      } else {
        const flapY = Math.sin(this.flap) * 7 * s;
        ctx.strokeStyle = '#2b2f3a'; ctx.lineWidth = Math.max(1.5, 4 * s); ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-this.w / 2, this.y + flapY);
        ctx.quadraticCurveTo(0, this.y - 10 * s, this.w / 2, this.y + flapY);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(0, this.y, Math.max(2, 5 * s), 0, Math.PI * 2);
        ctx.fillStyle = '#2b2f3a'; ctx.fill();
      }
      ctx.restore();
    }
  }

  class Coin {
    constructor(x, y, scale) { this.x = x; this.y = y; this.r = 9 * scale; this.spin = 0; }
    update(dt, speed) { this.x -= speed * dt; this.spin += dt * 6; }
    get box() { return { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 }; }
    draw(ctx) {
      const squish = Math.abs(Math.cos(this.spin));
      ctx.save();
      ctx.translate(this.x, this.y);
      const grad = ctx.createLinearGradient(-this.r, 0, this.r, 0);
      grad.addColorStop(0, '#fff3b0'); grad.addColorStop(0.5, '#ffd34d'); grad.addColorStop(1, '#e8a200');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, this.r * squish + 2, this.r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#a66d00'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.restore();
    }
  }

  const POWER_TYPES = ['boost', 'shield', 'magnet'];
  const POWER_COLORS = { boost: '#ff8a3d', shield: '#37d6c4', magnet: '#ff6fb0' };

  class PowerUp {
    constructor(type, x, y, scale) { this.type = type; this.x = x; this.y = y; this.r = 13 * scale; this.bob = rand(0, 6); }
    update(dt, speed) { this.x -= speed * dt; this.bob += dt * 4; }
    get box() { return { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 }; }
    draw(ctx) {
      const y = this.y + Math.sin(this.bob) * 4;
      ctx.save();
      ctx.translate(this.x, y);
      ctx.fillStyle = POWER_COLORS[this.type];
      ctx.globalAlpha = 0.25;
      ctx.beginPath(); ctx.arc(0, 0, this.r + 4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(0, 0, this.r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      if (this.type === 'boost') {
        ctx.beginPath();
        ctx.moveTo(-3, -7); ctx.lineTo(2, -1); ctx.lineTo(-2, 1); ctx.lineTo(3, 7);
        ctx.stroke();
      } else if (this.type === 'shield') {
        ctx.beginPath();
        ctx.moveTo(0, -7); ctx.lineTo(6, -3); ctx.lineTo(5, 4); ctx.lineTo(0, 8); ctx.lineTo(-5, 4); ctx.lineTo(-6, -3); ctx.closePath();
        ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(0, 1, 6, 0.3, Math.PI - 0.3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-6, 1); ctx.lineTo(-6, -4); ctx.moveTo(6, 1); ctx.lineTo(6, -4); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ---------- lane ----------
  class Lane {
    constructor(index, total, isHuman, botSkill) {
      this.index = index;
      this.isHuman = isHuman;
      this.botSkill = botSkill;
      this.top = index * LANE_H;
      this.h = LANE_H;
      this.groundY = this.top + this.h - 24;
      const scale = clamp(LANE_H / 300, 0.45, 1);
      this.scale = scale;
      this.player = new Stickman(PLAYER_COLORS[index], scale);
      this.player.setGround(this.groundY);
      this.obstacles = [];
      this.coins = [];
      this.powerups = [];
      this.particles = new Particles();
      this.score = 0;
      this.alive = true;
      this.shieldTime = 0;
      this.boostTime = 0;
      this.magnetTime = 0;
      this.duckLock = false;
      this.name = PLAYER_NAMES[index];
    }

    playerBox() {
      const p = this.player;
      if (p.ducking) return { x: PLAYER_X - 18 * this.scale, y: p.y - 36 * this.scale, w: 36 * this.scale, h: 36 * this.scale };
      return { x: PLAYER_X - 11 * this.scale, y: p.y - p.height + 6 * this.scale, w: 22 * this.scale, h: p.height - 6 * this.scale };
    }

    spawnEntities(type, x, speed, withCoin, withPower) {
      this.obstacles.push(new Obstacle(type, x, this.groundY, this.scale));
      if (withCoin) {
        const cy = type === OB_BIRD ? this.groundY - rand(120, 150) * this.scale : this.groundY - rand(50, 100) * this.scale;
        this.coins.push(new Coin(x + rand(-10, 50), cy, this.scale));
      }
      if (withPower) {
        this.powerups.push(new PowerUp(choice(POWER_TYPES), x + rand(40, 90), this.groundY - 60 * this.scale, this.scale));
      }
    }

    aiThink(dt, speed) {
      if (!this.alive || this.player.dead) return;
      const p = this.player;
      let duckNeeded = false;
      for (const o of this.obstacles) {
        const dist = o.x - PLAYER_X;
        if (dist < -40) continue;
        if (NEEDS_JUMP.has(o.type) && !o.botDecided) {
          const threshold = clamp(speed * 0.34, 110, 230) * this.botSkill.timingMul;
          if (dist < threshold) {
            o.botDecided = true;
            if (Math.random() > this.botSkill.missChance) p.jump();
          }
        }
        if (NEEDS_DUCK.has(o.type)) {
          const windowFar = clamp(speed * 0.3, 90, 200) * this.botSkill.timingMul;
          const windowNear = -30 * this.scale;
          if (dist < windowFar && dist > windowNear) duckNeeded = true;
        }
      }
      p.duck(duckNeeded);
    }

    update(dt, speed, globalDistance) {
      this.player.update(dt, speed, this.particles);
      this.particles.update(dt);

      if (this.shieldTime > 0) this.shieldTime -= dt;
      if (this.boostTime > 0) this.boostTime -= dt;
      if (this.magnetTime > 0) this.magnetTime -= dt;

      if (!this.alive) {
        this.obstacles.forEach(o => o.update(dt, speed));
        this.obstacles = this.obstacles.filter(o => o.x > -60);
        return;
      }

      this.score += dt * (speed / 10) * (this.boostTime > 0 ? 2 : 1);

      this.obstacles.forEach(o => o.update(dt, speed));
      this.obstacles = this.obstacles.filter(o => o.x > -60);

      this.coins.forEach(c => {
        if (this.magnetTime > 0) {
          const dx = PLAYER_X - c.x, dy = this.player.y - 40 * this.scale - c.y;
          const d = Math.hypot(dx, dy);
          if (d < 140 * this.scale && d > 1) { c.x += (dx / d) * 260 * dt; c.y += (dy / d) * 260 * dt; }
        }
        c.update(dt, speed);
      });
      this.powerups.forEach(pu => pu.update(dt, speed));

      const pbox = this.playerBox();

      for (const o of this.obstacles) {
        if (aabb(pbox, o.box)) {
          if (this.shieldTime > 0) {
            this.shieldTime = 0;
            this.particles.emit(PLAYER_X, this.player.y - 40 * this.scale, 14, { color: '55,214,196' });
            o.x = -999;
          } else {
            this.player.kill();
            this.alive = false;
            this.particles.emit(PLAYER_X, this.player.y - 30 * this.scale, 16, { color: '255,120,100' });
          }
          break;
        }
      }

      this.coins = this.coins.filter(c => {
        if (aabb(pbox, c.box)) {
          this.score += 15;
          sndCoin();
          this.particles.emit(c.x, c.y, 8, { color: '255,210,70' });
          return false;
        }
        return c.x > -40;
      });

      this.powerups = this.powerups.filter(pu => {
        if (aabb(pbox, pu.box)) {
          sndPower();
          this.particles.emit(pu.x, pu.y, 10, { color: '255,255,255' });
          if (pu.type === 'boost') this.boostTime = 5;
          else if (pu.type === 'shield') this.shieldTime = 8;
          else this.magnetTime = 6;
          return false;
        }
        return pu.x > -40;
      });
    }

    draw(ctx, distance) {
      const { a, b, t } = biomeState(distance);
      const groundTop = lerpColor(a.ground[0], b.ground[0], t);
      const groundBot = lerpColor(a.ground[1], b.ground[1], t);
      const bandH = this.h - (this.groundY - this.top);
      const grad = ctx.createLinearGradient(0, this.groundY, 0, this.top + this.h);
      grad.addColorStop(0, groundTop);
      grad.addColorStop(1, groundBot);
      ctx.fillStyle = grad;
      ctx.fillRect(0, this.groundY, TRACK_W, bandH);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(0, this.groundY, TRACK_W, 4);

      // lane divider
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, this.top); ctx.lineTo(TRACK_W, this.top);
      ctx.stroke();

      this.coins.forEach(c => c.draw(ctx));
      this.powerups.forEach(pu => pu.draw(ctx));
      this.obstacles.forEach(o => o.draw(ctx));
      this.player.draw(ctx, this.name, this.isHuman, this.shieldTime > 0, this.boostTime > 0);
      this.particles.draw(ctx);

      // in-lane score chip
      ctx.save();
      ctx.font = `bold ${Math.max(11, 13 * this.scale)}px Trebuchet MS, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(10,14,24,0.55)';
      const chipText = `${Math.floor(this.score)}`;
      const chipW = ctx.measureText(chipText).width + 16;
      ctx.beginPath();
      ctx.roundRect(TRACK_W - chipW - 10, this.top + 8, chipW, 22, 11);
      ctx.fill();
      ctx.fillStyle = '#ffd34d';
      ctx.fillText(chipText, TRACK_W - chipW + 2, this.top + 24);
      ctx.restore();

      if (!this.alive) {
        ctx.save();
        ctx.fillStyle = 'rgba(10,10,16,0.28)';
        ctx.fillRect(0, this.top, TRACK_W, this.h);
        ctx.restore();
      }
    }
  }

  // ---------- main game ----------
  class Game {
    constructor() {
      this.state = 'start';
      this.total = 4;
      this.humanCount = 1;
      this.distance = 0;
      this.sky = new SharedSky();
      this.best = Number(localStorage.getItem(STORAGE_KEY) || 0);
      bestEl.textContent = this.best;
    }

    configure(total, human) {
      this.total = total;
      this.humanCount = clamp(human, 0, total);
    }

    setupCanvas() {
      canvas.width = TRACK_W;
      canvas.height = LANE_H * this.total;
      canvas.style.aspectRatio = `${TRACK_W} / ${LANE_H * this.total}`;
    }

    buildTouchZones() {
      touchZonesEl.innerHTML = '';
      this.touchState = [];
      if (this.humanCount <= 0) { touchZonesEl.classList.add('hidden'); return; }
      touchZonesEl.classList.remove('hidden');
      for (let i = 0; i < this.humanCount; i++) {
        const z = document.createElement('div');
        z.className = 'zone';
        z.style.flex = '1';
        touchZonesEl.appendChild(z);
        const holdTimer = { t: null, held: false };
        const onDown = (e) => {
          e.preventDefault();
          clearTimeout(holdTimer.t);
          holdTimer.held = false;
          holdTimer.t = setTimeout(() => {
            holdTimer.held = true;
            const lane = this.lanes && this.lanes[i];
            if (lane) lane.player.duck(true);
          }, 150);
        };
        const onUp = (e) => {
          e.preventDefault();
          clearTimeout(holdTimer.t);
          const lane = this.lanes && this.lanes[i];
          if (!lane) return;
          if (holdTimer.held) lane.player.duck(false);
          else lane.player.jump();
        };
        z.addEventListener('pointerdown', onDown);
        z.addEventListener('pointerup', onUp);
        z.addEventListener('pointercancel', onUp);
        z.addEventListener('pointerleave', onUp);
      }
    }

    start() {
      this.setupCanvas();
      this.sky = new SharedSky();
      this.distance = 0;
      this.speed = 320;
      this.spawnTimer = 1.1;
      this.elapsed = 0;
      this.lanes = [];
      for (let i = 0; i < this.total; i++) {
        const isHuman = i < this.humanCount;
        const botSkill = { timingMul: rand(0.85, 1.2), missChance: rand(0.04, 0.16) };
        this.lanes.push(new Lane(i, this.total, isHuman, botSkill));
      }
      this.buildTouchZones();
      this.state = 'playing';
      startScreen.classList.add('hidden');
      resultsScreen.classList.add('hidden');
      hud.classList.remove('hidden');
      requestAnimationFrame(() => syncTouchZonesRect());
    }

    spawn() {
      const roll = Math.random();
      const type = roll < 0.35 ? OB_SPIKE : roll < 0.6 ? OB_BLOCK : roll < 0.82 ? OB_LOWBAR : OB_BIRD;
      const withCoin = Math.random() < 0.55;
      const withPower = Math.random() < 0.1;
      for (const lane of this.lanes) lane.spawnEntities(type, TRACK_W + 40, this.speed, withCoin, withPower);
    }

    endRound() {
      this.state = 'results';
      const ranked = [...this.lanes].sort((a, b) => b.score - a.score);
      const topScore = Math.floor(ranked[0]?.score || 0);
      const anyHumanTop = ranked.some(l => l.isHuman) ? Math.max(...this.lanes.filter(l => l.isHuman).map(l => Math.floor(l.score)), 0) : 0;
      if (anyHumanTop > this.best) {
        this.best = anyHumanTop;
        localStorage.setItem(STORAGE_KEY, this.best);
        bestEl.textContent = this.best;
      }
      resultsList.innerHTML = '';
      ranked.forEach((lane, i) => {
        const row = document.createElement('div');
        row.className = 'result-row' + (i === 0 ? ' winner' : '');
        row.innerHTML = `<span class="rank">#${i + 1}</span>
          <span class="name" style="color:${lane.color || PLAYER_COLORS[lane.index]}">${lane.name}</span>
          <span class="tagb">${lane.isHuman ? 'ODAM' : 'BOT'}</span>
          <span class="scr">${Math.floor(lane.score)}</span>`;
        resultsList.appendChild(row);
      });
      if (ranked[0] && ranked[0].isHuman) sndWin();
      hud.classList.add('hidden');
      touchZonesEl.classList.add('hidden');
      setTimeout(() => resultsScreen.classList.remove('hidden'), 400);
    }

    update(dt) {
      if (this.state !== 'playing') return;

      this.speed = Math.min(520, 260 + this.distance * 0.0045);
      this.distance += this.speed * dt;
      this.elapsed += dt;

      const { a } = biomeState(this.distance);
      this.sky.update(dt, a.mood, canvas.height);

      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawn();
        this.spawnTimer = clamp(rand(1.05, 1.7) - this.distance * 0.00002, 0.75, 1.7);
      }

      for (const lane of this.lanes) {
        if (!lane.isHuman) lane.aiThink(dt, this.speed);
        lane.update(dt, this.speed, this.distance);
      }

      const pct = clamp(1 - this.elapsed / ROUND_TIME, 0, 1);
      timerBar.style.width = `${pct * 100}%`;

      if (this.elapsed >= ROUND_TIME || this.lanes.every(l => !l.alive)) this.endRound();
    }

    draw() {
      if (!this.sky) return;
      const W = canvas.width, H = canvas.height;
      this.sky.draw(ctx, W, H, this.distance || 0);
      if (this.lanes) this.lanes.forEach(l => l.draw(ctx, this.distance));
    }
  }

  const game = new Game();
  if (window.location.search.includes('debug')) window.__game = game;

  function syncTouchZonesRect() {
    const cRect = canvas.getBoundingClientRect();
    const wRect = gameWrap.getBoundingClientRect();
    touchZonesEl.style.left = `${cRect.left - wRect.left}px`;
    touchZonesEl.style.top = `${cRect.top - wRect.top}px`;
    touchZonesEl.style.width = `${cRect.width}px`;
    touchZonesEl.style.height = `${cRect.height}px`;
  }
  window.addEventListener('resize', syncTouchZonesRect);
  window.addEventListener('orientationchange', () => setTimeout(syncTouchZonesRect, 200));

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    game.update(dt);
    game.draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ---------- picker UI ----------
  function setSeg(segEl, value) {
    [...segEl.children].forEach(btn => btn.classList.toggle('active', Number(btn.dataset.v) === value));
  }
  function updateHumanOptions(total, human) {
    [...humanSeg.children].forEach(btn => {
      const v = Number(btn.dataset.v);
      btn.classList.toggle('hidden', v > total);
    });
    const clamped = clamp(human, 0, total);
    setSeg(humanSeg, clamped);
    game.configure(total, clamped);
    updateKeysHint(clamped);
  }
  function updateKeysHint(humanCount) {
    if (humanCount <= 0) { keysHint.textContent = 'Barcha o\'yinchilar — botlar. Tomosha qiling!'; return; }
    const parts = [];
    for (let i = 0; i < humanCount; i++) {
      parts.push(`${PLAYER_NAMES[i]}: ${KEY_LABEL[i]} sakrash / ${DUCK_LABEL[i]} egilish`);
    }
    keysHint.textContent = parts.join('  ·  ');
  }

  let curTotal = 4, curHuman = 1;
  totalSeg.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    curTotal = Number(btn.dataset.v);
    setSeg(totalSeg, curTotal);
    if (curHuman > curTotal) curHuman = curTotal;
    updateHumanOptions(curTotal, curHuman);
  });
  humanSeg.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn || btn.classList.contains('hidden')) return;
    curHuman = Number(btn.dataset.v);
    updateHumanOptions(curTotal, curHuman);
  });
  updateHumanOptions(curTotal, curHuman);

  startBtn.addEventListener('click', () => game.start());
  retryBtn.addEventListener('click', () => game.start());

  // ---------- keyboard ----------
  const codeToAction = {};
  KEYMAP.forEach((map, slot) => {
    map.jump.forEach(code => { codeToAction[code] = codeToAction[code] || {}; codeToAction[code].jump = slot; });
    map.duck.forEach(code => { codeToAction[code] = codeToAction[code] || {}; codeToAction[code].duck = slot; });
  });

  window.addEventListener('keydown', e => {
    if (game.state === 'start') {
      if (e.code === 'Space') { e.preventDefault(); game.start(); }
      return;
    }
    if (game.state === 'results') return;
    const act = codeToAction[e.code];
    if (!act) return;
    e.preventDefault();
    if (act.jump !== undefined) {
      const lane = game.lanes[act.jump];
      if (lane && lane.isHuman) lane.player.jump();
    }
    if (act.duck !== undefined) {
      const lane = game.lanes[act.duck];
      if (lane && lane.isHuman) lane.player.duck(true);
    }
  });
  window.addEventListener('keyup', e => {
    if (game.state !== 'playing') return;
    const act = codeToAction[e.code];
    if (!act || act.duck === undefined) return;
    const lane = game.lanes[act.duck];
    if (lane && lane.isHuman) lane.player.duck(false);
  });

  canvas.addEventListener('pointerdown', () => {
    if (game.state === 'start') game.start();
  });
})();
