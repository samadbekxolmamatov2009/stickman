(() => {
  'use strict';
  const { rand, clamp, damp, choice, sfx, FX, Char, poses, Scenery, label, bar, rr, $ } = SG;

  const H = 540, FLOOR = 452;
  let W = 960;
  let platforms = [];
  function layout() {
    W = SG.view.W;
    platforms = [
      { x: W * 0.2, y: 338, w: 170 },
      { x: W * 0.8, y: 338, w: 170 },
      { x: W * 0.5, y: 236, w: 200 },
    ];
  }
  SG.initView($('game'), layout);

  const fx = new FX();
  let scenery = new Scenery('night', 2);
  let mode = 'bot', diff = 1;
  SG.seg('mode-seg', v => { mode = v; $('diff-pick').classList.toggle('hidden', v !== 'bot'); });
  SG.seg('diff-seg', v => { diff = Number(v); });

  const MAX_HP = 100, SPEED = 265, GRAV = 1750;
  const ATK = {
    jab: { dur: 0.25, at: 0.07, dmg: 6, range: 62, kb: 130, lift: 70, stun: 0.22, pose: 'punch' },
    cross: { dur: 0.3, at: 0.09, dmg: 8, range: 66, kb: 210, lift: 100, stun: 0.28, pose: 'cross' },
    upper: { dur: 0.46, at: 0.13, dmg: 13, range: 62, kb: 150, lift: 560, stun: 0.55, pose: 'upper', breaks: true, heavy: true },
    kick: { dur: 0.46, at: 0.14, dmg: 11, range: 82, kb: 400, lift: 170, stun: 0.34, pose: 'kick', heavy: true },
    dive: { dur: 0.55, at: 0.06, dmg: 12, range: 58, kb: 320, lift: 140, stun: 0.34, pose: 'kick', cont: true, heavy: true },
    special: { dur: 0.55, at: 0.24, pose: 'cast' },
  };
  const COMBO = ['jab', 'cross', 'upper'];
  const blankInput = () => ({ mx: 0, jump: false, block: false, punch: false, kick: false, special: false, dash: false });

  class Fighter {
    constructor(idx, x, color, name, style) {
      this.idx = idx; this.x = x; this.y = FLOOR; this.vx = 0; this.vy = 0;
      this.facing = idx === 0 ? 1 : -1;
      this.color = color; this.name = name;
      this.char = new Char({ color, style });
      this.hp = MAX_HP; this.hpShown = MAX_HP; this.energy = 0;
      this.onGround = true; this.jumps = 0;
      this.atk = null; this.atkT = 0; this.atkHit = false; this.queued = false;
      this.stage = 0; this.comboT = 0;
      this.stun = 0; this.inv = 0; this.flash = 0;
      this.blocking = false; this.dashT = 0; this.dashCd = 0;
      this.weapon = null; this.ko = false; this.runPh = 0; this.win = false;
    }
    start(name) {
      this.atk = name; this.atkT = 0; this.atkHit = false; this.queued = false;
      if (name === 'special') { sfx.power(); } else sfx.whoosh();
    }
    update(dt, inp, foe) {
      this.inv -= dt; this.flash -= dt; this.dashCd -= dt; this.comboT -= dt;
      this.hpShown = damp(this.hpShown, this.hp, 6, dt);
      const wasGround = this.onGround;

      if (this.ko || this.win) {
        this.blocking = false; this.atk = null;
        if (this.onGround) this.vx = damp(this.vx, 0, 8, dt);
      } else if (this.stun > 0) {
        this.stun -= dt; this.blocking = false; this.atk = null;
        if (this.onGround) this.vx = damp(this.vx, 0, 5, dt);
      } else if (this.atk) {
        const d = ATK[this.atk];
        this.atkT += dt;
        if (inp.punch && COMBO.includes(this.atk)) this.queued = true;
        if (this.onGround && this.atk !== 'dive') this.vx = damp(this.vx, 0, 10, dt);
        if (this.atk === 'dive') { this.vx = this.facing * 420; this.vy = Math.max(this.vy, 380); if (this.onGround) this.atkT = Math.max(this.atkT, d.dur - 0.1); }
        if (this.atkT >= d.at && (!this.atkHit || d.cont)) {
          if (this.atk === 'special') {
            if (!this.atkHit) { shots.push({ x: this.x + this.facing * 40, y: this.y - 62, vx: this.facing * 560, owner: this, t: 0 }); sfx.shoot(); this.energy = 0; }
            this.atkHit = true;
          } else if (!this.atkHit) {
            if (tryHit(this, foe, d)) this.atkHit = true;
            else if (!d.cont) this.atkHit = true;
          }
        }
        if (this.atkT >= d.dur) {
          const was = this.atk;
          this.atk = null;
          if (COMBO.includes(was)) {
            this.comboT = 0.45;
            if (this.queued && this.stage < 2) { this.stage++; this.faceFoe(foe); this.start(COMBO[this.stage]); }
            else if (this.stage >= 2) this.stage = 0, this.comboT = 0;
          }
        }
      } else {
        if (this.comboT <= 0) this.stage = 0;
        this.blocking = inp.block && this.onGround;
        if (this.dashT > 0) {
          this.dashT -= dt;
        } else if (this.blocking) {
          this.vx = damp(this.vx, 0, 14, dt);
        } else {
          this.vx = damp(this.vx, inp.mx * SPEED, this.onGround ? 16 : 7, dt);
          if (Math.abs(inp.mx) > 0.2) this.facing = inp.mx > 0 ? 1 : -1;
        }
        if (inp.jump && !this.blocking && (this.onGround || this.jumps < 2)) {
          this.vy = this.jumps === 0 ? -640 : -560; this.jumps++; this.onGround = false;
          sfx.jump(); fx.dust(this.x, this.y, 4);
        }
        if (inp.dash && this.dashCd <= 0 && !this.blocking) {
          const dir = Math.abs(inp.mx) > 0.2 ? Math.sign(inp.mx) : this.facing;
          this.vx = dir * 760; this.dashT = 0.16; this.inv = 0.2; this.dashCd = 0.85;
          sfx.whoosh(); fx.dust(this.x, this.y, 6);
        }
        if (!this.blocking) {
          if (inp.special && this.energy >= 100) { this.faceFoe(foe); this.start('special'); }
          else if (inp.punch) { this.faceFoe(foe); if (this.comboT > 0 && this.stage < 2) this.stage++; else this.stage = 0; this.start(COMBO[this.stage]); }
          else if (inp.kick) { this.faceFoe(foe); this.start(this.onGround ? 'kick' : 'dive'); }
        }
      }

      // physics
      this.vy += GRAV * dt;
      const prevY = this.y;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.onGround = false;
      if (this.y >= FLOOR) { this.y = FLOOR; this.vy = 0; this.onGround = true; }
      else if (this.vy > 0) {
        for (const p of platforms) {
          if (prevY <= p.y + 1 && this.y >= p.y && Math.abs(this.x - p.x) < p.w / 2 + 6) { this.y = p.y; this.vy = 0; this.onGround = true; break; }
        }
      }
      if (this.onGround) { this.jumps = 0; if (!wasGround) { fx.dust(this.x, this.y, 5); sfx.land(); } }
      if (this.x < 34) { this.x = 34; this.vx = Math.abs(this.vx) * 0.3; }
      if (this.x > W - 34) { this.x = W - 34; this.vx = -Math.abs(this.vx) * 0.3; }

      // animation
      const P = poses, t = SG.time.t;
      let pose, rate = 16;
      if (this.ko) { pose = P.ko(); rate = 9; }
      else if (this.win) { pose = P.cheer(t); }
      else if (this.stun > 0) { pose = P.hurt(); rate = 26; }
      else if (this.atk) {
        const d = ATK[this.atk];
        if (this.weapon && COMBO.includes(this.atk)) pose = P.slash(clamp((this.atkT - d.at * 0.4) / (d.at * 1.2), 0, 1));
        else pose = this.atkT < d.at * 0.55 && this.atk !== 'jab' ? P.windup() : P[d.pose]();
        if (this.atk === 'dive') pose = P.kick();
        rate = 34;
      }
      else if (this.blocking) pose = P.block(t);
      else if (!this.onGround) pose = this.vy < 0 ? P.jump() : P.fall();
      else if (Math.abs(this.vx) > 40) { this.runPh += dt * (8 + Math.abs(this.vx) * 0.02); pose = P.run(this.runPh); rate = 22; }
      else pose = P.guard(t + this.idx);
      this.char.to(pose, dt, rate);
    }
    faceFoe(foe) { if (Math.abs(foe.x - this.x) < 260) this.facing = foe.x >= this.x ? 1 : -1; }
    draw(ctx) {
      const mood = this.ko ? 'ko' : this.stun > 0 ? 'hurt' : this.win ? 'happy' : 'normal';
      if (this.dashT > 0) {
        for (let i = 1; i <= 2; i++) this.char.draw(ctx, this.x - this.vx * 0.02 * i, this.y, { facing: this.facing, alpha: 0.18, shadow: false, tails: false });
      }
      this.char.draw(ctx, this.x, this.y, {
        facing: this.facing, mood, flash: this.flash, groundY: groundBelow(this.x, this.y),
        weapon: this.weapon ? this.weapon.type : null, alpha: this.inv > 0 && !this.ko && this.dashT <= 0 && this.stun <= 0 ? 0.6 : 1,
      });
      if (this.blocking) {
        ctx.save();
        ctx.strokeStyle = 'rgba(160,220,255,0.8)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(this.x + this.facing * 16, this.y - 58, 40, -1.1 * this.facing + (this.facing < 0 ? Math.PI : 0) - 0.0, 1.1 * this.facing + (this.facing < 0 ? Math.PI : 0), this.facing < 0); ctx.stroke();
        ctx.restore();
      }
      if (this.energy >= 100 && !this.ko) {
        ctx.save();
        ctx.globalAlpha = 0.35 + 0.25 * Math.sin(SG.time.t * 10);
        ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(this.x, this.y - 2, 30, 8, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
      label(ctx, this.name, this.x, this.y - 124, 12, this.color);
    }
  }

  function groundBelow(x, y) {
    let g = FLOOR;
    for (const p of platforms) if (Math.abs(x - p.x) < p.w / 2 + 6 && p.y >= y - 1 && p.y < g) g = p.y;
    return g;
  }

  function tryHit(a, t, d) {
    if (t.inv > 0 || t.ko) return false;
    const range = d.range + (a.weapon && COMBO.includes(a.atk) ? 28 : 0);
    const dx = (t.x - a.x) * a.facing;
    if (dx < -14 || dx > range || Math.abs(t.y - a.y) > 78) return false;
    let dmg = d.dmg, kb = d.kb;
    if (a.weapon && COMBO.includes(a.atk)) {
      dmg += a.weapon.type === 'sword' ? 7 : 5;
      if (a.weapon.type === 'club') kb *= 1.9;
      if (--a.weapon.uses <= 0) { a.weapon = null; fx.text(a.x, a.y - 130, 'sindi!', '#cfd6e6', 14); }
    }
    applyHit(a, t, dmg, kb, d.lift, d.stun, d.breaks, d.heavy);
    return true;
  }

  function applyHit(a, t, dmg, kb, lift, stun, breaks, heavy) {
    const dir = a.x <= t.x ? 1 : -1;
    const hx = t.x - dir * 10, hy = t.y - 66;
    const blocked = t.blocking && t.facing === -dir && !breaks;
    if (blocked) {
      t.hp = Math.max(1, t.hp - dmg * 0.12);
      t.vx = dir * kb * 0.35;
      fx.burst(hx, hy, 8, { color: '#bfe6ff', spark: true, speedMin: 120, speedMax: 320, gravity: 200 });
      fx.ring(hx, hy, '#bfe6ff', 34, 0.2, 3);
      sfx.block(); SG.time.freeze = 0.03;
      a.energy = Math.min(100, a.energy + dmg * 0.5);
      return;
    }
    t.hp = Math.max(0, t.hp - dmg);
    t.stun = stun; t.inv = 0.12; t.flash = 0.09; t.blocking = false; t.atk = null;
    t.vx = dir * kb; t.vy = -lift; if (lift > 100) t.onGround = false;
    a.energy = Math.min(100, a.energy + dmg * 2.2);
    t.energy = Math.min(100, t.energy + dmg * 1.1);
    fx.burst(hx, hy, heavy ? 16 : 9, { color: '#ffd98a', spark: true, speedMin: 140, speedMax: heavy ? 480 : 320, gravity: 300 });
    fx.burst(hx, hy, 5, { color: '#ffffff', speedMin: 40, speedMax: 140 });
    fx.ring(hx, hy, '#ffffff', heavy ? 56 : 34, 0.22, 4);
    fx.text(t.x, t.y - 120, `-${Math.round(dmg)}`, heavy ? '#ff8a5d' : '#ffd34d', heavy ? 24 : 18);
    fx.shake(heavy ? 9 : 4);
    SG.time.freeze = heavy ? 0.08 : 0.045;
    if (heavy) { sfx.heavy(); SG.buzz(30); } else sfx.hit();
    if (t.hp <= 0) koFighter(t, a);
  }

  let p1, p2, shots = [], pickups = [], pickT = 6;
  let state = 'menu', wins = [0, 0], round = 1, roundT = 60, introT = 0, koT = 0;
  let touch = null;

  function koFighter(t, a) {
    t.ko = true; t.vy = -420; t.vx = (t.x >= a.x ? 1 : -1) * 320; t.onGround = false;
    state = 'ko'; koT = 0; SG.time.scale = 0.25;
    fx.shake(16); sfx.explode(); SG.buzz(120);
    wins[a.idx]++;
  }

  function newRound() {
    p1 = new Fighter(0, W * 0.3, '#ff5d5d', 'P1', 'band');
    p2 = new Fighter(1, W * 0.7, '#4da3ff', mode === 'bot' ? 'BOT' : 'P2', mode === 'bot' ? 'spiky' : 'band');
    shots = []; pickups = []; pickT = rand(5, 8);
    roundT = 60; introT = 1.9; state = 'intro'; SG.time.scale = 1;
    ai.t = 0; ai.inp = blankInput();
  }

  function startMatch() {
    SG.audioUnlock();
    scenery = new Scenery(choice(['night', 'sunset', 'snow', 'forest']), (Math.random() * 50) | 0);
    wins = [0, 0]; round = 1;
    SG.show('start-screen', false); SG.show('results-screen', false);
    buildTouch();
    newRound();
  }

  function buildTouch() {
    SG.clearTouch();
    if (!SG.isTouch) return;
    touch = {
      stick: SG.makeStick(),
      punch: SG.makeBtn('👊', { right: 22, bottom: 22, size: 80, color: '#ff5d5d' }),
      kick: SG.makeBtn('🦵', { right: 114, bottom: 18, size: 64, color: '#ffb84d' }),
      jump: SG.makeBtn('⤊', { right: 30, bottom: 114, size: 62, color: '#37d6c4' }),
      special: SG.makeBtn('🔥', { right: 108, bottom: 94, size: 58, color: '#c77dff' }),
      dash: SG.makeBtn('💨', { right: 190, bottom: 24, size: 54, color: '#4da3ff' }),
    };
    SG.showTouch(true);
  }

  let stickJumpLatch = false;
  function humanInput(i) {
    const inp = blankInput();
    if (i === 0) {
      inp.mx = (SG.key('KeyD') ? 1 : 0) - (SG.key('KeyA') ? 1 : 0);
      inp.jump = SG.pressed('KeyW'); inp.block = SG.key('KeyS');
      inp.punch = SG.pressed('KeyF'); inp.kick = SG.pressed('KeyG');
      inp.special = SG.pressed('KeyH'); inp.dash = SG.pressed('KeyQ');
      if (touch) {
        const s = touch.stick;
        if (Math.abs(s.x) > 0.25) inp.mx = Math.sign(s.x);
        const up = s.y < -0.6;
        if (up && !stickJumpLatch) inp.jump = true;
        stickJumpLatch = up;
        if (s.y > 0.6) inp.block = true;
        if (touch.jump.hit()) inp.jump = true;
        if (touch.punch.hit()) inp.punch = true;
        if (touch.kick.hit()) inp.kick = true;
        if (touch.special.hit()) inp.special = true;
        if (touch.dash.hit()) inp.dash = true;
      }
    } else {
      inp.mx = (SG.key('ArrowRight') ? 1 : 0) - (SG.key('ArrowLeft') ? 1 : 0);
      inp.jump = SG.pressed('ArrowUp'); inp.block = SG.key('ArrowDown');
      inp.punch = SG.pressed('KeyK'); inp.kick = SG.pressed('KeyL');
      inp.special = SG.pressed('Semicolon'); inp.dash = SG.pressed('KeyO');
    }
    return inp;
  }

  // ---------- bot ----------
  const ai = { t: 0, inp: blankInput(), blockT: 0, retreatT: 0 };
  const AI_LV = [
    { react: 0.34, block: 0.18, aggro: 0.5, combo: 0.35 },
    { react: 0.2, block: 0.42, aggro: 0.72, combo: 0.65 },
    { react: 0.11, block: 0.68, aggro: 0.9, combo: 0.9 },
  ];
  function botInput(me, foe, dt) {
    const lv = AI_LV[diff];
    const out = blankInput();
    ai.t -= dt; ai.blockT -= dt; ai.retreatT -= dt;
    const dx = foe.x - me.x, adx = Math.abs(dx), dir = Math.sign(dx) || 1;
    out.mx = ai.inp.mx; out.block = ai.blockT > 0;

    // reflex: incoming fireball
    for (const s of shots) {
      if (s.owner !== me && Math.abs(s.x - me.x) < 170 && Math.sign(s.vx) === Math.sign(me.x - s.x) && Math.abs(s.y - (me.y - 60)) < 70) {
        if (Math.random() < lv.block * 0.25) { if (me.onGround && Math.random() < 0.5) out.jump = true; else ai.blockT = 0.3; }
      }
    }
    if (foe.atk && adx < 110 && ai.blockT <= 0 && Math.random() < lv.block * dt * 14) ai.blockT = rand(0.25, 0.5);

    if (ai.t <= 0) {
      ai.t = lv.react * rand(0.7, 1.4);
      let mx = 0;
      const target = pickups.find(p => p.ground && Math.abs(p.x - me.x) < 260 && (p.type !== 'heart' || me.hp < 70) && (p.type === 'heart' || !me.weapon));
      if (ai.retreatT > 0) mx = -dir;
      else if (target && Math.random() < 0.7) mx = Math.sign(target.x - me.x);
      else if (adx > 74) mx = Math.random() < lv.aggro ? dir : 0;
      else if (adx < 40) mx = -dir * 0.6;
      ai.inp.mx = mx; out.mx = mx;

      if (foe.y < me.y - 70 && me.onGround && Math.random() < 0.6) out.jump = true;
      if (me.energy >= 100 && adx > 150 && Math.abs(foe.y - me.y) < 50 && Math.random() < 0.7) out.special = true;
      else if (adx < 92 && Math.abs(foe.y - me.y) < 70 && !foe.ko && ai.blockT <= 0) {
        const r = Math.random();
        if (me.atk || me.comboT > 0) { if (Math.random() < lv.combo) out.punch = true; }
        else if (r < lv.aggro * 0.55) out.punch = true;
        else if (r < lv.aggro * 0.8) out.kick = true;
        else if (r > 0.93) { ai.retreatT = 0.4; out.dash = Math.random() < 0.4; }
      } else if (adx > 260 && Math.random() < 0.08 * lv.aggro) out.dash = true;
      if (!me.onGround && adx < 150 && me.y < foe.y - 40 && Math.random() < 0.3 * lv.aggro) out.kick = true;
    } else if ((me.atk || me.comboT > 0) && adx < 100 && Math.random() < lv.combo * dt * 9) out.punch = true;
    if (out.block) out.mx = 0;
    return out;
  }

  // ---------- update ----------
  function update(dt) {
    fx.update(dt);
    if (state === 'menu' || state === 'results') return;

    if (state === 'intro') {
      introT -= dt;
      p1.update(dt, blankInput(), p2); p2.update(dt, blankInput(), p1);
      if (introT <= 0) { state = 'fight'; sfx.power(); }
      return;
    }

    const i1 = state === 'fight' ? humanInput(0) : blankInput();
    const i2 = state === 'fight' ? (mode === 'bot' ? botInput(p2, p1, dt) : humanInput(1)) : blankInput();
    p1.update(dt, i1, p2); p2.update(dt, i2, p1);

    // body push
    const gap = p2.x - p1.x;
    if (Math.abs(gap) < 40 && Math.abs(p1.y - p2.y) < 60 && !p1.ko && !p2.ko) {
      const push = (40 - Math.abs(gap)) / 2, d = gap >= 0 ? 1 : -1;
      p1.x -= push * d; p2.x += push * d;
    }

    // fireballs
    for (const s of shots) {
      s.t += dt; s.x += s.vx * dt;
      fx.burst(s.x, s.y, 1, { color: choice(['#ffb347', '#ff7a3d', '#ffe08a']), speedMin: 10, speedMax: 60, gravity: -80, lifeMin: 0.2, lifeMax: 0.45, rMin: 3, rMax: 7 });
      const t = s.owner === p1 ? p2 : p1;
      if (!s.dead && t.inv <= 0 && !t.ko && Math.abs(s.x - t.x) < 30 && Math.abs(s.y - (t.y - 60)) < 62) {
        s.dead = true;
        applyHit(s.owner, t, 22, 520, 260, 0.5, false, true);
        fx.burst(s.x, s.y, 26, { color: '#ff9a3d', speedMin: 80, speedMax: 420 });
        fx.ring(s.x, s.y, '#ffb347', 90, 0.4, 6); sfx.explode();
      }
      if (s.x < -40 || s.x > W + 40) s.dead = true;
    }
    shots = shots.filter(s => !s.dead);

    // pickups
    if (state === 'fight') {
      pickT -= dt;
      if (pickT <= 0 && pickups.length < 2) {
        pickT = rand(7, 11);
        pickups.push({ type: choice(['sword', 'club', 'sword', 'heart']), x: rand(90, W - 90), y: -30, vy: 0, ground: false, t: 0 });
      }
    }
    for (const p of pickups) {
      p.t += dt;
      if (!p.ground) {
        p.vy += 900 * dt; p.y += p.vy * dt;
        const g = groundBelow(p.x, p.y - 4);
        if (p.y >= g - 16) { p.y = g - 16; p.ground = true; fx.dust(p.x, g, 4); sfx.thud(); }
      }
      for (const f of [p1, p2]) {
        if (!p.dead && !f.ko && Math.abs(f.x - p.x) < 34 && Math.abs((f.y - 30) - p.y) < 60) {
          if (p.type === 'heart') { if (f.hp >= MAX_HP) continue; f.hp = Math.min(MAX_HP, f.hp + 25); fx.text(f.x, f.y - 120, '+25', '#5dff9a'); }
          else { f.weapon = { type: p.type, uses: p.type === 'sword' ? 9 : 7 }; fx.text(f.x, f.y - 120, p.type === 'sword' ? 'Qilich!' : "To'qmoq!", '#ffd34d'); }
          p.dead = true; sfx.power(); fx.ring(p.x, p.y, '#ffd34d', 46);
        }
      }
    }
    pickups = pickups.filter(p => !p.dead);

    if (state === 'fight') {
      roundT -= dt;
      if (roundT <= 0) {
        const loser = p1.hp === p2.hp ? (Math.random() < 0.5 ? p1 : p2) : (p1.hp < p2.hp ? p1 : p2);
        loser.hp = 0; koFighter(loser, loser === p1 ? p2 : p1);
      }
    } else if (state === 'ko') {
      koT += dt / Math.max(0.25, SG.time.scale);
      if (koT > 0.9) SG.time.scale = 1;
      const winner = p1.ko ? p2 : p1;
      if (koT > 1.2) winner.win = true;
      if (koT > 3) {
        if (wins[0] >= 2 || wins[1] >= 2) {
          state = 'results';
          const w = wins[0] >= 2 ? 0 : 1;
          $('winner-text').textContent = w === 0 ? "🏆 P1 g'olib!" : (mode === 'bot' ? "Bot yutdi..." : "🏆 P2 g'olib!");
          (w === 0 || mode !== 'bot') ? sfx.win() : sfx.lose();
          SG.showTouch(false);
          SG.show('results-screen', true);
        } else { round++; newRound(); }
      }
    }
  }

  // ---------- draw ----------
  function drawPlatform(ctx, p) {
    const x = p.x - p.w / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    rr(ctx, x + 4, p.y + 6, p.w, 16, 8); ctx.fill();
    const g = ctx.createLinearGradient(0, p.y, 0, p.y + 16);
    g.addColorStop(0, '#8d99b8'); g.addColorStop(1, '#515b7a');
    rr(ctx, x, p.y, p.w, 16, 8); ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = scenery.theme.strip;
    rr(ctx, x, p.y - 2, p.w, 6, 3); ctx.fill();
  }
  function drawPickup(ctx, p) {
    const bob = p.ground ? Math.sin(p.t * 4) * 4 : 0;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    const gl = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
    gl.addColorStop(0, 'rgba(255,220,120,0.55)'); gl.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = 'round';
    if (p.type === 'heart') {
      ctx.fillStyle = '#ff5d7a';
      ctx.beginPath(); ctx.moveTo(0, 10); ctx.bezierCurveTo(-18, -4, -8, -16, 0, -6); ctx.bezierCurveTo(8, -16, 18, -4, 0, 10); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    } else if (p.type === 'sword') {
      ctx.rotate(-0.8);
      ctx.strokeStyle = '#1a2233'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(20, 0); ctx.stroke();
      ctx.strokeStyle = '#e8eef8'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(20, 0); ctx.stroke();
      ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-5, -6); ctx.lineTo(-5, 6); ctx.stroke();
    } else {
      ctx.rotate(-0.8);
      ctx.strokeStyle = '#1a2233'; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(18, 0); ctx.stroke();
      ctx.strokeStyle = '#b98248'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(18, 0); ctx.stroke();
      ctx.strokeStyle = '#9a6a3a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(0, 0); ctx.stroke();
    }
    ctx.restore();
  }

  function drawHud(ctx) {
    const bw = Math.min(300, W * 0.3 - 30);
    const lx = SG.hudX(), rx = W - 18 - bw;
    bar(ctx, lx, 16, bw, 18, p1.hpShown / MAX_HP, '#ff5d5d', '#ffa35d');
    bar(ctx, lx, 39, bw * 0.6, 8, p1.energy / 100, '#c77dff', '#ffb347');
    label(ctx, 'P1', lx + 4, 62, 13, '#ff8a8a', 'left');
    // right bar fills from the right
    ctx.save(); ctx.translate(rx + bw, 0); ctx.scale(-1, 1);
    bar(ctx, 0, 16, bw, 18, p2.hpShown / MAX_HP, '#4da3ff', '#37d6c4');
    bar(ctx, 0, 39, bw * 0.6, 8, p2.energy / 100, '#c77dff', '#ffb347');
    ctx.restore();
    label(ctx, p2.name, rx + bw - 4, 62, 13, '#8ac4ff', 'right');
    // rounds + timer
    const cx = W / 2;
    label(ctx, String(Math.max(0, Math.ceil(roundT))), cx, 38, 28, roundT < 10 ? '#ff7a6b' : '#ffffff');
    for (let i = 0; i < 2; i++) {
      ctx.beginPath(); ctx.arc(cx - 46 - i * 18, 28, 6, 0, Math.PI * 2);
      ctx.fillStyle = i < wins[0] ? '#ff5d5d' : 'rgba(255,255,255,0.2)'; ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 46 + i * 18, 28, 6, 0, Math.PI * 2);
      ctx.fillStyle = i < wins[1] ? '#4da3ff' : 'rgba(255,255,255,0.2)'; ctx.fill();
    }
  }

  function draw(ctx) {
    const t = SG.time.t;
    ctx.save();
    fx.applyShake(ctx);
    scenery.draw(ctx, W, H, 200 + Math.sin(t * 0.1) * 30, FLOOR, t);
    if (state !== 'menu' && p1) {
      platforms.forEach(p => drawPlatform(ctx, p));
      pickups.forEach(p => drawPickup(ctx, p));
      const order = p1.ko ? [p1, p2] : [p2, p1];
      order.forEach(f => f.draw(ctx));
      for (const s of shots) {
        const g = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, 26);
        g.addColorStop(0, '#fff7d6'); g.addColorStop(0.35, '#ffb347'); g.addColorStop(1, 'rgba(255,90,40,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, 26, 0, Math.PI * 2); ctx.fill();
      }
    }
    fx.draw(ctx);
    ctx.restore();
    if (state !== 'menu' && p1) {
      drawHud(ctx);
      if (state === 'intro') {
        const txt = introT > 0.7 ? `RAUND ${round}` : 'JANG!';
        label(ctx, txt, W / 2, H * 0.42, introT > 0.7 ? 54 : 72, introT > 0.7 ? '#ffffff' : '#ffd34d');
      }
      if (state === 'ko' && koT < 2.2) label(ctx, 'K.O.!', W / 2, H * 0.42, 84, '#ff5d5d');
    }
  }

  SG.run(update, draw);
  $('start-btn').addEventListener('click', startMatch);
  $('retry-btn').addEventListener('click', startMatch);
  if (/debug/.test(location.search)) window.__g = { get p1() { return p1; }, get p2() { return p2; }, get state() { return state; }, get wins() { return wins; } };
})();
