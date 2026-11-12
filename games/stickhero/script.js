(() => {
  'use strict';
  const { rand, clamp, damp, choice, sfx, FX, Char, poses, Scenery, label, rr, $ } = SG;

  const H = 540, TOP = 356, GROW = 330, HERO_S = 0.72;
  const THEMES = ['meadow', 'sunset', 'snow', 'forest', 'night'];
  let W = 960;
  SG.initView($('game'), () => { W = SG.view.W; });

  const fx = new FX();
  let scenery = new Scenery('meadow', 5), themeIdx = 0, fade = 0;
  const hero = new Char({ color: '#ff5d5d' });
  let pillars = [], cur, next, stick, oldSticks = [], gem = null;
  let state = 'menu', heroX = 0, heroY = 0, heroVy = 0, heroRot = 0, flip = false, flipK = 0;
  let camX = 0, score = 0, gems = 0, streak = 0, walkTo = 0, ok = false, perfect = false, runPh = 0;
  $('best').textContent = SG.best('sh_best2');

  const anchor = () => W * 0.24;
  const walkSpeed = () => 300 + Math.min(120, score * 4);

  function makePillar(from) {
    const hard = Math.min(1, score / 30);
    const gap = rand(70, 150 + hard * 150);
    const w = rand(46 - hard * 14, 130 - hard * 50);
    return { x: from + gap, w, moving: score > 12 && Math.random() < 0.25 ? rand(0, 6) : -1, bx: from + gap };
  }

  function start() {
    SG.audioUnlock();
    themeIdx = 0; scenery = new Scenery(THEMES[0], 5);
    pillars = [{ x: 0, w: 130, moving: -1 }];
    cur = pillars[0]; score = 0; gems = 0; streak = 0;
    next = makePillar(cur.x + cur.w); pillars.push(next);
    spawnGem();
    heroX = cur.x + cur.w - 22; heroY = TOP; heroVy = 0; heroRot = 0; flip = false; flipK = 0;
    stick = { len: 0, ang: -Math.PI / 2 }; oldSticks = [];
    camX = cur.x + cur.w - anchor();
    state = 'idle';
    SG.show('start-screen', false); SG.show('results-screen', false);
  }

  function spawnGem() {
    const gap = next.x - (cur.x + cur.w);
    gem = gap > 84 && Math.random() < 0.7 ? { x: cur.x + cur.w + gap * rand(0.35, 0.65), got: false } : null;
  }

  function press() {
    if (state === 'idle') { state = 'grow'; stick.len = 0; }
    else if (state === 'walk' && heroX > cur.x + cur.w + 4 && heroX < (ok ? next.x : walkTo) - 4) { flip = !flip; sfx.whoosh(); }
  }
  function release() { if (state === 'grow') { state = 'drop'; stick.t = 0; } }

  function die(bonk) {
    state = 'dying'; heroVy = bonk ? -260 : 0; streak = 0;
    sfx.lose(); fx.shake(8); SG.buzz(80);
  }

  function update(dt) {
    fx.update(dt);
    fade = Math.max(0, fade - dt * 1.4);
    if (state === 'menu' || state === 'over') return;
    const t = SG.time.t;

    if (next.moving >= 0 && (state === 'idle' || state === 'grow')) {
      next.moving += dt;
      next.x = next.bx + Math.sin(next.moving * 1.6) * 34;
    }

    if (state === 'grow') {
      stick.len = Math.min(640, stick.len + GROW * dt);
      if (Math.random() < dt * 14) sfx.stretch();
    } else if (state === 'drop') {
      stick.t += dt;
      const k = clamp(stick.t / 0.22, 0, 1);
      stick.ang = -Math.PI / 2 + (Math.PI / 2) * k * k;
      if (k >= 1) {
        const reach = cur.x + cur.w + stick.len;
        ok = reach >= next.x && reach <= next.x + next.w;
        perfect = ok && Math.abs(reach - (next.x + next.w / 2)) < 7;
        walkTo = ok ? next.x + next.w - 22 : reach + 6;
        sfx.thud(); fx.dust(reach, TOP, 5);
        if (perfect) { sfx.perfect(); fx.text(next.x + next.w / 2, TOP - 60, 'MUKAMMAL!', '#ffd34d', 24); fx.ring(next.x + next.w / 2, TOP, '#ffd34d', 50); }
        state = 'walk';
      }
    } else if (state === 'walk') {
      heroX += walkSpeed() * dt; runPh += dt * 16;
      if (gem && !gem.got && flip && Math.abs(heroX - gem.x) < 18) {
        gem.got = true; gems++; sfx.coin();
        fx.burst(gem.x, TOP + 30, 10, { color: '#7df9ff', speedMin: 60, speedMax: 220 });
        fx.text(gem.x, TOP + 10, '+💎', '#7df9ff', 18);
      }
      if (ok && flip && heroX >= next.x - 8) { die(true); fx.burst(heroX, TOP + 20, 12, { color: '#ffd98a', spark: true }); sfx.hit(); }
      else if (heroX >= walkTo) {
        heroX = walkTo;
        if (ok) {
          streak = perfect ? streak + 1 : 0;
          const add = 1 + (perfect ? streak : 0);
          score += add;
          fx.text(heroX, TOP - 100, `+${add}`, '#ffffff', 22);
          if (!perfect) sfx.coin();
          oldSticks.push({ x: cur.x + cur.w, len: stick.len }); if (oldSticks.length > 4) oldSticks.shift();
          cur = next; next = makePillar(cur.x + cur.w); pillars.push(next);
          if (pillars.length > 8) pillars.shift();
          spawnGem();
          stick = { len: 0, ang: -Math.PI / 2 };
          const ti = Math.floor(score / 8) % THEMES.length;
          if (ti !== themeIdx) { themeIdx = ti; scenery = new Scenery(THEMES[ti], 5 + ti); fade = 1; sfx.power(); }
          state = 'idle';
        } else die(false);
      }
    } else if (state === 'dying') {
      heroVy += 1500 * dt; heroY += heroVy * dt; heroRot += dt * 7;
      if (!ok && stick.ang < Math.PI / 2) stick.ang = Math.min(Math.PI / 2, stick.ang + dt * 6);
      if (heroY > H + 120) {
        state = 'over';
        const best = SG.best('sh_best2', score);
        $('best').textContent = best;
        $('winner-text').textContent = score >= best && score > 0 ? '🏆 Yangi rekord!' : 'Yiqildingiz!';
        $('final-score').innerHTML = `Ball: <b>${score}</b> &nbsp; 💎 <b>${gems}</b> &nbsp; Rekord: <b>${best}</b>`;
        SG.show('results-screen', true);
      }
    }

    flipK = damp(flipK, flip ? 1 : 0, 22, dt);
    camX = damp(camX, cur.x + cur.w - anchor(), 5, dt);

    let pose;
    if (state === 'grow') pose = poses.push(t);
    else if (state === 'walk') pose = poses.run(runPh);
    else if (state === 'dying') pose = poses.fall();
    else pose = poses.stand(t);
    hero.to(pose, dt, 18);
  }

  function drawPillar(ctx, p) {
    const x = p.x - camX;
    if (x + p.w < -20 || x > W + 20) return;
    const th = scenery.theme;
    const g = ctx.createLinearGradient(x, 0, x + p.w, 0);
    g.addColorStop(0, '#2a3248'); g.addColorStop(0.5, '#1c2233'); g.addColorStop(1, '#121724');
    ctx.fillStyle = g;
    rr(ctx, x, TOP, p.w, H - TOP + 20, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let y = TOP + 26; y < H; y += 30) ctx.fillRect(x + 4, y, p.w - 8, 2);
    ctx.fillStyle = th.strip; rr(ctx, x - 3, TOP - 4, p.w + 6, 12, 5); ctx.fill();
    ctx.fillStyle = th.ground[0]; rr(ctx, x - 3, TOP + 3, p.w + 6, 5, 2); ctx.fill();
    if (p === next) { ctx.fillStyle = '#ff5d5d'; rr(ctx, x + p.w / 2 - 6, TOP - 4, 12, 6, 2); ctx.fill(); }
  }

  function drawStick(ctx, bx, len, ang) {
    ctx.save();
    ctx.translate(bx - camX, TOP); ctx.rotate(ang);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#11151f'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
    ctx.strokeStyle = '#8d99b8'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -1.5); ctx.lineTo(len, -1.5); ctx.stroke();
    ctx.restore();
  }

  function draw(ctx) {
    const t = SG.time.t;
    ctx.save();
    fx.applyShake(ctx);
    scenery.drawSky(ctx, W, H, camX, H + 40, t);
    // misty abyss
    const ag = ctx.createLinearGradient(0, TOP + 40, 0, H);
    ag.addColorStop(0, 'rgba(10,14,24,0)'); ag.addColorStop(1, 'rgba(10,14,24,0.55)');
    ctx.fillStyle = ag; ctx.fillRect(0, TOP + 40, W, H - TOP - 40);

    if (state !== 'menu') {
      pillars.forEach(p => drawPillar(ctx, p));
      oldSticks.forEach(s => drawStick(ctx, s.x, s.len, 0));
      if (stick.len > 0) drawStick(ctx, cur.x + cur.w, stick.len, stick.ang);
      if (gem && !gem.got) {
        const gx = gem.x - camX, gy = TOP + 30 + Math.sin(t * 4) * 3;
        ctx.save(); ctx.translate(gx, gy);
        const gg = ctx.createRadialGradient(0, 0, 1, 0, 0, 20);
        gg.addColorStop(0, 'rgba(125,249,255,0.6)'); gg.addColorStop(1, 'rgba(125,249,255,0)');
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7df9ff';
        ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(8, -2); ctx.lineTo(0, 10); ctx.lineTo(-8, -2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(4, -2); ctx.lineTo(0, 1); ctx.lineTo(-4, -2); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#1a6f8a'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(8, -2); ctx.lineTo(0, 10); ctx.lineTo(-8, -2); ctx.closePath(); ctx.stroke();
        ctx.restore();
      }
      // hero (flips under the bridge)
      ctx.save();
      const hx = heroX - camX;
      ctx.translate(hx, heroY);
      if (state === 'dying') ctx.rotate(heroRot);
      ctx.scale(1, 1 - 2 * flipK);
      if (flipK > 0.5) ctx.translate(0, -6);
      hero.draw(ctx, 0, 0, { scale: HERO_S, shadow: state !== 'dying' && flipK < 0.5, mood: state === 'dying' ? 'hurt' : 'normal', tails: false });
      ctx.restore();
      ctx.save(); ctx.translate(-camX, 0); fx.draw(ctx); ctx.restore();
    }
    ctx.restore();

    if (fade > 0) { ctx.fillStyle = `rgba(255,255,255,${fade * 0.6})`; ctx.fillRect(0, 0, W, H); }
    if (state !== 'menu') {
      label(ctx, String(score), W / 2, 70, 56, '#ffffff');
      if (streak > 1) label(ctx, `MUKAMMAL x${streak}`, W / 2, 98, 15, '#ffd34d');
      label(ctx, `💎 ${gems}`, W - 20, 40, 20, '#7df9ff', 'right');
      label(ctx, `Rekord: ${SG.best('sh_best2')}`, SG.hudX() + 4, 38, 14, '#cfd6e6', 'left');
      if (state === 'idle' && score === 0) label(ctx, 'Bosib turing — ko\'prik o\'sadi', W / 2, 150, 18, '#ffffff');
      if (state === 'walk' && gem && !gem.got && score < 4 && heroX < gem.x - 20) label(ctx, 'Bosing — teskari o\'tib 💎 oling!', W / 2, 150, 16, '#7df9ff');
    }
  }

  SG.run(update, draw);
  const canvas = $('game');
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); press(); });
  window.addEventListener('pointerup', release);
  window.addEventListener('keydown', e => { if (e.code === 'Space' && !e.repeat) press(); });
  window.addEventListener('keyup', e => { if (e.code === 'Space') release(); });
  $('start-btn').addEventListener('click', start);
  $('retry-btn').addEventListener('click', start);
  if (/debug/.test(location.search)) window.__g = { get s() { return { state, score, gems, need: next.x - (cur.x + cur.w), nw: next.w, len: stick.len }; } };
})();
