(() => {
  'use strict';
  const { rand, clamp, damp, choice, hash, mix, sfx, FX, label, bar, rr, $ } = SG;

  const H = 540, MW = 1900, MH = 1500, FR = 16, SPEED = 215;
  const COLORS = ['#ff5d5d', '#4da3ff', '#4ddd8f', '#c77dff', '#ffb84d', '#ff7ac8', '#7df9ff', '#d6e04a'];
  const WEAPONS = {
    fists: { name: 'Musht', range: 50, dmg: 10, cd: 0.36, arc: 0.9, melee: true },
    sword: { name: 'Qilich', range: 82, dmg: 24, cd: 0.46, arc: 1.15, melee: true },
    bow: { name: 'Kamon', range: 430, dmg: 22, cd: 0.62, speed: 640, ammo: 12 },
    shuriken: { name: 'Shuriken', range: 330, dmg: 9, cd: 0.5, speed: 560, ammo: 10, multi: 3 },
  };
  const PHASES = [760, 520, 340, 200, 90, 0];
  const AI_LV = [
    { err: 0.42, react: 0.45, aggro: 0.4, dmg: 0.5 },
    { err: 0.24, react: 0.3, aggro: 0.62, dmg: 0.72 },
    { err: 0.1, react: 0.17, aggro: 0.9, dmg: 0.95 },
  ];
  let W = 960;
  SG.initView($('game'), () => { W = SG.view.W; });
  const fx = new FX();
  let bots = 7, diff = 1;
  SG.seg('bots-seg', v => { bots = Number(v); });
  SG.seg('diff-seg', v => { diff = Number(v); });

  let state = 'menu', fighters = [], me = null, items = [], shots = [], rocks = [], trees = [], bushes = [], zone, cam = { x: 0, y: 0 }, feed = [], touch = null, endT = 0;

  function freeSpot(margin = 80) {
    for (let k = 0; k < 60; k++) {
      const x = rand(margin, MW - margin), y = rand(margin, MH - margin);
      if (!rocks.some(r => Math.hypot(r.x - x, r.y - y) < r.r + 40) && !trees.some(t => Math.hypot(t.x - x, t.y - y) < 50)) return { x, y };
    }
    return { x: MW / 2, y: MH / 2 };
  }

  function start() {
    SG.audioUnlock();
    rocks = []; trees = []; bushes = []; items = []; shots = []; feed = [];
    for (let i = 0; i < 16; i++) rocks.push({ x: rand(100, MW - 100), y: rand(100, MH - 100), r: rand(26, 58), s: Math.random() * 99 });
    for (let i = 0; i < 22; i++) { const p = freeSpot(60); trees.push({ x: p.x, y: p.y, r: rand(46, 70), s: Math.random() * 99 }); }
    for (let i = 0; i < 18; i++) { const p = freeSpot(60); bushes.push({ x: p.x, y: p.y, r: rand(34, 52), s: Math.random() * 99 }); }
    const kinds = ['sword', 'sword', 'bow', 'bow', 'shuriken', 'med', 'med', 'armor'];
    for (let i = 0; i < 30; i++) { const p = freeSpot(); items.push({ type: kinds[i % kinds.length], x: p.x, y: p.y, t: rand(0, 6) }); }
    fighters = [];
    const n = bots + 1;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + rand(-0.2, 0.2);
      const p = { x: MW / 2 + Math.cos(a) * MW * 0.38, y: MH / 2 + Math.sin(a) * MH * 0.38 };
      fighters.push({
        i, human: i === 0, name: i === 0 ? 'SIZ' : `BOT ${i}`, color: COLORS[i % COLORS.length],
        x: clamp(p.x, 60, MW - 60), y: clamp(p.y, 60, MH - 60), vx: 0, vy: 0, ang: a + Math.PI, hp: 100, armor: 0,
        weapon: { type: 'fists', ammo: 0 }, cd: 0, atkT: 0, dashT: 0, dashCd: 0, alive: true, kills: 0, walk: 0, flash: 0,
        ai: { t: rand(0, 0.3), mx: 0, my: 0, target: null, goal: null, strafe: choice([-1, 1]) }, place: 0,
      });
    }
    me = fighters[0];
    zone = { cx: MW / 2, cy: MH / 2, r: 1250, fx: MW / 2, fy: MH / 2, fr: 1250, tx: MW / 2, ty: MH / 2, tr: PHASES[0], phase: 0, t: 12, shrinking: false };
    pickNext(true);
    cam.x = me.x - W / 2; cam.y = me.y - H / 2;
    state = 'play'; endT = 0;
    SG.show('start-screen', false); SG.show('results-screen', false);
    SG.clearTouch();
    if (SG.isTouch) {
      touch = { stick: SG.makeStick(), atk: SG.makeBtn('⚔️', { right: 26, bottom: 26, size: 94, color: '#ff5d5d' }), dash: SG.makeBtn('💨', { right: 136, bottom: 30, size: 64, color: '#4da3ff' }) };
      SG.showTouch(true);
    }
  }

  function pickNext(first) {
    zone.tr = PHASES[zone.phase];
    const maxOff = Math.max(0, (first ? 300 : zone.r) - zone.tr);
    const a = rand(0, 6.28), d = rand(0, maxOff * 0.8);
    zone.tx = clamp(zone.cx + Math.cos(a) * d, 200, MW - 200); zone.ty = clamp(zone.cy + Math.sin(a) * d, 200, MH - 200);
  }

  function say(txt, color = '#ffffff') { feed.push({ txt, color, t: 4 }); if (feed.length > 4) feed.shift(); }
  const alive = () => fighters.filter(f => f.alive);

  function damage(f, dmg, by) {
    if (!f.alive) return;
    if (by && !by.human) dmg *= AI_LV[diff].dmg;
    const ab = Math.min(f.armor, dmg * 0.7); f.armor -= ab; f.hp -= dmg - ab;
    f.flash = 0.1;
    fx.burst(f.x, f.y, 6, { color: '#ffd98a', spark: true, speedMin: 80, speedMax: 260, gravity: 0 });
    if (onScreen(f.x, f.y)) { fx.text(f.x, f.y - 34, `-${Math.round(dmg)}`, f.human ? '#ff5d5d' : '#ffd34d', 15); sfx.hit(); }
    if (f.human) { fx.shake(6); SG.buzz(30); }
    if (f.hp <= 0) {
      f.alive = false; f.place = alive().length + 1;
      fx.burst(f.x, f.y, 22, { color: f.color, speedMin: 60, speedMax: 320, gravity: 0, drag: 3 });
      fx.ring(f.x, f.y, f.color, 60);
      if (f.weapon.type !== 'fists') items.push({ type: f.weapon.type, x: f.x, y: f.y, t: 0 });
      if (Math.random() < 0.5) items.push({ type: 'med', x: f.x + 20, y: f.y + 10, t: 0 });
      if (by) { by.kills++; say(`${by.name} ⚔ ${f.name}`, by.human ? '#5dff9a' : f.human ? '#ff5d5d' : '#cfd6e6'); if (by.human) { sfx.power(); fx.text(by.x, by.y - 60, 'YO\'Q QILINDI!', '#5dff9a', 20); } }
      else say(`${f.name} zonada qoldi`, f.human ? '#ff5d5d' : '#cfd6e6');
      if (onScreen(f.x, f.y)) sfx.explode();
    }
  }

  function attack(f) {
    if (f.cd > 0 || !f.alive) return;
    const w = WEAPONS[f.weapon.type];
    f.cd = w.cd; f.atkT = 0.2;
    if (w.melee) {
      if (onScreen(f.x, f.y)) sfx.whoosh();
      for (const o of fighters) {
        if (o === f || !o.alive) continue;
        const d = Math.hypot(o.x - f.x, o.y - f.y);
        if (d > w.range + FR) continue;
        let da = Math.atan2(o.y - f.y, o.x - f.x) - f.ang;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) < w.arc) { o.vx += Math.cos(f.ang) * 260; o.vy += Math.sin(f.ang) * 260; damage(o, w.dmg, f); }
      }
    } else {
      const n = w.multi || 1;
      for (let k = 0; k < n; k++) {
        const a = f.ang + (k - (n - 1) / 2) * 0.15;
        shots.push({ x: f.x + Math.cos(a) * 20, y: f.y + Math.sin(a) * 20, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed, dmg: w.dmg, owner: f, life: w.range / w.speed, type: f.weapon.type, rot: 0 });
      }
      if (onScreen(f.x, f.y)) sfx.shoot();
      if (--f.weapon.ammo <= 0) { f.weapon = { type: 'fists', ammo: 0 }; if (f.human) fx.text(f.x, f.y - 50, 'O\'q tugadi', '#cfd6e6', 13); }
    }
  }

  const onScreen = (x, y) => x > cam.x - 40 && x < cam.x + W + 40 && y > cam.y - 40 && y < cam.y + H + 40;

  function think(f, dt) {
    const lv = AI_LV[diff], ai = f.ai;
    ai.t -= dt;
    const w = WEAPONS[f.weapon.type];
    if (ai.t <= 0) {
      ai.t = lv.react * rand(0.7, 1.3);
      const zx = zone.shrinking ? zone.tx : zone.cx, zy = zone.shrinking ? zone.ty : zone.cy, zr = zone.shrinking ? Math.min(zone.r, zone.tr + 60) : zone.r;
      const dz = Math.hypot(f.x - zx, f.y - zy);
      let near = null, nd = 1e9;
      for (const o of fighters) { if (o === f || !o.alive) continue; const d = Math.hypot(o.x - f.x, o.y - f.y); if (d < nd) { nd = d; near = o; } }
      ai.target = near && nd < (near.human ? 300 : 380) ? near : null;
      let goal = null;
      if (dz > zr - 70) goal = { x: zx, y: zy };
      else {
        const want = it => (it.type === 'med' ? f.hp < 60 : it.type === 'armor' ? f.armor < 40 : f.weapon.type === 'fists');
        let bi = null, bd = 460;
        for (const it of items) { if (!want(it)) continue; const d = Math.hypot(it.x - f.x, it.y - f.y); if (d < bd && Math.hypot(it.x - zx, it.y - zy) < zr) { bd = d; bi = it; } }
        if (bi && (!ai.target || nd > 150 || f.weapon.type === 'fists')) goal = bi;
      }
      let mx = 0, my = 0;
      if (goal) { const d = Math.hypot(goal.x - f.x, goal.y - f.y) || 1; mx = (goal.x - f.x) / d; my = (goal.y - f.y) / d; }
      else if (ai.target) {
        const t = ai.target, d = nd || 1, ux = (t.x - f.x) / d, uy = (t.y - f.y) / d;
        const scared = f.hp < 30 && t.hp > f.hp;
        if (w.melee) { const k = scared ? -1 : Math.random() < lv.aggro ? 1 : 0; mx = ux * k; my = uy * k; }
        else { const k = d > 290 ? 1 : d < 150 ? -1 : 0; mx = ux * k - uy * ai.strafe * 0.7; my = uy * k + ux * ai.strafe * 0.7; if (Math.random() < 0.1) ai.strafe *= -1; }
      } else {
        if (!ai.goal || Math.hypot(ai.goal.x - f.x, ai.goal.y - f.y) < 60 || Math.random() < 0.05) { const a = rand(0, 6.28), r = rand(0, zr * 0.7); ai.goal = { x: clamp(zx + Math.cos(a) * r, 60, MW - 60), y: clamp(zy + Math.sin(a) * r, 60, MH - 60) }; }
        const d = Math.hypot(ai.goal.x - f.x, ai.goal.y - f.y) || 1; mx = (ai.goal.x - f.x) / d; my = (ai.goal.y - f.y) / d;
      }
      ai.mx = mx; ai.my = my;
      if (ai.target && f.cd <= 0) {
        const reach = w.melee ? w.range + FR - 6 : w.range * 0.9;
        if (nd < reach && Math.random() < lv.aggro) {
          f.ang = Math.atan2(ai.target.y - f.y, ai.target.x - f.x) + rand(-lv.err, lv.err);
          attack(f);
        } else if (w.melee && nd < 200 && nd > 90 && f.dashCd <= 0 && Math.random() < 0.15 * lv.aggro) { f.dashT = 0.18; f.dashCd = 1.8; }
      }
    }
    return { mx: ai.mx, my: ai.my };
  }

  let aimLatch = false;
  function update(dt) {
    fx.update(dt);
    if (state !== 'play') return;
    for (const m of feed) m.t -= dt;
    feed = feed.filter(m => m.t > 0);
    for (const it of items) it.t += dt;

    // zone
    zone.t -= dt;
    if (!zone.shrinking && zone.t <= 0 && zone.phase < PHASES.length) { zone.shrinking = true; zone.t = 12; zone.fx = zone.cx; zone.fy = zone.cy; zone.fr = zone.r; say('⚠ Zona toraymoqda!', '#ff9a3d'); sfx.tick(); }
    if (zone.shrinking) {
      const k = clamp(1 - zone.t / 12, 0, 1);
      zone.cx = zone.fx + (zone.tx - zone.fx) * k; zone.cy = zone.fy + (zone.ty - zone.fy) * k; zone.r = zone.fr + (zone.tr - zone.fr) * k;
      if (k >= 1) { zone.shrinking = false; zone.phase++; zone.t = zone.phase < PHASES.length ? 9 : 1e9; if (zone.phase < PHASES.length) pickNext(false); }
    }

    for (const f of fighters) {
      if (!f.alive) continue;
      f.cd -= dt; f.atkT -= dt; f.flash -= dt; f.dashCd -= dt;
      let mx = 0, my = 0;
      if (f.human) {
        mx = (SG.anyKey('KeyD', 'ArrowRight') ? 1 : 0) - (SG.anyKey('KeyA', 'ArrowLeft') ? 1 : 0);
        my = (SG.anyKey('KeyS', 'ArrowDown') ? 1 : 0) - (SG.anyKey('KeyW', 'ArrowUp') ? 1 : 0);
        let wantAtk = SG.key('Space'), wantDash = SG.anyPressed('ShiftLeft', 'ShiftRight');
        if (touch) { if (touch.stick.active) { mx = touch.stick.x; my = touch.stick.y; } if (touch.atk.down) wantAtk = true; if (touch.dash.hit()) wantDash = true; }
        const ml = Math.hypot(mx, my);
        if (ml > 1) { mx /= ml; my /= ml; }
        if (ml > 0.2 && f.atkT <= 0) f.ang = Math.atan2(my, mx);
        if (wantDash && f.dashCd <= 0) { f.dashT = 0.18; f.dashCd = 1.4; sfx.whoosh(); }
        if (wantAtk && f.cd <= 0) {
          const w = WEAPONS[f.weapon.type], reach = w.melee ? w.range + 60 : w.range;
          let best = null, bd = reach;
          for (const o of fighters) { if (o === f || !o.alive) continue; const d = Math.hypot(o.x - f.x, o.y - f.y); if (d < bd) { bd = d; best = o; } }
          if (best) f.ang = Math.atan2(best.y - f.y, best.x - f.x);
          attack(f);
        }
      } else { const m = think(f, dt); mx = m.mx; my = m.my; if (Math.hypot(mx, my) > 0.2 && f.atkT <= 0) f.ang = Math.atan2(my, mx); }

      const sp = f.dashT > 0 ? 580 : SPEED;
      if (f.dashT > 0) { f.dashT -= dt; mx = Math.cos(f.ang); my = Math.sin(f.ang); }
      f.vx = damp(f.vx, mx * sp, 12, dt); f.vy = damp(f.vy, my * sp, 12, dt);
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.walk += Math.hypot(f.vx, f.vy) * dt * 0.07;
      f.x = clamp(f.x, FR, MW - FR); f.y = clamp(f.y, FR, MH - FR);
      for (const r of rocks) { const d = Math.hypot(f.x - r.x, f.y - r.y), min = r.r + FR - 4; if (d < min && d > 0.01) { f.x = r.x + (f.x - r.x) / d * min; f.y = r.y + (f.y - r.y) / d * min; } }
      for (const t of trees) { const d = Math.hypot(f.x - t.x, f.y - t.y), min = 14 + FR; if (d < min && d > 0.01) { f.x = t.x + (f.x - t.x) / d * min; f.y = t.y + (f.y - t.y) / d * min; } }
      // pickups
      for (const it of items) {
        if (it.dead || Math.hypot(it.x - f.x, it.y - f.y) > 30) continue;
        if (it.type === 'med') { if (f.hp >= 100) continue; f.hp = Math.min(100, f.hp + 40); }
        else if (it.type === 'armor') { if (f.armor >= 50) continue; f.armor = 50; }
        else { if (f.weapon.type === it.type && WEAPONS[it.type].melee) continue; f.weapon = { type: it.type, ammo: (f.weapon.type === it.type ? f.weapon.ammo : 0) + (WEAPONS[it.type].ammo || 0) }; }
        it.dead = true;
        if (f.human) { sfx.power(); fx.text(f.x, f.y - 50, it.type === 'med' ? '+40 ❤' : it.type === 'armor' ? 'Zirh!' : WEAPONS[it.type].name + '!', '#ffd34d', 16); }
      }
      // zone damage
      if (Math.hypot(f.x - zone.cx, f.y - zone.cy) > zone.r) {
        f.zoneT = (f.zoneT || 0) + dt;
        if (f.zoneT > 0.5) { f.zoneT = 0; damage(f, 3 + zone.phase * 2, null); }
      }
    }
    items = items.filter(it => !it.dead);
    // body separation
    for (let a = 0; a < fighters.length; a++) for (let b = a + 1; b < fighters.length; b++) {
      const A = fighters[a], B = fighters[b];
      if (!A.alive || !B.alive) continue;
      const d = Math.hypot(B.x - A.x, B.y - A.y);
      if (d < FR * 2 && d > 0.01) { const p = (FR * 2 - d) / 2, ux = (B.x - A.x) / d, uy = (B.y - A.y) / d; A.x -= ux * p; A.y -= uy * p; B.x += ux * p; B.y += uy * p; }
    }

    for (const s of shots) {
      s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += dt * 22;
      if (s.life <= 0 || rocks.some(r => Math.hypot(r.x - s.x, r.y - s.y) < r.r) || trees.some(t => Math.hypot(t.x - s.x, t.y - s.y) < 14)) { s.dead = true; fx.burst(s.x, s.y, 3, { color: '#cfd6e6', speedMin: 30, speedMax: 120, gravity: 0 }); continue; }
      for (const f of fighters) if (f.alive && f !== s.owner && Math.hypot(f.x - s.x, f.y - s.y) < FR + 4) { s.dead = true; damage(f, s.dmg, s.owner); break; }
    }
    shots = shots.filter(s => !s.dead);

    const focus = me.alive ? me : (alive()[0] || me);
    cam.x = damp(cam.x, clamp(focus.x - W / 2, -60, MW - W + 60), 8, dt);
    cam.y = damp(cam.y, clamp(focus.y - H / 2, -60, MH - H + 60), 8, dt);

    const left = alive();
    if (!me.alive || left.length <= 1) {
      endT += dt;
      if (endT > 1.6) finish();
    }
  }

  function finish() {
    state = 'over';
    const win = me.alive;
    $('winner-text').textContent = win ? "🏆 G'OLIB! Oxirgi omon qolgan — siz!" : `${me.place}-o'rin`;
    $('final-score').innerHTML = `Yo'q qilinganlar: <b>${me.kills}</b> &nbsp; Jami: <b>${fighters.length}</b> o'yinchi`;
    win ? sfx.win() : sfx.lose();
    SG.showTouch(false);
    SG.show('results-screen', true);
  }

  // ---------- draw ----------
  function drawFighter(ctx, f) {
    const s = 1.38, w = WEAPONS[f.weapon.type];
    const body = f.flash > 0 ? '#ffffff' : '#171d2b', rim = f.flash > 0 ? '#fff' : mix('#171d2b', f.color, 0.5);
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(2, 5, 17 * s, 13 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(f.ang); ctx.scale(s, s);
    const st = Math.sin(f.walk) * 6;
    ctx.fillStyle = mix(f.color, '#000000', 0.3);
    ctx.beginPath(); ctx.ellipse(st, -6, 6, 3.6, 0, 0, Math.PI * 2); ctx.ellipse(-st, 6, 6, 3.6, 0, 0, Math.PI * 2); ctx.fill();
    // weapon
    const k = clamp(f.atkT / 0.2, 0, 1);
    ctx.lineCap = 'round';
    if (f.weapon.type === 'sword') {
      const a = -1.2 + (1 - k) * 2.4 * (f.atkT > 0 ? 1 : 0) + (f.atkT > 0 ? 0 : 0.5);
      ctx.save(); ctx.translate(9, 11); ctx.rotate(f.atkT > 0 ? a - 0.6 : 0.2);
      ctx.strokeStyle = '#11151f'; ctx.lineWidth = 5.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(34, 0); ctx.stroke();
      ctx.strokeStyle = '#e8eef8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(34, 0); ctx.stroke();
      ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(5, -4.5); ctx.lineTo(5, 4.5); ctx.stroke();
      ctx.restore();
      if (f.atkT > 0) { ctx.strokeStyle = `rgba(255,255,255,${k * 0.7})`; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(4, 0, 46, -1.1, 1.1); ctx.stroke(); }
    } else if (f.weapon.type === 'bow') {
      ctx.strokeStyle = '#11151f'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(8, 0, 17, -1.2, 1.2); ctx.stroke();
      ctx.strokeStyle = '#b9824a'; ctx.lineWidth = 2.8; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(8 + Math.cos(1.2) * 17, Math.sin(1.2) * 17); ctx.lineTo(8 + Math.cos(1.2) * 17, -Math.sin(1.2) * 17); ctx.stroke();
    } else if (f.weapon.type === 'shuriken') {
      ctx.fillStyle = '#cfd6e6'; ctx.save(); ctx.translate(17, 9); ctx.rotate(SG.time.t * 6);
      for (let q = 0; q < 4; q++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(7, -2); ctx.lineTo(2, 2); ctx.closePath(); ctx.fill(); }
      ctx.restore();
    }
    // shoulders
    ctx.beginPath(); ctx.ellipse(0, 0, 9.5, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = body; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = rim; ctx.stroke();
    // hands
    const punch = w.melee && f.weapon.type === 'fists' && f.atkT > 0 ? Math.sin(k * Math.PI) * 14 : 0;
    ctx.fillStyle = f.flash > 0 ? '#fff' : f.color;
    ctx.beginPath(); ctx.arc(9 + punch, -12, 4.6, 0, Math.PI * 2); ctx.arc(9 + (f.weapon.type === 'fists' ? 0 : 2), 12, 4.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = rim; ctx.lineWidth = 1.2; ctx.stroke();
    // headband tails
    ctx.strokeStyle = f.color; ctx.lineWidth = 3;
    const wv = Math.sin(SG.time.t * 9 + f.i) * 3;
    ctx.beginPath(); ctx.moveTo(-8, -2); ctx.quadraticCurveTo(-15, -3 + wv, -21, -5 - wv); ctx.moveTo(-8, 2); ctx.quadraticCurveTo(-14, 4 - wv, -19, 6 + wv); ctx.stroke();
    // head
    ctx.beginPath(); ctx.arc(1, 0, 9.5, 0, Math.PI * 2); ctx.fillStyle = body; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = rim; ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.arc(1, 0, 9, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = f.flash > 0 ? '#fff' : f.color; ctx.fillRect(-1.5, -10, 5, 20);
    ctx.restore();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(7, -3.6, 1.8, 2.4, 0, 0, Math.PI * 2); ctx.ellipse(7, 3.6, 1.8, 2.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (f.armor > 0) { ctx.strokeStyle = 'rgba(125,200,255,0.8)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(f.x, f.y, 24, 0, Math.PI * 2); ctx.stroke(); }
    // name + hp
    label(ctx, f.name, f.x, f.y - 40, 11, f.human ? '#ffffff' : f.color);
    ctx.fillStyle = 'rgba(8,10,18,0.6)'; rr(ctx, f.x - 20, f.y - 36, 40, 5, 2.5); ctx.fill();
    ctx.fillStyle = f.hp > 50 ? '#5dff9a' : f.hp > 25 ? '#ffd34d' : '#ff5d5d'; rr(ctx, f.x - 20, f.y - 36, 40 * clamp(f.hp / 100, 0, 1), 5, 2.5); ctx.fill();
  }

  function drawItem(ctx, it) {
    const y = it.y + Math.sin(it.t * 3) * 3;
    const col = it.type === 'med' ? '#5dff9a' : it.type === 'armor' ? '#7dc8ff' : '#ffd34d';
    const g = ctx.createRadialGradient(it.x, y, 2, it.x, y, 26);
    g.addColorStop(0, SG.rgba(col, 0.55)); g.addColorStop(1, SG.rgba(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(it.x, y, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#171d2b'; rr(ctx, it.x - 14, y - 14, 28, 28, 8); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = col; ctx.stroke();
    label(ctx, it.type === 'med' ? '❤' : it.type === 'armor' ? '🛡' : it.type === 'sword' ? '🗡' : it.type === 'bow' ? '🏹' : '✴', it.x, y + 6, 16, '#fff', 'center', false);
  }

  function draw(ctx) {
    const t = SG.time.t;
    if (state === 'menu') { ctx.fillStyle = '#3f8a45'; ctx.fillRect(0, 0, W, H); return; }
    ctx.save();
    fx.applyShake(ctx);
    ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
    // ground
    ctx.fillStyle = '#16321f'; ctx.fillRect(cam.x - 20, cam.y - 20, W + 40, H + 40);
    const gg = ctx.createLinearGradient(0, 0, 0, MH);
    gg.addColorStop(0, '#62b257'); gg.addColorStop(1, '#3f8f48');
    ctx.fillStyle = gg; rr(ctx, 0, 0, MW, MH, 30); ctx.fill();
    const c0 = Math.floor(cam.x / 150) - 1, r0 = Math.floor(cam.y / 150) - 1;
    for (let cx = c0; cx < c0 + W / 150 + 3; cx++) for (let cy = r0; cy < r0 + H / 150 + 3; cy++) {
      const h1 = hash(cx * 12.9 + cy * 78.2), px = cx * 150 + h1 * 110, py = cy * 150 + hash(cx * 3.1 + cy * 5.7) * 110;
      if (px < 10 || py < 10 || px > MW - 10 || py > MH - 10) continue;
      ctx.fillStyle = h1 > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
      ctx.beginPath(); ctx.ellipse(px, py, 40 + h1 * 30, 16 + h1 * 12, 0, 0, Math.PI * 2); ctx.fill();
      if (h1 > 0.7) { ctx.strokeStyle = '#2f7a35'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 4, py - 9); ctx.moveTo(px + 5, py); ctx.lineTo(px + 8, py - 8); ctx.stroke(); }
    }
    // rocks
    for (const r of rocks) {
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(r.x + 5, r.y + 8, r.r, r.r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createRadialGradient(r.x - r.r * 0.3, r.y - r.r * 0.4, 2, r.x, r.y, r.r);
      g.addColorStop(0, '#c2cada'); g.addColorStop(1, '#69738a');
      ctx.fillStyle = g; ctx.beginPath();
      for (let k = 0; k < 9; k++) { const a = k / 9 * 6.283, rr2 = r.r * (0.86 + hash(r.s + k) * 0.2); ctx.lineTo(r.x + Math.cos(a) * rr2, r.y + Math.sin(a) * rr2); }
      ctx.closePath(); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#3d465a'; ctx.stroke();
    }
    items.forEach(it => drawItem(ctx, it));
    // tree trunks
    for (const tr of trees) { ctx.fillStyle = '#5a4630'; ctx.beginPath(); ctx.arc(tr.x, tr.y, 13, 0, Math.PI * 2); ctx.fill(); }
    [...fighters].filter(f => f.alive).sort((a, b) => a.y - b.y).forEach(f => drawFighter(ctx, f));
    for (const s of shots) {
      ctx.save(); ctx.translate(s.x, s.y);
      if (s.type === 'bow') {
        ctx.rotate(Math.atan2(s.vy, s.vx));
        ctx.strokeStyle = '#171d2b'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(4, 0); ctx.stroke();
        ctx.strokeStyle = '#f2e6d0'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#e6edf7'; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(2, -3.5); ctx.lineTo(2, 3.5); ctx.closePath(); ctx.fill();
      } else {
        ctx.rotate(s.rot); ctx.fillStyle = '#e6edf7'; ctx.strokeStyle = '#171d2b'; ctx.lineWidth = 1;
        for (let q = 0; q < 4; q++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(9, -2.5); ctx.lineTo(3, 3); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      }
      ctx.restore();
    }
    // bushes + canopies (drawn over players; fade when the human is under)
    for (const b of bushes) {
      const under = Math.hypot(me.x - b.x, me.y - b.y) < b.r;
      ctx.globalAlpha = under ? 0.45 : 0.92;
      ctx.fillStyle = '#2f7d4c';
      ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283 + b.s; ctx.moveTo(b.x + Math.cos(a) * b.r * 0.5, b.y + Math.sin(a) * b.r * 0.5); ctx.arc(b.x + Math.cos(a) * b.r * 0.5, b.y + Math.sin(a) * b.r * 0.5, b.r * 0.55, 0, 6.283); } ctx.fill();
      ctx.fillStyle = '#3f9a5c'; ctx.beginPath(); ctx.arc(b.x - b.r * 0.15, b.y - b.r * 0.2, b.r * 0.4, 0, 6.283); ctx.fill();
    }
    for (const tr of trees) {
      const under = Math.hypot(me.x - tr.x, me.y - tr.y) < tr.r;
      ctx.globalAlpha = under ? 0.4 : 0.95;
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.arc(tr.x + 8, tr.y + 12, tr.r, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#256b3f'; ctx.beginPath(); for (let k = 0; k < 7; k++) { const a = k / 7 * 6.283 + tr.s; ctx.moveTo(tr.x + Math.cos(a) * tr.r * 0.55, tr.y + Math.sin(a) * tr.r * 0.55); ctx.arc(tr.x + Math.cos(a) * tr.r * 0.55, tr.y + Math.sin(a) * tr.r * 0.55, tr.r * 0.5, 0, 6.283); } ctx.fill();
      ctx.fillStyle = '#2f8a50'; ctx.beginPath(); ctx.arc(tr.x, tr.y, tr.r * 0.62, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#44a866'; ctx.beginPath(); ctx.arc(tr.x - tr.r * 0.18, tr.y - tr.r * 0.2, tr.r * 0.3, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    fx.draw(ctx);
    // storm outside the zone
    ctx.save();
    ctx.beginPath(); ctx.rect(cam.x - 30, cam.y - 30, W + 60, H + 60); ctx.arc(zone.cx, zone.cy, Math.max(0, zone.r), 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(150,40,160,0.34)'; ctx.fill('evenodd');
    ctx.restore();
    ctx.strokeStyle = `rgba(255,120,255,${0.6 + 0.3 * Math.sin(t * 6)})`; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(zone.cx, zone.cy, Math.max(0, zone.r), 0, Math.PI * 2); ctx.stroke();
    if (zone.phase < PHASES.length) { ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.setLineDash([10, 10]); ctx.beginPath(); ctx.arc(zone.tx, zone.ty, zone.tr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    ctx.restore();

    // HUD
    const hx = SG.hudX();
    bar(ctx, hx, 14, 190, 16, me.hp / 100, '#5dff9a', '#37d6c4');
    bar(ctx, hx, 34, 190, 8, me.armor / 50, '#7dc8ff', '#4da3ff');
    const w = WEAPONS[me.weapon.type];
    label(ctx, `${w.name}${w.ammo ? ' · ' + me.weapon.ammo : ''}`, hx + 2, 62, 14, '#ffd34d', 'left');
    label(ctx, `Tirik: ${alive().length}/${fighters.length}`, W / 2, 30, 20, '#ffffff');
    label(ctx, `☠ ${me.kills}`, W / 2, 52, 15, '#ffd34d');
    const zt = zone.phase >= PHASES.length ? '' : zone.shrinking ? 'Zona toraymoqda!' : `Zona: ${Math.max(0, Math.ceil(zone.t))}s`;
    if (zt) label(ctx, zt, W / 2, 74, 14, zone.shrinking ? '#ff9a3d' : '#cfd6e6');
    if (me.alive && Math.hypot(me.x - zone.cx, me.y - zone.cy) > zone.r) {
      label(ctx, '⚠ ZONADAN TASHQARIDASIZ!', W / 2, 110, 20, '#ff5d5d');
      const a = Math.atan2(zone.cy - me.y, zone.cx - me.x);
      ctx.save(); ctx.translate(W / 2 + Math.cos(a) * 90, H / 2 + Math.sin(a) * 90); ctx.rotate(a);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-8, -11); ctx.lineTo(-8, 11); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    // minimap
    const mw = 124, mh = mw * MH / MW, mx = W - mw - 12, my = 12, sc = mw / MW;
    rr(ctx, mx - 3, my - 3, mw + 6, mh + 6, 8); ctx.fillStyle = 'rgba(8,10,18,0.7)'; ctx.fill();
    ctx.save(); rr(ctx, mx, my, mw, mh, 5); ctx.clip();
    ctx.fillStyle = '#7a3a8a'; ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = '#4f9a4d'; ctx.beginPath(); ctx.arc(mx + zone.cx * sc, my + zone.cy * sc, Math.max(0, zone.r * sc), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(mx + zone.tx * sc, my + zone.ty * sc, zone.tr * sc, 0, Math.PI * 2); ctx.stroke();
    for (const f of fighters) if (f.alive) { ctx.fillStyle = f.human ? '#ffffff' : f.color; ctx.beginPath(); ctx.arc(mx + f.x * sc, my + f.y * sc, f.human ? 3.5 : 2.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    feed.forEach((m, i) => { ctx.globalAlpha = clamp(m.t, 0, 1); label(ctx, m.txt, W - 14, my + mh + 26 + i * 18, 12, m.color, 'right'); });
    ctx.globalAlpha = 1;
    if (!me.alive) label(ctx, `${me.place}-o'rin`, W / 2, H * 0.42, 60, '#ff5d5d');
    else if (alive().length === 1) label(ctx, "G'OLIB!", W / 2, H * 0.42, 72, '#ffd34d');
  }

  SG.run(update, draw);
  $('start-btn').addEventListener('click', start);
  $('retry-btn').addEventListener('click', start);
  if (/debug/.test(location.search)) window.__g = { get s() { return { state, alive: alive().length, hp: me.hp, kills: me.kills, phase: zone.phase, zr: Math.round(zone.r), place: me.place, top: fighters.map(f => [f.name, f.alive, f.kills, f.weapon.type]) }; } };
})();
