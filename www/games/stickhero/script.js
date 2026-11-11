(() => {
  'use strict';
  const { rand, clamp, sfx, drawSideStick, drawSky } = Stk;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const GROUND_Y = H - 130;
  const ANCHOR_X = 300;
  const GROW_SPEED = 300;
  const WALK_SPEED = 300;
  const FALL_TIME = 0.16;
  const STORAGE_KEY = 'stickhero_best';

  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const startScreen = document.getElementById('start-screen');
  const resultsScreen = document.getElementById('results-screen');
  const finalScoreEl = document.getElementById('final-score');
  const startBtn = document.getElementById('start-btn');
  const retryBtn = document.getElementById('retry-btn');

  let best = Number(localStorage.getItem(STORAGE_KEY) || 0);
  bestEl.textContent = best;

  let state = 'menu'; // menu | idle | charging | falling | walking | dead | over
  let platforms, cur, next, stickLen, fallT, heroX, camera, score, walkTarget, perfectFlash, deadVy;

  function randPlatform(fromX) {
    const gap = rand(70, 190);
    const w = rand(46, 120);
    return { x: fromX + gap, w };
  }

  function reset() {
    platforms = [{ x: 0, w: 160 }];
    cur = platforms[0];
    next = randPlatform(cur.x + cur.w);
    platforms.push(next);
    heroX = cur.x + cur.w - 14;
    camera = cur.x + cur.w - ANCHOR_X;
    stickLen = 0;
    score = 0;
    perfectFlash = 0;
    state = 'idle';
    scoreEl.textContent = score;
  }

  function startGame() {
    reset();
    startScreen.classList.add('hidden');
    resultsScreen.classList.add('hidden');
    scoreEl.classList.remove('hidden');
  }

  function gameOver() {
    state = 'over';
    best = Math.max(best, score);
    localStorage.setItem(STORAGE_KEY, best);
    bestEl.textContent = best;
    finalScoreEl.textContent = `Ball: ${score}`;
    scoreEl.classList.add('hidden');
    setTimeout(() => resultsScreen.classList.remove('hidden'), 500);
  }

  function beginCharge() { if (state === 'idle') { state = 'charging'; stickLen = 0; } }
  function releaseCharge() {
    if (state !== 'charging') return;
    state = 'falling';
    fallT = 0;
  }

  function update(dt) {
    if (state === 'charging') {
      stickLen = Math.min(620, stickLen + GROW_SPEED * dt);
    } else if (state === 'falling') {
      fallT += dt;
      if (fallT >= FALL_TIME) {
        const reach = cur.x + cur.w + stickLen;
        sfx(200, 0.08, 'square', 0.06);
        walkTarget = reach;
        state = 'walking';
      }
    } else if (state === 'walking') {
      const dir = walkTarget >= heroX ? 1 : -1;
      heroX += dir * WALK_SPEED * dt;
      if ((dir > 0 && heroX >= walkTarget) || (dir < 0 && heroX <= walkTarget)) {
        heroX = walkTarget;
        const onNext = heroX >= next.x - 2 && heroX <= next.x + next.w + 2;
        if (onNext) {
          score++;
          scoreEl.textContent = score;
          const center = next.x + next.w / 2;
          if (Math.abs(heroX - center) < 9) {
            perfectFlash = 0.8;
            sfx(880, 0.15, 'triangle', 0.08);
            score += 1;
            scoreEl.textContent = score;
          } else {
            sfx(600, 0.1, 'sine', 0.06);
          }
          cur = next;
          next = randPlatform(cur.x + cur.w);
          platforms.push(next);
          stickLen = 0;
          state = 'idle';
        } else {
          state = 'dead';
          deadVy = 0;
          sfx(120, 0.3, 'sawtooth', 0.1);
        }
      }
    } else if (state === 'dead') {
      deadVy += 1400 * dt;
      heroX += 0; // falls straight down visually via y offset tracked separately
      fallDropY = (fallDropY || 0) + deadVy * dt;
      if (fallDropY > 500) gameOver();
    }

    if (perfectFlash > 0) perfectFlash -= dt;

    const camTarget = cur.x + cur.w - ANCHOR_X;
    camera += (camTarget - camera) * Math.min(1, dt * 6);
  }

  let fallDropY = 0;

  function draw() {
    drawSky(ctx, W, H, '#5fb6e8', '#9fd8ef', '#d9f1ea');
    if (!platforms) return;

    // platforms as pillars
    for (const p of platforms) {
      const sx = p.x - camera;
      if (sx + p.w < -20 || sx > W + 20) continue;
      const grad = ctx.createLinearGradient(0, GROUND_Y, 0, H);
      grad.addColorStop(0, '#8a98ad');
      grad.addColorStop(1, '#4d5566');
      ctx.fillStyle = grad;
      ctx.fillRect(sx, GROUND_Y, p.w, H - GROUND_Y);
      ctx.fillStyle = p === next ? '#5fe3c4' : '#6fbf6a';
      ctx.fillRect(sx, GROUND_Y - 8, p.w, 8);
      if (p === next) {
        // center marker for perfect landing
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(sx + p.w / 2 - 2, GROUND_Y - 14, 4, 6);
      }
    }

    // stick
    const baseX = cur.x + cur.w - camera;
    const baseY = GROUND_Y;
    if (state === 'charging' || state === 'falling' || state === 'walking') {
      ctx.save();
      ctx.translate(baseX, baseY);
      let angle;
      if (state === 'charging') angle = -Math.PI / 2;
      else if (state === 'falling') angle = -Math.PI / 2 + (Math.PI / 2) * Math.min(1, fallT / FALL_TIME);
      else angle = 0;
      ctx.rotate(angle);
      ctx.strokeStyle = '#3a2a1a';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(stickLen, 0);
      ctx.stroke();
      ctx.restore();
    }

    // hero
    const hx = heroX - camera;
    const hy = state === 'dead' ? GROUND_Y + fallDropY : GROUND_Y;
    const walking = state === 'walking';
    drawSideStick(ctx, hx, hy, {
      color: '#ff5d5d', scale: 1, height: 88,
      legPhase: walking ? Math.sin(performance.now() / 80) : 0,
      legPhaseB: walking ? Math.sin(performance.now() / 80 + Math.PI) : 0,
      armPhase: state === 'charging' ? -1.4 : Math.sin(performance.now() / 160),
      armPhaseB: state === 'charging' ? -1.4 : -Math.sin(performance.now() / 160),
      dead: state === 'dead',
    });

    if (perfectFlash > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(perfectFlash / 0.8, 0, 1);
      ctx.font = 'bold 30px Trebuchet MS, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd34d';
      ctx.fillText('MUKAMMAL! +1', ANCHOR_X + 20, GROUND_Y - 60);
      ctx.restore();
    }
  }

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (state !== 'menu' && state !== 'over') update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  canvas.addEventListener('pointerdown', e => { e.preventDefault(); beginCharge(); });
  window.addEventListener('pointerup', () => releaseCharge());
  window.addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); beginCharge(); } });
  window.addEventListener('keyup', e => { if (e.code === 'Space') { e.preventDefault(); releaseCharge(); } });

  startBtn.addEventListener('click', startGame);
  retryBtn.addEventListener('click', () => { fallDropY = 0; startGame(); });

  if (window.location.search.includes('debug')) {
    window.__sh = () => ({ state, heroX, cur: { ...cur }, next: { ...next }, stickLen, walkTarget, fallDropY });
  }
})();
