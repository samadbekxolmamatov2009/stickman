(() => {
  'use strict';
  const { clamp, damp, mix, sfx, FX, label, rr, $ } = SG;

  const H = 540, T = 48, PR = 12, OY = 6;
  let W = 960;
  SG.initView($('game'), () => { W = SG.view.W; });
  const fx = new FX();

  const LEVELS = [
    { map: [
      '####################',
      '#P....#.......#....#',
      '#.....#.......#....#',
      '#.....#..###..#....#',
      '#.........#...D...E#',
      '#.....#...#...#....#',
      '#.....#.......#....#',
      '#.....#...K...#....#',
      '#.....#.......#....#',
      '#.....#.......#....#',
      '####################'],
      guards: [{ path: [[8, 2], [12, 2], [12, 8], [8, 8]], loop: true, speed: 70 }], cams: [] },
    { map: [
      '####################',
      '#P...#....$....#..E#',
      '#....#.........#...#',
      '#....#..####...#...#',
      '#..............D...#',
      '#....#..####...#...#',
      '#....#.........#####',
      '#....#....K........#',
      '###.##.........#...#',
      '#$.............#..$#',
      '####################'],
      guards: [{ path: [[7, 2], [13, 2]], speed: 76 }, { path: [[13, 6], [7, 6]], speed: 76 }], cams: [] },
    { map: [
      '####################',
      '#P.#.....$....#....#',
      '#..#..........#....#',
      '#..#..##..##..#..K.#',
      '#.....#....#.......#',
      '#..#..#....#..#....#',
      '#..#..........#....#',
      '####..##..##..######',
      '#$.................#',
      '#.................E#',
      '####################'],
      guards: [{ path: [[4, 2], [13, 2]], speed: 78 }, { path: [[4, 8], [17, 8]], speed: 84 }, { path: [[16, 5], [16, 2], [18, 2], [18, 5]], loop: true, speed: 60 }],
      cams: [{ c: 8.5, r: 4.5, a: Math.PI / 2, sweep: 0.9, speed: 0.9 }] },
    { map: [
      '####################',
      '#P...#........#...E#',
      '#....#.######.#....#',
      '#....#.#....#.#.##.#',
      '#......#.K..#......#',
      '#.####.#....#.####.#',
      '#....#.##..##.#....#',
      '#....#........#....#',
      '#.##.####..####.##.#',
      '#$................$#',
      '####################'],
      guards: [{ path: [[6, 1], [13, 1], [13, 7], [6, 7]], loop: true, speed: 82 }, { path: [[2, 9], [17, 9]], speed: 88 }, { path: [[15, 4], [18, 4]], speed: 50 }],
      cams: [{ c: 9.5, r: 3.2, a: Math.PI / 2, sweep: 0.7, speed: 1.1 }] },
    { map: [
      '####################',
      '#P.....#.....#.....#',
      '#.###..#.###.#.###.#',
      '#...#....#.....#...#',
      '###.####.#.#####.###',
      '#........#.........#',
      '#.####.#####.###.#.#',
      '#.#..........#K..#.#',
      '#.#.######.###.###.#',
      '#$.........$......E#',
      '####################'],
      guards: [{ path: [[1, 5], [8, 5]], speed: 80 }, { path: [[18, 5], [10, 5]], speed: 80 }, { path: [[3, 7], [12, 7]], speed: 74 }, { path: [[17, 9], [4, 9]], speed: 90 }],
      cams: [{ c: 5.5, r: 1.2, a: Math.PI / 2, sweep: 0.8, speed: 1 }] },
    { map: [
      '####################',
      '#P..#......#......E#',
      '#...#.####.#.####..#',
      '#...#.#..#...#..#..#',
      '#.....#.K#.#.#$.#..#',
      '#...#.#..#.#.#..#..#',
      '#...#.##.###.#.##..#',
      '#...#..............#',
      '#.###.####.####.##.#',
      '#$.................#',
      '####################'],
      guards: [{ path: [[5, 1], [10, 1]], speed: 70 }, { path: [[5, 7], [18, 7]], speed: 92 }, { path: [[18, 2], [18, 8]], speed: 70 }, { path: [[17, 9], [2, 9]], speed: 92 }, { path: [[10, 3], [12, 3], [12, 5]], speed: 56 }],
      cams: [{ c: 2.5, r: 1.2, a: Math.PI / 2, sweep: 0.8, speed: 0.9 }, { c: 17.5, r: 4.5, a: Math.PI, sweep: 0.6, speed: 1.2 }] },
  ];

  let state = 'menu', lvl = 0, grid, cols, rows, me, guards, cams, key, exitP, doors, coins, hasKey, gotCoins, alarm, timer, endT, cam = 0, touch = null, hintT = 0;
  const saved = () => clamp(SG.best('escape_lvl'), 0, LEVELS.length - 1);
  $('best').parentElement.innerHTML = `Ochilgan daraja: <b id="best">${saved() + 1}</b> / ${LEVELS.length}`;

  const solid = (c, r) => c < 0 || r < 0 || c >= cols || r >= rows || grid[r][c] === '#' || (grid[r][c] === 'D' && !hasKey);
  const solidPx = (x, y) => solid(Math.floor(x / T), Math.floor(y / T));

  function load(n) {
    lvl = n;
    const L = LEVELS[n];
    grid = L.map.map(s => s.split('')); rows = grid.length; cols = grid[0].length;
    coins = []; doors = []; hasKey = false; gotCoins = 0; alarm = 0; timer = 0; endT = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const ch = grid[r][c], x = c * T + T / 2, y = r * T + T / 2;
      if (ch === 'P') me = { x, y, vx: 0, vy: 0, ang: 0, walk: 0 };
      else if (ch === 'K') key = { x, y, got: false };
      else if (ch === 'E') exitP = { x, y };
      else if (ch === '$') coins.push({ x, y, got: false });
      else if (ch === 'D') doors.push({ c, r });
    }
    guards = L.guards.map(g => ({ path: g.path.map(([c, r]) => ({ x: c * T + T / 2, y: r * T + T / 2 })), loop: !!g.loop, speed: g.speed, i: 0, dir: 1, x: g.path[0][0] * T + T / 2, y: g.path[0][1] * T + T / 2, ang: 0, wait: 0.4, see: 0, walk: 0 }));
    for (const g of guards) { const n1 = g.path[1]; g.ang = Math.atan2(n1.y - g.y, n1.x - g.x); g.want = g.ang; }
    cams = L.cams.map(c => ({ x: c.c * T, y: c.r * T, a0: c.a, sweep: c.sweep, speed: c.speed, ang: c.a, see: 0 }));
    state = 'play'; hintT = 4;
    cam = clamp(me.x - W / 2, Math.min(0, (cols * T - W) / 2), Math.max((cols * T - W) / 2, cols * T - W));
  }

  function start() {
    SG.audioUnlock();
    SG.show('start-screen', false); SG.show('results-screen', false);
    SG.clearTouch();
    if (SG.isTouch) { touch = { stick: SG.makeStick() }; SG.showTouch(true); }
    load(start.next !== undefined ? start.next : saved());
    start.next = undefined;
  }

  // cast a ray until a wall; returns reached distance
  function ray(x, y, a, max) {
    const dx = Math.cos(a), dy = Math.sin(a);
    for (let d = 0; d < max; d += 6) if (solidPx(x + dx * d, y + dy * d)) return d;
    return max;
  }
  function sees(ox, oy, ang, range, half) {
    const dx = me.x - ox, dy = me.y - oy, d = Math.hypot(dx, dy);
    if (d > range + PR) return false;
    let da = Math.atan2(dy, dx) - ang; da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > half) return false;
    return ray(ox, oy, Math.atan2(dy, dx), d) >= d - 4;
  }

  function caught(by) {
    if (state !== 'play') return;
    state = 'caught'; endT = 0;
    sfx.lose(); fx.shake(12); SG.buzz(200);
    fx.text(me.x, me.y - 40, 'USHLANDINGIZ!', '#ff5d5d', 22);
  }

  function update(dt) {
    fx.update(dt);
    if (state === 'menu' || state === 'over') return;
    const t = SG.time.t;
    hintT -= dt;

    if (state === 'play') {
      timer += dt;
      let mx = (SG.anyKey('KeyD', 'ArrowRight') ? 1 : 0) - (SG.anyKey('KeyA', 'ArrowLeft') ? 1 : 0);
      let my = (SG.anyKey('KeyS', 'ArrowDown') ? 1 : 0) - (SG.anyKey('KeyW', 'ArrowUp') ? 1 : 0);
      if (touch && touch.stick.active) { mx = touch.stick.x; my = touch.stick.y; }
      const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
      me.vx = damp(me.vx, mx * 172, 16, dt); me.vy = damp(me.vy, my * 172, 16, dt);
      if (ml > 0.2) me.ang = Math.atan2(my, mx);
      me.walk += Math.hypot(me.vx, me.vy) * dt * 0.08;
      // axis-separated tile collision
      let nx = me.x + me.vx * dt;
      if (solidPx(nx + Math.sign(me.vx) * PR, me.y - PR + 2) || solidPx(nx + Math.sign(me.vx) * PR, me.y + PR - 2)) { nx = me.x; me.vx = 0; }
      me.x = nx;
      let ny = me.y + me.vy * dt;
      if (solidPx(me.x - PR + 2, ny + Math.sign(me.vy) * PR) || solidPx(me.x + PR - 2, ny + Math.sign(me.vy) * PR)) { ny = me.y; me.vy = 0; }
      me.y = ny;

      if (!key.got && Math.hypot(key.x - me.x, key.y - me.y) < 26) {
        key.got = true; hasKey = true; sfx.power();
        fx.ring(key.x, key.y, '#ffd34d', 60); fx.text(key.x, key.y - 30, 'Kalit! Chiqish ochildi', '#ffd34d', 16);
        doors.forEach(d => fx.burst(d.c * T + T / 2, d.r * T + T / 2, 10, { color: '#b98248', gravity: 0 }));
      }
      for (const c of coins) if (!c.got && Math.hypot(c.x - me.x, c.y - me.y) < 24) { c.got = true; gotCoins++; sfx.coin(); fx.burst(c.x, c.y, 6, { color: '#ffd34d', gravity: 0, speedMin: 30, speedMax: 140 }); }
      if (hasKey && Math.hypot(exitP.x - me.x, exitP.y - me.y) < 22) {
        state = 'clear'; endT = 0; sfx.win();
        for (let k = 0; k < 4; k++) fx.burst(exitP.x, exitP.y, 12, { color: ['#ffd34d', '#5dff9a', '#4da3ff', '#ff5d5d'][k], speedMin: 60, speedMax: 320, gravity: 0, drag: 2 });
        SG.best('escape_lvl', Math.min(LEVELS.length - 1, lvl + 1));
      }
    } else { endT += dt; me.vx = me.vy = 0; }

    for (const g of guards) {
      if (state === 'play') {
        if (g.wait > 0) g.wait -= dt;
        else {
          const tg = g.path[g.i], dx = tg.x - g.x, dy = tg.y - g.y, d = Math.hypot(dx, dy);
          if (d < 2) {
            g.x = tg.x; g.y = tg.y; g.wait = 0.5;
            if (g.loop) g.i = (g.i + 1) % g.path.length;
            else { if (g.i + g.dir < 0 || g.i + g.dir >= g.path.length) g.dir *= -1; g.i += g.dir; }
            const nt = g.path[g.i]; g.want = Math.atan2(nt.y - g.y, nt.x - g.x);
          } else { const st = Math.min(d, g.speed * dt); g.x += dx / d * st; g.y += dy / d * st; g.want = Math.atan2(dy, dx); g.walk += st * 0.09; }
        }
        let da = g.want - g.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); g.ang += da * Math.min(1, dt * 5);
        const s = sees(g.x, g.y, g.ang, 185, 0.52) || Math.hypot(me.x - g.x, me.y - g.y) < 24;
        g.see = clamp(g.see + (s ? dt * 2.4 : -dt * 1.2), 0, 1);
        if (s && g.see > 0.1 && Math.random() < dt * 6) sfx.tick();
        if (g.see >= 1) caught(g);
      }
    }
    for (const c of cams) {
      c.ang = c.a0 + Math.sin(t * c.speed) * c.sweep;
      if (state === 'play') {
        const s = sees(c.x, c.y, c.ang, 215, 0.36);
        c.see = clamp(c.see + (s ? dt * 2.2 : -dt * 1.2), 0, 1);
        if (c.see >= 1) caught(c);
      }
    }
    alarm = Math.max(...guards.map(g => g.see), ...cams.map(c => c.see), 0);

    if (state === 'caught' && endT > 1.3) load(lvl);
    if (state === 'clear' && endT > 1.2) finishLevel();
    const mapW = cols * T;
    cam = mapW <= W ? (mapW - W) / 2 : damp(cam, clamp(me.x - W / 2, 0, mapW - W), 6, dt);
  }

  function finishLevel() {
    state = 'over';
    const stars = 1 + (gotCoins === coins.length ? 1 : 0) + (timer < 28 + lvl * 6 ? 1 : 0);
    const last = lvl >= LEVELS.length - 1;
    $('winner-text').textContent = last ? '🏆 Ozodlik! Barcha darajalar o\'tildi!' : `${lvl + 1}-daraja o'tildi!`;
    $('final-score').innerHTML = `${'⭐'.repeat(stars)}${'☆'.repeat(3 - stars)}<br>Vaqt: <b>${timer.toFixed(1)} s</b> &nbsp; 🪙 <b>${gotCoins}/${coins.length}</b>`;
    $('retry-btn').textContent = last ? 'Boshidan' : 'Keyingi daraja';
    start.next = last ? 0 : lvl + 1;
    $('best').textContent = saved() + 1;
    SG.showTouch(false); SG.show('results-screen', true);
  }

  // ---------- draw ----------
  function cone(ctx, x, y, ang, range, half, see) {
    const n = 22;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let i = 0; i <= n; i++) { const a = ang - half + (i / n) * half * 2, d = ray(x, y, a, range); ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
    ctx.closePath();
    const g = ctx.createRadialGradient(x, y, 4, x, y, range);
    const col = see > 0.05 ? `255,${Math.round(210 - see * 150)},${Math.round(90 - see * 60)}` : '255,236,150';
    g.addColorStop(0, `rgba(${col},${0.5 + see * 0.25})`); g.addColorStop(1, `rgba(${col},0.08)`);
    ctx.fillStyle = g; ctx.fill();
  }

  function topFigure(ctx, x, y, ang, walk, col, guard) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(2, 4, 15, 12, 0, 0, 6.283); ctx.fill();
    ctx.rotate(ang);
    const body = '#171d2b', rim = mix('#171d2b', col, 0.55), st = Math.sin(walk) * 5;
    ctx.fillStyle = mix(col, '#000000', 0.3); ctx.beginPath(); ctx.ellipse(st, -5, 5, 3, 0, 0, 6.283); ctx.ellipse(-st, 5, 5, 3, 0, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, 8, 12, 0, 0, 6.283); ctx.fillStyle = guard ? '#27408a' : body; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = rim; ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(8, -10, 3.6, 0, 6.283); ctx.arc(8, 10, 3.6, 0, 6.283); ctx.fill();
    if (guard) { ctx.strokeStyle = '#11151f'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(8, 10); ctx.lineTo(22, 8); ctx.stroke(); ctx.fillStyle = '#fff7c2'; ctx.beginPath(); ctx.arc(23, 8, 2.6, 0, 6.283); ctx.fill(); }
    ctx.beginPath(); ctx.arc(1, 0, 8, 0, 6.283); ctx.fillStyle = body; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = rim; ctx.stroke();
    if (guard) { ctx.fillStyle = '#27408a'; ctx.beginPath(); ctx.arc(1, 0, 8, Math.PI / 2, Math.PI * 1.5); ctx.fill(); ctx.fillStyle = '#16255a'; ctx.fillRect(1, -9, 3, 18); }
    else { ctx.save(); ctx.beginPath(); ctx.arc(1, 0, 7.5, 0, 6.283); ctx.clip(); ctx.fillStyle = col; ctx.fillRect(-1, -9, 4.5, 18); ctx.restore(); ctx.strokeStyle = col; ctx.lineWidth = 2.5; const wv = Math.sin(SG.time.t * 9) * 2.5; ctx.beginPath(); ctx.moveTo(-7, -1); ctx.quadraticCurveTo(-13, -2 + wv, -18, -4 - wv); ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(6, -3, 1.5, 2, 0, 0, 6.283); ctx.ellipse(6, 3, 1.5, 2, 0, 0, 6.283); ctx.fill();
    ctx.restore();
  }

  function draw(ctx) {
    const t = SG.time.t;
    ctx.fillStyle = '#080b14'; ctx.fillRect(0, 0, W, H);
    if (state === 'menu') return;
    ctx.save();
    fx.applyShake(ctx);
    ctx.translate(-Math.round(cam), OY);
    // floor
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = c * T, y = r * T, ch = grid[r][c];
      if (ch === '#') continue;
      ctx.fillStyle = (c + r) % 2 ? '#2a3148' : '#2e3650'; ctx.fillRect(x, y, T, T);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
    }
    // exit
    const eg = ctx.createRadialGradient(exitP.x, exitP.y, 4, exitP.x, exitP.y, 46);
    eg.addColorStop(0, hasKey ? 'rgba(93,255,154,0.7)' : 'rgba(255,93,93,0.4)'); eg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(exitP.x, exitP.y, 46, 0, 6.283); ctx.fill();
    rr(ctx, exitP.x - 16, exitP.y - 16, 32, 32, 6); ctx.fillStyle = hasKey ? '#1f9a5a' : '#7a2a2a'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = hasKey ? '#5dff9a' : '#ff5d5d'; ctx.stroke();
    label(ctx, hasKey ? '🚪' : '🔒', exitP.x, exitP.y + 7, 18, '#fff', 'center', false);
    // cones under everything else
    for (const g of guards) cone(ctx, g.x, g.y, g.ang, 185, 0.52, g.see);
    for (const c of cams) cone(ctx, c.x, c.y, c.ang, 215, 0.36, c.see);
    if (!key.got) {
      const ky = key.y + Math.sin(t * 4) * 3;
      const kg = ctx.createRadialGradient(key.x, ky, 2, key.x, ky, 26); kg.addColorStop(0, 'rgba(255,211,77,0.7)'); kg.addColorStop(1, 'rgba(255,211,77,0)');
      ctx.fillStyle = kg; ctx.beginPath(); ctx.arc(key.x, ky, 26, 0, 6.283); ctx.fill();
      label(ctx, '🔑', key.x, ky + 8, 22, '#fff', 'center', false);
    }
    for (const c of coins) if (!c.got) {
      const sq = Math.abs(Math.cos(t * 5 + c.x * 0.02));
      ctx.fillStyle = '#a66d00'; ctx.beginPath(); ctx.ellipse(c.x, c.y, 7 * sq + 3, 9.5, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.ellipse(c.x, c.y, 6 * sq + 2, 8, 0, 0, 6.283); ctx.fill();
    }
    // walls (with a fake 3D top) and doors
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = c * T, y = r * T, ch = grid[r][c];
      if (ch === '#') {
        ctx.fillStyle = '#141829'; ctx.fillRect(x, y, T, T);
        ctx.fillStyle = '#4b5578'; ctx.fillRect(x, y - 8, T, T - 2);
        ctx.fillStyle = '#5c6790'; ctx.fillRect(x, y - 8, T, 5);
        ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y - 7.5, T - 1, T - 3);
      } else if (ch === 'D' && !hasKey) {
        ctx.fillStyle = '#7a5636'; ctx.fillRect(x + 14, y, T - 28, T);
        ctx.fillStyle = '#b98248'; ctx.fillRect(x + 17, y + 3, T - 34, T - 6);
        label(ctx, '🔒', x + T / 2, y + T / 2 + 6, 15, '#fff', 'center', false);
      }
    }
    for (const c of cams) {
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.ang);
      ctx.fillStyle = '#11151f'; rr(ctx, -10, -7, 22, 14, 4); ctx.fill();
      ctx.fillStyle = c.see > 0.05 ? '#ff5d5d' : '#5dff9a'; ctx.beginPath(); ctx.arc(10, 0, 3.5, 0, 6.283); ctx.fill();
      ctx.restore();
    }
    for (const g of guards) {
      topFigure(ctx, g.x, g.y, g.ang, g.walk, '#4da3ff', true);
      if (g.see > 0.05) { label(ctx, g.see > 0.6 ? '❗' : '❓', g.x, g.y - 22, 20, '#ffd34d', 'center', false); }
    }
    topFigure(ctx, me.x, me.y, me.ang, me.walk, '#ff5d5d', false);
    fx.draw(ctx);
    ctx.restore();

    // vignette + alarm tint
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (alarm > 0.05) { ctx.fillStyle = `rgba(255,40,40,${alarm * 0.22 * (0.7 + 0.3 * Math.sin(t * 16))})`; ctx.fillRect(0, 0, W, H); }

    const hx = SG.hudX();
    rr(ctx, hx, 10, 250, 34, 17); ctx.fillStyle = 'rgba(8,10,18,0.7)'; ctx.fill();
    label(ctx, `Daraja ${lvl + 1}/${LEVELS.length}`, hx + 14, 33, 14, '#ffffff', 'left', false);
    label(ctx, hasKey ? '🔑✓' : '🔑 —', hx + 128, 33, 14, hasKey ? '#5dff9a' : '#cfd6e6', 'left', false);
    label(ctx, `🪙 ${gotCoins}/${coins.length}`, hx + 188, 33, 14, '#ffd34d', 'left', false);
    if (alarm > 0.05) { rr(ctx, W / 2 - 90, 14, 180, 14, 7); ctx.fillStyle = 'rgba(8,10,18,0.7)'; ctx.fill(); rr(ctx, W / 2 - 88, 16, 176 * alarm, 10, 5); ctx.fillStyle = '#ff5d5d'; ctx.fill(); }
    if (hintT > 0 && state === 'play') label(ctx, hasKey ? 'Yashil chiqishga yeting!' : '🔑 Kalitni toping — sariq nurga tushmang', W / 2, H - 20, 16, '#ffffff');
    if (state === 'caught') label(ctx, 'USHLANDINGIZ!', W / 2, H * 0.45, 56, '#ff5d5d');
  }

  SG.run(update, draw);
  $('start-btn').addEventListener('click', start);
  $('retry-btn').addEventListener('click', start);

  if (/debug/.test(location.search)) {
    window.__g = {
      get s() { return { state, lvl, hasKey, x: me && me.x, y: me && me.y, alarm }; },
      tp: (c, r) => { me.x = c * T + T / 2; me.y = r * T + T / 2; },
      load,
      validate() {
        const out = [];
        LEVELS.forEach((L, n) => {
          const g = L.map, R = g.length, C = g[0].length, pos = {};
          if (g.some(s => s.length !== C)) out.push(`L${n + 1}: ragged rows ${g.map(s => s.length)}`);
          for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if ('PKE'.includes(g[r][c])) pos[g[r][c]] = [c, r];
          const flood = (from, open) => { const seen = new Set([from.join()]), q = [from]; while (q.length) { const [c, r] = q.pop(); for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = c + dc, nr = r + dr, ch = (g[nr] || '')[nc]; if (!ch || ch === '#' || (ch === 'D' && !open) || seen.has([nc, nr].join())) continue; seen.add([nc, nr].join()); q.push([nc, nr]); } } return seen; };
          if (!pos.P || !pos.K || !pos.E) { out.push(`L${n + 1}: missing P/K/E`); return; }
          if (!flood(pos.P, false).has(pos.K.join())) out.push(`L${n + 1}: key unreachable`);
          if (!flood(pos.P, true).has(pos.E.join())) out.push(`L${n + 1}: exit unreachable`);
          const all = flood(pos.P, true);
          for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (g[r][c] === '$' && !all.has([c, r].join())) out.push(`L${n + 1}: coin ${c},${r} unreachable`);
          L.guards.forEach((gd, k) => {
            const pts = gd.loop ? [...gd.path, gd.path[0]] : gd.path;
            for (let i = 1; i < pts.length; i++) {
              const [c0, r0] = pts[i - 1], [c1, r1] = pts[i];
              if (c0 !== c1 && r0 !== r1) out.push(`L${n + 1} g${k}: diagonal`);
              const steps = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0));
              for (let s = 0; s <= steps; s++) { const c = c0 + Math.sign(c1 - c0) * s, r = r0 + Math.sign(r1 - r0) * s; if ('#D'.includes(g[r][c])) out.push(`L${n + 1} g${k}: wall at ${c},${r}`); }
            }
          });
        });
        return out;
      },
    };
  }
})();
