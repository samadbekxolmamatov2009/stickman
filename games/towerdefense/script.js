(() => {
  'use strict';
  const { rand, clamp, damp, hash, sfx, FX, Char, poses, label, bar, rr, $ } = SG;

  const H = 540, Y0 = 62, YH = 440;
  let W = 960;
  const fx = new FX();

  const PATH_N = [[-0.04, 0.3], [0.22, 0.3], [0.22, 0.7], [0.5, 0.7], [0.5, 0.26], [0.78, 0.26], [0.78, 0.64], [1.04, 0.64]];
  const SLOT_N = [[0.105, 0.54], [0.225, 0.08], [0.335, 0.46], [0.36, 0.93], [0.615, 0.5], [0.64, 0.05], [0.895, 0.42], [0.9, 0.88], [0.39, 0.1], [0.665, 0.82]];
  let path = [], segLen = [], pathLen = 0, slots = SLOT_N.map(() => ({ x: 0, y: 0, tower: null }));

  function layout() {
    W = SG.view.W;
    path = PATH_N.map(([nx, ny]) => ({ x: nx * W, y: Y0 + ny * YH }));
    segLen = []; pathLen = 0;
    for (let i = 1; i < path.length; i++) { const l = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y); segLen.push(l); pathLen += l; }
    SLOT_N.forEach(([nx, ny], i) => { slots[i].x = nx * W; slots[i].y = Y0 + ny * YH; if (slots[i].tower) { slots[i].tower.x = slots[i].x; slots[i].tower.y = slots[i].y; } });
  }
  SG.initView($('game'), layout);

  function posAt(d) {
    let i = 0;
    while (i < segLen.length - 1 && d > segLen[i]) { d -= segLen[i]; i++; }
    const k = clamp(d / segLen[i], 0, 1.2);
    const a = path[i], b = path[i + 1];
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, dx: Math.sign(b.x - a.x), dy: Math.sign(b.y - a.y) };
  }

  const TOWERS = {
    archer: { name: 'Yoychi', icon: '🏹', cost: 50, range: 155, dmg: 12, rate: 0.7, color: '#4ddd8f', weapon: 'bow' },
    mage: { name: 'Sehrgar', icon: '❄️', cost: 80, range: 125, dmg: 14, rate: 1.4, color: '#7db8ff', weapon: 'staff', splash: 48, slow: 1.4 },
    bomber: { name: 'Bombachi', icon: '💣', cost: 100, range: 175, dmg: 34, rate: 2.3, color: '#ffb84d', weapon: null, splash: 62 },
    ninja: { name: 'Ninja', icon: '⚔️', cost: 65, range: 74, dmg: 9, rate: 0.3, color: '#ff5d5d', weapon: 'sword' },
  };
  const TYPE_KEYS = Object.keys(TOWERS);
  const ENEMIES = {
    grunt: { hp: 38, speed: 46, reward: 6, color: '#a45cd6', style: 'helmet', scale: 0.52 },
    runner: { hp: 24, speed: 88, reward: 5, color: '#4ddd8f', style: 'spiky', scale: 0.46 },
    tank: { hp: 150, speed: 30, reward: 14, color: '#ff9a3d', style: 'helmet', scale: 0.68 },
    boss: { hp: 1100, speed: 22, reward: 120, color: '#ff3d5d', style: 'spiky', scale: 1.0, boss: true },
  };
  const WAVES = [
    [['grunt', 6]],
    [['grunt', 8], ['runner', 3]],
    [['runner', 8], ['grunt', 5]],
    [['grunt', 8], ['tank', 2]],
    [['runner', 10], ['tank', 3]],
    [['grunt', 14], ['runner', 6]],
    [['tank', 6], ['runner', 8]],
    [['grunt', 16], ['tank', 5], ['runner', 8]],
    [['tank', 9], ['runner', 14]],
    [['grunt', 12], ['tank', 6], ['boss', 1], ['runner', 10]],
  ];

  let state = 'menu', gold, lives, wave, queue, spawnT, enemies, shots, between, speed = 1, sel = null, menuSlot = null, hintT = 0;

  function start() {
    SG.audioUnlock();
    gold = 130; lives = 15; wave = 0; enemies = []; shots = []; queue = []; between = 5; speed = 1; sel = null; menuSlot = null;
    slots.forEach(s => { s.tower = null; });
    state = 'play'; hintT = 6;
    SG.show('start-screen', false); SG.show('results-screen', false);
  }

  function startWave() {
    wave++;
    queue = [];
    WAVES[wave - 1].forEach(([type, n]) => { for (let i = 0; i < n; i++) queue.push(type); });
    // interleave a little so groups mix
    for (let i = queue.length - 1; i > 0; i--) if (Math.random() < 0.35) { const j = Math.max(0, i - 2 - ((Math.random() * 3) | 0)); [queue[i], queue[j]] = [queue[j], queue[i]]; }
    const bi = queue.indexOf('boss');
    if (bi >= 0) { queue.splice(bi, 1); queue.splice(Math.floor(queue.length / 2), 0, 'boss'); }
    spawnT = 0.5; between = -1;
    sfx.power();
    fx.text(W / 2, 150, `${wave}-to'lqin!`, '#ffd34d', 30);
  }

  function spawn(type) {
    const d = ENEMIES[type];
    const hp = d.hp * (1 + (wave - 1) * 0.17);
    enemies.push({ type, d: -10, hp, max: hp, def: d, slow: 0, ph: rand(0, 6), flash: 0, char: new Char({ color: d.color, style: d.style }), off: rand(-9, 9), x: 0, y: 0, f: 1 });
  }

  function build(slot, type) {
    const d = TOWERS[type];
    if (gold < d.cost) { sfx.error(); fx.text(slot.x, slot.y - 50, 'Oltin yetmaydi', '#ff8a8a', 14); return; }
    gold -= d.cost;
    slot.tower = { type, def: d, lvl: 1, x: slot.x, y: slot.y, cd: 0.3, atk: 0, f: 1, aim: 0.3, spent: d.cost, char: new Char({ color: d.color, style: type === 'ninja' ? 'band' : type === 'mage' ? 'none' : 'band' }), slot };
    sfx.build(); fx.dust(slot.x, slot.y + 6, 10); fx.ring(slot.x, slot.y, d.color, 50);
  }
  const stat = (t, k) => t.def[k] * (k === 'rate' ? 1 / (1 + (t.lvl - 1) * 0.22) : k === 'range' ? 1 + (t.lvl - 1) * 0.12 : 1 + (t.lvl - 1) * 0.55);
  const upCost = t => Math.round(t.def.cost * 0.75 * t.lvl);

  function hurt(e, dmg, src) {
    e.hp -= dmg; e.flash = 0.08;
    if (e.hp <= 0 && !e.dead) {
      e.dead = true; gold += e.def.reward;
      fx.burst(e.x, e.y - 24, e.def.boss ? 40 : 10, { color: e.def.color, speedMin: 60, speedMax: e.def.boss ? 420 : 220 });
      fx.text(e.x, e.y - 50, `+${e.def.reward}`, '#ffd34d', 15);
      if (e.def.boss) { sfx.explode(); fx.shake(14); } else sfx.thud();
    }
  }
  function splash(x, y, r, dmg, slow) {
    for (const e of enemies) if (!e.dead && Math.hypot(e.x - x, e.y - 20 - y) < r + 10) { hurt(e, dmg); if (slow) e.slow = slow; }
  }

  function update(rdt) {
    fx.update(rdt);
    if (state !== 'play') return;
    const dt = rdt * speed;
    hintT -= rdt;

    if (between >= 0) {
      between -= dt;
      if (between <= 0) startWave();
    } else {
      if (queue.length) {
        spawnT -= dt;
        if (spawnT <= 0) { const t = queue.shift(); spawn(t); spawnT = t === 'runner' ? 0.5 : t === 'boss' ? 2 : 0.85; }
      } else if (!enemies.length) {
        if (wave >= WAVES.length) return finish(true);
        between = 7; gold += 20 + wave * 4;
        fx.text(W / 2, 150, `To'lqin qaytarildi! +${20 + wave * 4}`, '#5dff9a', 22);
        sfx.coin();
      }
    }

    for (const e of enemies) {
      const sp = e.def.speed * (e.slow > 0 ? 0.5 : 1);
      e.slow -= dt; e.flash -= dt;
      e.d += sp * dt; e.ph += dt * (4 + sp * 0.12);
      const p = posAt(e.d);
      e.x = p.x + (p.dy !== 0 ? e.off : 0); e.y = p.y + (p.dx !== 0 ? e.off : 0) + 14;
      if (p.dx !== 0) e.f = p.dx;
      e.char.to(poses.walk(e.ph), dt, 20);
      if (e.d >= pathLen) {
        e.dead = true; lives -= e.def.boss ? 5 : 1;
        fx.shake(8); sfx.heavy(); SG.buzz(60);
        fx.text(W - 60, posAt(pathLen).y - 30, e.def.boss ? '-5 ❤' : '-1 ❤', '#ff5d5d', 20);
        if (lives <= 0) return finish(false);
      }
    }
    enemies = enemies.filter(e => !e.dead);

    for (const s of slots) {
      const t = s.tower;
      if (!t) continue;
      t.cd -= dt; t.atk -= dt;
      const range = stat(t, 'range');
      let target = null, bestD = -1;
      for (const e of enemies) {
        if (Math.hypot(e.x - t.x, e.y - 20 - t.y) <= range && e.d > bestD) { bestD = e.d; target = e; }
      }
      if (target) {
        t.f = target.x >= t.x ? 1 : -1;
        t.aim = clamp(Math.atan2(-(target.y - 20 - (t.y - 20)), Math.abs(target.x - t.x)), -0.9, 1.2);
        if (t.cd <= 0) {
          t.cd = stat(t, 'rate'); t.atk = 0.2;
          const dmg = stat(t, 'dmg');
          if (t.type === 'ninja') {
            hurt(target, dmg);
            fx.burst(target.x, target.y - 22, 4, { color: '#ffffff', spark: true, speedMin: 80, speedMax: 240 });
            sfx.whoosh();
          } else {
            shots.push({ type: t.type, x: t.x + t.f * 10, y: t.y - 30, sx: t.x + t.f * 10, sy: t.y - 30, target, dmg, t: 0, dur: t.type === 'bomber' ? 0.7 : 0, tx: target.x, ty: target.y - 20, splash: t.def.splash ? t.def.splash * (1 + (t.lvl - 1) * 0.15) : 0, slow: t.def.slow || 0 });
            t.type === 'bomber' ? sfx.whoosh() : sfx.shoot();
          }
        }
      }
      const P = poses, tt = SG.time.t;
      let pose;
      if (t.type === 'archer') pose = P.aim(target ? t.aim : 0.2, t.atk > 0 ? 0.1 : (target ? clamp(1 - t.cd / stat(t, 'rate'), 0, 1) : 0));
      else if (t.type === 'mage') pose = t.atk > 0 ? P.cast() : P.stand(tt);
      else if (t.type === 'bomber') pose = t.atk > 0 ? P.upper() : P.stand(tt + 1);
      else pose = t.atk > 0.1 ? P.slash(1) : target ? P.slash(0) : P.guard(tt);
      t.char.to(pose, dt, 22);
    }

    for (const s of shots) {
      s.t += dt;
      if (s.type === 'bomber') {
        const k = clamp(s.t / s.dur, 0, 1);
        if (!s.target.dead) { s.tx = s.target.x; s.ty = s.target.y - 16; }
        s.x = s.sx + (s.tx - s.sx) * k; s.y = s.sy + (s.ty - s.sy) * k - Math.sin(k * Math.PI) * 90;
        if (k >= 1) {
          s.dead = true; splash(s.tx, s.ty, s.splash, s.dmg, 0);
          fx.burst(s.tx, s.ty, 22, { color: '#ffb347', speedMin: 60, speedMax: 320 }); fx.ring(s.tx, s.ty, '#ffd98a', s.splash, 0.3, 5);
          fx.shake(5); sfx.explode();
        }
      } else {
        if (!s.target.dead) { s.tx = s.target.x; s.ty = s.target.y - 20; }
        const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy) || 1;
        const v = (s.type === 'archer' ? 560 : 360) * dt;
        s.ang = Math.atan2(dy, dx);
        if (d <= v + 6) {
          s.dead = true;
          if (s.splash) { splash(s.tx, s.ty, s.splash, s.dmg, s.slow); fx.burst(s.tx, s.ty, 12, { color: '#bfe6ff', speedMin: 40, speedMax: 200 }); fx.ring(s.tx, s.ty, '#bfe6ff', s.splash, 0.3, 4); sfx.block(); }
          else if (!s.target.dead) { hurt(s.target, s.dmg); fx.burst(s.tx, s.ty, 4, { color: '#ffd98a', spark: true, speedMin: 60, speedMax: 200 }); }
        } else { s.x += dx / d * v; s.y += dy / d * v; }
      }
    }
    shots = shots.filter(s => !s.dead);
  }

  function finish(win) {
    state = 'over';
    $('winner-text').textContent = win ? "🏆 G'alaba!" : "Mag'lubiyat...";
    const stars = win ? (lives >= 13 ? 3 : lives >= 7 ? 2 : 1) : 0;
    $('final-score').innerHTML = win ? `${'⭐'.repeat(stars)}<br>Qolgan jonlar: <b>${lives}</b>` : `Yetib kelgan to'lqin: <b>${wave}</b> / ${WAVES.length}`;
    win ? sfx.win() : sfx.lose();
    SG.show('results-screen', true);
  }

  // ---------- input ----------
  const UI = { speed: { x: 0, y: 0, w: 58, h: 34 }, next: { x: 0, y: 0, w: 150, h: 34 } };
  const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  function menuItems(slot) {
    const flip = slot.y < 150 ? 1 : -1;
    return TYPE_KEYS.map((k, i) => ({ k, x: clamp(slot.x + (i - 1.5) * 62, 40, W - 40), y: slot.y + flip * 62 }));
  }
  function selButtons(t) {
    const flip = t.y < 150 ? 1 : -1;
    return { up: { x: clamp(t.x - 40, 50, W - 110), y: t.y + flip * 64 }, sell: { x: clamp(t.x + 40, 110, W - 50), y: t.y + flip * 64 } };
  }
  $('game').addEventListener('pointerdown', e => {
    if (state !== 'play') return;
    const p = SG.toLocal(e);
    if (inRect(p, UI.speed)) { speed = speed === 1 ? 2 : 1; sfx.click(); return; }
    if (between > 0 && inRect(p, UI.next)) { gold += Math.round(between * 2); between = 0.01; sfx.click(); return; }
    if (menuSlot) {
      const it = menuItems(menuSlot).find(m => Math.hypot(p.x - m.x, p.y - m.y) < 30);
      const s = menuSlot; menuSlot = null;
      if (it) { build(s, it.k); return; }
    }
    if (sel) {
      const b = selButtons(sel);
      if (Math.hypot(p.x - b.up.x, p.y - b.up.y) < 32 && sel.lvl < 3) {
        const c = upCost(sel);
        if (gold >= c) { gold -= c; sel.spent += c; sel.lvl++; sfx.power(); fx.ring(sel.x, sel.y - 20, '#ffd34d', 60); fx.text(sel.x, sel.y - 70, `Daraja ${sel.lvl}!`, '#ffd34d', 16); }
        else { sfx.error(); fx.text(sel.x, sel.y - 70, 'Oltin yetmaydi', '#ff8a8a', 14); }
        return;
      }
      if (Math.hypot(p.x - b.sell.x, p.y - b.sell.y) < 32) {
        gold += Math.round(sel.spent * 0.6); sel.slot.tower = null; sel = null; sfx.coin(); return;
      }
      sel = null;
    }
    const s = slots.find(s => Math.hypot(p.x - s.x, p.y - (s.y - 12)) < 36);
    if (s) { if (s.tower) { sel = s.tower; menuSlot = null; } else { menuSlot = s; sel = null; } sfx.click(); }
  });

  // ---------- draw ----------
  function drawMap(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#6fbe62'); g.addColorStop(1, '#4b9a4a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
      const x = hash(i * 3.7) * W, y = hash(i * 9.1) * H;
      ctx.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      ctx.beginPath(); ctx.ellipse(x, y, 24 + hash(i) * 40, 10 + hash(i * 2) * 14, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const stroke = (w, c) => { ctx.beginPath(); path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.lineWidth = w; ctx.strokeStyle = c; ctx.stroke(); };
    stroke(62, '#3d7a3b'); stroke(54, '#b98a55'); stroke(46, '#d9b27a');
    ctx.setLineDash([3, 22]); stroke(30, 'rgba(120,84,44,0.18)'); ctx.setLineDash([]);
    // decorations
    for (let i = 0; i < 26; i++) {
      const x = hash(i * 7.3 + 2) * W, y = Y0 + hash(i * 4.9 + 1) * (H - Y0);
      let near = slots.some(s => Math.hypot(s.x - x, s.y - y) < 50);
      for (let k = 1; k < path.length && !near; k++) {
        const a = path[k - 1], b = path[k];
        const minx = Math.min(a.x, b.x) - 50, maxx = Math.max(a.x, b.x) + 50, miny = Math.min(a.y, b.y) - 50, maxy = Math.max(a.y, b.y) + 50;
        if (x > minx && x < maxx && y > miny && y < maxy) near = true;
      }
      if (near) continue;
      if (i % 3 === 0) {
        ctx.fillStyle = '#8f9bb0'; ctx.beginPath(); ctx.ellipse(x, y, 12, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#b3bdd0'; ctx.beginPath(); ctx.ellipse(x - 3, y - 3, 6, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.ellipse(x, y + 4, 18, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5a4630'; ctx.fillRect(x - 3, y - 14, 6, 16);
        ctx.fillStyle = '#2f7d4c'; ctx.beginPath(); ctx.arc(x, y - 24, 16, 0, Math.PI * 2); ctx.arc(x - 11, y - 15, 11, 0, Math.PI * 2); ctx.arc(x + 11, y - 15, 11, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3f9a5c'; ctx.beginPath(); ctx.arc(x - 4, y - 28, 8, 0, Math.PI * 2); ctx.fill();
      }
    }
    // gate
    const end = path[path.length - 1], gx = W - 26, gy = end.y;
    ctx.fillStyle = '#5c667d'; rr(ctx, gx - 6, gy - 62, 40, 96, 6); ctx.fill();
    ctx.fillStyle = '#7d889f'; for (let k = 0; k < 3; k++) ctx.fillRect(gx - 6 + k * 14, gy - 72, 9, 12);
    ctx.fillStyle = '#3b2a1a'; rr(ctx, gx, gy - 34, 28, 62, 12); ctx.fill();
    ctx.fillStyle = '#ff5d5d'; ctx.beginPath(); ctx.moveTo(gx + 14, gy - 96); ctx.lineTo(gx + 36, gy - 88); ctx.lineTo(gx + 14, gy - 80); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3b2a1a'; ctx.fillRect(gx + 12, gy - 98, 3, 30);
  }

  function drawSlot(ctx, s) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(s.x, s.y + 8, 30, 11, 0, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createLinearGradient(0, s.y - 8, 0, s.y + 10);
    g.addColorStop(0, '#aab4c8'); g.addColorStop(1, '#6f7a92');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(s.x, s.y + 2, 27, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c6cede'; ctx.beginPath(); ctx.ellipse(s.x, s.y - 1, 23, 7.5, 0, 0, Math.PI * 2); ctx.fill();
    if (!s.tower) {
      const pulse = 0.5 + 0.5 * Math.sin(SG.time.t * 4);
      ctx.strokeStyle = `rgba(255,255,255,${0.5 + pulse * 0.4})`; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s.x - 8, s.y - 1); ctx.lineTo(s.x + 8, s.y - 1); ctx.moveTo(s.x, s.y - 6); ctx.lineTo(s.x, s.y + 4); ctx.stroke();
    }
  }

  function roundBtn(ctx, x, y, icon, text, color, ok = true) {
    ctx.beginPath(); ctx.arc(x, y, 27, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12,16,28,0.9)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = ok ? color : '#555e73'; ctx.stroke();
    ctx.globalAlpha = ok ? 1 : 0.45;
    label(ctx, icon, x, y + 2, 19, '#fff', 'center', false);
    ctx.globalAlpha = 1;
    label(ctx, text, x, y + 22, 11, ok ? '#ffd34d' : '#ff8a8a');
  }

  function draw(ctx) {
    ctx.save();
    fx.applyShake(ctx);
    drawMap(ctx);
    slots.forEach(s => drawSlot(ctx, s));
    if (state !== 'menu') {
      const t = sel || (menuSlot ? null : null);
      if (t) {
        ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(t.x, t.y - 16, stat(t, 'range'), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      const ents = [];
      slots.forEach(s => { if (s.tower) ents.push({ y: s.tower.y, tw: s.tower }); });
      enemies.forEach(e => ents.push({ y: e.y, en: e }));
      ents.sort((a, b) => a.y - b.y);
      for (const it of ents) {
        if (it.tw) {
          const tw = it.tw;
          tw.char.draw(ctx, tw.x, tw.y, { facing: tw.f, scale: 0.62, weapon: tw.def.weapon, bowPull: tw.type === 'archer' ? clamp(1 - tw.cd / stat(tw, 'rate'), 0, 1) : 0, arrow: tw.type === 'archer' && tw.cd < stat(tw, 'rate') * 0.7, orb: '#7db8ff', shadow: false, tails: tw.type !== 'mage' });
          for (let k = 0; k < tw.lvl; k++) { ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(tw.x - (tw.lvl - 1) * 5 + k * 10, tw.y + 15, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#7a5200'; ctx.lineWidth = 1; ctx.stroke(); }
        } else {
          const e = it.en;
          e.char.draw(ctx, e.x, e.y, { facing: e.f, scale: e.def.scale, flash: e.flash, crown: e.def.boss, tails: false, mood: e.def.boss ? 'normal' : 'normal' });
          if (e.slow > 0) { ctx.strokeStyle = 'rgba(160,220,255,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(e.x, e.y + 1, 14 * e.def.scale * 1.6, 5, 0, 0, Math.PI * 2); ctx.stroke(); }
          const bw = e.def.boss ? 70 : 30, by = e.y - 104 * e.def.scale - 8;
          ctx.fillStyle = 'rgba(8,10,18,0.6)'; rr(ctx, e.x - bw / 2, by, bw, 5, 2.5); ctx.fill();
          ctx.fillStyle = e.hp / e.max > 0.5 ? '#5dff9a' : e.hp / e.max > 0.25 ? '#ffd34d' : '#ff5d5d';
          rr(ctx, e.x - bw / 2, by, bw * clamp(e.hp / e.max, 0, 1), 5, 2.5); ctx.fill();
        }
      }
      for (const s of shots) {
        if (s.type === 'archer') {
          ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.ang || 0);
          ctx.strokeStyle = '#171d2b'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(4, 0); ctx.stroke();
          ctx.strokeStyle = '#f2e6d0'; ctx.lineWidth = 1.8; ctx.stroke();
          ctx.fillStyle = '#e6edf7'; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(2, -3); ctx.lineTo(2, 3); ctx.closePath(); ctx.fill();
          ctx.restore();
        } else if (s.type === 'mage') {
          const gl = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, 12);
          gl.addColorStop(0, '#ffffff'); gl.addColorStop(0.4, '#7db8ff'); gl.addColorStop(1, 'rgba(125,184,255,0)');
          ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(s.x, s.y, 12, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = '#171d2b'; ctx.beginPath(); ctx.arc(s.x, s.y, 7, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(s.x + 4, s.y - 7, 2.5 + Math.random() * 2, 0, Math.PI * 2); ctx.fill();
        }
      }
      fx.draw(ctx);

      if (menuSlot) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.arc(menuSlot.x, menuSlot.y, 34, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        menuItems(menuSlot).forEach(m => { const d = TOWERS[m.k]; roundBtn(ctx, m.x, m.y, d.icon, `${d.cost}`, d.color, gold >= d.cost); label(ctx, d.name, m.x, m.y - 32, 10, '#fff'); });
      }
      if (sel) {
        const b = selButtons(sel);
        if (sel.lvl < 3) roundBtn(ctx, b.up.x, b.up.y, '⬆', `${upCost(sel)}`, '#5dff9a', gold >= upCost(sel));
        else roundBtn(ctx, b.up.x, b.up.y, '★', 'MAX', '#ffd34d', false);
        roundBtn(ctx, b.sell.x, b.sell.y, '💰', `+${Math.round(sel.spent * 0.6)}`, '#ff8a5d');
        label(ctx, `${sel.def.name} · ${sel.lvl}-daraja`, sel.x, sel.y + (sel.y < 150 ? 108 : -98), 12, '#fff');
      }
    }
    ctx.restore();

    if (state !== 'menu') {
      rr(ctx, 110, 10, 330, 38, 19); ctx.fillStyle = 'rgba(8,10,18,0.62)'; ctx.fill();
      label(ctx, `💰 ${gold}`, 128, 36, 17, '#ffd34d', 'left', false);
      label(ctx, `❤ ${lives}`, 230, 36, 17, '#ff7a8a', 'left', false);
      label(ctx, `To'lqin ${Math.min(Math.max(wave, 1), WAVES.length)}/${WAVES.length}`, 314, 35, 14, '#ffffff', 'left', false);
      UI.speed.x = W - 72; UI.speed.y = 12;
      rr(ctx, UI.speed.x, UI.speed.y, UI.speed.w, UI.speed.h, 17); ctx.fillStyle = speed === 2 ? '#37d6c4' : 'rgba(8,10,18,0.62)'; ctx.fill();
      label(ctx, speed === 2 ? '▶▶ x2' : '▶ x1', UI.speed.x + 29, UI.speed.y + 23, 14, speed === 2 ? '#06211d' : '#fff', 'center', false);
      if (between > 0) {
        UI.next.x = W - 236; UI.next.y = 12;
        rr(ctx, UI.next.x, UI.next.y, UI.next.w, UI.next.h, 17); ctx.fillStyle = '#ffd34d'; ctx.fill();
        label(ctx, `Boshlash (${Math.ceil(between)}) +${Math.round(between * 2)}💰`, UI.next.x + 75, UI.next.y + 22, 12, '#171d2b', 'center', false);
      }
      if (hintT > 0 && !slots.some(s => s.tower)) label(ctx, 'Oq maydonchani bosib himoyachi quring', W / 2, H - 22, 16, '#ffffff');
    }
  }

  SG.run(update, draw);
  $('start-btn').addEventListener('click', start);
  $('retry-btn').addEventListener('click', start);
  if (/debug/.test(location.search)) window.__g = { get s() { return { state, gold, lives, wave, n: enemies.length, between }; }, slots, build: (i, k) => build(slots[i], k), gold: v => { gold = v; }, skip: () => { between = 0.01; } };
})();
