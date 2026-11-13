(() => {
  'use strict';
  const { rand, clamp, damp, choice, sfx, FX, Char, poses, Scenery, label, rr, $ } = SG;

  const H = 540, FLOOR = 440, WIN = 3;
  let W = 960;
  SG.initView($('game'), () => { W = SG.view.W; });
  const fx = new FX();
  let scenery = new Scenery('sunset', 2);
  let mode = 'bot', diff = 1;
  SG.seg('mode-seg', v => { mode = v; $('diff-pick').classList.toggle('hidden', v !== 'bot'); });
  SG.seg('diff-seg', v => { diff = Number(v); });

  const BOT = [{ rt: 0.47, jit: 0.09, fool: 0.2 }, { rt: 0.34, jit: 0.06, fool: 0.07 }, { rt: 0.25, jit: 0.04, fool: 0.02 }];
  const FAKES = ['🌸', '🐦', '🍃', '🌙'];

  let state = 'menu', A, B, wins = [0, 0], round = 1, t0 = 0, waitT = 0, goT = 0, fakes = [], fake = null, botAt = 0;
  let phaseT = 0, result = null, zoom = 1, petals = [], beatT = 0, msShown = '';

  function mkFighter(i) {
    return { i, f: i === 0 ? 1 : -1, x: 0, home: 0, color: i === 0 ? '#ff5d5d' : '#4da3ff', name: i === 0 ? 'P1' : mode === 'bot' ? 'BOT' : 'P2', char: new Char({ color: i === 0 ? '#ff5d5d' : '#4da3ff', style: i === 1 && mode === 'bot' ? 'spiky' : 'band' }), st: 'idle', flash: 0, tapped: -1, runPh: 0 };
  }

  function startMatch() {
    SG.audioUnlock();
    scenery = new Scenery(choice(['sunset', 'forest', 'snow', 'night']), (Math.random() * 50) | 0);
    A = mkFighter(0); B = mkFighter(1);
    wins = [0, 0]; round = 1;
    petals = Array.from({ length: 26 }, () => ({ x: rand(0, 1400), y: rand(0, H), s: rand(20, 60), ph: rand(0, 6) }));
    SG.show('start-screen', false); SG.show('results-screen', false);
    newRound();
  }

  function newRound() {
    A.home = W * 0.3; B.home = W * 0.7;
    A.x = -60; B.x = W + 60;
    for (const f of [A, B]) { f.st = 'walk'; f.tapped = -1; f.flash = 0; }
    state = 'enter'; phaseT = 0; result = null; fake = null; msShown = '';
    waitT = rand(1.8, 4.6);
    fakes = [];
    const nf = round <= 1 ? 0 : Math.random() < 0.75 ? (Math.random() < 0.35 ? 2 : 1) : 0;
    for (let k = 0; k < nf; k++) fakes.push({ at: rand(0.6, waitT - 0.7), sym: choice(FAKES), dur: 0.45, done: false });
    const lv = BOT[diff];
    botAt = lv.rt + rand(-lv.jit, lv.jit) + (Math.random() < 0.15 ? rand(0.05, 0.14) : 0);
  }

  function tap(i) {
    if (state === 'wait') foul(i);
    else if (state === 'go') {
      const f = i === 0 ? A : B;
      if (f.tapped < 0) f.tapped = goT;
    }
  }

  function foul(i) {
    const f = i === 0 ? A : B, o = i === 0 ? B : A;
    f.st = 'foul'; o.st = 'win';
    result = { winner: 1 - i, txt: `${f.name} shoshildi!`, foul: true };
    state = 'strike'; phaseT = 0.5;
    sfx.error(); fx.shake(8); SG.buzz(80);
    fx.text(f.x, FLOOR - 150, 'ERTA!', '#ff5d5d', 30);
  }

  function resolve() {
    const a = A.tapped, b = B.tapped;
    if (a >= 0 && b >= 0 && Math.abs(a - b) < 0.012) {
      result = { winner: -1, txt: 'DURRANG!' };
      fx.burst(W / 2, FLOOR - 70, 30, { color: '#ffffff', spark: true, speedMin: 200, speedMax: 620 }); sfx.block(); fx.shake(12);
      state = 'strike'; phaseT = 0; A.st = B.st = 'clash';
      return;
    }
    const wi = b < 0 || (a >= 0 && a < b) ? 0 : 1;
    const w = wi === 0 ? A : B, l = wi === 0 ? B : A;
    msShown = `${Math.round((wi === 0 ? a : b) * 1000)} ms`;
    result = { winner: wi, txt: `${w.name} — ${msShown}` };
    w.st = 'dash'; l.st = 'stunned';
    state = 'strike'; phaseT = 0;
    sfx.whoosh();
  }

  function update(dt) {
    fx.update(dt);
    if (state === 'menu' || state === 'results') return;
    const t = SG.time.t;
    for (const q of petals) { q.y += q.s * dt; q.x -= (30 + q.s * 0.5) * dt; if (q.y > H) { q.y = -10; q.x = rand(0, W + 300); } }

    // input
    if (state === 'wait' || state === 'go') {
      if (SG.pressed('KeyF') || SG.pressed('Space')) tap(0);
      if (mode === 'human' && SG.pressed('KeyL')) tap(1);
    }

    if (state === 'enter') {
      phaseT += dt;
      for (const f of [A, B]) { f.x = damp(f.x, f.home, 4, dt); f.runPh += dt * 9; if (Math.abs(f.x - f.home) < 6) f.st = 'idle'; }
      if (phaseT > 1.5) { state = 'wait'; t0 = 0; zoom = 1; beatT = 0; }
    } else if (state === 'wait') {
      t0 += dt; beatT -= dt;
      zoom = damp(zoom, 1.09, 0.5, dt);
      if (beatT <= 0) { SG.tone(70, 0.12, 'sine', 0.12); beatT = Math.max(0.35, 0.9 - t0 * 0.1); }
      fake = null;
      for (const k of fakes) {
        if (t0 >= k.at && t0 < k.at + k.dur) {
          fake = k;
          if (!k.done) { k.done = true; sfx.tick(); if (mode === 'bot' && Math.random() < BOT[diff].fool) setTimeout(() => { if (state === 'wait') foul(1); }, 180 + Math.random() * 120); }
        }
      }
      if (t0 >= waitT) { state = 'go'; goT = 0; fake = null; sfx.perfect(); SG.buzz(30); fx.ring(W / 2, H * 0.3, '#ffd34d', 140, 0.4, 8); }
    } else if (state === 'go') {
      goT += dt;
      if (mode === 'bot' && B.tapped < 0 && goT >= botAt) B.tapped = goT;
      const first = Math.min(A.tapped < 0 ? 9 : A.tapped, B.tapped < 0 ? 9 : B.tapped);
      if (first < 9 && goT >= first + 0.02) resolve();
      else if (goT > 3) { result = { winner: -1, txt: 'Hech kim urmadi!' }; state = 'strike'; phaseT = 0; }
    } else if (state === 'strike') {
      phaseT += dt;
      zoom = damp(zoom, 1, 4, dt);
      if (result.winner >= 0) {
        const w = result.winner === 0 ? A : B, l = result.winner === 0 ? B : A;
        if (!result.foul && w.st === 'dash') {
          const target = l.home + w.f * 130;
          w.x += w.f * 2600 * dt;
          if ((w.f > 0 && w.x >= target) || (w.f < 0 && w.x <= target)) {
            w.x = target; w.st = 'after';
            l.flash = 0.15; l.st = 'cut';
            SG.time.freeze = 0.12; SG.time.scale = 0.35;
            fx.burst(l.x, FLOOR - 70, 26, { color: '#ffffff', spark: true, speedMin: 200, speedMax: 700 });
            fx.ring(l.x, FLOOR - 70, '#ffffff', 130, 0.35, 8);
            fx.shake(16); sfx.heavy(); SG.buzz(120);
            result.slash = { x1: w.home, x2: target, t: 0 };
          }
        }
        if (result.slash) result.slash.t += dt / (SG.time.scale || 1);
        if (phaseT > (result.foul ? 0.5 : 0.25) && l.st !== 'ko' && (result.foul || l.st === 'cut') && (result.foul ? phaseT > 0.6 : result.slash && result.slash.t > 0.5)) { l.st = 'ko'; sfx.thud(); fx.dust(l.x, FLOOR, 10); SG.time.scale = 1; }
        if (result.foul && phaseT > 0.5 && w.st === 'win') { /* winner just cheers */ }
      }
      for (const f of [A, B]) f.flash -= dt;
      const realT = phaseT;
      if ((result.winner >= 0 && realT > 1.6 && SG.time.scale === 1 && (result.winner === 0 ? B : A).st === 'ko') || (result.winner < 0 && realT > 1.4)) {
        if (result.winner >= 0) wins[result.winner]++;
        state = 'roundEnd'; phaseT = 0;
        if (result.winner >= 0) (result.winner === 0 ? A : B).st = 'win';
      }
    } else if (state === 'roundEnd') {
      phaseT += dt;
      if (phaseT > 1.4) {
        if (wins[0] >= WIN || wins[1] >= WIN) {
          state = 'results';
          const w = wins[0] >= WIN ? 0 : 1;
          $('winner-text').textContent = w === 0 ? "🏆 P1 g'olib!" : mode === 'bot' ? 'Bot yutdi...' : "🏆 P2 g'olib!";
          $('final-score').innerHTML = `Hisob: <b>${wins[0]} : ${wins[1]}</b>`;
          (w === 0 || mode !== 'bot') ? sfx.win() : sfx.lose();
          SG.show('results-screen', true);
        } else { if (result.winner >= 0) round++; newRound(); }
      }
    }

    for (const f of [A, B]) {
      const P = poses;
      let pose, rate = 16;
      if (f.st === 'walk') pose = P.walk(f.runPh);
      else if (f.st === 'dash') { pose = P.slash(0.2); rate = 40; }
      else if (f.st === 'after') { pose = P.slash(1); rate = 40; }
      else if (f.st === 'cut' || f.st === 'stunned') pose = f.st === 'cut' ? P.hurt() : P.guard(t);
      else if (f.st === 'ko') { pose = P.ko(); rate = 8; }
      else if (f.st === 'foul') { pose = P.faceplant(); pose.rot = 0.9; rate = 12; }
      else if (f.st === 'win') pose = P.cheer(t);
      else if (f.st === 'clash') pose = P.slash(0.6);
      else { pose = P.guard(t * 0.6 + f.i); pose.hy += 4; }
      f.char.to(pose, dt, rate);
    }
  }

  function draw(ctx) {
    const t = SG.time.t;
    ctx.save();
    fx.applyShake(ctx);
    ctx.translate(W / 2, FLOOR - 60); ctx.scale(zoom, zoom); ctx.translate(-W / 2, -(FLOOR - 60));
    scenery.draw(ctx, W, H, 80, FLOOR, t);
    // tall grass swaying
    ctx.strokeStyle = scenery.theme.detail; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    for (let i = 0; i < W / 14; i++) {
      const x = i * 14 + SG.hash(i) * 8, h = 12 + SG.hash(i * 3.3) * 22, sw = Math.sin(t * 2 + i * 0.4) * 5;
      ctx.beginPath(); ctx.moveTo(x, FLOOR + 2); ctx.quadraticCurveTo(x + sw * 0.4, FLOOR - h * 0.5, x + sw, FLOOR - h); ctx.stroke();
    }
    if (state !== 'menu' && A) {
      if (result && result.slash) {
        const s = result.slash, k = clamp(1 - s.t / 0.5, 0, 1);
        ctx.strokeStyle = `rgba(255,255,255,${k})`; ctx.lineWidth = 10 * k + 1; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(s.x1, FLOOR - 62); ctx.lineTo(s.x2, FLOOR - 78); ctx.stroke();
        ctx.strokeStyle = `rgba(125,220,255,${k * 0.5})`; ctx.lineWidth = 26 * k; ctx.stroke();
      }
      for (const f of [B, A]) {
        f.char.draw(ctx, f.x, FLOOR, { facing: f.f, weapon: f.st === 'ko' || f.st === 'foul' ? null : 'sword', groundY: FLOOR, flash: f.flash, mood: f.st === 'ko' ? 'ko' : f.st === 'cut' || f.st === 'foul' ? 'hurt' : f.st === 'win' ? 'happy' : 'normal' });
        label(ctx, f.name, f.x, FLOOR - 126, 13, f.color);
      }
      ctx.fillStyle = 'rgba(255,190,210,0.8)';
      for (const q of petals) { ctx.save(); ctx.translate(q.x % (W + 300), q.y); ctx.rotate(t * 2 + q.ph); ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    }
    fx.draw(ctx);
    ctx.restore();

    if (state === 'menu' || !A) return;
    const cx = W / 2;
    // score pips
    for (let s = 0; s < 2; s++) for (let i = 0; i < WIN; i++) {
      ctx.beginPath(); ctx.arc(cx + (s === 0 ? -34 - i * 24 : 34 + i * 24), 30, 8, 0, Math.PI * 2);
      ctx.fillStyle = i < wins[s] ? (s === 0 ? '#ff5d5d' : '#4da3ff') : 'rgba(255,255,255,0.22)'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(10,14,24,0.6)'; ctx.stroke();
    }
    label(ctx, `Raund ${round}`, cx, 62, 14, '#cfd6e6');
    if (state === 'enter') label(ctx, 'TAYYOR...', cx, H * 0.32, 48, '#ffffff');
    else if (state === 'wait') {
      if (fake) label(ctx, fake.sym, cx, H * 0.36, 90, '#ffffff', 'center', false);
      else label(ctx, '. . .', cx, H * 0.3, 44, 'rgba(255,255,255,0.8)');
    } else if (state === 'go') {
      const k = 1 + Math.sin(t * 30) * 0.05;
      rr(ctx, cx - 150 * k, H * 0.3 - 64 * k, 300 * k, 112 * k, 26); ctx.fillStyle = '#ffd34d'; ctx.fill();
      ctx.lineWidth = 6; ctx.strokeStyle = '#171d2b'; ctx.stroke();
      label(ctx, '⚔ UR!', cx, H * 0.3 + 18, 64, '#171d2b', 'center', false);
    } else if (result && (state === 'strike' || state === 'roundEnd')) {
      label(ctx, result.txt, cx, H * 0.26, 38, result.winner === 0 ? '#ff8a8a' : result.winner === 1 ? '#8ac4ff' : '#ffffff');
    }
    if (SG.isTouch && mode === 'human' && (state === 'wait' || state === 'go' || state === 'enter')) {
      ctx.globalAlpha = 0.5;
      label(ctx, 'P1 — shu yerni bosing', W * 0.25, H - 26, 15, '#ff8a8a'); label(ctx, 'P2 — shu yerni bosing', W * 0.75, H - 26, 15, '#8ac4ff');
      ctx.globalAlpha = 1;
    }
  }

  SG.run(update, draw);
  $('game').addEventListener('pointerdown', e => {
    if (state !== 'wait' && state !== 'go') return;
    const p = SG.toLocal(e);
    if (mode === 'human') tap(p.x < W / 2 ? 0 : 1); else tap(0);
  });
  $('start-btn').addEventListener('click', startMatch);
  $('retry-btn').addEventListener('click', startMatch);
  if (/debug/.test(location.search)) window.__g = { get s() { return { state, wins, round, fake: !!fake }; } };
})();
