(() => {
  'use strict';
  const { rand, clamp, damp, choice, sfx, FX, Char, poses, Scenery, label, bar, rr, $ } = SG;

  const H = 540, FLOOR = 468, LANE_GAP = 27, TRACK_LEN = 13500;
  const COLORS = ['#ff5d5d', '#4da3ff', '#4ddd8f', '#c77dff'];
  const KEYS = [
    { jump: ['KeyW', 'Space'], slide: ['KeyS'], turbo: ['KeyD'] },
    { jump: ['ArrowUp'], slide: ['ArrowDown'], turbo: ['ArrowRight'] },
    { jump: ['KeyI'], slide: ['KeyK'], turbo: ['KeyL'] },
    { jump: ['KeyT'], slide: ['KeyG'], turbo: ['KeyH'] },
  ];
  let W = 960;
  SG.initView($('game'), () => { W = SG.view.W; });

  const fx = new FX();
  let scenery = new Scenery('meadow', 1);
  let total = 4, humans = 1, diff = 1;
  SG.seg('total-seg', v => { total = Number(v); syncHumans(); });
  SG.seg('human-seg', v => { humans = Number(v); });
  SG.seg('diff-seg', v => { diff = Number(v); });
  function syncHumans() {
    [...$('human-seg').children].forEach(b => b.classList.toggle('hidden', Number(b.dataset.v) > total));
    if (humans > total) { humans = total; [...$('human-seg').children].forEach(b => b.classList.toggle('active', Number(b.dataset.v) === humans)); }
  }

  const BOT = [
    { miss: 0.2, top: 0.93, react: 0.9 },
    { miss: 0.09, top: 0.985, react: 1 },
    { miss: 0.03, top: 1.03, react: 1.05 },
  ];
  const BASE_SPEED = 385, TURBO_NEED = 5;

  let runners = [], obstacles = [], coins = [], camX = 0, state = 'menu', countT = 0, raceT = 0, finishCount = 0, endT = 0;
  let touchZones = [], touchBtns = null;

  const laneY = i => FLOOR - (runners.length - 1 - i) * LANE_GAP;
  const laneS = i => 1 - (runners.length - 1 - i) * 0.065;

  class Runner {
    constructor(i, lane, human, slot) {
      this.i = i; this.lane = lane; this.human = human; this.slot = slot;
      this.name = human ? `P${slot + 1}` : `BOT ${i - humans + 1}`;
      this.color = COLORS[i];
      this.char = new Char({ color: this.color, style: human ? 'band' : 'spiky' });
      this.x = 120 - (i % 2) * 10; this.h = 0; this.vh = 0; this.speed = 0;
      this.slideT = 0; this.stumble = 0; this.boostT = 0; this.turboT = 0;
      this.coins = 0; this.ph = rand(0, 6); this.done = false; this.time = 0; this.place = 0;
      this.inp = { jump: false, slide: false, turbo: false };
      this.bot = Object.assign({ plan: new Map(), holdSlide: 0 }, BOT[diff], { top: BOT[diff].top * rand(0.97, 1.03) });
      this.mudded = false;
    }
    get sliding() { return this.slideT > 0 && this.h <= 1; }
    trip(hard) {
      if (this.stumble > 0 || this.turboT > 0) return;
      this.stumble = hard ? 1.0 : 0.75; this.speed *= 0.3; this.slideT = 0;
      fx.burst(this.x, laneY(this.lane) - 40, 10, { color: '#ffd98a', spark: true, speedMin: 100, speedMax: 320 });
      fx.dust(this.x, laneY(this.lane), 8);
      if (this.human) { fx.shake(7); sfx.hit(); SG.buzz(50); } else if (onScreen(this.x)) sfx.thud();
    }
    update(dt) {
      const inp = this.inp;
      if (this.done) {
        this.speed = damp(this.speed, 0, 2.2, dt);
      } else if (this.stumble > 0) {
        this.stumble -= dt;
        this.speed = damp(this.speed, BASE_SPEED * 0.45, 2, dt);
      } else {
        let top = BASE_SPEED * (this.human ? 1 : this.bot.top);
        if (this.turboT > 0) top *= 1.55; else if (this.boostT > 0) top *= 1.3;
        if (this.mudded && this.turboT <= 0) top *= 0.5;
        this.speed = damp(this.speed, top, this.speed > top ? 3.5 : 1.7, dt);
        if (inp.jump && this.h <= 0.5) { this.vh = 590; this.slideT = 0; if (this.human) sfx.jump(); fx.dust(this.x, laneY(this.lane), 3); }
        if (inp.slide && this.h <= 0.5 && this.slideT <= 0) { this.slideT = 0.62; if (this.human) sfx.whoosh(); }
        if (inp.slide && this.h > 0.5) this.vh -= 1500 * dt;
        if (inp.turbo && this.coins >= TURBO_NEED && this.turboT <= 0) {
          this.coins = 0; this.turboT = 2.2;
          if (this.human) { sfx.power(); SG.buzz(40); }
          fx.ring(this.x, laneY(this.lane) - 50, '#ffd34d', 70, 0.4, 5);
          fx.text(this.x, laneY(this.lane) - 130, 'TURBO!', '#ffd34d', 22);
        }
      }
      this.slideT -= dt; this.boostT -= dt; this.turboT -= dt;
      this.h += this.vh * dt; this.vh -= 1750 * dt;
      if (this.h <= 0) { if (this.vh < -200) fx.dust(this.x, laneY(this.lane), 3); this.h = 0; this.vh = 0; }
      this.x += this.speed * dt;
      this.ph += dt * (6 + this.speed * 0.022);
      if (this.turboT > 0 && Math.random() < 0.7) fx.burst(this.x - 20, laneY(this.lane) - rand(20, 80) - this.h, 1, { color: choice(['#ffd34d', '#ff9a3d', '#fff2b0']), speedMin: 20, speedMax: 90, angle: Math.PI, spread: 0.4, gravity: 0, lifeMin: 0.2, lifeMax: 0.4, rMin: 3, rMax: 6 });

      if (!this.done && this.x >= TRACK_LEN) {
        this.done = true; this.time = raceT; this.place = ++finishCount;
        if (this.place === 1) { for (let k = 0; k < 4; k++) fx.burst(this.x + rand(-40, 40), laneY(this.lane) - rand(60, 160), 14, { color: choice(['#ffd34d', '#ff5d5d', '#4da3ff', '#5dff9a']), speedMin: 100, speedMax: 420, up: 150, lifeMin: 0.7, lifeMax: 1.4 }); sfx.win(); }
        fx.text(this.x, laneY(this.lane) - 135, `${this.place}-o'rin!`, '#ffd34d', 22);
      }

      const P = poses, t = SG.time.t;
      let pose, rate = 20;
      if (state === 'count') { pose = P.duck(); rate = 10; }
      else if (this.done) pose = this.speed > 60 ? P.run(this.ph) : (this.place === 1 ? P.cheer(t) : P.stand(t));
      else if (this.stumble > 0.35) { pose = P.faceplant(); pose.rot = 0.9; pose.hy = 6; rate = 14; }
      else if (this.stumble > 0) { pose = P.duck(); rate = 12; }
      else if (this.h > 1) pose = this.vh > 0 ? P.jump() : P.fall();
      else if (this.slideT > 0) { pose = P.slide(); rate = 26; }
      else pose = P.run(this.ph);
      this.char.to(pose, dt, rate);
    }
  }

  const onScreen = x => x > camX - 60 && x < camX + W + 60;

  function buildCourse() {
    obstacles = []; coins = [];
    let x = 900, last = '';
    while (x < TRACK_LEN - 500) {
      const r = Math.random();
      let type = r < 0.36 ? 'hurdle' : r < 0.62 ? 'beam' : r < 0.78 ? 'mud' : r < 0.9 ? 'boost' : 'coins';
      if (type === last && type !== 'hurdle') type = 'hurdle';
      last = type;
      if (type === 'coins') {
        for (let k = 0; k < 5; k++) coins.push({ x: x + k * 46, h: 34 + Math.sin(k / 4 * Math.PI) * 70, got: new Set() });
      } else {
        const o = { type, x, w: type === 'mud' ? 120 : type === 'boost' ? 90 : 14, hit: new Set() };
        obstacles.push(o);
        if (type === 'hurdle' && Math.random() < 0.6) for (let k = 0; k < 3; k++) coins.push({ x: x - 46 + k * 46, h: 78 + (k === 1 ? 26 : 0), got: new Set() });
        if (type === 'beam' && Math.random() < 0.5) for (let k = 0; k < 3; k++) coins.push({ x: x - 40 + k * 40, h: 22, got: new Set() });
        if (type === 'mud') for (let k = 0; k < 3; k++) coins.push({ x: x + 20 + k * 40, h: 70 + (k === 1 ? 22 : 0), got: new Set() });
      }
      x += rand(430, 660);
    }
  }

  function startRace() {
    SG.audioUnlock();
    scenery = new Scenery(choice(['meadow', 'sunset', 'snow', 'forest', 'night']), (Math.random() * 60) | 0);
    runners = [];
    // humans take the nearest (largest) lanes
    for (let i = 0; i < total; i++) {
      const human = i < humans;
      runners.push(new Runner(i, total - 1 - i, human, i));
    }
    runners.sort((a, b) => a.lane - b.lane);
    buildCourse();
    camX = 0; raceT = 0; finishCount = 0; endT = 0;
    state = 'count'; countT = 3.2;
    SG.show('start-screen', false); SG.show('results-screen', false);
    buildTouch();
  }

  function buildTouch() {
    SG.clearTouch(); touchZones = []; touchBtns = null;
    if (!SG.isTouch) return;
    if (humans === 1) {
      touchBtns = {
        jump: SG.makeBtn('⤊', { right: 26, bottom: 26, size: 92, color: '#37d6c4' }),
        slide: SG.makeBtn('⤋', { left: 26, bottom: 26, size: 92, color: '#4da3ff' }),
        turbo: SG.makeBtn('⚡', { right: 132, bottom: 30, size: 66, color: '#ffd34d' }),
      };
    }
    SG.showTouch(true);
  }

  // swipe/tap zones (one vertical column per human)
  const pointers = new Map();
  const canvas = $('game');
  canvas.addEventListener('pointerdown', e => {
    if (state !== 'race' || !SG.isTouch || humans === 1) return;
    const p = SG.toLocal(e);
    const zone = clamp(Math.floor(p.x / (W / humans)), 0, humans - 1);
    pointers.set(e.pointerId, { zone, x: p.x, y: p.y, used: false });
  });
  canvas.addEventListener('pointermove', e => {
    const q = pointers.get(e.pointerId);
    if (!q || q.used) return;
    const p = SG.toLocal(e);
    const r = runners.find(r => r.human && r.slot === q.zone);
    if (!r) return;
    if (p.y - q.y > 28) { r.inp.slide = true; q.used = true; }
    else if (q.y - p.y > 34) { r.inp.turbo = true; q.used = true; }
  });
  const endPtr = e => {
    const q = pointers.get(e.pointerId);
    if (q && !q.used) { const r = runners.find(r => r.human && r.slot === q.zone); if (r) r.inp.jump = true; }
    pointers.delete(e.pointerId);
  };
  canvas.addEventListener('pointerup', endPtr);
  canvas.addEventListener('pointercancel', endPtr);

  function readHuman(r) {
    const k = KEYS[r.slot];
    if (SG.anyPressed(...k.jump)) r.inp.jump = true;
    if (SG.anyKey(...k.slide)) r.inp.slide = true;
    if (SG.anyPressed(...k.turbo)) r.inp.turbo = true;
    if (touchBtns && r.slot === 0) {
      if (touchBtns.jump.hit()) r.inp.jump = true;
      if (touchBtns.slide.down) r.inp.slide = true;
      if (touchBtns.turbo.hit()) r.inp.turbo = true;
    }
  }

  function botThink(r, dt) {
    const b = r.bot;
    b.holdSlide -= dt;
    if (b.holdSlide > 0) r.inp.slide = true;
    for (const o of obstacles) {
      const d = o.x - r.x;
      if (d < -40 || d > 420) continue;
      if (!b.plan.has(o)) b.plan.set(o, Math.random() < b.miss ? 'miss' : 'ok');
      if (b.plan.get(o) !== 'ok') continue;
      const lead = r.speed * 0.2 * b.react;
      if (o.type === 'hurdle' && d < lead + 26 && d > 10 && r.h <= 0.5) { r.inp.jump = true; b.plan.set(o, 'done'); }
      else if (o.type === 'beam' && d < lead + 40 && d > -10) { r.inp.slide = true; b.holdSlide = 0.35; if (d < 20) b.plan.set(o, 'done'); }
      else if (o.type === 'mud' && d < lead + 10 && d > 0 && r.h <= 0.5 && Math.random() < 0.75) { r.inp.jump = true; b.plan.set(o, 'done'); }
    }
    if (r.coins >= TURBO_NEED && Math.random() < dt * 1.2) r.inp.turbo = true;
  }

  function update(dt) {
    fx.update(dt);
    if (state === 'menu' || state === 'results') return;

    if (state === 'count') {
      const before = Math.ceil(countT);
      countT -= dt;
      if (Math.ceil(countT) !== before && countT > 0) sfx.tick();
      if (countT <= 0) { state = 'race'; sfx.power(); }
    } else raceT += dt;

    for (const r of runners) {
      if (state === 'race' && !r.done) {
        if (r.human) readHuman(r); else botThink(r, dt);
      }
      // obstacles
      r.mudded = false;
      if (state === 'race' && !r.done) {
        for (const o of obstacles) {
          if (o.x > r.x + 200) break;
          if (o.x + o.w < r.x - 40) continue;
          if (o.type === 'hurdle') {
            if (!o.hit.has(r) && Math.abs(r.x - o.x) < 13 && r.h < 30) { o.hit.add(r); if (r.turboT > 0) smash(o, r); else r.trip(false); }
          } else if (o.type === 'beam') {
            if (!o.hit.has(r) && Math.abs(r.x - o.x) < 13 && !r.sliding && r.h < 78) { o.hit.add(r); if (r.turboT > 0) smash(o, r); else r.trip(true); }
          } else if (o.type === 'mud') {
            if (r.x > o.x && r.x < o.x + o.w && r.h <= 1) {
              r.mudded = true;
              if (Math.random() < 0.3) fx.burst(r.x, laneY(r.lane), 1, { color: '#6b4a2e', speedMin: 40, speedMax: 140, angle: -Math.PI / 2, spread: 0.8, lifeMin: 0.2, lifeMax: 0.4 });
            }
          } else if (o.type === 'boost') {
            if (!o.hit.has(r) && r.x > o.x && r.x < o.x + o.w && r.h <= 1) { o.hit.add(r); r.boostT = 1.5; if (r.human) sfx.power(); fx.text(r.x, laneY(r.lane) - 125, 'TEZLIK!', '#5dff9a', 16); }
          }
        }
        for (const c of coins) {
          if (c.got.has(r)) continue;
          if (Math.abs(c.x - r.x) < 22 && Math.abs(c.h - (r.h + (r.sliding ? 18 : 50))) < 46) {
            c.got.add(r); r.coins = Math.min(TURBO_NEED, r.coins + 1);
            if (r.human) { sfx.coin(); fx.burst(c.x, laneY(r.lane) - c.h, 6, { color: '#ffd34d', speedMin: 40, speedMax: 160 }); }
          }
        }
      }
      r.update(dt);
      r.inp.jump = false; r.inp.slide = false; r.inp.turbo = false;
    }

    // camera follows the leading human (or the leader when there are none)
    const hs = runners.filter(r => r.human);
    const lead = (hs.length ? hs : runners).reduce((a, b) => (b.x > a.x ? b : a));
    camX = damp(camX, lead.x - W * 0.3, 6, dt);
    for (const r of hs) if (!r.done && r.x < camX + 30) { r.x = camX + 30; }

    if (state === 'race') {
      const humansDone = hs.every(r => r.done);
      if (finishCount > 0) endT += dt;
      if (finishCount === runners.length || (hs.length && humansDone && endT > 2.5) || endT > 12) finish();
    }
  }

  function smash(o, r) {
    o.broken = true;
    fx.burst(o.x, laneY(r.lane) - 30, 14, { color: '#e8d2a8', spark: true, speedMin: 150, speedMax: 480 });
    if (r.human) { sfx.heavy(); fx.shake(6); }
  }

  function finish() {
    state = 'results';
    const order = [...runners].sort((a, b) => (a.done && b.done ? a.place - b.place : a.done ? -1 : b.done ? 1 : b.x - a.x));
    const first = order[0];
    $('winner-text').textContent = first.human ? `🏆 ${first.name} g'olib!` : `${first.name} yutdi`;
    $('rank-list').innerHTML = order.map((r, i) => `<div class="rank-row${i === 0 ? ' first' : ''}"><span class="pl">${i + 1}</span><span class="nm" style="color:${r.color}">${r.name}</span><span class="tm">${r.done ? r.time.toFixed(1) + ' s' : 'yetmadi'}</span></div>`).join('');
    if (!first.human) sfx.lose();
    SG.showTouch(false);
    SG.show('results-screen', true);
  }

  // ---------- draw ----------
  function drawTrack(ctx) {
    const n = runners.length || 4;
    const top = FLOOR - (n - 1) * LANE_GAP - 20, bot = FLOOR + 16;
    const g = ctx.createLinearGradient(0, top, 0, bot);
    g.addColorStop(0, '#b9503f'); g.addColorStop(1, '#d9664c');
    ctx.fillStyle = g; ctx.fillRect(0, top, W, bot - top);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(0, top, W, 3); ctx.fillRect(0, bot - 3, W, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 1; i < n; i++) ctx.fillRect(0, FLOOR - (n - 1 - i) * LANE_GAP - LANE_GAP + 8, W, 2);
    // distance ticks
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    const first = Math.floor(camX / 200);
    for (let i = first; i < first + W / 200 + 2; i++) ctx.fillRect(i * 200 - camX, top + 3, 6, bot - top - 6);
    // finish line
    const fxp = TRACK_LEN - camX;
    if (fxp > -60 && fxp < W + 60) {
      for (let r = 0; r < (bot - top) / 10; r++) for (let c = 0; c < 4; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#171d2b';
        ctx.fillRect(fxp + c * 10, top + r * 10, 10, 10);
      }
      ctx.fillStyle = '#171d2b'; ctx.fillRect(fxp - 4, top - 150, 6, 150); ctx.fillRect(fxp + 38, top - 150, 6, 150);
      ctx.fillStyle = '#ffd34d'; rr(ctx, fxp - 10, top - 150, 60, 30, 6); ctx.fill();
      label(ctx, 'MARRA', fxp + 20, top - 129, 14, '#171d2b', 'center', false);
    }
  }

  function drawObstacle(ctx, o, lane) {
    const x = o.x - camX, y = laneY(lane), s = laneS(lane);
    if (x < -160 || x > W + 60) return;
    if (o.type === 'hurdle') {
      if (o.broken) return;
      ctx.strokeStyle = '#171d2b'; ctx.lineWidth = 7 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 9 * s, y); ctx.lineTo(x - 9 * s, y - 34 * s); ctx.moveTo(x + 9 * s, y); ctx.lineTo(x + 9 * s, y - 34 * s); ctx.stroke();
      ctx.strokeStyle = '#f4f7fc'; ctx.lineWidth = 4 * s; ctx.stroke();
      ctx.fillStyle = '#171d2b'; rr(ctx, x - 15 * s, y - 42 * s, 30 * s, 12 * s, 3); ctx.fill();
      ctx.fillStyle = '#ff5d5d'; rr(ctx, x - 13 * s, y - 40 * s, 26 * s, 8 * s, 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 4 * s, y - 40 * s, 8 * s, 8 * s);
    } else if (o.type === 'beam') {
      if (o.broken) return;
      ctx.strokeStyle = '#171d2b'; ctx.lineWidth = 7 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y - 62 * s); ctx.lineTo(x, y - 150 * s); ctx.stroke();
      ctx.strokeStyle = '#8d99b8'; ctx.lineWidth = 4 * s; ctx.stroke();
      ctx.fillStyle = '#171d2b'; rr(ctx, x - 20 * s, y - 80 * s, 40 * s, 24 * s, 5); ctx.fill();
      for (let k = 0; k < 4; k++) { ctx.fillStyle = k % 2 === 0 ? '#ffd34d' : '#171d2b'; ctx.fillRect(x - 17 * s + k * 8.5 * s, y - 77 * s, 8.5 * s, 18 * s); }
    } else if (o.type === 'mud') {
      ctx.fillStyle = '#5a3d26';
      ctx.beginPath(); ctx.ellipse(x + o.w / 2, y + 2, o.w / 2, 7 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7a5636';
      ctx.beginPath(); ctx.ellipse(x + o.w / 2 - 10, y, o.w / 3, 3.5 * s, 0, 0, Math.PI * 2); ctx.fill();
    } else if (o.type === 'boost') {
      const t = SG.time.t;
      ctx.fillStyle = 'rgba(93,255,154,0.25)'; rr(ctx, x, y - 5, o.w, 10, 5); ctx.fill();
      ctx.strokeStyle = '#5dff9a'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let k = 0; k < 3; k++) {
        const ax = x + 14 + k * 26 + (t * 40) % 10;
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 8 - k);
        ctx.beginPath(); ctx.moveTo(ax - 6, y - 6); ctx.lineTo(ax + 2, y); ctx.lineTo(ax - 6, y + 6); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawCoin(ctx, c, lane, r) {
    if (c.got.has(r)) return;
    const x = c.x - camX;
    if (x < -20 || x > W + 20) return;
    const y = laneY(lane) - c.h * laneS(lane), s = laneS(lane);
    const sq = Math.abs(Math.cos(SG.time.t * 5 + c.x * 0.01));
    ctx.fillStyle = '#a66d00'; ctx.beginPath(); ctx.ellipse(x, y, (7 * sq + 2.5) * s, 9.5 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.ellipse(x, y, (6 * sq + 1.5) * s, 8 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.ellipse(x - 1, y - 2, (2.5 * sq + 0.5) * s, 3.5 * s, 0, 0, Math.PI * 2); ctx.fill();
  }

  function drawHud(ctx) {
    // progress strip
    const px = SG.hudX() + 8, pw = W - px - 60, py = 26;
    rr(ctx, px, py - 5, pw, 10, 5); ctx.fillStyle = 'rgba(8,10,18,0.55)'; ctx.fill();
    label(ctx, '🏁', px + pw + 16, py + 6, 16, '#fff', 'center', false);
    [...runners].sort((a, b) => a.human - b.human).forEach(r => {
      const k = clamp(r.x / TRACK_LEN, 0, 1);
      ctx.beginPath(); ctx.arc(px + pw * k, py, r.human ? 9 : 6.5, 0, Math.PI * 2);
      ctx.fillStyle = r.color; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = r.human ? '#ffffff' : 'rgba(10,14,24,0.8)'; ctx.stroke();
    });
    // per-human panels
    const hs = runners.filter(r => r.human).sort((a, b) => a.slot - b.slot);
    const order = [...runners].sort((a, b) => (a.done && b.done ? a.place - b.place : a.done ? -1 : b.done ? 1 : b.x - a.x));
    hs.forEach((r, k) => {
      const zw = W / hs.length, bx = hs.length === 1 || k === 0 ? SG.hudX() + 8 : zw * k + 14, by = 50;
      const pos = order.indexOf(r) + 1;
      label(ctx, `${r.name}`, bx, by + 14, 14, r.color, 'left');
      label(ctx, `${pos}/${runners.length}`, bx + 34, by + 15, 18, pos === 1 ? '#ffd34d' : '#ffffff', 'left');
      bar(ctx, bx + 84, by + 3, 92, 12, r.turboT > 0 ? r.turboT / 2.2 : r.coins / TURBO_NEED, '#ffd34d', '#ff9a3d');
      if (r.coins >= TURBO_NEED && r.turboT <= 0 && Math.sin(SG.time.t * 10) > 0) label(ctx, 'TURBO ⚡', bx + 130, by + 14, 11, '#171d2b', 'center', false);
    });
    if (SG.isTouch && hs.length > 1 && state === 'race') {
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2; ctx.setLineDash([8, 10]);
      for (let k = 1; k < hs.length; k++) { ctx.beginPath(); ctx.moveTo(W / hs.length * k, 80); ctx.lineTo(W / hs.length * k, H); ctx.stroke(); }
      ctx.setLineDash([]);
    }
  }

  function draw(ctx) {
    const t = SG.time.t;
    ctx.save();
    fx.applyShake(ctx);
    const n = runners.length || 4;
    const horizon = FLOOR - (n - 1) * LANE_GAP - 20;
    scenery.drawSky(ctx, W, H, camX, horizon, t);
    scenery.drawGround(ctx, W, H, camX, FLOOR + 16);
    drawTrack(ctx);
    if (state !== 'menu') {
      for (const r of runners) {
        for (const o of obstacles) if (o.type === 'mud' || o.type === 'boost') drawObstacle(ctx, o, r.lane);
      }
      for (const r of runners) {
        for (const o of obstacles) if (o.type === 'hurdle' || o.type === 'beam') drawObstacle(ctx, o, r.lane);
        if (r.human) for (const c of coins) drawCoin(ctx, c, r.lane, r);
        const sx = r.x - camX, y = laneY(r.lane), s = laneS(r.lane);
        if (sx > -80 && sx < W + 80) {
          r.char.draw(ctx, sx, y - r.h, { scale: s, groundY: y, mood: r.stumble > 0 ? 'hurt' : r.done && r.place === 1 ? 'happy' : 'normal', flash: r.stumble > 0.6 ? 1 : 0 });
          label(ctx, r.name, sx, y - r.h - 118 * s, 11, r.color);
        } else if (state === 'race') {
          const ahead = sx >= W + 80;
          label(ctx, `${ahead ? '' : '◀ '}${r.name} ${Math.round(Math.abs(r.x - (camX + W * 0.3)) / 10)}m${ahead ? ' ▶' : ''}`, ahead ? W - 12 : 12, y - 40, 11, r.color, ahead ? 'right' : 'left');
        }
      }
      ctx.save(); ctx.translate(-camX, 0); fx.draw(ctx); ctx.restore();
    }
    ctx.restore();
    if (state !== 'menu') {
      drawHud(ctx);
      if (state === 'count') label(ctx, countT > 0.4 ? String(Math.ceil(countT - 0.2)) : 'BOSHLA!', W / 2, H * 0.4, 90, '#ffd34d');
      else if (raceT < 0.7) label(ctx, 'BOSHLA!', W / 2, H * 0.4, 90, '#5dff9a');
    }
  }

  SG.run(update, draw);
  $('start-btn').addEventListener('click', startRace);
  $('retry-btn').addEventListener('click', startRace);
  syncHumans();
  if (/debug/.test(location.search)) window.__g = { get runners() { return runners; }, get state() { return state; } };
})();
