(() => {
  'use strict';
  const { rand, clamp, damp, choice, hash, mix, sfx, FX, label, bar, rr, $ } = SG;

  const H = 540, MW = 1500, MH = 1100, PR = 16;
  let W = 960;
  SG.initView($('game'), () => { W = SG.view.W; });
  const fx = new FX();
  $('best').textContent = SG.best('zombie_best');

  const ZT = {
    walker: { hp: 30, sp: 62, dmg: 10, r: 15, col: '#6fae5a', dark: '#3d6b35' },
    runner: { hp: 16, sp: 132, dmg: 7, r: 12, col: '#a8c24a', dark: '#6a7d28' },
    brute: { hp: 130, sp: 44, dmg: 22, r: 23, col: '#5a8f7a', dark: '#2f5a4a' },
    spitter: { hp: 26, sp: 54, dmg: 6, r: 14, col: '#a86fd6', dark: '#6a3f96', spit: true },
    boss: { hp: 650, sp: 58, dmg: 30, r: 38, col: '#d65a5a', dark: '#8a2a2a', boss: true },
  };
  const UPG = [
    { id: 'rate', icon: '⚡', name: 'Tez otish', desc: 'Otish tezligi +22%', max: 6, apply: s => { s.cd *= 0.8; } },
    { id: 'dmg', icon: '💥', name: "Kuchli o'q", desc: 'Zarar +35%', max: 8, apply: s => { s.dmg *= 1.35; } },
    { id: 'multi', icon: '🔱', name: "Qo'sh o'q", desc: "Yana bitta o'q", max: 4, apply: s => { s.multi++; } },
    { id: 'pierce', icon: '➶', name: 'Teshib o\'tuvchi', desc: "O'q yana 1 zombidan o'tadi", max: 4, apply: s => { s.pierce++; } },
    { id: 'speed', icon: '👟', name: 'Chaqqon', desc: 'Yurish tezligi +12%', max: 4, apply: s => { s.speed *= 1.12; } },
    { id: 'hp', icon: '❤', name: 'Bardoshli', desc: "+30 jon va to'liq davolash", max: 5, apply: s => { s.maxHp += 30; s.hp = s.maxHp; } },
    { id: 'regen', icon: '✚', name: 'Tiklanish', desc: 'Sekundiga +1.5 jon', max: 4, apply: s => { s.regen += 1.5; } },
    { id: 'boom', icon: '🧨', name: "Portlovchi o'q", desc: "O'q tekkanda portlaydi", max: 3, apply: s => { s.boom += 42; } },
    { id: 'blade', icon: '🌀', name: "Aylanuvchi tig'", desc: "Atrofingizda aylanadigan tig'", max: 4, apply: s => { s.blades++; } },
    { id: 'freeze', icon: '❄', name: 'Muz aurasi', desc: 'Yaqindagi zombilar sekinlashadi', max: 3, apply: s => { s.freeze += 110; } },
    { id: 'crit', icon: '🎯', name: 'Kritik zarba', desc: '+15% imkoniyat, x2.5 zarar', max: 4, apply: s => { s.crit += 0.15; } },
    { id: 'dash', icon: '💨', name: 'Tez siltanish', desc: 'Siltanish 35% tezroq tiklanadi', max: 2, apply: s => { s.dashCd *= 0.65; } },
  ];

  let state = 'menu', me, st, zombies, shots, spits, drops, props, cam = { x: 0, y: 0 }, wave, queue, spawnT, kills, cards, taken, touch = null, waveBanner = 0, hurtFlash = 0;

  function start() {
    SG.audioUnlock();
    me = { x: MW / 2, y: MH / 2, vx: 0, vy: 0, ang: 0, walk: 0, fire: 0, dashT: 0, dashC: 0, inv: 0, flash: 0, muzzle: 0, bladeA: 0 };
    st = { hp: 100, maxHp: 100, cd: 0.42, dmg: 12, multi: 1, pierce: 0, speed: 215, regen: 0, boom: 0, blades: 0, freeze: 0, crit: 0, dashCd: 1.6 };
    zombies = []; shots = []; spits = []; drops = []; kills = 0; wave = 0; taken = {};
    props = [];
    for (let i = 0; i < 26; i++) {
      const x = rand(80, MW - 80), y = rand(80, MH - 80);
      if (Math.hypot(x - MW / 2, y - MH / 2) < 140) continue;
      props.push({ x, y, r: i % 4 === 0 ? 20 : 17, kind: i % 4 === 0 ? 'tree' : i % 3 === 0 ? 'cross' : 'stone', s: Math.random() * 99 });
    }
    cam.x = me.x - W / 2; cam.y = me.y - H / 2;
    SG.show('start-screen', false); SG.show('results-screen', false);
    SG.clearTouch();
    if (SG.isTouch) { touch = { stick: SG.makeStick(), dash: SG.makeBtn('💨', { right: 30, bottom: 30, size: 84, color: '#4da3ff' }) }; SG.showTouch(true); }
    nextWave();
  }

  function nextWave() {
    wave++;
    queue = [];
    const n = 6 + wave * 3;
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      let t = 'walker';
      if (wave >= 6 && r < 0.14) t = 'spitter';
      else if (wave >= 4 && r < 0.26) t = 'brute';
      else if (wave >= 2 && r < 0.5) t = 'runner';
      queue.push(t);
    }
    if (wave % 5 === 0) queue.splice(Math.floor(queue.length / 3), 0, 'boss');
    spawnT = 0.8; state = 'play'; waveBanner = 2;
    sfx.power();
  }

  function spawn(type) {
    const d = ZT[type];
    const side = (Math.random() * 4) | 0;
    const x = side === 0 ? -30 : side === 1 ? MW + 30 : rand(0, MW), y = side === 2 ? -30 : side === 3 ? MH + 30 : rand(0, MH);
    const hp = d.hp * (1 + (wave - 1) * 0.13) * (d.boss ? wave / 5 : 1);
    zombies.push({ type, d, x, y, hp, max: hp, ph: rand(0, 6), cd: rand(0.5, 2), hitCd: 0, flash: 0, slow: 0, ang: 0, kx: 0, ky: 0 });
  }

  function offerCards() {
    const pool = UPG.filter(u => (taken[u.id] || 0) < u.max);
    cards = [];
    while (cards.length < 3 && pool.length) cards.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
    state = 'choose';
    sfx.perfect();
  }
  function pick(i) {
    const u = cards[i];
    if (!u || state !== 'choose') return;
    taken[u.id] = (taken[u.id] || 0) + 1; u.apply(st);
    sfx.build(); fx.ring(me.x, me.y, '#ffd34d', 90, 0.4, 6);
    nextWave();
  }

  function hurtZombie(z, dmg, crit) {
    z.hp -= dmg; z.flash = 0.08;
    fx.text(z.x, z.y - z.d.r - 8, `${Math.round(dmg)}${crit ? '!' : ''}`, crit ? '#ff8a5d' : '#ffe9a8', crit ? 18 : 13);
    if (z.hp <= 0 && !z.dead) {
      z.dead = true; kills++;
      fx.burst(z.x, z.y, z.d.boss ? 50 : 12, { color: z.d.col, speedMin: 60, speedMax: z.d.boss ? 460 : 260, gravity: 0, drag: 3 });
      fx.burst(z.x, z.y, 5, { color: '#8a2a2a', speedMin: 30, speedMax: 120, gravity: 0, drag: 4, rMin: 4, rMax: 8 });
      if (z.d.boss) { sfx.explode(); fx.shake(16); for (let k = 0; k < 3; k++) drops.push({ x: z.x + rand(-40, 40), y: z.y + rand(-40, 40), t: 0 }); }
      else { sfx.thud(); if (Math.random() < 0.06) drops.push({ x: z.x, y: z.y, t: 0 }); }
    }
  }

  function update(dt) {
    fx.update(dt);
    hurtFlash = Math.max(0, hurtFlash - dt * 3);
    if (state !== 'play' && state !== 'choose') return;
    if (state === 'choose') { if (SG.pressed('Digit1')) pick(0); if (SG.pressed('Digit2')) pick(1); if (SG.pressed('Digit3')) pick(2); return; }
    waveBanner -= dt;

    // player
    let mx = (SG.anyKey('KeyD', 'ArrowRight') ? 1 : 0) - (SG.anyKey('KeyA', 'ArrowLeft') ? 1 : 0);
    let my = (SG.anyKey('KeyS', 'ArrowDown') ? 1 : 0) - (SG.anyKey('KeyW', 'ArrowUp') ? 1 : 0);
    let wantDash = SG.anyPressed('ShiftLeft', 'ShiftRight', 'Space');
    if (touch) { if (touch.stick.active) { mx = touch.stick.x; my = touch.stick.y; } if (touch.dash.hit()) wantDash = true; }
    const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    me.dashC -= dt; me.inv -= dt; me.flash -= dt; me.fire -= dt; me.muzzle -= dt;
    if (wantDash && me.dashC <= 0 && ml > 0.2) { me.dashT = 0.18; me.dashC = st.dashCd; me.inv = 0.25; me.dvx = mx / (ml > 1 ? 1 : ml || 1); me.dvy = my / (ml > 1 ? 1 : ml || 1); sfx.whoosh(); }
    let sp = st.speed;
    if (me.dashT > 0) { me.dashT -= dt; mx = me.dvx; my = me.dvy; sp = 640; }
    me.vx = damp(me.vx, mx * sp, 14, dt); me.vy = damp(me.vy, my * sp, 14, dt);
    me.x = clamp(me.x + me.vx * dt, PR + 10, MW - PR - 10); me.y = clamp(me.y + me.vy * dt, PR + 10, MH - PR - 10);
    me.walk += Math.hypot(me.vx, me.vy) * dt * 0.07;
    for (const p of props) { const d = Math.hypot(me.x - p.x, me.y - p.y), min = p.r + PR - 4; if (d < min && d > 0.01) { me.x = p.x + (me.x - p.x) / d * min; me.y = p.y + (me.y - p.y) / d * min; } }
    st.hp = Math.min(st.maxHp, st.hp + st.regen * dt);

    // auto aim + fire
    let tgt = null, bd = 460;
    for (const z of zombies) { const d = Math.hypot(z.x - me.x, z.y - me.y) - z.d.r; if (d < bd) { bd = d; tgt = z; } }
    if (tgt) {
      const want = Math.atan2(tgt.y - me.y, tgt.x - me.x);
      let da = want - me.ang; da = Math.atan2(Math.sin(da), Math.cos(da));
      me.ang += da * Math.min(1, dt * 16);
      if (me.fire <= 0 && Math.abs(da) < 0.35) {
        me.fire = st.cd; me.muzzle = 0.06;
        for (let k = 0; k < st.multi; k++) {
          const a = me.ang + (k - (st.multi - 1) / 2) * 0.13;
          shots.push({ x: me.x + Math.cos(a) * 24, y: me.y + Math.sin(a) * 24, vx: Math.cos(a) * 700, vy: Math.sin(a) * 700, life: 0.7, pierce: st.pierce, hit: new Set() });
        }
        sfx.shoot();
      }
    } else if (ml > 0.2) me.ang = Math.atan2(my, mx);

    // blades
    me.bladeA += dt * 3.4;
    for (let k = 0; k < st.blades; k++) {
      const a = me.bladeA + k / st.blades * Math.PI * 2, bx = me.x + Math.cos(a) * 74, by = me.y + Math.sin(a) * 74;
      for (const z of zombies) if (!z.dead && (z.bladeCd || 0) <= 0 && Math.hypot(z.x - bx, z.y - by) < z.d.r + 14) { z.bladeCd = 0.35; hurtZombie(z, st.dmg * 0.8, false); }
    }

    // spawning
    if (queue.length) { spawnT -= dt; if (spawnT <= 0) { spawn(queue.shift()); spawnT = Math.max(0.22, 0.9 - wave * 0.04); } }
    else if (!zombies.length) { st.hp = Math.min(st.maxHp, st.hp + 10); offerCards(); return; }

    // zombies
    for (const z of zombies) {
      z.flash -= dt; z.hitCd -= dt; z.cd -= dt; z.bladeCd = (z.bladeCd || 0) - dt;
      const dx = me.x - z.x, dy = me.y - z.y, d = Math.hypot(dx, dy) || 1;
      z.ang = Math.atan2(dy, dx);
      let sp2 = z.d.sp * (st.freeze && d < st.freeze ? 0.55 : 1);
      if (z.d.spit && d < 280) { sp2 *= d < 200 ? -0.5 : 0; if (z.cd <= 0) { z.cd = 2.4; spits.push({ x: z.x, y: z.y, vx: dx / d * 260, vy: dy / d * 260, life: 1.6 }); } }
      z.x += (dx / d * sp2 + z.kx) * dt; z.y += (dy / d * sp2 + z.ky) * dt;
      z.kx *= 0.86; z.ky *= 0.86;
      z.ph += dt * (3 + z.d.sp * 0.06);
      for (const p of props) { const pd = Math.hypot(z.x - p.x, z.y - p.y), min = p.r + z.d.r - 6; if (pd < min && pd > 0.01) { z.x = p.x + (z.x - p.x) / pd * min; z.y = p.y + (z.y - p.y) / pd * min; } }
      if (d < z.d.r + PR + 2 && z.hitCd <= 0 && me.inv <= 0) {
        z.hitCd = 0.75; st.hp -= z.d.dmg; me.flash = 0.12; hurtFlash = 1;
        fx.shake(z.d.boss ? 14 : 7); sfx.hit(); SG.buzz(40);
        if (st.hp <= 0) return finish();
      }
    }
    // soft separation between zombies
    for (let a = 0; a < zombies.length; a++) for (let b = a + 1; b < zombies.length; b++) {
      const A = zombies[a], B = zombies[b], d = Math.hypot(B.x - A.x, B.y - A.y), min = (A.d.r + B.d.r) * 0.85;
      if (d < min && d > 0.01) { const p = (min - d) / 2, ux = (B.x - A.x) / d, uy = (B.y - A.y) / d; A.x -= ux * p; A.y -= uy * p; B.x += ux * p; B.y += uy * p; }
    }

    for (const s of shots) {
      s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.life <= 0) { s.dead = true; continue; }
      for (const z of zombies) {
        if (z.dead || s.hit.has(z) || Math.hypot(z.x - s.x, z.y - s.y) > z.d.r + 5) continue;
        s.hit.add(z);
        const crit = Math.random() < st.crit;
        const dmg = st.dmg * (crit ? 2.5 : 1);
        const l = Math.hypot(s.vx, s.vy); z.kx += s.vx / l * (z.d.boss ? 30 : 150); z.ky += s.vy / l * (z.d.boss ? 30 : 150);
        hurtZombie(z, dmg, crit);
        if (st.boom) {
          for (const o of zombies) if (o !== z && !o.dead && Math.hypot(o.x - s.x, o.y - s.y) < st.boom + o.d.r) hurtZombie(o, dmg * 0.6, false);
          fx.ring(s.x, s.y, '#ffb347', st.boom, 0.25, 4); fx.burst(s.x, s.y, 8, { color: '#ffb347', speedMin: 40, speedMax: 200, gravity: 0 });
        }
        if (s.pierce-- <= 0) { s.dead = true; break; }
      }
    }
    shots = shots.filter(s => !s.dead);
    for (const s of spits) {
      s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (Math.hypot(s.x - me.x, s.y - me.y) < PR + 6 && me.inv <= 0) { s.life = 0; st.hp -= 9; me.flash = 0.12; hurtFlash = 1; sfx.hit(); if (st.hp <= 0) return finish(); }
    }
    spits = spits.filter(s => s.life > 0);
    zombies = zombies.filter(z => !z.dead);
    for (const d of drops) { d.t += dt; if (Math.hypot(d.x - me.x, d.y - me.y) < 30 && st.hp < st.maxHp) { d.dead = true; st.hp = Math.min(st.maxHp, st.hp + 20); sfx.coin(); fx.text(me.x, me.y - 40, '+20 ❤', '#5dff9a', 16); } }
    drops = drops.filter(d => !d.dead && d.t < 20);

    cam.x = damp(cam.x, clamp(me.x - W / 2, -40, MW - W + 40), 8, dt);
    cam.y = damp(cam.y, clamp(me.y - H / 2, -40, MH - H + 40), 8, dt);
  }

  function finish() {
    state = 'over';
    const best = SG.best('zombie_best', wave);
    $('best').textContent = best;
    $('winner-text').textContent = wave >= best && wave > 1 ? '🏆 Yangi rekord!' : 'Zombilar yetib oldi...';
    $('final-score').innerHTML = `To'lqin: <b>${wave}</b> &nbsp; Yo'q qilingan: <b>${kills}</b><br>Rekord: <b>${best}</b>-to'lqin`;
    sfx.lose(); fx.shake(18); SG.showTouch(false);
    setTimeout(() => SG.show('results-screen', true), 600);
  }

  // ---------- draw ----------
  function drawZombie(ctx, z) {
    const d = z.d, r = d.r, w = Math.sin(z.ph) * 0.25;
    ctx.save(); ctx.translate(z.x, z.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(2, 4, r * 1.1, r * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(z.ang + w * 0.3);
    const body = z.flash > 0 ? '#ffffff' : d.col, dark = z.flash > 0 ? '#ffffff' : d.dark;
    ctx.strokeStyle = dark; ctx.lineWidth = r * 0.42; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(r * 0.3, -r * 0.75); ctx.lineTo(r * 1.35, -r * 0.55 + w * r); ctx.moveTo(r * 0.3, r * 0.75); ctx.lineTo(r * 1.35, r * 0.55 - w * r); ctx.stroke();
    ctx.fillStyle = body; ctx.beginPath(); ctx.arc(r * 1.35, -r * 0.55 + w * r, r * 0.26, 0, 6.283); ctx.arc(r * 1.35, r * 0.55 - w * r, r * 0.26, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.72, r, 0, 0, 6.283); ctx.fillStyle = dark; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#141a14'; ctx.stroke();
    ctx.beginPath(); ctx.arc(r * 0.12, 0, r * 0.62, 0, 6.283); ctx.fillStyle = body; ctx.fill(); ctx.stroke();
    ctx.fillStyle = d.boss ? '#ffd34d' : '#ff3d3d';
    ctx.beginPath(); ctx.arc(r * 0.48, -r * 0.24, r * 0.13, 0, 6.283); ctx.arc(r * 0.48, r * 0.24, r * 0.13, 0, 6.283); ctx.fill();
    if (d.boss) { ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(r * 0.12, 0, r * 0.78, 2.2, 4.1); ctx.stroke(); }
    ctx.restore();
    if (z.hp < z.max) {
      const bw = d.boss ? 80 : r * 2.2;
      ctx.fillStyle = 'rgba(8,10,18,0.6)'; rr(ctx, z.x - bw / 2, z.y - r - 12, bw, 5, 2.5); ctx.fill();
      ctx.fillStyle = d.boss ? '#ffd34d' : '#ff5d5d'; rr(ctx, z.x - bw / 2, z.y - r - 12, bw * clamp(z.hp / z.max, 0, 1), 5, 2.5); ctx.fill();
    }
  }

  function drawMe(ctx) {
    const s = 1.3, col = '#ff5d5d';
    ctx.save(); ctx.translate(me.x, me.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(2, 5, 20, 15, 0, 0, 6.283); ctx.fill();
    ctx.rotate(me.ang); ctx.scale(s, s);
    if (me.inv > 0 && me.dashT > 0) ctx.globalAlpha = 0.6;
    const body = me.flash > 0 ? '#ffffff' : '#171d2b', rim = mix('#171d2b', col, 0.5);
    const stp = Math.sin(me.walk) * 6;
    ctx.fillStyle = mix(col, '#000000', 0.3); ctx.beginPath(); ctx.ellipse(stp, -6, 6, 3.6, 0, 0, 6.283); ctx.ellipse(-stp, 6, 6, 3.6, 0, 0, 6.283); ctx.fill();
    // gun
    ctx.fillStyle = '#11151f'; rr(ctx, 6, 3, 24, 7, 2); ctx.fill();
    ctx.fillStyle = '#8d99b8'; rr(ctx, 14, 4.5, 16, 4, 1.5); ctx.fill();
    if (me.muzzle > 0) { ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.moveTo(30, 6.5); ctx.lineTo(44, 1); ctx.lineTo(40, 6.5); ctx.lineTo(44, 12); ctx.closePath(); ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(0, 0, 9.5, 14, 0, 0, 6.283); ctx.fillStyle = body; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = rim; ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(10, -8, 4.4, 0, 6.283); ctx.arc(14, 8, 4.4, 0, 6.283); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 3; const wv = Math.sin(SG.time.t * 9) * 3;
    ctx.beginPath(); ctx.moveTo(-8, -2); ctx.quadraticCurveTo(-15, -3 + wv, -21, -5 - wv); ctx.moveTo(-8, 2); ctx.quadraticCurveTo(-14, 4 - wv, -19, 6 + wv); ctx.stroke();
    ctx.beginPath(); ctx.arc(1, 0, 9.5, 0, 6.283); ctx.fillStyle = body; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = rim; ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.arc(1, 0, 9, 0, 6.283); ctx.clip(); ctx.fillStyle = col; ctx.fillRect(-1.5, -10, 5, 20); ctx.restore();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(7, -3.6, 1.8, 2.4, 0, 0, 6.283); ctx.ellipse(7, 3.6, 1.8, 2.4, 0, 0, 6.283); ctx.fill();
    ctx.restore();
  }

  function draw(ctx) {
    const t = SG.time.t;
    if (state === 'menu') { ctx.fillStyle = '#16241c'; ctx.fillRect(0, 0, W, H); return; }
    ctx.save();
    fx.applyShake(ctx);
    ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
    ctx.fillStyle = '#0b120e'; ctx.fillRect(cam.x - 20, cam.y - 20, W + 40, H + 40);
    const gg = ctx.createLinearGradient(0, 0, 0, MH); gg.addColorStop(0, '#2c4a38'); gg.addColorStop(1, '#22392e');
    ctx.fillStyle = gg; rr(ctx, 0, 0, MW, MH, 24); ctx.fill();
    const c0 = Math.floor(cam.x / 140) - 1, r0 = Math.floor(cam.y / 140) - 1;
    for (let cx = c0; cx < c0 + W / 140 + 3; cx++) for (let cy = r0; cy < r0 + H / 140 + 3; cy++) {
      const h1 = hash(cx * 12.9 + cy * 78.2), px = cx * 140 + h1 * 100, py = cy * 140 + hash(cx * 3.1 + cy * 5.7) * 100;
      if (px < 10 || py < 10 || px > MW - 10 || py > MH - 10) continue;
      ctx.fillStyle = h1 > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.1)';
      ctx.beginPath(); ctx.ellipse(px, py, 36 + h1 * 30, 14 + h1 * 12, 0, 0, 6.283); ctx.fill();
    }
    // fence
    ctx.strokeStyle = '#11181a'; ctx.lineWidth = 6; rr(ctx, 4, 4, MW - 8, MH - 8, 22); ctx.stroke();
    ctx.strokeStyle = '#3d4f52'; ctx.lineWidth = 2; ctx.setLineDash([3, 14]); rr(ctx, 4, 4, MW - 8, MH - 8, 22); ctx.stroke(); ctx.setLineDash([]);
    for (const d of drops) {
      const y = d.y + Math.sin(d.t * 4) * 3;
      ctx.fillStyle = 'rgba(93,255,154,0.3)'; ctx.beginPath(); ctx.arc(d.x, y, 18, 0, 6.283); ctx.fill();
      label(ctx, '❤', d.x, y + 7, 20, '#ff5d7a', 'center', false);
    }
    for (const p of props) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(p.x + 4, p.y + 8, p.r + 4, p.r * 0.6, 0, 0, 6.283); ctx.fill();
      if (p.kind === 'tree') {
        ctx.strokeStyle = '#1a1410'; ctx.lineWidth = 9; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y + 8); ctx.lineTo(p.x, p.y - 30); ctx.moveTo(p.x, p.y - 12); ctx.lineTo(p.x - 22, p.y - 34); ctx.moveTo(p.x, p.y - 20); ctx.lineTo(p.x + 20, p.y - 44); ctx.moveTo(p.x - 12, p.y - 24); ctx.lineTo(p.x - 14, p.y - 46); ctx.stroke();
      } else {
        ctx.fillStyle = '#6f7a8a';
        if (p.kind === 'cross') { rr(ctx, p.x - 5, p.y - 30, 10, 38, 2); ctx.fill(); rr(ctx, p.x - 15, p.y - 22, 30, 9, 2); ctx.fill(); }
        else { ctx.beginPath(); ctx.moveTo(p.x - 14, p.y + 8); ctx.lineTo(p.x - 14, p.y - 14); ctx.arc(p.x, p.y - 14, 14, Math.PI, 0); ctx.lineTo(p.x + 14, p.y + 8); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#4a5462'; ctx.fillRect(p.x - 7, p.y - 14, 14, 2); ctx.fillRect(p.x - 7, p.y - 8, 10, 2); }
      }
    }
    if (st.freeze) { ctx.strokeStyle = 'rgba(160,220,255,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.arc(me.x, me.y, st.freeze, 0, 6.283); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = 'rgba(160,220,255,0.06)'; ctx.fill(); }
    [...zombies].sort((a, b) => a.y - b.y).forEach(z => drawZombie(ctx, z));
    drawMe(ctx);
    for (let k = 0; k < st.blades; k++) {
      const a = me.bladeA + k / st.blades * Math.PI * 2, bx = me.x + Math.cos(a) * 74, by = me.y + Math.sin(a) * 74;
      ctx.save(); ctx.translate(bx, by); ctx.rotate(t * 14);
      ctx.fillStyle = '#e6edf7'; ctx.strokeStyle = '#171d2b'; ctx.lineWidth = 1.5;
      for (let q = 0; q < 4; q++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(15, -4); ctx.lineTo(5, 5); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      ctx.restore();
    }
    ctx.lineCap = 'round';
    for (const s of shots) { ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.025, s.y - s.vy * 0.025); ctx.stroke(); }
    for (const s of spits) { ctx.fillStyle = '#b6ff5d'; ctx.beginPath(); ctx.arc(s.x, s.y, 7, 0, 6.283); ctx.fill(); ctx.strokeStyle = '#4f8a1a'; ctx.lineWidth = 2; ctx.stroke(); }
    fx.draw(ctx);
    ctx.restore();

    // darkness with a light around the player
    const lx = me.x - cam.x, ly = me.y - cam.y;
    const dg = ctx.createRadialGradient(lx, ly, 90, lx, ly, Math.max(W, H) * 0.62);
    dg.addColorStop(0, 'rgba(4,8,18,0)'); dg.addColorStop(1, 'rgba(4,8,18,0.66)');
    ctx.fillStyle = dg; ctx.fillRect(0, 0, W, H);
    if (hurtFlash > 0) { ctx.fillStyle = `rgba(255,40,40,${hurtFlash * 0.28})`; ctx.fillRect(0, 0, W, H); }

    // HUD
    const hx = SG.hudX();
    bar(ctx, hx, 14, 200, 18, st.hp / st.maxHp, '#5dff9a', '#37d6c4');
    label(ctx, `${Math.max(0, Math.ceil(st.hp))}/${st.maxHp}`, hx + 100, 29, 12, '#ffffff');
    label(ctx, `To'lqin ${wave}`, W / 2, 34, 24, '#ffffff');
    label(ctx, `🧟 ${zombies.length + queue.length}   ☠ ${kills}`, W / 2, 58, 14, '#cfd6e6');
    let ix = W - 20;
    UPG.forEach(u => { const n = taken[u.id]; if (!n) return; label(ctx, `${u.icon}${n > 1 ? n : ''}`, ix, 32, 16, '#ffd34d', 'right', false); ix -= n > 1 ? 40 : 28; });
    if (waveBanner > 0) label(ctx, wave % 5 === 0 ? `${wave}-to'lqin — BOSS!` : `${wave}-to'lqin`, W / 2, H * 0.3, 46, wave % 5 === 0 ? '#ff5d5d' : '#ffd34d');

    if (state === 'choose') {
      ctx.fillStyle = 'rgba(4,6,14,0.72)'; ctx.fillRect(0, 0, W, H);
      label(ctx, 'Qobiliyat tanlang', W / 2, 96, 34, '#ffd34d');
      cards.forEach((u, i) => {
        const r = cardRect(i);
        const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h); g.addColorStop(0, '#2a3460'); g.addColorStop(1, '#161c38');
        rr(ctx, r.x, r.y, r.w, r.h, 20); ctx.fillStyle = g; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#37d6c4'; ctx.stroke();
        label(ctx, u.icon, r.x + r.w / 2, r.y + 78, 56, '#fff', 'center', false);
        label(ctx, u.name, r.x + r.w / 2, r.y + 130, 19, '#ffffff');
        const words = u.desc.split(' '); let line = '', yy = r.y + 160;
        ctx.font = '700 13px "Trebuchet MS", sans-serif';
        for (const wd of words) { if (ctx.measureText(line + wd).width > r.w - 30) { label(ctx, line.trim(), r.x + r.w / 2, yy, 13, '#cfd6e6', 'center', false); line = ''; yy += 18; } line += wd + ' '; }
        label(ctx, line.trim(), r.x + r.w / 2, yy, 13, '#cfd6e6', 'center', false);
        const lv = taken[u.id] || 0;
        label(ctx, lv ? `Daraja ${lv} → ${lv + 1}` : 'YANGI', r.x + r.w / 2, r.y + r.h - 18, 12, '#ffd34d');
      });
    }
  }
  function cardRect(i) {
    const cw = Math.min(220, (W - 80) / 3 - 16), gap = 22, total = cw * 3 + gap * 2;
    return { x: (W - total) / 2 + i * (cw + gap), y: 130, w: cw, h: 250 };
  }

  SG.run(update, draw);
  $('game').addEventListener('pointerdown', e => {
    if (state !== 'choose') return;
    const p = SG.toLocal(e);
    for (let i = 0; i < cards.length; i++) { const r = cardRect(i); if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) { pick(i); break; } }
  });
  $('start-btn').addEventListener('click', start);
  $('retry-btn').addEventListener('click', start);
  if (/debug/.test(location.search)) window.__g = { get s() { return { state, wave, hp: st && Math.round(st.hp), n: zombies && zombies.length, kills, taken }; }, pick: i => pick(i) };
})();
